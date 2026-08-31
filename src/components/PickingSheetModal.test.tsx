import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import PickingSheetModal from './PickingSheetModal'
import {
  useOrderDetail, useOrderPickingSheet, useUpdatePickingSheet, useCompletePicking, useExportPickingSheetExcel,
} from '@/hooks/useBodega'
import type { OrderDetail, OrderPickingSheetResponse } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/hooks/useBodega', () => ({
  useOrderDetail: vi.fn(),
  useOrderPickingSheet: vi.fn(),
  useUpdatePickingSheet: vi.fn(),
  useCompletePicking: vi.fn(),
  useExportPickingSheetExcel: vi.fn(),
}))

const mockedUseOrderDetail = vi.mocked(useOrderDetail)
const mockedUseOrderPickingSheet = vi.mocked(useOrderPickingSheet)
const mockedUseUpdatePickingSheet = vi.mocked(useUpdatePickingSheet)
const mockedUseCompletePicking = vi.mocked(useCompletePicking)
const mockedUseExportPickingSheetExcel = vi.mocked(useExportPickingSheetExcel)

function detail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 7,
    order_number: 'PED-2026-0007',
    order_type: 'pedido',
    stage: 'en_picking',
    proyecto: 'Torre Azul',
    cliente: 'Constructora Pacífico',
    vendedor: 'Mark',
    asistente: 'Asistente Bodega Test 2',
    picker: 'Ayudante General Bodega Test',
    repartidor: null,
    fecha_entrega_comprometida: '2026-08-01',
    is_atrasado: false,
    is_sin_stock: false,
    eta_proveedor: null,
    invoice_ready: false,
    family: { sequence_in_family: null, total_in_family: null, badge: null },
    items_summary: { product_count: 2, unit_count: 6 },
    items: [],
    documents: [],
    contacto_cliente: null,
    contacto_telefono: null,
    contacto_correo: null,
    direccion_entrega: null,
    cliente_master: 'Constructora Pacífico Holdings',
    subcliente: 'Constructora Pacífico',
    ...overrides,
  }
}

function sheet(overrides: Partial<OrderPickingSheetResponse> = {}): OrderPickingSheetResponse {
  return {
    order_id: 7,
    editable: true,
    items: [
      { id: 100, reference: 'REF-PUB-001', factory_reference: 'FAB-001', description: 'Lampara colgante', location: 'A-01', found_at: null, found_location: null, found_note: null, qty_requested: 4, qty_picked: 0, picking_notes: null },
      { id: 101, reference: 'REF-PUB-002', factory_reference: null, description: 'Foco LED', location: 'B-02', found_at: null, found_location: null, found_note: null, qty_requested: 2, qty_picked: 0, picking_notes: null },
    ],
    ...overrides,
  }
}

let updateMutateMock: ReturnType<typeof vi.fn>
let completeMutateMock: ReturnType<typeof vi.fn>
let exportMutateMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  updateMutateMock = vi.fn()
  completeMutateMock = vi.fn()
  exportMutateMock = vi.fn()
  mockedUseOrderDetail.mockReturnValue({ data: detail(), isLoading: false } as ReturnType<typeof useOrderDetail>)
  mockedUseOrderPickingSheet.mockReturnValue({ data: sheet(), isLoading: false } as unknown as ReturnType<typeof useOrderPickingSheet>)
  mockedUseUpdatePickingSheet.mockReturnValue({ mutate: updateMutateMock, isPending: false } as unknown as ReturnType<typeof useUpdatePickingSheet>)
  mockedUseCompletePicking.mockReturnValue({ mutate: completeMutateMock, isPending: false } as unknown as ReturnType<typeof useCompletePicking>)
  mockedUseExportPickingSheetExcel.mockReturnValue({ mutate: exportMutateMock, isPending: false } as unknown as ReturnType<typeof useExportPickingSheetExcel>)
})

