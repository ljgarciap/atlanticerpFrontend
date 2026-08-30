import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProvidersPage from './ProvidersPage'
import { comprasApi } from '@/api/comprasApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) =>
      typeof opts === 'object' && opts && 'count' in opts ? `${key} ${(opts as { count: number }).count}` : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    providers: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() },
    orders: { list: vi.fn(), get: vi.fn(), create: vi.fn(), approve: vi.fn() },
    approvedProjects: { search: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

const LIST_RESPONSE = {
  fuzzy: false,
  kpis: { total_providers: 2, average_rating: null, low_rating_count: 0, active_categories: 1, categories: ['china'] },
  data: [
    { id: 1, name: 'LightCorp', category: 'china' as const, origin: 'internacional' as const, currency: 'USD', is_active: true, contact_name: 'Wei Chen', rating: null, last_purchase_at: null },
    { id: 2, name: 'Iluminex SA', category: null, origin: 'internacional' as const, currency: 'USD', is_active: true, contact_name: null, rating: null, last_purchase_at: '2026-07-14' },
  ],
  meta: { total: 2, per_page: 5, current_page: 1, last_page: 1 },
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProvidersPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.providers.list.mockResolvedValue(LIST_RESPONSE)
})

describe('ProvidersPage', () => {
  it('lista los proveedores con sus columnas', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.getByText('Iluminex SA')).toBeInTheDocument()
  })

  it('muestra "Sin calificar" y "Sin compras registradas aún" cuando corresponde', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    // 2 filas + el KPI "Calificación promedio" (también null) reusan la misma clave.
    expect(screen.getAllByText('compras:providers.table.notRated')).toHaveLength(3)
    expect(screen.getByText('compras:providers.table.noPurchases')).toBeInTheDocument()
    expect(screen.getByText('2026-07-14')).toBeInTheDocument()
  })

  it('muestra los 4 KPIs', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())
    expect(screen.getByText('compras:providers.kpis.total')).toBeInTheDocument()
    expect(screen.getByText('compras:providers.kpis.averageRating')).toBeInTheDocument()
    expect(screen.getByText('compras:providers.kpis.lowRating')).toBeInTheDocument()
    expect(screen.getByText('compras:providers.kpis.categories')).toBeInTheDocument()
  })

  it('busca por nombre y resetea a la página 1', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('compras:providers.filters.searchPlaceholder'), { target: { value: 'LightCorp' } })
    fireEvent.click(screen.getByText('common:actions.search'))

    await waitFor(() => expect(mockedComprasApi.providers.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'LightCorp', page: 1 }),
    ))
  })

  it('el chip de calificación baja sincroniza con el filtro rating_range', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:providers.filters.lowRatingChip'))

    await waitFor(() => expect(mockedComprasApi.providers.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ rating_range: 'low' }),
    ))
  })

  it('abre el drawer de creación al hacer clic en "Agregar proveedor"', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:providers.actions.create'))
    expect(screen.getByText('compras:providerForm.titleCreate')).toBeInTheDocument()
  })

  // SCRUM-186 (2026-08-06, hallazgo Daniela Amaya): columnas realineadas al mockup — Contacto
  // reemplaza Moneda, "Editar" pasa a "Ver detalle" y abre el modal de solo-lectura, no el drawer.
  it('muestra la columna Contacto y "Ver detalle" abre el modal de solo-lectura', async () => {
    mockedComprasApi.providers.get.mockResolvedValue({
      id: 1, name: 'LightCorp', category: 'china', origin: 'internacional', currency: 'USD',
      is_active: true, contact_name: 'Wei Chen', rating: null, last_purchase_at: null,
      whatsapp: null, phone: null, email: null, address: null, country: null,
      bank_name: null, bank_account_number: null, bank_swift: null, bank_beneficiary: null,
    })
    renderPage()
    await waitFor(() => expect(screen.getByText('LightCorp')).toBeInTheDocument())

    expect(screen.getByText('compras:providers.table.contact')).toBeInTheDocument()
    expect(screen.getByText('Wei Chen')).toBeInTheDocument()
    expect(screen.getByText('compras:providers.table.noContact')).toBeInTheDocument()
    expect(screen.queryByText('compras:providers.table.currency')).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: 'compras:providers.table.actions' })[0])
    expect(await screen.findByText('compras:providerForm.titleDetail')).toBeInTheDocument()
    expect(screen.queryByText('compras:providerForm.titleCreate')).toBeNull()
  })
})
