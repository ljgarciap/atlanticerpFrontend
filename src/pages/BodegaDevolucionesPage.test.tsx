import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import BodegaDevolucionesPage from './BodegaDevolucionesPage'
import { bodegaApi } from '@/api/bodegaApi'
import type { CustomerReturnRow, CustomerReturnDetail, PhysicalWarehouse } from '@/types/bodega'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    returns: {
      list: vi.fn(),
      detail: vi.fn(),
      formUrl: vi.fn(),
      deliveryGuideUrl: vi.fn(),
      signedDocumentUrl: vi.fn(),
      confirmReception: vi.fn(),
      reject: vi.fn(),
      uploadSignedDocument: vi.fn(),
    },
    warehouses: { list: vi.fn() },
  },
}))

const mockedApi = vi.mocked(bodegaApi, true)

function makeRow(overrides: Partial<CustomerReturnRow> = {}): CustomerReturnRow {
  return {
    id: 1, return_number: 'DEV-1', order_id: 10, order_number: '2201', customer_name: 'Constructora Pacífico SA',
    project: 'Torre Marina Bahía',
    status: 'pendiente', has_signed_document: false, contact_name: 'Ricardo Aguilar', contact_phone: '+507 6220-1145',
    destination_warehouse: null, created_at: '2026-07-11T10:00:00Z', received_at: null, finalized_at: null,
    rejected_at: null,
    products: [
      { id: 100, order_item_id: 900, reference: 'NORDIC-40', description: 'Lámpara colgante Nordic 40cm', qty_requested: 1, qty_received: null, reason: 'danado_defectuoso', reason_detail: null },
    ],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BodegaDevolucionesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.warehouses.list.mockResolvedValue({ data: [{ id: 1, name: 'Bodega Central', responsable: null, capacidad_pct: null, modo_detalle: 'pendiente' } as PhysicalWarehouse] })
})

