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
    providers: {
      list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(),
      uploadBankImage: vi.fn(), deleteBankImage: vi.fn(), getBankExtraction: vi.fn(),
    },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeProvider(overrides: Partial<ProviderDetail> = {}): ProviderDetail {
  return {
    id: 1, name: 'Proveedor Demo A', tax_id: null, category: 'china', origin: 'internacional',
    currency: 'USD', is_active: true, rating: null, last_purchase_at: null,
    contact_name: null, whatsapp: null, phone: null, email: null,
    address: null, country: null, bank_name: null,
    bank_account_number: null, bank_swift: null, bank_beneficiary: null, bank_image: null,
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
  // Default "sin corrida todavía" — mismo shape que ProviderConfirmationValidation en su
  // controller real (ver PurchaseOrderDocumentController::validation()).
  mockedComprasApi.providers.getBankExtraction.mockResolvedValue({ id: null, status: null, result: null, error: null })
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

  it('el select de categoría ofrece los 6 valores fijos (5 del mockup + Latinoamérica, SCRUM-820)', async () => {
    renderDrawer(null)
    await screen.findByText('compras:providerForm.titleCreate')

    const select = document.querySelector('select') as HTMLSelectElement
    const values = Array.from(select.options).map(o => o.value).filter(Boolean)
    expect(values).toEqual(['locales', 'zona_libre', 'china', 'europa', 'online', 'latinoamerica'])
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

  // SCRUM-1014 — RUC + DV viajan en el payload y se precargan al editar.
  it('envía RUC y DV al crear', async () => {
    mockedComprasApi.providers.create.mockResolvedValue(makeProvider())
    renderDrawer(null)

    await screen.findByText('compras:providerForm.titleCreate')
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Nuevo Proveedor' } })
    fireEvent.change(document.querySelector('select') as HTMLSelectElement, { target: { value: 'locales' } })
    fireEvent.change(document.querySelector('input[name="country"]') as HTMLInputElement, { target: { value: 'Panamá' } })
    fireEvent.change(document.querySelector('input[name="email"]') as HTMLInputElement, { target: { value: 'x@x.com' } })
    fireEvent.change(document.querySelector('input[name="tax_id"]') as HTMLInputElement, { target: { value: '8-123-4567' } })
    fireEvent.change(document.querySelector('input[name="tax_id_dv"]') as HTMLInputElement, { target: { value: '12' } })
    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    await waitFor(() => expect(mockedComprasApi.providers.create).toHaveBeenCalledWith(
      expect.objectContaining({ tax_id: '8-123-4567', tax_id_dv: '12' }),
    ))
  })

  it('al editar, precarga RUC y DV del proveedor', async () => {
    mockedComprasApi.providers.get.mockResolvedValue(makeProvider({ id: 7, tax_id: '8-123-4567', tax_id_dv: '12' }))
    renderDrawer(7)

    await waitFor(() => {
      expect((document.querySelector('input[name="tax_id"]') as HTMLInputElement).value).toBe('8-123-4567')
      expect((document.querySelector('input[name="tax_id_dv"]') as HTMLInputElement).value).toBe('12')
    })
  })

  it('rechaza un DV no numérico sin llamar al backend', async () => {
    renderDrawer(null)

    await screen.findByText('compras:providerForm.titleCreate')
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Nuevo Proveedor' } })
    fireEvent.change(document.querySelector('select') as HTMLSelectElement, { target: { value: 'locales' } })
    fireEvent.change(document.querySelector('input[name="country"]') as HTMLInputElement, { target: { value: 'Panamá' } })
    fireEvent.change(document.querySelector('input[name="email"]') as HTMLInputElement, { target: { value: 'x@x.com' } })
    fireEvent.change(document.querySelector('input[name="tax_id_dv"]') as HTMLInputElement, { target: { value: 'ab' } })
    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    expect(await screen.findByText('compras:providerForm.validation.taxIdDvFormat')).toBeInTheDocument()
    expect(mockedComprasApi.providers.create).not.toHaveBeenCalled()
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

describe('ProviderFormDrawer — imagen de respaldo bancario (SCRUM-819)', () => {
  it('al crear (sin id todavía), SCRUM-819(a): muestra el botón de adjuntar, no bloquea hasta guardar', async () => {
    renderDrawer(null)
    await screen.findByText('compras:providerForm.titleCreate')

    expect(screen.getByText('compras:providerForm.bankImage.attach')).toBeInTheDocument()
  })

  it('al crear con imagen adjuntada antes de guardar, encadena create → uploadBankImage con el mismo archivo (SCRUM-819(a))', async () => {
    // jsdom no implementa URL.createObjectURL/revokeObjectURL — se definen ad-hoc (mismo patrón
    // que OrderDetailModal.test.tsx).
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:mock-url'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })

    const created = makeProvider({ id: 42 })
    mockedComprasApi.providers.create.mockResolvedValue(created)
    mockedComprasApi.providers.uploadBankImage.mockResolvedValue(created)
    const onSaved = vi.fn()
    renderDrawer(null, onSaved)
    await screen.findByText('compras:providerForm.titleCreate')

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Proveedor con foto' } })
    fireEvent.change(document.querySelector('select[name="category"]') as HTMLSelectElement, { target: { value: 'locales' } })
    fireEvent.change(document.querySelector('input[name="country"]') as HTMLInputElement, { target: { value: 'Panamá' } })
    fireEvent.change(document.querySelector('input[name="phone"]') as HTMLInputElement, { target: { value: '6000-0000' } })

    const file = new File(['x'], 'cuenta.png', { type: 'image/png' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    // El archivo todavía no se sube — vive en memoria hasta el submit.
    expect(mockedComprasApi.providers.uploadBankImage).not.toHaveBeenCalled()
    expect(screen.getByText('compras:providerForm.bankImage.change')).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    await waitFor(() => expect(mockedComprasApi.providers.create).toHaveBeenCalled())
    await waitFor(() => expect(mockedComprasApi.providers.uploadBankImage).toHaveBeenCalledWith(42, file))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(created))
  })

  it('al crear con imagen, NO cierra (onSaved) hasta que la extracción de IA termina — y pre-llena bank_name vacío (ADR-SCRUM819)', async () => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:mock-url'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })

    const created = makeProvider({ id: 42 })
    mockedComprasApi.providers.create.mockResolvedValue(created)
    mockedComprasApi.providers.uploadBankImage.mockResolvedValue(created)
    // Primera consulta: todavía corriendo. Segunda: completada, con bank_name extraído.
    mockedComprasApi.providers.getBankExtraction
      .mockResolvedValueOnce({ id: 'a1', status: 'running', result: null, error: null })
      .mockResolvedValue({
        id: 'a1', status: 'completed', error: null,
        result: {
          fields_found: ['bank_name', 'bank_account_number'],
          bank_name: 'Banco Demo A', bank_account_number: '04-01-01-123456-7',
          bank_swift: null, bank_beneficiary: null, confidence: 'alta',
        },
      })
    const onSaved = vi.fn()
    renderDrawer(null, onSaved)
    await screen.findByText('compras:providerForm.titleCreate')

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Proveedor con foto' } })
    fireEvent.change(document.querySelector('select[name="category"]') as HTMLSelectElement, { target: { value: 'locales' } })
    fireEvent.change(document.querySelector('input[name="country"]') as HTMLInputElement, { target: { value: 'Panamá' } })
    fireEvent.change(document.querySelector('input[name="phone"]') as HTMLInputElement, { target: { value: '6000-0000' } })

    const file = new File(['x'], 'cuenta.png', { type: 'image/png' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    await waitFor(() => expect(mockedComprasApi.providers.uploadBankImage).toHaveBeenCalledWith(42, file))

    // Mientras la extracción sigue "running", el drawer NO debe haberse cerrado todavía.
    await waitFor(() => expect(mockedComprasApi.providers.getBankExtraction).toHaveBeenCalled())
    expect(onSaved).not.toHaveBeenCalled()

    // Recién cuando llega "completed" se cierra — y el campo vacío queda pre-llenado.
    // El 2do poll ocurre recién a los 2s reales (refetchInterval de useProviderBankExtraction) —
    // timeout explícito mayor a eso, el default de waitFor (1s) no alcanza.
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(created), { timeout: 3000 })
    const bankNameInput = document.querySelector('input[name="bank_name"]') as HTMLInputElement
    expect(bankNameInput.value).toBe('Banco Demo A')
  })

  it('con proveedor ya guardado y sin imagen, seleccionar un archivo llama a uploadBankImage', async () => {
    mockedComprasApi.providers.get.mockResolvedValue(makeProvider())
    mockedComprasApi.providers.uploadBankImage.mockResolvedValue(makeProvider({
      bank_image: { url: 'https://s3.test/foto.jpg', filename: 'foto.jpg' },
    }))
    const { container } = renderDrawer(1)
    await screen.findByText('compras:providerForm.bankImage.attach')

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mockedComprasApi.providers.uploadBankImage).toHaveBeenCalledWith(1, file))
  })

  it('con imagen ya cargada, muestra la vista previa y los botones Cambiar/Eliminar', async () => {
    mockedComprasApi.providers.get.mockResolvedValue(makeProvider({
      bank_image: { url: 'https://s3.test/foto.jpg', filename: 'foto.jpg' },
    }))
    renderDrawer(1)

    await screen.findByText('compras:providerForm.bankImage.change')
    expect(screen.getByText('compras:providerForm.bankImage.remove')).toBeInTheDocument()
    expect(screen.queryByText('compras:providerForm.bankImage.attach')).not.toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://s3.test/foto.jpg')
  })

  it('clic en Eliminar llama a deleteBankImage con el id del proveedor', async () => {
    mockedComprasApi.providers.get.mockResolvedValue(makeProvider({
      bank_image: { url: 'https://s3.test/foto.jpg', filename: 'foto.jpg' },
    }))
    mockedComprasApi.providers.deleteBankImage.mockResolvedValue(makeProvider())
    renderDrawer(1)
    await screen.findByText('compras:providerForm.bankImage.remove')

    fireEvent.click(screen.getByText('compras:providerForm.bankImage.remove'))

    await waitFor(() => expect(mockedComprasApi.providers.deleteBankImage).toHaveBeenCalledWith(1))
  })

  /**
   * Pre-QA (2026-08-31) — mismo hallazgo real que ProviderDetailModal: cambiar un campo (categoría),
   * adjuntar una imagen sin guardar el form todavía, terminaba pisando el cambio con el refetch en
   * background que dispara la invalidación de useUploadProviderBankImage.
   */
  it('subir la imagen a mitad de edición no pisa un cambio de categoría sin guardar todavía', async () => {
    mockedComprasApi.providers.get.mockResolvedValue(makeProvider({ category: 'china' }))
    mockedComprasApi.providers.uploadBankImage.mockResolvedValue(makeProvider({
      category: 'china', bank_image: { url: 'https://s3.test/foto.jpg', filename: 'foto.jpg' },
    }))
    const { container } = renderDrawer(1)
    await screen.findByDisplayValue('Proveedor Demo A')

    const categorySelect = document.querySelector('select[name="category"]') as HTMLSelectElement
    await waitFor(() => expect(categorySelect.value).toBe('china'))
    fireEvent.change(categorySelect, { target: { value: 'latinoamerica' } })
    expect(categorySelect.value).toBe('latinoamerica')

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mockedComprasApi.providers.get).toHaveBeenCalledTimes(2))
    expect(categorySelect.value).toBe('latinoamerica')
  })
})
