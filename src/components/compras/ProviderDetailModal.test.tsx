import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProviderDetailModal from './ProviderDetailModal'
import { comprasApi } from '@/api/comprasApi'
import type { ProviderDetail } from '@/types/compras'

// SCRUM-186 (REQ-123, 2026-08-06 — hallazgo Daniela Amaya): "Ver detalle" abre un modal en
// solo-lectura; "Editar" habilita los campos; "Guardar" persiste y vuelve a solo-lectura;
// "Cancelar" descarta cambios sin guardar. Última compra/Calificación son siempre solo-lectura.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    providers: { get: vi.fn(), update: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeProvider(overrides: Partial<ProviderDetail> = {}): ProviderDetail {
  return {
    id: 7, name: 'LightCorp', category: 'china', origin: 'internacional',
    currency: 'USD', is_active: true, rating: 88, last_purchase_at: '2026-07-14',
    contact_name: 'Wei Chen', whatsapp: '+86 138-0000-0000', phone: null, email: null,
    address: null, country: 'China', bank_name: null,
    bank_account_number: null, bank_swift: null, bank_beneficiary: null,
    ...overrides,
  }
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProviderDetailModal providerId={7} onClose={onClose} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedComprasApi.providers.get.mockResolvedValue(makeProvider())
})

describe('ProviderDetailModal', () => {
  it('abre en modo solo-lectura: sin inputs, campos como texto plano', async () => {
    renderModal()
    await screen.findByText('LightCorp')

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Wei Chen')).toBeInTheDocument()
    expect(screen.getByText('compras:providerForm.actions.edit')).toBeInTheDocument()
    expect(screen.queryByText('compras:providerForm.actions.save')).toBeNull()
  })

  it('las tarjetas de Última compra y Calificación se muestran siempre, aun en modo edición', async () => {
    renderModal()
    await screen.findByText('LightCorp')
    expect(screen.getByText('2026-07-14')).toBeInTheDocument()
    expect(screen.getByText('88/100')).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    // Siguen visibles como texto, nunca se vuelven input.
    expect(screen.getByText('2026-07-14')).toBeInTheDocument()
    expect(screen.getByText('88/100')).toBeInTheDocument()
  })

  it('"Editar" habilita los campos', async () => {
    renderModal()
    await screen.findByText('LightCorp')

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))

    expect(screen.getByDisplayValue('LightCorp')).toBeInTheDocument()
    expect(screen.getByText('compras:providerForm.actions.save')).toBeInTheDocument()
    expect(screen.getByText('compras:providerForm.actions.cancel')).toBeInTheDocument()
  })

  // Senior Review (2026-08-07): el toggle "Activo" existía en el flujo de edición viejo
  // (ProviderFormDrawer) y se perdió al mover la edición a este modal — sin esto no había forma
  // de desactivar un proveedor desde la UI.
  it('permite desactivar el proveedor desde el checkbox "Activo" en modo edición', async () => {
    mockedComprasApi.providers.update.mockResolvedValue(makeProvider({ is_active: false }))
    renderModal()
    await screen.findByText('LightCorp')

    expect(screen.getByText('common:labels.active')).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    await waitFor(() => expect(mockedComprasApi.providers.update).toHaveBeenCalledWith(
      7, expect.objectContaining({ is_active: false }),
    ))
  })

  it('"Cancelar" descarta el cambio sin guardar y vuelve a solo-lectura', async () => {
    renderModal()
    await screen.findByText('LightCorp')

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    const nameInput = screen.getByDisplayValue('LightCorp')
    fireEvent.change(nameInput, { target: { value: 'Otro Nombre' } })

    fireEvent.click(screen.getByText('compras:providerForm.actions.cancel'))

    expect(mockedComprasApi.providers.update).not.toHaveBeenCalled()
    expect(screen.getByText('LightCorp')).toBeInTheDocument()
    expect(screen.queryByText('Otro Nombre')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('"Guardar" persiste el cambio y vuelve a solo-lectura', async () => {
    mockedComprasApi.providers.update.mockResolvedValue(makeProvider({ name: 'LightCorp Renamed' }))
    renderModal()
    await screen.findByText('LightCorp')

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    fireEvent.change(screen.getByDisplayValue('LightCorp'), { target: { value: 'LightCorp Renamed' } })
    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    await waitFor(() => expect(mockedComprasApi.providers.update).toHaveBeenCalledWith(
      7, expect.objectContaining({ name: 'LightCorp Renamed' }),
    ))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  })
})
