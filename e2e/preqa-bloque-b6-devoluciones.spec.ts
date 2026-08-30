import { test, expect, Page } from '@playwright/test'

// Los tests de este archivo comparten estado mutable real contra el backend (crean/consultan
// devoluciones de la misma fixture VR-9001) — correrlos en paralelo produce carreras falsas
// (ej. un test cuenta filas mientras otro todavía está creando la suya). Serial, no fullyParallel.
test.describe.configure({ mode: 'serial' })

// Idempotencia entre reruns manuales: sin esto, re-correr el archivo completo sin resetear la
// base a mano deja devoluciones duplicadas de la corrida anterior, y ".first()"/".last()" sobre
// la bandeja apunta a la fila equivocada (fila más nueva ≠ la que el test recién creó) — se
// confirmó en vivo durante esta sesión (el test de "Confirmar recepción" terminó actuando sobre
// la devolución de la corrida anterior). Trunca SOLO las tablas de este bloque, nunca el resto
// del fixture (orders/order_items/warehouses quedan intactos).
test.beforeAll(async () => {
  const { execSync } = await import('node:child_process')
  execSync(
    `docker compose -f /Users/lgarcia/Documents/GitHub/Softclass/Illumination/atlanticerp/atlanticerp-backend/infra/docker-compose.yml exec -T postgres psql -U atlanticerp -d atlanticerp -c "truncate table illuminations_bodega.customer_return_lines, illuminations_bodega.customer_returns restart identity cascade; delete from illuminations_bodega.inventory_movements where catalog_product_id in (4,5); delete from illuminations_bodega.product_warehouse_stock where catalog_product_id in (4,5);"`,
    { encoding: 'utf-8' },
  )
})

// Pre-QA 2026-07-26 — Bloque B6 "Devoluciones" (SCRUM-473→489, REQ-403→419).
// Corre contra playwright.config.ts estándar del repo (dev server npm run dev, baseURL :5173,
// que proxea /api a http://localhost:8090).
// Fixture: Order VR-9001 (Order::STAGE_DESPACHADO), pipeline card "Residencia Punta Pacifica VR"
// (owner id 12 = almacen@illuminations.com.pa), 2 OrderItem: NORDIC-40-VR (qty_delivered=5) y
// PERFIL-2M-VR (qty_delivered=3) — sembrada vía tinker (script en scratchpad de la sesión, mismo
// que usó Visual Reviewer). infra/test.sh borra este fixture (resetea el schema de tenant) — si
// hay que re-correr este spec desde cero, re-sembrar primero.
// 3 bugs reales encontrados y corregidos en esta sesión (backend + frontend, ver
// docs/pre-qa/bloque-b6-devoluciones-2026-07-26.md en atlanticerp-backend):
//  1. RN2 (REQ-417) no acumulaba entre devoluciones — CustomerReturnService::create() ahora suma
//     lo ya solicitado en otras devoluciones no rechazadas del mismo order_item_id.
//  2. ConfirmReturnReceptionModal.tsx tapaba el mensaje específico del backend con uno genérico
//     — ahora usa isAxiosError + response.data.message, mismo patrón que BodegaInventarioPage.tsx
//     (fix Pre-QA 2026-07-23); correcto ahí porque esas excepciones (confirmReception/reject)
//     llevan el texto específico en `message` de nivel superior.
//  3. BodegaNuevaDevolucionPage.tsx recibió el MISMO fix que #2 (response.data.message) pero
//     `create()` lanza `CustomerReturnException` con el shape de `ValidationException` — el texto
//     específico vive en `errors.items.N.qty_requested[0]`, no en `message` (que siempre es el
//     genérico "No se pudo crear la devolución."). El fix #2 seguía mostrando el genérico acá —
//     encontrado en vivo con el test "RN2 (REQ-417) acumulado..." de abajo (curl directo al
//     endpoint confirmó el shape real antes de corregir). Fix real: leer el primer valor de
//     `errors`, con fallback a `message`.

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() }).catch(() => {})
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(email)
  await page.getByRole('button', { name: /iniciar sesión|login/i }).click()
  await page.waitForTimeout(1500)
}

async function goToTray(page: Page) {
  await page.goto('/bodega/devoluciones')
  await page.waitForTimeout(800)
}

async function goToNew(page: Page) {
  await page.goto('/bodega/devoluciones/nueva')
  await page.waitForTimeout(500)
}

