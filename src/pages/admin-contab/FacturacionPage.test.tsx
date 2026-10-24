import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import FacturacionPage from './FacturacionPage'
import { adminContabApi } from '@/api/adminContabApi'
import { useAuthStore } from '@/store/authStore'
import type {
  InvoiceEntry, InvoiceSummary, InvoiceListResult, InvoiceListFilters, InvoicePreviewResponse, InvoiceDetail,
  InvoiceAgingResult,
} from '@/types/adminContab'

// Batch 2 del cuerpo principal de Admin&Cont (SCRUM-513→518, REQ-436→441). Cubre: 4 tarjetas de
// indicadores no afectadas por filtros/tabs (RN4 REQ-437), tab por defecto "cobrable" (RN3
// REQ-438), toggle agrupado/plano por defecto agrupado (RN1 REQ-439), clic en cliente NO
// expande/colapsa el grupo (RN1 REQ-440), botón "Generar factura" solo cuando `estado` es
// pendiente-facturar (ver nota de reconciliación en types/adminContab.ts — modelo Order-based, no
// el de "hitos" del mockup), vista previa + confirmar (REQ-441), y el mensaje de validación cuando
// falta información (RN2 REQ-441).
//
// Batch 3 (SCRUM-519→523, REQ-442→446) agrega: saldo a favor en la vista previa (REQ-442,
// Escenarios 1/2/3), botón "Editar" desde el flujo "+ Crear Factura" (REQ-443), entregas marcadas
// por defecto + mensaje inline (no alert()) al no seleccionar ninguna (RN2/RN5 REQ-444), el
// selector de cliente/proyecto del wizard independiente de los filtros de la tabla (RN1 REQ-444,
// bug real corregido en este batch), y el contador "Mostrando X de Y" usando `total_en_tab` (RN4
// REQ-445).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    invoices: {
      summary: vi.fn(), list: vi.fn(), sellers: vi.fn(), preview: vi.fn(), create: vi.fn(), export: vi.fn(),
      detail: vi.fn(), markUncollectible: vi.fn(), decideUncollectible: vi.fn(), aging: vi.fn(), downloadPdf: vi.fn(),
      fePreview: vi.fn(), correctReceptor: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeSummary(): InvoiceSummary {
  return { pendientes_entrega: 2, pendientes_facturar: 1, facturadas_mes: 4, monto_facturado_mes: 28910 }
}

/**
 * SCRUM-929 (B4) — fábrica con defaults razonables para TODOS los campos nuevos del contrato
 * (pedido/entrega, ver ADR §4.3): por defecto simula un pedido de ENTREGA ÚNICA (el caso más común,
 * sin cambios de comportamiento) — `pedido_id = order_id`, `facturacion_por_entrega: false`,
 * `invoice_id`/`tipo_factura: null`. Los tests de facturación por entrega pasan overrides explícitos.
 */
function makeEntry(overrides: Partial<InvoiceEntry> = {}): InvoiceEntry {
  const orderId = overrides.order_id ?? 999
  const monto = overrides.monto ?? 1000
  const estado = overrides.estado ?? 'pendiente-facturar'
  return {
    order_id: orderId,
    order_number: `PED-${orderId}`,
    master_client_id: 1,
    cliente: 'Cliente',
    sales_project_id: 1,
    proyecto: 'Proyecto',
    cotizacion_folio: null,
    monto,
    estado,
    numero_factura: null,
    invoice_id: null,
    tipo_factura: null,
    es_incobrable: false,
    incobrable_pendiente: false,
    pedido_id: orderId,
    es_entrega_unica: true,
    facturacion_por_entrega: false,
    monto_total_pedido: monto,
    facturado_pedido: estado === 'facturada' ? monto : 0,
    restante: estado === 'pendiente-facturar' ? monto : 0,
    puede_facturar_completo: false,
    motivo_completo_no_disponible: null,
    puede_facturar_entrega: false,
    motivo_entrega_no_disponible: null,
    ...overrides,
  }
}

function makeEntries(): InvoiceEntry[] {
  return [
    makeEntry({
      order_id: 101, order_number: 'PED-2026-000101', master_client_id: 5, cliente: 'Grupo Sensei',
      sales_project_id: 20, proyecto: 'Restaurante Sensei', cotizacion_folio: 'COT-1180-R2',
      monto: 5650, estado: 'pendiente-facturar',
    }),
    makeEntry({
      order_id: 102, order_number: 'PED-2026-000102', master_client_id: 5, cliente: 'Grupo Sensei',
      sales_project_id: 20, proyecto: 'Restaurante Sensei', cotizacion_folio: 'COT-1180',
      monto: 12250, estado: 'facturada', numero_factura: 'F-2201', tipo_factura: 'completo',
    }),
  ]
}

function makeListResult(rows: InvoiceEntry[], totalEnTab?: number): InvoiceListResult {
  return { rows, total_en_tab: totalEnTab ?? rows.length }
}

/** Simula el backend real para el fix de RN1 REQ-444: el wizard "+ Crear Factura" pide su propia
 *  lista SIN los filtros de la tabla principal (solo tab+view) — este mock aplica los filtros que
 *  de verdad llegan en cada llamada, para poder distinguir "la tabla ve poco" de "el wizard ve todo". */
function installFilteringListMock(all: InvoiceEntry[]) {
  mockedApi.invoices.list.mockImplementation(async (filters: InvoiceListFilters) => {
    let rows = all.filter(e => (filters.estado ? e.estado === filters.estado : true))
    if (filters.cliente) rows = rows.filter(e => e.cliente.toLowerCase().includes(filters.cliente!.toLowerCase()))
    if (filters.proyecto) rows = rows.filter(e => (e.proyecto ?? '').toLowerCase().includes(filters.proyecto!.toLowerCase()))
    if (filters.search) {
      const needle = filters.search.toLowerCase()
      rows = rows.filter(e => `${e.cliente} ${e.proyecto} ${e.order_number}`.toLowerCase().includes(needle))
    }
    return makeListResult(rows, all.length)
  })
}

