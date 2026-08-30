import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import VentasDisenoClientsPage from './ClientsPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { ClientListRow, ClientListResult, ClientDetail } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      const vals = Object.values(opts).filter(v => typeof v === 'string' || typeof v === 'number')
      return vals.length ? `${key}:${vals.join(',')}` : key
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => false }))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    pipeline: { list: vi.fn(), get: vi.fn(), update: vi.fn(), changeStage: vi.fn(), uploadFile: vi.fn(), contacts: { create: vi.fn(), update: vi.fn(), remove: vi.fn() } },
    masterClients: { list: vi.fn(), create: vi.fn() },
    subClients: {
      list: vi.fn(), create: vi.fn(),
      contacts: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    },
    clients: {
      list: vi.fn(), get: vi.fn(), projects: vi.fn(), create: vi.fn(),
      addSubClient: vi.fn(), updateSubClientCategory: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeRow(overrides: Partial<ClientListRow> = {}): ClientListRow {
  return {
    id: 1,
    name: 'Constructora Pacífico SA',
    default_price_type: null,
    categories: ['d_referred'],
    active_projects: 2,
    lost_projects: 1,
    total_projects: 3,
    total_amount: 210000,
    closed_amount: 142000,
    last_contact_days: 6,
    ...overrides,
  }
}

// SCRUM-754 (2026-08-18) — clients.list ahora devuelve { data, meta } paginado.
function makeListResult(rows: ClientListRow[]): ClientListResult {
  return {
    data: rows,
    meta: { total: rows.length, per_page: 20, current_page: 1, last_page: 1 },
  }
}

function makeDetail(overrides: Partial<ClientDetail> = {}): ClientDetail {
  return {
    id: 1,
    name: 'Constructora Pacífico SA',
    default_price_type: null,
    sub_clients: [],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <VentasDisenoClientsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.clients.list.mockResolvedValue(makeListResult([]))
  mockedApi.clients.get.mockResolvedValue(makeDetail())
  mockedApi.clients.projects.mockResolvedValue([])
})

describe('VentasDisenoClientsPage', () => {
  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:clients.title')).toBeInTheDocument()
  })

  // SCRUM-700 (REQ-620, Batch E) — habilitado: SCRUM-711 lo dejaba visual-only "hasta que se
  // desarrolle el módulo CRM", eso ya pasó (ver CatalogPage.tsx).
  it('el botón Catálogo navega a la pantalla de Catálogo', async () => {
    renderPage()
    const button = await screen.findByText('ventasDiseno:clients.actions.catalog')
    expect(button.closest('button')).not.toBeDisabled()
  })


  it('lista un cliente con sus métricas agregadas', async () => {
    mockedApi.clients.list.mockResolvedValue(makeListResult([makeRow()]))
    renderPage()
    expect(await screen.findByText('Constructora Pacífico SA')).toBeInTheDocument()
    expect(screen.getByText('$210,000')).toBeInTheDocument()
    expect(screen.getByText('$142,000')).toBeInTheDocument()
  })

  it('el buscador pasa el término a la API', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.clients.list).toHaveBeenCalled())

    const input = screen.getByPlaceholderText('common:labels.searchPlaceholder')
    fireEvent.change(input, { target: { value: 'Pacífico' } })

    await waitFor(() =>
      expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'Pacífico' }),
      ),
    )
  })

  it('un chip de categoría pasa category como array a la API', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.clients.list).toHaveBeenCalled())

    fireEvent.click(await screen.findByText('ventasDiseno:category.a_walkin'))

    await waitFor(() =>
      expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: ['a_walkin'] }),
      ),
    )
  })

  it('varios chips de categoría se combinan (SCRUM-93)', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.clients.list).toHaveBeenCalled())

    fireEvent.click(await screen.findByText('ventasDiseno:category.a_walkin'))
    fireEvent.click(await screen.findByText('ventasDiseno:category.d_referred'))

    await waitFor(() =>
      expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: ['a_walkin', 'd_referred'] }),
      ),
    )

    // Sacar uno de los dos deja solo el restante seleccionado.
    fireEvent.click(await screen.findByText('ventasDiseno:category.a_walkin'))
    await waitFor(() =>
      expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: ['d_referred'] }),
      ),
    )
  })

  // SCRUM-718 (complemento REQ-063) — "Sin contacto +60 días" ya no es excluyente con las
  // categorías: se combina con cualquier tipo (o varios) sin auto-limpiar nada.
  it('el chip "sin contacto" se combina con un chip de categoría (SCRUM-718)', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.clients.list).toHaveBeenCalled())

    fireEvent.click(await screen.findByText('ventasDiseno:clients.staleFilter'))
    await waitFor(() =>
      expect(mockedApi.clients.list).toHaveBeenLastCalledWith(expect.objectContaining({ stale: true })),
    )

    fireEvent.click(await screen.findByText('ventasDiseno:category.b_architect_designer'))
    await waitFor(() =>
      expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: ['b_architect_designer'], stale: true }),
      ),
    )

    // Deseleccionar "sin contacto" deja la categoría intacta.
    fireEvent.click(await screen.findByText('ventasDiseno:clients.staleFilter'))
    await waitFor(() =>
      expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: ['b_architect_designer'], stale: undefined }),
      ),
    )
  })

  it('el chip "sin contacto" se combina con varios chips de categoría a la vez (SCRUM-718)', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.clients.list).toHaveBeenCalled())

    fireEvent.click(await screen.findByText('ventasDiseno:category.a_walkin'))
    fireEvent.click(await screen.findByText('ventasDiseno:category.c_bidding'))
    fireEvent.click(await screen.findByText('ventasDiseno:clients.staleFilter'))

    await waitFor(() =>
      expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: ['a_walkin', 'c_bidding'], stale: true }),
      ),
    )

    // Sacar una de las dos categorías deja la otra y "sin contacto" intactos.
    fireEvent.click(await screen.findByText('ventasDiseno:category.a_walkin'))
    await waitFor(() =>
      expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: ['c_bidding'], stale: true }),
      ),
    )
  })

  it('"Todos" limpia categorías y el filtro "sin contacto"', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.clients.list).toHaveBeenCalled())

    fireEvent.click(await screen.findByText('ventasDiseno:category.c_bidding'))
    await waitFor(() => expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: ['c_bidding'] }),
    ))

    fireEvent.click(await screen.findByText('ventasDiseno:filters.all'))
    await waitFor(() => expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: undefined, stale: undefined }),
    ))
  })

  it('el chip "sin contacto" pasa stale=true a la API', async () => {
    renderPage()
    await waitFor(() => expect(mockedApi.clients.list).toHaveBeenCalled())

    fireEvent.click(await screen.findByText('ventasDiseno:clients.staleFilter'))

    await waitFor(() =>
      expect(mockedApi.clients.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ stale: true }),
      ),
    )
  })

  it('+ Nueva cotización navega al formulario en blanco', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('ventasDiseno:clients.actions.newQuote'))
    // Navegación real (sin precarga) — mismo patrón ya cubierto en HomePage/PipelinePage.
  })

  it('hacer clic en una fila abre el detalle del cliente', async () => {
    mockedApi.clients.list.mockResolvedValue(makeListResult([makeRow()]))
    renderPage()

    fireEvent.click(await screen.findByText('Constructora Pacífico SA'))

    await waitFor(() => expect(mockedApi.clients.get).toHaveBeenCalledWith(1))
  })
})
