import { test, expect, Page } from '@playwright/test'

/**
 * SCRUM-194 (REQ-131) — "+ Producto nuevo" dentro de Nueva Orden de Compras.
 * Smoke test permanente: este gate (validación de referencia duplicada) ya se rompió una vez
 * (QA rechazó 2026-07-17), volvió a fallar 2026-07-30 (colisión entre 2 líneas nuevas del mismo
 * payload) y volvió a reportarse 2026-08-04 (Daniela Amaya) — se promueve a e2e/ permanente por
 * regla de CLAUDE.md ("smoke tests que verifican un gate que ya se rompió una vez no se borran").
 *
 * Todos los escenarios corren en UN solo test con test.step() -- si se separan en test() distintos,
 * Playwright recicla el worker (y re-importa el modulo, regenerando STAMP) apenas un test previo
 * falla, rompiendo la referencia compartida entre el paso de "setup" (crea el producto colisionable)
 * y los pasos que dependen de esa referencia ya existiendo en catalogo. Un solo test evita el
 * problema por construccion.
 *
 * password default = email (BusinessRoleUserSeeder).
 */
const EMAIL = 'gerencia2@illuminations.com.pa'
const STAMP = Date.now()

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(EMAIL)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 })
}

async function selectProvider(page: Page, name: string) {
  await page.goto('/compras/ordenes/nueva')
  await page.getByText(name, { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible()
}

async function openNewProductModal(page: Page) {
  await page.getByRole('button', { name: '+ Producto nuevo' }).click()
  await expect(page.getByRole('heading', { name: 'Producto nuevo' })).toBeVisible()
}

async function fillNewProductForm(page: Page, opts: {
  reference: string
  factoryReference?: string
  description?: string
  price?: string
  cost?: string
}) {
  // Los inputs de texto del modal (reference/factory_reference/description/brand) NO tienen
  // atributo type="text" explicito en el JSX (NewProductModal.tsx) -- input[type="text"] como
  // selector CSS solo matchea el buscador de catalogo fuera del modal. Escopear al <form> del
  // modal y usar el rol accesible "textbox" (default de <input> sin type), que si los incluye.
  const form = page.locator('form')
  const textboxes = form.getByRole('textbox')
  // Referencia pública es el primer textbox, factory reference el segundo (grid-cols-2).
  await textboxes.nth(0).fill(opts.reference)
  if (opts.factoryReference !== undefined) {
    await textboxes.nth(1).fill(opts.factoryReference)
  }
  await textboxes.nth(2).fill(opts.description ?? `Producto Pre-QA ${STAMP}`)
  const numberInputs = form.locator('input[type="number"]')
  await numberInputs.nth(0).fill(opts.price ?? '100')
  await numberInputs.nth(1).fill(opts.cost ?? '50')
}

// "Agregar" tambien es el label de los botones de cada fila del buscador de catalogo (mismo
// string i18n) -- escopear al <form> del modal (unico <form> en la pantalla) para el submit real.
async function clickModalAgregar(page: Page) {
  await page.locator('form').getByRole('button', { name: 'Agregar' }).click()
}

test('SCRUM-194 — Producto nuevo: validacion de referencia duplicada (5 escenarios)', async ({ page }) => {
  const pubRef = `PREQA-PUB-${STAMP}`
  const facRef = `PREQA-FAB-${STAMP}`

  await test.step('0) Setup — crea producto persistido en catalogo (LightCorp) para usar como colision', async () => {
    await login(page)
    await selectProvider(page, 'LightCorp')
    await openNewProductModal(page)
    await fillNewProductForm(page, {
      reference: pubRef,
      factoryReference: facRef,
      description: `Producto base Pre-QA ${STAMP}`,
    })
    await clickModalAgregar(page)
    await expect(page.getByRole('heading', { name: 'Producto nuevo' })).not.toBeVisible()
    await expect(page.getByText(`Producto base Pre-QA ${STAMP}`)).toBeVisible()

    // Pendiente diferido 2026-08-04 (Visual Review SCRUM-194, hallazgo colateral fuera de
    // alcance ese día): la tabla "Líneas de la orden" debe separar Ref. fábrica/Referencia
    // pública en columnas propias (mockup 2H__Compras_NuevaOrden.html), no como subtexto
    // combinado bajo la descripción.
    const linesTable = page.locator('table').filter({ hasText: 'Ref. fábrica' })
    await expect(linesTable.getByRole('columnheader', { name: 'Ref. fábrica' })).toBeVisible()
    await expect(linesTable.getByRole('columnheader', { name: 'Referencia pública' })).toBeVisible()
    const productRow = linesTable.getByRole('row', { name: new RegExp(`Producto base Pre-QA ${STAMP}`) })
    await expect(productRow.getByRole('cell', { name: facRef, exact: true })).toBeVisible()
    await expect(productRow.getByRole('cell', { name: pubRef, exact: true })).toBeVisible()

    await page.getByRole('button', { name: /Crear orden/i }).click()
    await expect(page.getByRole('heading', { name: 'Orden creada' })).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: 'test-results/scrum194-00-setup-orden-creada.png' })
  })

  await test.step('1) Visual — campos del modal "+ Producto nuevo" contra el mockup 2H', async () => {
    await selectProvider(page, 'LightCorp')
    await openNewProductModal(page)
    await page.screenshot({ path: 'test-results/scrum194-01-modal-campos.png' })
    for (const label of [
      'Referencia pública', 'Referencia de fábrica', 'Descripción', 'Marca',
      'Categoría', 'Rotación esperada', 'Precio de lista', 'Costo', 'Punto de reorden',
      'Costo adicional estimado',
    ]) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible()
    }
    // Toggle $ monto / % del costo -- son <option> dentro de un <select> nativo, Playwright los
    // reporta "hidden" hasta que el dropdown se abre (comportamiento normal del navegador), asi
    // que se verifica el texto de las opciones en vez de visibilidad.
    const toggleOptionsText = await page.locator('form select').last().locator('option').allTextContents()
    expect(toggleOptionsText).toContain('$ monto')
    expect(toggleOptionsText).toContain('% del costo')
    await page.getByRole('button', { name: 'Cancelar' }).click()
  })

  await test.step('2) Escenario 1 — referencia publica ya existente bloquea INLINE (mismo proveedor)', async () => {
    await openNewProductModal(page)
    await fillNewProductForm(page, { reference: pubRef }) // ya existe (paso 0)
    await clickModalAgregar(page)
    await expect(page.getByText('Esta referencia pública ya está en uso')).toBeVisible()
    // El modal NO se cierra, no hay linea nueva agregada
    await expect(page.getByRole('heading', { name: 'Producto nuevo' })).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum194-02-duplicado-publica-inline.png' })
    await page.getByRole('button', { name: 'Cancelar' }).click()
  })

  await test.step('3a) Escenario 2 — referencia de fabrica repetida, MISMO proveedor bloquea', async () => {
    await openNewProductModal(page)
    await fillNewProductForm(page, {
      reference: `PREQA-PUB-2A-${STAMP}`,
      factoryReference: facRef, // ya existe para LightCorp (paso 0)
    })
    await clickModalAgregar(page)
    await expect(page.getByText('Esta referencia ya existe para este proveedor')).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum194-03a-duplicado-fabrica-mismo-proveedor.png' })
    await page.getByRole('button', { name: 'Cancelar' }).click()
  })

  await test.step('3b) Escenario 2 — referencia de fabrica repetida, proveedor DISTINTO SI se permite', async () => {
    await selectProvider(page, 'Iluminex SA')
    await openNewProductModal(page)
    await fillNewProductForm(page, {
      reference: `PREQA-PUB-2B-${STAMP}`,
      factoryReference: facRef, // pertenece a LightCorp, NO a Iluminex
    })
    await clickModalAgregar(page)
    await expect(page.getByRole('heading', { name: 'Producto nuevo' })).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByText(`Producto Pre-QA ${STAMP}`).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum194-03b-fabrica-otro-proveedor-permitido.png' })
  })

  await test.step('4) Escenario 3 (gap conocido) — 2 lineas NUEVAS con misma referencia publica en el mismo borrador: precheck no las atrapa, backend SI bloquea al Crear orden', async () => {
    await selectProvider(page, 'Zona Libre de Colón')
    const draftRef = `PREQA-DRAFT-${STAMP}`

    await openNewProductModal(page)
    await fillNewProductForm(page, { reference: draftRef, description: `Linea A ${STAMP}` })
    await clickModalAgregar(page)
    await expect(page.getByRole('heading', { name: 'Producto nuevo' })).not.toBeVisible()

    await openNewProductModal(page)
    await fillNewProductForm(page, { reference: draftRef, description: `Linea B ${STAMP}` })
    await clickModalAgregar(page)
    // Precheck consulta catalogo persistido: ninguna de las 2 lineas existe todavia ahi, asi que
    // NO bloquea (limitacion conocida, documentada en Senior Review 2026-08-04) -> se agrega.
    await expect(page.getByRole('heading', { name: 'Producto nuevo' })).not.toBeVisible()
    await expect(page.getByText(`Linea A ${STAMP}`)).toBeVisible()
    await expect(page.getByText(`Linea B ${STAMP}`)).toBeVisible()

    await page.getByRole('button', { name: /Crear orden/i }).click()
    // Backend SI bloquea (validateNewProductReferencesAreUniqueWithinPayload) con mensaje especifico
    await expect(page.getByText(/se repite en más de un producto nuevo/i)).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: 'test-results/scrum194-04-duplicado-mismo-borrador-backend.png' })
  })

  await test.step('5) Escenario 4 — falla de red en el precheck NO bloquea agregar la linea', async () => {
    await selectProvider(page, 'LightCorp')
    await page.route('**/api/compras/products**', route => route.abort('failed'))
    await openNewProductModal(page)
    await fillNewProductForm(page, { reference: `PREQA-NETFAIL-${STAMP}` })
    await clickModalAgregar(page)
    await expect(page.getByRole('heading', { name: 'Producto nuevo' })).not.toBeVisible({ timeout: 8000 })
    await expect(page.getByText(`Producto Pre-QA ${STAMP}`).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/scrum194-05-network-fail-no-bloquea.png' })
    await page.unroute('**/api/compras/products**')
  })

  await test.step('6) Escenario 5 — el error de duplicado se limpia al editar el campo', async () => {
    await selectProvider(page, 'LightCorp')
    await openNewProductModal(page)
    await fillNewProductForm(page, { reference: pubRef }) // duplicado conocido
    await clickModalAgregar(page)
    await expect(page.getByText('Esta referencia pública ya está en uso')).toBeVisible()

    await page.locator('form').getByRole('textbox').nth(0).fill(`PREQA-PUB-CLEAN-${STAMP}`)
    await expect(page.getByText('Esta referencia pública ya está en uso')).not.toBeVisible()
    await page.screenshot({ path: 'test-results/scrum194-06-error-se-limpia.png' })
  })
})
