import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * Visual Review + Pre-QA fusionados — Fase 4 Servicios, Grupo D parte 2 "Reserva Servicios de
 * Insumos + Kardex de herramientas" (SCRUM-343/344/345/346/347/361, REQ-273→277/291).
 *
 * Corre contra el stack local compartido (nginx :8090, vite :5173), NO dev.atlanticerp.ai — código
 * mergeado a `dev` local en ambos repos, todavía sin push.
 *
 * Cuentas reales (password = email):
 *  - servicio@atlantic.com.pa  (lider_servicios) — Aaron, escritura completa de Insumos
 *  - carlos@atlantic.com.pa    (tecnico_servicios) — Carlos Vergara, solo lectura del módulo
 *  - daniela@atlantic.com.pa   (management) — Gerencia, ve el Kardex de herramientas
 *  - gerencia2@atlantic.com.pa (lider_compras) — Yirena, avanza la orden real en Compras
 *
 * Hallazgo real de este pase (corregido en el mismo dispatch, ver OriginBadge.tsx +
 * PurchaseOrderController.php): REQ-274 RN3 pedía que la orden generada quedara "visible en
 * Compras con Origen: Servicios" — el dato existía en BD (`origin_module`) pero nunca se exponía
 * ni se pintaba. Este spec verifica el badge ya corregido (test 6).
 *
 * PRODUCT_SEARCH ("Bombillo") es el único producto demo local con provider_id asignado
 * (CatalogUatTestDataSeeder) — necesario para que REQ-274/277 puedan generar una orden real.
 */
test.describe.configure({ mode: 'serial' })

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const API_BASE = process.env.PREQA_API_BASE_URL ?? 'http://localhost:8090'
const DL_DIR = 'e2e/.tmp/preqa-servicios-grupoD-parte2'
const PRODUCT_SEARCH = 'Bombillo decorativo'

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => localStorage.clear()).catch(() => {})
  await page.goto(`${BASE}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(2000)
}

async function gotoInsumos(page: Page) {
  await page.goto(`${BASE}/servicios/insumos-herramientas`)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: 'Insumos', exact: true }).click()
  await page.waitForTimeout(800)
}

async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${API_BASE}/api/auth/login`, { data: { email, password: email } })
  const { token } = await res.json()
  return token as string
}

// ---------- REQ-273 — Listado + gate de escritura ----------

test('1. Aaron — REQ-273: panel Insumos vacío al arrancar, botón "+ Agregar insumo" visible', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInsumos(page)
  await page.screenshot({ path: `${DL_DIR}/01-panel-vacio.png`, fullPage: true })

  await expect(page.getByRole('button', { name: /Agregar insumo/i })).toBeVisible()
})

