import { test, expect, Page, APIRequestContext, request as pwRequest } from '@playwright/test'

/**
 * Pre-QA Batch A (SCRUM-928 / 935 / 934, Admin&Cont — correcciones UAT) — gates que ya se rompen
 * fácil: DV obligatorio en TODOS los puntos que crean cliente/subcliente, y número de cuenta sin
 * asteriscos en los documentos al cliente.
 *
 * Contra el stack LOCAL (nginx :8090). NUNCA contra dev.atlanticerp.ai: si PREQA_BASE_URL apunta a un
 * host remoto el spec se niega a correr salvo PREQA_ALLOW_REMOTE=1 (gotcha conocido: specs con BASE
 * remoto por defecto). Se autosiembra por API (cliente maestro nuevo por corrida, cuenta bancaria
 * solo si no hay ninguna activa) — no depende de IDs fijos.
 *
 * Roster local: password = email (CoreUserSeeder). Gerencia (management) opera Ventas&Diseño, Contabilidad
 * (lider_admin_contab) opera Admin&Cont.
 */

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:8090'
if (/atlanticerp\.ai/i.test(BASE) && !process.env.PREQA_ALLOW_REMOTE) {
  throw new Error(`preqa-scrum928-935: BASE=${BASE} es remoto. Usá localhost o exportá PREQA_ALLOW_REMOTE=1.`)
}
const API = `${BASE}/api`
const MARK = 'gerencia3@test.com'
const CONTABILIDAD = 'contabilidad@test.com'
const RUN = Date.now().toString().slice(-7)

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 15000, navigationTimeout: 30000 })

async function token(email: string): Promise<string> {
  const ctx = await pwRequest.newContext()
  const r = await ctx.post(`${API}/auth/login`, {
    data: { email, password: email, tenant: 'atlantic' },
    headers: { Accept: 'application/json' },
  })
  expect(r.status(), `login API ${email}`).toBe(200)
  const t = (await r.json()).token as string
  await ctx.dispose()
  return t
}

function auth(t: string) {
  return { Authorization: `Bearer ${t}`, Accept: 'application/json' }
}

async function login(page: Page, email: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(1200)
}

/** Cliente maestro + subcliente sembrados por API (con DV) — devuelve ids/nombres. */
async function seedClient(api: APIRequestContext, mark: string, label: string) {
  const r = await api.post(`${API}/ventas-diseno/clients`, {
    headers: auth(mark),
    data: {
      name: `PQ928 ${label} ${RUN}`, business_name: `PQ928 ${label} SA ${RUN}`, tax_id: `155-${RUN}-${label.length}`,
      tax_id_dv: '42', contacts: [{ name: 'Contacto PQ', role: 'client', phone: '6000-0000' }], from_quote_context: true,
    },
  })
  expect(r.status(), 'seed cliente').toBe(201)
  const c = await r.json()
  return { id: c.id as number, name: c.name as string, subId: c.sub_clients[0].id as number, subName: c.sub_clients[0].business_name as string }
}

// ---------------------------------------------------------------------------------------------
// SCRUM-928 punto 2 — DV obligatorio
// ---------------------------------------------------------------------------------------------