describe('BodegaDevolucionesPage', () => {
  it('muestra el mensaje de vacío cuando no hay devoluciones', async () => {
    mockedApi.returns.list.mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()
    expect(await screen.findByText('bodega:returns.empty')).toBeInTheDocument()
  })

  it('"+ Nueva devolución" navega al flujo de creación', async () => {
    mockedApi.returns.list.mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()
    await screen.findByText('bodega:returns.empty')

    fireEvent.click(screen.getByText('bodega:returns.newReturn'))

    expect(navigateMock).toHaveBeenCalledWith('/bodega/devoluciones/nueva')
  })

  it('cambiar de chip vuelve a pedir la lista con el status correcto', async () => {
    mockedApi.returns.list.mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()
    await waitFor(() => expect(mockedApi.returns.list).toHaveBeenCalledWith({ status: 'todas', page: 1, per_page: 20 }))

    fireEvent.click(screen.getByText('bodega:returns.chips.rechazada'))

    await waitFor(() => expect(mockedApi.returns.list).toHaveBeenCalledWith({ status: 'rechazada', page: 1, per_page: 20 }))
  })

  it('SCRUM-483 — sin documento firmado muestra "Cargar documento firmado"', async () => {
    mockedApi.returns.list.mockResolvedValue({ data: [makeRow({ has_signed_document: false })], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()
    expect(await screen.findByText('bodega:returns.actions.uploadSigned')).toBeInTheDocument()
    expect(screen.queryByText('bodega:returns.actions.confirmReception')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:returns.actions.finalize')).not.toBeInTheDocument()
  })

  it('SCRUM-483 — con documento firmado y sin recepción muestra "Confirmar recepción física"', async () => {
    mockedApi.returns.list.mockResolvedValue({
      data: [makeRow({ has_signed_document: true, received_at: null })],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()
    expect(await screen.findByText('bodega:returns.actions.confirmReception')).toBeInTheDocument()
    expect(screen.queryByText('bodega:returns.actions.uploadSigned')).not.toBeInTheDocument()
  })

  it('SCRUM-482 (rebote 2026-08-17) — esperando_nota_credito nunca muestra "Simular finalización"', async () => {
    mockedApi.returns.list.mockResolvedValue({
      data: [makeRow({ status: 'esperando_nota_credito', has_signed_document: true, received_at: '2026-07-12T10:00:00Z' })],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()
    await screen.findByText('#2201')
    expect(screen.queryByText('bodega:returns.actions.finalize')).not.toBeInTheDocument()
  })

  it('SCRUM-483 — finalizado/rechazada solo muestran "Ver detalle", sin acción contextual', async () => {
    mockedApi.returns.list.mockResolvedValue({
      data: [
        makeRow({ id: 1, status: 'finalizado', has_signed_document: true, received_at: '2026-07-12T10:00:00Z', finalized_at: '2026-07-13T10:00:00Z' }),
        makeRow({ id: 2, status: 'rechazada', has_signed_document: true, rejected_at: '2026-07-13T10:00:00Z' }),
      ],
      meta: { total: 2, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()
    expect(await screen.findAllByText('bodega:returns.actions.viewDetail')).toHaveLength(2)
    expect(screen.queryByText('bodega:returns.actions.uploadSigned')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:returns.actions.confirmReception')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:returns.actions.finalize')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:returns.actions.viewForm')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:returns.actions.viewDeliveryGuide')).not.toBeInTheDocument()
  })

  it('SCRUM-474 — más de 1 producto muestra "N productos" y expande la fila al hacer clic', async () => {
    mockedApi.returns.list.mockResolvedValue({
      data: [makeRow({
        products: [
          { id: 100, order_item_id: 900, reference: 'CRISTAL', description: 'Candelabro Cristal Imperial', qty_requested: 1, qty_received: null, reason: 'cliente_cambio_opinion', reason_detail: null },
          { id: 101, order_item_id: 901, reference: 'PERFIL-2M', description: 'Perfil LED empotrable 2m', qty_requested: 2, qty_received: null, reason: 'excedente', reason_detail: null },
        ],
      })],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    const trigger = await screen.findByText('returns.productsCell.count:{"count":2}')
    expect(screen.queryByText('Candelabro Cristal Imperial')).not.toBeInTheDocument()

    fireEvent.click(trigger)

    expect(await screen.findByText('Candelabro Cristal Imperial')).toBeInTheDocument()
    expect(screen.getByText('Perfil LED empotrable 2m')).toBeInTheDocument()
  })

  it('1 solo producto muestra el nombre directo, sin expandir', async () => {
    mockedApi.returns.list.mockResolvedValue({ data: [makeRow()], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()
    expect(await screen.findByText('Lámpara colgante Nordic 40cm')).toBeInTheDocument()
  })

  it('hallazgo de Visual Reviewer 2026-07-26 — muestra la columna Proyecto del mockup 3J', async () => {
    mockedApi.returns.list.mockResolvedValue({ data: [makeRow({ project: 'Torre Marina Bahía' })], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()
    expect(await screen.findByText('Torre Marina Bahía')).toBeInTheDocument()
  })

  it('Ver detalle abre el modal con el historial real del backend', async () => {
    mockedApi.returns.list.mockResolvedValue({ data: [makeRow()], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    const detail: CustomerReturnDetail = {
      ...makeRow(),
      rejection_reason: null,
      history: [
        { step: 'created', label: 'Devolución solicitada', at: '2026-07-11T10:00:00Z' },
        { step: 'awaiting_signature', label: 'Esperando documento firmado', at: null },
      ],
    }
    mockedApi.returns.detail.mockResolvedValue(detail)
    renderPage()

    fireEvent.click(await screen.findByText('bodega:returns.actions.viewDetail'))

    expect(await screen.findByText('Devolución solicitada')).toBeInTheDocument()
    expect(screen.getByText('Esperando documento firmado')).toBeInTheDocument()
    expect(mockedApi.returns.detail).toHaveBeenCalledWith(1)
  })

  it('Ver formulario abre la URL presignada en una nueva pestaña', async () => {
    mockedApi.returns.list.mockResolvedValue({ data: [makeRow()], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    mockedApi.returns.formUrl.mockResolvedValue({ url: 'https://s3.example/form.pdf' })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPage()

    fireEvent.click(await screen.findByText('bodega:returns.actions.viewForm'))

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://s3.example/form.pdf', '_blank', 'noopener,noreferrer'))
    expect(mockedApi.returns.formUrl).toHaveBeenCalledWith(1)
    openSpy.mockRestore()
  })

  it('SCRUM-478 (rebote 2026-08-16) — con documento firmado ya subido, "Ver documento firmado" abre la URL presignada', async () => {
    mockedApi.returns.list.mockResolvedValue({
      data: [makeRow({ has_signed_document: true })],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    mockedApi.returns.signedDocumentUrl.mockResolvedValue({ url: 'https://s3.example/firmado.pdf' })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPage()

    fireEvent.click(await screen.findByText('bodega:returns.actions.viewSignedDocument'))

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://s3.example/firmado.pdf', '_blank', 'noopener,noreferrer'))
    expect(mockedApi.returns.signedDocumentUrl).toHaveBeenCalledWith(1)
    openSpy.mockRestore()
  })

  it('SCRUM-478 — sin documento firmado todavía, no muestra "Ver documento firmado"', async () => {
    mockedApi.returns.list.mockResolvedValue({
      data: [makeRow({ has_signed_document: false })],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()

    await screen.findByText('bodega:returns.actions.uploadSigned')
    expect(screen.queryByText('bodega:returns.actions.viewSignedDocument')).not.toBeInTheDocument()
  })

  it('SCRUM-769 — cada acción tiene su propia columna con encabezado propio, en vez de una sola columna "Acciones"', async () => {
    mockedApi.returns.list.mockResolvedValue({ data: [makeRow()], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } })
    renderPage()
    await screen.findByText('bodega:returns.actions.viewDetail')

    expect(screen.queryByText('bodega:returns.table.actions')).not.toBeInTheDocument()
    expect(screen.getByText('bodega:returns.table.actionsDetail')).toBeInTheDocument()
    expect(screen.getByText('bodega:returns.table.actionsForm')).toBeInTheDocument()
    expect(screen.getByText('bodega:returns.table.actionsGuide')).toBeInTheDocument()
    expect(screen.getByText('bodega:returns.table.actionsDocument')).toBeInTheDocument()
    expect(screen.getByText('bodega:returns.table.actionsReception')).toBeInTheDocument()
    expect(screen.getByText('bodega:returns.table.actionsFinalize')).toBeInTheDocument()
  })

  it('SCRUM-769 — una acción que no aplica al estado de la fila muestra "—" en su columna, sin ocultarla (RN2)', async () => {
    mockedApi.returns.list.mockResolvedValue({
      data: [makeRow({ status: 'finalizado', has_signed_document: true, received_at: '2026-07-12T10:00:00Z', finalized_at: '2026-07-13T10:00:00Z' })],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderPage()
    await screen.findByText('bodega:returns.actions.viewDetail')

    // finalizado: sin acción contextual salvo "Ver detalle" — el resto de columnas quedan en "—".
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(5)
  })

})
