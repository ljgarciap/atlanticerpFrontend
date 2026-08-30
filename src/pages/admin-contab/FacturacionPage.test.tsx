import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import FacturacionPage from './FacturacionPage'
import { adminContabApi } from '@/api/adminContabApi'
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
      summary: vi.fn(), list: vi.fn(), preview: vi.fn(), create: vi.fn(), export: vi.fn(),
      detail: vi.fn(), markUncollectible: vi.fn(), decideUncollectible: vi.fn(), aging: vi.fn(), downloadPdf: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeSummary(): InvoiceSummary {
  return { pendientes_entrega: 2, pendientes_facturar: 1, facturadas_mes: 4, monto_facturado_mes: 28910 }
}

function makeEntries(): InvoiceEntry[] {
  return [
    {
      order_id: 101, order_number: 'PED-2026-000101', master_client_id: 5, cliente: 'Grupo Sensei',
      sales_project_id: 20, proyecto: 'Restaurante Sensei', cotizacion_folio: 'COT-1180-R2',
      monto: 5650, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false,
    },
    {
      order_id: 102, order_number: 'PED-2026-000102', master_client_id: 5, cliente: 'Grupo Sensei',
      sales_project_id: 20, proyecto: 'Restaurante Sensei', cotizacion_folio: 'COT-1180',
      monto: 12250, estado: 'facturada', numero_factura: 'F-2201', es_incobrable: false, incobrable_pendiente: false,
    },
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
    if (filters.proyecto) rows = rows.filter(e => e.proyecto.toLowerCase().includes(filters.proyecto!.toLowerCase()))
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
    puede_registrar_cobro: false,
    cuenta_pago: null, responsable: null,
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
      {
        order_id: 201, order_number: 'PED-2026-000201', master_client_id: null, cliente: 'Cliente sin proyecto vinculado',
        sales_project_id: 30, proyecto: 'Obra sin card', cotizacion_folio: null,
        monto: 900, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false,
      },
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
      aviso_saldo_solo_primera: false,
    }
    mockedApi.invoices.preview.mockResolvedValue(preview)
    mockedApi.invoices.create.mockResolvedValue({ invoices: [{ order_id: 101, numero: 'F-2300' }], errors: [] })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    await waitFor(() => expect(mockedApi.invoices.preview).toHaveBeenCalledWith([101], true))
    expect((await screen.findAllByText(/5,650\.00/)).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('adminContab:facturacion.preview.guardar'))
    await waitFor(() => expect(mockedApi.invoices.create).toHaveBeenCalledWith({ order_ids: [101], aplicar_saldo_favor: true }))
  })

  it('muestra el mensaje de validación del backend cuando falta información obligatoria (RN2 REQ-441)', async () => {
    const preview: InvoicePreviewResponse = {
      results: [{ order_id: 101, ok: false, missing: ['N° de Cotización'] }],
      aviso_saldo_solo_primera: false,
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

  // ---- Batch 3 — REQ-442: saldo a favor ----

  it('Escenario 1 REQ-442: cliente con saldo a favor — opción marcada por defecto, Total a pagar visible', async () => {
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{
        order_id: 101, ok: true, order_number: 'PED-2026-000101', monto: 8400, total: 8400,
        saldo_disponible: 500, saldo_aplicable: 500, total_a_pagar: 7900,
      }],
      aviso_saldo_solo_primera: false,
    })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    const checkbox = await screen.findByRole('checkbox', { name: /aplicarSaldo/ })
    expect(checkbox).toBeChecked()
    expect(screen.getByText(/7,900\.00/)).toBeInTheDocument()
    expect(screen.getByText(/8,400\.00/)).toBeInTheDocument()
    // sin aviso de "solo primera" — es una sola factura
    expect(screen.queryByText(/avisoSaldoSoloPrimera/)).not.toBeInTheDocument()
  })

  it('Escenario 2 REQ-442: lote de varias facturas — el saldo solo se ofrece en la primera, con aviso explícito', async () => {
    installFilteringListMock([
      { order_id: 301, order_number: 'PED-301', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-301', monto: 1000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false },
      { order_id: 302, order_number: 'PED-302', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-302', monto: 2000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false },
    ])
    mockedApi.invoices.preview.mockResolvedValue({
      results: [
        { order_id: 301, ok: true, order_number: 'PED-301', monto: 1000, total: 1000, saldo_disponible: 500, saldo_aplicable: 500, total_a_pagar: 500 },
        { order_id: 302, ok: true, order_number: 'PED-302', monto: 2000, total: 2000, saldo_disponible: 0, saldo_aplicable: 0, total_a_pagar: 2000 },
      ],
      aviso_saldo_solo_primera: true,
    })

    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.crearFactura'))
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.crear.clienteLabel'), { target: { value: 'Torres Pacífico' } })
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.crear.proyectoLabel'), { target: { value: 'Torres Norte' } })
    fireEvent.click(screen.getByText('adminContab:facturacion.crear.verVistaPrevia'))

    await waitFor(() => expect(mockedApi.invoices.preview).toHaveBeenCalledWith(expect.arrayContaining([301, 302]), true))
    expect(await screen.findByText(/avisoSaldoSoloPrimera/)).toBeInTheDocument()
  })

  it('Escenario 3 REQ-442: sin saldo a favor no aparece ninguna opción relacionada', async () => {
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{ order_id: 101, ok: true, order_number: 'PED-2026-000101', monto: 5650, total: 5650, saldo_disponible: 0 }],
      aviso_saldo_solo_primera: false,
    })

    renderPage()
    await screen.findAllByText('Restaurante Sensei')
    fireEvent.click(findGroupHeader())
    fireEvent.click(await screen.findByText('adminContab:facturacion.generarFactura'))

    await screen.findByText(/5,650\.00/)
    expect(screen.queryByRole('checkbox', { name: /aplicarSaldo/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/avisoSaldoSoloPrimera/)).not.toBeInTheDocument()
  })

  // ---- Batch 3 — REQ-444: flujo guiado "+ Crear Factura" ----

  it('RN2 REQ-444: al elegir un proyecto, todas sus entregas quedan marcadas por defecto', async () => {
    installFilteringListMock([
      { order_id: 301, order_number: 'PED-301', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-301', monto: 1000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false },
      { order_id: 302, order_number: 'PED-302', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-302', monto: 2000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false },
    ])

    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.crearFactura'))
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.crear.clienteLabel'), { target: { value: 'Torres Pacífico' } })
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.crear.proyectoLabel'), { target: { value: 'Torres Norte' } })

    const checkboxes = await screen.findAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    checkboxes.forEach(cb => expect(cb).toBeChecked())
  })

  it('RN5 REQ-444: sin ninguna entrega marcada, muestra un mensaje inline (nunca window.alert)', async () => {
    installFilteringListMock([
      { order_id: 301, order_number: 'PED-301', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-301', monto: 1000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false },
    ])
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.crearFactura'))
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.crear.clienteLabel'), { target: { value: 'Torres Pacífico' } })
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.crear.proyectoLabel'), { target: { value: 'Torres Norte' } })

    fireEvent.click(await screen.findByRole('checkbox')) // desmarca la única entrega
    fireEvent.click(screen.getByText('adminContab:facturacion.crear.verVistaPrevia'))

    expect(await screen.findByText('adminContab:facturacion.crear.seleccionaEntrega')).toBeInTheDocument()
    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('RN1 REQ-444 (bug corregido): el selector de cliente del wizard ve TODOS los clientes, aunque la tabla tenga un filtro de búsqueda activo', async () => {
    installFilteringListMock([
      { order_id: 301, order_number: 'PED-301', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-301', monto: 1000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false },
      { order_id: 401, order_number: 'PED-401', master_client_id: 11, cliente: 'Hotel Riu', sales_project_id: 50, proyecto: 'Lobby y piscina', cotizacion_folio: 'COT-401', monto: 500, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false },
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

  // ---- Batch 3 — REQ-443: botón Editar desde el wizard ----

  it('REQ-443: "Editar selección" solo aparece cuando la vista previa se abrió desde "+ Crear Factura", no desde una fila individual', async () => {
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{ order_id: 101, ok: true, order_number: 'PED-2026-000101', monto: 5650, total: 5650 }],
      aviso_saldo_solo_primera: false,
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
      { order_id: 301, order_number: 'PED-301', master_client_id: 9, cliente: 'Torres Pacífico', sales_project_id: 40, proyecto: 'Torres Norte', cotizacion_folio: 'COT-301', monto: 1000, estado: 'pendiente-facturar', numero_factura: null, es_incobrable: false, incobrable_pendiente: false },
    ])
    mockedApi.invoices.preview.mockResolvedValue({
      results: [{ order_id: 301, ok: true, order_number: 'PED-301', monto: 1000, total: 1000 }],
      aviso_saldo_solo_primera: false,
    })

    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.crearFactura'))
    fireEvent.change(screen.getByLabelText('adminContab:facturacion.crear.clienteLabel'), { target: { value: 'Torres Pacífico' } })
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
      { order_id: 501, order_number: 'PED-501', master_client_id: 1, cliente: 'A', sales_project_id: 1, proyecto: 'P1', cotizacion_folio: null, monto: 100, estado: 'facturada', numero_factura: 'F-1', es_incobrable: false, incobrable_pendiente: true },
      { order_id: 502, order_number: 'PED-502', master_client_id: 1, cliente: 'A', sales_project_id: 1, proyecto: 'P1', cotizacion_folio: null, monto: 100, estado: 'facturada', numero_factura: 'F-2', es_incobrable: true, incobrable_pendiente: false },
      { order_id: 503, order_number: 'PED-503', master_client_id: 1, cliente: 'A', sales_project_id: 1, proyecto: 'P1', cotizacion_folio: null, monto: 100, estado: 'anulada', numero_factura: 'F-3', es_incobrable: false, incobrable_pendiente: false },
    ]))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))

    expect(await screen.findByText('adminContab:facturacion.estados.pendienteAprobacion')).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.estados.incobrable')).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.estados.anulada')).toBeInTheDocument()
  })

  it('REQ-447: clic en cualquier fila abre el modal de detalle con la trazabilidad Cotización → Factura → Guía de Entrega', async () => {
    mockedApi.invoices.detail.mockResolvedValue(makeDetail())
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000101'))

    await waitFor(() => expect(mockedApi.invoices.detail).toHaveBeenCalledWith(101))
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
      cuenta_pago: 'Banco General ****4321', responsable: 'Felix Campos',
    }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:facturacion.vista.plano'))
    fireEvent.click(await screen.findByText('PED-2026-000102'))
    expect(await screen.findByText(/Banco General \*\*\*\*4321/)).toBeInTheDocument()
    expect(screen.getByText(/Felix Campos/)).toBeInTheDocument()
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
    await waitFor(() => expect(mockedApi.invoices.markUncollectible).toHaveBeenCalledWith(102, 'Cliente sin respuesta'))
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

    await waitFor(() => expect(mockedApi.invoices.decideUncollectible).toHaveBeenCalledWith(102, true))
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
