import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBodegaAdjustmentAccuracyReport } from '@/hooks/useBodega'
import { useReportPeriod } from './ReportPeriodContext'
import { Card } from '@/components/ui/Card'
import { IcoChevronRight } from '@/components/icons'

/**
 * SCRUM-492 (REQ-422) — KPIs Aprobadas/Rechazadas/Pendientes del período (RN1: suman el total) +
 * tabla de motivos más frecuentes (RN2: campo `motivo` real, no una lista fija). SCRUM-495
 * (REQ-425) — navega a Solicitud de ajuste (`/bodega/solicitud-ajuste`).
 */
export default function AdjustmentAccuracyReportCard() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()
  const { period } = useReportPeriod()
  const { data, isLoading } = useBodegaAdjustmentAccuracyReport(period)

  const total = data?.total ?? 0
  const pctAprobadas = total > 0 ? ((data?.aprobadas ?? 0) / total) * 100 : 0
  const pctRechazadas = total > 0 ? ((data?.rechazadas ?? 0) / total) * 100 : 0
  const pctPendientes = total > 0 ? ((data?.pendientes ?? 0) / total) * 100 : 0

  return (
    <Card
      variant="panel"
      shadow
      role="button"
      tabIndex={0}
      onClick={() => navigate('/bodega/solicitud-ajuste')}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate('/bodega/solicitud-ajuste') }}
      className="p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:reports.adjustmentAccuracy.title')}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{t('bodega:reports.adjustmentAccuracy.subtitle')}</div>
        </div>
        <span className="text-slate-400 dark:text-slate-500" title={t('bodega:reports.viewDetail')}>
          <IcoChevronRight size={18} />
        </span>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-slate-400">{t('common:labels.loading')}</p>
      ) : total === 0 ? (
        <p className="text-sm text-slate-400">{t('bodega:reports.adjustmentAccuracy.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                <span className="w-2 h-2 rounded-full bg-primary" />
                {t('bodega:reports.adjustmentAccuracy.approved')}
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{data.aprobadas}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {t('bodega:reports.adjustmentAccuracy.ofTotal', { total })}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {t('bodega:reports.adjustmentAccuracy.rejected')}
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{data.rechazadas}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {t('bodega:reports.adjustmentAccuracy.ofTotal', { total })}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {t('bodega:reports.adjustmentAccuracy.pending')}
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{data.pendientes}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {t('bodega:reports.adjustmentAccuracy.waiting')}
              </div>
            </div>
          </div>

          <div className="h-3 rounded-md overflow-hidden flex bg-slate-100 dark:bg-slate-700 mb-4">
            <span className="h-full bg-primary" style={{ width: `${pctAprobadas}%` }} />
            <span className="h-full bg-red-500" style={{ width: `${pctRechazadas}%` }} />
            <span className="h-full bg-amber-500" style={{ width: `${pctPendientes}%` }} />
          </div>

          {data.motivos.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="pb-2 font-semibold">{t('bodega:reports.adjustmentAccuracy.motiveColumn')}</th>
                  <th className="pb-2 font-semibold text-right">{t('bodega:reports.adjustmentAccuracy.countColumn')}</th>
                </tr>
              </thead>
              <tbody>
                {data.motivos.map(row => (
                  <tr key={row.motivo} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="py-2 text-slate-700 dark:text-slate-200">{row.motivo}</td>
                    <td className="py-2 text-right font-semibold text-slate-900 dark:text-slate-100">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Card>
  )
}
