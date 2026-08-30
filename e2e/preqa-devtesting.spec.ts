import { test, expect } from '@playwright/test'

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

async function login(page) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[type="email"]', 'management@atlantic.test')
  await page.fill('input[type="password"]', 'Password123!')
  await page.click('button[type="submit"]')
  await page.waitForURL(/dashboard|inicio|home|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

test('SCRUM-178/179 — Inicio: dias redondeados y modal con Ver orden', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/compras`)
  await page.waitForTimeout(2500)
  const body = await page.textContent('body')
  expect(body).not.toMatch(/\d+\.\d{4,}\s*d[ií]as/)
  expect(body).toContain('días sin aprobar')
  // click en una fila de Órdenes críticas → modal con Ver orden → navega al detalle
  await page.click('text=/#\\d+ · \\d+ días/')
  await page.waitForTimeout(800)
  await expect(page.getByRole('button', { name: 'Ver orden' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver orden' }).click()
  await page.waitForURL(/\/compras\/ordenes\/\d+/, { timeout: 10000 })
})

test('SCRUM-237 — dos botones de edicion con etiquetas distintas y confirmacion in-app', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/inventario`)
  await page.waitForTimeout(2500)
  await page.locator('input[placeholder*="Buscar"]').pressSequentially('LAMP-COL-001', { delay: 60 })
  await page.getByRole('row', { name: /LAMP-COL-001/ }).click({ timeout: 15000 })
  await page.waitForTimeout(1000)
  await expect(page.getByRole('button', { name: 'Editar información' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar precios' })).toBeVisible()
  // editar precios: cambiar costo → margen en vivo → Guardar → resumen in-app → Confirmar
  await page.getByRole('button', { name: 'Editar precios' }).click()
  const costInput = page.locator('label:has-text("Costo") input').first()
  await costInput.fill('96')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.locator('text=/Vas a guardar: costo total/')).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await page.waitForTimeout(1500)
  // persiste tras recargar la página completa
  await page.reload()
  await page.waitForTimeout(2000)
  await page.locator('input[placeholder*="Buscar"]').pressSequentially('LAMP-COL-001', { delay: 60 })
  await page.getByRole('row', { name: /LAMP-COL-001/ }).click({ timeout: 15000 })
  await page.waitForTimeout(1000)
  const modal = await page.textContent('body')
  expect(modal).toContain('$96.00')
  // volver a 95 para dejar el dato como estaba
  await page.getByRole('button', { name: 'Editar precios' }).click()
  await page.locator('label:has-text("Costo") input').first().fill('95')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await page.waitForTimeout(1500)
})

test('SCRUM-245/246/248 — busqueda por catalogo con resultados y tabla de solicitudes con datos', async ({ page }) => {
  await login(page)
  await page.goto(`${BASE}/compras/sustitutos`)
  await page.waitForTimeout(2000)
  // tabla de solicitudes: filtro Rechazada muestra fila con Generar orden
  await page.click('text=Rechazada')
  await page.waitForTimeout(1500)
  const solicitudes = await page.textContent('body')
  expect(solicitudes).toContain('Bombillo decorativo E27 Ámbar')
  expect(solicitudes).toContain('Generar orden')
  // Buscar sustituto por catálogo
  await page.click('text=Buscar sustituto')
  await page.waitForTimeout(1000)
  await page.fill('input[placeholder*="Buscar"]', 'SUST-ORIG-001')
  await page.waitForTimeout(1500)
  await page.click('text=Seleccionar')
  await page.waitForTimeout(500)
  await page.click('text=Buscar en catálogo')
  const searchBox = page.locator('input').last()
  await searchBox.fill('bombillo')
  await page.waitForTimeout(2500)
  const resultados = await page.textContent('body')
  expect(resultados).toContain('Bombillo LED E27 Blanco cálido')
})
