import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import FiscalSettingsPanel from './FiscalSettingsPanel'
import { adminContabApi } from '@/api/adminContabApi'
import type { FiscalSettings, ItbmsRate } from '@/types/adminContab'
import { formatDateTimeShort } from '@/utils/dates'

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
    primary_approver_user_id: 1,
    dias_credito_factura: 30,
    petty_cash_max_intentos_rechazo: 2,
    fe_reintento_max_horas: 24,
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
      <FiscalSettingsPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.fiscalSettings.get.mockResolvedValue(makeSettings())
  mockedApi.itbmsRates.list.mockResolvedValue(makeRates())
})

describe('FiscalSettingsPanel', () => {
  it('Fase 6b: muestra el nombre legible del proveedor que manda el backend', async () => {
    mockedApi.fiscalSettings.get.mockResolvedValue(makeSettings({ pac_provider: 'msl', pac_provider_label: 'MSL (Panamá)' }))
    renderPage()

    expect(await screen.findByDisplayValue('MSL (Panamá)')).toBeDisabled()
    expect(screen.queryByText('adminContab:fiscal.facturacionElectronica.sinProveedor')).not.toBeInTheDocument()
  })

  it('Fase 6b: sin proveedor fiscal (país sin paquete) explica que los documentos son internos y oculta ambiente y tipos de documento', async () => {
    mockedApi.fiscalSettings.get.mockResolvedValue(makeSettings({
      pac_provider: 'none', pac_provider_label: 'Sin facturación electrónica', facturacion_electronica_activa: false, pais: 'CO',
    }))
    renderPage()

    expect(await screen.findByDisplayValue('Sin facturación electrónica')).toBeDisabled()
    expect(screen.getByText('adminContab:fiscal.facturacionElectronica.sinProveedor')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:fiscal.facturacionElectronica.fields.ambiente')).not.toBeInTheDocument()
    expect(screen.queryByText('adminContab:fiscal.facturacionElectronica.docs.factura')).not.toBeInTheDocument()
    expect(screen.queryByText('adminContab:fiscal.facturacionElectronica.docs.notaCredito')).not.toBeInTheDocument()
  })

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

    // Comparación normalizada de espacios: Intl inserta un NBSP entre "a." y "m." en "a. m." que
    // no siempre sobrevive intacto el matching por igualdad estricta de findByDisplayValue.
    const expected = formatDateTimeShort('2026-08-01T10:00:00Z').replace(/\s/g, ' ')
    const lastSync = await screen.findByDisplayValue((value) => value.replace(/\s/g, ' ') === expected)
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

  it('SCRUM-1019 — fe_reintento_max_horas: se envía en el PUT, vacío o fuera de 1–720 no se envía (nunca null)', async () => {
    mockedApi.fiscalSettings.update.mockResolvedValue(makeSettings())
    renderPage()
    await screen.findByDisplayValue('2')
    const campo = screen.getByLabelText(/fields\.feReintentoMaxHoras(?!Ayuda)/)

    fireEvent.click(screen.getByText('common:actions.edit'))
    expect(campo).toHaveValue(24) // precargado del show
    fireEvent.click(await screen.findByText('adminContab:fiscal.saveChanges'))
    for (const invalido of ['', '999']) {
      fireEvent.change(campo, { target: { value: invalido } })
      fireEvent.click(screen.getByText('common:actions.confirm'))
      expect(await screen.findByText('adminContab:fiscal.validation.feReintentoMaxHoras')).toBeInTheDocument()
      expect(mockedApi.fiscalSettings.update).not.toHaveBeenCalled()
    }

    fireEvent.change(campo, { target: { value: '48' } })
    fireEvent.click(screen.getByText('adminContab:fiscal.saveChanges'))
    fireEvent.click(await screen.findByText('common:actions.confirm'))
    await waitFor(() => expect(mockedApi.fiscalSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ fe_reintento_max_horas: 48 }),
    ))
  })

  // Pre-QA SCRUM-872 (2026-09-14) — el backend (`UpdateFiscalSettingsRequest`) ya permite vaciar
  // estos campos desde SCRUM-857/858 (sin `required`/`min:1`, solo `sometimes/string/max`), pero
  // el schema de Zod de esta pantalla seguía exigiendo `min(1)`: react-hook-form bloqueaba el
  // submit con "Este campo es obligatorio." ANTES de que el PUT saliera, así que el bug original
  // seguía intacto desde la UI pese al fix de backend (confirmado en vivo contra dev.atlanticerp.ai).
  it('permite vaciar un campo de texto ya cargado (nombre_comercial) y dispara el PUT real, sin bloqueo de validación', async () => {
    mockedApi.fiscalSettings.update.mockResolvedValue(makeSettings({ nombre_comercial: '' }))
    renderPage()
    const field = await screen.findByDisplayValue('Atlantic')

    fireEvent.click(screen.getByText('common:actions.edit'))
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.click(await screen.findByText('adminContab:fiscal.saveChanges'))

    // No debe bloquear con el error de campo obligatorio ni impedir llegar a la confirmación.
    expect(screen.queryByText('adminContab:fiscal.validation.required')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByText('common:actions.confirm'))

    await waitFor(() => expect(mockedApi.fiscalSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ nombre_comercial: '' }),
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
      data: { message: 'Esta pantalla es exclusiva de Gerencia.' },
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

  // SCRUM-943 — interruptor global apagado/sandbox/producción: el selector pasa de 2 a 3 opciones.
  it('el badge de ambiente muestra "apagado" en modo solo lectura', async () => {
    mockedApi.fiscalSettings.get.mockResolvedValue(makeSettings({ pac_ambiente: 'apagado' }))
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')

    expect(await screen.findByText('adminContab:fiscal.facturacionElectronica.ambiente.apagado')).toBeInTheDocument()
  })

  it('el selector de ambiente en modo edición ofrece las 3 opciones (apagado/sandbox/producción)', async () => {
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')
    fireEvent.click(screen.getByText('common:actions.edit'))

    const select = await screen.findByDisplayValue('adminContab:fiscal.facturacionElectronica.ambiente.production')
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value)
    expect(options).toEqual(['apagado', 'testing', 'production'])
  })

  it('permite cambiar el ambiente a apagado y dispara el PUT real', async () => {
    mockedApi.fiscalSettings.update.mockResolvedValue(makeSettings({ pac_ambiente: 'apagado' }))
    renderPage()
    await screen.findByDisplayValue('Atlantic S.A.')
    fireEvent.click(screen.getByText('common:actions.edit'))

    const select = await screen.findByDisplayValue('adminContab:fiscal.facturacionElectronica.ambiente.production')
    fireEvent.change(select, { target: { value: 'apagado' } })
    fireEvent.click(await screen.findByText('adminContab:fiscal.saveChanges'))
    fireEvent.click(screen.getByText('common:actions.confirm'))

    await waitFor(() => expect(mockedApi.fiscalSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ pac_ambiente: 'apagado' }),
    ))
  })

  it('el proveedor (PAC) muestra el valor real, nunca hardcodeado a Digifact', async () => {
    mockedApi.fiscalSettings.get.mockResolvedValue(makeSettings({ pac_provider: 'msl' }))
    renderPage()

    expect(await screen.findByDisplayValue('MSL')).toBeDisabled()
  })
})
