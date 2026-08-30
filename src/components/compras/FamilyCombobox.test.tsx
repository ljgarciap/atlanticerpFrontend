import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FamilyCombobox } from './FamilyCombobox'
import { comprasApi } from '@/api/comprasApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}))

// Reconciliado en consolidación 2026-08-15 — FamilyCombobox lee y crea vía comprasApi.families
// (SCRUM-764 + InventoryController::storeFamily del batch4 backend), nunca ventasDisenoApi. Sin
// mockear @/api/comprasApi completo acá, el import real de comprasApi.ts carga authApi.ts ->
// authStore.ts -> src/i18n/index.ts de verdad, y el mock parcial de react-i18next de arriba (solo
// useTranslation) no expone initReactI18next que ese init real necesita.
vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    families: { list: vi.fn(), create: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function renderCombobox(value: number | '' = '', onChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <FamilyCombobox id="fam" value={value} onChange={onChange} />
    </QueryClientProvider>,
  )
  return { onChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.families.list.mockResolvedValue({
    restricted: false, can_manage: true,
    data: [
      { id: 1, name: 'Iluminación Exterior', description: null, product_count: 3, total_value: 100 },
      { id: 2, name: 'Colgantes Sala', description: null, product_count: 5, total_value: 200 },
    ],
    meta: { total: 2, per_page: 20, current_page: 1, last_page: 1 },
  })
})

describe('FamilyCombobox (SCRUM-237/240)', () => {
  it('escribir el nombre de una familia existente la muestra como opción para elegir (no crear)', async () => {
    renderCombobox()
    const input = screen.getByLabelText('compras:inventory.detail.family', { exact: false })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Colgantes Sala' } })

    await waitFor(() => expect(screen.getByText('Colgantes Sala')).toBeInTheDocument())
    expect(screen.queryByText(/familyCreate/)).not.toBeInTheDocument()
  })

  it('escribir un nombre nuevo ofrece "Crear familia" y la crea+selecciona al elegirla', async () => {
    mockedComprasApi.families.create.mockResolvedValue({
      id: 99, name: 'Rieles LED', description: null,
    })
    const { onChange } = renderCombobox()
    const input = screen.getByLabelText('compras:inventory.detail.family', { exact: false })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Rieles LED' } })

    await waitFor(() => expect(screen.getByText(/familyCreate/)).toBeInTheDocument())
    fireEvent.mouseDown(screen.getByText(/familyCreate/))

    await waitFor(() => expect(mockedComprasApi.families.create).toHaveBeenCalledWith('Rieles LED'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(99))
  })

  it('con una familia ya seleccionada, muestra su nombre y un botón para cambiarla', async () => {
    renderCombobox(1)
    await waitFor(() => expect(screen.getByText('Iluminación Exterior')).toBeInTheDocument())
    expect(screen.getByText('compras:inventory.detail.familyChange')).toBeInTheDocument()
  })
})