/** "Restaurante Sensei" también aparece como <option> del filtro de proyecto — desambigua al encabezado real del grupo. */
function findGroupHeader(name = 'Restaurante Sensei'): HTMLElement {
  return screen.getAllByText(name).find(el => el.tagName !== 'OPTION')!
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FacturacionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Batch 4 (SCRUM-524→528, REQ-447→451) — payload por defecto de `GET .../detail`, ajustable por
 *  overrides para cada escenario (cobrabilidad, anulada, registrar cobro). */
function makeDetail(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    order_id: 101, order_number: 'PED-2026-000101', cliente: 'Grupo Sensei', master_client_id: 5,
    monto: 5650, saldo_aplicado: 0, total_a_pagar: 5650,
    cotizacion_folio: 'COT-1180-R2', fecha_cotizacion: '2026-05-01',
    numero_factura: null, fecha_factura: null,
    estado: 'pendiente-facturar', es_anulada: false,
    guia_entrega: { existe: false, fecha: null },
    cobrabilidad: 'normal', motivo_incobrable: null,
    puede_marcar_incobrable: true,
    puede_registrar_cobro: false,
    cuenta_pago: null, responsable: null,
    fe_estado: null, cufe: null, qr_content: null, pac_provider_usado: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.invoices.summary.mockResolvedValue(makeSummary())
  mockedApi.invoices.list.mockResolvedValue(makeListResult(makeEntries()))
  mockedApi.invoices.aging.mockResolvedValue({ ranges: [] })
})