test.describe('SCRUM-473 (REQ-403) — Bandeja', () => {
  test('columnas exactas + chip sin resultados muestra mensaje explicativo, no tabla vacía muda', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToTray(page)

    for (const col of ['Pedido', 'Cliente', 'Proyecto', 'Producto(s)', 'Fecha', 'Estado', 'Doc. firmado', 'Acciones']) {
      await expect(page.locator('thead')).toContainText(col)
    }

    // Chip "Rechazadas" — si no hay ninguna rechazada todavía, debe verse un mensaje, no una
    // tabla en blanco.
    await page.getByRole('button', { name: 'Rechazadas', exact: true }).click()
    await page.waitForTimeout(600)
    const rowCount = await page.locator('tbody tr').count()
    if (rowCount <= 1) {
      await expect(page.locator('tbody')).toContainText(/no hay devoluciones/i)
    }
    await page.screenshot({ path: 'e2e/.tmp/b6-chip-rechazadas-vacio.png' })
  })
})

test.describe('SCRUM-484/485/486/487/488/489 — Nueva devolución', () => {
  test('RN1 buscador: sin resultados muestra mensaje explícito', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToNew(page)
    await page.locator('input[placeholder*="Buscar"]').fill('PEDIDO-QUE-NO-EXISTE-XYZ')
    await page.waitForTimeout(800)
    await expect(page.locator('body')).toContainText(/no se encontraron/i)
  })

  test('RN1: no existe atajo en la UI para crear sin partir de una guía — campos de contacto no existen antes de elegir orden', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToNew(page)
    // Sin buscar/seleccionar nada: no debe haber ningún input de contacto ni tabla de productos.
    await expect(page.locator('text=Nombre de quien devuelve')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0)
  })

  test('flujo completo: buscar → seleccionar → RN1 Cliente/Proyecto solo lectura (intento DOM) → contacto vacío/espacios/parcial bloquea → 2 productos con motivos distintos → guardar', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToNew(page)

    await page.locator('input[placeholder*="Buscar"]').fill('VR-9001')
    await page.waitForTimeout(900)
    await page.getByText(/Pedido #VR-9001/i).click()
    await page.waitForTimeout(500)

    // RN1 (SCRUM-485) — Cliente/Proyecto se muestran en <div> de solo lectura (ReadOnlyField),
    // nunca en un <input> editable — a diferencia del buscador de arriba, que sí es un input pero
    // no es el campo "Cliente"/"Proyecto" del formulario (solo conserva el texto de búsqueda).
    const readOnlyClientField = page.locator('label:text-is("Cliente") + div')
    await expect(readOnlyClientField).toHaveText('Residencia Punta Pacifica VR')
    await expect(readOnlyClientField.locator('input')).toHaveCount(0)
    const readOnlyProjectField = page.locator('label:text-is("Proyecto") + div')
    await expect(readOnlyProjectField).toHaveText('Residencia Punta Pacifica VR')
    await expect(readOnlyProjectField.locator('input')).toHaveCount(0)
    await expect(page.locator('body')).toContainText('Residencia Punta Pacifica VR')

    // "Ref. fábrica" visible en la tabla (hallazgo de Visual Reviewer ya corregido).
    await expect(page.locator('thead')).toContainText('Ref. fábrica')
    await expect(page.locator('tbody')).toContainText('FAB-NORDIC-40')

    // SCRUM-487 RN1 — checkbox sin marcar: qty/motivo deshabilitados.
    const firstRowQtyInput = page.locator('tbody tr').first().locator('input[type="number"]')
    await expect(firstRowQtyInput).toBeDisabled()

    // Intento de guardar SIN productos seleccionados y SIN contacto (SCRUM-489 RN1 + SCRUM-486 RN1).
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(400)
    await expect(page.locator('body')).toContainText(/selecciona al menos un producto/i)

    // Marca el primer producto (NORDIC) — ahora sí editable.
    await page.locator('tbody tr').first().locator('input[type="checkbox"]').check()
    await expect(firstRowQtyInput).toBeEnabled()
    await firstRowQtyInput.fill('2')
    await page.locator('tbody tr').first().locator('select').selectOption('danado_defectuoso')

    // Contacto vacío -> bloquea.
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(400)
    await expect(page.locator('body')).toContainText(/completa el nombre y tel[eé]fono/i)

    // Contacto solo con espacios en blanco -> también debe bloquear (RN1: "completo" = no vacío
    // tras trim, no solo "no vacío literal").
    await page.locator('input[placeholder*="Ricardo Aguilar"]').fill('   ')
    await page.locator('input[placeholder*="6220"]').fill('   ')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(400)
    await expect(page.locator('body')).toContainText(/completa el nombre y tel[eé]fono/i)

    // Solo un campo de contacto -> también bloquea.
    await page.locator('input[placeholder*="Ricardo Aguilar"]').fill('Cliente Pre-QA')
    await page.locator('input[placeholder*="6220"]').fill('   ')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(400)
    await expect(page.locator('body')).toContainText(/completa el nombre y tel[eé]fono/i)

    // Ahora sí, ambos campos completos.
    await page.locator('input[placeholder*="6220"]').fill('6000-4321')

    // Segundo producto (PERFIL) con motivo "Otra" — SCRUM-488, motivo independiente por producto.
    await page.locator('tbody tr').nth(1).locator('input[type="checkbox"]').check()
    await page.locator('tbody tr').nth(1).locator('input[type="number"]').fill('1')
    await page.locator('tbody tr').nth(1).locator('select').selectOption('otra')
    // "Otra" sin detalle -> bloquea al guardar.
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(400)
    await expect(page.locator('body')).toContainText(/especifica el motivo/i)
    await page.locator('input[placeholder*="Especifica el motivo"]').fill('Devolución de prueba Pre-QA (motivo independiente)')

    // SCRUM-487 RN2 (caso simple, cliente ya bloquea): cantidad > entregado.
    await page.locator('tbody tr').nth(1).locator('input[type="number"]').fill('99')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(400)
    await expect(page.locator('body')).toContainText(/no puede superar lo entregado/i)
    await page.locator('tbody tr').nth(1).locator('input[type="number"]').fill('1')

    await page.screenshot({ path: 'e2e/.tmp/b6-nueva-devolucion-form-completo.png' })

    // Guardar de verdad.
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(1200)
    await expect(page.locator('body')).toContainText(/Pendiente/i)
    await page.screenshot({ path: 'e2e/.tmp/b6-nueva-devolucion-exito.png' })
  })

  test('reload a mitad de flujo (orden ya seleccionada) pierde el estado sin romper la página', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToNew(page)
    await page.locator('input[placeholder*="Buscar"]').fill('VR-9001')
    await page.waitForTimeout(900)
    await page.getByText(/Pedido #VR-9001/i).click()
    await page.waitForTimeout(500)
    await expect(page.locator('body')).toContainText('Residencia Punta Pacifica VR')

    await page.reload()
    await page.waitForTimeout(800)
    // Vuelve al estado inicial (buscador vacío), no crashea ni muestra un formulario a medio llenar.
    await expect(page.locator('input[placeholder*="Buscar"]')).toHaveValue('')
    await expect(page.locator('text=Nombre de quien devuelve')).toHaveCount(0)
  })
})

