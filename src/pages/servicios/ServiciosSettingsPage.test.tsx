import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ServiciosSettingsPage from './ServiciosSettingsPage'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import type { ServiciosSetting } from '@/types/servicios'
import type { UserInfo } from '@/types/auth'

const LABELS: Record<string, string> = {
  'settings.title': 'Ajustes de Servicios',
  'settings.groups.cotizacion': 'Cotización de Servicio',
  'settings.groups.operacion': 'Operación',
  'settings.save': 'Guardar cambios',
  'settings.saved': 'Ajustes actualizados.',
  'nav.module': 'Servicios',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => LABELS[key] ?? key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    settings: { list: vi.fn(), update: vi.fn() },
  },
}))

const mockedApi = vi.mocked(serviciosApi, true)

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Aaron', last_name: 'Leis', email: 'servicio@illuminations.com.pa',
    role: 'superadmin', permissions: ['servicios.read'], modules: {},
    ...overrides,
  }
}

function makeSettings(): ServiciosSetting[] {
  return [
    { key: 'condiciones_cotizacion_servicios', group: 'cotizacion', label: 'Cotización — Condiciones del servicio (texto)', type: 'text', value: '50% de anticipo' },
    { key: 'itbms_percent', group: 'cotizacion', label: 'Cotización — ITBMS (%)', type: 'int', value: 7 },
    { key: 'sin_agendar_umbral_dias', group: 'operacion', label: 'Días sin agendar', type: 'int', value: 3 },
  ]
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ServiciosSettingsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// Batch 12 (REQ-237) — extensión de "Ajustes de Servicios" para el tipo 'text' y el grupo
// 'cotizacion' (ambos ausentes de esta pantalla hasta este batch, ver docblock de GROUP_ORDER).
describe('ServiciosSettingsPage', () => {
  it('renderiza el grupo "cotizacion" y un textarea (no number input) para type=text', async () => {
    useAuthStore.setState({ user: makeUser() })
    mockedApi.settings.list.mockResolvedValue(makeSettings())
    renderPage()

    expect(await screen.findByText('Cotización de Servicio')).toBeInTheDocument()
    // Fix CI flaky 2026-08-13 (mismo patrón de feedback_ci_flaky_quotepage_tests): el header del
    // grupo y el valor hidratado del campo dependen de ciclos de render distintos — un
    // `getByDisplayValue` síncrono acá corre carrera real bajo el timing de GitHub Actions, igual
    // que el test de abajo ya usa `findByDisplayValue` correctamente.
    const textarea = await screen.findByDisplayValue('50% de anticipo')
    expect(textarea.tagName).toBe('TEXTAREA')
  })

  it('numérico sigue siendo <input type=number>', async () => {
    useAuthStore.setState({ user: makeUser() })
    mockedApi.settings.list.mockResolvedValue(makeSettings())
    renderPage()

    const input = await screen.findByDisplayValue('7')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveAttribute('type', 'number')
  })

  it('guardar manda el texto tal cual (sin Number()) y los numéricos convertidos (REQ-237)', async () => {
    useAuthStore.setState({ user: makeUser() })
    mockedApi.settings.list.mockResolvedValue(makeSettings())
    mockedApi.settings.update.mockResolvedValue(makeSettings())
    renderPage()

    const textarea = await screen.findByDisplayValue('50% de anticipo')
    fireEvent.change(textarea, { target: { value: '100% de anticipo' } })
    fireEvent.click(screen.getByText('Guardar cambios'))

    await waitFor(() => expect(mockedApi.settings.update).toHaveBeenCalledWith({
      condiciones_cotizacion_servicios: '100% de anticipo',
    }))
  })

  it('rol sin permiso de edición ve los campos deshabilitados y sin botón "Guardar"', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.settings.list.mockResolvedValue(makeSettings())
    renderPage()

    const textarea = await screen.findByDisplayValue('50% de anticipo')
    expect(textarea).toBeDisabled()
    expect(screen.queryByText('Guardar cambios')).not.toBeInTheDocument()
  })
})
