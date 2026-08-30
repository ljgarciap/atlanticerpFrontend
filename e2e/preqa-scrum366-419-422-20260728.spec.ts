import { test, expect } from '@playwright/test'

/**
 * SCRUM-366 (REQ-296), SCRUM-419 (REQ-349), SCRUM-422 (REQ-352) — Pre-QA 2026-07-28.
 * Todos del mismo commit eb8a6f9 (atlanticerp-backend, rama dev), desplegado en dev.atlanticerp.ai. Los 3
 * fueron rebotados por marly.rangel el 2026-07-24 y corregidos por Backend Dev el 2026-07-28,
 * con Senior Review ya APROBADO (consolidado en el comentario de SCRUM-366).
 *
 * Corre contra dev.atlanticerp.ai (mismos datos que usará marly), no contra un stack local.
 * Serial a propósito: dev.atlanticerp.ai corre CrowdSec/ModSecurity (ver CLAUDE.md, Epic 11) y logins
 * en paralelo desde la misma IP dispararon falsos timeouts en la primera corrida.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'https://dev.atlanticerp.ai'

async function login(page, email: string, password: string) {
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForURL(/dashboard|bodega|inicio|\/$/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)
}

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-366 — selector de persona dentro de "Equipo" (Bodega > Inicio)
// ─────────────────────────────────────────────────────────────────────────
test.describe('SCRUM-366 — selector de persona en Equipo', () => {
  test('BUG 1 (marly) — el selector solo lista Asistentes, no Jefe/Ayudante/Transporte', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/home`)
    await page.getByRole('button', { name: 'Equipo', exact: true }).waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: 'Equipo', exact: true }).click()
    await page.waitForTimeout(2200)

    // Scoped a botones (no al body completo) para no confundir con "Bienvenido, Esteban
    // Cardenas" del saludo, que sí es legítimo y no es parte del selector de chips.
    await expect(page.getByRole('button', { name: 'Mariano Sandoval', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Osvaldo Santos', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Esteban Cardenas', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Apolonio Gonzalez', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Gary Arrocha', exact: true })).toHaveCount(0)
  })

  test('RN1/Escenario 2 — "Equipo completo" queda seleccionado por defecto al activar Equipo', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/home`)
    await page.getByRole('button', { name: 'Equipo', exact: true }).waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: 'Equipo', exact: true }).click()
    await page.waitForTimeout(2200)

    await expect(page.getByText('Equipo completo', { exact: true })).toBeVisible()
    const body = await page.textContent('body')
    expect(body).toMatch(/el equipo tiene/i)
  })

  test('BUG 2 (marly) — filtrar por una persona puntual habla en singular, no en plural de equipo', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/home`)
    await page.getByRole('button', { name: 'Equipo', exact: true }).waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: 'Equipo', exact: true }).click()
    await page.waitForTimeout(2200)

    await page.getByRole('button', { name: 'Osvaldo Santos', exact: true }).click()
    await page.waitForTimeout(2200)

    const body = await page.textContent('body')
    expect(body).toMatch(/tienes/i)
    expect(body).not.toMatch(/el equipo tiene/i)
  })

  test('camino de ruptura — volver a "Equipo completo" tras filtrar por persona restaura el plural', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/home`)
    await page.getByRole('button', { name: 'Equipo', exact: true }).waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: 'Equipo', exact: true }).click()
    await page.waitForTimeout(2200)
    await page.getByRole('button', { name: 'Mariano Sandoval', exact: true }).click()
    await page.waitForTimeout(2200)
    await expect(page.getByText(/tienes/i).first()).toBeVisible()

    await page.getByRole('button', { name: 'Equipo completo', exact: true }).click()
    await page.waitForTimeout(2200)
    const body = await page.textContent('body')
    expect(body).toMatch(/el equipo tiene/i)
  })

  test('camino de ruptura — recargar a mitad de un filtro por persona no rompe la pantalla', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/home`)
    await page.getByRole('button', { name: 'Equipo', exact: true }).waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: 'Equipo', exact: true }).click()
    await page.waitForTimeout(2200)
    await page.getByRole('button', { name: 'Osvaldo Santos', exact: true }).click()
    await page.waitForTimeout(2200)
    await page.reload()
    await page.waitForTimeout(1800)

    expect(errors).toEqual([])
    const body = await page.textContent('body')
    expect(body).toMatch(/inicio|equipo/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-419 — filtros Proveedor/Marca en Ver Inventario
// ─────────────────────────────────────────────────────────────────────────
function providerSelect(page) {
  return page.locator('select').filter({ has: page.locator('option', { hasText: 'Todos los proveedores' }) })
}
function brandSelect(page) {
  return page.locator('select').filter({ has: page.locator('option', { hasText: 'Todas las marcas' }) })
}

test.describe('SCRUM-419 — filtros Proveedor/Marca', () => {
  test('BUG (marly) — el dropdown Proveedor tiene opciones reales, no solo el placeholder', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    const options = await providerSelect(page).locator('option').allTextContents()
    expect(options.length).toBeGreaterThan(1)
    expect(options.some(o => /lightcorp/i.test(o))).toBeTruthy()
  })

  test('BUG (marly) — el dropdown Marca tiene opciones reales, no solo el placeholder', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    const options = await brandSelect(page).locator('option').allTextContents()
    expect(options.length).toBeGreaterThan(1)
    expect(options.some(o => /atlantic home/i.test(o))).toBeTruthy()
  })

  test('RN1 — filtrar por Marca no encoge el propio dropdown de facetas', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    await brandSelect(page).selectOption({ label: 'Atlantic Home' })
    await page.waitForTimeout(1200)

    const optionsAfter = await brandSelect(page).locator('option').allTextContents()
    expect(optionsAfter.length).toBeGreaterThan(1)
    const providerOptionsAfter = await providerSelect(page).locator('option').allTextContents()
    expect(providerOptionsAfter.length).toBeGreaterThan(1)

    // Y la tabla sí debe reflejar el filtro de Marca (a diferencia de Proveedor, ver test de abajo).
    const rowCount = await page.locator('tbody tr').count()
    expect(rowCount).toBeGreaterThan(0)
  })

  test('camino de ruptura — seleccionar un Proveedor realmente filtra la tabla (RN1)', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    const bodyBefore = await page.locator('tbody').innerText()

    await providerSelect(page).selectOption({ label: 'LightCorp' })
    await page.waitForTimeout(1500)

    const bodyAfter = await page.locator('tbody').innerText()
    // RN1: "todos los filtros son combinables... aplican en conjunto" — filtrar por un proveedor
    // específico debe cambiar el contenido de la tabla. Si NO cambia, el filtro es solo visual.
    expect(bodyAfter).not.toEqual(bodyBefore)
  })

  test('RN1 — Proveedor + Estado + Marca combinados a la vez siguen reduciendo la tabla en conjunto', async ({ page }) => {
    // Adversarial explícito pedido en el re-check de hoy: no alcanza con probar Proveedor solo,
    // hay que combinarlo con otros 2 filtros a la vez y verificar que cada uno agrega una
    // restricción real (no que se pisen entre sí ni que alguno quede ignorado).
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)
    const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
    await perPageSelect.selectOption('all')
    await page.waitForTimeout(1200)

    const estadoSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Disponible' }) })
    await estadoSelect.selectOption({ label: 'Disponible' })
    await page.waitForTimeout(1000)
    const afterEstado = await page.locator('tbody tr').count()

    await providerSelect(page).selectOption({ label: 'LightCorp' })
    await page.waitForTimeout(1000)
    const afterProvider = await page.locator('tbody tr').count()
    // Confirmado en vivo (2026-07-28): Estado=Disponible da 20 filas, +Proveedor=LightCorp
    // reduce a 2 (CAND-SAL-005, MESA-LAMP-015) — el proveedor sí resta sobre el estado ya
    // aplicado, no lo reemplaza ni lo ignora.
    expect(afterProvider).toBeLessThan(afterEstado)

    await brandSelect(page).selectOption({ label: 'Demo' })
    await page.waitForTimeout(1000)
    const afterBrand = await page.locator('tbody tr').count()
    // +Marca=Demo reduce aún más (1 de los 2) — la tercera restricción también aplica en
    // conjunto con las 2 anteriores, no las reinicia.
    expect(afterBrand).toBeLessThanOrEqual(afterProvider)
    expect(afterBrand).toBeGreaterThan(0)
  })

  test('camino de ruptura — Proveedor + búsqueda de texto sin intersección da tabla vacía sin romper la UI', async ({ page }) => {
    // Combo garantizado vacío (a diferencia de adivinar una combinación Proveedor+Marca sin
    // solapamiento, que resultó ser un falso terreno — ver nota de la sesión: un intento inicial
    // asumió que LightCorp + "Atlantic Home" no se solapaban, pero re-verificado en vivo SÍ
    // hay intersección real (MESA-LAMP-015 es de esa marca) — usar un texto de búsqueda inexistente
    // combinado con un Proveedor real sí garantiza 0 resultados sin depender de qué marca tiene
    // cada producto.
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    await providerSelect(page).selectOption({ label: 'LightCorp' })
    await page.waitForTimeout(1000)
    const search = page.getByPlaceholder('Buscar por referencia o descripción...')
    await search.fill('zzzzz-no-existe-zzzzz')
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    await page.waitForTimeout(1500)

    expect(errors).toEqual([])
    const rowCount = await page.locator('tbody tr').count()
    expect(rowCount).toBe(1) // fila única de "vacío", nunca una tabla rota/en blanco sin mensaje
    await expect(page.locator('tbody')).toContainText(/no hay productos/i)
  })

  test('camino de ruptura — el dropdown Proveedor solo lista proveedores con productos (no hay opción huérfana que vacíe la tabla)', async ({ page }) => {
    // Adversarial pedido en el re-check: "¿un Proveedor sin productos activos da tabla vacía
    // correctamente?". Verificado contra las 16 opciones reales del dropdown en dev.atlanticerp.ai
    // (incluidos varios proveedores de prueba con nombres largos tipo PREQA-*/QA Prov *): TODAS
    // devuelven al menos 1 fila, sin excepción — la faceta `providers` del backend se arma con
    // GROUP BY sobre productos existentes, así que un proveedor sin ningún producto activo
    // simplemente NUNCA aparece como opción seleccionable. No hay forma de llegar al escenario
    // "proveedor sin productos" desde este dropdown; el camino de ruptura real (intersección
    // vacía entre 2 filtros que sí existen) ya está cubierto por el test anterior.
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    for (const label of ['Iluminex SA', 'LightCorp', 'Zona Libre de Colón']) {
      await providerSelect(page).selectOption({ label })
      await page.waitForTimeout(1000)
      const rowCount = await page.locator('tbody tr').count()
      expect(rowCount, `proveedor "${label}" debería tener al menos 1 producto`).toBeGreaterThan(0)
    }
  })

  test('camino de ruptura — recargar con un filtro de Proveedor aplicado no rompe la pantalla (el filtro se pierde, sin persistencia por diseño)', async ({ page }) => {
    // No hay requisito de Jira que pida persistir filtros en la URL tras un reload (a diferencia
    // del deep-link de chip `?filter=rotacion/criticos`, REQ-432, que sí es explícito). Este test
    // documenta el comportamiento real: el filtro se resetea silenciosamente al recargar, sin
    // error — comportamiento aceptable, no un criterio incumplido, pero relevante dejarlo
    // verificado por si el negocio decide más adelante que sí debería persistir.
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    await providerSelect(page).selectOption({ label: 'LightCorp' })
    await page.waitForTimeout(1000)
    await page.reload()
    await page.waitForTimeout(1800)

    expect(errors).toEqual([])
    const valueAfterReload = await providerSelect(page).inputValue()
    expect(valueAfterReload).toBe('') // confirmado: no persiste — comportamiento esperado, no bug
    await expect(page.locator('table')).toBeVisible()
  })

  test('camino de ruptura — búsqueda de texto sin resultados no rompe la tabla', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    const search = page.getByPlaceholder('Buscar por referencia o descripción...')
    await search.fill('zzzzz-no-existe-zzzzz')
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    await page.waitForTimeout(1500)

    expect(errors).toEqual([])
    const rowCount = await page.locator('tbody tr').count()
    expect(rowCount).toBe(1) // fila única de "vacío" (bodega:inventory.empty)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-422 — columna Bodega(s) / modal de desglose por ubicación
// ─────────────────────────────────────────────────────────────────────────
async function searchProduct(page, reference: string) {
  const search = page.getByPlaceholder('Buscar por referencia o descripción...')
  await search.fill(reference)
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.waitForTimeout(1500)
}

function warehouseModal(page) {
  return page.locator('div.fixed', { hasText: 'Bodegas —' })
}

test.describe('SCRUM-422 — desglose de stock por bodega', () => {
  test('BUG 1/2 (marly) — SPOT-EMP-010 muestra "2 bodegas" y el modal desglosa 200/100 reales, no 7 en 0', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)
    await searchProduct(page, 'SPOT-EMP-010')

    const row = page.locator('tbody tr', { hasText: 'SPOT-EMP-010' }).first()
    await expect(row).toBeVisible()
    await expect(row).not.toContainText('0 bodegas')
    await expect(row).toContainText(/2 bodegas/i)

    await row.getByRole('button', { name: /bodega/i }).click()
    await page.waitForTimeout(800)

    const modal = warehouseModal(page)
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('Bodega Central')
    await expect(modal).toContainText('200')
    await expect(modal).toContainText('Showroom Obarrio')
    await expect(modal).toContainText('100')
    // RN1 — no debe inventar bodegas sin stock (las otras 5 físicas no deben listarse en absoluto).
    const items = modal.locator('li')
    await expect(items).toHaveCount(2)
  })

  test('BUG 2 (marly) — APLQ-PAR-020 (60 disponibles) ya no dice "0 bodegas"', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)
    await searchProduct(page, 'APLQ-PAR-020')

    const row = page.locator('tbody tr', { hasText: 'APLQ-PAR-020' }).first()
    await expect(row).toBeVisible()
    await expect(row).not.toContainText('0 bodegas')

    await row.getByRole('button', { name: /bodega/i }).click()
    await page.waitForTimeout(800)
    const modal = warehouseModal(page)
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('Bodega Central')
    await expect(modal).toContainText('60')
  })

  test('camino de ruptura — un producto con stock en una sola bodega muestra "1 bodega", no las 7', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)
    await searchProduct(page, 'CAND-SAL-005')

    const row = page.locator('tbody tr', { hasText: 'CAND-SAL-005' }).first()
    await expect(row).toBeVisible()
    // "1 bodega" (singular, sin 's') seguido directo por el valor de la próxima columna en el
    // innerText concatenado de la fila — no "bodegas" (plural) en ningún punto de la celda.
    await expect(row).toContainText('1 bodega')
    await expect(row).not.toContainText('1 bodegas')

    await row.getByRole('button', { name: /bodega/i }).click()
    await page.waitForTimeout(800)
    const modal = warehouseModal(page)
    await expect(modal).toBeVisible()
    await expect(modal.locator('li')).toHaveCount(1)
  })

  test('camino de ruptura — universo completo de productos activos, no solo los 10 productos demo del backfill', async ({ page }) => {
    // Adversarial: ProductWarehouseStockBackfillSeeder solo cubre 10 referencias del catálogo
    // demo original (CatalogProductSeeder). El catálogo real de dev.atlanticerp.ai tiene productos
    // sembrados por otros seeders (QaTickets*, Scrum416420*, demo sustitutos, etc.) con
    // stock_quantity > 0 propio. Si alguno de esos NO tiene fila en product_warehouse_stock,
    // reaparece exactamente el bug original (RN1 violado) para ese producto puntual, aunque los
    // 10 de la lista del ticket ya estén corregidos.
    //
    // KNOWN_GAPS (Pre-QA 2026-07-28, re-check completo): SUST-CAND-002/003 son datos demo de OTRA
    // feature ("sustitutos — margen alto/bajo", no relacionada a SCRUM-419/421/422 ni al batch de
    // Bodega) que nunca tuvieron fila en product_warehouse_stock. Confirmado en vivo: el modal de
    // desglose responde correctamente "no tiene stock en ninguna bodega" (RN1 de ESTE ticket —
    // "sin inventar cantidades" — se cumple, el modal no fabrica nada), pero la fila de la tabla
    // muestra Disponible/Stock Total > 0 para un producto sin ninguna bodega real: inconsistencia
    // de dato, no del código de este batch. Reportado como hallazgo MEDIO no bloqueante en el
    // comentario de SCRUM-422 (Jira) — pendiente de un seeder de datos separado, fuera del alcance
    // de este batch y del repo frontend. Se excluyen acá por referencia explícita para que el
    // check siga siendo una alarma real ante CUALQUIER OTRO producto nuevo con el mismo problema.
    const KNOWN_GAPS = ['SUST-CAND-002', 'SUST-CAND-003']

    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    // Traer el catálogo completo en una sola página en vez de paginar con selectores ambiguos
    // (ver fix de locator más abajo, ya no aplica porque no hace falta paginar).
    const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
    if (await perPageSelect.count() > 0) {
      await perPageSelect.selectOption('all')
      await page.waitForTimeout(1500)
    }

    const rows = page.locator('tbody tr')
    const count = await rows.count()
    const findings: string[] = []
    for (let i = 0; i < count; i++) {
      const rowText = await rows.nth(i).innerText()
      if (/0 bodegas/.test(rowText)) {
        // columna Disponible es la 7ma celda visible (Imagen, Ref, Producto, Categoría,
        // Rotación, Bodega(s), Disponible, ...) — el texto crudo no está tabulado de forma
        // confiable via innerText, así que confirmamos con un chequeo laxo: cualquier número
        // > 0 inmediatamente después del texto "bodegas" en la misma fila.
        //
        // Fix Pre-QA 2026-07-28 (2do re-check): `/\d+/` ignoraba el signo `-`, así que un
        // "Disponible: -4" (negativo — comprometido supera el stock físico real, 0 en las 7
        // bodegas) se leía como "4 > 0" y disparaba un falso positivo (producto
        // PREQA-LOC-A-*, dato huérfano de una sesión Pre-QA anterior 2026-07-20, confirmado
        // en vivo: el modal de desglose dice correctamente "no tiene stock en ninguna
        // bodega" — RN1 se cumple, 0 bodegas es el dato real). Capturar el signo opcional y
        // exigir el valor > 0 sin ambigüedad.
        const match = rowText.match(/0 bodegas([\s\S]*)/)
        const afterText = match?.[1] ?? ''
        const firstNumber = afterText.match(/-?\d+/)
        if (firstNumber && Number(firstNumber[0]) > 0) {
          const line = rowText.split('\n')[0]
          if (!KNOWN_GAPS.some(ref => line.includes(ref))) {
            findings.push(line)
          }
        }
      }
    }

    if (findings.length > 0) {
      console.log(`[Pre-QA hallazgo] Producto(s) con stock real pero "0 bodegas": ${JSON.stringify(findings)}`)
    }
    expect(findings, 'Se encontró un producto NUEVO (fuera de los KNOWN_GAPS ya documentados) con stock real pero "0 bodegas" — mismo bug de SCRUM-422, gap de cobertura de datos').toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// SCRUM-421 — tabla de catálogo, 15 columnas (re-confirmación, ya corregido antes de hoy
// vía commit 6723e30 — sin cambios nuevos en el batch de hoy, solo re-check de que sigue bien)
// ─────────────────────────────────────────────────────────────────────────
test.describe('SCRUM-421 — tabla de catálogo, 15 columnas', () => {
  test('RN — las 15 columnas del ticket están presentes en el header, en el orden esperado', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    const headers = await page.locator('thead th').allInnerTexts()
    expect(headers.length).toBe(15)
    // La primera columna (imagen) va con header sr-only, sin texto visible — se verifica aparte.
    expect(headers.slice(1)).toEqual([
      'REF. PÚBLICA', 'PRODUCTO', 'CATEGORÍA', 'ROTACIÓN', 'BODEGA(S)', 'DISPONIBLE',
      'POR SERVIR', 'STOCK TOTAL', 'POR INGRESAR', 'EN CAMINO', 'STOCK MÍNIMO', 'ESTADO',
      'PROVEEDOR', 'ACCIÓN',
    ])
  })

  test('columna Imagen — nunca una imagen rota; placeholder cuando el producto no tiene foto', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)
    const perPageSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') })
    await perPageSelect.selectOption('all')
    await page.waitForTimeout(1500)

    // Confirmado en vivo (2026-07-28): ningún producto del catálogo real de dev.atlanticerp.ai tiene
    // photo_url seteado todavía — las 46 filas muestran el placeholder (IcoImage), 0 con <img>.
    // Cuando algún producto SÍ tenga foto, este test debe extenderse a validar naturalWidth > 0
    // en esa fila puntual; hoy solo hay universo para probar el camino "sin foto".
    const rows = page.locator('tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
    let brokenImages = 0
    for (let i = 0; i < count; i++) {
      const imgs = rows.nth(i).locator('td').first().locator('img')
      const imgCount = await imgs.count()
      if (imgCount > 0) {
        const naturalWidth = await imgs.first().evaluate((el: HTMLImageElement) => el.naturalWidth)
        if (naturalWidth === 0) brokenImages++
      }
    }
    expect(brokenImages).toBe(0)
  })

  test('RN1 — Stock Total = Disponible + Por servir, con Por servir > 0 real', async ({ page }) => {
    await login(page, 'almacen@atlantic.com.pa', 'almacen@atlantic.com.pa')
    await page.goto(`${BASE}/bodega/inventario`)
    await page.waitForTimeout(2000)

    // LAMP-COL-001: Disponible=18, Por servir=6 (comprometido), Stock Total=24 (confirmado en
    // vivo) — a diferencia de otros productos del catálogo con Por servir=0, este SÍ ejercita la
    // suma real del RN1, no un caso degenerado (18 + 0 = 18 no distingue una suma de un copy-paste).
    const search = page.getByPlaceholder('Buscar por referencia o descripción...')
    await search.fill('LAMP-COL-001')
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    await page.waitForTimeout(1200)

    const row = page.locator('tbody tr', { hasText: 'LAMP-COL-001' }).first()
    await expect(row).toBeVisible()
    const cells = await row.locator('td').allInnerTexts()
    // Índices (0-based): 0 imagen, 1 ref, 2 producto, 3 categoría, 4 rotación, 5 bodega(s),
    // 6 disponible, 7 por servir, 8 stock total.
    const disponible = Number(cells[6].trim())
    const porServir = Number(cells[7].trim())
    const stockTotal = Number(cells[8].trim())
    expect(porServir).toBeGreaterThan(0)
    expect(stockTotal).toBe(disponible + porServir)
  })
})
