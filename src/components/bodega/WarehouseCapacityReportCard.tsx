import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBodegaWarehouseCapacityReport } from '@/hooks/useBodega'
import { useReportPeriod } from './ReportPeriodContext'
import { Card } from '@/components/ui/Card'
import { IcoChevronRight, IcoAlertTriangle } from '@/components/icons'

/**
 * SCRUM-493 (REQ-423) — productos/unidades por cada una de las 7 bodegas + aviso automático de
 * concentración (RN1: umbral configurable, `BodegaSettings.capacidad_concentracion_pct`, ver
 * `BodegaSettingsPage.tsx`). SCRUM-495 (REQ-425) — navega a Bodegas (`/bodega/bodegas`).
 */
export default function WarehouseCapacityReportCard() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()
  const { period } = useReportPeriod()
  const { data, isLoading } = useBodegaWarehouseCapacityReport(period)

  return (
    <Card
      variant="panel"
      shadow
      role="button"
      tabIndex={0}
      onClick={() => navigate('/bodega/bodegas')}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate('/bodega/bodegas') }}
      className="p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[15px] font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:reports.warehouseCapacity.title')}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{t('bodega:reports.warehouseCapacity.subtitle')}</div>
        </div>
        <span className="text-slate-400 dark:text-slate-500" title={t('bodega:reports.viewDetail')}>
          <IcoChevronRight size={18} />
        </span>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-slate-400">{t('common:labels.loading')}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {data.warehouses.map(row => (
              <li key={row.warehouse_id} className="flex items-center gap-3">
                <span className="w-36 sm:w-44 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate flex-shrink-0">
                  {row.name}
                </span>
                <span className="flex-1 text-sm text-slate-500 dark:text-slate-400">
                  {t('bodega:reports.warehouseCapacity.stat', { products: row.products_count, units: row.units_count })}
                </span>
              </li>
            ))}
          </ul>

          {data.concentration_alert && (
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 mt-4">
              <span className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5">
                <IcoAlertTriangle size={16} />
              </span>
              <p className="text-[12.5px] leading-snug text-amber-800 dark:text-amber-300">
                {t('bodega:reports.warehouseCapacity.concentrationAlert', {
                  warehouse: data.concentration_alert.warehouse_name,
                  percent: data.concentration_alert.percent,
                  targets: data.concentration_alert.suggested_targets.join(
                    ` ${t('bodega:reports.warehouseCapacity.or')} `,
                  ),
                })}
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
