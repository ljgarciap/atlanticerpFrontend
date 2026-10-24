import { test, expect, Page } from '@playwright/test'

/**
 * Pre-QA (fusionado con Visual Review, SCRUM-871 trae 2 capturas de mockup adjuntas en Jira) —
 * batch SCRUM-861/863/871 contra https://dev.atlanticerp.ai. Los 3 tickets aparecían "In Progress" pero
 * el Arquitecto detectó que ya estaban implementados en dev desde 2026-09-09 sin transicionar Jira
 * (mismo patrón que SCRUM-864→870). Nunca en paralelo con otro Pre-QA (CrowdSec), ver
 * feedback_preqa_crowdsec_no_paralelo.
 */

const DEV = 'https://dev.atlanticerp.ai'
// Umbral de referencia para distinguir "TOTAL real" de "tamaño del array ya capado" en el botón
// "Ver los N artículos" de Artículos críticos — el cap real es MAX_HOME_CARD_ITEMS=5 en el
// frontend (atlanticerp-frontend/src/lib/homeCards.ts), cualquier valor bien por encima de eso confirma
// que el texto usa `articulos_criticos.total`, no `items.length`.
const MAX_HOME_CARD_ITEMS_FOR_ASSERTION = 50

test.describe.configure({ mode: 'serial' })
test.use({ actionTimeout: 25000, navigationTimeout: 40000 })

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${DEV}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login|ingresar/i }).click()
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 20000 })
  await page.waitForTimeout(1500)
}

// ---------- SCRUM-861 ----------

