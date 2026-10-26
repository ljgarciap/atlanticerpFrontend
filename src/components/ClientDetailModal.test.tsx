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
        id: 10, master_client_id: 1, business_name: 'Delta Residencial', tax_id: '155-0-1', tax_id_dv: '81',
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

  it('SCRUM-1166: un subcliente exento de ITBMS lo muestra con su chip; uno que no lo es, no', async () => {
    const detail = makeDetail()
    detail.sub_clients[0].itbms_exento = true
    detail.sub_clients[0].itbms_exencion_documento = 'Resolución 201-1234'
    mockedApi.clients.get.mockResolvedValue(detail)
    renderModal()

    const chip = await screen.findByTestId(`chip-exento-${detail.sub_clients[0].id}`)
    expect(chip).toHaveTextContent('ventasDiseno:clients.detail.exentoItbms')
    expect(chip).toHaveAttribute('title', 'Resolución 201-1234')
  })

  it('SCRUM-1166: sin la marca no aparece el chip de exento', async () => {
    renderModal()
    await screen.findByText('Delta Residencial')
    expect(screen.queryByText('ventasDiseno:clients.detail.exentoItbms')).not.toBeInTheDocument()
  })

  it('SCRUM-928: muestra el DV junto al RUC del subcliente, y lo omite si el subcliente no lo tiene', async () => {
    renderModal()
    const ruc = await screen.findByText(/ventasDiseno:clients\.detail\.taxId: 155-0-1/)
    expect(ruc).toHaveTextContent('ventasDiseno:clients.detail.taxIdDv: 81')
  })

  it('SCRUM-928: un subcliente anterior al campo (sin DV) no muestra la etiqueta DV', async () => {
    const detail = makeDetail()
    detail.sub_clients[0].tax_id_dv = null
    mockedApi.clients.get.mockResolvedValue(detail)
    renderModal()
    const ruc = await screen.findByText(/ventasDiseno:clients\.detail\.taxId: 155-0-1/)
    expect(ruc).not.toHaveTextContent('taxIdDv')
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