test('2. Carlos (tecnico_servicios) — modo lectura: sin botón "Agregar insumo" ni "Solicitar"', async ({ page }) => {
  await login(page, 'carlos@atlantic.com.pa')
  await gotoInsumos(page)
  await page.screenshot({ path: `${DL_DIR}/02-carlos-solo-lectura.png`, fullPage: true })

  await expect(page.getByRole('button', { name: /Agregar insumo/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Solicitar', exact: true })).toHaveCount(0)
  // "Movimiento de herramientas" tampoco — REQ-276, exclusivo Aaron/Gerencia/superadmin.
  await expect(page.getByRole('button', { name: /Movimiento de herramientas/i })).toHaveCount(0)
})

test('3. Ruptura — Carlos vía API directa: POST /servicios/insumos debe dar 403', async ({ request }) => {
  const token = await apiToken(request, 'carlos@atlantic.com.pa')
  const res = await request.post(`${API_BASE}/api/servicios/insumos`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { catalog_product_id: 1, minimo: 1, cantidad_inicial: 1 },
  })
  console.log('[Ruptura] POST /servicios/insumos como tecnico_servicios → status:', res.status())
  expect(res.status()).toBe(403)
})

// ---------- REQ-275 — Alta de insumo nuevo (buscador del catálogo real) ----------

test('4. Aaron — REQ-275 Escenario 2: buscar un insumo que NO existe no muestra ninguna opción, sin forma de crearlo libre', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInsumos(page)

  await page.getByRole('button', { name: /Agregar insumo/i }).click()
  await page.waitForTimeout(400)
  await page.locator('input[type="text"]').fill('ZZZ-PRODUCTO-QUE-NO-EXISTE-EN-CATALOGO-ZZZ')
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/03-busqueda-sin-resultados.png`, fullPage: true })

  // RN2 — sin resultado, mensaje explícito de que no se puede crear libremente. Sigue en el paso
  // de búsqueda (nunca avanza al modal de mínimo/cantidad, que es lo único que permitiría "crear").
  await expect(page.getByText('Sin resultados. El insumo debe existir primero en el catálogo de Compras.')).toBeVisible()
  await expect(page.locator('[data-testid="insumo-create-modal"]')).toHaveCount(0)
})

test('5. Aaron — REQ-275 Escenario 1: agregar "Bombillo decorativo" (mínimo=3, cantidad inicial=5) crea la fila en 0 disponible / Bajo mínimo', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInsumos(page)

  await page.getByRole('button', { name: /Agregar insumo/i }).click()
  await page.waitForTimeout(400)
  await page.locator('input[type="text"]').fill(PRODUCT_SEARCH)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/04-busqueda-con-resultado.png`, fullPage: true })

  // Scoped al resultado del picker (ul > li > button), no al texto de la tabla detrás del modal —
  // si el insumo ya estaba trackeado de una corrida anterior sin reseed, la fila de fondo también
  // matchea PRODUCT_SEARCH y un locator sin scope hace click en el elemento equivocado.
  await page.locator('ul li button', { hasText: PRODUCT_SEARCH }).first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${DL_DIR}/05-modal-minimo-cantidad.png`, fullPage: true })

  const modal = page.locator('[data-testid="insumo-create-modal"]')
  await modal.locator('input[type="number"]').nth(0).fill('3') // mínimo
  await modal.locator('input[type="number"]').nth(1).fill('5')  // cantidad inicial
  await modal.getByRole('button', { name: 'Agregar', exact: true }).click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/06-insumo-creado.png`, fullPage: true })

  const row = page.locator('tbody tr').filter({ hasText: PRODUCT_SEARCH })
  await expect(row).toBeVisible()
  await expect(row.getByText('0', { exact: true })).toBeVisible() // disponible=0
  await expect(row.getByText('Bajo mínimo')).toBeVisible()
  await expect(row.getByText('Solicitud pendiente', { exact: false })).toBeVisible()
})

test('6. Aaron — REQ-275 RN1: ese mismo producto YA NO aparece en el buscador (excluido)', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInsumos(page)

  await page.getByRole('button', { name: /Agregar insumo/i }).click()
  await page.waitForTimeout(400)
  await page.locator('input[type="text"]').fill(PRODUCT_SEARCH)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/07-excluido-del-buscador.png`, fullPage: true })

  await expect(page.locator('[data-testid="insumo-create-modal"]')).toHaveCount(0) // sigue en paso de búsqueda
  // El texto SÍ sigue visible en la fila de la tabla detrás del modal (ya trackeado, test 5) — lo
  // que este RN prohíbe es que aparezca como OPCIÓN del buscador, mismo mensaje vacío que un
  // producto inexistente (test 4).
  await expect(page.getByText('Sin resultados. El insumo debe existir primero en el catálogo de Compras.')).toBeVisible()
  await expect(page.locator('ul li button', { hasText: PRODUCT_SEARCH })).toHaveCount(0)
})

// ---------- REQ-274/277 — ciclo completo real hasta "Recibido", vía Compras ----------

test('7. Yirena (Compras) — la orden generada por Aaron aparece con "Origen: Servicios" (hallazgo corregido)', async ({ page }) => {
  await login(page, 'gerencia2@atlantic.com.pa')
  await page.goto(`${BASE}/compras/ordenes`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/08-compras-ver-ordenes.png`, fullPage: true })

  const row = page.locator('tbody tr').filter({ hasText: 'LightCorp' }).first()
  await expect(row).toBeVisible()
  await expect(row.getByText('Origen: Servicios')).toBeVisible()
})

