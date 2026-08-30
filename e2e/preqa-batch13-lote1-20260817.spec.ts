import { test, expect, Page, Locator } from '@playwright/test'

// Pre-QA + Visual Reviewer fusionado — batch de 13 tickets en PM Review (2026-08-17).
// Lote 1: SCRUM-768 (fix confirmado name faltante) + SCRUM-240 (no reproducido en sesión previa).
// Contra dev server local (npm run dev, :5173) que proxea a docker local en :8090 — mismo commit
// que dev.atlanticerp.ai (backend 723ce1e, frontend f672b5b), confirmado con `git log` antes de arrancar.

test.describe.configure({ mode: 'serial' })

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
}

async function fillByLabel(scope: Page | Locator, exactLabel: string, value: string) {
  const label = scope.getByText(exactLabel, { exact: true }).first()
  const row = label.locator('xpath=..')
  const field = row.locator('input, select, textarea').first()
  const tag = await field.evaluate(el => el.tagName.toLowerCase())
  if (tag === 'select') await field.selectOption({ index: 1 })
  else await field.fill(value)
}

const uniq = () => Date.now().toString().slice(-8)

test.describe('SCRUM-768 — Nueva Orden: nuevo proveedor + nuevo producto', () => {
  test('happy path completo: crear proveedor, crear producto, guardar orden sin 422', async ({ page }) => {
    const id = uniq()
    let orderPostStatus: number | null = null
    let orderPostBody: string | null = null
    page.on('response', async res => {
      if (/\/compras\/orders$/.test(res.url()) && res.request().method() === 'POST') {
        orderPostStatus = res.status()
        try { orderPostBody = await res.text() } catch { /* noop */ }
      }
    })

    await login(page, 'gerencia2@atlantic.com.pa')
    await page.goto('/compras/ordenes/nueva')
    await expect(page.getByRole('heading', { name: 'Nueva Orden' })).toBeVisible()

    // Paso 1 — nuevo proveedor
    await page.getByRole('button', { name: '+ Nuevo proveedor' }).click()
    await expect(page.getByRole('heading', { name: 'Nuevo proveedor' })).toBeVisible()
    await fillByLabel(page, 'Nombre *', `Proveedor QA ${id}`)
    await fillByLabel(page, 'Categoría *', '')
    await fillByLabel(page, 'País *', `Panamá QA ${id}`)
    await fillByLabel(page, 'Teléfono', '65551234')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(1500)

    // proveedor debe quedar seleccionado automáticamente (RN2)
    await expect(page.getByText(`Proveedor QA ${id}`, { exact: true })).toBeVisible({ timeout: 5000 })

    // Paso 2 — nuevo producto
    await page.getByRole('button', { name: '+ Producto nuevo' }).click()
    await expect(page.getByRole('heading', { name: 'Producto nuevo' })).toBeVisible()

    const modal = page.locator('div.fixed').filter({ hasText: 'Producto nuevo' }).last()
    await fillByLabel(modal, 'Referencia pública *', `REF-QA-${id}`)
    await fillByLabel(modal, 'Nombre del producto *', `Producto QA ${id}`)
    await fillByLabel(modal, 'Descripción *', `Descripcion QA ${id}`)
    await fillByLabel(modal, 'Precio de lista *', '100')
    await fillByLabel(modal, 'Costo *', '50')
    await modal.getByRole('button', { name: 'Agregar' }).click()
    await page.waitForTimeout(600)

    // Línea debe aparecer en la tabla de líneas
    await expect(page.getByText(`Descripcion QA ${id}`)).toBeVisible({ timeout: 5000 })

    // Guardar orden
    await page.getByRole('button', { name: /Crear orden|Guardar orden/i }).click()
    await page.waitForTimeout(2000)

    console.log('[SCRUM-768] POST /compras/orders status:', orderPostStatus)
    if (orderPostStatus && orderPostStatus >= 400) console.log('[SCRUM-768] BODY:', orderPostBody)

    const errorLocator = page.getByText(/new_product\.name|El campo lines\.0\.new_product/i)
    await expect(errorLocator).toHaveCount(0)
    await expect(page.getByText(/orden.*creada|creada correctamente/i).first()).toBeVisible({ timeout: 5000 })
    expect(orderPostStatus).toBe(201)
  })

  test('negativo: falta name del producto nuevo -> bloquea inline, no permite submit', async ({ page }) => {
    const id = uniq()
    await login(page, 'gerencia2@atlantic.com.pa')
    await page.goto('/compras/ordenes/nueva')

    const search = page.getByPlaceholder(/Buscar proveedor/i)
    await search.fill('a')
    await page.waitForTimeout(800)
    const firstProvider = page.locator('ul li button').first()
    if (await firstProvider.count() === 0) test.skip(true, 'no hay proveedores existentes para probar')
    await firstProvider.click()

    await page.getByRole('button', { name: '+ Producto nuevo' }).click()
    const modal = page.locator('div.fixed').filter({ hasText: 'Producto nuevo' }).last()
    await fillByLabel(modal, 'Referencia pública *', `REF-QA-${id}`)
    // NO llenamos "Nombre del producto"
    await fillByLabel(modal, 'Descripción *', `Descripcion QA ${id}`)
    await fillByLabel(modal, 'Precio de lista *', '100')
    await fillByLabel(modal, 'Costo *', '50')
    await modal.getByRole('button', { name: 'Agregar' }).click()
    await page.waitForTimeout(500)

    // Debe seguir viendo el modal (no cerró) y mostrar error de validación
    await expect(page.getByRole('heading', { name: 'Producto nuevo' })).toBeVisible()
    await expect(modal.locator('p.text-red-500').first()).toBeVisible()
  })
})

