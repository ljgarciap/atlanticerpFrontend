import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ClientDetailModal from './ClientDetailModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { ClientDetail } from '@/types/ventasDiseno'

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
    clients: {
      get: vi.fn(), projects: vi.fn(), create: vi.fn(),
      addSubClient: vi.fn(), updateSubClientCategory: vi.fn(),
    },
    subClients: {
      contacts: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeDetail(): ClientDetail {
  return {
    id: 1,
    name: 'Grupo Delta',
    default_price_type: 'project',
    sub_clients: [
      {
        id: 10, master_client_id: 1, business_name: 'Delta Residencial', tax_id: '155-0-1',
        delivery_address: null, category: 'a_walkin',
        contacts: [{ id: 100, name: 'Ana Pérez', role: 'client', phone: '6000-0000', email: null }],
      },
    ],
  }
}

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ClientDetailModal clientId={1} onClose={vi.fn()} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.clients.get.mockResolvedValue(makeDetail())
  mockedApi.clients.projects.mockResolvedValue([])
})

describe('ClientDetailModal', () => {
  it('muestra el Tipo de Precio y los subclientes con sus contactos', async () => {
    renderModal()
    expect(await screen.findByText('ventasDiseno:priceType.project')).toBeInTheDocument()
    expect(screen.getByText('Delta Residencial')).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
  })

  it('cambiar la categoría de un subcliente llama al API con el subcliente correcto', async () => {
    mockedApi.clients.updateSubClientCategory.mockResolvedValue(makeDetail().sub_clients[0])
    renderModal()
    await screen.findByText('Delta Residencial')

    const categorySelect = screen.getByDisplayValue('ventasDiseno:category.a_walkin')
    fireEvent.change(categorySelect, { target: { value: 'c_bidding' } })

    await waitFor(() => expect(mockedApi.clients.updateSubClientCategory).toHaveBeenCalledWith(10, 'c_bidding'))
  })

  it('agregar contacto requiere teléfono o correo antes de habilitar Agregar', async () => {
    renderModal()
    await screen.findByText('Delta Residencial')

    fireEvent.click(screen.getByText('ventasDiseno:clients.detail.addContact'))
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Nuevo Contacto' } })

    expect(screen.getByText('common:actions.add')).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('common:labels.phone'), { target: { value: '6111-1111' } })
    expect(screen.getByText('common:actions.add')).not.toBeDisabled()
  })

  it('muestra el error del backend si falla al agregar un contacto, en vez de perderlo en silencio (SCRUM-96)', async () => {
    mockedApi.subClients.contacts.create.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Error', errors: { email: ['El correo electrónico debe ser una dirección de correo válida.'] } } },
    })
    renderModal()
    await screen.findByText('Delta Residencial')

    fireEvent.click(screen.getByText('ventasDiseno:clients.detail.addContact'))
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Nuevo Contacto' } })
    fireEvent.change(screen.getByPlaceholderText('common:labels.email'), { target: { value: 'no-es-un-email' } })
    fireEvent.click(screen.getByText('common:actions.add'))

    expect(await screen.findByText('El correo electrónico debe ser una dirección de correo válida.')).toBeInTheDocument()
  })
})