test('8. Yirena — avanza la orden hasta Recibido (Pendiente → Ordenado → En tránsito local → Ingreso de Mercancía → Recibido)', async ({ page, request }) => {
  await login(page, 'gerencia2@atlantic.com.pa')

  const token = await apiToken(request, 'gerencia2@atlantic.com.pa')
  const listRes = await request.get(`${API_BASE}/api/compras/orders?search=LightCorp`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const { data: orders } = await listRes.json()
  const order = orders.find((o: { provider_name: string }) => o.provider_name === 'LightCorp')
  expect(order).toBeTruthy()
  const orderId = order.id
  console.log('[REQ-277] orden de Servicios detectada, id:', orderId)

  await page.goto(`${BASE}/compras/ordenes/${orderId}`)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/09-orden-detalle-pendiente.png`, fullPage: true })

  // LightCorp (único proveedor con provider_id en el catálogo demo local) es internacional →
  // secuencia completa de 5 pasos (Pendiente → Ordenado → En tránsito → En aduana → En tránsito
  // local → Recibido), no la de 3 pasos de un proveedor local. Avanza hasta "En tránsito local"
  // (RN de Ingreso de Mercancía: solo se puede recibir en esa etapa), haciendo click mientras el
  // botón siga ofreciendo un estado que no sea "Recibido" todavía.
  for (let i = 0; i < 4; i++) {
    const label = await page.getByRole('button', { name: /Avanzar a:/i }).innerText()
    if (label.includes('Recibido')) break
    await page.getByRole('button', { name: /Avanzar a:/i }).click()
    await page.waitForTimeout(900)
  }
  await page.screenshot({ path: `${DL_DIR}/10-orden-en-transito-local.png`, fullPage: true })
  await expect(page.getByText('En tránsito local', { exact: true }).first()).toBeVisible()

  // Ingreso de Mercancía real, vía API (mismo endpoint que usa el wizard de Logística) — foco de
  // este spec es la sincronización REQ-277, no re-probar el wizard de Ingreso de Mercancía (ya
  // cubierto por su propia suite).
  const bodegaCentralRes = await request.get(`${API_BASE}/api/bodega/warehouses`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const warehouses = (await bodegaCentralRes.json()).data ?? (await bodegaCentralRes.json())
  const bodegaCentral = Array.isArray(warehouses) ? warehouses.find((w: { name: string }) => w.name === 'Bodega Central') : null

  const orderDetailRes = await request.get(`${API_BASE}/api/compras/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const orderDetail = await orderDetailRes.json()
  const line = orderDetail.lines[0]

  const receiptRes = await request.post(`${API_BASE}/api/compras/goods-receipts`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      purchase_order_id: orderId,
      lines: [{ catalog_product_id: line.catalog_product_id, quantity: line.quantity, unit_cost: line.unit_cost, warehouse_id: bodegaCentral.id }],
    },
  })
  console.log('[REQ-277] goods-receipt status:', receiptRes.status())
  expect(receiptRes.status()).toBe(201)

  // En tránsito local -> Recibido (dispara PurchaseOrderReceived -> nuestro listener)
  await page.reload()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /Avanzar a:/i }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/11-orden-recibida.png`, fullPage: true })

  // Verificación de fondo (no de texto libre en pantalla, que puede matchear "Recepción: Completo"
  // u otro texto ambiguo) — el estado REAL de la orden ya debe ser 'recibido'.
  const finalRes = await request.get(`${API_BASE}/api/compras/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const finalOrder = await finalRes.json()
  console.log('[REQ-277] estado final de la orden:', finalOrder.status)
  expect(finalOrder.status).toBe('recibido')
})