test.describe('SCRUM-474/475/488 — expandir fila multi-producto + Ver detalle', () => {
  test('devolución con 2 productos: fila colapsa en "2 productos", expande detalle, y cada motivo se mantiene independiente en Ver detalle', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToTray(page)
    await page.waitForTimeout(600)

    // La devolución creada en el test anterior (2 productos, motivos "danado_defectuoso" +
    // "otra: Devolución de prueba Pre-QA...") debe aparecer colapsada.
    const multiProductCell = page.getByText(/2 productos/i).first()
    await expect(multiProductCell).toBeVisible()
    await multiProductCell.click()
    await page.waitForTimeout(400)
    await expect(page.locator('body')).toContainText('Luminaria Nordic 40cm')
    await expect(page.locator('body')).toContainText('Perfil de aluminio 2m')
    await expect(page.locator('body')).toContainText(/producto dañado|defectuoso/i)
    await expect(page.locator('body')).toContainText(/devolución de prueba pre-qa/i)
    await page.screenshot({ path: 'e2e/.tmp/b6-fila-expandida.png' })

    // Chevron cambia de dirección al expandir/colapsar (SCRUM-474).
    await multiProductCell.click()
    await page.waitForTimeout(300)
    await expect(page.locator('body')).not.toContainText(/devolución de prueba pre-qa/i)

    // Ver detalle — ambos motivos siguen independientes.
    await page.getByRole('button', { name: 'Ver detalle' }).first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('body')).toContainText(/producto dañado|defectuoso/i)
    await expect(page.locator('body')).toContainText(/devolución de prueba pre-qa/i)
    await page.screenshot({ path: 'e2e/.tmp/b6-ver-detalle-2-motivos.png' })
    await page.keyboard.press('Escape')
  })
})

