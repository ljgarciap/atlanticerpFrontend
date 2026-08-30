import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBodegaProductivityReport } from '@/hooks/useBodega'
import { useReportPeriod } from './ReportPeriodContext'
import { Card } from '@/components/ui/Card'
import { IcoChevronRight } from '@/components/icons'

/**
 * SCRUM-491 (REQ-421) — ranking de Asistentes de Bodega por pedidos gestionados en el período,
 * barra comparativa (top1 = 100%, el resto relativo). SCRUM-495 (REQ-425) — toda la tarjeta es
 * clickeable y navega a Pedidos (`/bodega/pedidos`), con la flecha de `IcoChevronRight` (nunca
 * emoji, regla SCRUM-56) como affordance visible.
 */
export default function ProductivityReportCard() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()
  const { period } = useReportPeriod()
  const { data, isLoading } = useBodegaProductivityReport(period)

  return (
    <Card
      variant="panel"
      shadow
      role="button"
      tabIndex={0}
      onClick={() => navigate('/bodega/pedidos')}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate('/bodega/pedidos') }}
      className="p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:reports.productivity.title')}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{t('bodega:reports.productivity.subtitle')}</div>
        </div>
        <span className="text-slate-400 dark:text-slate-500" title={t('bodega:reports.viewDetail')}>
          <IcoChevronRight size={18} />
        </span>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-slate-400">{t('common:labels.loading')}</p>
      ) : !data.has_data ? (
        <p className="text-sm text-slate-400">{t('bodega:reports.productivity.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.data.map((row, idx) => (
            <li key={row.assistant_id} className="flex items-center gap-3">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0
                  ${idx === 0 ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}`}
              >
                {idx + 1}
              </span>
              <span className="w-32 sm:w-36 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate flex-shrink-0">
                {row.assistant_name}
              </span>
              <span className="flex-1 h-4 rounded-md bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <span
                  className="block h-full rounded-md bg-primary"
                  style={{ width: `${row.percent_of_top}%` }}
                />
              </span>
              <span className="w-20 text-right text-sm font-bold text-primary-dark dark:text-primary-light flex-shrink-0">
                {t('bodega:reports.productivity.ordersCount', { count: row.orders_count })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
