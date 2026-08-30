import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import FiscalConfigPage from './FiscalConfigPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { FiscalSettings, ItbmsRate } from '@/types/adminContab'

// Batch Configuración Fiscal (SCRUM-632→637, REQ-555→560). Cubre: modo edición bloquea/desbloquea
// campos (REQ-555), "Última sincronización" nunca editable (RN3 REQ-555), gate de 403 → "acceso
// restringido" (RN1 REQ-555), tasas base sin botón eliminar (RN1 REQ-558), creación de tasa exige
// porcentaje+descripción (RN3 REQ-558).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    fiscalSettings: { get: vi.fn(), update: vi.fn() },
    itbmsRates: { list: vi.fn(), create: vi.fn(), setActive: vi.fn(), remove: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeSettings(overrides: Partial<FiscalSettings> = {}): FiscalSettings {
  return {
    razon_social: 'Atlantic S.A.',
    nombre_comercial: 'Atlantic',
    ruc: '1-2-3',
    dv: '10',
    direccion_fiscal: 'Panamá',
    regimen_tributario: 'general',
    pac_provider: 'digifact',
    pac_ambiente: 'production',
    pac_last_sync_at: '2026-08-01T10:00:00Z',
    pac_connection_status: 'conectado',
    pac_doc_factura_habilitado: true,
    pac_doc_nota_credito_habilitado: false,
    retencion_proveedores_activa: true,
    mark_approver_user_id: 1,
    dias_credito_factura: 30,
    petty_cash_max_intentos_rechazo: 2,
    ...overrides,
  }
}

function makeRates(): ItbmsRate[] {
  return [
    { id: 1, nombre: '7% General', descripcion: 'Tasa general', porcentaje: 7, es_base: true, activa: true, created_at: '2026-01-01' },
    { id: 2, nombre: '3.5% Retención', descripcion: 'Retención', porcentaje: 3.5, es_base: true, activa: true, created_at: '2026-01-01' },
    { id: 3, nombre: '0% Exento', descripcion: 'Exento', porcentaje: 0, es_base: true, activa: true, created_at: '2026-01-01' },
    { id: 4, nombre: 'Hospedaje', descripcion: 'Servicios de hospedaje', porcentaje: 10, es_base: false, activa: false, created_at: '2026-08-01' },
  ]
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <FiscalConfigPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.fiscalSettings.get.mockResolvedValue(makeSettings())
  mockedApi.itbmsRates.list.mockResolvedValue(makeRates())
})

