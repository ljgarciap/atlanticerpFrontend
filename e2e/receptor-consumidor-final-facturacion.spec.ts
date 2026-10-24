import { test, expect, type Page, type Route } from '@playwright/test'

// SCRUM-1140 — spec PERMANENTE del receptor al facturar: documento que no valida -> "Facturar como consumidor final",
// y razón social distinta a la de la DGI (no bloquea, viaja la de la DGI). Regla del proyecto: un flujo de estado/permiso que
// ya se rompió una vez no se descarta.
//
// Autosembrado y sin dependencias de datos ni de la DGI: se responden con datos sintéticos (page.route) la cartera, la vista
// previa y el guardado de Facturación; el login, el JWT y los permisos son los REALES del entorno. Nunca se crea una factura
// ni se consulta a la DGI/MSL, y no se toca ninguna fila de negocio.
//
// Cuentas (roster real, contraseña = su email): Felix tiene `receptor_fiscal` y `receptor_consumidor_final`; la asistente no.
// BASE explícito: PREQA_BASE_URL (default localhost). Se niega a correr contra producción.

const BASE = process.env.PREQA_BASE_URL ?? 'http://localhost:5173'
const CON_PERMISO = process.env.E2E_RECEPTOR_CON_PERMISO ?? 'contabilidad@test.com'
const SIN_PERMISO = process.env.E2E_RECEPTOR_SIN_PERMISO ?? 'asistenteadministrativa@test.com'
const passwordOf = (email: string) => process.env.E2E_RECEPTOR_PASSWORD ?? email

const ORDER_ID = 987001
const SUB_CLIENT_ID = 987002
const CLIENTE = 'Cliente Sintetico SCRUM1140'
const PROYECTO = 'Proyecto Sintetico SCRUM1140'

test.use({ baseURL: BASE })

test.beforeAll(() => {
  const host = new URL(BASE).hostname
  if (!['localhost', '127.0.0.1', 'dev.atlanticerp.ai', 'test.atlanticerp.ai'].includes(host)) {
    throw new Error(`receptor-consumidor-final-facturacion solo corre contra local, dev o test (BASE=${BASE})`)
  }
})

const entrega = { sequence_in_family: null, total_in_family: null, stage: 'por_despachar', order_type: 'pedido' }
const filaPendiente = {
  order_id: ORDER_ID, order_number: 'PED-SINT-1140', sales_project_id: 1, proyecto: PROYECTO, master_client_id: 1, cliente: CLIENTE,
  cotizacion_folio: 'COT-SINT-1140', monto: 321, entregas_del_pedido: [{ order_id: ORDER_ID, ...entrega, facturable: true, factura_numero: null, factura_tipo: null, factura_anulada: false, cubierta_por_completo: false }],
  entrega, estado: 'pendiente-facturar', numero_factura: null, invoice_id: null, tipo_factura: null, es_incobrable: false, incobrable_pendiente: false,
  pedido_id: ORDER_ID, es_entrega_unica: true, facturacion_por_entrega: false, monto_total_pedido: 321, facturado_pedido: 0, restante: 321,
  puede_facturar_completo: true, motivo_completo_no_disponible: null, puede_facturar_entrega: false, motivo_entrega_no_disponible: 'Pedido de entrega única',
}

type Receptor = Record<string, unknown>
const receptorBase: Receptor = {
  sub_client_id: SUB_CLIENT_ID, ruc: '1689571-1-684168', dv: '99', nombre: 'Constructora Local SA', nombre_dgi: null, dv_dgi: null,
  codigo_dgi: null, edicion_bloqueada: false, corregible: true, actualizable: false,
}
const receptorBloqueado: Receptor = { ...receptorBase, estado: 'dv_distinto', bloquea: true, mensaje: 'El DV registrado (99) no coincide; la DGI indica DV 33.', nombre_dgi: 'CONSTRUCTORA GRUPO V, SA', dv_dgi: '33' }
const receptorNombreDistinto: Receptor = {
  ...receptorBase, estado: 'nombre_distinto', bloquea: false, dv: '33', nombre: 'Digifact Servicios SA', nombre_dgi: 'DIGIFACT SERVICIOS, SOCIEDAD ANÓNIMA', dv_dgi: '33', actualizable: true, corregible: false,
  mensaje: 'La razón social no coincide con la de la DGI: "DIGIFACT SERVICIOS, SOCIEDAD ANÓNIMA". Se enviará la de la DGI en la factura.',
}

function previewDe(receptor: Receptor) {
  return {
    results: [{
      order_id: ORDER_ID, ok: true, order_number: 'PED-SINT-1140', cotizacion_folio: 'COT-SINT-1140', cliente: CLIENTE, monto: 321, modo: 'completo', tipo: 'completo',
      cierra_pedido: true, restante_despues: 0, advertencias: [], entregas_del_pedido: filaPendiente.entregas_del_pedido,
      subtotal: 300, descuentos: 0, itbms: 21, total: 321,
      items: [{ descripcion: 'Panel LED sintetico', referencia_publica: 'REF-SINT', cantidad: 3, precio_unitario: 100, subtotal: 300 }],
      receptor_validacion: receptor,
    }],
  }
}

