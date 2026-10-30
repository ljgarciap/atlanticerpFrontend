import { useTranslation } from 'react-i18next'
import { usePermission } from '@/hooks/usePermission'
import ComprasSettingsPanel from '@/components/ComprasSettingsPanel'
import PurchaseApprovalRulesPanel from '@/components/PurchaseApprovalRulesPanel'
import { IcoSettings } from '@/components/icons'

/**
 * SCRUM-861 punto 3 — "Ajustes de Compras" vivía embebido como panel colapsable dentro de
 * `ProvidersPage.tsx` (Compras → Proveedores), lo que confundía porque es configuración general
 * del módulo, no de la gestión de proveedores. Se traslada a su propia ruta, mismo patrón ya
 * establecido en el proyecto para esto (`BodegaSettingsPage` en `/bodega/configuracion`,
 * `/servicios/ajustes`) — sin inventar un hub de "Configuración" compartido entre módulos, que no
 * existe en el código. `ComprasSettingsPanel` no cambia — solo cambia dónde se monta y el gate de
 * acceso pasa de un toggle a la gate de ruta.
 */
export default function ComprasSettingsPage() {
  const { t } = useTranslation(['common', 'compras'])
  const canConfigureSettings = usePermission('compras.settings.configure')
  // Fase 14a — las reglas de aprobación son datos de la empresa: solo las administra el superadmin (el backend lo exige).
  const isSuperadmin = usePermission('superadmin.all')

  if (!canConfigureSettings) {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('compras:settings.forbidden')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <IcoSettings size={20} className="text-slate-500 dark:text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('compras:settings.title')}</h1>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">{t('compras:settings.subtitle')}</p>

      <ComprasSettingsPanel />
      {isSuperadmin && <PurchaseApprovalRulesPanel />}
    </div>
  )
}
