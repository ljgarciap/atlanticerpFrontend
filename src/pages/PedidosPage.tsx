import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useOrdersBoard, useOrdersBoardOptions, useAssistantLoad, useOrderSellers } from '@/hooks/useBodega'
import { ORDER_STAGE_COLORS, ORDER_STAGE_ORDER } from '@/types/bodega'
import type { AssistantLoad, OrderStage } from '@/types/bodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoPrinter } from '@/components/icons'
import OrderCardTile from '@/components/OrderCardTile'
import OrderTable from '@/components/OrderTable'
import { UserMultiSelect } from '@/components/UserMultiSelect'
import OrderDetailModal from '@/components/OrderDetailModal'
import GuiaEntregaModal from '@/components/GuiaEntregaModal'
import ConsolidatedPickingModal from '@/components/ConsolidatedPickingModal'
import PickingSheetModal from '@/components/PickingSheetModal'
import InventoryReviewModal from '@/components/InventoryReviewModal'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'

type Chip = 'all' | 'urgentes' | 'atrasados' | 'sin_stock'
type ViewMode = 'table' | 'board'

/**
 * SCRUM-329 Oleada A / Batch A3 (REQ-305/306/309/310/311/312/332/334, HU-335) — tablero "Pedidos"
 * de Bodega. Backend (`OrderBoardController`/`OrderBoardService`) ya vive en `dev`/producción de
 * Batch A2 — esta pantalla solo lo consume, es de solo lectura (las mutaciones de cada etapa
 * llegan en un batch posterior, ver botones deshabilitados en `OrderCardTile`).
 */