describe('PickingSheetModal', () => {
  it('REQ-315 — renderiza los artículos ya ordenados por el backend, sin reordenar en frontend', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    const table = screen.getByTestId('picking-sheet-table')
    expect(table).toHaveTextContent('Lampara colgante')
    expect(table).toHaveTextContent('Foco LED')
    expect(screen.getByTestId('picking-row-100')).toBeInTheDocument()
    expect(screen.getByTestId('picking-row-101')).toBeInTheDocument()
  })

  it('SCRUM-385 (corrección 2026-08-11) — encabezado en 2 columnas explícitas: izquierda = Cliente Master/Subcliente/Proyecto/Entrega al Cliente, derecha = Generado/Asignado a Picking/Asistente/Vendedor', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)

    const left = screen.getByTestId('picking-sheet-meta-left')
    expect(left).toHaveTextContent('Constructora Pacífico Holdings')
    expect(left).toHaveTextContent('Constructora Pacífico')
    expect(left).toHaveTextContent('Torre Azul')

    const right = screen.getByTestId('picking-sheet-meta-right')
    expect(right).toHaveTextContent('Ayudante General Bodega Test')
    expect(right).toHaveTextContent('Asistente Bodega Test 2')
    expect(right).toHaveTextContent('Mark')
    // El campo combinado "Cliente / Proyecto" ya no existe como tal.
    expect(screen.queryByText('bodega:pedidos.pickingSheetModal.meta.client')).not.toBeInTheDocument()
  })

  // SCRUM-385 (rebote de Gerencia Test 2026-08-13, con imagen) — la corrección de 2026-08-11
  // usaba anchos en PORCENTAJE de `w-full`, que dentro del modal daban columnas más angostas que
  // el contenido de ancho fijo que llevan adentro (input de Alistada w-20, de Observación w-40) —
  // el contenido se salía de su celda y se montaba sobre la columna vecina. El fix real usa un
  // `min-w` en px suficiente para las 9 columnas y deja que el contenedor haga scroll horizontal
  // (RN1: ninguna columna se superpone, sin depender del ancho del modal).
  it('rebote 2026-08-13 — la tabla tiene ancho mínimo en px (no w-full) para que ninguna columna se comprima sobre otra', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    const table = screen.getByTestId('picking-sheet-table')

    expect(table.className).toMatch(/min-w-\[\d+px\]/)
    expect(table.className).not.toMatch(/\bw-full\b/)

    const cols = table.querySelectorAll('colgroup col')
    expect(cols).toHaveLength(9)
    const totalColsWidth = Array.from(cols).reduce((sum, col) => {
      const match = col.className.match(/w-\[(\d+)px\]/)
      return sum + (match ? Number(match[1]) : 0)
    }, 0)
    // Suficiente para el input de Alistada (80px) + ícono editar y el de Observación (160px) +
    // padding, sin comprimirse — el número exacto no importa, que sea generoso sí.
    expect(totalColsWidth).toBeGreaterThanOrEqual(1000)
  })

  it('SCRUM-388 (corrección 2026-08-11) — columna "Encontrado en" muestra la nota armada por el backend, no un booleano crudo', () => {
    mockedUseOrderPickingSheet.mockReturnValue({
      data: sheet({ items: [
        { id: 100, reference: 'REF-PUB-001', factory_reference: 'FAB-001', description: 'Lampara colgante', location: 'A-01', found_at: true, found_location: 'B-02', found_note: 'Nueva ubicación: B-02 — Confirmado por Esteban', qty_requested: 4, qty_picked: 0, picking_notes: null },
      ] }),
      isLoading: false,
    } as unknown as ReturnType<typeof useOrderPickingSheet>)

    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)

    expect(screen.getByTestId('picking-found-note-100')).toHaveTextContent('Nueva ubicación: B-02 — Confirmado por Esteban')
    // La ubicación original (columna "Ubicación") nunca se pisa con la nueva.
    expect(screen.getByTestId('picking-row-100')).toHaveTextContent('A-01')
  })

  it('REQ-315 (Pre-QA 2026-07-27) — columna "Ref. fábrica" presente, con fallback "—" si el producto no la tiene', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    const table = screen.getByTestId('picking-sheet-table')
    expect(table).toHaveTextContent('bodega:pedidos.pickingSheetModal.columns.factoryRef')
    expect(screen.getByTestId('picking-row-100')).toHaveTextContent('FAB-001')
    expect(screen.getByTestId('picking-row-101')).toHaveTextContent('—')
  })

  it('REQ-315 (Pre-QA 2026-07-27) — columna "Observación" editable persiste vía useUpdatePickingSheet al perder el foco', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    const notesInput = screen.getByTestId('picking-notes-input-100')
    fireEvent.change(notesInput, { target: { value: 'Se encontró en anaquel B' } })
    fireEvent.blur(notesInput)

    expect(updateMutateMock).toHaveBeenCalledWith(
      { orderId: 7, items: [{ order_item_id: 100, qty_picked: 4, picking_notes: 'Se encontró en anaquel B' }] },
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })

  it('REQ-315 (Pre-QA 2026-07-27) — "Observación" respeta el límite de 500 caracteres del backend (maxLength en el input)', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    expect(screen.getByTestId('picking-notes-input-100')).toHaveAttribute('maxLength', '500')
  })

  it('REQ-315 (Pre-QA 2026-07-27) — un 422 real al guardar "Observación" se muestra inline por fila', () => {
    updateMutateMock.mockImplementation((_vars, { onError }) => {
      onError({
        isAxiosError: true,
        response: { status: 422, data: { message: 'genérico', errors: { 'items.0.picking_notes': ['El campo no debe ser mayor que 500 caracteres.'] } } },
      })
    })
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    const notesInput = screen.getByTestId('picking-notes-input-100')
    fireEvent.change(notesInput, { target: { value: 'x'.repeat(500) } })
    fireEvent.blur(notesInput)

    expect(screen.getByTestId('picking-notes-error-100')).toHaveTextContent('El campo no debe ser mayor que 500 caracteres.')
  })

  it('RN3 (REQ-315) — con editable=false, "Observación" es de solo lectura (sin input)', () => {
    mockedUseOrderPickingSheet.mockReturnValue({
      data: sheet({ editable: false, items: [
        { id: 100, reference: 'REF-PUB-001', factory_reference: 'FAB-001', description: 'Lampara colgante', location: 'A-01', found_at: null, found_location: null, found_note: null, qty_requested: 4, qty_picked: 3, picking_notes: 'Nota guardada' },
      ] }),
      isLoading: false,
    } as unknown as ReturnType<typeof useOrderPickingSheet>)
    mockedUseOrderDetail.mockReturnValue({ data: detail({ stage: 'packing' }), isLoading: false } as ReturnType<typeof useOrderDetail>)

    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)

    expect(screen.queryByTestId('picking-notes-input-100')).not.toBeInTheDocument()
    expect(screen.getByTestId('picking-row-100')).toHaveTextContent('Nota guardada')
  })

  it('REQ-315 RN2 — "Alistada" arranca bloqueada, requiere "Editar" para modificar', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    expect(screen.queryByTestId('picking-alistada-input-100')).not.toBeInTheDocument()
    expect(screen.getByTestId('picking-alistada-locked-100')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('picking-edit-btn-100'))
    expect(screen.getByTestId('picking-alistada-input-100')).toBeInTheDocument()
  })

  it('editar "Alistada" y perder el foco persiste la cantidad vía useUpdatePickingSheet', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('picking-edit-btn-100'))
    const input = screen.getByTestId('picking-alistada-input-100')
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.blur(input)

    expect(updateMutateMock).toHaveBeenCalledWith({ orderId: 7, items: [{ order_item_id: 100, qty_picked: 3, picking_notes: '' }] })
  })

  it('REQ-316 RN1 — no permite completar sin marcar "Recogido" en todos los artículos', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('picking-recogido-100'))
    // Solo uno de los 2 marcado — al intentar completar debe rechazar sin llamar al backend.
    fireEvent.click(screen.getByTestId('picking-completado-checkbox'))

    expect(screen.getByTestId('picking-completado-error')).toBeInTheDocument()
    expect(completeMutateMock).not.toHaveBeenCalled()
  })

  it('REQ-316 — marcando todos "Recogido" y completando dispara useCompletePicking con el payload completo', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('picking-recogido-100'))
    fireEvent.click(screen.getByTestId('picking-recogido-101'))
    fireEvent.click(screen.getByTestId('picking-completado-checkbox'))

    expect(completeMutateMock).toHaveBeenCalledWith(
      { orderId: 7, items: [{ order_item_id: 100, qty_picked: 4 }, { order_item_id: 101, qty_picked: 2 }] },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('REQ-317 — cuando el backend devuelve una Revisión de Inventario, se informa sin reconstruir su UI de resolución', async () => {
    completeMutateMock.mockImplementation((_vars, { onSuccess }) => {
      onSuccess({ order: { id: 7, stage: 'packing' }, review: { id: 55, order_number: 'PED-2026-0007' } })
    })
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('picking-recogido-100'))
    fireEvent.click(screen.getByTestId('picking-recogido-101'))
    fireEvent.click(screen.getByTestId('picking-completado-checkbox'))

    await waitFor(() => expect(screen.getByTestId('picking-completed-banner')).toBeInTheDocument())
    expect(screen.getByTestId('picking-completed-banner')).toHaveTextContent('PED-2026-0007')
  })

  it('un error real del backend al completar se muestra inline (patrón errors/message confirmado)', () => {
    completeMutateMock.mockImplementation((_vars, { onError }) => {
      onError({
        isAxiosError: true,
        response: { status: 422, data: { message: 'genérico', errors: { items: ['Faltan artículos por marcar como recogidos.'] } } },
      })
    })
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('picking-recogido-100'))
    fireEvent.click(screen.getByTestId('picking-recogido-101'))
    fireEvent.click(screen.getByTestId('picking-completado-checkbox'))

    expect(screen.getByTestId('picking-completado-error')).toHaveTextContent('Faltan artículos por marcar como recogidos.')
  })

  it('RN3 (REQ-315) — cuando editable=false, la hoja es de solo consulta: sin checkboxes ni "Editar", muestra qty_picked real', () => {
    mockedUseOrderPickingSheet.mockReturnValue({
      data: sheet({ editable: false, items: [
        { id: 100, reference: 'REF-PUB-001', factory_reference: 'FAB-001', description: 'Lampara colgante', location: 'A-01', found_at: null, found_location: null, found_note: null, qty_requested: 4, qty_picked: 3, picking_notes: null },
      ] }),
      isLoading: false,
    } as unknown as ReturnType<typeof useOrderPickingSheet>)
    mockedUseOrderDetail.mockReturnValue({ data: detail({ stage: 'packing' }), isLoading: false } as ReturnType<typeof useOrderDetail>)

    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)

    expect(screen.queryByTestId('picking-recogido-100')).not.toBeInTheDocument()
    expect(screen.queryByTestId('picking-edit-btn-100')).not.toBeInTheDocument()
    expect(screen.queryByTestId('picking-completado-checkbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('picking-row-100')).toHaveTextContent('3')
    expect(screen.getByTestId('picking-sheet-sub')).toHaveTextContent('bodega:pedidos.pickingSheetModal.readOnly')
  })

  it('descargar Excel dispara useExportPickingSheetExcel para el pedido correcto', () => {
    render(<PickingSheetModal orderId={7} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('bodega:pedidos.pickingSheetModal.downloadExcel'))
    expect(exportMutateMock).toHaveBeenCalledWith(7, expect.objectContaining({ onSuccess: expect.any(Function) }))
  })

  it('el botón "Cerrar" dispara onClose', () => {
    const onClose = vi.fn()
    render(<PickingSheetModal orderId={7} onClose={onClose} />)
    fireEvent.click(screen.getByText('common:actions.close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
