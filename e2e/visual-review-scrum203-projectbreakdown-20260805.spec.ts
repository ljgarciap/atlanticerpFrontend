import { test, expect, type Page } from '@playwright/test'

/**
 * Visual Review — SCRUM-203, hallazgo de Daniela (2026-08-04) sobre la columna "Proyecto
 * asignado" de Ver Órdenes: contra stack local (Docker backend + Vite dev server).
 *
 * Dos bugs reportados, ambos corregidos hoy:
 * 1. Orden sin ningún proyecto debía mostrar "Ninguno (stock)" — la clave i18n
 *    `orders.table.projectNone` tenía "Sin proyecto" (nunca sincronizada con la clave hermana
 *    `newOrder.lines.projectNone`, que sí tenía el texto correcto).
 * 2. El link "N proyectos" (2+ proyectos distintos en la orden) navegaba al mismo destino que
 *    el botón "Ver" genérico — abría el detalle completo de la orden en vez de un desglose
 *    específico por producto/proyecto. Ahora abre ProjectBreakdownModal.
 *
 * Regresión promovida a test permanente — este mismo gap (link de proyecto sin desglose
 * dedicado) ya se documentó una vez como comportamiento "intencional" en
 * OrdersPage.test.tsx, así que conviene un test en vivo que no se pueda confundir con un mock.
 *
 * Precondición del segundo test ("link N proyectos"): la BD local no traía ningún proyecto
 * aprobado (Ventas & Diseño vacío en este stack) — se sembraron 2 vía tinker (MasterClient →
 * SubClient → SalesProject → PipelineCard en stage 'proposal' → Quote con folio+confirmed_at,
 * ver sesión 2026-08-05). Si ese fixture se borra, el picker de proyectos aprobados queda
 * vacío y este test falla en "esperando el primer item de la lista", no por una regresión real
 * del fix — resembrar antes de asumir que se rompió algo.
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

async function addNewProduct(page: Page, opts: { reference: string; description: string }) {
  await page.getByRole('button', { name: '+ Producto nuevo' }).click()
  await expect(page.getByRole('heading', { name: 'Producto nuevo' })).toBeVisible()
  const form = page.locator('form')
  const textboxes = form.getByRole('textbox')
  await textboxes.nth(0).fill(opts.reference)
  await textboxes.nth(2).fill(opts.description)
  const numberInputs = form.locator('input[type="number"]')
  await numberInputs.nth(0).fill('100')
  await numberInputs.nth(1).fill('50')
  await form.getByRole('button', { name: 'Agregar' }).click()
  await expect(page.getByRole('heading', { name: 'Producto nuevo' })).not.toBeVisible()
  await expect(page.getByText(opts.description)).toBeVisible()
}

/** Asigna, dentro de la fila de `description` en la tabla de líneas, el primer proyecto
 * cuyo nombre visible sea distinto de `excludeLabel` (para garantizar 2 proyectos distintos). */
async function assignProject(page: Page, description: string, excludeLabel?: string): Promise<string> {
  const row = page.locator('tr', { hasText: description })
  // Acotado a la fila: un selector global "ul li button" también matchea el menú lateral.
  await row.getByText('Ninguno (stock)', { exact: true }).click()
  const list = row.locator('ul li button')
  await expect(list.first()).toBeVisible()
  const candidate = excludeLabel
    ? list.filter({ hasNotText: excludeLabel }).first()
    : list.first()
  await candidate.click()
  // El texto de la lista incluye "· FOLIO" (solo para desambiguar en el picker) pero
  // SalesProjectPicker.pick() solo persiste project_name — leer el botón de la fila ya
  // asignado, que es el valor real que va a viajar al backend y aparecer en el modal.
  const assignedLabel = (await row.locator('button.text-primary').textContent())?.trim() ?? ''
  return assignedLabel
}

test.describe('SCRUM-203 — columna "Proyecto asignado", fix 2026-08-05', () => {
  test('orden sin proyecto muestra "Ninguno (stock)" (no "Sin proyecto")', async ({ page }) => {
    await login(page)
    await selectProvider(page, 'Zona Libre de Colón')
    const ref = `PREQA-NONE-${STAMP}`
    await addNewProduct(page, { reference: ref, description: `Producto sin proyecto ${STAMP}` })
    // No se asigna proyecto a la línea — queda "Ninguno (stock)" por default.
    await page.getByRole('button', { name: /Crear orden/i }).click()
    const successHeading = page.getByRole('heading', { name: 'Orden creada' })
    await expect(successHeading).toBeVisible({ timeout: 10000 })
    const successText = await page.getByText(/La orden #\d+ quedó registrada/).textContent()
    const orderId = successText?.match(/#(\d+)/)?.[1]
    expect(orderId).toBeTruthy()

    await page.goto('/compras/ordenes')
    await page.waitForTimeout(1000)
    const row = page.locator('tr', { hasText: `#${orderId}` })
    await expect(row.getByText('Ninguno (stock)', { exact: true })).toBeVisible()
    await expect(row.getByText('Sin proyecto', { exact: true })).not.toBeVisible()
  })

  test('link "N proyectos" abre el modal de desglose, no navega al detalle general', async ({ page }) => {
    await login(page)
    await selectProvider(page, 'Zona Libre de Colón')

    const descA = `Producto A ${STAMP}`
    const descB = `Producto B ${STAMP}`
    await addNewProduct(page, { reference: `PREQA-A-${STAMP}`, description: descA })
    await addNewProduct(page, { reference: `PREQA-B-${STAMP}`, description: descB })

    const projectA = await assignProject(page, descA)
    const projectB = await assignProject(page, descB, projectA)
    expect(projectA).not.toBe('')
    expect(projectB).not.toBe('')
    expect(projectB).not.toBe(projectA)

    await page.getByRole('button', { name: /Crear orden/i }).click()
    await expect(page.getByRole('heading', { name: 'Orden creada' })).toBeVisible({ timeout: 10000 })
    const successText = await page.getByText(/La orden #\d+ quedó registrada/).textContent()
    const orderId = successText?.match(/#(\d+)/)?.[1]
    expect(orderId).toBeTruthy()

    await page.goto('/compras/ordenes')
    await page.waitForTimeout(1000)
    const row = page.locator('tr', { hasText: `#${orderId}` })
    await row.getByText(/\d+ proyectos/).click()

    // No navegó — sigue en la lista, no en /compras/ordenes/{id}.
    await expect(page).toHaveURL(/\/compras\/ordenes$/)
    // Acotado al modal: la tabla de fondo puede tener órdenes de corridas previas cuyo
    // sales_project_summary coincida en texto con el de esta corrida (mismo fixture A/B/C
    // reutilizado entre tests), lo que rompería un getByText a nivel de página completa.
    const modal = page.locator('div.fixed.inset-0.z-50')
    await expect(modal.getByText(descA)).toBeVisible()
    await expect(modal.getByText(descB)).toBeVisible()
    await expect(modal.getByText(projectA, { exact: true })).toBeVisible()
    await expect(modal.getByText(projectB, { exact: true })).toBeVisible()

    // Cierra el modal con la X y confirma que vuelve a la lista sin haber navegado nunca.
    await modal.locator('button:has(svg)').click()
    await expect(modal).not.toBeVisible()
    await expect(page).toHaveURL(/\/compras\/ordenes$/)
  })
})
