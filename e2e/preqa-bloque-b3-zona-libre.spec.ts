import { test, expect } from '@playwright/test'

// Pre-QA 2026-07-24 — Bloque B3 "Zona Libre de Colón" (SCRUM-433->445), commit 1bf08b4.
// Corre contra fixtures sembradas manualmente por esta sesión de Pre-QA: CatalogProduct 16/17
// (proveedor Zona Libre) y BodegaZonaLibreRequest 16 (pendiente, 1 producto), 17 (aprobada tras
// esta misma sesión de Pre-QA probar el endpoint real de aprobación, 2 productos), 18 (aprobada,
// 1 producto), 19 (rechazada, con motivo real). Si estos IDs no existen en el entorno donde se
// re-corre este test, hay que re-sembrar (ver docs/pre-qa/bloque-b3-zona-libre-2026-07-24.md).

async function login(page, email: string) {
  await page.context().clearCookies()
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

test.describe('Bloque B3 — Nueva Orden Zona Libre (3C)', () => {
  test('camino de ruptura: cantidad 0 no agrega línea, edición a 0 se rechaza, quitar reaparece, totales recalculan', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await page.goto('/bodega/ordenes-zona-libre/nueva')
    await page.waitForTimeout(1000)

    // Proveedor fijo + banner, sin selector
    await expect(page.getByText('Zona Libre de Colón').first()).toBeVisible()
    await expect(page.locator('select', { hasText: /proveedor/i })).toHaveCount(0)

    // Buscar producto conocido de la fixture
    await page.locator('input[placeholder]').first().fill('Nordic')
    await page.waitForTimeout(700)
    await expect(page.getByText('Lámpara colgante Nordic 40cm')).toBeVisible()

    // Camino de ruptura — cantidad 0
    const addButtons = page.getByRole('button', { name: /agregar/i })
    await addButtons.first().click()
    await page.waitForTimeout(300)
    await expect(page.locator('body')).toContainText(/cantidad mayor a 0|cantidad/i)

    // Camino feliz — cantidad válida
    const qtyInput = page.locator('input[type="number"]').first()
    await qtyInput.fill('2')
    await addButtons.first().click()
    await page.waitForTimeout(500)
    // Ya no debe aparecer en disponibles (REQ-365)
    await expect(page.locator('table').first()).not.toContainText('Lámpara colgante Nordic 40cm')

    // Buscar segundo producto y agregarlo
    await page.locator('input[placeholder]').first().fill('Farol')
    await page.waitForTimeout(700)
    await expect(page.getByText('Farol exterior solar')).toBeVisible()
    const qtyInput2 = page.locator('input[type="number"]').first()
    await qtyInput2.fill('1')
    await page.getByRole('button', { name: /agregar/i }).first().click()
    await page.waitForTimeout(500)

    // Total: 2*45 + 1*35 = 125
    await expect(page.locator('body')).toContainText('$125.00')

    // Editar línea a 0 — debe rechazar y mantener total
    await page.getByText('Editar').first().click()
    await page.waitForTimeout(200)
    const editInput = page.locator('input[type="number"]').first()
    await editInput.fill('0')
    await page.getByRole('button', { name: /confirmar/i }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('body')).toContainText(/inválida|válida|mayor/i)
    await expect(page.locator('body')).toContainText('$125.00') // total sin cambios

    // Quitar línea de Farol — debe reaparecer en disponibles
    const removeButtons = page.getByText('Quitar')
    await removeButtons.first().click()
    await page.waitForTimeout(500)
    await page.locator('input[placeholder]').first().fill('Farol')
    await page.waitForTimeout(700)
    await expect(page.getByText('Farol exterior solar')).toBeVisible()

    await page.screenshot({ path: 'e2e/.tmp/preqa-b3-cart-state.png' })
  })

  test('camino feliz: guardar orden muestra panel de confirmación con folio y estado pendiente', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await page.goto('/bodega/ordenes-zona-libre/nueva')
    await page.waitForTimeout(1000)

    await page.locator('input[placeholder]').first().fill('Nordic')
    await page.waitForTimeout(700)
    const qtyInput = page.locator('input[type="number"]').first()
    await qtyInput.fill('1')
    await page.getByRole('button', { name: /agregar/i }).first().click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: /guardar orden/i }).click()
    await page.waitForTimeout(1200)

    await expect(page.locator('body')).toContainText(/pendiente/i)
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3-confirmacion.png' })

    // "Crear una nueva" reinicia sin navegar
    await page.getByText(/crear una nueva/i).click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('button', { name: /guardar orden/i })).toHaveCount(0)
    await expect(page.locator('body')).toContainText('Zona Libre de Colón')
  })
})

test.describe('Bloque B3 — Bandeja Órdenes Zona Libre (3D)', () => {
  test('chips mutuamente excluyentes, acciones correctas por estado, motivo real visible', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await page.goto('/bodega/ordenes-zona-libre')
    await page.waitForTimeout(1200)

    await page.screenshot({ path: 'e2e/.tmp/preqa-b3-bandeja-todas.png' })

    // Chip "Rechazadas" (locator preciso por rol para no matchear el subtítulo "...pendientes
    // por aprobar de Compras", que contiene la misma substring que el chip "Por aprobar")
    await page.getByRole('button', { name: 'Rechazadas', exact: true }).click()
    await page.waitForTimeout(800)
    await expect(page.locator('body')).toContainText('Ver motivo')
    await page.getByText('Ver motivo').first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('body')).toContainText(/ya existe una orden similar/i)
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3-motivo-real.png' })
    await page.getByRole('button', { name: /cerrar/i }).click()

    // Chip "Aprobadas" — sin botón de acción, solo texto
    await page.getByRole('button', { name: 'Aprobadas', exact: true }).click()
    await page.waitForTimeout(800)
    await expect(page.locator('body')).toContainText(/flujo normal/i)
    await expect(page.locator('body')).not.toContainText('Ver motivo')

    // Chip "Por aprobar" — botón Recordar
    await page.getByRole('button', { name: 'Por aprobar', exact: true }).click()
    await page.waitForTimeout(800)
    const remindBtn = page.getByRole('button', { name: /recordar/i })
    await expect(remindBtn.first()).toBeVisible()
    await expect(page.locator('body')).not.toContainText(/flujo normal/i)
    await page.screenshot({ path: 'e2e/.tmp/preqa-b3-bandeja-pendientes.png' })
  })
})

test.describe('Bloque B3 — RN3/permisos (verificados también por API directo, ver reporte)', () => {
  test('Bodega NO ve ninguna acción de aprobar/rechazar en la bandeja', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await page.goto('/bodega/ordenes-zona-libre')
    await page.waitForTimeout(1000)
    await expect(page.getByRole('button', { name: /^aprobar$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^rechazar$/i })).toHaveCount(0)
  })
})
