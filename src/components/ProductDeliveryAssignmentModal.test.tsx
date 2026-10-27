import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProductDeliveryAssignmentModal from './ProductDeliveryAssignmentModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { PipelineCardProductDeliveryRow } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    pipeline: {
      productDeliveryAssignments: { list: vi.fn(), save: vi.fn() },
    },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeRow(overrides: Partial<PipelineCardProductDeliveryRow> = {}): PipelineCardProductDeliveryRow {
  return {
    quote_item_id:           1,
    catalog_product_id:      1,
    code:                    'P-001',
    name:                    'Producto colgante',
    quantity_ordered:        10,
    quantity_available:      10,
    assigned_delivery_date:  null,
    suggested_delivery_date: null,
    ...overrides,
  }
}

function renderModal(props: Partial<Parameters<typeof ProductDeliveryAssignmentModal>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductDeliveryAssignmentModal
        cardId={1}
        deliveryDates={['2026-09-01', '2026-10-15']}
        canEdit={true}
        onClose={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([])
})

describe('ProductDeliveryAssignmentModal', () => {
  it('carga y muestra la tabla de productos (Código, Nombre, Pedido, Disponible)', async () => {
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([makeRow()])
    renderModal()

    expect(await screen.findByText('P-001')).toBeInTheDocument()
    expect(screen.getByText('Producto colgante')).toBeInTheDocument()
    expect(screen.getAllByText('10')).toHaveLength(2) // Pedido y Disponible, ambos 10
  })

  it('muestra el estado vacío cuando el proyecto no tiene productos cotizados', async () => {
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([])
    renderModal()

    expect(await screen.findByText('ventasDiseno:modal.productAssignment.empty')).toBeInTheDocument()
  })

  it('el selector de fecha solo ofrece las fechas parciales ya definidas en el proyecto (criterio 2)', async () => {
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([makeRow()])
    renderModal({ deliveryDates: ['2026-09-01', '2026-10-15'] })

    await screen.findByText('P-001')
    const select = document.querySelector('select') as HTMLSelectElement
    const optionValues = Array.from(select.options).map(o => o.value)
    expect(optionValues).toEqual(['', '2026-09-01', '2026-10-15'])
  })

  it('sin sugerencia del backend, no precarga ninguna fecha (queda "Sin asignar")', async () => {
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      makeRow({ quantity_ordered: 5, quantity_available: 10, assigned_delivery_date: null, suggested_delivery_date: null }),
    ])
    renderModal()

    await screen.findByText('P-001')
    const select = document.querySelector('select') as HTMLSelectElement
    await waitFor(() => expect(select).toHaveValue(''))
  })

  it('precarga la fecha sugerida por el backend cuando falta inventario (criterio 3)', async () => {
    // El backend (ProductDeliveryService::listForCard()) ya decide "disponible < pedido o
    // disponible === 0 -> fecha más lejana" — el frontend solo refleja `suggested_delivery_date`,
    // no recalcula el criterio de falta de inventario.
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      makeRow({ quantity_ordered: 10, quantity_available: 3, assigned_delivery_date: null, suggested_delivery_date: '2026-12-25' }),
    ])
    renderModal({ deliveryDates: ['2026-09-01', '2026-12-25', '2026-10-15'] })

    await screen.findByText('P-001')
    const select = document.querySelector('select') as HTMLSelectElement
    await waitFor(() => expect(select).toHaveValue('2026-12-25'))
  })

  it('la preselección automática no bloquea al usuario — puede elegir cualquier otra fecha libremente', async () => {
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      makeRow({ quantity_ordered: 10, quantity_available: 0, assigned_delivery_date: null, suggested_delivery_date: '2026-10-15' }),
    ])
    renderModal({ deliveryDates: ['2026-09-01', '2026-10-15'] })

    await screen.findByText('P-001')
    const select = document.querySelector('select') as HTMLSelectElement
    await waitFor(() => expect(select).toHaveValue('2026-10-15'))

    fireEvent.change(select, { target: { value: '2026-09-01' } })
    expect(select).toHaveValue('2026-09-01')
  })

  it('respeta una fecha ya asignada — no la pisa con la sugerencia del backend', async () => {
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      makeRow({ quantity_ordered: 10, quantity_available: 0, assigned_delivery_date: '2026-09-01', suggested_delivery_date: '2026-10-15' }),
    ])
    renderModal({ deliveryDates: ['2026-09-01', '2026-10-15'] })

    await screen.findByText('P-001')
    const select = document.querySelector('select') as HTMLSelectElement
    await waitFor(() => expect(select).toHaveValue('2026-09-01'))
  })

  it('guarda la asignación de fecha por producto', async () => {
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([makeRow()])
    mockedApi.pipeline.productDeliveryAssignments.save.mockResolvedValue([])
    const onClose = vi.fn()
    renderModal({ onClose })

    await screen.findByText('P-001')
    const select = document.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '2026-10-15' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.pipeline.productDeliveryAssignments.save).toHaveBeenCalledWith(
      1, [{ quote_item_id: 1, delivery_date: '2026-10-15' }],
    ))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('muestra el error del backend si falla el guardado', async () => {
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([makeRow()])
    mockedApi.pipeline.productDeliveryAssignments.save.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'La fecha elegida no es una de las fechas parciales del proyecto.' } },
    })
    renderModal()

    await screen.findByText('P-001')
    fireEvent.click(screen.getByText('common:actions.save'))

    expect(await screen.findByText('La fecha elegida no es una de las fechas parciales del proyecto.')).toBeInTheDocument()
  })

  it('sin permiso de edición (canEdit=false), el selector queda deshabilitado y no hay botón Guardar', async () => {
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([makeRow()])
    renderModal({ canEdit: false })

    await screen.findByText('P-001')
    expect(document.querySelector('select')).toBeDisabled()
    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()
  })

  it('Escape cierra el modal', async () => {
    const onClose = vi.fn()
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([])
    renderModal({ onClose })
    await screen.findByText('ventasDiseno:modal.productAssignment.title')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })

  // SCRUM-1027 (Pre-QA) — en la 2ª edición de la misma sesión (mismo QueryClient, sin recargar) el
  // modal en modo borrador servía las filas cacheadas de la 1ª apertura (solo sugerencias) en vez de
  // lo ya asignado en el servidor, y guardar pisaba las asignaciones reales.
  it('en modo borrador, reabrirlo no reutiliza filas cacheadas de la apertura anterior', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
    const open = () => render(
      <QueryClientProvider client={queryClient}>
        <ProductDeliveryAssignmentModal
          cardId={1} deliveryDates={['2026-09-01', '2026-10-15']} canEdit={true}
          onClose={vi.fn()} onSaveDraft={vi.fn()}
        />
      </QueryClientProvider>,
    )

    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValueOnce([
      makeRow({ assigned_delivery_date: null, suggested_delivery_date: '2026-10-15' }),
    ])
    const first = open()
    await screen.findByText('P-001')
    first.unmount()

    // Entre aperturas el servidor ya tiene la asignación guardada.
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValueOnce([
      makeRow({ assigned_delivery_date: '2026-09-01', suggested_delivery_date: '2026-10-15' }),
    ])
    open()
    await screen.findByText('P-001')

    await waitFor(() => {
      const select = document.querySelector('select') as HTMLSelectElement
      expect(select.value).toBe('2026-09-01')
    })
    expect(mockedApi.pipeline.productDeliveryAssignments.list).toHaveBeenCalledTimes(2)
  })
})