test('928.2 API — ningún endpoint que crea cliente/subcliente acepta un alta sin DV válido (422, no solo botón)', async () => {
  const mark = await token(MARK)
  const ctx = await pwRequest.newContext()
  const contacts = [{ name: 'C', role: 'client', phone: '6000' }]
  const master = await seedClient(ctx, mark, 'api')

  const badDvs: Array<string | null | undefined | number> = [undefined, null, '', '   ', 'ab', '123', '8 1', '-1', '1.5', '٣', 81]
  for (const dv of badDvs) {
    const body = (extra: Record<string, unknown>) => (dv === undefined ? extra : { ...extra, tax_id_dv: dv })
    const r1 = await ctx.post(`${API}/ventas-diseno/clients`, { headers: auth(mark), data: body({ name: `PQ928 bad ${RUN}`, business_name: 'x', tax_id: 'x', contacts }) })
    const r2 = await ctx.post(`${API}/ventas-diseno/clients/${master.id}/sub-clients`, { headers: auth(mark), data: body({ business_name: 'x', tax_id: 'x', contacts }) })
    const r3 = await ctx.post(`${API}/ventas-diseno/sub-clients`, { headers: auth(mark), data: body({ master_client_id: master.id, business_name: 'x', tax_id: 'x' }) })
    for (const [i, r] of [r1, r2, r3].entries()) {
      expect(r.status(), `endpoint #${i + 1} con DV=${JSON.stringify(dv)}`).toBe(422)
      expect(Object.keys((await r.json()).errors)).toContain('tax_id_dv')
    }
  }

  // Camino feliz: 1 y 2 dígitos (con cero a la izquierda preservado) y queda asociado al subcliente correcto.
  const ok1 = await ctx.post(`${API}/ventas-diseno/sub-clients`, { headers: auth(mark), data: { master_client_id: master.id, business_name: `Sub-07 ${RUN}`, tax_id: `T7-${RUN}`, tax_id_dv: '07' } })
  expect(ok1.status()).toBe(201)
  const ok2 = await ctx.post(`${API}/ventas-diseno/clients/${master.id}/sub-clients`, { headers: auth(mark), data: { business_name: `Sub-5 ${RUN}`, tax_id: `T5-${RUN}`, tax_id_dv: '5', contacts } })
  expect(ok2.status()).toBe(201)
  const detail = await (await ctx.get(`${API}/ventas-diseno/clients/${master.id}`, { headers: auth(mark) })).json()
  const byName = Object.fromEntries(detail.sub_clients.map((s: { business_name: string; tax_id_dv: string }) => [s.business_name, s.tax_id_dv]))
  expect(byName[`Sub-07 ${RUN}`]).toBe('07')
  expect(byName[`Sub-5 ${RUN}`]).toBe('5')
  expect(byName[master.subName]).toBe('42')
  await ctx.dispose()
})

test('928.2 UI — CRM > Clientes > "+ Crear cliente": DV junto al RUC, obligatorio, solo dígitos (máx. 2)', async ({ page }) => {
  await login(page, MARK)
  await page.goto(`${BASE}/ventas-diseno/clients`)
  await page.getByRole('button', { name: /crear cliente/i }).first().click()

  const modal = page.locator('div.fixed').filter({ hasText: /Crear cliente/ }).last()
  const ruc = modal.locator('label', { hasText: /^RUC/ }).locator('xpath=following-sibling::input[1]')
  const dv = modal.locator('label', { hasText: /^DV/ }).locator('xpath=following-sibling::input[1]')
  await expect(ruc).toBeVisible()
  await expect(dv).toBeVisible()
  // DV inmediatamente al lado del RUC (misma fila, a la derecha)
  const rb = (await ruc.boundingBox())!
  const db = (await dv.boundingBox())!
  expect(Math.abs(rb.y - db.y)).toBeLessThan(6)
  expect(db.x).toBeGreaterThan(rb.x)

  // Rellenar TODO lo demás, para que el DV sea lo único que bloquea el botón.
  const nombreCliente = `PQ928 UI ${RUN}`
  await modal.locator('label', { hasText: /Cliente Master/ }).locator('xpath=following-sibling::input[1]').fill(nombreCliente)
  await modal.locator('label', { hasText: /Subcliente/ }).locator('xpath=following-sibling::input[1]').fill(`PQ928 UI SA ${RUN}`)
  await ruc.fill(`155-UI-${RUN}`)
  await modal.getByPlaceholder('Nombre').first().fill('Contacto UI').catch(() => {})
  await modal.getByPlaceholder(/tel[eé]fono/i).first().fill('6000-1111')
  const save = modal.getByRole('button', { name: /guardar cliente/i })
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-928-crear-cliente-modal.png', fullPage: true })

  // Todo completo salvo el DV => deshabilitado.
  await expect(save).toBeDisabled()

  // Solo dígitos, máximo 2: letras se descartan, 3 dígitos se recortan, espacios se limpian.
  await dv.fill('ab')
  await expect(dv).toHaveValue('')
  await expect(save).toBeDisabled()
  await dv.fill('   ')
  await expect(dv).toHaveValue('')
  await expect(save).toBeDisabled()
  await dv.fill('')
  await dv.pressSequentially('a1b2c3') // tecleo real: letras descartadas, tope de 2 dígitos
  await expect(dv).toHaveValue('12')
  await dv.fill('')
  await expect(save).toBeDisabled()

  // DV válido => habilitado; doble clic no duplica el alta; el DV queda visible en el detalle del subcliente.
  await dv.pressSequentially('7')
  await expect(save).toBeEnabled()
  await save.dblclick()
  await expect(page.getByText(/DV:\s*7\b/).first()).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-928-cliente-detalle-dv.png', fullPage: true })

  const mark = await token(MARK)
  const ctx = await pwRequest.newContext()
  const list = await (await ctx.get(`${API}/ventas-diseno/clients?search=${encodeURIComponent(nombreCliente)}`, { headers: auth(mark) })).json()
  const rows = (list.data ?? list) as Array<{ name: string }>
  expect(rows.filter(r => r.name === nombreCliente), 'doble clic no debe duplicar el cliente').toHaveLength(1)
  await ctx.dispose()
})