/** Responde con datos sintéticos la cartera, la vista previa y el guardado; devuelve los cuerpos de los guardados. */
async function stubFacturacion(page: Page, receptor: Receptor): Promise<Record<string, unknown>[]> {
  const guardados: Record<string, unknown>[] = []
  await page.route(url => url.pathname === '/api/admin-contab/invoices', async (route: Route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      return route.fulfill({ json: { rows: [filaPendiente], total_en_tab: 1, meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } } })
    }
    if (req.method() === 'POST') {
      guardados.push(req.postDataJSON() as Record<string, unknown>)
      return route.fulfill({ status: 201, json: { invoices: [{ numero: 'F-SINT', order_id: ORDER_ID }], errors: [] } })
    }
    return route.continue()
  })
  await page.route(url => url.pathname === '/api/admin-contab/invoices/preview', route => route.fulfill({ json: previewDe(receptor) }))
  return guardados
}

async function login(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('atlanticerp_lang', 'es') })
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(passwordOf(email))
  await page.getByRole('button', { name: /iniciar sesión|login|sign in/i }).click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20000 })
}

async function abrirVistaPrevia(page: Page) {
  await page.goto('/admin-contab/facturacion')
  await page.getByRole('button', { name: /crear factura|create invoice/i }).click()
  const modal = page.locator('div.fixed').last()
  await modal.locator('select').first().selectOption({ label: CLIENTE })
  await modal.locator('select').nth(1).selectOption({ label: PROYECTO })
  await modal.locator('input[type="checkbox"]').first().check()
  await modal.getByRole('button', { name: /ver vista previa|preview/i }).click()
}

const guardar = (page: Page) => page.locator('div.fixed').last().getByRole('button', { name: /guardar factura|save invoice/i })
const botonConsumidorFinal = (page: Page) => page.locator('div.fixed').last().getByRole('button', { name: /facturar como consumidor final|invoice as final consumer/i })

test('documento que no valida: bloquea, y "Facturar como consumidor final" lo resuelve solo para esa factura', async ({ page }) => {
  const guardados = await stubFacturacion(page, receptorBloqueado)
  await login(page, CON_PERMISO)
  await abrirVistaPrevia(page)

  await expect(page.getByTestId('receptor-guard')).toContainText(/DV/)
  await expect(guardar(page)).toBeDisabled()
  await guardar(page).click({ force: true }).catch(() => {})
  expect(guardados).toHaveLength(0)

  await expect(botonConsumidorFinal(page)).toBeVisible()
  await botonConsumidorFinal(page).click()
  await expect(page.getByTestId('receptor-consumidor-final')).toBeVisible()
  await expect(guardar(page)).toBeEnabled()

  // Quitar la decisión vuelve a bloquear.
  await page.getByTestId('receptor-consumidor-final').getByRole('button').click()
  await expect(guardar(page)).toBeDisabled()

  await botonConsumidorFinal(page).click()
  await guardar(page).click()
  await expect.poll(() => guardados.length).toBe(1)
  expect(guardados[0]).toMatchObject({ order_ids: [ORDER_ID], consumidor_final_order_ids: [ORDER_ID] })
})

test('razón social distinta a la de la DGI: no bloquea, muestra ambas y ofrece consumidor final sin imponerlo', async ({ page }) => {
  const guardados = await stubFacturacion(page, receptorNombreDistinto)
  await login(page, CON_PERMISO)
  await abrirVistaPrevia(page)

  const nombres = page.getByTestId('receptor-nombres')
  await expect(nombres).toContainText('Digifact Servicios SA')
  await expect(nombres).toContainText('DIGIFACT SERVICIOS, SOCIEDAD ANÓNIMA')
  await expect(page.getByTestId('receptor-guard').getByRole('button', { name: /actualizar cliente|update the customer/i })).toBeVisible()
  await expect(botonConsumidorFinal(page)).toBeVisible() // H2 del Pre-QA: disponible en cualquier estado, nunca por defecto
  await expect(guardar(page)).toBeEnabled()

  await guardar(page).click()
  await expect.poll(() => guardados.length).toBe(1)
  expect(guardados[0]).toMatchObject({ order_ids: [ORDER_ID] })
  expect(guardados[0]).not.toHaveProperty('consumidor_final_order_ids')
})

test('sin el permiso de consumidor final: ni botón ni formulario, y no puede guardar', async ({ page }) => {
  const guardados = await stubFacturacion(page, receptorBloqueado)
  await login(page, SIN_PERMISO)
  await abrirVistaPrevia(page)

  await expect(page.getByTestId('receptor-guard')).toBeVisible()
  await expect(botonConsumidorFinal(page)).toHaveCount(0)
  await expect(page.getByTestId('receptor-guard').locator('input')).toHaveCount(0)
  await expect(guardar(page)).toBeDisabled()
  expect(guardados).toHaveLength(0)
})