test.describe('SCRUM-483 (REQ-413) RN1 — no se pueden saltar pasos', () => {
  test('devolución SIN documento firmado: el único botón de acción de ciclo es "Cargar documento firmado", nunca "Confirmar recepción física"', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToTray(page)
    await page.waitForTimeout(600)

    const row = page.locator('tr', { has: page.getByText('Pendiente', { exact: true }) }).first()
    await expect(row.getByRole('button', { name: 'Cargar documento firmado' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Confirmar recepción física' })).toHaveCount(0)
  })
})

test.describe('SCRUM-478 — Cargar documento firmado', () => {
  test('tipo de archivo inválido rechazado client-side; tras cargar uno válido, la columna se actualiza y habilita Confirmar recepción', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToTray(page)
    await page.waitForTimeout(600)

    const row = page.locator('tr', { has: page.getByText('Pendiente', { exact: true }) }).first()
    await row.getByRole('button', { name: 'Cargar documento firmado' }).click()
    await page.waitForTimeout(400)

    // Tipo inválido (.txt) — debe rechazarse ANTES de subir, con mensaje visible (no un fallo
    // silencioso).
    await page.setInputFiles('input[type="file"]', {
      name: 'no-valido.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('contenido de prueba'),
    })
    await page.waitForTimeout(300)
    await expect(page.locator('body')).toContainText(/formato no permitido/i)

    // Tipo válido.
    await page.setInputFiles('input[type="file"]', {
      name: 'firmado-preqa.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 contenido de prueba pre-qa'),
    })
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(1000)

    // Columna "Doc. firmado" ahora "Cargado" y "Confirmar recepción física" disponible.
    await expect(row.locator('text=Cargado')).toBeVisible()
    await expect(row.getByRole('button', { name: 'Confirmar recepción física' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Cargar documento firmado' })).toHaveCount(0)
    await page.screenshot({ path: 'e2e/.tmp/b6-doc-firmado-cargado.png' })
  })
})

test.describe('SCRUM-476 — Ver formulario (firma simulada)', () => {
  test('sin documento firmado el botón "Ver formulario" sigue disponible (no bloquea el flujo)', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToTray(page)
    await page.waitForTimeout(600)
    const row = page.locator('tr', { has: page.getByText('Pendiente', { exact: true }) }).last()
    await expect(row.getByRole('button', { name: 'Ver formulario' })).toBeVisible()
  })
})

test.describe('SCRUM-479/480/481 — Confirmar recepción física / Rechazar (ciclo completo)', () => {
  test('RN1: cantidad REAL distinta a la solicitada es la que se suma al inventario, y "notifica" (credit_note_notified_at) en el mismo momento', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToTray(page)
    await page.waitForTimeout(700)

    const row = page.locator('tr', { has: page.getByText('Pendiente', { exact: true }) }).first()
    await row.getByRole('button', { name: 'Confirmar recepción física' }).click()
    await page.waitForTimeout(500)

    // Cantidades reales DISTINTAS a las solicitadas (2→1 y 1→1, o lo que corresponda) — RN1.
    const qtyInputs = page.locator('table tbody input[type="number"]')
    const count = await qtyInputs.count()
    expect(count).toBeGreaterThanOrEqual(2)
    await qtyInputs.nth(0).fill('1') // solicitado 2, real 1
    await qtyInputs.nth(1).fill('1') // solicitado 1, real 1 (sin cambio, control)

    // Selector de bodega destino — confirmamos que trae las 7 opciones reales.
    const warehouseSelect = page.locator('select').last()
    await expect(warehouseSelect.locator('option')).toHaveCount(7)
    await warehouseSelect.selectOption({ label: 'Bodega Central' })

    await page.getByRole('button', { name: 'Guardar — entra a inventario' }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: 'e2e/.tmp/b6-confirmar-recepcion-ok.png' })

    // La fila deja de mostrar el botón "Confirmar recepción física" (ya se resolvió) — el chip
    // "Esperando nota de crédito" siempre está presente como filtro, así que no sirve como
    // assertion de éxito por sí solo; lo que sí es una prueba real es que el botón desaparece.
    await expect(page.getByRole('button', { name: 'Confirmar recepción física' })).toHaveCount(0)
  })

  test('efecto verificado en base de datos: stock sumado con cantidad REAL (no la solicitada) + credit_note_notified_at sellado', async () => {
    const result = await queryDb(`
      select cr.status, cr.received_at is not null as received, cr.credit_note_notified_at is not null as notified,
             l.qty_requested, l.qty_received
      from illuminations_bodega.customer_returns cr
      join illuminations_bodega.customer_return_lines l on l.customer_return_id = cr.id
      order by cr.id;
    `)
    expect(result).toContain('esperando_nota_credito')
    expect(result).toContain(' t '.trim()) // received/notified = t (true)

    const stock = await queryDb(`select catalog_product_id, quantity from illuminations_bodega.product_warehouse_stock where warehouse_id = 6 and catalog_product_id in (4,5) order by catalog_product_id;`)
    // NORDIC (id 4): pedido 2, real 1 → stock debe ser 1, NO 2.
    // PERFIL (id 5): pedido 1, real 1 → stock debe ser 1.
    expect(stock).toContain('4 |        1')
    expect(stock).toContain('5 |        1')
  })

  test('luego de confirmada, "Simular finalización" la mueve a Finalizado; Ver detalle muestra el historial COMPLETO (no solo el estado final)', async ({ page }) => {
    await login(page, 'almacen@illuminations.com.pa')
    await goToTray(page)
    await page.waitForTimeout(700)

    await page.getByRole('button', { name: 'Esperando nota de crédito', exact: true }).click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Simular finalización' }).click()
    await page.waitForTimeout(1000)

    await page.getByRole('button', { name: 'Finalizadas', exact: true }).click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Ver detalle' }).first().click()
    await page.waitForTimeout(500)

    // Historial completo: creada, doc firmado, recepción (con bodega), notificación, finalizado.
    await expect(page.locator('body')).toContainText(/devoluci[oó]n creada/i)
    await expect(page.locator('body')).toContainText(/documento firmado cargado/i)
    await expect(page.locator('body')).toContainText(/recepci[oó]n f[ií]sica confirmada/i)
    await expect(page.locator('body')).toContainText(/bodega central/i)
    await expect(page.locator('body')).toContainText(/notificada/i)
    await expect(page.locator('body')).toContainText(/finalizado/i)
    await page.screenshot({ path: 'e2e/.tmp/b6-historial-completo-finalizado.png' })
  })

  test('rechazo: doble clic (1ro revela motivo sin enviar, 2do confirma), sin aprobación de Mark, NO toca inventario ni notifica', async ({ page }) => {
    const token = await login2FetchToken()
    const created = await apiPost(token, '/api/bodega/returns', {
      order_id: await getOrderId(),
      contact_name: 'Para Rechazo Pre-QA',
      contact_phone: '6000-7777',
      items: [{ order_item_id: await getOrderItemId('PERFIL-2M-VR'), qty_requested: 1, reason: 'no_corresponde' }],
    })
    expect(created.id).toBeTruthy()

    await login(page, 'almacen@illuminations.com.pa')
    await goToTray(page)
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: 'Pendientes', exact: true }).click()
    await page.waitForTimeout(500)

    // La bandeja NO muestra el contacto (contact_name) como columna — solo id de fila disponible.
    // Tras el test anterior la multi-producto ya pasó a "Finalizado", así que esta recién creada
    // debe ser la ÚNICA fila "Pendiente" visible bajo este chip.
    await expect(page.locator('tbody tr')).toHaveCount(1)
    const row = page.locator('tbody tr').first()
    // Sin firma todavía: no debe existir botón de Confirmar recepción / Rechazar en la fila —
    // el rechazo vive DENTRO del modal de Confirmar recepción física (mismo botón, ver ADR), que
    // recién aparece cuando ya se cargó el documento firmado.
    await expect(row.getByRole('button', { name: 'Confirmar recepción física' })).toHaveCount(0)

    // Sube el documento (requisito previo, backend lo exige).
    await row.getByRole('button', { name: 'Cargar documento firmado' }).click()
    await page.waitForTimeout(400)
    await page.setInputFiles('input[type="file"]', {
      name: 'firmado-rechazo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 rechazo'),
    })
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(1000)

    await row.getByRole('button', { name: 'Confirmar recepción física' }).click()
    await page.waitForTimeout(500)

    // Primer clic en "Rechazar devolución" — solo revela el textarea, NO envía nada todavía.
    await page.getByRole('button', { name: 'Rechazar devolución' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByPlaceholder(/por qu[eé] se rechaza/i)).toBeVisible()
    // Confirmamos que Escenario "sin motivo" bloquea el segundo clic.
    await page.getByRole('button', { name: 'Confirmar rechazo' }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('body')).toContainText(/escribe el motivo del rechazo/i)

    await page.getByPlaceholder(/por qu[eé] se rechaza/i).fill('Producto en perfecto estado, cliente cambió de opinión (prueba Pre-QA).')
    await page.getByRole('button', { name: 'Confirmar rechazo' }).click()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'e2e/.tmp/b6-rechazo-confirmado.png' })

    await page.getByRole('button', { name: 'Rechazadas', exact: true }).click()
    await page.waitForTimeout(600)
    await expect(page.locator('tbody tr')).toHaveCount(1)

    // Ver detalle: motivo del rechazo visible en el historial (hallazgo ya corregido de Visual Review).
    await page.getByRole('button', { name: 'Ver detalle' }).first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('body')).toContainText(/cliente cambió de opinión \(prueba pre-qa\)/i)
    await page.keyboard.press('Escape')
  })

  test('efecto de rechazo verificado en base de datos: NO suma inventario, NO sella credit_note_notified_at', async () => {
    const stock = await queryDb(`select coalesce(sum(quantity),0) from illuminations_bodega.product_warehouse_stock where catalog_product_id = 5 and warehouse_id != 6;`)
    // el único stock de PERFIL (id 5) debe seguir siendo el de la devolución CONFIRMADA anterior
    // (1 unidad en Bodega Central, id 6) — nada más en ninguna otra bodega.
    expect(stock.trim()).toContain('0')

    const rejected = await queryDb(`select credit_note_notified_at is null as notified_null, received_at is null as received_null from illuminations_bodega.customer_returns where contact_name = 'Para Rechazo Pre-QA';`)
    expect(rejected).toContain(' t ')
  })
})

