import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DropResult } from '@hello-pangea/dnd'
import QuotePartsList from './QuotePartsList'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { QuotePartRef, QuoteItemRef } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: number } }) => unknown) => selector({ user: { id: 7 } }),
}))

// El arrastre real no se simula en jsdom: se captura `onDragEnd` y se invoca con el resultado que produciría una soltada.
let dragEnd: (r: DropResult) => void = () => {}
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (r: DropResult) => void }) => {
    dragEnd = onDragEnd
    return <>{children}</>
  },
  Droppable: ({ children }: { children: (p: unknown) => React.ReactNode }) =>
    <>{children({ innerRef: () => {}, droppableProps: {}, placeholder: null })}</>,
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => React.ReactNode }) =>
    <>{children({ innerRef: () => {}, draggableProps: {}, dragHandleProps: { 'data-rfd': 'x' } }, { isDragging: false })}</>,
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    quotes: {
      parts: {
        update: vi.fn(), remove: vi.fn(), duplicate: vi.fn(), reorder: vi.fn(),
        items: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), bulkCreate: vi.fn(), previewPrice: vi.fn(), uploadPhoto: vi.fn(), reorder: vi.fn() },
      },
    },
    catalogProducts: { search: vi.fn(), get: vi.fn() },
    catalogProductFamilies: { list: vi.fn(), get: vi.fn() },
  },
}))

const api = vi.mocked(ventasDisenoApi, true).quotes.parts

function item(id: number, reference: string): QuoteItemRef {
  return {
    id, catalog_product_id: null, is_custom: true, reference, description: `Desc ${reference}`, quantity: 1, unit_price: 10, cost: null,
    price_type_override: null, discount_percent: null, effective_unit_price: 10, line_total: 10,
    stock_quantity: null, below_min_margin: false, photo_url: null,
  }
}
function part(id: number, name: string, items: QuoteItemRef[], subtotal = 10): QuotePartRef {
  return { id, name, position: id - 1, subtotal, items }
}

const parts = (): QuotePartRef[] => [
  part(1, 'Sala', [item(11, 'A1'), item(12, 'A2'), item(13, 'A3')], 30),
  part(2, 'Cocina', [item(21, 'B1')], 10),
  part(3, 'Baño', [item(31, 'C1')], 10),
]

let qc: QueryClient
function renderList(p: QuotePartRef[] = parts(), canEdit = true) {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['ventas-diseno-quote', 1], { id: 1, parts: p })
  const ui = (list: QuotePartRef[]) => (
    <QueryClientProvider client={qc}>
      <QuotePartsList quote={{ id: 1, parts: list }} discountMode="line" canEdit={canEdit} canSeeCost minMarginPercent={30} quotePriceType="public" />
    </QueryClientProvider>
  )
  return { ...render(ui(p)), ui }
}

const drop = (type: 'PART' | 'ITEM', sourceId: string, from: number, destId: string | null, to: number): DropResult => ({
  draggableId: 'x', type, mode: 'FLUID', reason: 'DROP', combine: null,
  source: { droppableId: sourceId, index: from },
  destination: destId === null ? null : { droppableId: destId, index: to },
})

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  api.reorder.mockResolvedValue(undefined)
  api.items.reorder.mockResolvedValue(undefined)
})

describe('QuotePartsList — colapsar (SCRUM-1161)', () => {
  it('al colapsar una partida oculta el detalle y deja visibles el nombre y el subtotal', () => {
    renderList()
    expect(screen.getByTestId('part-content-1')).toBeVisible()
    fireEvent.click(screen.getByTestId('part-toggle-1'))
    expect(screen.getByTestId('part-content-1')).not.toBeVisible()
    expect(screen.getByDisplayValue('Sala')).toBeVisible()
    expect(screen.getByTestId('part-collapsed-subtotal-1')).toHaveTextContent('$30')
    expect(screen.getByTestId('part-toggle-1')).toHaveAttribute('aria-expanded', 'false')
    // Las demás siguen expandidas.
    expect(screen.getByTestId('part-content-2')).toBeVisible()

    fireEvent.click(screen.getByTestId('part-toggle-1'))
    expect(screen.getByTestId('part-content-1')).toBeVisible()
    expect(screen.queryByTestId('part-collapsed-subtotal-1')).not.toBeInTheDocument()
  })

  it('colapsar no toca los datos: no llama a ningún endpoint y conserva lo escrito sin guardar', () => {
    renderList()
    const desc = screen.getAllByDisplayValue('Desc A1')[0]
    fireEvent.change(desc, { target: { value: 'Editada' } })
    fireEvent.click(screen.getByTestId('part-toggle-1'))
    fireEvent.click(screen.getByTestId('part-toggle-1'))
    expect(screen.getByDisplayValue('Editada')).toBeInTheDocument()
    expect(api.update).not.toHaveBeenCalled()
    expect(api.reorder).not.toHaveBeenCalled()
  })

  it('«Colapsar todas» / «Expandir todas»', () => {
    renderList()
    fireEvent.click(screen.getByTestId('quote-parts-toggle-all'))
    for (const id of [1, 2, 3]) expect(screen.getByTestId(`part-content-${id}`)).not.toBeVisible()
    expect(screen.getByTestId('quote-parts-toggle-all')).toHaveTextContent('quote.expandAll')
    fireEvent.click(screen.getByTestId('quote-parts-toggle-all'))
    for (const id of [1, 2, 3]) expect(screen.getByTestId(`part-content-${id}`)).toBeVisible()
  })

  it('recuerda lo colapsado al recargar la pestaña y todo arranca expandido si no hay nada guardado', () => {
    const first = renderList()
    fireEvent.click(screen.getByTestId('part-toggle-2'))
    first.unmount()

    renderList()
    expect(screen.getByTestId('part-content-2')).not.toBeVisible()
    expect(screen.getByTestId('part-content-1')).toBeVisible()
  })

  it('ignora un valor guardado malformado', () => {
    window.sessionStorage.setItem('atlanticerp:draft:quote-collapsed:1:7', '{"x":1}')
    renderList()
    for (const id of [1, 2, 3]) expect(screen.getByTestId(`part-content-${id}`)).toBeVisible()
  })
})

