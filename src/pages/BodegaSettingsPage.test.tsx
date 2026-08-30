import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BodegaSettingsPage from './BodegaSettingsPage'
import { bodegaApi } from '@/api/bodegaApi'
import { useAuthStore } from '@/store/authStore'
import type { BodegaSettings } from '@/types/bodega'

// SCRUM-500 — hallazgo de Senior Review en Batch B1: los 5 umbrales de `bodega_settings`
// (`urgente_ventana_dias` ya existía; los otros 4 se agregaron para Home) solo eran editables por
// SQL/tinker. Cubre renderizado, validación de rango/negativos, submit exitoso y el gate de
// permiso (superadmin.all) que este componente repite además de `RequirePermission` en App.tsx.

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

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    settings: { get: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(bodegaApi, true)
const mockedStore = vi.mocked(useAuthStore)

// Mismo patrón que OrderDetailPage.test.tsx — usePermission usa el selector de useAuthStore, el
// mock tiene que invocarlo, no solo devolver un objeto fijo.
function mockAuthState(permissions: string[]) {
  mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: { id: 1, permissions } }
    return selector ? selector(state) : state
  }) as never)
}

function makeSettings(overrides: Partial<BodegaSettings> = {}): BodegaSettings {
  return {
    urgente_ventana_dias: 1,
    pendientes_picking_horas: 3,
    pendientes_guia_dias: 2,
    rotacion_ventana_dias: 30,
    rotacion_top_n: 5,
    capacidad_concentracion_pct: 75,
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BodegaSettingsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.settings.get.mockResolvedValue(makeSettings())
  mockAuthState(['superadmin.all'])
})

describe('BodegaSettingsPage', () => {
  it('carga y muestra los 6 umbrales configurados', async () => {
    renderPage()

    expect(await screen.findByDisplayValue('1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('75')).toBeInTheDocument()
  })

  it('gate de permiso: sin superadmin.all no se ve el formulario', async () => {
    mockAuthState(['bodega.read'])
    renderPage()

    expect(screen.getByText('bodega:settings.forbidden')).toBeInTheDocument()
    expect(screen.queryByText('bodega:settings.save')).not.toBeInTheDocument()
    expect(mockedApi.settings.get).not.toHaveBeenCalled()
  })

  it('gate de permiso: sin usuario autenticado no se ve el formulario', async () => {
    mockedStore.mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
      const state = { user: null }
      return selector ? selector(state) : state
    }) as never)
    renderPage()

    expect(screen.getByText('bodega:settings.forbidden')).toBeInTheDocument()
  })

  it('el botón Guardar solo aparece cuando algún valor cambió', async () => {
    renderPage()
    await screen.findByDisplayValue('1')

    expect(screen.queryByText('bodega:settings.save')).not.toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '10' } })
    expect(await screen.findByText('bodega:settings.save')).toBeInTheDocument()
  })

  it('valida rango: rechaza un valor negativo sin llamar a la API', async () => {
    renderPage()
    await screen.findByDisplayValue('3')

    fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '-5' } })
    fireEvent.click(await screen.findByText('bodega:settings.save'))

    await waitFor(() => {
      expect(screen.getByText('bodega:settings.validation.range 1-168')).toBeInTheDocument()
    })
    expect(mockedApi.settings.update).not.toHaveBeenCalled()
  })

  it('valida rango: rechaza un valor por encima del máximo permitido', async () => {
    renderPage()
    await screen.findByDisplayValue('5')

    // rotacion_top_n tiene rango 1-100
    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '999' } })
    fireEvent.click(await screen.findByText('bodega:settings.save'))

    await waitFor(() => {
      expect(screen.getByText('bodega:settings.validation.range 1-100')).toBeInTheDocument()
    })
    expect(mockedApi.settings.update).not.toHaveBeenCalled()
  })

  it('guarda los nuevos umbrales y limpia el estado dirty', async () => {
    mockedApi.settings.update.mockResolvedValue(makeSettings({ rotacion_top_n: 10 }))
    renderPage()
    await screen.findByDisplayValue('5')

    fireEvent.change(screen.getByDisplayValue('5'), { target: { value: '10' } })
    fireEvent.click(await screen.findByText('bodega:settings.save'))

    await waitFor(() => expect(mockedApi.settings.update).toHaveBeenCalledWith({
      urgente_ventana_dias: 1,
      pendientes_picking_horas: 3,
      pendientes_guia_dias: 2,
      rotacion_ventana_dias: 30,
      rotacion_top_n: 10,
      capacidad_concentracion_pct: 75,
    }))

    expect(await screen.findByText('bodega:settings.saved')).toBeInTheDocument()
    expect(screen.queryByText('bodega:settings.save')).not.toBeInTheDocument()
  })

  it('muestra un error si la API rechaza el guardado', async () => {
    mockedApi.settings.update.mockRejectedValue(new Error('network error'))
    renderPage()
    await screen.findByDisplayValue('1')

    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '2' } })
    fireEvent.click(await screen.findByText('bodega:settings.save'))

    expect(await screen.findByText('bodega:settings.saveError')).toBeInTheDocument()
  })
})