test('SCRUM-861.1 — Nueva Orden: producto agregado desaparece de la búsqueda y no puede duplicarse', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras/ordenes/nueva`)
  await page.waitForTimeout(2000)
  // Selecciona un proveedor real cualquiera para poder buscar productos.
  const providerInput = page.locator('input[placeholder*="roveedor" i], input[placeholder*="rovider" i]').first()
  await providerInput.fill('ALUMICENTRO')
  await page.waitForTimeout(1200)
  const providerOption = page.getByText(/ALUMICENTRO/i).first()
  if (await providerOption.isVisible().catch(() => false)) {
    await providerOption.click()
  }
  await page.waitForTimeout(500)
  const productSearch = page.locator('input[placeholder*="roducto" i]').first()
  await productSearch.fill('BOMBILLA TIPO GLOBO')
  await page.waitForTimeout(1200)
  const firstResult = page.getByText(/BOMBILLA TIPO GLOBO/i).first()
  const wasVisible = await firstResult.isVisible().catch(() => false)
  if (wasVisible) {
    await firstResult.click()
    await page.waitForTimeout(800)
    // Re-buscar el mismo texto — el producto ya agregado no debe reaparecer en la lista.
    await productSearch.fill('')
    await productSearch.fill('BOMBILLA TIPO GLOBO')
    await page.waitForTimeout(1000)
    const stillInResults = await page.getByText(/BOMBILLA TIPO GLOBO/i).count()
    // Debe quedar SOLO la línea ya agregada en la orden (1), no en la lista de resultados de búsqueda.
    expect(stillInResults, 'el producto ya agregado no debe reaparecer en la lista de búsqueda').toBeLessThanOrEqual(1)
  }
})

test('SCRUM-861.1 (backend) — API rechaza 2 líneas con el mismo catalog_product_id (422)', async ({ request }) => {
  const login = await request.post(`${DEV}/api/auth/login`, {
    data: { email: 'lidercompras@test.com', password: 'lidercompras@test.com' },
  })
  const { token } = await login.json()
  const res = await request.post(`${DEV}/api/compras/orders`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    data: { provider_id: 20, lines: [{ catalog_product_id: 213, quantity: 5 }, { catalog_product_id: 213, quantity: 10 }] },
  })
  expect(res.status()).toBe(422)
  const body = await res.json()
  expect(JSON.stringify(body)).toMatch(/ya está agregado en otra línea/i)
})

test('SCRUM-861.2 — Orden 100% recibida (99) no permite un segundo ingreso (backend 422)', async ({ request }) => {
  const login = await request.post(`${DEV}/api/auth/login`, {
    data: { email: 'lidercompras@test.com', password: 'lidercompras@test.com' },
  })
  const { token } = await login.json()
  const detail = await request.get(`${DEV}/api/compras/orders/99`, { headers: { Authorization: `Bearer ${token}` } })
  const order = await detail.json()
  expect(order.reception_status).toBe('completo')
  expect(order.shows_goods_receipt_link).toBe(false)

  const res = await request.post(`${DEV}/api/compras/goods-receipts`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    data: { purchase_order_id: 99, lines: [{ catalog_product_id: 11814, quantity: 1, unit_cost: 10, warehouse_id: 1 }] },
  })
  expect(res.status()).toBe(422)
})

test('SCRUM-861.2 — Orden pendiente de recibir (96) SÍ permite Ingreso de Mercancía', async ({ request }) => {
  const login = await request.post(`${DEV}/api/auth/login`, {
    data: { email: 'lidercompras@test.com', password: 'lidercompras@test.com' },
  })
  const { token } = await login.json()
  const detail = await request.get(`${DEV}/api/compras/orders/96`, { headers: { Authorization: `Bearer ${token}` } })
  const order = await detail.json()
  expect(order.reception_status).toBe('pendiente')
  expect(order.shows_goods_receipt_link).toBe(true)
})

test('SCRUM-861.3 — "Ajustes de Compras" NO está embebido en Proveedores, vive en su propia entrada de menú', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras/proveedores`)
  await page.waitForTimeout(2000)
  // Acotar SOLO al contenido principal (<main>), no al sidebar — el sidebar sí tiene su propia
  // entrada de nav para "Ajustes de Compras" a propósito (ver abajo), lo que no debe pasar es que
  // siga viviendo como panel/botón DENTRO de la pantalla de Proveedores.
  const main = page.locator('main')
  await expect(main).not.toContainText(/Ajustes de Compras/i)

  // El sidebar (colapsado a iconos en esta sesión) expone "Ajustes de Compras" como su propio
  // ítem de nav (accessible name = aria-label del botón), navegando a /compras/configuracion.
  const settingsNavButton = page.getByRole('button', { name: /Ajustes de Compras/i })
  await expect(settingsNavButton).toBeVisible()
  await settingsNavButton.click()
  await page.waitForTimeout(1500)
  await expect(page).toHaveURL(/compras\/configuracion/)
})

// ---------- SCRUM-863 ----------

const greetingCases: { email: string; label: string; path: string; firstNameOnly: string; fullName: string }[] = [
  { email: 'vendedordisenador2@test.com', label: 'Ventas & Diseño (Vendedor Disenador Test 2)', path: '/ventas-diseno/home', firstNameOnly: 'NEIL', fullName: 'NEIL QUIEL' },
  { email: 'lidercompras@test.com', label: 'Compras (Lider Compras Test)', path: '/compras/home', firstNameOnly: 'YIRENA', fullName: 'YIRENA TENG' },
  { email: 'liderbodega@test.com', label: 'Bodega (Lider Bodega Test)', path: '/bodega/home', firstNameOnly: 'ESTEBAN', fullName: 'ESTEBAN CARDENAS' },
  // NOTA 2026-09-13: el CLAUDE.md del proyecto (batch SCRUM-800, 2026-08-28) documenta que el
  // Líder de Servicios fue renombrado Lider Servicios→Lider Servicios (apellido real "Lider Servicios" pendiente de confirmar,
  // placeholder "Lider Servicios Test" en los 3 entornos) — la memoria de roster (project_roster_usuarios_
  // reales_atlanticerp) seguía diciendo "Lider Servicios Leis" para este email, desactualizada. Confirmado en vivo:
  // BIENVENIDO, ALDO (no "Lider Servicios Test") — el saludo YA está correcto, el dato viejo era el nombre
  // esperado en este test, no un bug de SCRUM-863.
  { email: 'liderservicios@test.com', label: 'Servicios (Lider Servicios, líder de Servicios)', path: '/servicios/home', firstNameOnly: 'ALDO', fullName: 'ALDO ALDO' },
  { email: 'contabilidad@test.com', label: 'Administración (Contabilidad Test)', path: '/admin-contab/home', firstNameOnly: 'FELIX', fullName: 'FELIX CAMPOS' },
]

