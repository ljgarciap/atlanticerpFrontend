import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ComprasSettingsPanel from './ComprasSettingsPanel'
import { comprasApi } from '@/api/comprasApi'
import type { ComprasSettings } from '@/types/compras'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    settings: { get: vi.fn(), update: vi.fn() },
  },
}))

const mockedApi = vi.mocked(comprasApi, true)

function makeSettings(overrides: Partial<ComprasSettings> = {}): ComprasSettings {
  return {
    low_rating_threshold: 40, mark_approver_user_id: null, claim_attention_days: 7,
    replacement_margin_threshold: 15,
    similarity_weight_text: 50, similarity_weight_price: 30, similarity_weight_margin: 20,
    similarity_other_category_penalty: 30, similarity_min_threshold: 25,
    ...overrides,
  }
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ComprasSettingsPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.settings.get.mockResolvedValue(makeSettings())
})

describe('ComprasSettingsPanel', () => {
  it('carga el umbral configurado', async () => {
    renderPanel()

    expect(await screen.findByDisplayValue('40')).toBeInTheDocument()
  })

  it('el botón Guardar solo aparece cuando el valor cambió', async () => {
    renderPanel()
    await screen.findByDisplayValue('40')

    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('40'), { target: { value: '75' } })
    expect(screen.getByText('common:actions.save')).toBeInTheDocument()
  })

  it('guarda el nuevo umbral', async () => {
    mockedApi.settings.update.mockResolvedValue(makeSettings({ low_rating_threshold: 75 }))
    renderPanel()
    await screen.findByDisplayValue('40')

    fireEvent.change(screen.getByDisplayValue('40'), { target: { value: '75' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.settings.update).toHaveBeenCalledWith({
      low_rating_threshold: 75, claim_attention_days: 7, replacement_margin_threshold: 15,
      similarity_weight_text: 50, similarity_weight_price: 30, similarity_weight_margin: 20,
      similarity_other_category_penalty: 30, similarity_min_threshold: 25,
    }))
  })

  it('SCRUM-257 — carga y guarda los días de atención de reclamos (hallazgo de QA: existía en el backend sin pantalla)', async () => {
    mockedApi.settings.update.mockResolvedValue(makeSettings({ claim_attention_days: 14 }))
    renderPanel()
    await screen.findByDisplayValue('40')

    expect(screen.getByDisplayValue('7')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('7'), { target: { value: '14' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.settings.update).toHaveBeenCalledWith({
      low_rating_threshold: 40, claim_attention_days: 14, replacement_margin_threshold: 15,
      similarity_weight_text: 50, similarity_weight_price: 30, similarity_weight_margin: 20,
      similarity_other_category_penalty: 30, similarity_min_threshold: 25,
    }))
  })

  it('SCRUM-247 — carga y guarda el umbral de margen de sustitutos (REQ-184: nunca hardcodeado)', async () => {
    mockedApi.settings.update.mockResolvedValue(makeSettings({ replacement_margin_threshold: 20 }))
    renderPanel()
    await screen.findByDisplayValue('40')

    expect(screen.getByDisplayValue('15')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('15'), { target: { value: '20' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.settings.update).toHaveBeenCalledWith({
      low_rating_threshold: 40, claim_attention_days: 7, replacement_margin_threshold: 20,
      similarity_weight_text: 50, similarity_weight_price: 30, similarity_weight_margin: 20,
      similarity_other_category_penalty: 30, similarity_min_threshold: 25,
    }))
  })

  it('Lote 4 (SCRUM-246) — carga y guarda los pesos de la fórmula de similitud (gap real: existía en el backend sin pantalla)', async () => {
    mockedApi.settings.update.mockResolvedValue(makeSettings({ similarity_weight_text: 60, similarity_min_threshold: 30 }))
    renderPanel()
    await screen.findByDisplayValue('40')

    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('50'), { target: { value: '60' } })
    fireEvent.change(screen.getByDisplayValue('25'), { target: { value: '30' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.settings.update).toHaveBeenCalledWith({
      low_rating_threshold: 40, claim_attention_days: 7, replacement_margin_threshold: 15,
      similarity_weight_text: 60, similarity_weight_price: 30, similarity_weight_margin: 20,
      similarity_other_category_penalty: 30, similarity_min_threshold: 30,
    }))
  })

  it('deshabilita Guardar con un valor fuera de rango, sin llamar a la API (validación básica)', async () => {
    renderPanel()
    await screen.findByDisplayValue('40')

    fireEvent.change(screen.getByDisplayValue('40'), { target: { value: '150' } })
    const saveButton = screen.getByText('common:actions.save').closest('button')

    expect(saveButton).toBeDisabled()
    expect(mockedApi.settings.update).not.toHaveBeenCalled()
  })
})
