import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, type AxiosResponse } from 'axios'
import SettingsPage from './SettingsPage'
import { settingsApi, type SystemSettings, type UserPreferences } from '@/api/settingsApi'
import { authApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'

// SCRUM-990 (ronda 2) — umbral de la guarda del sincronizador de Lafayette (`lafayette_guarda_min_ratio`) en la configuración global.
// Solo SUPERADMIN lo ve y lo edita (el backend responde 403 a quien tiene settings.global sin superadmin.all); rango 0,5 a 1,0 inclusive;
// 422 con error en esa clave fuera del rango. Este archivo solo cubre ese campo: el resto de la página no tenía tests antes y no cambia.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key) }),
}))
vi.mock('@/i18n', () => ({ default: { changeLanguage: vi.fn() } }))
vi.mock('@/hooks/useTheme', () => ({ applyTheme: vi.fn() }))
vi.mock('@/api/adminApi', () => ({ adminApi: { exportCrm: vi.fn() } }))
vi.mock('@/api/authApi', () => ({
  authApi: { mfaStatus: vi.fn(), mfaEnable: vi.fn(), mfaConfirmEnable: vi.fn(), mfaResend: vi.fn(), mfaDisable: vi.fn() },
}))
vi.mock('@/api/settingsApi', () => ({
  settingsApi: {
    getPreferences: vi.fn(), updatePreferences: vi.fn(), getSystemSettings: vi.fn(), updateSystemSettings: vi.fn(),
    getAiKey: vi.fn(), updateAiKey: vi.fn(), getDocumentsMaxSize: vi.fn(), updateDocumentsMaxSize: vi.fn(),
  },
}))
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const api = vi.mocked(settingsApi, true)
const mockedAuthStore = vi.mocked(useAuthStore)

const LABEL = 'settings:global.lafayetteGuarda'
const ALERT_RANGE = 'settings:global.lafayetteGuardaError'

const PREFS: UserPreferences = { language: 'es', theme: 'light', session_timeout_min: 600, demo_mode_enabled: false }

function system(ratio = 0.9): SystemSettings {
  return {
    default_language: 'es', default_theme: 'light', session_timeout_min: 600, mfa_mode: 'optional', share_links_expiration_days: 30,
    session_inactivity_hours: 10, demo_mode_enabled: false, lafayette_guarda_min_ratio: ratio,
  }
}

function renderAs(permissions: string[]) {
  mockedAuthStore.mockReturnValue({ user: { id: 1, language: 'es', permissions }, updateUser: vi.fn() } as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  )
}

function axiosError(status: number, data: unknown) {
  return new AxiosError('request failed', 'ERR_BAD_REQUEST', undefined, undefined, { status, data } as AxiosResponse)
}

const input = () => screen.getByRole('spinbutton', { name: LABEL }) as HTMLInputElement
const save = () => within(input().closest('div.flex.flex-col') as HTMLElement).getByRole('button', { name: 'settings:global.lafayetteGuardaSave' })

beforeEach(() => {
  vi.clearAllMocks()
  api.getPreferences.mockResolvedValue(PREFS)
  api.getSystemSettings.mockResolvedValue(system())
  api.getAiKey.mockResolvedValue({ masked: null, source: 'env' })
  api.getDocumentsMaxSize.mockResolvedValue({ max_size_mb: 20 })
  vi.mocked(authApi.mfaStatus).mockResolvedValue({ enabled: false } as never)
})