describe('FacturacionPage', () => {
  it('muestra las 4 tarjetas de indicadores desde el summary, sin depender de filtros (RN4 REQ-437)', async () => {
    renderPage()
    expect(await screen.findByText('2')).toBeInTheDocument() // pendientes_entrega
    expect(screen.getByText('1')).toBeInTheDocument() // pendientes_facturar
    expect(screen.getByText('4')).toBeInTheDocument() // facturadas_mes
    // formato de moneda tolerante al locale ICU del entorno de test (Node vs navegador real)
    expect(screen.getByText(/28,910\.00/)).toBeInTheDocument()
  })

  it('la pestaña activa por defecto es "cobrable" (RN3 REQ-438) y siempre pide vista plana al backend', async () => {
    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    expect(mockedApi.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ tab: 'cobrable', view: 'plana' }))
  })

  it('la vista por defecto es "Agrupado por proyecto" (RN1 REQ-439) y agrupa por sales_project_id', async () => {
    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    // en agrupado, la entrega no se ve hasta expandir el grupo
    expect(screen.queryByText('PED-2026-000101')).not.toBeInTheDocument()
    fireEvent.click(findGroupHeader())
    expect(await screen.findByText('PED-2026-000101')).toBeInTheDocument()
  })

  it('clic en el nombre del cliente abre Estado de Cuenta y NO expande/colapsa el grupo (RN1 REQ-440)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(screen.getByTitle('adminContab:facturacion.clienteClickHint'))

    expect(openSpy).toHaveBeenCalledWith('/admin-contab/facturacion/estado-cuenta?master_client_id=5', '_blank')
    // el grupo sigue colapsado — la entrega no aparece
    expect(screen.queryByText('PED-2026-000101')).not.toBeInTheDocument()
    openSpy.mockRestore()
  })

  it('sin cliente vinculado (master_client_id null) el nombre no es clicable — nunca abre Estado de Cuenta con id nulo (rebote QA SCRUM-517)', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    mockedApi.invoices.list.mockResolvedValue(makeListResult([
      makeEntry({
        order_id: 201, order_number: 'PED-2026-000201', master_client_id: null, cliente: 'Cliente sin proyecto vinculado',
        sales_project_id: 30, proyecto: 'Obra sin card', cotizacion_folio: null,
        monto: 900, estado: 'pendiente-facturar',
      }),
    ]))
    renderPage()
    await screen.findAllByText('Obra sin card')

    expect(screen.queryByTitle('adminContab:facturacion.clienteClickHint')).not.toBeInTheDocument()
    // "Cliente sin proyecto vinculado" también aparece como <option> del filtro de cliente —
    // desambigua al nombre real renderizado en el encabezado del grupo (mismo patrón que findGroupHeader)
    expect(screen.getAllByText('Cliente sin proyecto vinculado').some(el => el.tagName !== 'OPTION')).toBe(true)
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('"Generar factura" solo aparece cuando estado es pendiente-facturar (REQ-441)', async () => {
    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())

    await screen.findByText('PED-2026-000101')
    expect(screen.getByText('adminContab:facturacion.generarFactura')).toBeInTheDocument()
    // la entrega ya facturada (order_id=102) no ofrece el botón
    expect(screen.queryAllByText('adminContab:facturacion.generarFactura')).toHaveLength(1)
  })

  it('flujo completo: vista previa y confirmar guarda la factura (RN3/RN4 REQ-441)', async () => {
    const preview: InvoicePreviewResponse = {
      results: [{ order_id: 101, ok: true, order_number: 'PED-2026-000101', cotizacion_folio: 'COT-1180-R2', monto: 5650, total: 5650 }],
    }
    mockedApi.invoices.preview.mockResolvedValue(preview)
    mockedApi.invoices.create.mockResolvedValue({ invoices: [{ order_id: 101, numero: 'F-2300' }], errors: [] })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    await waitFor(() => expect(mockedApi.invoices.preview).toHaveBeenCalledWith([101], undefined))
    expect((await screen.findAllByText(/5,650\.00/)).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('adminContab:facturacion.preview.guardar'))
    await waitFor(() => expect(mockedApi.invoices.create).toHaveBeenCalledWith({ order_ids: [101] }))
  })

  it('SCRUM-876: un pedido que solo admite "pedido completo" (sin vínculo a cotización) sigue siendo una sola fila con el aviso de entregas', async () => {
    const filas: InvoiceEntry[] = [
      makeEntry({
        order_id: 101, order_number: 'PED-2026-000101', master_client_id: 5, cliente: 'Grupo Sensei',
        sales_project_id: 20, proyecto: 'Restaurante Sensei', cotizacion_folio: 'COT-1180-R2',
        monto: 5650, estado: 'pendiente-facturar', facturacion_por_entrega: false,
        entregas_del_pedido: [
          { order_id: 101, sequence_in_family: 1, total_in_family: 3, stage: 'por_despachar' },
          { order_id: 102, sequence_in_family: 2, total_in_family: 3, stage: 'por_despachar' },
          { order_id: 103, sequence_in_family: 3, total_in_family: 3, stage: 'en_picking' },
        ],
      }),
    ]
    installFilteringListMock(filas)
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{ order_id: 101, ok: true, order_number: 'PED-2026-000101', monto: 5650, total: 5650, tipo: 'completo' }],
    })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())

    // Una sola fila para el pedido + la línea informativa de avance de Bodega.
    expect(await screen.findAllByText('PED-2026-000101')).toHaveLength(1)
    expect(screen.getByText(/facturacion\.entregasParciales.*"count":3/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('adminContab:facturacion.generarFactura'))
    await waitFor(() => expect(mockedApi.invoices.preview).toHaveBeenCalledWith([101], undefined))
  })

  it('SCRUM-929: un pedido facturado por entrega muestra una fila por entrega/factura, botones por entrega y "Facturar pedido completo" una sola vez', async () => {
    const base = {
      order_number: 'PED-2026-500008', sales_project_id: 20, proyecto: 'Restaurante Sensei', cliente: 'Grupo Sensei',
      master_client_id: 5, cotizacion_folio: 'COT-1180-R2', pedido_id: 4, es_entrega_unica: false,
      facturacion_por_entrega: true, monto_total_pedido: 963, restante: 642,
      puede_facturar_completo: true, motivo_completo_no_disponible: null,
    }
    const filas: InvoiceEntry[] = [
      makeEntry({
        ...base, order_id: 4, monto: 321, estado: 'pendiente-facturar', facturado_pedido: 321,
        entrega: { sequence_in_family: 1, total_in_family: 3, stage: 'por_despachar', order_type: 'pedido' },
        puede_facturar_entrega: true,
      }),
      makeEntry({
        ...base, order_id: 5, monto: 321, estado: 'facturada', numero_factura: 'F-0002', invoice_id: 55, tipo_factura: 'parcial', facturado_pedido: 321,
        entrega: { sequence_in_family: 2, total_in_family: 3, stage: 'por_despachar', order_type: 'pedido' },
      }),
      makeEntry({
        ...base, order_id: 6, monto: 321, estado: 'pendiente-facturar', facturado_pedido: 321,
        entrega: { sequence_in_family: 3, total_in_family: 3, stage: 'por_despachar', order_type: 'pedido' },
        puede_facturar_entrega: true,
      }),
    ]
    installFilteringListMock(filas)
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{ order_id: 4, ok: true, order_number: 'PED-2026-500008', monto: 321, total: 321, tipo: 'parcial', modo: 'entrega' }],
    })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())

    expect(await screen.findAllByText('PED-2026-500008')).toHaveLength(3)
    expect(screen.getByText(/entregaSecuencia.*"seq":1.*"total":3/)).toBeInTheDocument()
    expect(screen.getByText(/entregaSecuencia.*"seq":2.*"total":3/)).toBeInTheDocument()
    expect(screen.getByText(/entregaSecuencia.*"seq":3.*"total":3/)).toBeInTheDocument()
    expect(screen.getByText('F-0002')).toBeInTheDocument()

    // Botón por entrega (2 pendientes) + "Facturar pedido completo" UNA sola vez (no 3).
    expect(screen.getAllByText('adminContab:facturacion.generarFacturaEntrega')).toHaveLength(2)
    expect(screen.getAllByText('adminContab:facturacion.facturarCompleto.boton')).toHaveLength(1)

    fireEvent.click(screen.getAllByText('adminContab:facturacion.generarFacturaEntrega')[0])
    await waitFor(() => expect(mockedApi.invoices.preview).toHaveBeenCalledWith([4], 'entrega'))
  })

  it('SCRUM-929: "Facturar pedido completo" factura con modo completo el resto del pedido', async () => {
    const filas: InvoiceEntry[] = [
      makeEntry({
        order_id: 4, order_number: 'PED-2026-500008', sales_project_id: 20, proyecto: 'Restaurante Sensei',
        cliente: 'Grupo Sensei', master_client_id: 5, cotizacion_folio: 'COT-1180-R2', pedido_id: 4,
        es_entrega_unica: false, facturacion_por_entrega: true, monto_total_pedido: 963, restante: 642,
        puede_facturar_completo: true, monto: 321, estado: 'pendiente-facturar', puede_facturar_entrega: true,
        entrega: { sequence_in_family: 1, total_in_family: 3, stage: 'por_despachar', order_type: 'pedido' },
      }),
    ]
    installFilteringListMock(filas)
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{ order_id: 4, ok: true, order_number: 'PED-2026-500008', monto: 642, total: 642, tipo: 'completo', modo: 'completo' }],
    })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())

    fireEvent.click(await screen.findByText('adminContab:facturacion.facturarCompleto.boton'))
    await waitFor(() => expect(mockedApi.invoices.preview).toHaveBeenCalledWith([4], 'completo'))
  })

  it('muestra el mensaje de validación del backend cuando falta información obligatoria (RN2 REQ-441)', async () => {
    const preview: InvoicePreviewResponse = {
      results: [{ order_id: 101, ok: false, missing: ['N° de Cotización'] }],
    }
    mockedApi.invoices.preview.mockResolvedValue(preview)

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    expect(await screen.findByText(/N° de Cotización/)).toBeInTheDocument()
    // Guardar queda deshabilitado mientras haya una línea con datos faltantes
    expect(screen.getByText('adminContab:facturacion.preview.guardar').closest('button')).toBeDisabled()
  })

  // ---- Guarda de RUC al facturar (docs/specs/guarda-validacion-ruc-al-facturar.md) ----

  it('guarda de RUC: con un receptor que no valida contra la DGI, "Guardar factura(s)" queda deshabilitado y se muestra el motivo', async () => {
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{
        order_id: 101, ok: true, order_number: 'PED-2026-000101', monto: 5650, total: 5650,
        receptor_validacion: {
          estado: 'no_encontrado', bloquea: true, mensaje: 'La DGI no reconoce el RUC 1689671-1-68.', sub_client_id: 4996,
          ruc: '1689671-1-68', dv: null, nombre: 'CONSTRUCTORA GRUPO V, SA', nombre_dgi: null, dv_dgi: null, corregible: true, edicion_bloqueada: false, actualizable: false,
        },
      }],
    })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    expect(await screen.findByText(/La DGI no reconoce el RUC 1689671-1-68/)).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.preview.guardar').closest('button')).toBeDisabled()
    expect(mockedApi.invoices.create).not.toHaveBeenCalled()
  })

  it('guarda de RUC: el aviso de "PAC apagado" (no_validado) no bloquea el guardado', async () => {
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{
        order_id: 101, ok: true, order_number: 'PED-2026-000101', monto: 5650, total: 5650,
        receptor_validacion: {
          estado: 'no_validado', bloquea: false, mensaje: 'La facturación electrónica está apagada: el RUC no se validó contra la DGI.',
          sub_client_id: 4996, ruc: '1689671-1-68', dv: null, nombre: 'X', nombre_dgi: null, dv_dgi: null, corregible: false, edicion_bloqueada: false, actualizable: false,
        },
      }],
    })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    expect(await screen.findByText(/el RUC no se validó contra la DGI/)).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.preview.guardar').closest('button')).not.toBeDisabled()
  })

  // ---- SCRUM-1140 — Consumidor final por decisión de quien factura ----

  const receptorQueNoValida = {
    estado: 'no_encontrado' as const, bloquea: true, mensaje: 'La DGI no reconoce el RUC 1689671-1-68.', sub_client_id: 4996,
    ruc: '1689671-1-68', dv: null, nombre: 'CONSTRUCTORA GRUPO V, SA', nombre_dgi: null, dv_dgi: null,
    corregible: true, edicion_bloqueada: false, actualizable: false,
  }

  it('SCRUM-1140: con el permiso, un receptor que no valida se factura como consumidor final y el guardado lo informa', async () => {
    useAuthStore.setState({ user: { permissions: ['admin_contab.edit.receptor_consumidor_final'] } as never })
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{ order_id: 101, ok: true, order_number: 'PED-2026-000101', monto: 5650, total: 5650, receptor_validacion: receptorQueNoValida }],
    })
    mockedApi.invoices.create.mockResolvedValue({ invoices: [{ order_id: 101, numero: 'F-2301' }], errors: [] })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    expect(await screen.findByText(/La DGI no reconoce el RUC 1689671-1-68/)).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.preview.guardar').closest('button')).toBeDisabled()

    fireEvent.click(screen.getByText('facturacion.preview.receptor.consumidorFinal.facturar'))
    expect(screen.getByText('adminContab:facturacion.preview.guardar').closest('button')).not.toBeDisabled()

    fireEvent.click(screen.getByText('adminContab:facturacion.preview.guardar'))
    await waitFor(() => expect(mockedApi.invoices.create).toHaveBeenCalledWith({ order_ids: [101], consumidor_final_order_ids: [101] }))
  })

  it('SCRUM-1140: sin el permiso no se ofrece consumidor final y el guardado sigue bloqueado', async () => {
    useAuthStore.setState({ user: { permissions: [] } as never })
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{ order_id: 101, ok: true, order_number: 'PED-2026-000101', monto: 5650, total: 5650, receptor_validacion: receptorQueNoValida }],
    })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    expect(await screen.findByText(/La DGI no reconoce el RUC 1689671-1-68/)).toBeInTheDocument()
    expect(screen.queryByText('facturacion.preview.receptor.consumidorFinal.facturar')).not.toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.preview.guardar').closest('button')).toBeDisabled()
  })

  it('SCRUM-1140: una razón social distinta de la DGI no bloquea el guardado', async () => {
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{
        order_id: 101, ok: true, order_number: 'PED-2026-000101', monto: 5650, total: 5650,
        receptor_validacion: {
          ...receptorQueNoValida, estado: 'nombre_distinto', bloquea: false, corregible: false, actualizable: true,
          mensaje: 'La razón social no coincide con la de la DGI: "CONSTRUCTORA GRUPO V S A". Se enviará la de la DGI en la factura.',
          nombre_dgi: 'CONSTRUCTORA GRUPO V S A', dv_dgi: '33',
        },
      }],
    })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    expect(await screen.findByText(/Se enviará la de la DGI en la factura/)).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.preview.guardar').closest('button')).not.toBeDisabled()
  })

  // ---- Batch 3 — REQ-442: saldo a favor ----
  // SCRUM-902 §4.3 retiró por completo la aplicación de saldo a favor en Facturación (la factura
  // siempre se genera por su monto completo, sin ninguna resta visible aquí — el saldo se aplica
  // únicamente en Cobros, ver RegistrarCobroModal.test.tsx). Los 3 escenarios REQ-442 que vivían
  // acá (checkbox "aplicar saldo", aviso "solo primera factura", Total a pagar) probaban un
  // mecanismo que ya no existe — eliminados en vez de adaptados.

  // ---- Batch 3 — REQ-444: flujo guiado "+ Crear Factura" ----

  it('RN2 REQ-444: al elegir un proyecto, todas sus entregas quedan marcadas por defecto', async () => {
    installFilteringListMock([
      makeEntry({ order_id: 301, order_number: 'PED-301', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-301', monto: 1000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false }),
      makeEntry({ order_id: 302, order_number: 'PED-302', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-302', monto: 2000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false }),
    ])

    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.crearFactura'))
    // SCRUM-947 — findByLabelText (async, reintenta), no getByLabelText: el modal monta después
    // de un tick extra ahora que la tabla principal también pagina (mismo patrón que ya usa el
    // test de abajo con clienteSelect).
    fireEvent.change(await screen.findByLabelText('adminContab:facturacion.crear.clienteLabel'), { target: { value: 'Torres Pacífico' } })
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.crear.proyectoLabel'), { target: { value: 'Torres Norte' } })

    const checkboxes = await screen.findAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    checkboxes.forEach(cb => expect(cb).toBeChecked())
  })

  it('RN5 REQ-444: sin ninguna entrega marcada, muestra un mensaje inline (nunca window.alert)', async () => {
    installFilteringListMock([
      makeEntry({ order_id: 301, order_number: 'PED-301', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-301', monto: 1000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false }),
    ])
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.crearFactura'))
    // SCRUM-947 — findByLabelText (async, reintenta), no getByLabelText: el modal monta después
    // de un tick extra ahora que la tabla principal también pagina (mismo patrón que ya usa el
    // test de abajo con clienteSelect).
    fireEvent.change(await screen.findByLabelText('adminContab:facturacion.crear.clienteLabel'), { target: { value: 'Torres Pacífico' } })
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.crear.proyectoLabel'), { target: { value: 'Torres Norte' } })

    fireEvent.click(await screen.findByRole('checkbox')) // desmarca la única entrega
    fireEvent.click(screen.getByText('adminContab:facturacion.crear.verVistaPrevia'))

    expect(await screen.findByText('adminContab:facturacion.crear.seleccionaEntrega')).toBeInTheDocument()
    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('RN1 REQ-444 (bug corregido): el selector de cliente del wizard ve TODOS los clientes, aunque la tabla tenga un filtro de búsqueda activo', async () => {
    installFilteringListMock([
      makeEntry({ order_id: 301, order_number: 'PED-301', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-301', monto: 1000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false }),
      makeEntry({ order_id: 401, order_number: 'PED-401', master_client_id: 11, cliente: 'Hotel Riu', sales_project_id: 50, proyecto: 'Lobby y piscina', cotizacion_folio: 'COT-401', monto: 500, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false }),
    ])

    renderPage()
    await screen.findAllByText('Torres Norte')

    // Filtra la tabla por "torres" — solo debería quedar Torres Pacífico visible en la tabla.
    fireEvent.change(screen.getByPlaceholderText('adminContab:facturacion.filtros.buscarPlaceholder'), { target: { value: 'torres' } })
    await waitFor(() => expect(screen.queryByText('Lobby y piscina')).not.toBeInTheDocument())

    // El wizard, sin embargo, debe seguir ofreciendo AMBOS clientes.
    fireEvent.click(screen.getByText('adminContab:facturacion.crearFactura'))
    const clienteSelect = await screen.findByLabelText('adminContab:facturacion.crear.clienteLabel')
    expect(within(clienteSelect).getByText('Hotel Riu')).toBeInTheDocument()
    expect(within(clienteSelect).getByText('Torres Pacífico')).toBeInTheDocument()
  })

  it('SCRUM-980: un pedido sin proyecto real (proyecto null) nunca aparece en el wizard — ni como cliente ni como opción de proyecto', async () => {
    installFilteringListMock([
      // Mismo patrón de los fixtures huérfanos de Bodega que originaron el ticket: cliente
      // resuelto por fallback a `customer_name` (nunca null), pero sin PipelineCard/SalesProject
      // real detrás — `sales_project_id`/`proyecto` genuinamente null desde el backend.
      makeEntry({
        order_id: 501, order_number: 'PED-501', master_client_id: null, cliente: '[QA-BOD] Cliente huérfano',
        sales_project_id: null, proyecto: null, cotizacion_folio: null, monto: null,
        estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false,
      }),
      makeEntry({ order_id: 301, order_number: 'PED-301', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-301', monto: 1000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false }),
    ])

    renderPage()
    await screen.findAllByText('Torres Norte')

    fireEvent.click(screen.getByText('adminContab:facturacion.crearFactura'))
    const clienteSelect = await screen.findByLabelText('adminContab:facturacion.crear.clienteLabel')
    // El cliente sin ningún pedido facturable no debe ofrecerse — antes de este fix aparecía
    // seleccionable y el select de Proyecto quedaba con una única <option> vacía sin value ni texto.
    expect(within(clienteSelect).queryByText('[QA-BOD] Cliente huérfano')).not.toBeInTheDocument()
    expect(within(clienteSelect).getByText('Torres Pacífico')).toBeInTheDocument()

    // El filtro "Proyecto" de la tabla principal tampoco debe ofrecer una opción vacía.
    const proyectoFiltro = screen.getByText('adminContab:facturacion.filtros.todosProyectos').closest('select')!
    expect(within(proyectoFiltro).queryAllByRole('option').some(o => o.textContent === '')).toBe(false)
  })

  // ---- Batch 3 — REQ-443: botón Editar desde el wizard ----

  it('REQ-443: "Editar selección" solo aparece cuando la vista previa se abrió desde "+ Crear Factura", no desde una fila individual', async () => {
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{ order_id: 101, ok: true, order_number: 'PED-2026-000101', monto: 5650, total: 5650 }],
    })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    await screen.findByText(/5,650\.00/)
    expect(screen.queryByText('adminContab:facturacion.preview.editar')).not.toBeInTheDocument()
  })

  it('REQ-443: "Editar selección" desde el wizard vuelve a "+ Crear Factura" preservando cliente/proyecto/selección', async () => {
    installFilteringListMock([
      makeEntry({ order_id: 301, order_number: 'PED-301', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-301', monto: 1000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false }),
    ])
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{ order_id: 301, ok: true, order_number: 'PED-301', monto: 1000, total: 1000 }],
    })

    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.crearFactura'))
    // SCRUM-947 — findByLabelText (async, reintenta), no getByLabelText: el modal monta después
    // de un tick extra ahora que la tabla principal también pagina (mismo patrón que ya usa el
    // test de abajo con clienteSelect).
    fireEvent.change(await screen.findByLabelText('adminContab:facturacion.crear.clienteLabel'), { target: { value: 'Torres Pacífico' } })
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.crear.proyectoLabel'), { target: { value: 'Torres Norte' } })
    fireEvent.click(screen.getByText('adminContab:facturacion.crear.verVistaPrevia'))

    await screen.findByText(/1,000\.00/)
    fireEvent.click(screen.getByText('adminContab:facturacion.preview.editar'))

    // Volvimos al wizard con cliente/proyecto ya elegidos y la entrega ya marcada.
    expect(await screen.findByDisplayValue('Torres Pacífico')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Torres Norte')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  // ---- Batch 3 — REQ-445: contador "Mostrando X de Y" ----

  it('RN4 REQ-445: el contador usa total_en_tab (total de la pestaña sin filtros), no la lista ya filtrada', async () => {
    mockedApi.invoices.list.mockResolvedValue(makeListResult(makeEntries(), 8))

    renderPage()
    await screen.findAllByText('Restaurante Sensei')

    // makeEntries() trae 2 filas, pero la pestaña "cobrable" completa (sin filtros) tiene 8.
    expect(screen.getByText(/resultCount.*"visible":2.*"total":8/)).toBeInTheDocument()
  })

  // ---- Batch 4 (SCRUM-524→528, REQ-447→451) ----

  it('REQ-448: la pastilla de una fila refleja cobrabilidad antes que `estado` (pendiente de aprobación / incobrable / anulada)', async () => {
    mockedApi.invoices.list.mockResolvedValue(makeListResult([
      makeEntry({ order_id: 501, order_number: 'PED-501', master_client_id: 1, cliente: 'A', sales_project_id: 1, proyecto: 'P1', cotizacion_folio: null, monto: 100, estado: 'facturada', numero_factura: 'F-1', es_incobrable: false, incobrable_pendiente: true }),
      makeEntry({ order_id: 502, order_number: 'PED-502', master_client_id: 1, cliente: 'A', sales_project_id: 1, proyecto: 'P1', cotizacion_folio: null, monto: 100, estado: 'facturada', numero_factura: 'F-2', es_incobrable: true, incobrable_pendiente: false }),
      makeEntry({ order_id: 503, order_number: 'PED-503', master_client_id: 1, cliente: 'A', sales_project_id: 1, proyecto: 'P1', cotizacion_folio: null, monto: 100, estado: 'anulada', numero_factura: 'F-3', es_incobrable: false, incobrable_pendiente: false }),
    ]))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))

    expect(await screen.findByText('adminContab:facturacion.estados.pendienteAprobacion')).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.estados.incobrable')).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.estados.anulada')).toBeInTheDocument()
  })

  // SCRUM-1147 — filtro Cobradas / Por cobrar: viaja al backend como `cobro`, combinable con el resto.
  it('SCRUM-1147: el filtro Cobradas/Por cobrar pide `cobro` al backend y "Limpiar filtros" lo resetea', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))

    fireEvent.change(await screen.findByLabelText('adminContab:facturacion.filtros.cobro'), { target: { value: 'por_cobrar' } })
    await waitFor(() => expect(mockedApi.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ cobro: 'por_cobrar', view: 'plana' })))

    fireEvent.change(screen.getByLabelText('adminContab:facturacion.filtros.cobro'), { target: { value: 'cobradas' } })
    await waitFor(() => expect(mockedApi.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ cobro: 'cobradas' })))

    fireEvent.click(screen.getByText('adminContab:facturacion.filtros.limpiar'))
    await waitFor(() => expect(mockedApi.invoices.list).toHaveBeenLastCalledWith(expect.objectContaining({ cobro: undefined })))
  })

  // SCRUM-1175 — vendedor visible en cada fila y filtro por selección (uno o varios) que viaja al backend, combinable con Por cobrar.
  it('SCRUM-1175: muestra los vendedores de cada fila (o «—») y el filtro viaja como `vendedor_ids`, combinable con el resto', async () => {
    mockedApi.invoices.sellers.mockResolvedValue({ data: [{ id: 5, name: 'Ana Pérez' }, { id: 9, name: 'Luis Mora' }] })
    mockedApi.invoices.list.mockResolvedValue(makeListResult([
      makeEntry({ order_id: 701, order_number: 'PED-701', estado: 'facturada', numero_factura: 'F-701', vendedores: ['Ana Pérez', 'Luis Mora'] }),
      makeEntry({ order_id: 702, order_number: 'PED-702', estado: 'facturada', numero_factura: 'F-702', vendedores: [] }),
    ]))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))

    const celdas = await screen.findAllByTestId('fila-vendedor')
    expect(celdas.map(c => c.textContent)).toEqual(['Ana Pérez, Luis Mora', '—'])

    fireEvent.click(screen.getByText('adminContab:facturacion.filtros.vendedor'))
    fireEvent.click(await screen.findByLabelText('Ana Pérez'))
    await waitFor(() => expect(mockedApi.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ vendedor_ids: [5], view: 'plana' })))
    fireEvent.click(screen.getByLabelText('Luis Mora'))
    await waitFor(() => expect(mockedApi.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ vendedor_ids: [5, 9] })))
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.filtros.cobro'), { target: { value: 'por_cobrar' } })
    await waitFor(() => expect(mockedApi.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ vendedor_ids: [5, 9], cobro: 'por_cobrar' })))

    fireEvent.click(screen.getByText('adminContab:facturacion.filtros.limpiar'))
    await waitFor(() => expect(mockedApi.invoices.list).toHaveBeenLastCalledWith(expect.objectContaining({ vendedor_ids: undefined })))
    expect(screen.getByText('adminContab:facturacion.filtros.vendedor')).toBeInTheDocument()
  })

  // SCRUM-1147 — saldo a favor junto al total, en rojo; sin saldo no se muestra nada (vista plana y agrupada).
  it('SCRUM-1147: muestra el saldo a favor en rojo junto al monto y nada cuando no hay', async () => {
    mockedApi.invoices.list.mockResolvedValue(makeListResult([
      makeEntry({ order_id: 601, order_number: 'PED-601', monto: 500, estado: 'facturada', numero_factura: 'F-601', saldo_a_favor: 120 }),
      makeEntry({ order_id: 602, order_number: 'PED-602', monto: 700, estado: 'facturada', numero_factura: 'F-602', saldo_a_favor: null }),
    ]))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))

    const saldos = await screen.findAllByText(/^adminContab:facturacion\.saldoAFavor:/)
    expect(saldos).toHaveLength(1)
    expect(saldos[0]).toHaveClass('text-red-600')
  })

  it('REQ-447: clic en cualquier fila abre el modal de detalle con la trazabilidad Cotización → Factura → Guía de Entrega', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail())
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000101'))

    await waitFor(() => expect(mockedApi.invoices.detail).toHaveBeenCalledWith(101, undefined))
    expect(await screen.findByText('adminContab:facturacion.detalle.title')).toBeInTheDocument()
    // Cotización completa (folio real, aparece también en la fila de la tabla) — Factura y Guía
    // de Entrega pendientes.
    expect(screen.getAllByText('COT-1180-R2').length).toBeGreaterThanOrEqual(1)
    expect(await screen.findAllByText('adminContab:facturacion.detalle.pendiente')).toHaveLength(2)
  })

  it('REQ-447 Escenario 3 / RN2: la Guía de Entrega nunca aparece completa si todavía no hay factura, aunque el backend mande `guia_entrega.existe: true`', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({
      numero_factura: null, estado: 'pendiente-facturar',
      guia_entrega: { existe: true, fecha: '2026-06-01' }, // dato inconsistente a propósito — defensa doble
    }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000101'))

    // Factura Y Guía de Entrega siguen "Pendiente" — nunca se muestra la fecha de la guía sin factura.
    expect(await screen.findAllByText('adminContab:facturacion.detalle.pendiente')).toHaveLength(2)
    expect(screen.queryByText('2026-06-01')).not.toBeInTheDocument()
  })

  it('REQ-449: factura vigente muestra el documento fiscal sin aviso de anulación; anulada muestra el aviso', async () => {
    mockedApi.invoices.detail.mockResolvedValueOnce(makeDetail({ estado: 'facturada', numero_factura: 'F-2201', total: 5650 }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102')) // la entrega ya facturada de makeEntries()
    expect(await screen.findByText('adminContab:facturacion.detalle.verPdf')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:facturacion.detalle.anuladaAviso')).not.toBeInTheDocument()
  })

  it('REQ-449 RN1: muestra el bloque de datos de pago (cuenta número + responsable) cuando el backend lo trae', async () => {
    mockedApi.invoices.detail.mockResolvedValueOnce(makeDetail({
      estado: 'facturada', numero_factura: 'F-2201', total: 5650,
      cuenta_pago: 'Banco General ****4321', responsable: 'Contabilidad Test',
    }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))
    expect(await screen.findByText(/Banco General \*\*\*\*4321/)).toBeInTheDocument()
    expect(screen.getByText(/Contabilidad Test/)).toBeInTheDocument()
  })

  // SCRUM-943 — regla dura pedida explícitamente: error_configuracion NUNCA se muestra como
  // "rechazado por la DGI", es un problema de configuración nuestro.
  it('SCRUM-943: error_configuracion se muestra distinto de rechazado, nunca como "rechazado por la DGI"', async () => {
    mockedApi.invoices.detail.mockResolvedValueOnce(makeDetail({
      estado: 'facturada', numero_factura: 'F-2201', total: 5650, fe_estado: 'error_configuracion',
    }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))

    expect(await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.errorConfiguracion')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.rechazado')).not.toBeInTheDocument()
  })

  it('SCRUM-943: factura certificada muestra el CUFE y el link al QR', async () => {
    mockedApi.invoices.detail.mockResolvedValueOnce(makeDetail({
      estado: 'facturada', numero_factura: 'F-2201', total: 5650,
      fe_estado: 'certificado', cufe: 'FE0120000...abc', qr_content: 'https://qr.test/abc',
    }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))

    expect(await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.certificado')).toBeInTheDocument()
    expect(screen.getByText(/FE0120000\.\.\.abc/)).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.detalle.facturacionElectronica.verQr').closest('a')).toHaveAttribute('href', 'https://qr.test/abc')
  })

  it('SCRUM-943: apagado (no_aplica) se muestra distinto de pendiente/error, sin CUFE', async () => {
    mockedApi.invoices.detail.mockResolvedValueOnce(makeDetail({
      estado: 'facturada', numero_factura: 'F-2201', total: 5650, fe_estado: 'no_aplica',
    }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))

    expect(await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.noAplica')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:facturacion.detalle.facturacionElectronica.pendiente')).not.toBeInTheDocument()
  })

  it('SCRUM-943: "Ver JSON" en no_aplica llama a fePreview solo al expandir y muestra el payload', async () => {
    mockedApi.invoices.detail.mockResolvedValueOnce(makeDetail({
      estado: 'facturada', numero_factura: 'F-2201', total: 5650, fe_estado: 'no_aplica',
    }))
    mockedApi.invoices.fePreview.mockResolvedValueOnce({ ok: true, payload: { serie: 'ILU', numero: 'F-2201' } })
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))
    await screen.findByText('adminContab:facturacion.detalle.facturacionElectronica.noAplica')

    expect(mockedApi.invoices.fePreview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('adminContab:facturacion.detalle.facturacionElectronica.verJson'))

    await waitFor(() => expect(mockedApi.invoices.fePreview).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/"serie": "ILU"/)).toBeInTheDocument()
  })

  it('REQ-449 Escenario 2: factura anulada muestra el aviso visual', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ estado: 'anulada', es_anulada: true, numero_factura: 'F-2201', total: 5650 }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000101'))
    await screen.findByText('adminContab:facturacion.detalle.title')
    expect(await screen.findByText('adminContab:facturacion.detalle.anuladaAviso')).toBeInTheDocument()
  })

  it('REQ-448 Escenario 1: proponer incobrable exige motivo (mensaje inline, nunca window.alert) y lo envía al confirmar', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { throw new Error('no debería llamarse window.alert()') })
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ estado: 'facturada', numero_factura: 'F-2201', cobrabilidad: 'normal' }))
    mockedApi.invoices.markUncollectible.mockResolvedValue(makeDetail({ estado: 'facturada', cobrabilidad: 'pendiente_aprobacion', motivo_incobrable: 'Cliente sin respuesta' }))

    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))
    fireEvent.click(await screen.findByText('adminContab:facturacion.detalle.marcarIncobrable'))

    fireEvent.click(screen.getByText('adminContab:facturacion.detalle.enviarPropuesta'))
    expect(await screen.findByText('adminContab:facturacion.detalle.motivoRequerido')).toBeInTheDocument()
    expect(mockedApi.invoices.markUncollectible).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('adminContab:facturacion.detalle.motivoPlaceholder'), { target: { value: 'Cliente sin respuesta' } })
    fireEvent.click(screen.getByText('adminContab:facturacion.detalle.enviarPropuesta'))
    await waitFor(() => expect(mockedApi.invoices.markUncollectible).toHaveBeenCalledWith(102, 'Cliente sin respuesta', undefined))
    alertSpy.mockRestore()
  })

  it('REQ-448 Escenario 2/3: Aprobar/Rechazar solo se muestran cuando el backend confirma que el usuario actual es Mark (`puede_decidir_incobrable`)', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({
      estado: 'facturada', numero_factura: 'F-2201', cobrabilidad: 'pendiente_aprobacion',
      motivo_incobrable: 'Cliente sin respuesta', puede_decidir_incobrable: false,
    }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))

    expect(await screen.findByText('adminContab:facturacion.detalle.pendienteAprobacionAviso')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:facturacion.detalle.aprobar')).not.toBeInTheDocument()
    expect(screen.queryByText('adminContab:facturacion.detalle.rechazar')).not.toBeInTheDocument()
  })

  it('REQ-448 Escenario 2: Mark aprueba la propuesta desde el modal', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({
      estado: 'facturada', numero_factura: 'F-2201', cobrabilidad: 'pendiente_aprobacion',
      motivo_incobrable: 'Cliente sin respuesta', puede_decidir_incobrable: true,
    }))
    mockedApi.invoices.decideUncollectible.mockResolvedValue(makeDetail({ estado: 'facturada', cobrabilidad: 'incobrable' }))

    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))
    fireEvent.click(await screen.findByText('adminContab:facturacion.detalle.aprobar'))

    await waitFor(() => expect(mockedApi.invoices.decideUncollectible).toHaveBeenCalledWith(102, true, undefined))
  })

  it('SCRUM-864: "Marcar como incobrable" no aparece cuando la factura ya está pagada (`puede_marcar_incobrable` false)', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({
      estado: 'facturada', numero_factura: 'F-2201', cobrabilidad: 'normal', puede_marcar_incobrable: false,
    }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))
    await screen.findByText('adminContab:facturacion.detalle.title')

    expect(screen.queryByText('adminContab:facturacion.detalle.marcarIncobrable')).not.toBeInTheDocument()
  })

  it('REQ-451: "Registrar cobro" solo aparece cuando `puede_registrar_cobro` es true y navega a Cobros con el cliente preseleccionado', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({
      estado: 'facturada', numero_factura: 'F-2201', puede_registrar_cobro: true, master_client_id: 5,
    }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))

    const boton = await screen.findByText('adminContab:facturacion.detalle.registrarCobro')
    fireEvent.click(boton)
    // CobrosPlaceholderPage no está montado en este test (no hay <Routes> real) — verificamos que
    // el modal de detalle se cierra al navegar, señal de que `navigate()` se ejecutó sin lanzar.
    await waitFor(() => expect(screen.queryByText('adminContab:facturacion.detalle.title')).not.toBeInTheDocument())
  })

  it('REQ-451 Escenario 2/3: sin `puede_registrar_cobro`, el botón no aparece', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail({ estado: 'facturada', numero_factura: 'F-2201', puede_registrar_cobro: false }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))
    await screen.findByText('adminContab:facturacion.detalle.title')
    expect(screen.queryByText('adminContab:facturacion.detalle.registrarCobro')).not.toBeInTheDocument()
  })

  it('REQ-450: el panel de Antigüedad de cartera muestra los 4 rangos con cantidad y monto', async () => {
    const aging: InvoiceAgingResult = {
      ranges: [
        { desde_dias: 0, hasta_dias: 30, cantidad: 14, monto: 22100 },
        { desde_dias: 31, hasta_dias: 60, cantidad: 6, monto: 11300 },
        { desde_dias: 61, hasta_dias: 90, cantidad: 3, monto: 5600 },
        { desde_dias: 91, hasta_dias: null, cantidad: 2, monto: 2800 },
      ],
    }
    mockedApi.invoices.aging.mockResolvedValue(aging)
    renderPage()
    expect(await screen.findByText('adminContab:facturacion.aging.title')).toBeInTheDocument()
    expect(screen.getByText(/22,100\.00/)).toBeInTheDocument()
    expect(screen.getByText(/2,800\.00/)).toBeInTheDocument()
  })
})

