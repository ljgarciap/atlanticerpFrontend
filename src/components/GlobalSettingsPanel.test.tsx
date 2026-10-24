import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GlobalSettingsPanel from './GlobalSettingsPanel'
import { globalSettingsApi } from '@/api/globalSettingsApi'
import type { GlobalSettingItem } from '@/types/globalSettings'

// SCRUM-944/945 (hallazgo E) — claves numéricas de `GlobalSetting` visibles/editables por superadmin.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/globalSettingsApi', () => ({
  globalSettingsApi: { list: vi.fn(), update: vi.fn() },
}))

const mockedApi = vi.mocked(globalSettingsApi, true)

function makeItem(overrides: Partial<GlobalSettingItem> = {}): GlobalSettingItem {
  return {
    key: 'documents.max_size_mb', value: 500, type: 'integer', min: 1, max: 2048,
    group: 'documents', label_key: 'globalSettings.globalTab.labels.documents_max_size_mb',
    ...overrides,
  }
}

const ITEMS = [
  makeItem(),
  makeItem({ key: 'audit_logs.retention_months', value: 12, min: 12, max: 120, group: 'audit_logs', label_key: 'globalSettings.globalTab.labels.audit_logs_retention_months' }),
]

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <GlobalSettingsPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.list.mockResolvedValue(ITEMS)
})