describe('QuotePartsList — reordenar partidas (SCRUM-1161)', () => {
  it('mover la partida 3 a la posición 1 guarda el nuevo orden y actualiza la pantalla al instante', async () => {
    renderList()
    act(() => dragEnd(drop('PART', 'quote-parts', 2, 'quote-parts', 0)))
    await waitFor(() => expect(api.reorder).toHaveBeenCalledWith(1, [3, 1, 2]))
    const cached = qc.getQueryData<{ parts: QuotePartRef[] }>(['ventas-diseno-quote', 1])
    expect(cached?.parts.map(p => p.id)).toEqual([3, 1, 2])
  })

  it('soltar en el mismo lugar o fuera de la lista no guarda nada', () => {
    renderList()
    act(() => dragEnd(drop('PART', 'quote-parts', 1, 'quote-parts', 1)))
    act(() => dragEnd(drop('PART', 'quote-parts', 1, null, 0)))
    expect(api.reorder).not.toHaveBeenCalled()
  })

  it('si el servidor rechaza el orden avisa y recarga la cotización', async () => {
    api.reorder.mockRejectedValue(new Error('422'))
    renderList()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    act(() => dragEnd(drop('PART', 'quote-parts', 0, 'quote-parts', 2)))
    expect(await screen.findByTestId('quote-reorder-error')).toHaveTextContent('quote.reorderError')
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['ventas-diseno-quote', 1] }))
  })

  it('sin permiso de edición no hay asas y un arrastre no hace nada', () => {
    renderList(parts(), false)
    expect(screen.queryByTestId('part-drag-handle-1')).not.toBeInTheDocument()
    act(() => dragEnd(drop('PART', 'quote-parts', 2, 'quote-parts', 0)))
    expect(api.reorder).not.toHaveBeenCalled()
  })
})

describe('QuotePartsList — reordenar productos dentro de la partida (SCRUM-1161)', () => {
  it('mover el producto 3 a la posición 1 de su partida guarda el orden de esa partida', async () => {
    renderList()
    act(() => dragEnd(drop('ITEM', 'items-1', 2, 'items-1', 0)))
    await waitFor(() => expect(api.items.reorder).toHaveBeenCalledWith(1, 1, [13, 11, 12]))
    const cached = qc.getQueryData<{ parts: QuotePartRef[] }>(['ventas-diseno-quote', 1])
    expect(cached?.parts[0].items.map(i => i.id)).toEqual([13, 11, 12])
    expect(cached?.parts.slice(1).map(p => p.items.length)).toEqual([1, 1])
  })

  it('un producto no se mueve a otra partida', () => {
    renderList()
    act(() => dragEnd(drop('ITEM', 'items-1', 0, 'items-2', 0)))
    expect(api.items.reorder).not.toHaveBeenCalled()
    expect(api.reorder).not.toHaveBeenCalled()
  })

  it('cada partida tiene asas de arrastre en sus productos', () => {
    renderList()
    expect(screen.getByTestId('item-drag-handle-11')).toBeInTheDocument()
    expect(screen.getByTestId('part-drag-handle-1')).toBeInTheDocument()
  })
})

describe('QuotePartsList — nombre de la partida (SCRUM-1161)', () => {
  const long = 'Catalogación general del lobby principal, mezanine, pasillos de servicio y áreas comunes del piso 3 — fase 2'

  it('el campo muestra el nombre completo, se ajusta al contenido y no tiene recorte', () => {
    renderList([part(1, long, [item(11, 'A1')])])
    const input = screen.getByLabelText('ventasDiseno:quote.partName') as HTMLTextAreaElement
    expect(input.tagName).toBe('TEXTAREA')
    expect(input.value).toBe(long)
    expect(input.className).toContain('flex-1')
    expect(input.className).not.toContain('truncate')
  })

  it('Enter confirma el nombre sin meter un salto de línea', async () => {
    renderList([part(1, 'Sala', [item(11, 'A1')])])
    const input = screen.getByLabelText('ventasDiseno:quote.partName')
    fireEvent.change(input, { target: { value: 'Sala principal' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(1, 1, 'Sala principal'))
  })
})
