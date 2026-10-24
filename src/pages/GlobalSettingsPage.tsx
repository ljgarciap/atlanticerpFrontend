import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IcoSettings } from '@/components/icons'
import CrmSettingsPanel from '@/components/CrmSettingsPanel'
import SalesCommissionTiersPanel from '@/components/SalesCommissionTiersPanel'
import FiscalSettingsPanel from '@/components/FiscalSettingsPanel'
import FraudSettingsPanel from '@/components/FraudSettingsPanel'
import ComprasSettingsPanel from '@/components/ComprasSettingsPanel'
import PricingSettingsPanel from '@/components/PricingSettingsPanel'
import OrdersSettingsPanel from '@/components/OrdersSettingsPanel'
import ConditionsSettingsPanel from '@/components/ConditionsSettingsPanel'
import ReportsConfigPanel from '@/components/ReportsConfigPanel'
import BodegaSettingsPanel from '@/components/BodegaSettingsPanel'
import ServiciosSettingsPanel from '@/components/ServiciosSettingsPanel'
import GlobalSettingsPanel from '@/components/GlobalSettingsPanel'

/**
 * SCRUM-944/945 — vista NUEVA, exclusiva de superadmin, que agrega en un solo lugar todos los
 * valores de negocio parametrizados de todos los módulos (docs/specs/
 * auditoria-valores-parametricos-superadmin.md). Decisión de Luis (2026-09-23): agrega, no
 * reemplaza — ninguna de las 8 pantallas existentes (Fiscal, Fraude, Compras, Pricing, Orders,
 * Conditions, Reports, Bodega, Servicios) cambia su ruta, su gating ni su comportamiento. Cada tab
 * monta el MISMO componente Panel que ya usa su pantalla existente (extraídos de sus antiguas
 * pantallas monolíticas en este mismo batch para Fiscal/Fraude/Bodega/Servicios, ya existían para
 * Compras/Pricing/Orders/Conditions/Reports) — mismo storage, mismos hooks, cero duplicación de
 * lógica. `usePermission`/el middleware de cada endpoint ya tratan `superadmin.all` como bypass
 * universal (`EnsureIsPrimaryApprover` para Fiscal, `usePermission` en frontend para el resto), así
 * que un superadmin que no sea Gerencia puede igual ver y editar Fiscal desde acá sin cambios de
 * backend.
 *
 * Solo se monta el panel de la tab ACTIVA (no las 12 a la vez) — cada panel dispara su propio
 * fetch al montarse, montar todos de una sería 12 requests innecesarios en cada visita.
 * La tab "Global" (hallazgo E del Pre-QA) expone las claves numéricas de `GlobalSetting`.
 */

type TabKey = 'fiscal' | 'fraude' | 'compras' | 'pricing' | 'orders' | 'conditions' | 'reports' | 'bodega' | 'servicios' | 'crm' | 'salesCommissions' | 'global'

const TABS: { key: TabKey; panel: React.ComponentType }[] = [
  { key: 'fiscal',           panel: FiscalSettingsPanel },
  { key: 'fraude',           panel: FraudSettingsPanel },
  { key: 'compras',          panel: ComprasSettingsPanel },
  { key: 'pricing',          panel: PricingSettingsPanel },
  { key: 'orders',           panel: OrdersSettingsPanel },
  { key: 'conditions',       panel: ConditionsSettingsPanel },
  { key: 'reports',          panel: ReportsConfigPanel },
  { key: 'bodega',           panel: BodegaSettingsPanel },
  { key: 'servicios',        panel: ServiciosSettingsPanel },
  { key: 'crm',              panel: CrmSettingsPanel },
  { key: 'salesCommissions', panel: SalesCommissionTiersPanel },
  { key: 'global',           panel: GlobalSettingsPanel },
]

export default function GlobalSettingsPage() {
  const { t } = useTranslation('common')
  const [activeTab, setActiveTab] = useState<TabKey>('fiscal')

  const ActivePanel = TABS.find(tab => tab.key === activeTab)?.panel ?? FiscalSettingsPanel

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <div className="flex items-center gap-2 mb-1">
        <IcoSettings size={20} className="text-slate-500 dark:text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('globalSettings.title')}</h1>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-5 max-w-2xl">{t('globalSettings.subtitle')}</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map(({ key }) => (
          <Button
            key={key}
            variant="outline"
            active={activeTab === key}
            className="!px-3.5 !py-2 !text-sm !font-medium"
            onClick={() => setActiveTab(key)}
          >
            {t(`globalSettings.tabs.${key}`)}
          </Button>
        ))}
      </div>

      <ActivePanel />
    </div>
  )
}
