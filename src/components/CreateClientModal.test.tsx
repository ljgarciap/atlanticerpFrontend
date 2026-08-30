import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CreateClientModal from './CreateClientModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { ClientDetail, SubClientDetail } from '@/types/ventasDiseno'

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

let mockCanSelectPartnerPrice = false
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => mockCanSelectPartnerPrice }))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    clients: { create: vi.fn(), addSubClient: vi.fn() },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function renderClientModal(onCreated = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateClientModal mode="client" onClose={vi.fn()} onCreated={onCreated} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCanSelectPartnerPrice = false
})

describe('CreateClientModal', () => {
  it('el botón Guardar está deshabilitado sin cliente, subcliente, RUC o contacto', () => {
    renderClientModal()
    const saveButton = screen.getByText('ventasDiseno:clients.createModal.saveClient')
    expect(saveButton).toBeDisabled()
  })

  it('se habilita al completar cliente, subcliente, RUC y un contacto con teléfono', () => {
    renderClientModal()

    const [masterInput, businessInput, , taxIdInput] = screen.getAllByRole('textbox')
    fireEvent.change(masterInput, { target: { value: 'Cliente Nuevo' } })
    fireEvent.change(businessInput, { target: { value: 'Subcliente Nuevo' } })
    fireEvent.change(taxIdInput, { target: { value: '155-0000-1-2026' } })

    const contactNameInput = screen.getByPlaceholderText('ventasDiseno:modal.contactName')
    fireEvent.change(contactNameInput, { target: { value: 'Ana Pérez' } })
    const phoneInput = screen.getByPlaceholderText('common:labels.phone')
    fireEvent.change(phoneInput, { target: { value: '6000-0000' } })

    expect(screen.getByText('ventasDiseno:clients.createModal.saveClient')).not.toBeDisabled()
  })

  it('la opción Precio Socio está deshabilitada sin el permiso', () => {
    mockCanSelectPartnerPrice = false
    renderClientModal()
    const partnerOption = screen.getByText(/ventasDiseno:priceType\.partner/) as HTMLOptionElement
    expect(partnerOption.disabled).toBe(true)
  })

  it('la opción Precio Socio está habilitada con el permiso', () => {
    mockCanSelectPartnerPrice = true
    renderClientModal()
    const partnerOption = screen.getByText('ventasDiseno:priceType.partner') as HTMLOptionElement
    expect(partnerOption.disabled).toBe(false)
  })

  it('envía el payload correcto al guardar y notifica onCreated', async () => {
    const created: ClientDetail = { id: 5, name: 'Cliente Nuevo', default_price_type: null, sub_clients: [] }
    mockedApi.clients.create.mockResolvedValue(created)
    const onCreated = vi.fn()
    renderClientModal(onCreated)

    const [masterInput, businessInput, , taxIdInput] = screen.getAllByRole('textbox')
    fireEvent.change(masterInput, { target: { value: 'Cliente Nuevo' } })
    fireEvent.change(businessInput, { target: { value: 'Subcliente Nuevo' } })
    fireEvent.change(taxIdInput, { target: { value: '155-0000-1-2026' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Ana Pérez' } })
    fireEvent.change(screen.getByPlaceholderText('common:labels.phone'), { target: { value: '6000-0000' } })

    fireEvent.click(screen.getByText('ventasDiseno:clients.createModal.saveClient'))

    await waitFor(() => expect(mockedApi.clients.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cliente Nuevo',
        business_name: 'Subcliente Nuevo',
        tax_id: '155-0000-1-2026',
        contacts: [{ name: 'Ana Pérez', role: 'client', phone: '6000-0000', email: null }],
      }),
    ))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
  })
})

describe('CreateClientModal — modo subcliente', () => {
  it('crea un subcliente bajo el master indicado sin pedir nombre de cliente ni tipo de precio', async () => {
    const created: SubClientDetail = {
      id: 9, master_client_id: 3, business_name: 'Subcliente Adicional', tax_id: '155-1-1',
      delivery_address: null, category: null, contacts: [],
    }
    mockedApi.clients.addSubClient.mockResolvedValue(created)
    const onCreated = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <CreateClientModal mode="sub-client" masterClientId={3} masterClientName="Grupo Delta" onClose={vi.fn()} onCreated={onCreated} />
      </QueryClientProvider>,
    )

    expect(screen.queryByText('ventasDiseno:clients.createModal.priceType')).not.toBeInTheDocument()

    const [businessInput, , taxIdInput] = screen.getAllByRole('textbox')
    fireEvent.change(businessInput, { target: { value: 'Subcliente Adicional' } })
    fireEvent.change(taxIdInput, { target: { value: '155-1-1' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Beto Ruiz' } })
    fireEvent.change(screen.getByPlaceholderText('common:labels.email'), { target: { value: 'beto@example.com' } })

    fireEvent.click(screen.getByText('ventasDiseno:clients.createModal.saveSubClient'))

    await waitFor(() => expect(mockedApi.clients.addSubClient).toHaveBeenCalledWith(3, expect.objectContaining({
      business_name: 'Subcliente Adicional', tax_id: '155-1-1',
    })))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
  })
})