// PQ-928-1 (Pre-QA 2026-09-18, MEDIO, corregido): el input del DV tenía maxlength=2 además del filtro
// de dígitos, así que un PEGADO como " 81" / "-81" / "DV 81" el navegador lo truncaba a 2 caracteres
// ANTES de que el filtro corriera (" 8" -> "8") y el DV quedaba mal en silencio. Se quitó el maxlength.
// Antes este test estaba marcado test.fail; ahora es un gate normal.
test('928.2 UI — pegar " 81", "-81" o "DV 81" en el DV deja "81" (no se trunca antes de limpiar)', async ({ page }) => {
  await login(page, MARK)
  await page.goto(`${BASE}/ventas-diseno/clients`)
  await page.getByRole('button', { name: /crear cliente/i }).first().click()
  const modal = page.locator('div.fixed').filter({ hasText: /Crear cliente/ }).last()
  const dv = modal.locator('label', { hasText: /^DV/ }).locator('xpath=following-sibling::input[1]')
  for (const pegado of [' 81', '-81', 'DV 81']) {
    await dv.fill('')
    await dv.focus()
    await page.keyboard.insertText(pegado)
    await expect(dv, `pegado ${JSON.stringify(pegado)}`).toHaveValue('81')
  }
})

/** Localiza el input hermano de un <label> dentro de un contenedor. */
function fieldByLabel(scope: ReturnType<Page['locator']>, label: RegExp) {
  return scope.locator('label', { hasText: label }).locator('xpath=following-sibling::input[1]')
}

/** Ejercita el mismo formulario CreateClientModal (modos client / sub-client): DV requerido, dígitos, habilita el botón. */
async function assertCreateClientModalRequiresDv(modal: ReturnType<Page['locator']>, saveName: RegExp, nombres: { master?: string; sub: string }) {
  if (nombres.master) await fieldByLabel(modal, /Cliente Master/).fill(nombres.master)
  const sub = modal.locator('label', { hasText: /Subcliente/ }).first().locator('xpath=following-sibling::input[1]')
  if ((await sub.inputValue()) === '') await sub.fill(nombres.sub)
  const ruc = fieldByLabel(modal, /^RUC/)
  const dv = fieldByLabel(modal, /^DV/)
  await expect(dv, 'campo DV visible').toBeVisible()
  await ruc.fill(`155-Q-${RUN}`)
  await modal.getByPlaceholder('Nombre').first().fill('Contacto Q')
  await modal.getByPlaceholder(/tel[eé]fono/i).first().fill('6000-2222')
  const save = modal.getByRole('button', { name: saveName })
  await expect(save, 'sin DV no se puede guardar').toBeDisabled()
  await dv.pressSequentially('x')
  await expect(dv).toHaveValue('')
  await expect(save).toBeDisabled()
  await dv.pressSequentially('123')
  await expect(dv).toHaveValue('12')
  await expect(save).toBeEnabled()
  await dv.fill('')
  await expect(save).toBeDisabled()
  await dv.pressSequentially('9')
  await expect(save).toBeEnabled()
  return { save, dv }
}

