import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProviderFormDrawer from './ProviderFormDrawer'
import { comprasApi } from '@/api/comprasApi'
import type { ProviderDetail } from '@/types/compras'

// SCRUM-189 (REQ-126, 2026-07-30) — el form divergía del mockup real
// `2G__Compras_Proveedores.html` (hallazgo de Gerencia Test): `origin` (REQ-141) no es un campo
// del mockup, se deriva de `category` en el backend; `category` pasa a ser un select de 5
// valores fijos en vez de texto libre; se agregan whatsapp/dirección/país y
// swift/beneficiario, y se quitan bank_account_type/notes (no existen en el mockup).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    providers: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeProvider(overrides: Partial<ProviderDetail> = {}): ProviderDetail {
  return {
    id: 1, name: 'LightCorp', category: 'china', origin: 'internacional',
    currency: 'USD', is_active: true, rating: null, last_purchase_at: null,
    contact_name: null, whatsapp: null, phone: null, email: null,
    address: null, country: null, bank_name: null,
    bank_account_number: null, bank_swift: null, bank_beneficiary: null,
    ...overrides,
  }
}

function renderDrawer(providerId: number | null, onSaved = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ProviderFormDrawer providerId={providerId} onClose={vi.fn()} onSaved={onSaved} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProviderFormDrawer — categoría (REQ-126, SCRUM-189)', () => {
  it('no envía "origin" — el form ya no lo controla, lo deriva el backend', async () => {
    mockedComprasApi.providers.create.mockResolvedValue(makeProvider())
    renderDrawer(null)

    await screen.findByText('compras:providerForm.titleCreate')
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Nuevo Proveedor' } })
    // SCRUM-189 (2026-08-06, hallazgo Gerencia Test): al crear, category/country/1 contacto
    // pasan a obligatorios — sin esto el submit no llega a llamar la mutación.
    fireEvent.change(document.querySelector('select[name="category"]') as HTMLSelectElement, { target: { value: 'locales' } })
    fireEvent.change(document.querySelector('input[name="country"]') as HTMLInputElement, { target: { value: 'Panamá' } })
    fireEvent.change(document.querySelector('input[name="phone"]') as HTMLInputElement, { target: { value: '6000-0000' } })
    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    await waitFor(() => expect(mockedComprasApi.providers.create).toHaveBeenCalled())
    const payload = mockedComprasApi.providers.create.mock.calls[0][0]
    expect(payload).not.toHaveProperty('origin')
  })

  it('el select de categoría ofrece los 5 valores fijos del mockup', async () => {
    renderDrawer(null)
    await screen.findByText('compras:providerForm.titleCreate')

    const select = document.querySelector('select') as HTMLSelectElement
    const values = Array.from(select.options).map(o => o.value).filter(Boolean)
    expect(values).toEqual(['locales', 'zona_libre', 'china', 'europa', 'online'])
  })

  it('envía la categoría elegida al crear', async () => {
    mockedComprasApi.providers.create.mockResolvedValue(makeProvider({ category: 'zona_libre' }))
    renderDrawer(null)

    await screen.findByText('compras:providerForm.titleCreate')
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Nuevo Proveedor' } })
    const select = document.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'zona_libre' } })
    fireEvent.change(document.querySelector('input[name="country"]') as HTMLInputElement, { target: { value: 'Panamá' } })
    fireEvent.change(document.querySelector('input[name="email"]') as HTMLInputElement, { target: { value: 'x@x.com' } })
    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    await waitFor(() => expect(mockedComprasApi.providers.create).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'zona_libre' }),
    ))
  })

  it('al editar, precarga el select con la categoría real del proveedor', async () => {
    mockedComprasApi.providers.get.mockResolvedValue(makeProvider({ id: 7, category: 'europa' }))
    renderDrawer(7)

    await waitFor(() => {
      const select = document.querySelector('select') as HTMLSelectElement
      expect(select.value).toBe('europa')
    })
  })

  it('incluye whatsapp/dirección/país y swift/beneficiario como campos editables', async () => {
    renderDrawer(null)
    await screen.findByText('compras:providerForm.titleCreate')

    // country/category llevan un "*" agregado en modo crear (SCRUM-189, 2026-08-06) — matcher
    // por prefijo en vez de texto exacto.
    expect(screen.getByText('compras:providerForm.fields.whatsapp')).toBeTruthy()
    expect(screen.getByText('compras:providerForm.fields.address')).toBeTruthy()
    expect(screen.getByText((_, el) => el?.tagName === 'LABEL' && (el.textContent?.trim().startsWith('compras:providerForm.fields.country') ?? false))).toBeTruthy()
    expect(screen.getByText('compras:providerForm.fields.bankSwift')).toBeTruthy()
    expect(screen.getByText('compras:providerForm.fields.bankBeneficiary')).toBeTruthy()
    expect(screen.queryByText('compras:providerForm.fields.origin')).toBeNull()
    expect(screen.queryByText('compras:providerForm.fields.notes')).toBeNull()
  })
})

describe('ProviderFormDrawer — bug de Zod: refine saltado por invalid_type (Pre-QA 2026-08-07, SCRUM-189)', () => {
  it('al crear sin categoría, país NI contacto, muestra los 3 mensajes de validación a la vez, no solo categoría/país', async () => {
    // Bug real confirmado en vivo contra dev.atlanticerp.ai y en aislado con Zod: `z.enum(...)` sobre
    // un valor vacío produce `invalid_type`, lo que ABORTABA el `.refine()` de "al menos un
    // contacto" encadenado al objeto completo — el mensaje de contacto quedaba en silencio
    // (aunque el guardado seguía bloqueado igual, por categoría/país). Fix: `categoryField` usa
    // `z.string().nullable().refine(...)` en vez de `z.enum(...)`, que no aborta la cadena.
    renderDrawer(null)
    await screen.findByText('compras:providerForm.titleCreate')

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Proveedor Sin Nada' } })
    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    await screen.findByText('compras:providerForm.validation.categoryRequired')
    expect(screen.getByText('compras:providerForm.validation.countryRequired')).toBeTruthy()
    // Antes del fix, este mensaje NUNCA aparecía en esta combinación.
    expect(screen.getAllByText('compras:providerForm.validation.contactRequired').length).toBeGreaterThan(0)
    expect(mockedComprasApi.providers.create).not.toHaveBeenCalled()
  })
})
