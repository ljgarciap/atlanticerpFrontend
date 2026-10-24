import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ArchitectsPage from './ArchitectsPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { Architect, ArchitectDetail } from '@/types/ventasDiseno'

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

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    architects: { listAll: vi.fn(), get: vi.fn(), update: vi.fn() },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeArchitect(overrides: Partial<Architect> = {}): Architect {
  return { id: 1, name: 'Arq. Fernando Solís', phone: '6000-0000', email: 'fernando@example.com', ...overrides }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ArchitectsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.architects.listAll.mockResolvedValue([makeArchitect()])
})

describe('ArchitectsPage', () => {
  it('muestra el listado global de arquitectos', async () => {
    renderPage()
    expect(await screen.findByText('Arq. Fernando Solís')).toBeInTheDocument()
    expect(screen.getByText('6000-0000')).toBeInTheDocument()
    expect(screen.getByText('fernando@example.com')).toBeInTheDocument()
    expect(mockedApi.architects.listAll).toHaveBeenCalledWith('')
  })

  it('muestra el estado vacío cuando no hay arquitectos', async () => {
    mockedApi.architects.listAll.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('ventasDiseno:architects.table.empty')).toBeInTheDocument()
  })

  it('buscar dispara una nueva consulta con el término', async () => {
    renderPage()
    await screen.findByText('Arq. Fernando Solís')

    fireEvent.change(screen.getByPlaceholderText('common:labels.searchPlaceholder'), { target: { value: 'Fernando' } })

    await waitFor(() => expect(mockedApi.architects.listAll).toHaveBeenCalledWith('Fernando'))
  })

  it('clic en una fila abre el detalle del arquitecto', async () => {
    mockedApi.architects.get.mockResolvedValue({ ...makeArchitect(), projects: [] } as ArchitectDetail)
    renderPage()
    fireEvent.click(await screen.findByText('Arq. Fernando Solís'))

    await waitFor(() => expect(mockedApi.architects.get).toHaveBeenCalledWith(1))
    expect(await screen.findByText('ventasDiseno:architects.detail.title')).toBeInTheDocument()
  })
})