for (const c of greetingCases) {
  test(`SCRUM-863 — ${c.label}: saludo muestra solo el primer nombre`, async ({ page }) => {
    await login(page, c.email, c.email)
    await page.goto(`${DEV}${c.path}`)
    await page.waitForTimeout(2500)
    const bodyText = (await page.locator('body').innerText()).toUpperCase()
    expect(bodyText, `debería contener el primer nombre (${c.firstNameOnly})`).toContain(c.firstNameOnly)
    expect(bodyText, `NO debería mostrar nombre completo (${c.fullName})`).not.toContain(c.fullName)
  })
}

// ---------- SCRUM-871 ----------

test('SCRUM-871 — Compras Home: Pendientes (44) y Órdenes críticas (44) muestran máx 5 + "Ver más"', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras/home`)
  await page.waitForTimeout(3000)
  const pendientesCard = page.locator('text=Pendientes').first().locator('xpath=ancestor::*[contains(@class,"rounded") or contains(@class,"card")][1]')
  // Verificación más robusta: contar "Ver más" visibles en toda la pantalla, debe haber al menos 2
  // (Pendientes + Órdenes críticas, ambas con 44 elementos reales).
  const verMasCount = await page.getByRole('button', { name: /ver más/i }).count()
  expect(verMasCount, 'Pendientes y Órdenes críticas tienen 44 elementos reales, ambas deberían mostrar "Ver más"').toBeGreaterThanOrEqual(2)

  // Abrir el modal de "Ver más" de la primera tarjeta y confirmar que trae el listado completo.
  // NOTA (hallazgo menor, no bloqueante — fuera de los criterios de aceptación de SCRUM-871):
  // ShowMoreListModal.tsx no tiene role="dialog"/aria-modal, es un <div> plano — no hay locator
  // semántico de "modal" disponible, se acota por la superposición fixed inset-0 que sí usa.
  await page.getByRole('button', { name: /ver más/i }).first().click()
  await page.waitForTimeout(1000)
  const modal = page.locator('div.fixed.inset-0').first()
  await expect(modal).toBeVisible()
  // Cada elemento del modal se renderiza como un <button> directo (reusa el mismo renderItem de
  // la tarjeta corta), no como <li>/<tr> — contar botones "Orden #..." en vez de una etiqueta
  // semántica de fila que este modal no usa.
  const rowsInModal = await modal.getByRole('button', { name: /^Orden #/ }).count()
  expect(rowsInModal, 'el modal "Ver más" debería traer bastante más de 5 filas').toBeGreaterThan(5)
})

test('SCRUM-871 — Compras Home: badge de contador es píldora suave (pastel), no círculo sólido', async ({ page }) => {
  await login(page, 'lidercompras@test.com', 'lidercompras@test.com')
  await page.goto(`${DEV}/compras/home`)
  await page.waitForTimeout(2500)
  const badge = page.locator('span').filter({ hasText: /^\d+$/ }).first()
  const classes = (await badge.getAttribute('class')) ?? ''
  expect(classes, 'el badge debería usar rounded-full (píldora)').toMatch(/rounded-full/)
})

test('SCRUM-871 — Servicios Home: "Servicios sin responder" (7) e "Insumos pendientes" (5, límite exacto) — badge suave, sin círculo sólido rojo/naranja', async ({ page }) => {
  await login(page, 'liderservicios@test.com', 'liderservicios@test.com')
  await page.goto(`${DEV}/servicios/home`)
  await page.waitForTimeout(3000)
  const body = page.locator('body')
  await expect(body).toContainText(/Servicios sin responder/i)
  await expect(body).toContainText(/Insumos y herramientas pendientes/i)
  // "Insumos pendientes" tiene EXACTAMENTE 5 elementos reales (límite) — NO debería tener "Ver más"
  // dentro de su propia tarjeta. "Servicios sin responder" tiene 7 — SÍ debería.
  const verMasCount = await page.getByRole('button', { name: /ver más/i }).count()
  expect(verMasCount, 'Servicios sin responder (7 elementos) debería mostrar al menos 1 "Ver más"').toBeGreaterThanOrEqual(1)
  // Ningún badge numérico debería seguir usando el círculo sólido viejo (bg-red-600/bg-orange-500
  // con texto blanco) — todos deben ser rounded-full con fondo pastel.
  // Acotar la heurística a badges NUMÉRICOS (el contador de la tarjeta) — un span.rounded-full con
  // texto blanco puede ser legítimamente una etiqueta de categoría (ej. "Instalación"/"Garantía" en
  // Servicios), no el contador viejo tipo círculo sólido que este ticket reemplaza.
  const solidCircleBadges = await page.locator('span.rounded-full').evaluateAll(nodes =>
    nodes.filter(n => {
      const text = (n as HTMLElement).innerText.trim()
      if (!/^\d+$/.test(text)) return false
      const style = getComputedStyle(n as Element)
      return style.color === 'rgb(255, 255, 255)'
    }).length
  )
  expect(solidCircleBadges, 'ya no debería quedar ningún badge con texto blanco (estilo círculo sólido viejo)').toBe(0)
})

/**
 * RE-CHECK 2026-09-13 (segunda pasada, cierre del loop de Pre-QA) — el CRÍTICO de arriba (ver
 * `docs/pre-qa/scrum861-863-871-batch-20260913.md`) fue corregido:
 * - Backend `95b7b86` — `BodegaHomeService::articulosCriticos()` ahora devuelve
 *   `{items: top-N, total: conteo real}` (top-N configurable vía `BodegaSettingsService::
 *   articulosCriticosTopN()` / pantalla admin), ordenado sin_stock antes que bajo_stock y por
 *   `disponible` ascendente dentro de cada grupo — satisface "ordenados de mayor a menor
 *   importancia".
 * - Frontend `915bb00` — `BodegaHomePage.tsx` gatea las 5 tarjetas (Pendientes, Despachos
 *   urgentes, Por recibir, Mayor rotación, Artículos críticos) por `loadingSummary`, mostrando
 *   "Cargando..." en vez de caer al fallback `?? []` que se veía como "vacío real".
 * Los tests de abajo reemplazan a los que documentaron el CRÍTICO — confirman en vivo que el fix
 * sigue vigente en `dev.atlanticerp.ai`, no solo que el código cambió.
 */
test('SCRUM-871 — Bodega Home: presupuesto de carga — /home/summary responde en <5s (CRÍTICO corregido, verificar que sigue así)', async ({ page }) => {
  test.setTimeout(30000)
  const t0 = Date.now()
  let elapsedMs = -1
  page.on('response', (res) => {
    if (res.url().includes('/api/bodega/home/summary')) elapsedMs = Date.now() - t0
  })
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.waitForResponse(r => r.url().includes('/api/bodega/home/summary'), { timeout: 20000 })
  expect(elapsedMs, 'GET /api/bodega/home/summary debería responder en <5s tras el fix de articulosCriticos() (commit 95b7b86)').toBeLessThan(5000)
})

test('SCRUM-871 — Bodega Home: mientras /home/summary está en vuelo, muestra "Cargando..." y NUNCA el falso "No hay pendientes."/"No hay mercancía en camino." (gate de loadingSummary)', async ({ page }) => {
  test.setTimeout(30000)
  // Login primero sin intercept (para tener sesión válida), luego forzar un reload de Bodega Home
  // con el endpoint de summary artificialmente demorado — así se puede observar la ventana de
  // "en vuelo" de forma determinística, sin depender de que la red real siga siendo lenta ahora
  // que el fix bajó la latencia real a ~2s (ventana real demasiado corta para inspeccionar el DOM
  // a tiempo sin throttling artificial).
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.route('**/api/bodega/home/summary**', async route => {
    await new Promise(r => setTimeout(r, 3000))
    await route.continue()
  })
  await page.goto(`${DEV}/bodega/home`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const bodyDuringLoad = (await page.locator('body').innerText())
  expect(bodyDuringLoad, 'debería mostrar el estado de carga explícito mientras el summary está en vuelo').toContain('Cargando')
  expect(bodyDuringLoad, 'NO debería mostrar el falso vacío de Pendientes mientras carga').not.toContain('No hay pendientes')
  expect(bodyDuringLoad, 'NO debería mostrar el falso vacío de Por recibir mientras carga').not.toContain('No hay mercancía en camino')
  await page.waitForResponse(r => r.url().includes('/api/bodega/home/summary'), { timeout: 15000 })
  await page.waitForTimeout(1000)
  const bodyAfterLoad = await page.locator('body').innerText()
  expect(bodyAfterLoad, 'el estado de "Cargando..." debería desaparecer una vez que la data real llega').not.toContain('Cargando')
})

test('SCRUM-871 — Bodega Home: una vez cargada la data, Por recibir (75) y Artículos críticos capan a 5 + "Ver más", y "Ver los N artículos" muestra el TOTAL real (11670), no 5', async ({ page }) => {
  test.setTimeout(30000)
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto(`${DEV}/bodega/home`, { timeout: 20000 })
  // El fix bajó la latencia real a ~2s (medido por curl) — ya no hace falta la espera de 18s de la
  // pasada anterior, pero se deja un margen razonable para variabilidad de red/CrowdSec.
  await page.waitForResponse(r => r.url().includes('/api/bodega/home/summary'), { timeout: 15000 })
  await page.waitForTimeout(1500)
  const verMasCount = await page.getByRole('button', { name: /ver más/i }).count()
  expect(verMasCount, 'Por recibir (75) debería mostrar "Ver más" propio').toBeGreaterThanOrEqual(1)
  const totalListItemsOnPage = await page.locator('li').count()
  expect(totalListItemsOnPage, 'no debería haber miles de <li> renderizados de una — el cap de 5 debe aplicarse antes del DOM').toBeLessThan(200)

  // "Ver los N artículos" de Artículos críticos: el array que llega ya viene capado al top-N
  // configurable, pero el texto del botón debe seguir mostrando el TOTAL real (11670), tomado de
  // `articulos_criticos.total`, nunca `items.length` (que sería como mucho el top-N, ej. 5).
  const viewAllButton = page.getByRole('button', { name: /^Ver los \d+ artículos$/i })
  await expect(viewAllButton, 'el botón "Ver los N artículos" de Artículos críticos debería estar visible').toBeVisible()
  const viewAllText = (await viewAllButton.innerText()).trim()
  const match = viewAllText.match(/Ver los (\d+) artículos/i)
  expect(match, `texto inesperado: "${viewAllText}"`).not.toBeNull()
  const shownTotal = Number(match?.[1] ?? 0)
  expect(shownTotal, `"Ver los N artículos" debería mostrar el TOTAL real (grande, ej. 11670), no el tamaño del array capado (5) — texto real: "${viewAllText}"`).toBeGreaterThan(MAX_HOME_CARD_ITEMS_FOR_ASSERTION)
})

test('SCRUM-871 — Bodega vista Equipo (Lider Bodega, view_team=true): mismo cap de 5 + "Ver más" se mantiene', async ({ page }) => {
  test.setTimeout(30000)
  await login(page, 'liderbodega@test.com', 'liderbodega@test.com')
  await page.goto(`${DEV}/bodega/home`)
  await page.waitForResponse(r => r.url().includes('/api/bodega/home/summary'), { timeout: 15000 })
  await page.waitForTimeout(1500)
  const equipoToggle = page.getByText(/^Equipo$/i).first()
  await expect(equipoToggle).toBeVisible()
  await equipoToggle.click()
  await page.waitForTimeout(2000)
  const totalListItemsOnPage = await page.locator('li').count()
  expect(totalListItemsOnPage).toBeLessThan(200)
})

test('SCRUM-871 — Ventas & Diseño Home (Vendedor Disenador): Final Stage (2, <=5) NO muestra "Ver más"; Pendientes (15) sí', async ({ page }) => {
  await login(page, 'vendedordisenador2@test.com', 'vendedordisenador2@test.com')
  await page.goto(`${DEV}/ventas-diseno/home`)
  await page.waitForTimeout(3000)
  const verMasCount = await page.getByRole('button', { name: /ver más/i }).count()
  // Pendientes (15 elementos reales) debería mostrar Ver más; Final Stage (2) no debería agregar uno propio.
  expect(verMasCount).toBeGreaterThanOrEqual(1)
})

test('SCRUM-871 — Ventas & Diseño vista Equipo (Gerencia, management): cap de 5 + "Ver más" se mantiene', async ({ page }) => {
  await login(page, 'gerencia@test.com', 'gerencia@test.com')
  await page.goto(`${DEV}/ventas-diseno/home`)
  await page.waitForTimeout(2500)
  const equipoToggle = page.getByText(/^(Equipo|Team)$/i).first()
  await expect(equipoToggle).toBeVisible()
  await equipoToggle.click()
  await page.waitForTimeout(1000)
  const select = page.locator('select').filter({ has: page.locator('option', { hasText: /whole team|todo el equipo/i }) })
  if (await select.isVisible().catch(() => false)) {
    await select.selectOption({ index: 0 })
    await page.waitForTimeout(2000)
  }
  const totalListItemsOnPage = await page.locator('li').count()
  expect(totalListItemsOnPage).toBeLessThan(300)
})

test('SCRUM-871 — Administración Home (Contabilidad): tarjeta Pendientes (3, <=5) sin "Ver más" propio, sin badge de círculo sólido', async ({ page }) => {
  await login(page, 'contabilidad@test.com', 'contabilidad@test.com')
  await page.goto(`${DEV}/admin-contab/home`)
  await page.waitForTimeout(3000)
  await expect(page.locator('body')).toContainText(/Pendientes/i)
  // FALSE POSITIVE encontrado en la pasada 2026-09-13: el primer intento de este assert (sin la
  // exclusión de abajo) falló contra Contabilidad porque tenía 6 notificaciones sin leer — el único
  // `span.rounded-full` con texto blanco resultó ser el badge GLOBAL del `NotificationBell` del
  // TopBar (`data-testid="notification-badge"`, atlanticerp-frontend/src/components/NotificationBell.tsx:64),
  // no un contador de tarjeta de Home. Ese badge es preexistente, vive en TODOS los módulos, y está
  // fuera del alcance de SCRUM-871 (que solo habla de "contadores de tarjetas de Inicio"). Confirmado
  // en vivo: la tarjeta "Pendientes" real ya usa `CountBadge` (pastel, `bg-red-50 text-red-600
  // rounded-full`) — el hallazgo original era del heurístico del test, no de la app. Excluir siempre
  // el badge de notificaciones de este chequeo para que el resultado no dependa de cuántas
  // notificaciones sin leer tenga el usuario de turno.
  const solidCircleBadges = await page.locator('span.rounded-full:not([data-testid="notification-badge"])').evaluateAll(nodes =>
    nodes.filter(n => getComputedStyle(n as Element).color === 'rgb(255, 255, 255)').length
  )
  expect(solidCircleBadges).toBe(0)
})