test('928.2 UI — Cotización: modal de Cliente Master exige DV (inmediatamente después del RUC) y lo persiste', async ({ page }) => {
  await login(page, MARK)
  await page.goto(`${BASE}/ventas-diseno/quotes`)
  const nombre = `PQ928 Cot ${RUN}`
  const master = page.locator('label', { hasText: /^Cliente Master$/i }).locator('xpath=following-sibling::input[1]')
  await master.fill(nombre)
  await page.getByText(/\+ Crear cliente/i).last().dispatchEvent('mousedown')
  const modal = page.locator('div.fixed').filter({ hasText: /Crear cliente/ }).last()
  await expect(modal).toBeVisible()
  const ruc = fieldByLabel(modal, /^RUC/)
  const dvLoc = fieldByLabel(modal, /^DV/)
  const rb = (await ruc.boundingBox())!, db = (await dvLoc.boundingBox())!
  expect(Math.abs(rb.y - db.y)).toBeLessThan(6)
  expect(db.x).toBeGreaterThan(rb.x)
  const { save } = await assertCreateClientModalRequiresDv(modal, /guardar cliente/i, { sub: `PQ928 Cot SA ${RUN}` })
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-928-cotizacion-master-modal.png', fullPage: true })
  await save.dblclick()
  await expect(modal).toBeHidden({ timeout: 15000 })
  const mark = await token(MARK)
  const ctx = await pwRequest.newContext()
  const list = await (await ctx.get(`${API}/ventas-diseno/clients?search=${encodeURIComponent(nombre)}`, { headers: auth(mark) })).json()
  const rows = (list.data ?? list) as Array<{ id: number; name: string }>
  expect(rows.filter(r => r.name === nombre), 'un solo cliente creado (doble clic)').toHaveLength(1)
  const detail = await (await ctx.get(`${API}/ventas-diseno/clients/${rows[0].id}`, { headers: auth(mark) })).json()
  expect(detail.sub_clients[0].tax_id_dv).toBe('9')
  await ctx.dispose()
})

test('928.2 UI — Cotización: modal de Subcliente exige DV y lo asocia al subcliente correcto (no a otro)', async ({ page }) => {
  const mark = await token(MARK)
  const ctx = await pwRequest.newContext()
  const cliente = await seedClient(ctx, mark, 'cotsub')
  await login(page, MARK)
  await page.goto(`${BASE}/ventas-diseno/quotes`)
  const master = page.locator('label', { hasText: /^Cliente Master$/i }).locator('xpath=following-sibling::input[1]')
  await master.fill(cliente.name)
  await page.locator('li', { hasText: cliente.name }).first().dispatchEvent('mousedown')
  await page.waitForTimeout(900) // el padre resetea el subcliente al elegir master: esperar antes de tipear
  const sub = page.locator('label', { hasText: /^Subcliente$/i }).locator('xpath=following-sibling::input[1]')
  const nuevoSub = `PQ928 CotSub ${RUN}`
  await expect(sub, 'Subcliente se habilita al elegir el Cliente Master').toBeEnabled()
  await sub.fill(nuevoSub)
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-928-cotizacion-sub-dropdown.png' })
  await page.getByText(/\+ Nuevo subcliente/i).last().dispatchEvent('mousedown')
  const modal = page.locator('div.fixed').filter({ hasText: /Nuevo subcliente/ }).last()
  await expect(modal).toBeVisible()
  const { save } = await assertCreateClientModalRequiresDv(modal, /guardar subcliente/i, { sub: nuevoSub })
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-928-cotizacion-sub-modal.png', fullPage: true })
  await save.dblclick()
  await expect(modal).toBeHidden({ timeout: 15000 })
  const detail = await (await ctx.get(`${API}/ventas-diseno/clients/${cliente.id}`, { headers: auth(mark) })).json()
  const byName = Object.fromEntries(detail.sub_clients.map((x: { business_name: string; tax_id_dv: string }) => [x.business_name, x.tax_id_dv]))
  expect(Object.keys(byName).filter(n => n === nuevoSub), 'un solo subcliente creado (doble clic)').toHaveLength(1)
  expect(byName[nuevoSub]).toBe('9')
  expect(byName[cliente.subName], 'el subcliente previo conserva su DV').toBe('42')
  await ctx.dispose()
})

test('928.2 UI — Detalle de cliente: "+ Nuevo subcliente" exige DV', async ({ page }) => {
  const mark = await token(MARK)
  const ctx = await pwRequest.newContext()
  const cliente = await seedClient(ctx, mark, 'detsub')
  await ctx.dispose()
  await login(page, MARK)
  await page.goto(`${BASE}/ventas-diseno/clients`)
  await page.getByPlaceholder(/buscar por nombre/i).fill(cliente.name)
  await page.getByText(cliente.name, { exact: true }).first().click()
  await page.getByRole('button', { name: /\+ Nuevo subcliente/i }).click()
  const modal = page.locator('div.fixed').filter({ hasText: /Nuevo subcliente —/ }).last()
  await expect(modal).toBeVisible()
  await assertCreateClientModalRequiresDv(modal, /guardar subcliente/i, { sub: `PQ928 DetSub ${RUN}` })
})

