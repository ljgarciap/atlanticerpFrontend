import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IcoSettings } from '@/components/icons'
import { usePermission } from '@/hooks/usePermission'
import PricingSettingsPanel from '@/components/PricingSettingsPanel'
import OrdersSettingsPanel from '@/components/OrdersSettingsPanel'
import SalesCommissionTiersPanel from '@/components/SalesCommissionTiersPanel'
import ReportsConfigPanel from '@/components/ReportsConfigPanel'

/**
 * Fase 23 (#9) — Ajustes de Ventas & Diseño para Gerencia. Antes los paneles de precios, margen de Pedidos, tramos de comisión y
 * metas solo vivían en «Configuración global» (superadmin). Aquí se montan los MISMOS paneles, cada pestaña según el permiso que
 * exige su endpoint: `pricing.configure` (precios y Pedidos) y `reports.configure` (tramos y metas). Sin permiso no hay pestañas.
 */
type TabKey = 'pricing' | 'orders' | 'tiers' | 'goals'

const TABS: { key: TabKey; permission: string; panel: React.ComponentType }[] = [
  { key: 'pricing', permission: 'ventas_diseno.pricing.configure', panel: PricingSettingsPanel },
  { key: 'orders',  permission: 'ventas_diseno.pricing.configure', panel: OrdersSettingsPanel },
  { key: 'tiers',   permission: 'ventas_diseno.reports.configure', panel: SalesCommissionTiersPanel },
  { key: 'goals',   permission: 'ventas_diseno.reports.configure', panel: ReportsConfigPanel },
]

export default function VentasAjustesPage() {
  const { t } = useTranslation('ventasDiseno')
  // Los hooks se llaman siempre, todos, y después se filtran (regla de hooks).
  const canPricing = usePermission('ventas_diseno.pricing.configure')
  const canReports = usePermission('ventas_diseno.reports.configure')
  const visibles = TABS.filter(tab => (tab.permission.includes('pricing') ? canPricing : canReports))
  const [activeTab, setActiveTab] = useState<TabKey | null>(null)

  const active = visibles.find(tab => tab.key === activeTab) ?? visibles[0]
  const ActivePanel = active?.panel

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <div className="flex items-center gap-2 mb-1">
        <IcoSettings size={20} className="text-slate-500 dark:text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('settingsScreen.title')}</h1>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-5 max-w-2xl">{t('settingsScreen.subtitle')}</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {visibles.map(({ key }) => (
          <Button
            key={key}
            variant="outline"
            active={active?.key === key}
            className="!px-3.5 !py-2 !text-sm !font-medium"
            onClick={() => setActiveTab(key)}
          >
            {t(`settingsScreen.tabs.${key}`)}
          </Button>
        ))}
      </div>

      {ActivePanel && <ActivePanel />}
    </div>
  )
}
