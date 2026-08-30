import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBodegaInventorySummaryReport } from '@/hooks/useBodega'
import { useReportPeriod } from './ReportPeriodContext'
import { Card } from '@/components/ui/Card'
import { IcoChevronRight, IcoAlertTriangle } from '@/components/icons'

/**
 * SCRUM-494 (REQ-424) — resumen ejecutivo de catálogo: total de productos activos, "En atención"
 * (mismo criterio que Ver Inventario, REQ-346 — RN1 exige coincidir exacto) y unidades
 * comprometidas. El mockup (`3G__Bodega_Reportes.html`) usa el emoji ⚠️ en la etiqueta — regla
 * SCRUM-56 del proyecto prohíbe iconografía de emoji, se reemplaza por `IcoAlertTriangle` (mismo
 * criterio ya aplicado en SCRUM-75/78: "mockup pedía emoji, se usó ícono del set propio").
 * SCRUM-495 (REQ-425) — navega a Ver inventario (`/bodega/inventario`).
 */
export default function InventorySummaryReportCard() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()
  const { period } = useReportPeriod()
  const { data, isLoading } = useBodegaInventorySummaryReport(period)

  return (
    <Card
      variant="panel"
      shadow
      role="button"
      tabIndex={0}
      onClick={() => navigate('/bodega/inventario')}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate('/bodega/inventario') }}
      className="p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:reports.inventorySummary.title')}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{t('bodega:reports.inventorySummary.subtitle')}</div>
        </div>
        <span className="text-slate-400 dark:text-slate-500" title={t('bodega:reports.viewDetail')}>
          <IcoChevronRight size={18} />
        </span>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-slate-400">{t('common:labels.loading')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              <span className="w-2 h-2 rounded-full bg-primary" />
              {t('bodega:reports.inventorySummary.totalProducts')}
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{data.total_products}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{t('bodega:reports.inventorySummary.activeCatalog')}</div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              <IcoAlertTriangle size={12} className="text-red-500 flex-shrink-0" />
              {t('bodega:reports.inventorySummary.inAttention')}
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{data.in_attention}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{t('bodega:reports.inventorySummary.inAttentionSub')}</div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
              {t('bodega:reports.inventorySummary.committed')}
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {t('bodega:reports.inventorySummary.committedUnits', { count: data.committed_units })}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">{t('bodega:reports.inventorySummary.committedSub')}</div>
          </div>
        </div>
      )}
    </Card>
  )
}