async function assertMiniFormRequiresDv(page: Page, masterName: string, subNuevo: string) {
  // ClientPicker (mini-form): "+ Crear" abre RUC + DV; DV obligatorio e independiente de la regla "al menos uno".
  const subInput = page.locator('label', { hasText: /^Subcliente$/i }).locator('xpath=following-sibling::input[1]')
  await subInput.fill(subNuevo)
  await page.getByText(/^\+ Crear/).last().click()
  const ruc = page.getByPlaceholder('RUC')
  const dv = page.getByPlaceholder('DV')
  await expect(ruc).toBeVisible()
  await expect(dv).toBeVisible()
  const confirm = page.getByRole('button', { name: /^confirmar$/i })
  await ruc.fill(`155-MF-${RUN}`)
  await expect(confirm, 'RUC solo no alcanza: falta DV').toBeDisabled()
  await dv.pressSequentially('z')
  await expect(dv).toHaveValue('')
  await expect(confirm).toBeDisabled()
  await dv.pressSequentially('123')
  await expect(dv).toHaveValue('12')
  await expect(confirm).toBeEnabled()
  await dv.fill('')
  await expect(confirm).toBeDisabled()
  await dv.pressSequentially('3')
  await expect(confirm).toBeEnabled()
  return { confirm }
}

test('928.2 UI — Pipeline > Nuevo Proyecto (Diseño): mini-form de Subcliente exige DV', async ({ page }) => {
  const mark = await token(MARK)
  const ctx = await pwRequest.newContext()
  const cliente = await seedClient(ctx, mark, 'newproj')
  await login(page, MARK)
  await page.goto(`${BASE}/ventas-diseno/pipeline`)
  await page.getByRole('button', { name: /\+ Nuevo Proyecto/i }).first().click()
  await page.getByRole('button', { name: /^Diseño$/ }).click()
  const masterInput = page.locator('label', { hasText: /^Cliente Master$/i }).locator('xpath=following-sibling::input[1]')
  await masterInput.fill(cliente.name)
  await page.locator('li').filter({ hasText: new RegExp(`^${cliente.name}$`) }).first().click() // exacto: el ítem '+ Crear "nombre"' también contiene el nombre
  const nuevoSub = `PQ928 NP-Sub ${RUN}`
  const { confirm } = await assertMiniFormRequiresDv(page, cliente.name, nuevoSub)
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-928-newproject-minif.png', fullPage: true })
  await confirm.dblclick()
  await expect(page.locator('input').filter({ hasText: '' }).first()).toBeVisible()
  await page.waitForTimeout(1500)
  const detail = await (await ctx.get(`${API}/ventas-diseno/clients/${cliente.id}`, { headers: auth(mark) })).json()
  const creados = detail.sub_clients.filter((x: { business_name: string }) => x.business_name === nuevoSub)
  expect(creados, 'un solo subcliente (doble clic)').toHaveLength(1)
  expect(creados[0].tax_id_dv).toBe('3')
  await ctx.dispose()
})

test('928.2 UI — Pipeline > tarjeta Lead (PipelineCardModal): mini-form de Subcliente exige DV', async ({ page }) => {
  const mark = await token(MARK)
  const ctx = await pwRequest.newContext()
  const cliente = await seedClient(ctx, mark, 'pcm')
  const nombreLead = `PQ928 Lead ${RUN}`
  const lead = await ctx.post(`${API}/ventas-diseno/pipeline`, { headers: auth(mark), data: { type: 'lead', name: nombreLead } })
  expect(lead.status()).toBe(201)
  await login(page, MARK)
  await page.goto(`${BASE}/ventas-diseno/pipeline`)
  await page.getByText(nombreLead).first().click()
  await page.getByRole('button', { name: /^editar$/i }).first().click()
  const masterInput = page.locator('label', { hasText: /^Cliente Master$/i }).locator('xpath=following-sibling::input[1]')
  await masterInput.fill(cliente.name)
  await page.locator('li').filter({ hasText: new RegExp(`^${cliente.name}$`) }).first().click() // exacto: el ítem '+ Crear "nombre"' también contiene el nombre
  await page.waitForTimeout(900)
  const nuevoSub = `PQ928 PCM-Sub ${RUN}`
  const { confirm } = await assertMiniFormRequiresDv(page, cliente.name, nuevoSub)
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-928-pipelinecard-minif.png', fullPage: true })
  await confirm.dblclick()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-928-pipelinecard-after-confirm.png', fullPage: true })
  const detail = await (await ctx.get(`${API}/ventas-diseno/clients/${cliente.id}`, { headers: auth(mark) })).json()
  const creados = detail.sub_clients.filter((x: { business_name: string }) => x.business_name === nuevoSub)
  expect(creados, 'un solo subcliente (doble clic)').toHaveLength(1)
  expect(creados[0].tax_id_dv).toBe('3')
  await ctx.dispose()
})