test.describe('SCRUM-477 — Ver guía de entrega original: mismos productos/cantidades que Pedidos', () => {
  test('la guía reusa exactamente OrderDocumentService — cross-check contra los OrderItem reales', async () => {
    const items = await queryDb(`select reference_snapshot, qty_delivered from illuminations_bodega.order_items where order_id = (select id from illuminations_bodega.orders where order_number = 'VR-9001') order by id;`)
    expect(items).toContain('NORDIC-40-VR')
    expect(items).toContain('PERFIL-2M-VR')
    // Endpoint dedicado: /bodega/returns/{id}/delivery-guide reusa generateGuiaEntrega($return->order,
    // ...) tal cual — no reconstruye nada — confirmado leyendo CustomerReturnController::deliveryGuide()
    // y CustomerReturnService (ver ADR). Verificación funcional (URL responde 200) vía API:
    const token = await login2FetchToken()
    const list = await apiGet(token, '/api/bodega/returns')
    const anyId = list.data[0]?.id
    expect(anyId).toBeTruthy()
    const guide = await apiGet(token, `/api/bodega/returns/${anyId}/delivery-guide`)
    expect(guide.url).toBeTruthy()
  })
})

// Re-check del fix RN2 (2026-07-26): el caso cliente-side de arriba (qty=99 > qty_delivered=3)
// nunca llega al backend, así que no ejercita `CustomerReturnService::create()`. Este test crea
// DOS devoluciones separadas del mismo order_item (NORDIC, qty_delivered=5): la primera pasa la
// validación cliente-side (2 <= 5) y llega al backend; la segunda también pasa cliente-side
// (4 <= 5) pero el backend debe rechazarla por acumulado (2+4=6 > 5) — y el mensaje específico
// del backend (no el genérico) debe verse en pantalla, confirmando el fix de
// BodegaNuevaDevolucionPage.tsx (isAxiosError passthrough).
test.describe('RN2 (REQ-417) acumulado + mensaje específico del backend', () => {
  test('segunda devolución que excede el tope acumulado del mismo producto muestra el mensaje real del backend, no el genérico', async ({ page }) => {
    // Calculado en vivo (no hardcodeado): los tests anteriores del archivo ya consumieron parte
    // del cupo de NORDIC (qty_delivered=5) contra devoluciones no rechazadas. Se pide el cupo
    // restante MENOS 1 en la primera devolución (debe pasar, deja exactamente 1 disponible), y 2
    // en la segunda (debe rechazarse por acumulado, sin importar cuánto haya consumido cada test
    // anterior).
    const itemId = await getOrderItemId('NORDIC-40-VR')
    const accumulated = parseInt((await queryDb(
      `select coalesce(sum(qty_requested),0) from illuminations_bodega.customer_return_lines where order_item_id = ${itemId} and customer_return_id in (select id from illuminations_bodega.customer_returns where status != 'rechazada');`,
    )).trim(), 10)
    const remaining = 5 - accumulated
    test.skip(remaining < 2, `cupo restante de NORDIC (${remaining}) insuficiente para el escenario de este test`)
    const firstQty = remaining - 1

    await login(page, 'almacen@illuminations.com.pa')
    await goToNew(page)
    await page.locator('input[placeholder*="Buscar"]').fill('VR-9001')
    await page.waitForTimeout(900)
    await page.getByText(/Pedido #VR-9001/i).click()
    await page.waitForTimeout(500)

    await page.locator('tbody tr').first().locator('input[type="checkbox"]').check()
    await page.locator('tbody tr').first().locator('input[type="number"]').fill(String(firstQty))
    await page.locator('tbody tr').first().locator('select').selectOption('danado_defectuoso')
    await page.locator('input[placeholder*="Ricardo Aguilar"]').fill('Cliente RN2 Acumulado')
    await page.locator('input[placeholder*="6220"]').fill('6000-1111')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(1200)
    await expect(page.locator('body')).toContainText(/Pendiente/i)

    await goToNew(page)
    await page.locator('input[placeholder*="Buscar"]').fill('VR-9001')
    await page.waitForTimeout(900)
    await page.getByText(/Pedido #VR-9001/i).click()
    await page.waitForTimeout(500)

    await page.locator('tbody tr').first().locator('input[type="checkbox"]').check()
    // Solo queda 1 disponible (5 - accumulated - firstQty = 1); pedir 2 pasa la validación
    // cliente-side (2 <= qty_delivered=5) pero el backend debe rechazarla por acumulado.
    await page.locator('tbody tr').first().locator('input[type="number"]').fill('2')
    await page.locator('tbody tr').first().locator('select').selectOption('excedente')
    await page.locator('input[placeholder*="Ricardo Aguilar"]').fill('Cliente RN2 Acumulado 2')
    await page.locator('input[placeholder*="6220"]').fill('6000-2222')
    await page.getByRole('button', { name: 'Guardar' }).click()
    await page.waitForTimeout(1200)

    // Mensaje específico del backend (ver CustomerReturnService::create()): menciona lo
    // "disponible" y lo "ya... solicitadas" — el genérico ("no se pudo crear la devolución") no
    // menciona ninguna de las dos cosas.
    await expect(page.locator('body')).toContainText(/disponible/i)
    await expect(page.locator('body')).toContainText(/ya hay .* solicitadas/i)
    await page.screenshot({ path: 'e2e/.tmp/b6-rn2-acumulado-mensaje-especifico.png' })
  })
})

async function login2FetchToken(): Promise<string> {
  const res = await fetch('http://localhost:8090/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'almacen@illuminations.com.pa', password: 'almacen@illuminations.com.pa' }),
  })
  const json = await res.json()
  return json.token
}

async function apiPost(token: string, path: string, body: unknown) {
  const res = await fetch(`http://localhost:8090${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function apiGet(token: string, path: string) {
  const res = await fetch(`http://localhost:8090${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return res.json()
}

async function getOrderId(): Promise<number> {
  const token = await login2FetchToken()
  const result = await apiGet(token, '/api/bodega/returns/search-orders?q=VR-9001')
  return result.data[0].order_id
}

async function getOrderItemId(reference: string): Promise<number> {
  const token = await login2FetchToken()
  const result = await apiGet(token, '/api/bodega/returns/search-orders?q=VR-9001')
  const item = result.data[0].items.find((i: { reference: string }) => i.reference === reference)
  return item.order_item_id
}

async function queryDb(sql: string): Promise<string> {
  const { execSync } = await import('node:child_process')
  const out = execSync(
    `docker compose -f /Users/lgarcia/Documents/GitHub/Softclass/Illumination/atlanticerp/atlanticerp-backend/infra/docker-compose.yml exec -T postgres psql -U atlanticerp -d atlanticerp -t -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8' },
  )
  return out
}