test.describe('SCRUM-240 — Crear producto nuevo desde Inventario', () => {
  test('flujo estándar con ficha técnica como ARCHIVO real + familia nueva por combobox (caminos NO probados en la sesión previa)', async ({ page }) => {
    const id = uniq()
    let createPostStatus: number | null = null
    let createPostBody: string | null = null
    page.on('response', async res => {
      if (/\/compras\/inventory$/.test(res.url()) && res.request().method() === 'POST') {
        createPostStatus = res.status()
        try { createPostBody = await res.text() } catch { /* noop */ }
      }
    })

    await login(page, 'gerencia2@atlantic.com.pa')
    await page.goto('/inventario')
    await page.waitForTimeout(1000)

    await page.getByRole('button', { name: '+ Crear nuevo producto' }).click()
    await expect(page.getByLabel('Nombre del producto *')).toBeVisible({ timeout: 5000 })

    const submitBtn = page.getByRole('button', { name: /Crear producto|Guardar/i })

    // Baseline: sin ficha técnica, el botón está deshabilitado (RN de SCRUM-426)
    await expect(submitBtn).toBeDisabled()

    await page.getByLabel('Nombre del producto *').fill(`Producto QA ${id}`)
    await page.getByLabel('Proveedor *').fill('a')
    await page.waitForTimeout(800)
    const firstProvider = page.locator('ul li button').first()
    if (await firstProvider.count() === 0) test.skip(true, 'no hay proveedores existentes')
    await firstProvider.click()

    await page.getByLabel(/Referencia de fábrica \*|Referencia fabrica \*/i).fill(`FAB-QA-${id}`)
    await page.getByLabel('Referencia pública *').fill(`REF-QA-${id}`)
    await page.getByLabel('Marca *').fill('Marca QA')
    await page.getByLabel(/Código de barras \*|Barcode \*/i).fill(`BC-${id}`)

    // Familia — camino NO probado antes: escribir un nombre NUEVO y usar "+ Crear familia"
    const familyInput = page.getByLabel(/^Familia/)
    await familyInput.fill(`Familia QA ${id}`)
    await page.waitForTimeout(500)
    const createFamilyOption = page.getByText(new RegExp(`Crear familia.*${id}`, 'i'))
    await expect(createFamilyOption).toBeVisible({ timeout: 3000 })
    await createFamilyOption.click()
    await page.waitForTimeout(500)
    await expect(page.getByText(`Familia QA ${id}`, { exact: true })).toBeVisible()

    await page.getByLabel('Categoría *').selectOption({ index: 1 })
    await page.getByLabel(/Rotación esperada \*/i).selectOption({ index: 1 })
    await page.getByLabel(/Stock mínimo \*/i).fill('5')
    await page.getByLabel('Costo *').fill('40')
    await page.locator('#cp-additional-cost').fill('5')
    await page.getByLabel(/Precio de venta \*/i).fill('90')

    // Ficha técnica como ARCHIVO real (camino no probado en la sesión previa — antes solo link)
    await page.getByRole('button', { name: 'Cargar ficha técnica' }).click()
    const fileInput = page.locator('input[type="file"]')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const tmpFile = path.join('/tmp', `ficha-qa-${id}.pdf`)
    fs.writeFileSync(tmpFile, '%PDF-1.4 fake ficha tecnica QA')
    await fileInput.setInputFiles(tmpFile)
    await page.waitForTimeout(400)

    console.log('[SCRUM-240] canSubmit habilitado tras completar todo:', await submitBtn.isEnabled())
    await expect(submitBtn).toBeEnabled({ timeout: 3000 })
    await submitBtn.click()
    await page.waitForTimeout(2000)

    console.log('[SCRUM-240] POST /compras/inventory status:', createPostStatus)
    if (createPostStatus && createPostStatus >= 400) console.log('[SCRUM-240] BODY:', createPostBody)

    if (createPostStatus === 201) {
      console.log('[SCRUM-240] RESULTADO: 201 creado — flujo con archivo real + familia nueva NO reproduce el bug reportado.')
    } else {
      console.log('[SCRUM-240] RESULTADO: FALLÓ con status', createPostStatus, '— posible reproducción real del bug con archivo/familia nueva.')
    }
  })
})
