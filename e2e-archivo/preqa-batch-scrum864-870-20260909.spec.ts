import { test, expect, Page } from '@playwright/test'

/**
 * Gate fusionado Visual Review + Pre-QA — batch de correcciones SCRUM-864→870 (Admin&Cont).
 * Corrido en LOCAL contra http://localhost:5173 (Vite dev server, proxy /api -> :8090),
 * NUNCA dev.atlanticerp.ai. Login con usuario real Contabilidad (`contabilidad@test.com`, password =
 * email en local). Cubre solo las verificaciones que NECESITAN un browser y datos mínimos;
 * el grueso de los ACs data-dependientes se validó a nivel código + feature/unit tests
 * (ver docs/pre-qa/scrum864-870-batch-20260909.md).
 *
 * Auto-contenido: no siembra fixtures (las pantallas cubiertas acá renderizan con estado vacío
 * o con los tramos paramétricos que ya vienen de la migración). Si en el futuro hace falta
 * data real (charts con barras), sembrarla en un beforeAll acá.
 */

const BASE = 'http://localhost:5173'
const CONTABILIDAD = 'contabilidad@test.com'

async function login(page: Page, email: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(800)
  expect(page.url()).not.toContain('/login')
}

// Tests independientes (cada uno hace su propio login) — sin modo serial para que un fallo
// (ej. el hallazgo abierto de SCRUM-870.2) no impida correr el resto.

// ---------------------------------------------------------------------------
// SCRUM-869 — Home de Administración: orden vertical de los bloques
// ---------------------------------------------------------------------------
test('SCRUM-869 — Home: Resumen del mes → (Pendientes | Mi Calendario) → Vencidos y por vencer', async ({ page }) => {
  await login(page, CONTABILIDAD)
  await page.goto(`${BASE}/admin-contab/inicio`)
  await page.waitForTimeout(1800)

  // Buscar los títulos de panel dentro del <main> (evita el nav lateral, que también dice
  // "Pendientes"). Cada panel titula con un <div> font-semibold, texto exacto de i18n.
  const main = page.locator('main')
  const title = (txt: string) => main.getByText(txt, { exact: true }).first()

  const resumen   = title('Resumen del mes')
  const pendientes = title('Pendientes')
  const calendario = title('Mi calendario')
  const vencidos   = title('Vencidos y por vencer')

  await expect(resumen, 'bloque "Resumen del mes" presente').toBeVisible()
  await expect(pendientes, 'bloque "Pendientes" presente').toBeVisible()
  await expect(calendario, 'bloque "Mi Calendario" presente').toBeVisible()
  await expect(vencidos, 'bloque "Vencidos y por vencer" presente').toBeVisible()

  const [bResumen, bPend, bCal, bVenc] = await Promise.all([
    resumen.boundingBox(), pendientes.boundingBox(), calendario.boundingBox(), vencidos.boundingBox(),
  ])
  if (!bResumen || !bPend || !bCal || !bVenc) throw new Error('no se pudo medir la posición de los paneles')

  // Orden vertical por coordenada Y del encabezado de cada panel.
  expect(bResumen.y, 'Resumen del mes arriba de Pendientes').toBeLessThan(bPend.y)
  expect(bResumen.y, 'Resumen del mes arriba de Mi Calendario').toBeLessThan(bCal.y)
  expect(Math.max(bPend.y, bCal.y), 'Pendientes+Calendario arriba de Vencidos').toBeLessThan(bVenc.y)

  // Pendientes y Mi Calendario en la MISMA fila, Pendientes a la izquierda.
  expect(Math.abs(bPend.y - bCal.y), 'Pendientes y Mi Calendario alineados en la misma fila').toBeLessThan(80)
  expect(bPend.x, 'Pendientes a la izquierda de Mi Calendario').toBeLessThan(bCal.x)

  await page.screenshot({ path: 'e2e/screenshots/SCRUM-869-home-layout.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// SCRUM-866 punto 1 — "Pendiente de factura" renombrado a "Pendiente Cuenta de cobro"
// ---------------------------------------------------------------------------
test('SCRUM-866.1 — Comisiones Externas no muestra "Pendiente de factura" en ninguna vista', async ({ page }) => {
  await login(page, CONTABILIDAD)
  await page.goto(`${BASE}/admin-contab/comisiones/externas`)
  await page.waitForTimeout(1500)

  const bodyText = await page.locator('body').innerText()
  expect(bodyText, 'no debe aparecer el texto viejo "Pendiente de factura"').not.toMatch(/Pendiente de factura/i)
  // La tarjeta KPI renombrada debe estar presente.
  expect(bodyText).toMatch(/Pendiente Cuenta de cobro/i)

  await page.screenshot({ path: 'e2e/screenshots/SCRUM-866-1-comisiones-externas.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// SCRUM-870 punto 2 — tarjeta de comisión de Contabilidad: rangos en formato K
// ---------------------------------------------------------------------------
test('SCRUM-870.2 — tarjeta Contabilidad: rangos "$15K" / "$15K – $19K" / "$20K", nunca USD con decimales', async ({ page }) => {
  await login(page, CONTABILIDAD)
  await page.goto(`${BASE}/admin-contab/reportes`)
  await page.waitForTimeout(2000)

  const bodyText = await page.locator('body').innerText()

  // No debe haber montos de tramo en formato USD extendido tipo "USD 14,999.99" o "$14,999.99".
  expect(bodyText, 'sin montos de tramo en USD extendido con centavos').not.toMatch(/1[45],?999\.99/)

  // Formato K del mockup en la LISTA de tramos (las 3 líneas "... → N%").
  expect(bodyText, 'rango medio "$15K – $19K → 1.5%"').toMatch(/\$15K\s*[–-]\s*\$19K\s*→\s*1\.5%/)
  expect(bodyText, 'tramo superior "Más de $20K → 2%"').toMatch(/Más de \$20K\s*→\s*2%/)

  // SCRUM-870.2 (rebote Pre-QA, resuelto en cdce23e) — el ticket especifica exactamente
  // "Menos de $15K → 1%" (mockup). formatCompactK ahora usa ceil para el tope exclusivo de
  // "Menos de X" (monto_maximo = 14999.99 → $15K), coherente con el badge "RANGO ACTUAL".
  expect(bodyText, 'tramo inferior de la LISTA debe ser "Menos de $15K → 1%", no "$14K"')
    .toMatch(/Menos de \$15K\s*→\s*1%/)

  await page.screenshot({ path: 'e2e/screenshots/SCRUM-870-2-contabilidad-tiers.png', fullPage: true })
})

// ---------------------------------------------------------------------------
// SCRUM-870 punto 1 — 4 gráficas de barra renderizan (canvas presente, sin crash)
// ---------------------------------------------------------------------------
test('SCRUM-870.1 — Reportes: las gráficas de barra renderizan sin error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await login(page, CONTABILIDAD)
  await page.goto(`${BASE}/admin-contab/reportes`)
  await page.waitForTimeout(2500)

  // Con la BD local vacía varias gráficas de barra muestran estado vacío (sin <canvas>), así que
  // la verificación de "valor $ encima de cada barra" (AC1) necesita data real — se difiere al
  // entorno de QA. Acá solo se confirma que la página no rompe con el plugin nuevo cargado.
  const canvases = await page.locator('canvas').count()
  expect(canvases, 'al menos alguna gráfica renderiza').toBeGreaterThanOrEqual(1)
  expect(errors, 'sin errores JS en la página de Reportes (plugin barValueLabel incluido)').toEqual([])

  await page.screenshot({ path: 'e2e/screenshots/SCRUM-870-1-reportes-charts.png', fullPage: true })
})
