import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WarehouseMultiSelect } from './WarehouseMultiSelect'
import { comprasApi } from '@/api/comprasApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) {
        const parts = Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(',')
        return `${key} ${parts}`
      }
      return key
    },
  }),
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    warehouses: { list: vi.fn() },
  },
}))

const mockedApi = vi.mocked(comprasApi, true)

const WAREHOUSES = [
  { id: 1, name: 'Atlantic' },
  { id: 2, name: 'Bodega Norte' },
  { id: 3, name: 'Bodega Sur' },
]

function Harness({ initial = [] as number[] }: { initial?: number[] }) {
  const [selected, setSelected] = useState<number[]>(initial)
  return <WarehouseMultiSelect selectedIds={selected} onChange={setSelected} />
}

function renderComponent(initial: number[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
})

describe('WarehouseMultiSelect — estado cerrado', () => {
  it('sin selección muestra "todas las bodegas", no un dropdown de selección única', async () => {
    renderComponent()
    await waitFor(() => expect(mockedApi.warehouses.list).toHaveBeenCalled())

    expect(screen.getByText('inventory.filters.warehousesAll')).toBeInTheDocument()
    // Nunca un <select> nativo (criterio 9 del ticket — jamás single-select).
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('con selección muestra el resumen visible en el filtro cerrado (no solo dentro del dropdown)', async () => {
    renderComponent([1, 2])

    expect(await screen.findByText('inventory.filters.warehousesCount count=2')).toBeInTheDocument()
    // Chips de la selección vigente, visibles con el dropdown cerrado — solo aparecen una vez
    // que useWarehouses() resuelve (los chips necesitan el nombre real de cada bodega).
    expect(await screen.findByText('Atlantic')).toBeInTheDocument()
    expect(screen.getByText('Bodega Norte')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('WarehouseMultiSelect — dropdown', () => {
  it('al hacer clic despliega la lista completa de bodegas con checkboxes', async () => {
    renderComponent()
    await waitFor(() => expect(mockedApi.warehouses.list).toHaveBeenCalled())

    fireEvent.click(screen.getByText('inventory.filters.warehousesAll'))

    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeInTheDocument()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(3)
    checkboxes.forEach(cb => expect(cb).not.toBeChecked())
  })

  it('selección múltiple simultánea: marcar 2 bodegas deja ambas seleccionadas', async () => {
    renderComponent()
    await waitFor(() => expect(mockedApi.warehouses.list).toHaveBeenCalled())
    fireEvent.click(screen.getByText('inventory.filters.warehousesAll'))

    fireEvent.click(screen.getByLabelText('Atlantic'))
    fireEvent.click(screen.getByLabelText('Bodega Sur'))

    await waitFor(() => expect(screen.getByText('inventory.filters.warehousesCount count=2')).toBeInTheDocument())
    expect(screen.getByLabelText('Atlantic')).toBeChecked()
    expect(screen.getByLabelText('Bodega Sur')).toBeChecked()
    expect(screen.getByLabelText('Bodega Norte')).not.toBeChecked()
  })

  it('"Seleccionar todas" marca las 3 bodegas', async () => {
    renderComponent()
    await waitFor(() => expect(mockedApi.warehouses.list).toHaveBeenCalled())
    fireEvent.click(screen.getByText('inventory.filters.warehousesAll'))

    fireEvent.click(screen.getByText('inventory.filters.selectAllWarehouses'))

    await waitFor(() => expect(screen.getByText('inventory.filters.warehousesCount count=3')).toBeInTheDocument())
    screen.getAllByRole('checkbox').forEach(cb => expect(cb).toBeChecked())
  })

  it('"Limpiar selección" deselecciona todo y vuelve al estado "todas"', async () => {
    renderComponent([1, 2, 3])
    await waitFor(() => expect(mockedApi.warehouses.list).toHaveBeenCalled())
    fireEvent.click(screen.getByText('inventory.filters.warehousesCount count=3'))

    fireEvent.click(screen.getByText('inventory.filters.clearWarehouses'))

    await waitFor(() => expect(screen.getByText('inventory.filters.warehousesAll')).toBeInTheDocument())
    screen.getAllByRole('checkbox').forEach(cb => expect(cb).not.toBeChecked())
  })

  it('quitar 1 bodega individual desde el checkbox no afecta el resto de la selección', async () => {
    renderComponent([1, 2, 3])
    await waitFor(() => expect(mockedApi.warehouses.list).toHaveBeenCalled())
    fireEvent.click(screen.getByText('inventory.filters.warehousesCount count=3'))

    fireEvent.click(screen.getByLabelText('Bodega Norte'))

    await waitFor(() => expect(screen.getByText('inventory.filters.warehousesCount count=2')).toBeInTheDocument())
    expect(screen.getByLabelText('Atlantic')).toBeChecked()
    expect(screen.getByLabelText('Bodega Sur')).toBeChecked()
    expect(screen.getByLabelText('Bodega Norte')).not.toBeChecked()
  })

  it('quitar 1 bodega desde el chip visible (dropdown cerrado) no afecta el resto', async () => {
    renderComponent([1, 2])

    fireEvent.click(await screen.findByLabelText('inventory.filters.removeWarehouse name=Atlantic'))

    await waitFor(() => expect(screen.getByText('inventory.filters.warehousesCount count=1')).toBeInTheDocument())
    expect(screen.getByText('Bodega Norte')).toBeInTheDocument()
    expect(screen.queryByText('Atlantic')).not.toBeInTheDocument()
  })

  it('cierra el dropdown al hacer clic afuera', async () => {
    renderComponent()
    await waitFor(() => expect(mockedApi.warehouses.list).toHaveBeenCalled())
    fireEvent.click(screen.getByText('inventory.filters.warehousesAll'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    // Overlay fixed inset-0 — mismo patrón de clic-afuera que NotificationBell.
    fireEvent.click(document.querySelector('.fixed.inset-0') as Element)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