describe('SettingsPage — umbral de la guarda de Lafayette (SCRUM-990)', () => {
  it('superadmin: ve la fila con la etiqueta, la ayuda, el valor actual (0,9) y su equivalente en porcentaje', async () => {
    renderAs(['superadmin.all'])
    await waitFor(() => expect(input()).toHaveValue(0.9))
    expect(screen.getByText(LABEL)).toBeInTheDocument()
    expect(screen.getByText('settings:global.lafayetteGuardaHelp')).toBeInTheDocument()
    expect(screen.getByText('settings:global.lafayetteGuardaPercent:{"percent":90}')).toBeInTheDocument()
    expect(input()).toHaveAttribute('min', '0.5')
    expect(input()).toHaveAttribute('max', '1')
  })

  it('quien solo tiene settings.global (sin superadmin.all) ve la configuración global pero NO este campo', async () => {
    renderAs(['settings.global'])
    await screen.findByText('settings:global.title')
    await waitFor(() => expect(screen.getByText('settings:global.shareLinksExpiration')).toBeInTheDocument())
    expect(screen.queryByText(LABEL)).not.toBeInTheDocument()
    expect(screen.queryByText('settings:global.lafayetteGuardaHelp')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: LABEL })).not.toBeInTheDocument()
  })

  it('sin permisos de administración no hay configuración global ni se pide /settings/system', async () => {
    renderAs([])
    await waitFor(() => expect(api.getPreferences).toHaveBeenCalled())
    expect(screen.queryByText(LABEL)).not.toBeInTheDocument()
    expect(api.getSystemSettings).not.toHaveBeenCalled()
  })

  it('el porcentaje sigue lo que se escribe (0,75 = 75 %)', async () => {
    renderAs(['superadmin.all'])
    await waitFor(() => expect(input()).toHaveValue(0.9))
    fireEvent.change(input(), { target: { value: '0.75' } })
    expect(screen.getByText('settings:global.lafayetteGuardaPercent:{"percent":75}')).toBeInTheDocument()
  })

  // (Un texto no numérico no puede existir en un input type=number: el navegador lo vacía y vacío = "sin cambios", como en los demás campos.)
  it.each([['0.49'], ['0.3'], ['0'], ['1.01'], ['1.5'], ['-1']])(
    'valor %s fuera de 0,5 a 1,0: muestra el error de rango y NO llama al backend',
    async raw => {
      renderAs(['superadmin.all'])
      await waitFor(() => expect(input()).toHaveValue(0.9))
      fireEvent.change(input(), { target: { value: raw } })
      fireEvent.click(save())
      expect(await screen.findByRole('alert')).toHaveTextContent(ALERT_RANGE)
      expect(api.updateSystemSettings).not.toHaveBeenCalled()
    },
  )

  it.each([['0.5', 0.5], ['1', 1], ['0.75', 0.75], ['0.95', 0.95]])(
    'valor %s dentro del rango (los extremos son inclusivos): guarda con PATCH { lafayette_guarda_min_ratio }',
    async (raw, expected) => {
      api.updateSystemSettings.mockResolvedValue(system(expected))
      renderAs(['superadmin.all'])
      await waitFor(() => expect(input()).toHaveValue(0.9))
      fireEvent.change(input(), { target: { value: raw } })
      fireEvent.click(save())
      await waitFor(() => expect(api.updateSystemSettings).toHaveBeenCalledTimes(1))
      // react-query puede pasar un segundo argumento (contexto) a mutationFn: se compara el cuerpo del PATCH, que es el primero.
      expect(api.updateSystemSettings.mock.calls[0][0]).toEqual({ lafayette_guarda_min_ratio: expected })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('tras guardar toma el valor del objeto de settings completo que devuelve el backend', async () => {
    api.updateSystemSettings.mockResolvedValue(system(0.75))
    renderAs(['superadmin.all'])
    await waitFor(() => expect(input()).toHaveValue(0.9))
    fireEvent.change(input(), { target: { value: '0.75' } })
    fireEvent.click(save())
    await waitFor(() => expect(input()).toHaveValue(0.75))
    expect(screen.getByText('settings:global.lafayetteGuardaPercent:{"percent":75}')).toBeInTheDocument()
  })

  it('422 con error en lafayette_guarda_min_ratio: muestra el mensaje de rango y conserva lo escrito', async () => {
    api.updateSystemSettings.mockRejectedValue(axiosError(422, {
      message: 'The lafayette guarda min ratio field must be at least 0.5.',
      errors: { lafayette_guarda_min_ratio: ['The lafayette guarda min ratio field must be at least 0.5.'] },
    }))
    renderAs(['superadmin.all'])
    await waitFor(() => expect(input()).toHaveValue(0.9))
    fireEvent.change(input(), { target: { value: '0.6' } })
    fireEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent(ALERT_RANGE)
    expect(input()).toHaveValue(0.6)
  })

  it('403 (settings.global sin superadmin.all en el backend): muestra "solo un superadmin"', async () => {
    api.updateSystemSettings.mockRejectedValue(axiosError(403, { message: 'Unauthorized' }))
    renderAs(['superadmin.all'])
    await waitFor(() => expect(input()).toHaveValue(0.9))
    fireEvent.change(input(), { target: { value: '0.8' } })
    fireEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('settings:global.lafayetteGuardaForbidden')
  })

  it('otro error (500 o red): mensaje genérico, sin tragarlo en silencio', async () => {
    api.updateSystemSettings.mockRejectedValue(axiosError(500, { message: 'Server Error' }))
    renderAs(['superadmin.all'])
    await waitFor(() => expect(input()).toHaveValue(0.9))
    fireEvent.change(input(), { target: { value: '0.8' } })
    fireEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('settings:global.lafayetteGuardaGeneric')
  })

  it('escribir de nuevo limpia el error anterior', async () => {
    renderAs(['superadmin.all'])
    await waitFor(() => expect(input()).toHaveValue(0.9))
    fireEvent.change(input(), { target: { value: '0.1' } })
    fireEvent.click(save())
    await screen.findByRole('alert')
    fireEvent.change(input(), { target: { value: '0.8' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
