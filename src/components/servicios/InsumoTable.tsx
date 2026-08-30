import { useTranslation } from 'react-i18next'
import type { Insumo } from '@/types/servicios'
import { Button } from '@/components/ui/Button'
import { IcoAlertTriangle } from '@/components/icons'

interface Props {
  insumos:   Insumo[]
  canEdit:   boolean
  onRequest: (insumo: Insumo) => void
}

// REQ-273 — badge OK/Bajo mínimo, mismas 2 clases que EstadoBadge de InventarioPage.tsx (no
// reinventar colores para el mismo concepto de "estado de stock").
function EstadoBadge({ estado }: { estado: Insumo['estado'] }) {
  const { t } = useTranslation('servicios')
  const colors: Record<Insumo['estado'], string> = {
    ok:          'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    bajo_minimo: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${colors[estado]}`}>
      {t(`insumos.estados.${estado}`)}
    </span>
  )
}

// REQ-274 — RECONCILIADO 2026-08-13: `estado_solicitud` solo tiene 2 estados reales, 'pendiente'
// o null (nunca los 4 pasos de compras.ORDER_STATUSES asumidos originalmente, ver docblock de
// InsumoEstadoSolicitud en types/servicios.ts) — un solo badge ámbar en vez del esquema de 4
// colores que traía la primera versión.
function SolicitudBadge() {
  const { t } = useTranslation('servicios')
  return (
    <span className="text-[11px] px-2 py-1 rounded-full font-medium whitespace-nowrap bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      {t('insumos.solicitudPendiente')}
    </span>
  )
}

// REQ-273/274 — listado de Insumos. El botón "Solicitar" queda siempre habilitado por fila
// (nunca se deshabilita ni se reemplaza por el badge, a diferencia de ToolTable — un insumo
// puede tener varias solicitudes activas a lo largo del tiempo), visible solo para
// Aaron/Líder de Servicios y superadmin (`canEdit`, ver InsumosPanel.tsx).
export default function InsumoTable({ insumos, canEdit, onRequest }: Props) {
  const { t } = useTranslation('servicios')

  if (insumos.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
        <p className="text-slate-400 text-sm">{t('insumos.table.empty')}</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-800">
              <th className="px-3 py-2">{t('insumos.table.columns.factoryReference')}</th>
              <th className="px-3 py-2">{t('insumos.table.columns.description')}</th>
              <th className="px-3 py-2 text-right">{t('insumos.table.columns.disponible')}</th>
              <th className="px-3 py-2 text-right">{t('insumos.table.columns.minimo')}</th>
              <th className="px-3 py-2">{t('insumos.table.columns.estado')}</th>
              <th className="px-3 py-2 text-right">{t('insumos.table.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {insumos.map(insumo => (
              <tr key={insumo.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {insumo.referencia ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">{insumo.nombre ?? '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  {insumo.disponible < 0 ? (
                    // SCRUM-361 (decisión de Luis, daily 2026-08-18): el Consumo automático puede
                    // dejar el disponible negativo — no se bloquea, pero nunca queda en silencio.
                    <span title={t('insumos.table.disponibleNegativoTooltip')}
                      className="inline-flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                      <IcoAlertTriangle size={13} />
                      {insumo.disponible}
                    </span>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-300">{insumo.disponible}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{insumo.minimo}</td>
                <td className="px-3 py-2.5">
                  <EstadoBadge estado={insumo.estado} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {insumo.estado_solicitud === 'pendiente' && <SolicitudBadge />}
                    {canEdit && (
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 !text-xs"
                        onClick={() => onRequest(insumo)}
                      >
                        {t('insumos.table.requestButton')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