describe('GlobalSettingsPanel', () => {
  it('lista cada clave con su valor actual, agrupadas', async () => {
    renderPanel()

    expect(await screen.findByDisplayValue('500')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12')).toBeInTheDocument()
    // `t` mockeado devuelve el defaultValue (la key) — el rótulo sale de label_key con fallback a la clave.
    expect(screen.getByText('documents.max_size_mb')).toBeInTheDocument()
    expect(screen.getByText('audit_logs.retention_months')).toBeInTheDocument()
  })

  it('el botón Guardar solo aparece cuando el valor cambió', async () => {
    renderPanel()
    await screen.findByDisplayValue('500')

    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('500'), { target: { value: '600' } })
    expect(screen.getByText('common:actions.save')).toBeInTheDocument()
  })

  it('guarda con PUT de esa clave y el valor numérico', async () => {
    mockedApi.update.mockResolvedValue(makeItem({ value: 600 }))
    renderPanel()
    await screen.findByDisplayValue('500')

    fireEvent.change(screen.getByDisplayValue('500'), { target: { value: '600' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.update).toHaveBeenCalledWith('documents.max_size_mb', 600, undefined))
  })

  it('rechaza en el cliente un valor fuera de rango y no llama al backend', async () => {
    renderPanel()
    await screen.findByDisplayValue('12')

    fireEvent.change(screen.getByDisplayValue('12'), { target: { value: '6' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    expect(await screen.findByText('common:globalSettings.globalTab.rangeError')).toBeInTheDocument()
    expect(mockedApi.update).not.toHaveBeenCalled()
  })

  it('muestra el 422 del backend bajo la clave que falló', async () => {
    mockedApi.update.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'La retención mínima es 12 meses.', errors: { value: ['La retención mínima es 12 meses.'] } } },
    })
    renderPanel()
    await screen.findByDisplayValue('500')

    fireEvent.change(screen.getByDisplayValue('500'), { target: { value: '900' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    expect(await screen.findByText('La retención mínima es 12 meses.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('900')).toBeInTheDocument()
  })

  it('muestra un error de carga si la lista falla', async () => {
    mockedApi.list.mockRejectedValue(new Error('boom'))
    renderPanel()

    expect(await screen.findByText('common:globalSettings.globalTab.loadError')).toBeInTheDocument()
  })

  describe('reset de contraseñas (cierre de H2: vigencia e interruptor)', () => {
    const EXPIRATION = makeItem({
      key: 'password_reset_expiration_hours', value: 48, min: 1, max: 720, group: 'security',
      label_key: 'globalSettings.globalTab.labels.password_reset_expiration_hours',
    })
    const ENABLED = (value: GlobalSettingItem['value'] = false) => makeItem({
      key: 'password_reset_enabled', value, type: 'boolean', min: undefined, max: undefined, group: 'security',
      label_key: 'globalSettings.globalTab.labels.password_reset_enabled',
    })

    it('la vigencia en horas se edita con rango 1..720 y guarda el entero', async () => {
      mockedApi.list.mockResolvedValue([EXPIRATION])
      mockedApi.update.mockResolvedValue({ ...EXPIRATION, value: 72 })
      renderPanel()
      const input = await screen.findByDisplayValue('48')
      expect(input).toHaveAttribute('min', '1')
      expect(input).toHaveAttribute('max', '720')

      fireEvent.change(input, { target: { value: '72' } })
      fireEvent.change(screen.getByLabelText('common:globalSettings.globalTab.operatorPasswordLabel'), { target: { value: 'Operador-123' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      await waitFor(() => expect(mockedApi.update).toHaveBeenCalledWith('password_reset_expiration_hours', 72, 'Operador-123'))
    })

    it.each(['0', '721', '1.5', ''])('la vigencia rechaza en el cliente "%s" y no llama al backend', async (bad) => {
      mockedApi.list.mockResolvedValue([EXPIRATION])
      renderPanel()
      const input = await screen.findByDisplayValue('48')

      fireEvent.change(input, { target: { value: bad } })
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText('common:globalSettings.globalTab.rangeError')).toBeInTheDocument()
      expect(mockedApi.update).not.toHaveBeenCalled()
    })

    it('el interruptor aparece como switch apagado, sin Guardar hasta que cambia, y guarda un booleano', async () => {
      mockedApi.list.mockResolvedValue([ENABLED(false)])
      mockedApi.update.mockResolvedValue(ENABLED(true))
      renderPanel()

      const toggle = await screen.findByRole('switch')
      expect(toggle).not.toBeChecked()
      expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()

      fireEvent.click(toggle)
      expect(toggle).toBeChecked()
      fireEvent.change(screen.getByLabelText('common:globalSettings.globalTab.operatorPasswordLabel'), { target: { value: 'Operador-123' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      await waitFor(() => expect(mockedApi.update).toHaveBeenCalledWith('password_reset_enabled', true, 'Operador-123'))
      expect(typeof mockedApi.update.mock.calls[0][1]).toBe('boolean')
    })

    it('volver al valor original oculta Guardar (no hay cambio pendiente)', async () => {
      mockedApi.list.mockResolvedValue([ENABLED(true)])
      renderPanel()
      const toggle = await screen.findByRole('switch')
      expect(toggle).toBeChecked()

      fireEvent.click(toggle)
      expect(screen.getByText('common:actions.save')).toBeInTheDocument()
      fireEvent.click(toggle)
      expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()
    })

    it.each([[1, true], ['1', true], ['true', true], [0, false], [false, false]])('interpreta el valor %s del backend como %s', async (raw, expected) => {
      mockedApi.list.mockResolvedValue([ENABLED(raw as GlobalSettingItem['value'])])
      renderPanel()
      const toggle = await screen.findByRole('switch')
      if (expected) expect(toggle).toBeChecked(); else expect(toggle).not.toBeChecked()
    })

    it('muestra el error del backend al guardar el interruptor y conserva el estado elegido', async () => {
      mockedApi.list.mockResolvedValue([ENABLED(false)])
      mockedApi.update.mockRejectedValue({ isAxiosError: true, response: { status: 403, data: { message: 'Solo superadmin.' } } })
      renderPanel()
      const toggle = await screen.findByRole('switch')

      fireEvent.click(toggle)
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(toggle).toBeChecked()
    })

    it('el interruptor y la vigencia conviven con el resto de claves numéricas', async () => {
      mockedApi.list.mockResolvedValue([makeItem(), EXPIRATION, ENABLED(false)])
      renderPanel()
      expect(await screen.findByDisplayValue('500')).toBeInTheDocument()
      expect(screen.getByDisplayValue('48')).toBeInTheDocument()
      expect(screen.getByRole('switch')).toBeInTheDocument()
    })
  })

  describe('ajustes críticos del reset de contraseñas (cierre de R3-6)', () => {
    const CRITICAL = [
      makeItem({ key: 'password_reset_enabled', value: false, type: 'boolean', group: 'auth', label_key: 'x.enabled' }),
      makeItem({ key: 'password_reset_expiration_hours', value: 48, min: 1, max: 720, group: 'auth', label_key: 'x.exp' }),
    ]

    it('guardar el interruptor sin contraseña del operador no llama al backend', async () => {
      mockedApi.list.mockResolvedValue(CRITICAL)
      renderPanel()
      fireEvent.click(await screen.findByRole('switch'))
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText('common:globalSettings.globalTab.passwordRequired')).toBeInTheDocument()
      expect(mockedApi.update).not.toHaveBeenCalled()
    })

    it('guardar el interruptor envía operator_password y limpia el campo', async () => {
      mockedApi.list.mockResolvedValue(CRITICAL)
      mockedApi.update.mockResolvedValue(CRITICAL[0])
      renderPanel()
      fireEvent.click(await screen.findByRole('switch'))
      fireEvent.change(screen.getByLabelText('common:globalSettings.globalTab.operatorPasswordLabel'), { target: { value: 'Operador-123' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      await waitFor(() => expect(mockedApi.update).toHaveBeenCalledWith('password_reset_enabled', true, 'Operador-123'))
    })

    it('la caducidad también pide la contraseña y un 422 operator_reauth_failed muestra "contraseña incorrecta"', async () => {
      mockedApi.list.mockResolvedValue(CRITICAL)
      mockedApi.update.mockRejectedValue({ response: { status: 422, data: { code: 'operator_reauth_failed', message: 'x' } } })
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('48'), { target: { value: '72' } })
      fireEvent.change(screen.getByLabelText('common:globalSettings.globalTab.operatorPasswordLabel'), { target: { value: 'mala' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText('common:globalSettings.globalTab.reauthFailed')).toBeInTheDocument()
      expect(mockedApi.update).toHaveBeenCalledWith('password_reset_expiration_hours', 72, 'mala')
    })

    it('los demás ajustes siguen guardándose SIN contraseña y sin mostrar el campo', async () => {
      mockedApi.update.mockResolvedValue(makeItem({ value: 600 }))
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('500'), { target: { value: '600' } })
      expect(screen.queryByLabelText('common:globalSettings.globalTab.operatorPasswordLabel')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('common:actions.save'))
      await waitFor(() => expect(mockedApi.update).toHaveBeenCalledWith('documents.max_size_mb', 600, undefined))
    })
  })

  // SCRUM-1158 — las claves `impersonation_*` llegan con `requires_reauth: true` y exigen la contraseña del superadmin; los demás ajustes no cambian.
  describe('claves impersonation_* con requires_reauth (SCRUM-1158)', () => {
    const PW_LABEL = 'common:globalSettings.globalTab.operatorPasswordLabel'
    const IMP = [
      makeItem({ key: 'impersonation_max_minutes', value: 30, min: 5, max: 120, group: 'impersonation', requires_reauth: true,
        label_key: 'globalSettings.globalTab.labels.impersonation_max_minutes' }),
      makeItem({ key: 'impersonation_alert_blocked_writes_per_session', value: 20, min: 1, max: 500, group: 'impersonation', requires_reauth: true,
        label_key: 'globalSettings.globalTab.labels.impersonation_alert_blocked_writes_per_session' }),
    ]

    it('muestra las dos claves (incluida la quinta) y NO pide la contraseña hasta que se edita una', async () => {
      mockedApi.list.mockResolvedValue(IMP)
      renderPanel()
      expect(await screen.findByDisplayValue('30')).toBeInTheDocument()
      expect(screen.getByDisplayValue('20')).toBeInTheDocument()
      expect(screen.queryByLabelText(PW_LABEL)).not.toBeInTheDocument()

      fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '45' } })
      expect(screen.getByLabelText(PW_LABEL)).toBeInTheDocument()
    })

    it('guardar sin contraseña no llama al backend', async () => {
      mockedApi.list.mockResolvedValue(IMP)
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('30'), { target: { value: '45' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText('common:globalSettings.globalTab.passwordRequired')).toBeInTheDocument()
      expect(mockedApi.update).not.toHaveBeenCalled()
    })

    it('guardar con contraseña envía el valor y operator_password, y limpia el campo', async () => {
      mockedApi.list.mockResolvedValue(IMP)
      mockedApi.update.mockResolvedValue(IMP[0])
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('30'), { target: { value: '45' } })
      fireEvent.change(screen.getByLabelText(PW_LABEL), { target: { value: 'Operador-123' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      await waitFor(() => expect(mockedApi.update).toHaveBeenCalledWith('impersonation_max_minutes', 45, 'Operador-123'))
    })

    it('la quinta clave también exige la contraseña', async () => {
      mockedApi.list.mockResolvedValue(IMP)
      mockedApi.update.mockResolvedValue(IMP[1])
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('20'), { target: { value: '50' } })
      fireEvent.change(screen.getByLabelText(PW_LABEL), { target: { value: 'Operador-123' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      await waitFor(() => expect(mockedApi.update).toHaveBeenCalledWith('impersonation_alert_blocked_writes_per_session', 50, 'Operador-123'))
    })

    it('un valor fuera de rango se rechaza ANTES de pedir la contraseña y sin llamar al backend', async () => {
      mockedApi.list.mockResolvedValue(IMP)
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('30'), { target: { value: '999' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText(/rangeError/)).toBeInTheDocument()
      expect(screen.queryByText('common:globalSettings.globalTab.passwordRequired')).not.toBeInTheDocument()
      expect(mockedApi.update).not.toHaveBeenCalled()
    })

    it('422 operator_reauth_failed muestra contraseña incorrecta y limpia el campo', async () => {
      mockedApi.list.mockResolvedValue(IMP)
      mockedApi.update.mockRejectedValue({ response: { status: 422, data: { code: 'operator_reauth_failed', message: 'x' } } })
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('30'), { target: { value: '45' } })
      fireEvent.change(screen.getByLabelText(PW_LABEL), { target: { value: 'mala' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText('common:globalSettings.globalTab.reauthFailed')).toBeInTheDocument()
      expect((screen.getByLabelText(PW_LABEL) as HTMLInputElement).value).toBe('')
    })

    it('422 operator_password_required muestra que falta la contraseña', async () => {
      mockedApi.list.mockResolvedValue(IMP)
      mockedApi.update.mockRejectedValue({ response: { status: 422, data: { code: 'operator_password_required', message: 'x' } } })
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('30'), { target: { value: '45' } })
      fireEvent.change(screen.getByLabelText(PW_LABEL), { target: { value: 'x' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText('common:globalSettings.globalTab.passwordRequired')).toBeInTheDocument()
    })

    it('429 too_many_attempts con retry_after avisa cuánto esperar', async () => {
      mockedApi.list.mockResolvedValue(IMP)
      mockedApi.update.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 120 } } })
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('30'), { target: { value: '45' } })
      fireEvent.change(screen.getByLabelText(PW_LABEL), { target: { value: 'x' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText('common:globalSettings.globalTab.throttledWait')).toBeInTheDocument()
    })

    it('429 sin retry_after asume una espera de un minuto y la avisa', async () => {
      mockedApi.list.mockResolvedValue(IMP)
      mockedApi.update.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts' } } })
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('30'), { target: { value: '45' } })
      fireEvent.change(screen.getByLabelText(PW_LABEL), { target: { value: 'x' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText('common:globalSettings.globalTab.throttledWait')).toBeInTheDocument()
    })

    it('un 422 de validación sobre `value` se muestra como error del campo, no como contraseña', async () => {
      mockedApi.list.mockResolvedValue(IMP)
      mockedApi.update.mockRejectedValue({
        isAxiosError: true,
        response: { status: 422, data: { message: 'El valor debe estar entre 5 y 120.', errors: { value: ['El valor debe estar entre 5 y 120.'] } } },
      })
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('30'), { target: { value: '45' } })
      fireEvent.change(screen.getByLabelText(PW_LABEL), { target: { value: 'x' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText(/El valor debe estar entre 5 y 120\./)).toBeInTheDocument()
      expect(screen.queryByText('common:globalSettings.globalTab.reauthFailed')).not.toBeInTheDocument()
    })
  })

  describe('ajustes SIN requires_reauth no cambian (SCRUM-1158)', () => {
    it('un 429 en un ajuste común conserva el mensaje genérico de guardado, no el de contraseña', async () => {
      mockedApi.update.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 60 } } })
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('500'), { target: { value: '600' } })
      fireEvent.click(screen.getByText('common:actions.save'))

      expect(await screen.findByText('common:globalSettings.globalTab.saveError')).toBeInTheDocument()
      expect(screen.queryByText('common:globalSettings.globalTab.throttledWait')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('common:globalSettings.globalTab.operatorPasswordLabel')).not.toBeInTheDocument()
    })

    it('un ajuste con requires_reauth: false explícito tampoco pide contraseña', async () => {
      mockedApi.list.mockResolvedValue([makeItem({ requires_reauth: false })])
      mockedApi.update.mockResolvedValue(makeItem({ value: 600 }))
      renderPanel()
      fireEvent.change(await screen.findByDisplayValue('500'), { target: { value: '600' } })
      expect(screen.queryByLabelText('common:globalSettings.globalTab.operatorPasswordLabel')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('common:actions.save'))
      await waitFor(() => expect(mockedApi.update).toHaveBeenCalledWith('documents.max_size_mb', 600, undefined))
    })
  })
})