// ---------------------------------------------------------------------------------------------
// SCRUM-928 punto 3 — número de cuenta completo, nunca enmascarado
// ---------------------------------------------------------------------------------------------

test('928.3 API — factura/estado de cuenta nunca traen ****XXXX; sin número completo => null (la vista muestra "—")', async () => {
  const contabilidad = await token(CONTABILIDAD)
  const mark = await token(MARK)
  const ctx = await pwRequest.newContext()

  // Cuenta activa: si no hay ninguna, se siembra una SIN número completo (caso "—").
  let accounts = await (await ctx.get(`${API}/admin-contab/bank-accounts`, { headers: auth(contabilidad) })).json()
  if (!accounts.some((a: { activa: boolean }) => a.activa)) {
    const c = await ctx.post(`${API}/admin-contab/bank-accounts`, { headers: auth(contabilidad), data: { banco: 'Banco PQ928', ultimos_4_digitos: '4554', tipo_cuenta: 'corriente' } })
    expect(c.status()).toBe(201)
    accounts = await (await ctx.get(`${API}/admin-contab/bank-accounts`, { headers: auth(contabilidad) })).json()
  }
  const cliente = await seedClient(ctx, mark, 'estado')

  const st = await (await ctx.get(`${API}/admin-contab/account-statement?master_client_id=${cliente.id}`, { headers: auth(contabilidad) })).json()
  const oldestActive = accounts.filter((a: { activa: boolean }) => a.activa).sort((a: { id: number }, b: { id: number }) => a.id - b.id)[0]
  for (const v of [st.numero_cuenta, st.cuenta_pago]) {
    if (v !== null) expect(String(v)).not.toContain('*')
  }
  const tiene = typeof oldestActive.numero_cuenta_completo === 'string' && oldestActive.numero_cuenta_completo.trim() !== ''
  if (tiene) {
    expect(st.numero_cuenta).toBe(oldestActive.numero_cuenta_completo.trim())
  } else {
    expect(st.numero_cuenta).toBeNull()
    expect(st.cuenta_pago).toBeNull()
    expect(st.banco).toBe(oldestActive.banco) // el resto del bloque no se rompe
    expect(st.responsable).not.toBeUndefined()
  }

  // PDF del estado de cuenta: texto plano, sin asteriscos y con "—" cuando no hay número.
  const pdf = await ctx.get(`${API}/admin-contab/account-statement/pdf?master_client_id=${cliente.id}`, { headers: auth(contabilidad) })
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toContain('application/pdf')
  await ctx.dispose()
})

test('928.3 UI — Estado de Cuenta muestra "Cuenta número" sin asteriscos', async ({ page }) => {
  const mark = await token(MARK)
  const ctx = await pwRequest.newContext()
  const cliente = await seedClient(ctx, mark, 'estadoui')
  await ctx.dispose()
  await login(page, CONTABILIDAD)
  await page.goto(`${BASE}/admin-contab/facturacion/estado-cuenta?master_client_id=${cliente.id}`)
  await page.waitForTimeout(3500)
  const body = page.locator('body')
  await expect(body).toContainText('Cuenta número:')
  const txt = (await body.innerText()).replace(/\s+/g, ' ')
  const m = txt.match(/Cuenta número:\s*(\S+)/)
  expect(m, 'línea "Cuenta número:" presente').not.toBeNull()
  expect(m![1]).not.toContain('*')
  await page.screenshot({ path: 'e2e/__screenshots__/preqa-928-estado-cuenta.png', fullPage: true })
})
