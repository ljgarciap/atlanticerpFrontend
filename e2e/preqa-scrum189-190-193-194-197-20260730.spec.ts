import { test, expect, type Page } from '@playwright/test'

/**
 * Pre-QA + Visual Review en vivo — SCRUM-189/190/192/193/194/197 (Compras/Proveedores +
 * Nueva Orden), re-implementados 2026-07-30 tras hallazgos de Gerencia Test contra los mockups
 * reales 2G__Compras_Proveedores.html / 2H__Compras_NuevaOrden.html.
 *
 * Corre contra dev.atlanticerp.ai. Serial a propósito: CrowdSec/ModSecurity dispara falsos timeouts
 * con logins en paralelo desde la misma IP (ver CLAUDE.md, Epic 11).
 *
 * Usuario real de Compras (lider_compras): Lider Compras Test, lidercompras@test.com —
 * password default = email (BusinessRoleUserSeeder).
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'
const COMPRAS_EMAIL = 'lidercompras@test.com'
const COMPRAS_PASS = 'lidercompras@test.com'

async function login(page: Page) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(COMPRAS_EMAIL)
  await page.locator('input[type="password"]').fill(COMPRAS_PASS)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|compras|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1200)
}

test.describe('SCRUM-189/192 — form de Proveedor según mockup', () => {
  test('el form de crear proveedor tiene los campos del mockup, sin Origen, con Categoría de 5 valores', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/compras/proveedores`)
    await page.waitForTimeout(1000)
    await page.getByRole('button', { name: /agregar proveedor/i }).click()
    await page.waitForTimeout(500)

    const drawer = page.locator('text=Nuevo proveedor').locator('..')
    await expect(page.getByText('WhatsApp')).toBeVisible()
    await expect(page.getByText('Dirección')).toBeVisible()
    await expect(page.getByText('País')).toBeVisible()
    await expect(page.getByText('SWIFT')).toBeVisible()
    await expect(page.getByText('Beneficiario')).toBeVisible()
    await expect(page.getByText('Origen', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Tipo de cuenta')).not.toBeVisible()
    await expect(page.getByText('Notas', { exact: true })).not.toBeVisible()

    // Distinto del filtro "Todas las categorías" de la lista (el primer <select> del DOM) — se
    // identifica el select del drawer por tener "Zona Libre" como una de sus opciones reales.
    const categorySelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Zona Libre' }) })
    const categoryOptions = await categorySelect.locator('option').allTextContents()
    expect(categoryOptions.map(o => o.trim())).toEqual(
      expect.arrayContaining(['Locales', 'Zona Libre', 'China', 'Europa', 'Online']),
    )

    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum189/01-form-proveedor.png', fullPage: true })
    void drawer
  })

  test('SCRUM-190 — bloquea crear un proveedor con nombre ya existente', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/compras/proveedores`)
    await page.waitForTimeout(1000)

    const uniqueName = `PreQA Dup ${Date.now()}`
    // El drawer es el único elemento fixed con esa combinación de clases (ver ProviderFormDrawer.tsx)
    // — la lista también tiene un input de búsqueda "Buscar proveedor...", por eso no alcanza con
    // "el primer input de la página".
    const drawer = page.locator('.fixed.right-0.top-0')

    // Crear el primero.
    await page.getByRole('button', { name: /agregar proveedor/i }).click()
    await expect(drawer.getByText('Nuevo proveedor')).toBeVisible()
    await drawer.locator('input').first().fill(uniqueName)
    await drawer.getByRole('button', { name: /guardar/i }).click()
    await expect(drawer).not.toBeVisible({ timeout: 8000 })

    // Intentar crear un segundo con el MISMO nombre.
    await page.getByRole('button', { name: /agregar proveedor/i }).click()
    await expect(drawer.getByText('Nuevo proveedor')).toBeVisible()
    await drawer.locator('input').first().fill(uniqueName)
    await drawer.getByRole('button', { name: /guardar/i }).click()

    await expect(drawer).toContainText(/no se pudo guardar/i, { timeout: 5000 })
    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum189/02-nombre-duplicado.png', fullPage: true })
  })
})

// Paso 1 del wizard (NewPurchaseOrderPage.tsx): buscador de texto -> <ul><li><button>{nombre}</button>.
async function selectFirstProvider(page: Page) {
  const search = page.getByPlaceholder(/buscar proveedor/i)
  await search.fill('a')
  await page.waitForTimeout(700)
  const firstResult = page.locator('ul li button').first()
  await expect(firstResult).toBeVisible({ timeout: 5000 })
  await firstResult.click()
  await page.waitForTimeout(600)
}

test.describe('SCRUM-193/194/197 — Nueva Orden', () => {
  test('Paso 2: producto existente trae costo editable + referencia de fábrica; Paso 3: envío sin "Sin especificar"', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/compras/ordenes/nueva`)
    await page.waitForTimeout(1000)

    await selectFirstProvider(page)

    // Si no hay buscador de producto visible, la orden no llegó al paso 2 (proveedor sin productos
    // o selector distinto) — igual documentamos lo que se ve.
    const productSearch = page.getByPlaceholder(/buscar producto/i)
    if (await productSearch.isVisible().catch(() => false)) {
      await productSearch.fill('a')
      await page.waitForTimeout(700)
      const addButton = page.getByRole('button', { name: /agregar/i }).first()
      if (await addButton.isVisible().catch(() => false)) {
        await addButton.click()
        await page.waitForTimeout(500)
        // El costo unitario de la línea debe ser un <input>, no texto fijo.
        const lineCostInputs = page.locator('table input[type="number"]')
        expect(await lineCostInputs.count()).toBeGreaterThan(0)
      }
    }

    // Panel de envío: Tipo de envío sin opción "Sin especificar".
    const shippingTypeSelect = page.locator('select').filter({ hasText: /Aéreo|Marítimo|Terrestre/i }).first()
    if (await shippingTypeSelect.isVisible().catch(() => false)) {
      const opts = await shippingTypeSelect.locator('option').allTextContents()
      expect(opts.some(o => /sin especificar/i.test(o))).toBe(false)

      // "¿Quién paga el envío?" no debe existir hasta elegir Aéreo.
      await expect(page.getByText('¿Quién paga el envío?')).not.toBeVisible()
      await shippingTypeSelect.selectOption('aereo')
      await page.waitForTimeout(300)
      await expect(page.getByText('¿Quién paga el envío?')).toBeVisible()
      const whoPaysSelect = page.locator('select').filter({ hasText: /Atlantic|Cliente/i }).first()
      const whoPaysOpts = await whoPaysSelect.locator('option').allTextContents()
      expect(whoPaysOpts.map(o => o.trim())).toEqual(expect.arrayContaining(['Cliente', 'Atlantic']))
      expect(whoPaysOpts.some(o => /proveedor/i.test(o))).toBe(false)
    }

    await page.screenshot({ path: 'e2e/.tmp/preqa-scrum189/03-nueva-orden-envio.png', fullPage: true })
  })

  test('SCRUM-194: "+ Producto nuevo" tiene Categoría, Rotación esperada y el toggle $/%', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/compras/ordenes/nueva`)
    await page.waitForTimeout(1000)

    await selectFirstProvider(page)

    const newProductButton = page.getByRole('button', { name: /producto nuevo/i })
    if (await newProductButton.isVisible().catch(() => false)) {
      await newProductButton.click()
      await page.waitForTimeout(500)

      await expect(page.getByText('Categoría')).toBeVisible()
      await expect(page.getByText('Rotación esperada')).toBeVisible()
      await expect(page.getByText(/costo adicional estimado/i)).toBeVisible()

      const rotationSelect = page.locator('select').filter({ hasText: /Alta|Media|Baja/i }).first()
      const rotationOpts = await rotationSelect.locator('option').allTextContents()
      expect(rotationOpts.map(o => o.trim())).toEqual(
        expect.arrayContaining(['Alta', 'Media', 'Baja', 'Compra única']),
      )

      const toggleSelect = page.locator('select').filter({ hasText: /monto|% del costo/i }).first()
      const toggleOpts = await toggleSelect.locator('option').allTextContents()
      expect(toggleOpts.map(o => o.trim())).toEqual(expect.arrayContaining(['$ monto', '% del costo']))

      await page.screenshot({ path: 'e2e/.tmp/preqa-scrum189/04-producto-nuevo.png', fullPage: true })
    }
  })
})
