import { test, expect, Page } from '@playwright/test'

// Pre-QA adversarial — TERCERA PASADA, post-merge de los PRs gerencia→dev (atlanticerp-backend#3,
// atlanticerp-frontend#2, mergeados y desplegados a dev.atlanticerp.ai el 2026-08-23/24). El PR cambió
// copy/labels y wiring — el spec v2 (16 tests) quedó con selectores del texto viejo, por eso este
// spec nuevo verifica contra el estado real post-deploy en vez de reciclar aserciones stale.

const WHIL = 'whil@atlantic.com.pa' // Gerencia Restringida, Nivel 8 — NO es Mark Approver

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1200)
}

test('SCRUM-159 — los filtros Vendedor/Cliente ya existen (RN1), pero sin lista real de opciones', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const selects = page.locator('select')
  await expect(selects).toHaveCount(2)
  const vendedorOptions = await selects.nth(0).locator('option').count()
  const clienteOptions = await selects.nth(1).locator('option').count()
  // Documentamos el gap: el <select> existe (RN1 estructural), pero solo tiene la opción
  // "Todos los..." — sin lista real de vendedores/clientes para elegir, RN1 no es funcional todavía.
  expect(vendedorOptions).toBe(1)
  expect(clienteOptions).toBe(1)
})

test('SCRUM-156/159 — "Facturado este año" ahora navega (antes no hacía nada)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Facturado este año', { exact: false }).first().click()
  await page.waitForTimeout(600)
  expect(page.url()).toContain('/admin-contab') // navega, aunque sin filtro (RN3 pide "detalle filtrado")
})

test('SCRUM-160 — "Proyectos cerrados este año" ahora navega a Ventas & Diseño', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Proyectos cerrados este año', { exact: false }).first().click()
  await page.waitForTimeout(600)
  expect(page.url()).toContain('/ventas-diseno')
})

test('SCRUM-160 — el margen del año/mes sigue siendo un stub fijo en 0% (comentario propio "TODO" en el backend)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken') ?? ''
    const res = await fetch('/api/gerencia/home', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return res.json()
  })
  expect(raw.proyectos.kpis.margen_anio_pct).toBe(0)
  expect(raw.proyectos.kpis.margen_mes_pct).toBe(0)
  expect(raw.facturacion.kpis.margen_anio_pct).toBe(0)
  expect(raw.facturacion.kpis.margen_mes_pct).toBe(0)
})

test('SCRUM-166 — indicador "En Final Stage" ya existe (antes faltaba)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('En Final Stage', { exact: false })).toBeVisible()
})

test('SCRUM-166 — SIGUE ROTO: los 4 indicadores de Salud Ventas&Diseño siguen navegando los 4 al mismo /ventas-diseno sin filtrar', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)

  await page.getByText('En Final Stage', { exact: false }).first().click()
  await page.waitForTimeout(500)
  const url1 = page.url()

  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Pipeline total', { exact: false }).first().click()
  await page.waitForTimeout(500)
  const url2 = page.url()

  expect(url1).toBe(url2) // mismo destino sin filtrar, RN1-RN5 siguen sin cumplirse
  expect(url1).toContain('/ventas-diseno')
})

test('SCRUM-168 — SIGUE FALTANDO el indicador "Bajo stock sin ordenar" (Escenario 1 del ticket depende de él)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('Bajo stock sin ordenar')).toHaveCount(0)
})

test('SCRUM-168 — SIGUE ROTO: los indicadores de Salud Compras siguen navegando todos al mismo /compras sin filtrar', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)

  await page.getByText('Órdenes críticas', { exact: false }).first().click()
  await page.waitForTimeout(500)
  const url1 = page.url()

  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('Cantidad de pedidos', { exact: false }).first().click()
  await page.waitForTimeout(500)
  const url2 = page.url()

  expect(url1).toBe(url2)
  expect(url1).toContain('/compras')
})

test('SCRUM-171 — CONFIRMADO ARREGLADO: "Ver detalle" de Bodega ahora navega a /bodega/home', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const heading = page.getByText('Agenda de Bodega — hoy', { exact: true })
  const btn = heading.locator('xpath=following::button[normalize-space(text())="Ver detalle"][1]')
  await btn.click()
  await page.waitForTimeout(800)
  expect(page.url()).toContain('/bodega/home')
})

test('MEDIO#9 — CONFIRMADO ARREGLADO: un rol sin acceso ahora es redirigido fuera de /gerencia (antes se quedaba con pantalla de error)', async ({ page }) => {
  await login(page, 'neil.quiel@atlantic.com.pa') // Vendedor/Diseñador, sin permiso gerencia.view
  await page.goto('/gerencia')
  await page.waitForTimeout(1500)
  expect(page.url()).not.toContain('/gerencia') // RequirePermission ahora sí redirige
  await expect(page.getByText('Error al cargar los datos', { exact: false })).toHaveCount(0)
})

test('SCRUM-157 — CONFIRMADO: "CxC al día" ahora navega (antes no hacía nada)', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await page.getByText('CxC al día', { exact: false }).first().click()
  await page.waitForTimeout(600)
  expect(page.url()).toContain('/admin-contab')
})

test('SCRUM-161/162 — Whil (no es Mark Approver) ve "Solo para aprobadores", no el placeholder viejo', async ({ page }) => {
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  await expect(page.getByText('Solo para aprobadores')).toBeVisible()
  const raw = await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken') ?? ''
    const res = await fetch('/api/gerencia/home', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return res.json()
  })
  expect(raw.is_approver).toBe(false)
  expect(raw.aprobaciones).toEqual([])
})

test('SCRUM-161 RN1/RN2 — GAP DE DISEÑO sigue vigente: un solo Mark Approver global, no "cada tipo con su propio rol autorizado" (Mark/David/Whil)', async ({ page }) => {
  // No es un bug de comportamiento — es una verificación de que el modelo implementado
  // (ComprasSettings.mark_approver_user_id, un único aprobador) sigue sin ser el que describe el
  // ticket (RN1: "cada tipo de solicitud tiene un rol autorizado"; RN2: "el listado se filtra
  // según quién inició sesión" — implica varios aprobadores posibles, uno por tipo). Documentado
  // acá para que quede trazable en el spec, no solo en el reporte .md.
  await login(page, WHIL)
  await page.goto('/gerencia')
  await page.waitForTimeout(1200)
  const raw = await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken') ?? ''
    const res = await fetch('/api/gerencia/home', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return res.json()
  })
  // Confirmamos el hecho estructural: is_approver es un booleano único, no una lista de tipos
  // autorizados por usuario — el modelo de datos no soporta "David ve sus propios tipos".
  expect(typeof raw.is_approver).toBe('boolean')
})
