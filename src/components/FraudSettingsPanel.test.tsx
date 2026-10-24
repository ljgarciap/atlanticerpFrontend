import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FraudSettingsPanel from './FraudSettingsPanel'
import { adminContabApi } from '@/api/adminContabApi'
import { useAuthStore } from '@/store/authStore'
import type { FraudSettings } from '@/types/adminContab'

// REQ-635 (SCRUM-811) — mismo patrón que BodegaSettingsPage.test.tsx: renderizado, validación de
// rango, submit exitoso y el gate de permiso (superadmin.all).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'min' in opts && 'max' in opts) return `${key} ${opts.min}-${opts.max}`
      return key
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    fraudSettings: { get: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(adminContabApi, true)
const mockedStore = vi.mocked(useAuthStore)

function mockAuthState(permissions: string[]) {
  mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: { id: 1, permissions } }
    return selector ? selector(state) : state
  }) as never)
}

function makeSettings(overrides: Partial<FraudSettings> = {}): FraudSettings {
  return {
    fraude_monto_desviaciones: 3,
    fraude_monto_ventana_dias: 90,
    fraude_aprobaciones_repetidas_n: 5,
    fraude_aprobaciones_repetidas_minutos: 10,
    comision_pendiente_dias: 14,
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <FraudSettingsPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.fraudSettings.get.mockResolvedValue(makeSettings())
  mockAuthState(['superadmin.all'])
})

describe('FraudSettingsPanel', () => {
  it('carga y muestra los 5 umbrales configurados', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('90')).toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('10')).toBeInTheDocument()
    expect(screen.getByDisplayValue('14')).toBeInTheDocument()
  })

  it('gate de permiso: sin superadmin.all no se ve el formulario', async () => {
    mockAuthState(['admin_contab.read'])
    renderPage()

    expect(screen.getByText('adminContab:fraudSettings.forbidden')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:fraudSettings.save')).not.toBeInTheDocument()
    expect(mockedApi.fraudSettings.get).not.toHaveBeenCalled()
  })

  it('el botón Guardar solo aparece cuando algún valor cambió', async () => {
    renderPage()
    await screen.findByDisplayValue('3')

    expect(screen.queryByText('adminContab:fraudSettings.save')).not.toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '8' } })
    expect(await screen.findByText('adminContab:fraudSettings.save')).toBeInTheDocument()
  })

  it('valida rango: rechaza un valor por encima del máximo permitido', async () => {
    renderPage()
    await screen.findByDisplayValue('3')

    // fraude_monto_desviaciones tiene rango 1-10
    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '11' } })
    fireEvent.click(await screen.findByText('adminContab:fraudSettings.save'))

    await waitFor(() => {
      expect(screen.getByText('adminContab:fraudSettings.validation.range 1-10')).toBeInTheDocument()
    })
    expect(mockedApi.fraudSettings.update).not.toHaveBeenCalled()
  })

  it('guarda los nuevos umbrales y limpia el estado dirty', async () => {
    mockedApi.fraudSettings.update.mockResolvedValue(makeSettings({ fraude_aprobaciones_repetidas_n: 8 }))
    renderPage()
    await screen.findByDisplayValue('5')

    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '8' } })
    fireEvent.click(await screen.findByText('adminContab:fraudSettings.save'))

    await waitFor(() => expect(mockedApi.fraudSettings.update).toHaveBeenCalledWith({
      fraude_monto_desviaciones: 3,
      fraude_monto_ventana_dias: 90,
      fraude_aprobaciones_repetidas_n: 8,
      fraude_aprobaciones_repetidas_minutos: 10,
      comision_pendiente_dias: 14,
    }))

    expect(await screen.findByText('adminContab:fraudSettings.saved')).toBeInTheDocument()
    expect(screen.queryByText('adminContab:fraudSettings.save')).not.toBeInTheDocument()
  })

  it('muestra un error si la API rechaza el guardado', async () => {
    mockedApi.fraudSettings.update.mockRejectedValue(new Error('network error'))
    renderPage()
    await screen.findByDisplayValue('3')

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '2' } })
    fireEvent.click(await screen.findByText('adminContab:fraudSettings.save'))

    expect(await screen.findByText('adminContab:fraudSettings.saveError')).toBeInTheDocument()
  })
})
