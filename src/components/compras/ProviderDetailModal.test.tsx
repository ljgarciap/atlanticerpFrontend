import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProviderDetailModal from './ProviderDetailModal'
import { comprasApi } from '@/api/comprasApi'
import type { ProviderDetail } from '@/types/compras'

// SCRUM-186 (REQ-123, 2026-08-06 — hallazgo Gerencia Test): "Ver detalle" abre un modal en
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
    providers: { get: vi.fn(), update: vi.fn(), uploadBankImage: vi.fn(), deleteBankImage: vi.fn(), getBankExtraction: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeProvider(overrides: Partial<ProviderDetail> = {}): ProviderDetail {
  return {
    id: 7, name: 'Proveedor Demo A', tax_id: null, category: 'china', origin: 'internacional',
    currency: 'USD', is_active: true, rating: 88, last_purchase_at: '2026-07-14',
    contact_name: 'Wei Chen', whatsapp: '+86 138-0000-0000', phone: null, email: null,
    address: null, country: 'China', bank_name: null,
    bank_account_number: null, bank_swift: null, bank_beneficiary: null, bank_image: null,
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
  mockedComprasApi.providers.getBankExtraction.mockResolvedValue({ id: null, status: null, result: null, error: null })
})

describe('ProviderDetailModal', () => {
  it('abre en modo solo-lectura: sin inputs, campos como texto plano', async () => {
    renderModal()
    await screen.findByText('Proveedor Demo A')

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Wei Chen')).toBeInTheDocument()
    expect(screen.getByText('compras:providerForm.actions.edit')).toBeInTheDocument()
    expect(screen.queryByText('compras:providerForm.actions.save')).toBeNull()
  })

  // SCRUM-1014 — RUC y DV visibles en el detalle y editables, y viajan en el guardado.
  it('muestra RUC y DV en el detalle y los envía al guardar la edición', async () => {
    mockedComprasApi.providers.get.mockResolvedValue(makeProvider({ tax_id: '8-123-4567', tax_id_dv: '12' }))
    mockedComprasApi.providers.update.mockResolvedValue(makeProvider({ tax_id: '8-999-0000', tax_id_dv: '34' }))
    renderModal()
    await screen.findByText('8-123-4567')
    expect(screen.getByText('12')).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    fireEvent.change(document.querySelector('input[name="tax_id"]') as HTMLInputElement, { target: { value: '8-999-0000' } })
    fireEvent.change(document.querySelector('input[name="tax_id_dv"]') as HTMLInputElement, { target: { value: '34' } })
    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    await waitFor(() => expect(mockedComprasApi.providers.update).toHaveBeenCalledWith(
      7, expect.objectContaining({ tax_id: '8-999-0000', tax_id_dv: '34' }),
    ))
  })

  it('las tarjetas de Última compra y Calificación se muestran siempre, aun en modo edición', async () => {
    renderModal()
    await screen.findByText('Proveedor Demo A')
    expect(screen.getByText('2026-07-14')).toBeInTheDocument()
    expect(screen.getByText('88/100')).toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    // Siguen visibles como texto, nunca se vuelven input.
    expect(screen.getByText('2026-07-14')).toBeInTheDocument()
    expect(screen.getByText('88/100')).toBeInTheDocument()
  })

  it('"Editar" habilita los campos', async () => {
    renderModal()
    await screen.findByText('Proveedor Demo A')

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))

    expect(screen.getByDisplayValue('Proveedor Demo A')).toBeInTheDocument()
    expect(screen.getByText('compras:providerForm.actions.save')).toBeInTheDocument()
    expect(screen.getByText('compras:providerForm.actions.cancel')).toBeInTheDocument()
  })

  // Senior Review (2026-08-07): el toggle "Activo" existía en el flujo de edición viejo
  // (ProviderFormDrawer) y se perdió al mover la edición a este modal — sin esto no había forma
  // de desactivar un proveedor desde la UI.
  it('permite desactivar el proveedor desde el checkbox "Activo" en modo edición', async () => {
    mockedComprasApi.providers.update.mockResolvedValue(makeProvider({ is_active: false }))
    renderModal()
    await screen.findByText('Proveedor Demo A')

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
    await screen.findByText('Proveedor Demo A')

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    const nameInput = screen.getByDisplayValue('Proveedor Demo A')
    fireEvent.change(nameInput, { target: { value: 'Otro Nombre' } })

    fireEvent.click(screen.getByText('compras:providerForm.actions.cancel'))

    expect(mockedComprasApi.providers.update).not.toHaveBeenCalled()
    expect(screen.getByText('Proveedor Demo A')).toBeInTheDocument()
    expect(screen.queryByText('Otro Nombre')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('"Guardar" persiste el cambio y vuelve a solo-lectura', async () => {
    mockedComprasApi.providers.update.mockResolvedValue(makeProvider({ name: 'Proveedor Demo A Renamed' }))
    renderModal()
    await screen.findByText('Proveedor Demo A')

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    fireEvent.change(screen.getByDisplayValue('Proveedor Demo A'), { target: { value: 'Proveedor Demo A Renamed' } })
    fireEvent.click(screen.getByText('compras:providerForm.actions.save'))

    await waitFor(() => expect(mockedComprasApi.providers.update).toHaveBeenCalledWith(
      7, expect.objectContaining({ name: 'Proveedor Demo A Renamed' }),
    ))
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull())
  })
})

describe('ProviderDetailModal — imagen de respaldo bancario (SCRUM-819)', () => {
  it('en modo vista, sin imagen, no muestra el botón de adjuntar (RN10: solo en edición)', async () => {
    renderModal()
    await screen.findByText('Proveedor Demo A')

    expect(screen.queryByText('compras:providerForm.bankImage.attach')).not.toBeInTheDocument()
  })

  it('en modo edición, sin imagen, seleccionar un archivo llama a uploadBankImage', async () => {
    mockedComprasApi.providers.uploadBankImage.mockResolvedValue(makeProvider({
      bank_image: { url: 'https://s3.test/foto.jpg', filename: 'foto.jpg' },
    }))
    const { container } = renderModal()
    await screen.findByText('Proveedor Demo A')
    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    await screen.findByText('compras:providerForm.bankImage.attach')

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mockedComprasApi.providers.uploadBankImage).toHaveBeenCalledWith(7, file))
  })

  it('con imagen ya cargada, la vista previa se ve tanto en modo vista como en edición', async () => {
    mockedComprasApi.providers.get.mockResolvedValue(makeProvider({
      bank_image: { url: 'https://s3.test/foto.jpg', filename: 'foto.jpg' },
    }))
    renderModal()
    await screen.findByText('Proveedor Demo A')

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://s3.test/foto.jpg')
    // Modo vista: la imagen se ve, pero sin Cambiar/Eliminar (RN10).
    expect(screen.queryByText('compras:providerForm.bankImage.remove')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    await waitFor(() => expect(screen.getByText('compras:providerForm.bankImage.remove')).toBeInTheDocument())
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://s3.test/foto.jpg')
  })

  it('clic en Eliminar (en edición) llama a deleteBankImage con el id del proveedor', async () => {
    mockedComprasApi.providers.get.mockResolvedValue(makeProvider({
      bank_image: { url: 'https://s3.test/foto.jpg', filename: 'foto.jpg' },
    }))
    mockedComprasApi.providers.deleteBankImage.mockResolvedValue(makeProvider())
    renderModal()
    await screen.findByText('Proveedor Demo A')
    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))
    await screen.findByText('compras:providerForm.bankImage.remove')

    fireEvent.click(screen.getByText('compras:providerForm.bankImage.remove'))

    await waitFor(() => expect(mockedComprasApi.providers.deleteBankImage).toHaveBeenCalledWith(7))
  })

  /**
   * Pre-QA (2026-08-31) — hallazgo real en vivo contra dev.atlanticerp.ai: cambiar Categoría, adjuntar
   * una imagen (sin guardar el form todavía), y recién ahí Guardar, terminaba persistiendo la
   * categoría ORIGINAL, no la elegida. Causa raíz: el useEffect que sincroniza el form con
   * `provider` corría en CADA refetch, incluido el que dispara la invalidación de
   * useUploadProviderBankImage — pisando en silencio el cambio de categoría sin guardar todavía.
   */
  it('subir la imagen a mitad de edición no pisa un cambio de categoría sin guardar todavía', async () => {
    // El GET que dispara la invalidación de uploadBankImage devuelve el estado real del
    // servidor (category: 'china', sin guardar el cambio del form todavía) — esto es justamente
    // lo que antes pisaba la selección sin guardar.
    mockedComprasApi.providers.get.mockResolvedValue(makeProvider({
      category: 'china', bank_image: { url: 'https://s3.test/foto.jpg', filename: 'foto.jpg' },
    }))
    mockedComprasApi.providers.uploadBankImage.mockResolvedValue(makeProvider({
      category: 'china', bank_image: { url: 'https://s3.test/foto.jpg', filename: 'foto.jpg' },
    }))
    const { container } = renderModal()
    await screen.findByText('Proveedor Demo A')
    fireEvent.click(screen.getByText('compras:providerForm.actions.edit'))

    const categorySelect = document.querySelector('select[name="category"]') as HTMLSelectElement
    fireEvent.change(categorySelect, { target: { value: 'latinoamerica' } })
    expect(categorySelect.value).toBe('latinoamerica')

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(mockedComprasApi.providers.uploadBankImage).toHaveBeenCalled())

    // La invalidación de useUploadProviderBankImage dispara un refetch de useProvider() (mismo
    // GET que devuelve category: 'china', el estado real del servidor) — ese refetch NO debe
    // pisar la selección sin guardar todavía en el form, que sigue siendo 'latinoamerica'.
    await waitFor(() => expect(mockedComprasApi.providers.get).toHaveBeenCalledTimes(2))
    expect(categorySelect.value).toBe('latinoamerica')
  })
})
