import { test, expect } from '@playwright/test'

// SCRUM-490→495 (REQ-420→425, epic SCRUM-329) — "Reportes de Bodega". Pre-QA 2026-07-27, tras
// Senior Review + Visual Review (ambos con hallazgos ya corregidos: i18n de pluralización en
// 491/494, indicador de período faltante en 490). Promovido a permanente — cubre 2 gates que
// vale la pena no perder: navegación de tarjeta completa (SCRUM-495) y el gate de permiso
// `bodega.read` en la ruta (no solo escondido en el sidebar).
//
// Corre contra dev.atlanticerp.ai (BASE_URL), no contra un stack local — mismos datos que usará
// marly.rangel al validar. `almacen@illuminations.com.pa` (Esteban Cardenas, lider_bodega) es el
// usuario real con bodega.read; `designer@illuminations.test` es el usuario demo SIN bodega.read
// usado también por `BodegaReportsControllerTest::test_reportes_requieren_bodega_read` (403 a
// nivel API) — acá se verifica el mismo gate a nivel de ruta de React Router.

async function login(page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

test('Reportes — Jefe de Bodega ve las 4 tarjetas con datos reales, sin errores de consola', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@illuminations.com.pa', 'almacen@illuminations.com.pa')
  await page.goto('/bodega/reportes')
  await page.waitForTimeout(1500)

  await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()
  await expect(page.getByText('Productividad por operativo')).toBeVisible()
  await expect(page.getByText('Precisión de inventario')).toBeVisible()
  await expect(page.getByText('Capacidad por bodega')).toBeVisible()
  await expect(page.getByText('Inventario: rotación y atención')).toBeVisible()
  expect(errors).toEqual([])
})

test('SCRUM-490 — label de período sincronizado con el botón activo, sin desfase visible', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa', 'almacen@illuminations.com.pa')
  await page.goto('/bodega/reportes')
  await page.waitForTimeout(1000)

  // Mes por defecto — label debe incluir el mes actual en español.
  const monthLabel = page.locator('p.text-xs').first()
  await expect(monthLabel).toContainText(/de 20\d{2}/)

  await page.getByRole('button', { name: 'Trimestre' }).click()
  await expect(monthLabel).toContainText(/Q[1-4] 20\d{2}/)

  await page.getByRole('button', { name: /^Año/ }).click()
  await expect(monthLabel).toHaveText(/^20\d{2}$/)

  await page.getByRole('button', { name: 'Mes', exact: true }).click()
  await expect(monthLabel).toContainText(/de 20\d{2}/)
})

test('SCRUM-490 — cambios de período en ráfaga no dejan las tarjetas en loading colgado', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@illuminations.com.pa', 'almacen@illuminations.com.pa')
  await page.goto('/bodega/reportes')
  await page.waitForTimeout(1000)

  // Ráfaga de clics: Trimestre → Año → Mes → Trimestre → Mes, sin esperar entre ellos.
  await page.getByRole('button', { name: 'Trimestre' }).click()
  await page.getByRole('button', { name: /^Año/ }).click()
  await page.getByRole('button', { name: 'Mes', exact: true }).click()
  await page.getByRole('button', { name: 'Trimestre' }).click()
  await page.getByRole('button', { name: 'Mes', exact: true }).click()

  // Tras la ráfaga, las 4 tarjetas deben resolver a contenido real (no "Cargando..." colgado).
  await expect(page.getByText('Cargando...')).toHaveCount(0, { timeout: 5000 })
  await expect(page.getByText('Productividad por operativo')).toBeVisible()
  expect(errors).toEqual([])
})

test('SCRUM-495 — clic en el subtítulo (no en el ícono) navega igual, toda la superficie es clickeable', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa', 'almacen@illuminations.com.pa')
  await page.goto('/bodega/reportes')
  await page.waitForTimeout(1000)

  // Click en el subtítulo de "Capacidad por bodega" (texto secundario, no el título ni la flecha).
  await page.getByText('Productos y unidades almacenadas').click()
  await page.waitForURL('**/bodega/bodegas', { timeout: 5000 })
  expect(page.url()).toContain('/bodega/bodegas')
})

test('SCRUM-495 — doble clic no dispara doble navegación / no rompe el historial', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa', 'almacen@illuminations.com.pa')
  await page.goto('/bodega/reportes')
  await page.waitForTimeout(1000)

  await page.getByText('Precisión de inventario').dblclick()
  await page.waitForURL('**/bodega/solicitud-ajuste', { timeout: 5000 })
  expect(page.url()).toContain('/bodega/solicitud-ajuste')

  // Un solo salto atrás debe volver a Reportes (si hubiera doble push, harían falta 2 "back").
  await page.goBack()
  await page.waitForTimeout(500)
  expect(page.url()).toContain('/bodega/reportes')
})

test('SCRUM-495 — navegación por teclado (Enter/Space) sobre la tarjeta enfocada', async ({ page }) => {
  await login(page, 'almacen@illuminations.com.pa', 'almacen@illuminations.com.pa')
  await page.goto('/bodega/reportes')
  await page.waitForTimeout(1000)

  // Enfoca la tarjeta de Inventario: rotación y atención y presiona Enter.
  const inventoryCardTitle = page.getByText('Inventario: rotación y atención')
  await inventoryCardTitle.click({ trial: true }) // asegura visibilidad sin clickear todavía
  await page.keyboard.press('Tab') // no confiable cross-browser, usar focus directo abajo

  const card = page.locator('[role="button"]', { hasText: 'Inventario: rotación y atención' })
  await card.focus()
  await card.press('Enter')
  await page.waitForURL('**/bodega/inventario', { timeout: 5000 })
  expect(page.url()).toContain('/bodega/inventario')

  await page.goBack()
  await page.waitForTimeout(500)

  const productivityCard = page.locator('[role="button"]', { hasText: 'Productividad por operativo' })
  await productivityCard.focus()
  await productivityCard.press(' ')
  await page.waitForURL('**/bodega/pedidos', { timeout: 5000 })
  expect(page.url()).toContain('/bodega/pedidos')
})

test('SCRUM-490 — recargar a mitad de un cambio de período no rompe la pantalla (vuelve al default)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  await login(page, 'almacen@illuminations.com.pa', 'almacen@illuminations.com.pa')
  await page.goto('/bodega/reportes')
  await page.waitForTimeout(1000)

  await page.getByRole('button', { name: /^Año/ }).click()
  await page.waitForTimeout(300)
  await page.reload()
  await page.waitForTimeout(1500)

  // No hay persistencia de período entre navegaciones (no está en la URL ni en localStorage) —
  // el comportamiento razonable esperado es volver al default ("Mes"), no quedar en un estado roto.
  await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible()
  const monthLabel = page.locator('p.text-xs').first()
  await expect(monthLabel).toContainText(/de 20\d{2}/)
  expect(errors).toEqual([])
})

test('Gate de permiso — usuario sin bodega.read no accede a /bodega/reportes por URL directa', async ({ page }) => {
  await login(page, 'designer@illuminations.test', 'Password123!')
  await page.goto('/bodega/reportes')
  await page.waitForTimeout(1500)

  // RequirePermission redirige a /dashboard cuando el usuario no tiene bodega.read.
  expect(page.url()).not.toContain('/bodega/reportes')
  expect(page.url()).toContain('/dashboard')
})