test('9. Aaron — REQ-277 RN3/RN4: tras "Recibido" el insumo pasa a "OK" (disponible=5 > mínimo=3), botón vuelve a "Solicitar"', async ({ page }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInsumos(page)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${DL_DIR}/12-insumo-recibido.png`, fullPage: true })

  const row = page.locator('tbody tr').filter({ hasText: PRODUCT_SEARCH })
  await expect(row).toBeVisible()
  await expect(row.getByText('OK', { exact: true })).toBeVisible()
  await expect(row.getByText('5', { exact: true })).toBeVisible() // disponible=5
  await expect(row.getByText('Solicitud pendiente', { exact: false })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Solicitar', exact: true })).toBeVisible()
})

test('10. REQ-291 RN5 — Bodega ve exactamente el mismo disponible en "Reserva Servicios" que Servicios (una sola fuente, sin duplicar)', async ({ request }) => {
  const token = await apiToken(request, 'gerencia2@atlantic.com.pa')

  const listRes = await request.get(`${API_BASE}/api/bodega/inventory?search=${encodeURIComponent(PRODUCT_SEARCH)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(listRes.status()).toBe(200)
  const { data: products } = await listRes.json()
  expect(products.length).toBeGreaterThan(0)
  const productId = products[0].id

  const breakdownRes = await request.get(`${API_BASE}/api/bodega/inventory/${productId}/warehouse-breakdown`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(breakdownRes.status()).toBe(200)
  const { data: rows } = await breakdownRes.json()
  console.log('[REQ-291] desglose por bodega desde Compras/Bodega:', JSON.stringify(rows))

  const reservaRow = rows.find((r: { warehouse_name?: string; name?: string }) =>
    (r.warehouse_name ?? r.name) === 'Reserva Servicios')
  expect(reservaRow).toBeTruthy()
  const qty = reservaRow.quantity ?? reservaRow.qty ?? reservaRow.stock
  console.log('[REQ-291] cantidad en Reserva Servicios vista desde Bodega:', qty)
  expect(Number(qty)).toBe(5) // mismo número que REQ-273 le muestra a Aaron en el test anterior
})

// ---------- REQ-276 — Kardex de herramientas: gate + filtros combinados ----------

test('11. Carlos (tecnico_servicios) — URL directa a /servicios/tools/kardex lo redirige (bloqueo real, no solo botón oculto)', async ({ page }) => {
  await login(page, 'carlos@atlantic.com.pa')
  await page.goto(`${BASE}/servicios/tools/kardex`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${DL_DIR}/13-carlos-kardex-bloqueado.png`, fullPage: true })

  expect(page.url()).not.toContain('/servicios/tools/kardex')
})

test('12. Ruptura — Carlos vía API directa: GET /servicios/tools/movements debe dar 403', async ({ request }) => {
  const token = await apiToken(request, 'carlos@atlantic.com.pa')
  const res = await request.get(`${API_BASE}/api/servicios/tools/movements`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  console.log('[Ruptura] GET /servicios/tools/movements como tecnico_servicios → status:', res.status())
  expect(res.status()).toBe(403)
})

test('13. Daniela (management) — accede al Kardex de herramientas, ve filtros combinables', async ({ page }) => {
  await login(page, 'daniela@atlantic.com.pa')
  await page.goto(`${BASE}/servicios/tools/kardex`)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DL_DIR}/14-daniela-kardex-ok.png`, fullPage: true })

  expect(page.url()).toContain('/servicios/tools/kardex')
  await expect(page.getByLabel(/herramienta/i).first()).toBeVisible()
  await expect(page.getByLabel(/responsable/i).first()).toBeVisible()
})

test('14. Aaron — botón "Movimiento de herramientas" visible y abre el Kardex en pestaña nueva', async ({ page, context }) => {
  await login(page, 'servicio@atlantic.com.pa')
  await gotoInsumos(page)
  await page.getByRole('button', { name: 'Herramientas', exact: true }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${DL_DIR}/15-boton-movimiento-herramientas.png`, fullPage: true })

  const [newPage] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: /Movimiento de herramientas/i }).click(),
  ])
  await newPage.waitForTimeout(1000)
  expect(newPage.url()).toContain('/servicios/tools/kardex')
  await newPage.screenshot({ path: `${DL_DIR}/16-kardex-abierto-nueva-pestana.png`, fullPage: true })
})
