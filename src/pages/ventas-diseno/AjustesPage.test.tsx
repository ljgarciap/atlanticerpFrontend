import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VentasAjustesPage from './AjustesPage'
import { usePermission } from '@/hooks/usePermission'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/hooks/usePermission', () => ({ usePermission: vi.fn() }))
vi.mock('@/components/PricingSettingsPanel', () => ({ default: () => <div>panel-pricing</div> }))
vi.mock('@/components/OrdersSettingsPanel', () => ({ default: () => <div>panel-orders</div> }))
vi.mock('@/components/SalesCommissionTiersPanel', () => ({ default: () => <div>panel-tiers</div> }))
vi.mock('@/components/ReportsConfigPanel', () => ({ default: () => <div>panel-goals</div> }))

const mockedPermission = vi.mocked(usePermission)
const conPermisos = (...claves: string[]) => mockedPermission.mockImplementation((p: string) => claves.includes(p))

describe('Fase 23 (#9) — ajustes de Ventas & Diseño', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('Gerencia con ambos permisos ve las cuatro pestañas y navega entre ellas', () => {
    conPermisos('ventas_diseno.pricing.configure', 'ventas_diseno.reports.configure')
    render(<VentasAjustesPage />)

    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual([
      'settingsScreen.tabs.pricing', 'settingsScreen.tabs.orders', 'settingsScreen.tabs.tiers', 'settingsScreen.tabs.goals',
    ])
    expect(screen.getByText('panel-pricing')).toBeInTheDocument()
    fireEvent.click(screen.getByText('settingsScreen.tabs.tiers'))
    expect(screen.getByText('panel-tiers')).toBeInTheDocument()
  })

  it('con un solo permiso solo aparecen las pestañas de ese permiso', () => {
    conPermisos('ventas_diseno.reports.configure')
    render(<VentasAjustesPage />)

    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['settingsScreen.tabs.tiers', 'settingsScreen.tabs.goals'])
    expect(screen.getByText('panel-tiers')).toBeInTheDocument()
    expect(screen.queryByText('panel-pricing')).not.toBeInTheDocument()
  })

  it('sin permisos no muestra pestañas ni paneles', () => {
    conPermisos()
    render(<VentasAjustesPage />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
