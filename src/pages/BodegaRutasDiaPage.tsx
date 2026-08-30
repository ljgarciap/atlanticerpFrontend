import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBodegaRutasDia } from '@/hooks/useBodega'
import { Card } from '@/components/ui/Card'
import OrderDetailModal from '@/components/OrderDetailModal'
import PickingSheetModal from '@/components/PickingSheetModal'

/**
 * SCRUM-171 RN2 (Gerencia → panel "Agenda de Bodega — hoy", botón "Ver detalle") —
 * "Rutas de entrega del día completo". El panel resumen de Gerencia (`agendas.bodega`)
 * solo muestra las primeras 5 — esta pantalla lista TODAS las entregas/recolecciones
 * de hoy. Réplica del patrón ya construido en Servicios (`InternalTechniciansPage.tsx`
 * `?view=agenda` + `HomeRoutesPanel.tsx`), adaptado a Bodega: acá es una pantalla propia
 * en vez de un modo de vista dentro de otra pantalla, porque no existe un equivalente a
 * "Técnicos" en Bodega donde anidarla.
 *
 * Contrato de `GET /bodega/home/rutas-dia` confirmado en Senior Review — ver
 * `docs/architecture/gerencia-epic-analisis-20260826.md`.
 */
export default function BodegaRutasDiaPage() {
  const { t } = useTranslation(['common', 'bodega'])
  const { data, isLoading } = useBodegaRutasDia()
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null)
  const [pickingSheetOrderId, setPickingSheetOrderId] = useState<number | null>(null)

  const rows = data?.data ?? []

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {t('bodega:rutasDia.title', 'Rutas de entrega del día')}
        </h1>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
          {t('bodega:rutasDia.subtitle', 'Todas las entregas y recolecciones programadas para hoy')}
        </p>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-slate-400">{t('common:labels.loading')}</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">
            {t('bodega:rutasDia.empty', 'No hay entregas ni recolecciones programadas para hoy')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30"
                onClick={() => setDetailOrderId(item.id)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.order_number}</span>
                    <span className="text-[11px] text-slate-400">{item.stage}</span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {item.customer}{item.project ? ` · ${item.project}` : ''}
                  </div>
                  {item.address && (
                    <div className="text-[11px] text-slate-400 truncate">{item.address}</div>
                  )}
                </div>
                {item.repartidor && (
                  <div className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400 text-right">
                    {item.repartidor}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {detailOrderId !== null && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={() => setDetailOrderId(null)}
          onOpenPickingSheet={setPickingSheetOrderId}
        />
      )}
      {pickingSheetOrderId !== null && (
        <PickingSheetModal orderId={pickingSheetOrderId} onClose={() => setPickingSheetOrderId(null)} />
      )}
    </>
  )
}