describe('FiscalConfigPage', () => {
  it('carga en modo solo lectura por defecto: campos deshabilitados y sin botón Guardar', async () => {
    renderPage()

    const razonSocial = await screen.findByDisplayValue('Atlantic S.A.')
    expect(razonSocial).toBeDisabled()
    expect(screen.queryByText('adminContab:fiscal.saveChanges')).not.toBeInTheDocument()
    expect(screen.getByText('common:actions.edit')).toBeInTheDocument()
  })

  it('al presionar Editar se desbloquean los campos y cambia a modo edición', async () => {
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')

    fireEvent.click(screen.getByText('common:actions.edit'))

    expect(screen.getByDisplayValue('Atlantic S.A.')).not.toBeDisabled()
    expect(await screen.findByText('adminContab:fiscal.saveChanges')).toBeInTheDocument()
  })

  it('"Última sincronización" nunca se habilita, ni siquiera en modo edición', async () => {
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')

    fireEvent.click(screen.getByText('common:actions.edit'))

    const lastSync = await screen.findByDisplayValue(new Date('2026-08-01T10:00:00Z').toLocaleString())
    expect(lastSync).toBeDisabled()
  })

  // Batch 4 de Facturación (REQ-450) — el backend agregó `dias_credito_factura` sin ningún campo
  // en esta pantalla (hallazgo de Luis, superadmin, 2026-08-22).
  it('muestra y permite editar el plazo de crédito (dias_credito_factura)', async () => {
    mockedApi.fiscalSettings.update.mockResolvedValue(makeSettings({ dias_credito_factura: 45 }))
    renderPage()
    const field = await screen.findByDisplayValue('30')

    fireEvent.click(screen.getByText('common:actions.edit'))
    fireEvent.change(field, { target: { value: '45' } })
    fireEvent.click(await screen.findByText('adminContab:fiscal.saveChanges'))
    fireEvent.click(screen.getByText('common:actions.confirm'))

    await waitFor(() => expect(mockedApi.fiscalSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ dias_credito_factura: 45 }),
    ))
  })

  // Batch 21 de Caja Chica (SCRUM-618→623, REQ-542) — Senior Review: el umbral de "2 intentos" se
  // movió del backend a esta pantalla, mismo patrón que dias_credito_factura.
  it('muestra y permite editar el máximo de intentos de rechazo de Caja Chica (petty_cash_max_intentos_rechazo)', async () => {
    mockedApi.fiscalSettings.update.mockResolvedValue(makeSettings({ petty_cash_max_intentos_rechazo: 3 }))
    renderPage()
    const field = await screen.findByDisplayValue('2')

    fireEvent.click(screen.getByText('common:actions.edit'))
    fireEvent.change(field, { target: { value: '3' } })
    fireEvent.click(await screen.findByText('adminContab:fiscal.saveChanges'))
    fireEvent.click(screen.getByText('common:actions.confirm'))

    await waitFor(() => expect(mockedApi.fiscalSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ petty_cash_max_intentos_rechazo: 3 }),
    ))
  })

  it('Guardar cambios pide confirmación explícita antes de aplicar', async () => {
    mockedApi.fiscalSettings.update.mockResolvedValue(makeSettings({ razon_social: 'Nuevo Nombre' }))
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')

    fireEvent.click(screen.getByText('common:actions.edit'))
    fireEvent.click(await screen.findByText('adminContab:fiscal.saveChanges'))

    expect(await screen.findByText('adminContab:fiscal.confirmSave')).toBeInTheDocument()
    expect(mockedApi.fiscalSettings.update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('common:actions.confirm'))

    await waitFor(() => expect(mockedApi.fiscalSettings.update).toHaveBeenCalled())
  })

  it('gate de 403: muestra "acceso restringido" en vez del formulario', async () => {
    const forbidden = new AxiosError('Forbidden', '403', undefined, undefined, {
      status: 403, statusText: 'Forbidden', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() },
      data: { message: 'Esta pantalla es exclusiva de Mark.' },
    })
    mockedApi.fiscalSettings.get.mockRejectedValue(forbidden)

    renderPage()

    expect(await screen.findByText('adminContab:fiscal.restricted.title')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:fiscal.title')).not.toBeInTheDocument()
  })

  it('una tasa base (es_base=true) no muestra botón de eliminar, ni en modo edición', async () => {
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')
    fireEvent.click(screen.getByText('common:actions.edit'))

    await screen.findByText('7% General')
    // Solo la fila personalizada (Hospedaje) puede tener botón de eliminar — las 3 base, no.
    const deleteButtons = screen.getAllByLabelText('common:actions.delete')
    expect(deleteButtons).toHaveLength(1)
  })

  it('crear una tasa exige porcentaje y descripción (ya no pide nombre — RN3 REQ-558)', async () => {
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')
    fireEvent.click(screen.getByText('common:actions.edit'))

    fireEvent.click(await screen.findByText('adminContab:fiscal.itbms.addRate'))
    expect(screen.queryByLabelText('adminContab:fiscal.itbms.fields.nombre')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => {
      expect(screen.getAllByText('adminContab:fiscal.validation.required').length).toBeGreaterThan(0)
    })
    expect(mockedApi.itbmsRates.create).not.toHaveBeenCalled()
  })

  it('crea una tasa nueva cuando porcentaje y descripción están completos, sin campo nombre', async () => {
    mockedApi.itbmsRates.create.mockResolvedValue({
      id: 5, nombre: null, descripcion: 'Descripción', porcentaje: 10, es_base: false, activa: false, created_at: '2026-08-19',
    })
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')
    fireEvent.click(screen.getByText('common:actions.edit'))

    fireEvent.click(await screen.findByText('adminContab:fiscal.itbms.addRate'))
    fireEvent.change(screen.getByLabelText('adminContab:fiscal.itbms.fields.descripcion'), { target: { value: 'Descripción' } })
    fireEvent.change(screen.getByLabelText('adminContab:fiscal.itbms.fields.porcentaje'), { target: { value: '10' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.itbmsRates.create).toHaveBeenCalledWith({
      descripcion: 'Descripción', porcentaje: 10,
    }))
  })

  it('una tasa sin nombre (personalizada) muestra su descripción en el lugar del nombre en la tabla', async () => {
    mockedApi.itbmsRates.list.mockResolvedValue([
      ...makeRates().filter(r => r.es_base),
      { id: 9, nombre: null, descripcion: 'Servicios de hospedaje', porcentaje: 10, es_base: false, activa: false, created_at: '2026-08-19' },
    ])
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')

    expect(await screen.findByText('Servicios de hospedaje')).toBeInTheDocument()
  })

  it('el estado de conexión del PAC se muestra como badge de solo lectura, incluso en modo edición', async () => {
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')

    expect(await screen.findByText('adminContab:fiscal.facturacionElectronica.connectionStatus.conectado')).toBeInTheDocument()

    fireEvent.click(screen.getByText('common:actions.edit'))

    // Sigue siendo un badge de texto, no un input/select editable — no hay ningún control
    // interactivo para el estado de conexión ni en modo edición.
    expect(screen.getByText('adminContab:fiscal.facturacionElectronica.connectionStatus.conectado')).toBeInTheDocument()
  })
})
