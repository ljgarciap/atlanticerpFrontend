import type { TFunction } from 'i18next'
import type { PurchaseOrderSummary, ProviderOrigin } from '@/types/compras'

/**
 * REQ-154 (SCRUM-217, batch fusionado con SCRUM-216 2026-08-05) — línea de tiempo visual del
 * envío, dentro de cada `ShipmentCard` de Logística (`LogisticsPage.tsx`). Hallazgo CRÍTICO de
 * Visual Reviewer 2026-08-05: este componente no existía — la pantalla solo mostraba la etiqueta
 * de "Estado" (una de las 4 del encabezado), sin ningún historial de fechas por etapa.
 *
 * RN1 (comentario de Daniela, SCRUM-217, 2026-08-05 17:23) — 2 secuencias posibles según
 * `Provider::origin` (mismo criterio que `PurchaseOrder::statusSequence()` en backend):
 *  - Proveedor normal/internacional: Salió de origen → En tránsito → En aduana → En tránsito
 *    local → Recibido (5 pasos).
 *  - Proveedor "Locales": Ordenado → En tránsito local → Recibido (3 pasos, salta aduana/tránsito
 *    internacional por completo).
 * El primer paso de ambas secuencias es el MISMO status (`ordenado`) pero con una etiqueta
 * distinta según el origen — confirmado contra el mockup 2B__Compras_Logistica.html (su JS de
 * demo solo ejercita el caso normal, "Salió de origen") y, de forma explícita, contra el propio
 * texto de la RN1 de Daniela para el caso local.
 */

type StageKey = 'ordenado' | 'en_transito' | 'en_aduana' | 'en_transito_local' | 'recibido'

const SEQUENCE_NORMAL: StageKey[] = ['ordenado', 'en_transito', 'en_aduana', 'en_transito_local', 'recibido']
const SEQUENCE_LOCAL: StageKey[] = ['ordenado', 'en_transito_local', 'recibido']

function stageDate(order: PurchaseOrderSummary, stage: StageKey): string | null {
  switch (stage) {
    case 'ordenado':           return order.ordenado_at
    case 'en_transito':        return order.en_transito_at
    case 'en_aduana':          return order.en_aduana_at
    case 'en_transito_local':  return order.en_transito_local_at
    case 'recibido':           return order.actual_arrival_date
  }
}

function stageLabel(t: TFunction, stage: StageKey, providerOrigin: ProviderOrigin | null): string {
  if (stage === 'ordenado' && providerOrigin !== 'local') {
    return t('compras:logistics.timeline.stepLabel.salioDeOrigen')
  }
  return t(`compras:orders.status.${stage}`)
}

export function ShipmentTimeline({ order, t }: { order: PurchaseOrderSummary; t: TFunction }) {
  const sequence = order.provider_origin === 'local' ? SEQUENCE_LOCAL : SEQUENCE_NORMAL
  const currentIndex = sequence.indexOf(order.status as StageKey)

  // Defensivo — Logística solo lista `active_shipment` statuses (ordenado..recibido), así que
  // `currentIndex` siempre debería resolver; si algún día no lo hace (dato inesperado), no se
  // rompe el resto de la tarjeta, simplemente no se dibuja el timeline.
  if (currentIndex === -1) return null

  const hasNext = order.next_status !== null

  return (
    <div className="flex items-start mb-3" data-testid="shipment-timeline">
      {sequence.map((stage, i) => {
        // El paso "actual" solo existe si hay una siguiente etapa (order.next_status !== null) —
        // si la orden ya llegó a "Recibido" (última etapa, next_status null), ese último paso se
        // pinta como completado, no "en curso" (no hay nada más que avanzar).
        const isDone = i < currentIndex || (i === currentIndex && !hasNext)
        const isCurrent = i === currentIndex && hasNext
        const state = isDone ? 'done' : isCurrent ? 'current' : 'pending'
        const date = stageDate(order, stage)
        const isLast = i === sequence.length - 1

        const dotClass = isDone
          ? 'bg-primary border-primary'
          : isCurrent
            ? 'bg-amber-400 border-amber-400'
            : 'bg-white border-slate-300'

        return (
          <div key={stage} className={isLast ? 'flex items-center flex-none' : 'flex items-center flex-1'}>
            <div
              className="flex flex-col items-center text-center px-0.5"
              style={{ minWidth: 56 }}
              data-testid={`timeline-step-${stage}`}
              data-state={state}
            >
              <span className={`w-2.5 h-2.5 rounded-full border-2 ${dotClass}`} />
              <span className={`mt-1 text-[9px] font-medium leading-tight whitespace-nowrap ${isDone || isCurrent ? 'text-slate-600' : 'text-slate-400'}`}>
                {stageLabel(t, stage, order.provider_origin)}
              </span>
              <span className={`text-[9px] whitespace-nowrap ${isCurrent ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                {/* Pendiente siempre muestra "—", nunca una fecha — un paso que todavía no se
                    alcanzó no debería tener columna seteada, pero esto blinda igual contra datos
                    inconsistentes (ej. una fecha vieja de una corrida anterior). */}
                {isCurrent ? t('compras:logistics.timeline.current') : isDone ? (date ?? '—') : '—'}
              </span>
            </div>
            {!isLast && (
              <span
                className={`h-0.5 flex-1 ${isDone ? 'bg-primary' : 'bg-slate-200'}`}
                style={{ marginTop: -14 }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
