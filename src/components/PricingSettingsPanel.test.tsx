import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PricingSettingsPanel from './PricingSettingsPanel'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { PricingSettingsValue } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    pricingSettings: { get: vi.fn(), update: vi.fn() },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeSettings(overrides: Partial<PricingSettingsValue> = {}): PricingSettingsValue {
  return {
    project_discount_percent: 15, special_additional_discount_percent: 5,
    partner_divisor: 0.85, premium_divisor: 0.65, min_margin_percent: 30,
    ...overrides,
  }
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PricingSettingsPanel />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.pricingSettings.get.mockResolvedValue(makeSettings())
})

describe('PricingSettingsPanel', () => {
  it('carga los valores configurados', async () => {
    renderPanel()

    expect(await screen.findByDisplayValue('15')).toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
    expect(screen.getByDisplayValue('0.85')).toBeInTheDocument()
    expect(screen.getByDisplayValue('0.65')).toBeInTheDocument()
  })

  it('el botón Guardar solo aparece cuando un valor cambió', async () => {
    renderPanel()
    await screen.findByDisplayValue('15')

    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()

    fireEvent.change(screen.getByDisplayValue('15'), { target: { value: '20' } })
    expect(screen.getByText('common:actions.save')).toBeInTheDocument()
  })

  it('guarda los valores actualizados', async () => {
    mockedApi.pricingSettings.update.mockResolvedValue(makeSettings({ project_discount_percent: 20 }))
    renderPanel()
    await screen.findByDisplayValue('15')

    fireEvent.change(screen.getByDisplayValue('15'), { target: { value: '20' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.pricingSettings.update).toHaveBeenCalledWith({
      project_discount_percent: 20, special_additional_discount_percent: 5,
      partner_divisor: 0.85, premium_divisor: 0.65, min_margin_percent: 30,
    }))
  })
})
