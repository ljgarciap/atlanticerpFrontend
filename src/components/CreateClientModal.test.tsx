import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
let mockCanMarkConsumidorFinal = true
vi.mock('@/hooks/usePermission', () => ({
  usePermission: (p: string) => (p === 'ventas_diseno.edit.client_tax_data' ? mockCanMarkConsumidorFinal : mockCanSelectPartnerPrice),
}))

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
  mockCanMarkConsumidorFinal = true
})

describe('CreateClientModal', () => {
  it('el botón Guardar está deshabilitado sin cliente, subcliente, RUC o contacto', () => {
    renderClientModal()
    const saveButton = screen.getByText('ventasDiseno:clients.createModal.saveClient')
    expect(saveButton).toBeDisabled()
  })

  it('se habilita al completar cliente, subcliente, RUC y un contacto con teléfono', () => {
    renderClientModal()

    const [masterInput, businessInput, , taxIdInput, dvInput] = screen.getAllByRole('textbox')
    fireEvent.change(masterInput, { target: { value: 'Cliente Nuevo' } })
    fireEvent.change(businessInput, { target: { value: 'Subcliente Nuevo' } })
    fireEvent.change(taxIdInput, { target: { value: '155-0000-1-2026' } })
    fireEvent.change(dvInput, { target: { value: '81' } })

    const contactNameInput = screen.getByPlaceholderText('ventasDiseno:modal.contactName')
    fireEvent.change(contactNameInput, { target: { value: 'Ana Pérez' } })
    const phoneInput = screen.getByPlaceholderText('common:labels.phone')
    fireEvent.change(phoneInput, { target: { value: '6000-0000' } })

    expect(screen.getByText('ventasDiseno:clients.createModal.saveClient')).not.toBeDisabled()
  })

  // SCRUM-1003 — Consumidor Final: sin RUC ni DV.
  describe('Tipo de cliente ante la DGI (SCRUM-1003)', () => {
    function completarComun() {
      fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Cliente Mostrador' } })
      fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Juan Pérez' } })
      fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Juan' } })
      fireEvent.change(screen.getByPlaceholderText('common:labels.phone'), { target: { value: '6000-0000' } })
    }

    it('sin el permiso angosto (no es Gerencia ni Contabilidad) no puede elegir Consumidor final', () => {
      mockCanMarkConsumidorFinal = false
      renderClientModal()
      expect((screen.getByRole('option', { name: 'clients.receptorTipo.consumidorFinal' }) as HTMLOptionElement).disabled).toBe(true)
      expect(screen.getByText('clients.receptorTipo.soloMarkFelix')).toBeInTheDocument()
    })

    it('por defecto es Contribuyente y muestra RUC, DV y validación', () => {
      renderClientModal()
      expect(screen.getByLabelText('clients.receptorTipo.label')).toHaveValue('01')
      expect(screen.getByText('ventasDiseno:clients.createModal.taxId *')).toBeInTheDocument()
      expect(screen.getByTestId('tax-id-validator')).toBeInTheDocument()
    })

    it('con Consumidor Final se ocultan RUC, DV y la validación, y se puede guardar sin ellos', () => {
      renderClientModal()
      completarComun()
      expect(screen.getByText('ventasDiseno:clients.createModal.saveClient')).toBeDisabled() // contribuyente sin RUC

      fireEvent.change(screen.getByLabelText('clients.receptorTipo.label'), { target: { value: '02' } })

      expect(screen.queryByText('ventasDiseno:clients.createModal.taxId *')).not.toBeInTheDocument()
      expect(screen.queryByTestId('tax-id-validator')).not.toBeInTheDocument()
      expect(screen.getByText('ventasDiseno:clients.createModal.saveClient')).not.toBeDisabled()
    })

    it('el alta de Consumidor Final no manda RUC ni DV', async () => {
      mockedApi.clients.create.mockResolvedValue({ id: 1, name: 'x', default_price_type: null, sub_clients: [] } as ClientDetail)
      renderClientModal()
      completarComun()
      fireEvent.change(screen.getByLabelText('clients.receptorTipo.label'), { target: { value: '02' } })

      fireEvent.click(screen.getByText('ventasDiseno:clients.createModal.saveClient'))

      await waitFor(() => expect(mockedApi.clients.create).toHaveBeenCalled())
      const payload = mockedApi.clients.create.mock.calls[0][0]
      expect(payload.receptor_tipo).toBe('02')
      expect(payload).not.toHaveProperty('tax_id')
      expect(payload).not.toHaveProperty('tax_id_dv')
    })

    it('el alta de Contribuyente manda el tipo explícito con su RUC y DV', async () => {
      mockedApi.clients.create.mockResolvedValue({ id: 1, name: 'x', default_price_type: null, sub_clients: [] } as ClientDetail)
      renderClientModal()
      completarComun()
      const [, , , taxIdInput, dvInput] = screen.getAllByRole('textbox')
      fireEvent.change(taxIdInput, { target: { value: '155-0000-1-2026' } })
      fireEvent.change(dvInput, { target: { value: '81' } })

      fireEvent.click(screen.getByText('ventasDiseno:clients.createModal.saveClient'))

      await waitFor(() => expect(mockedApi.clients.create).toHaveBeenCalledWith(expect.objectContaining({ receptor_tipo: '01', tax_id: '155-0000-1-2026', tax_id_dv: '81' })))
    })
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

    const [masterInput, businessInput, , taxIdInput, dvInput] = screen.getAllByRole('textbox')
    fireEvent.change(masterInput, { target: { value: 'Cliente Nuevo' } })
    fireEvent.change(businessInput, { target: { value: 'Subcliente Nuevo' } })
    fireEvent.change(taxIdInput, { target: { value: '155-0000-1-2026' } })
    fireEvent.change(dvInput, { target: { value: '81' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Ana Pérez' } })
    fireEvent.change(screen.getByPlaceholderText('common:labels.phone'), { target: { value: '6000-0000' } })

    fireEvent.click(screen.getByText('ventasDiseno:clients.createModal.saveClient'))

    await waitFor(() => expect(mockedApi.clients.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cliente Nuevo',
        business_name: 'Subcliente Nuevo',
        tax_id: '155-0000-1-2026',
        tax_id_dv: '81',
        contacts: [{ name: 'Ana Pérez', role: 'client', phone: '6000-0000', email: null }],
      }),
    ))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
  })

  // SCRUM-928 — DV del RUC obligatorio, inmediatamente después del RUC.
  function fillAllButDv() {
    const [masterInput, businessInput, , taxIdInput] = screen.getAllByRole('textbox')
    fireEvent.change(masterInput, { target: { value: 'Cliente Nuevo' } })
    fireEvent.change(businessInput, { target: { value: 'Subcliente Nuevo' } })
    fireEvent.change(taxIdInput, { target: { value: '155-0000-1-2026' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Ana Pérez' } })
    fireEvent.change(screen.getByPlaceholderText('common:labels.phone'), { target: { value: '6000-0000' } })
  }

  it('SCRUM-928: muestra el campo DV inmediatamente después del RUC', () => {
    renderClientModal()
    const textboxes = screen.getAllByRole('textbox')
    const dv = screen.getByText('ventasDiseno:clients.createModal.taxIdDv').parentElement!.querySelector('input') as HTMLInputElement
    expect(textboxes.indexOf(dv)).toBe(4) // [master, razón social, dirección, RUC, DV]
  })

  it('SCRUM-1140: el DV es opcional, Guardar queda habilitado aunque esté vacío (una cédula puede no tenerlo)', () => {
    renderClientModal()
    fillAllButDv()
    expect(screen.getByText('ventasDiseno:clients.createModal.saveClient')).not.toBeDisabled()
  })

  it('SCRUM-928: el DV solo acepta dígitos y máximo 2 caracteres', () => {
    renderClientModal()
    const dv = screen.getByText('ventasDiseno:clients.createModal.taxIdDv').parentElement!.querySelector('input') as HTMLInputElement
    fireEvent.change(dv, { target: { value: 'ab' } })
    expect(dv).toHaveValue('')
    fireEvent.change(dv, { target: { value: '8x1' } })
    expect(dv).toHaveValue('81')
    fireEvent.change(dv, { target: { value: '123' } })
    expect(dv).toHaveValue('12')
  })

  // Pre-QA PQ-928-1 — `fireEvent.change` no emula `maxlength`, por eso el test de arriba no atrapó el
  // defecto real. `user-event` sí respeta `maxLength` al pegar: con el atributo, " 81" se cortaba a
  // " 8" ANTES de que el onChange limpiara y el DV quedaba en "8".
  it.each([
    [' 81', '81'],
    ['-81', '81'],
    ['DV 81', '81'],
    ['81 ', '81'],
  ])('SCRUM-928: pegar %j en el DV deja %j (no se trunca antes de limpiar)', async (pegado, esperado) => {
    renderClientModal()
    const dv = screen.getByText('ventasDiseno:clients.createModal.taxIdDv').parentElement!.querySelector('input') as HTMLInputElement
    const user = userEvent.setup()
    await user.click(dv)
    await user.paste(pegado)
    expect(dv).toHaveValue(esperado)
  })

  it('SCRUM-928: el input del DV no lleva maxlength (el límite de 2 dígitos lo aplica el onChange)', () => {
    renderClientModal()
    const dv = screen.getByText('ventasDiseno:clients.createModal.taxIdDv').parentElement!.querySelector('input') as HTMLInputElement
    expect(dv).not.toHaveAttribute('maxlength')
  })

  it('SCRUM-928: un DV de un solo dígito es válido y habilita Guardar', () => {
    renderClientModal()
    fillAllButDv()
    const dvInput = screen.getByText('ventasDiseno:clients.createModal.taxIdDv').parentElement!.querySelector('input') as HTMLInputElement
    fireEvent.change(dvInput, { target: { value: '7' } })
    expect(screen.getByText('ventasDiseno:clients.createModal.saveClient')).not.toBeDisabled()
  })
})

describe('CreateClientModal — modo subcliente', () => {
  it('crea un subcliente bajo el master indicado sin pedir nombre de cliente ni tipo de precio', async () => {
    const created: SubClientDetail = {
      id: 9, master_client_id: 3, business_name: 'Subcliente Adicional', tax_id: '155-1-1', tax_id_dv: '5',
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

    const [businessInput, , taxIdInput, dvInput] = screen.getAllByRole('textbox')
    fireEvent.change(businessInput, { target: { value: 'Subcliente Adicional' } })
    fireEvent.change(taxIdInput, { target: { value: '155-1-1' } })
    fireEvent.change(dvInput, { target: { value: '5' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Beto Ruiz' } })
    fireEvent.change(screen.getByPlaceholderText('common:labels.email'), { target: { value: 'beto@example.com' } })

    fireEvent.click(screen.getByText('ventasDiseno:clients.createModal.saveSubClient'))

    await waitFor(() => expect(mockedApi.clients.addSubClient).toHaveBeenCalledWith(3, expect.objectContaining({
      business_name: 'Subcliente Adicional', tax_id: '155-1-1', tax_id_dv: '5',
    })))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
  })

  it('SCRUM-1140: en modo subcliente el DV es opcional', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <CreateClientModal mode="sub-client" masterClientId={3} masterClientName="Grupo Delta" onClose={vi.fn()} onCreated={vi.fn()} />
      </QueryClientProvider>,
    )
    const [businessInput, , taxIdInput, dvInput] = screen.getAllByRole('textbox')
    fireEvent.change(businessInput, { target: { value: 'Subcliente Adicional' } })
    fireEvent.change(taxIdInput, { target: { value: '155-1-1' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Beto Ruiz' } })
    fireEvent.change(screen.getByPlaceholderText('common:labels.email'), { target: { value: 'beto@example.com' } })
    expect(screen.getByText('ventasDiseno:clients.createModal.saveSubClient')).not.toBeDisabled()
    fireEvent.change(dvInput, { target: { value: '9' } })
    expect(screen.getByText('ventasDiseno:clients.createModal.saveSubClient')).not.toBeDisabled()
  })
})