// SCRUM-947 — paginación estándar (vista plana; el agrupado por proyecto se arma client-side
// sobre esa misma página, ver comentario de listFilters en el componente).
describe('FacturacionPage — SCRUM-947 paginación', () => {
  it('pide la página 1 con 20 por página por defecto', async () => {
    mockedApi.invoices.list.mockResolvedValue({
      rows: [], total_en_tab: 0, meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()
    await screen.findByText('adminContab:facturacion.empty')
    expect(mockedApi.invoices.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, per_page: 20, view: 'plana' }))
  })

  it('cambiar de pestaña (cartera) reinicia a la página 1', async () => {
    mockedApi.invoices.list.mockResolvedValue({
      rows: [makeEntry({ order_id: 1 })], total_en_tab: 45, meta: { total: 45, per_page: 20, current_page: 1, last_page: 3 },
    })
    renderPage()
    await screen.findByText(/pagination\.showing/)

    fireEvent.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => expect(mockedApi.invoices.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))

    fireEvent.click(screen.getByText('adminContab:facturacion.cartera.incobrable'))
    await waitFor(() => expect(mockedApi.invoices.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ tab: 'incobrable', page: 1 }),
    ))
  })

  it('el wizard "+ Crear Factura" sigue pidiendo su propia lista sin page/per_page (RN1 REQ-444)', async () => {
    installFilteringListMock([
      makeEntry({ order_id: 301, cliente: 'Torres Pacífico', proyecto: 'Torres Norte', estado: 'pendiente-facturar' }),
    ])
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.crearFactura'))
    await screen.findByLabelText('adminContab:facturacion.crear.clienteLabel')

    const wizardCall = mockedApi.invoices.list.mock.calls.find(([f]) => !('page' in f))
    expect(wizardCall).toBeDefined()
  })
})