export default function PedidosPage() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // SCRUM-860 — toggle tabla/tablero, mismo patrón que `servicios/TicketsPage.tsx`.
  const [view, setView]               = useState<ViewMode>('board')
  const [search, setSearch]           = useState('')
  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).
  const searchTerm = useDebouncedSearchTerm(search)
  const [assistantId, setAssistantId] = useState<number | ''>('')
  const [cliente, setCliente]         = useState('')
  // SCRUM-854 — multi-selección Vendedor/Diseñador por id (OR entre seleccionados), reemplaza el
  // filtro viejo por nombre client-side (REQ-309) — el backend ahora filtra por seller_ids real.
  const [sellerIds, setSellerIds]     = useState<number[]>([])
  // Rebote de Pre-QA — antes usaba ventasDisenoApi.home.vendors() (gateado por
  // ventas_diseno.read), que los roles reales de Pedidos no tienen; 403 silencioso, selector
  // permanentemente vacío. useOrderSellers() está gateado por bodega.read, el permiso real de
  // esta pantalla.
  const { data: teamVendors } = useOrderSellers()
  // SCRUM-169 (Gerencia → Salud Bodega): "Despachos urgentes"/"Despachos atrasados"
  // navegan acá con ?chip=urgentes/atrasados — antes se ignoraba, el tablero
  // siempre arrancaba en 'all' sin importar la URL.
  // SCRUM-860 (rebote de Daniela, 2026-09-09) — filtro por Estado, pedido junto con la vista de
  // tabla (que mezcla las 7 etapas en una sola lista, a diferencia del tablero que ya las separa
  // en columnas). Client-side sobre `cards` — mismo criterio que el resto del agrupado por etapa
  // del tablero (ORDER_STAGE_ORDER.map + cards.filter), no hace falta un query param nuevo.
  const [stage, setStage]             = useState<OrderStage | ''>('')
  const [chip, setChip]               = useState<Chip>(() => {
    const raw = searchParams.get('chip')
    return raw === 'urgentes' || raw === 'atrasados' || raw === 'sin_stock' ? raw : 'all'
  })

  // REQ-309 — opciones dinámicas de Cliente/Vendedor, sacadas del universo real de pedidos del
  // tablero (no una lista estática). Se piden sin filtros para no reducir las opciones a medida
  // que se filtra (mismo criterio de UX que cualquier combo de filtros de este proyecto).
  const { data: options } = useOrdersBoardOptions()
  // REQ-306 — también fuente de las opciones (id+nombre) del selector "Asistente", el único de
  // los 3 que el backend acepta por id (`assistant_id`).
  const { data: assistantLoad } = useAssistantLoad()

  const { data: board, isLoading } = useOrdersBoard({
    search:       searchTerm || undefined,
    assistant_id: assistantId === '' ? undefined : assistantId,
    cliente:      cliente || undefined,
    chip:         chip === 'all' ? undefined : chip,
    // SCRUM-854 — filtra en el backend (whereHas owner_id, OR entre seleccionados), reemplaza el
    // filtro client-side por nombre que usaba REQ-309 (`Vendedor no tiene id en el board`).
    seller_ids:   sellerIds.length > 0 ? sellerIds : undefined,
  })

  const cards = useMemo(() => {
    const all = board?.cards ?? []
    return stage === '' ? all : all.filter(c => c.stage === stage)
  }, [board, stage])

  const clienteOptions = useMemo(() => uniqueSorted(options?.cards.map(c => c.cliente)), [options])

  // REQ-321 RN1 — pickers con al menos un pedido "En picking" AHORA MISMO, sacado del universo
  // completo del tablero (`options`, sin los filtros de UI aplicados) para que el consolidado no
  // dependa de qué filtros tenga puestos el usuario en ese momento.
  const activePickerNames = useMemo(
    () => uniqueSorted(options?.cards.filter(c => c.stage === 'en_picking').map(c => c.picker)),
    [options],
  )

  const countsByStage = useMemo(() => {
    const counts: Partial<Record<OrderStage, number>> = {}
    for (const c of cards) counts[c.stage] = (counts[c.stage] ?? 0) + 1
    return counts
  }, [cards])

  function clearFilters() {
    setSearch(''); setAssistantId(''); setCliente(''); setSellerIds([]); setChip('all'); setStage('')
  }

  const [detailOrderId, setDetailOrderId] = useState<number | null>(null)

  // SCRUM-369 (REQ-299, corrección 2026-08-11) — deep link desde el panel "Pendientes" de Bodega
  // Home (`?order=<id>`, ver `BodegaHomePage.tsx`): abre el detalle de ESE pedido directamente,
  // no solo la pantalla general de Pedidos (RN4 — "debe abrirse directamente ese registro").
  useEffect(() => {
    const raw = searchParams.get('order')
    if (raw === null) return
    const orderId = Number(raw)
    if (Number.isInteger(orderId)) setDetailOrderId(orderId)
    // Se consume una sola vez — no debe reabrirse solo porque el usuario cierra el modal y el
    // querystring sigue en la URL.
    setSearchParams(params => { params.delete('order'); return params }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [guideOrderId,  setGuideOrderId]  = useState<number | null>(null)
  const [pickingModalOpen, setPickingModalOpen] = useState(false)
  // SCRUM-384/385 (REQ-314/315) — Hoja de Picking, abierta desde "Iniciar Picking"
  // (picking_pendiente) o "Continuar Picking" (en_picking), ver `OrderCardTile.tsx`.
  const [pickingSheetOrderId, setPickingSheetOrderId] = useState<number | null>(null)
  // SCRUM-387/388 (REQ-317/318) — Revisión de Inventario, abierta desde "Revisar Inventario"
  // (picking_pendiente + order_type revision_inventario), ver `OrderCardTile.tsx`.
  const [inventoryReviewOrderId, setInventoryReviewOrderId] = useState<number | null>(null)

  const selectClass = 'border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-2 md:py-1.5 text-sm md:text-[12px] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-primary'

  return (
    <>
      {/* SCRUM-375/404 (REQ-305/334) — encabezado: título, contador real y accesos. */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('bodega:pedidos.title')}</h1>
          <p className="text-[12px] text-slate-500" data-testid="pedidos-subtitle">
            {t('bodega:pedidos.subtitle', { count: board?.total ?? 0 })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* SCRUM-860 — toggle tabla/tablero, mismo patrón que servicios/TicketsPage.tsx. */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
            <Button
              variant="secondary" active={view === 'table'} className="!rounded-none !border-0"
              onClick={() => setView('table')}
            >
              {t('bodega:pedidos.views.table')}
            </Button>
            <Button
              variant="secondary" active={view === 'board'} className="!rounded-none !border-0"
              onClick={() => setView('board')}
            >
              {t('bodega:pedidos.views.board')}
            </Button>
          </div>
          {/* REQ-321 (SCRUM-391) — consolidado del día por picker. */}
          <Button
            variant="secondary"
            onClick={() => setPickingModalOpen(true)}
            className="!flex !items-center !gap-1.5"
          >
            <IcoPrinter size={14} /> {t('bodega:pedidos.actions.printPickingOfTheDay')}
          </Button>
          {/* REQ-334/404 — mismo botón cubre ambos tickets (ver reporte de la tarea). */}
          <Button variant="secondary" onClick={() => navigate('/bodega/pedidos/status')}>
            {t('bodega:pedidos.actions.orderStatus')}
          </Button>
        </div>
      </div>

      {/* SCRUM-376 (REQ-306) — carga por asistente. */}
      <AssistantLoadPanel assistants={assistantLoad?.data ?? []} />

      {/* SCRUM-379/380 (REQ-309/310) — filtros + chips rápidos, todos combinables (AND). */}
      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder={t('bodega:pedidos.filters.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 md:py-1.5 text-base md:text-[13px] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 w-full sm:min-w-[220px] sm:flex-1 focus:outline-none focus:border-primary"
        />
        <select
          value={assistantId}
          onChange={e => setAssistantId(e.target.value === '' ? '' : Number(e.target.value))}
          className={selectClass}
        >
          <option value="">{t('bodega:pedidos.filters.assistant')}</option>
          {(assistantLoad?.data ?? []).map(a => (
            <option key={a.assistant_id} value={a.assistant_id}>{a.assistant_name ?? `#${a.assistant_id}`}</option>
          ))}
        </select>
        <select value={cliente} onChange={e => setCliente(e.target.value)} className={selectClass}>
          <option value="">{t('bodega:pedidos.filters.client')}</option>
          {clienteOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        {/* SCRUM-860 (rebote de Daniela) — filtro por Estado, mismo selectClass que Asistente/
            Cliente para que los 3 se vean del mismo tamaño. */}
        <select value={stage} onChange={e => setStage(e.target.value as OrderStage | '')} className={selectClass}>
          <option value="">{t('bodega:pedidos.filters.stage')}</option>
          {ORDER_STAGE_ORDER.map(s => (
            <option key={s} value={s}>{t(`bodega:pedidos.stages.${s}`)}</option>
          ))}
        </select>
        {/* SCRUM-860 (rebote de Daniela, 2026-09-09) — "Todos los Vendedores" quedaba más grande
            que Asistente/Cliente: UserMultiSelect no tenía forma de recibir el tamaño del botón
            disparador (su `className` solo llega al wrapper externo, ver UserMultiSelect.tsx).
            Se agregó `buttonClassName` puntualmente para este caso — reemplaza el estilo default
            del botón por completo, en vez de intentar pisarlo con !important. */}
        <UserMultiSelect
          users={teamVendors ?? []} selectedIds={sellerIds} onChange={setSellerIds}
          placeholder={t('bodega:pedidos.filters.seller')}
          buttonClassName={selectClass}
        />
        {/* SCRUM-860 — mismo motivo: "Limpiar Filtros" (Button variant="outline", px-4 py-2 text-sm
            por default) quedaba más grande que el resto — se achica con overrides !important. */}
        <Button variant="outline" onClick={clearFilters} className="!px-2 !py-2 md:!py-1.5 !text-sm md:!text-[12px]">
          {t('bodega:pedidos.filters.clear')}
        </Button>

        <div className="flex gap-2 flex-wrap w-full">
          {(['all', 'urgentes', 'atrasados', 'sin_stock'] as Chip[]).map(c => (
            <button
              key={c}
              onClick={() => setChip(c)}
              className={[
                'text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors',
                chip === c
                  ? 'bg-primary border-primary text-white'
                  : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
              ].join(' ')}
            >
              {t(`bodega:pedidos.chips.${c === 'sin_stock' ? 'sinStock' : c}`)}
            </button>
          ))}
        </div>
      </Card>

      {/* SCRUM-381/382 (REQ-311/312) — tablero Kanban, 7 etapas fijas, de solo lectura.
          SCRUM-860 — vista Tabla alterna sobre el mismo array `cards` ya filtrado. */}
      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
      ) : view === 'table' ? (
        <OrderTable orders={cards} onViewDetail={setDetailOrderId} />
      ) : (
        <div className="overflow-x-auto -mx-6 px-6 pb-2" data-testid="pedidos-board">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${ORDER_STAGE_ORDER.length}, minmax(230px, 1fr))` }}
          >
            {ORDER_STAGE_ORDER.map(stage => {
              const stageCards = cards.filter(c => c.stage === stage)
              return (
                <div key={stage} className="bg-slate-100 dark:bg-slate-900 rounded-xl p-2.5 min-h-[200px] flex flex-col">
                  <div className="flex justify-between items-center pb-2.5 mb-2.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: ORDER_STAGE_COLORS[stage] }} />
                      <span className="text-xs font-medium" style={{ color: ORDER_STAGE_COLORS[stage] }}>
                        {t(`bodega:pedidos.stages.${stage}`)}
                      </span>
                    </div>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full bg-white dark:bg-slate-800"
                      style={{ color: ORDER_STAGE_COLORS[stage] }}
                    >
                      {countsByStage[stage] ?? 0}
                    </span>
                  </div>

                  {stageCards.length === 0 ? (
                    <p className="text-center text-[12px] text-slate-400 py-8">{t('bodega:pedidos.board.empty')}</p>
                  ) : (
                    stageCards.map(order => (
                      <OrderCardTile
                        key={order.id}
                        order={order}
                        onOpenDetail={() => setDetailOrderId(order.id)}
                        onOpenGuide={() => setGuideOrderId(order.id)}
                        onOpenPickingSheet={setPickingSheetOrderId}
                        onOpenInventoryReview={setInventoryReviewOrderId}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {detailOrderId !== null && (
        <OrderDetailModal
          orderId={detailOrderId}
          onClose={() => setDetailOrderId(null)}
          // Pre-QA 2026-07-26 (SCRUM-385 Escenario 2) — mismo estado `pickingSheetOrderId` que ya
          // usa `OrderCardTile`, para que nunca haya 2 instancias de `PickingSheetModal` montadas
          // a la vez (una desde la tarjeta, otra desde el detalle).
          onOpenPickingSheet={setPickingSheetOrderId}
        />
      )}
      {guideOrderId !== null && (
        <GuiaEntregaModal orderId={guideOrderId} onClose={() => setGuideOrderId(null)} />
      )}
      {pickingModalOpen && (
        <ConsolidatedPickingModal
          activePickerNames={activePickerNames}
          onClose={() => setPickingModalOpen(false)}
        />
      )}
      {pickingSheetOrderId !== null && (
        <PickingSheetModal orderId={pickingSheetOrderId} onClose={() => setPickingSheetOrderId(null)} />
      )}
      {inventoryReviewOrderId !== null && (
        <InventoryReviewModal orderId={inventoryReviewOrderId} onClose={() => setInventoryReviewOrderId(null)} />
      )}
    </>
  )
}

function uniqueSorted(values: (string | null)[] | undefined): string[] {
  const set = new Set((values ?? []).filter((v): v is string => !!v))
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

/** REQ-306 — panel de carga por asistente + aviso de desbalance. */
function AssistantLoadPanel({ assistants }: { assistants: AssistantLoad[] }) {
  const { t } = useTranslation('bodega')

  if (assistants.length === 0) {
    return (
      <Card variant="panel" className="p-4 mb-3">
        <p className="text-sm text-slate-400">{t('pedidos.workload.empty')}</p>
      </Card>
    )
  }

  // Sin umbral exacto en el ticket ("detección de desbalance", sin número) — 65/35 es una
  // decisión de juicio de esta sesión (ver reporte de la tarea), no un umbral de negocio con
  // criterio de aceptación propio, así que no aplica la regla de tabla paramétrica.
  const IMBALANCE_THRESHOLD_PCT = 65
  const isImbalanced = assistants.length > 1 && assistants.some(a => a.percent_of_total > IMBALANCE_THRESHOLD_PCT)

  return (
    <Card variant="panel" className="p-4 mb-3" data-testid="assistant-load-panel">
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">{t('pedidos.workload.title')}</h2>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {assistants.map(a => (
          <div key={a.assistant_id}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {a.assistant_name ?? `#${a.assistant_id}`}
              </span>
              <span className="text-[11px] text-slate-500">{a.orders_count}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, a.percent_of_total)}%` }} />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t('pedidos.workload.ofTotal', { pct: a.percent_of_total })}</p>
          </div>
        ))}
      </div>
      {isImbalanced && (
        <p
          className="mt-3 text-[12px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2"
          data-testid="imbalance-warning"
        >
          {t('pedidos.workload.imbalanceWarning')}
        </p>
      )}
    </Card>
  )
}
