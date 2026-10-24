import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GlobalSettingsPage from './GlobalSettingsPage'

// SCRUM-944/945 — este test cubre solo el comportamiento PROPIO de GlobalSettingsPage (las 12
// tabs, y que solo la tab activa monta su panel) — cada panel individual (Fiscal/Fraude/Compras/
// Pricing/Orders/Conditions/Reports/Bodega/Servicios) ya tiene su propia suite de tests. Mockear
// los 9 componentes reales acá es intencional: lo que se está probando es el contenedor de tabs,
// no la lógica de cada panel (mockear las 9 APIs reales solo para esto sería ruido, no señal).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/components/FiscalSettingsPanel', () => ({ default: () => <div data-testid="panel-fiscal" /> }))
vi.mock('@/components/CrmSettingsPanel', () => ({ default: () => <div data-testid="panel-crm" /> }))
vi.mock('@/components/SalesCommissionTiersPanel', () => ({ default: () => <div data-testid="panel-salesCommissions" /> }))
vi.mock('@/components/FraudSettingsPanel', () => ({ default: () => <div data-testid="panel-fraude" /> }))
vi.mock('@/components/ComprasSettingsPanel', () => ({ default: () => <div data-testid="panel-compras" /> }))
vi.mock('@/components/PricingSettingsPanel', () => ({ default: () => <div data-testid="panel-pricing" /> }))
vi.mock('@/components/OrdersSettingsPanel', () => ({ default: () => <div data-testid="panel-orders" /> }))
vi.mock('@/components/ConditionsSettingsPanel', () => ({ default: () => <div data-testid="panel-conditions" /> }))
vi.mock('@/components/ReportsConfigPanel', () => ({ default: () => <div data-testid="panel-reports" /> }))
vi.mock('@/components/BodegaSettingsPanel', () => ({ default: () => <div data-testid="panel-bodega" /> }))
vi.mock('@/components/ServiciosSettingsPanel', () => ({ default: () => <div data-testid="panel-servicios" /> }))
vi.mock('@/components/GlobalSettingsPanel', () => ({ default: () => <div data-testid="panel-global" /> }))

describe('GlobalSettingsPage', () => {
  it('monta el panel de Fiscal por defecto y ningún otro', () => {
    render(<GlobalSettingsPage />)

    expect(screen.getByTestId('panel-fiscal')).toBeInTheDocument()
    expect(screen.queryByTestId('panel-bodega')).not.toBeInTheDocument()
    expect(screen.queryByTestId('panel-servicios')).not.toBeInTheDocument()
  })

  it('muestra las 12 tabs (11 módulos + Global)', () => {
    render(<GlobalSettingsPage />)

    for (const key of ['fiscal', 'fraude', 'compras', 'pricing', 'orders', 'conditions', 'reports', 'bodega', 'servicios', 'crm', 'salesCommissions', 'global']) {
      expect(screen.getByText(`globalSettings.tabs.${key}`)).toBeInTheDocument()
    }
  })

  it('al cambiar de tab, desmonta el panel anterior y monta solo el nuevo', () => {
    render(<GlobalSettingsPage />)
    expect(screen.getByTestId('panel-fiscal')).toBeInTheDocument()

    fireEvent.click(screen.getByText('globalSettings.tabs.bodega'))

    expect(screen.queryByTestId('panel-fiscal')).not.toBeInTheDocument()
    expect(screen.getByTestId('panel-bodega')).toBeInTheDocument()
  })

  it('la tab Global (12ª) solo monta su panel al abrirla', () => {
    render(<GlobalSettingsPage />)
    expect(screen.queryByTestId('panel-global')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('globalSettings.tabs.global'))

    expect(screen.getByTestId('panel-global')).toBeInTheDocument()
    expect(screen.queryByTestId('panel-fiscal')).not.toBeInTheDocument()
  })
})
