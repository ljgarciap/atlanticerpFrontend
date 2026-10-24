import { useMemo, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useBodegaHomeTeam, useBodegaHomeSummary, useBodegaCalendar, useBodegaApprovalsPending } from '@/hooks/useBodega'
import { ORDER_STAGE_ORDER, ORDER_STAGE_COLORS } from '@/types/bodega'
import type { OrderStage, BodegaPendienteItem, BodegaPendienteTipo, BodegaDespachoUrgente, BodegaPorRecibirRow } from '@/types/bodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import CountBadge from '@/components/ui/CountBadge'
import { IcoAlertTriangle, IcoClock, IcoGlobe, IcoClose, IcoChevronRight } from '@/components/icons'
import CalendarModal from '@/components/CalendarModal'
import MiniCalendarCard from '@/components/MiniCalendarCard'
import ShowMoreListModal from '@/components/ShowMoreListModal'
import ApprovalsPendingCard from '@/components/ApprovalsPendingCard'
import { bodegaApi } from '@/api/bodegaApi'
import { rangeForPill, type CalendarPill } from '@/lib/dateGrid'
import { MAX_HOME_CARD_ITEMS } from '@/lib/homeCards'
import { firstNameOnly } from '@/lib/greeting'

type Scope = 'own' | 'team'
type EstadoChip = 'all' | 'urgent'

/** REQ-299 — el backend no expone prioridad ni texto ya formateado por ítem de "Pendientes"
 * (`BodegaHomeService::pendientes()` solo da datos crudos por `type`) — este mapeo tipo→prioridad
 * es una decisión de este batch, marcada para que Analista/Luis la confirmen o ajusten:
 * "picking sin iniciar" y "ajuste de inventario pendiente" se tratan como alta (bloquean el flujo
 * de despacho o una aprobación de Gerencia respectivamente); "guía sin subir" como media (papeleo de
 * cierre, no bloquea una entrega ya hecha). */
const PENDIENTE_PRIORITY: Record<BodegaPendienteTipo, 'alta' | 'media'> = {
  picking_no_iniciado: 'alta',
  ajuste_inventario_pendiente: 'alta',
  guia_sin_subir: 'media',
}

/**
 * SCRUM-363→374 (REQ-293→304) — Home de Bodega. Mismo patrón estructural que
 * `pages/ventas-diseno/HomePage.tsx` (saludo, toggle scope, calendario, Pendientes) — ver reporte
 * de la tarea para las decisiones tomadas donde el mock/ticket era ambiguo (mapeo de prioridad de
 * Pendientes, "Ver los N artículos" de Mayor rotación limitado al top-N del backend, link de "Ver
 * inventario" al futuro Bloque B2, etc).
 *
 * Contrato de `GET /bodega/home/*` verificado contra `BodegaHomeController`/`BodegaHomeService`
 * reales (construidos en paralelo a esta pantalla) — ver `types/bodega.ts` para el detalle de cada
 * campo y por qué no coincide 1:1 con la primera adivinanza de este batch.
 */
export default function BodegaHomePage() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // REQ-295 RN2 — el alcance "Equipo" es exclusivo del Jefe de Bodega. Se confía en el flag que ya
  // viaja en el JWT (`modules.bodega.view_team`, ADR-006 Decisión 11) — mismo campo que gatea
  // `User::canViewTeamV2()` en el backend — nunca se calcula por rol en el cliente (mismo patrón
  // que `canSeeBodega`/`canSeeVentasDiseno` en Sidebar.tsx).
  const canViewTeam = user?.modules?.bodega?.view_team === true

  // SCRUM-797 RN1 — el Líder de Bodega debe ver Inicio consolidado por defecto, sin tener que
  // activar el toggle Equipo a mano cada vez que entra (antes arrancaba siempre en 'own').
  const [scope, setScope] = useState<Scope>(canViewTeam ? 'team' : 'own')
  const [memberId, setMemberId] = useState<number | ''>('')
  // SCRUM-908 — tarjeta "Aprobaciones Pendientes", siempre personal (nunca se pide en scope 'team').
  const { data: approvalsPending } = useBodegaApprovalsPending()

  // Pre-QA 2026-09-21 (hallazgo MEDIO) — el default 'team' de SCRUM-797 sigue vigente para el caso
  // general (Líder de Bodega ahorra un click al ver Inicio consolidado), pero si YA hay una
  // aprobación real pendiente, aterrizar en 'team' la deja invisible (la card es siempre personal,
  // scope==='own'). Decisión de Luis: cambiar a 'own' automáticamente en ese caso puntual — una
  // sola vez al cargar, nunca si el usuario ya tocó el toggle a mano (no le pisamos la elección).
  const userTouchedScope = useRef(false)
  useEffect(() => {
    if (!userTouchedScope.current && canViewTeam && (approvalsPending?.data.length ?? 0) > 0) {
      setScope('own')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalsPending])
  const [calendarPill, setCalendarPill] = useState<CalendarPill>('day')
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarInitialDate, setCalendarInitialDate] = useState<Date | undefined>(undefined)
  const [estadoChip, setEstadoChip] = useState<EstadoChip>('all')

  const ownerId = scope === 'team' && memberId !== '' ? memberId : undefined

  const { data: team } = useBodegaHomeTeam(canViewTeam)
  const { data: summary, isLoading: loadingSummary } = useBodegaHomeSummary({ scope, owner_id: ownerId })

  const calendarRange = rangeForPill(calendarPill)
  const { data: calendarData } = useBodegaCalendar({ scope, owner_id: ownerId, ...calendarRange })
  const calendarEvents = calendarData?.data

  // REQ-294 RN1 — nombre real del usuario en sesión; el backend ya lo resuelve en `saludo.nombre`
  // (mismo `User` autenticado por JWT), con fallback al store mientras el summary carga. SCRUM-863
  // — solo primer nombre (backend ya devuelve `saludo.nombre` con first_name únicamente).
  const firstName = firstNameOnly(summary?.saludo.nombre ?? user?.first_name)

  const miDia = summary?.mi_dia
  const pendientes = summary?.pendientes.items ?? []
  const pendientesCount = summary?.pendientes.count ?? 0
  const despachosUrgentes = summary?.despachos_urgentes ?? []
  const porRecibir = summary?.por_recibir ?? []
  const mayorRotacion = summary?.mayor_rotacion ?? []
  // SCRUM-871 Pre-QA — articulos_criticos ahora es {items, total}: items ya viene capado al
  // top-N configurado por el backend, total es el conteo real completo (usarlo para "Ver los N
  // artículos", nunca items.length).
  const articulosCriticos = summary?.articulos_criticos.items ?? []
  const articulosCriticosTotal = summary?.articulos_criticos.total ?? 0

  const stageCounts = useMemo((): Partial<Record<OrderStage, number>> => {
    const fromStages = Object.fromEntries((summary?.estado_pedidos.stages ?? []).map(s => [s.stage, s.count]))
    if (estadoChip === 'all') return fromStages
    // REQ-302 RN4 — el chip "⚠️ Urgentes" (sin emoji, IcoAlertTriangle) recalcula por etapa a
    // partir de `despachos_urgentes` (mismo criterio que REQ-300) — `estado_pedidos.urgentes_count`
    // del backend es un total agregado, sin desglose por etapa, así que no sirve para este chip.
    const counts: Partial<Record<OrderStage, number>> = {}
    for (const d of despachosUrgentes) counts[d.stage] = (counts[d.stage] ?? 0) + 1
    return counts
  }, [estadoChip, summary, despachosUrgentes])

  function handleScopeChange(next: Scope) {
    userTouchedScope.current = true
    setScope(next)
    // REQ-296 RN1 — al activar Equipo, "Equipo completo" (memberId === '') queda seleccionado por defecto.
    setMemberId('')
  }

  function pendienteText(item: BodegaPendienteItem): string {
    switch (item.type) {
      case 'picking_no_iniciado':
        return t('bodega:home.pendientes.text.picking_no_iniciado', {
          order: item.order_number, cliente: item.cliente ?? '—', horas: item.horas ?? 0,
        })
      case 'guia_sin_subir':
        return t('bodega:home.pendientes.text.guia_sin_subir', {
          order: item.order_number, cliente: item.cliente ?? '—', dias: item.dias ?? 0,
        })
      case 'ajuste_inventario_pendiente':
        return t('bodega:home.pendientes.text.ajuste_inventario_pendiente', {
          producto: item.producto ?? '—', bodega: item.bodega ?? '—', dias: item.dias ?? 0,
        })
    }
  }

  // SCRUM-369 (REQ-299, corrección 2026-08-11) — el pendiente seleccionado para el detalle
  // (RN1/RN2). `null` = panel cerrado.
  const [selectedPendiente, setSelectedPendiente] = useState<BodegaPendienteItem | null>(null)

  // SCRUM-871 — "Ver más" por tarjeta.
  const [showAllPendientes, setShowAllPendientes] = useState(false)
  const [showAllDespachos, setShowAllDespachos] = useState(false)
  const [showAllPorRecibir, setShowAllPorRecibir] = useState(false)

  const renderPendienteRow = (p: BodegaPendienteItem, i: number, onSelect: () => void) => {
    const priority = PENDIENTE_PRIORITY[p.type]
    return (
      // SCRUM-369 (REQ-299, corrección 2026-08-11) — RN1: todo pendiente es
      // seleccionable/clickeable, para poder consultar su detalle.
      <button
        type="button"
        onClick={onSelect}
        data-testid={`pendiente-item-${i}`}
        className="w-full flex items-start gap-1.5 text-[12px] px-2 py-1.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
      >
        <span className="shrink-0 mt-0.5" title={t(`bodega:home.pendientes.priority.${priority}`)}>
          {priority === 'alta'
            ? <IcoAlertTriangle size={13} className="text-red-500" />
            : <IcoClock size={13} className="text-amber-500" />}
        </span>
        <span className="text-slate-600 dark:text-slate-300">{pendienteText(p)}</span>
      </button>
    )
  }

  const renderDespachoUrgenteRow = (d: BodegaDespachoUrgente) => (
    <div className="flex items-center justify-between gap-2 text-[12px] px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900">
      <span className="text-slate-700 dark:text-slate-200">
        <span className="font-semibold">#{d.order_number}</span>
        {d.cliente && <span className="text-slate-400"> · {d.cliente}</span>}
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-slate-400">
          {d.fecha_entrega_comprometida
            ? new Date(d.fecha_entrega_comprometida).toLocaleDateString('es', { day: 'numeric', month: 'short' })
            : '—'}
        </span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ color: ORDER_STAGE_COLORS[d.stage], background: `${ORDER_STAGE_COLORS[d.stage]}18` }}
        >
          {t(`bodega:pedidos.stages.${d.stage}`)}
        </span>
      </span>
    </div>
  )

  const renderPorRecibirCells = (row: BodegaPorRecibirRow) => (
    <>
      <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-300">{row.factory_reference ?? '—'}</td>
      <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{row.description ?? row.reference ?? '—'}</td>
      <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-300">{row.quantity}</td>
      <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-300">{row.estimated_arrival_date ?? '—'}</td>
      <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-300">
        {row.provider_name ?? '—'}
        {row.is_zona_libre && (
          <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
            <IcoGlobe size={10} /> {t('bodega:home.porRecibir.freeZoneBadge')}
          </span>
        )}
      </td>
      <td className="py-1.5">
        {/* REQ-301 RN3 — "Zona Libre" es la misma orden de Compras (`PurchaseOrder.modality`),
            no un recurso separado, así que "Ver orden" siempre va a Compras. */}
        <button
          className="text-primary font-semibold hover:underline"
          onClick={() => navigate(`/compras/ordenes/${row.purchase_order_id}`)}
        >
          {t('bodega:home.porRecibir.viewOrder')}
        </button>
      </td>
    </>
  )

  const renderPorRecibirModalRow = (row: BodegaPorRecibirRow) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 text-[12px]">
      <div>
        <div className="font-medium text-slate-700 dark:text-slate-200">{row.description ?? row.reference ?? '—'}</div>
        <div className="text-slate-400">{row.factory_reference ?? '—'} · {t('bodega:home.porRecibir.table.quantity')}: {row.quantity} · {row.estimated_arrival_date ?? '—'}</div>
        <div className="text-slate-500">
          {row.provider_name ?? '—'}
          {row.is_zona_libre && <span className="ml-1.5 text-primary">({t('bodega:home.porRecibir.freeZoneBadge')})</span>}
        </div>
      </div>
      <button
        className="text-primary font-semibold hover:underline shrink-0"
        onClick={() => { setShowAllPorRecibir(false); navigate(`/compras/ordenes/${row.purchase_order_id}`) }}
      >
        {t('bodega:home.porRecibir.viewOrder')}
      </button>
    </div>
  )

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {t('bodega:home.greeting', { name: firstName })}
        </h1>
        {!loadingSummary && summary && (
          <p className="text-[12px] text-slate-500 dark:text-slate-400">{summary.saludo.resumen}</p>
        )}
      </div>

      {/* REQ-295 — toggle Inicio/Equipo, solo visible para quien tiene view_team. */}
      {canViewTeam && (
        <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
            <Button
              variant="secondary" active={scope === 'own'} activeVariant="primary"
              className="!rounded-none !border-0" onClick={() => handleScopeChange('own')}
            >
              {t('bodega:home.scope.own')}
            </Button>
            <Button
              variant="secondary" active={scope === 'team'} activeVariant="primary"
              className="!rounded-none !border-0" onClick={() => handleScopeChange('team')}
            >
              {t('bodega:home.scope.team')}
            </Button>
          </div>

          {/* REQ-296 — chips "Equipo completo" + una por persona real del equipo. */}
          {scope === 'team' && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setMemberId('')}
                className={[
                  'text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors',
                  memberId === ''
                    ? 'bg-primary border-primary text-white'
                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
                ].join(' ')}
              >
                {t('bodega:home.team.wholeTeam')}
              </button>
              {(team?.data ?? []).map(m => (
                <button
                  key={m.id}
                  onClick={() => setMemberId(m.id)}
                  className={[
                    'text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors',
                    memberId === m.id
                      ? 'bg-primary border-primary text-white'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
                  ].join(' ')}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* REQ-297 — Mi día / Día del equipo. */}
        <Card variant="panel" className="p-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
            {scope === 'own' ? t('bodega:home.miDia.title') : t('bodega:home.miDia.titleTeam')}
          </h3>
          <p className="text-[12px] text-slate-500 mb-1">
            {t('bodega:home.miDia.dispatched', { done: miDia?.despachados_hoy ?? 0, total: miDia?.asignados_hoy ?? 0 })}
          </p>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 mb-3">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${miDia?.percent_despachado_hoy ?? 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
            <div>
              <p className="text-[12px] text-slate-500 mb-0.5">{t('bodega:home.miDia.onTime')}</p>
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                {miDia?.percent_a_tiempo != null ? `${miDia.percent_a_tiempo}%` : '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/bodega/pedidos')}
              className="text-right rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <p className="text-[12px] text-slate-500 mb-0.5">{t('bodega:home.miDia.ordersToday')}</p>
              <p className="text-base font-bold text-primary">{miDia?.asignados_hoy ?? 0}</p>
            </button>
          </div>
        </Card>

        {/* REQ-298 — Mi calendario / Calendario del equipo. Reusa MiniCalendarCard/CalendarModal
            tal cual (SCRUM-66/177), apuntando al endpoint compartido de Outlook (`module=bodega`). */}
        <Card variant="panel" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {scope === 'own' ? t('bodega:home.calendar.title') : t('bodega:home.calendar.titleTeam')}
            </h3>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
              {(['day', 'week', 'month'] as CalendarPill[]).map(p => (
                <Button
                  key={p} variant="secondary" active={calendarPill === p} activeVariant="primary"
                  className="!rounded-none !border-0 !px-2 !py-1 !text-[11px]" onClick={() => setCalendarPill(p)}
                >
                  {t(`ventasDiseno:home.calendar.view.${p}`)}
                </Button>
              ))}
            </div>
          </div>
          <MiniCalendarCard
            view={calendarPill}
            events={calendarEvents ?? []}
            onSelectDay={day => { setCalendarInitialDate(day); setShowCalendar(true) }}
            showOwner={scope === 'team'}
          />
          <Button variant="secondary" onClick={() => { setCalendarInitialDate(undefined); setShowCalendar(true) }}>
            {t('ventasDiseno:home.calendar.viewFull')}
          </Button>
        </Card>

        {/* REQ-299 — Pendientes. */}
        <Card variant="panel" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('bodega:home.pendientes.title')}</h3>
            <CountBadge count={pendientesCount} />
          </div>
          {/* SCRUM-871 Pre-QA — sin este gate, un summary todavía en vuelo se ve indistinguible
              de "no hay pendientes". */}
          {loadingSummary ? (
            <p className="text-[12px] text-slate-400 px-2">{t('common:labels.loading')}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {pendientes.slice(0, MAX_HOME_CARD_ITEMS).map((p, i) => (
                  <li key={i}>{renderPendienteRow(p, i, () => setSelectedPendiente(p))}</li>
                ))}
                {pendientes.length === 0 && (
                  <li className="text-[12px] text-slate-400 px-2">{t('bodega:home.pendientes.empty')}</li>
                )}
              </ul>
              {pendientes.length > MAX_HOME_CARD_ITEMS && (
                <Button variant="secondary" className="!text-xs mt-2 w-full" onClick={() => setShowAllPendientes(true)}>
                  {t('common:actions.viewMore')}
                </Button>
              )}
            </>
          )}
        </Card>

        {/* REQ-300 — Despachos urgentes. */}
        <Card variant="panel" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {t('bodega:home.despachosUrgentes.title')}
            </h3>
            <CountBadge count={despachosUrgentes.length} tone="critical" />
          </div>
          {loadingSummary ? (
            <p className="text-[12px] text-slate-400 px-2">{t('common:labels.loading')}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5">
                {despachosUrgentes.slice(0, MAX_HOME_CARD_ITEMS).map(d => (
                  <li key={d.order_id}>{renderDespachoUrgenteRow(d)}</li>
                ))}
                {despachosUrgentes.length === 0 && (
                  <li className="text-[12px] text-slate-400 px-2">{t('bodega:home.despachosUrgentes.empty')}</li>
                )}
              </ul>
              {despachosUrgentes.length > MAX_HOME_CARD_ITEMS && (
                <Button variant="secondary" className="!text-xs mt-2 w-full" onClick={() => setShowAllDespachos(true)}>
                  {t('common:actions.viewMore')}
                </Button>
              )}
            </>
          )}
        </Card>

        {/* REQ-301 — Por recibir (no cambia con el toggle). */}
        <Card variant="panel" className="p-4 lg:col-span-2 overflow-x-auto">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">{t('bodega:home.porRecibir.title')}</h3>
          {/* SCRUM-871 Pre-QA — distingue "cargando" de "vacío de verdad". */}
          {loadingSummary ? (
            <p className="text-[12px] text-slate-400 px-2">{t('common:labels.loading')}</p>
          ) : porRecibir.length === 0 ? (
            <p className="text-[12px] text-slate-400 px-2">{t('bodega:home.porRecibir.empty')}</p>
          ) : (
            <>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="font-semibold pb-2 pr-2">{t('bodega:home.porRecibir.table.factoryRef')}</th>
                    <th className="font-semibold pb-2 pr-2">{t('bodega:home.porRecibir.table.product')}</th>
                    <th className="font-semibold pb-2 pr-2">{t('bodega:home.porRecibir.table.quantity')}</th>
                    <th className="font-semibold pb-2 pr-2">{t('bodega:home.porRecibir.table.eta')}</th>
                    <th className="font-semibold pb-2 pr-2">{t('bodega:home.porRecibir.table.providerOrigin')}</th>
                    <th className="font-semibold pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {porRecibir.slice(0, MAX_HOME_CARD_ITEMS).map(row => (
                    <tr key={`${row.purchase_order_id}-${row.reference ?? row.description}`}>{renderPorRecibirCells(row)}</tr>
                  ))}
                </tbody>
              </table>
              {porRecibir.length > MAX_HOME_CARD_ITEMS && (
                <Button variant="secondary" className="!text-xs mt-2 w-full" onClick={() => setShowAllPorRecibir(true)}>
                  {t('common:actions.viewMore')}
                </Button>
              )}
            </>
          )}
        </Card>

        {/* REQ-302 — Estado de pedidos (resumen por etapa). */}
        <Card variant="panel" className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {t('bodega:home.estadoPedidos.title')}
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <button
                  onClick={() => setEstadoChip('all')}
                  className={[
                    'text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors',
                    estadoChip === 'all' ? 'bg-primary border-primary text-white' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
                  ].join(' ')}
                >
                  {t('bodega:home.estadoPedidos.chips.all')}
                </button>
                <button
                  onClick={() => setEstadoChip('urgent')}
                  className={[
                    'text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1',
                    estadoChip === 'urgent' ? 'bg-primary border-primary text-white' : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
                  ].join(' ')}
                >
                  <IcoAlertTriangle size={11} /> {t('bodega:home.estadoPedidos.chips.urgent')}
                </button>
              </div>
              <Button variant="secondary" className="!text-xs" onClick={() => navigate('/bodega/pedidos')}>
                {t('bodega:home.estadoPedidos.moreFilters')}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
            {ORDER_STAGE_ORDER.map(stage => (
              <button
                key={stage}
                onClick={() => navigate('/bodega/pedidos')}
                className="rounded-lg border border-slate-100 dark:border-slate-700 p-2 text-center hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <span className="block text-lg font-bold" style={{ color: ORDER_STAGE_COLORS[stage] }}>
                  {stageCounts[stage] ?? 0}
                </span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                  {t(`bodega:pedidos.stages.${stage}`)}
                  {stage === 'entregado' && <span className="block">{t('bodega:home.estadoPedidos.thisWeek')}</span>}
                </span>
              </button>
            ))}
          </div>
        </Card>

        {/* REQ-303 — Mayor rotación (no cambia con el toggle). */}
        <Card variant="panel" className="p-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">{t('bodega:home.mayorRotacion.title')}</h3>
          {/* SCRUM-871 Pre-QA — distingue "cargando" de "vacío de verdad". */}
          {loadingSummary ? (
            <p className="text-[12px] text-slate-400 px-2">{t('common:labels.loading')}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5 mb-2">
                {/* SCRUM-871 — máx. MAX_HOME_CARD_ITEMS visibles acá aunque `rotacionTopN` (backend,
                    configurable) traiga más; el link de abajo ya lleva al listado completo real en
                    Inventario, así que cumple el rol de "Ver más" sin necesitar un modal nuevo. */}
                {mayorRotacion.slice(0, MAX_HOME_CARD_ITEMS).map(item => (
                  <li key={item.catalog_product_id} className="flex justify-between text-[12px] px-2 py-1">
                    <span className="text-slate-700 dark:text-slate-200">
                      {item.factory_reference && <span className="text-slate-400">{item.factory_reference} · </span>}
                      {item.description ?? item.reference}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">
                      {t('bodega:home.mayorRotacion.salidas', { count: item.total_salidas })}
                    </span>
                  </li>
                ))}
                {mayorRotacion.length === 0 && (
                  <li className="text-[12px] text-slate-400 px-2">{t('bodega:home.mayorRotacion.empty')}</li>
                )}
              </ul>
              {mayorRotacion.length > MAX_HOME_CARD_ITEMS && (
                <button
                  className="text-[12px] text-primary font-semibold hover:underline px-2"
                  onClick={() => navigate('/bodega/inventario?filter=rotacion')}
                >
                  {t('bodega:home.mayorRotacion.viewAll', { count: mayorRotacion.length })}
                </button>
              )}
            </>
          )}
        </Card>

        {/* REQ-304 — Artículos críticos (no cambia con el toggle). */}
        <Card variant="panel" className="p-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">{t('bodega:home.articulosCriticos.title')}</h3>
          {/* SCRUM-871 Pre-QA — con `articulos_criticos` ahora capado al top-N server-side, sin
              este gate un summary todavía en vuelo se ve indistinguible de "no hay críticos". */}
          {loadingSummary ? (
            <p className="text-[12px] text-slate-400 px-2">{t('common:labels.loading')}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5 mb-2">
                {articulosCriticos.slice(0, MAX_HOME_CARD_ITEMS).map(item => (
                  <li key={item.catalog_product_id} className="flex justify-between text-[12px] px-2 py-1">
                    <span className="text-slate-700 dark:text-slate-200">
                      {item.factory_reference && <span className="text-slate-400">{item.factory_reference} · </span>}
                      {item.description ?? item.reference}
                    </span>
                    <span className="text-red-600 dark:text-red-400 font-semibold shrink-0">
                      {t('bodega:home.articulosCriticos.available', { count: item.disponible })}
                    </span>
                  </li>
                ))}
                {articulosCriticosTotal === 0 && (
                  <li className="text-[12px] text-slate-400 px-2">{t('bodega:home.articulosCriticos.empty')}</li>
                )}
              </ul>
              {articulosCriticosTotal > MAX_HOME_CARD_ITEMS && (
                <button
                  className="text-[12px] text-primary font-semibold hover:underline px-2"
                  onClick={() => navigate('/bodega/inventario?filter=criticos')}
                >
                  {t('bodega:home.articulosCriticos.viewAll', { count: articulosCriticosTotal })}
                </button>
              )}
            </>
          )}
        </Card>
      </div>

      {/* SCRUM-908 — siempre personal, no aplica al scope 'team'. */}
      {scope === 'own' && <ApprovalsPendingCard items={approvalsPending?.data ?? []} />}

      {showCalendar && (
        <CalendarModal
          queryKeyPrefix="bodega-calendar"
          fetchEvents={range => bodegaApi.calendar.list({ scope, owner_id: ownerId, ...range })}
          onClose={() => setShowCalendar(false)}
          initialDate={calendarInitialDate}
          initialView={calendarInitialDate ? calendarPill : 'month'}
          showOwner={scope === 'team'}
        />
      )}

      {selectedPendiente && (
        <PendienteDetailModal
          item={selectedPendiente}
          onClose={() => setSelectedPendiente(null)}
          onNavigate={target => { setSelectedPendiente(null); navigate(target) }}
        />
      )}

      {showAllPendientes && (
        <ShowMoreListModal
          title={t('bodega:home.pendientes.title')}
          items={pendientes}
          onClose={() => setShowAllPendientes(false)}
          renderItem={(p, i) => (
            <div key={i}>
              {renderPendienteRow(p, i, () => { setShowAllPendientes(false); setSelectedPendiente(p) })}
            </div>
          )}
        />
      )}

      {showAllDespachos && (
        <ShowMoreListModal
          title={t('bodega:home.despachosUrgentes.title')}
          items={despachosUrgentes}
          onClose={() => setShowAllDespachos(false)}
          renderItem={d => <div key={d.order_id}>{renderDespachoUrgenteRow(d)}</div>}
        />
      )}

      {showAllPorRecibir && (
        <ShowMoreListModal
          title={t('bodega:home.porRecibir.title')}
          items={porRecibir}
          onClose={() => setShowAllPorRecibir(false)}
          renderItem={row => (
            <div key={`${row.purchase_order_id}-${row.reference ?? row.description}`}>
              {renderPorRecibirModalRow(row)}
            </div>
          )}
        />
      )}
    </>
  )
}

/**
 * SCRUM-369 (REQ-299, corrección 2026-08-11) — detalle de un pendiente + navegación directa al
 * registro exacto donde se resuelve.
 *
 * RN2 (detalle) — qué es, sobre qué registro y estado actual, por tipo.
 * RN3/RN4 (navegación con contexto) — nunca la pantalla general: `picking_no_iniciado`/
 * `guia_sin_subir` van al pedido puntual (`/bodega/pedidos?order=<id>`, leído por `PedidosPage`
 * para abrir `OrderDetailModal` directo); `ajuste_inventario_pendiente` va a la línea puntual de
 * Solicitud de Ajuste (`/bodega/solicitud-ajuste?line=<id>`, leído por `SolicitudAjustePage` para
 * forzar el chip Pendiente y resaltar la fila).
 * RN5 (acción disponible) — el texto de la acción es específico por tipo, nunca genérico.
 * RN6 (sin acción cuando no aplica) — los 3 tipos que hoy genera el panel siempre resuelven a un
 * registro navegable, así que este componente no tiene hoy un caso sin botón — si un tipo nuevo
 * se agrega sin `order_id`/`adjustment_request_line_id`, `navigateTarget()` devuelve `null` y el
 * botón no se renderiza (guard ya escrito, no específico de los 3 tipos actuales).
 */
function PendienteDetailModal({
  item, onClose, onNavigate,
}: {
  item: BodegaPendienteItem
  onClose: () => void
  onNavigate: (target: string) => void
}) {
  const { t } = useTranslation(['common', 'bodega'])

  const title = t(`bodega:home.pendientes.detail.title.${item.type}`)

  const rows: Array<{ label: string; value: string }> = []
  switch (item.type) {
    case 'picking_no_iniciado':
      rows.push(
        { label: t('bodega:home.pendientes.detail.fields.order'), value: `#${item.order_number ?? '—'}` },
        { label: t('bodega:home.pendientes.detail.fields.client'), value: item.cliente ?? '—' },
        { label: t('bodega:home.pendientes.detail.fields.status'), value: t('bodega:home.pendientes.detail.status.picking_no_iniciado', { horas: item.horas ?? 0 }) },
      )
      break
    case 'guia_sin_subir':
      rows.push(
        { label: t('bodega:home.pendientes.detail.fields.order'), value: `#${item.order_number ?? '—'}` },
        { label: t('bodega:home.pendientes.detail.fields.client'), value: item.cliente ?? '—' },
        { label: t('bodega:home.pendientes.detail.fields.status'), value: t('bodega:home.pendientes.detail.status.guia_sin_subir', { dias: item.dias ?? 0 }) },
      )
      break
    case 'ajuste_inventario_pendiente':
      rows.push(
        { label: t('bodega:home.pendientes.detail.fields.product'), value: item.producto ?? '—' },
        { label: t('bodega:home.pendientes.detail.fields.warehouse'), value: item.bodega ?? '—' },
        { label: t('bodega:home.pendientes.detail.fields.requestedBy'), value: item.solicitante ?? '—' },
        { label: t('bodega:home.pendientes.detail.fields.status'), value: t('bodega:home.pendientes.detail.status.ajuste_inventario_pendiente', { dias: item.dias ?? 0 }) },
      )
      break
  }

  function navigateTarget(): { target: string; actionLabel: string } | null {
    switch (item.type) {
      case 'picking_no_iniciado':
        return item.order_id !== undefined
          ? { target: `/bodega/pedidos?order=${item.order_id}`, actionLabel: t('bodega:home.pendientes.detail.action.picking_no_iniciado') }
          : null
      case 'guia_sin_subir':
        return item.order_id !== undefined
          ? { target: `/bodega/pedidos?order=${item.order_id}`, actionLabel: t('bodega:home.pendientes.detail.action.guia_sin_subir') }
          : null
      case 'ajuste_inventario_pendiente':
        return item.adjustment_request_line_id !== undefined
          ? { target: `/bodega/solicitud-ajuste?line=${item.adjustment_request_line_id}`, actionLabel: t('bodega:home.pendientes.detail.action.ajuste_inventario_pendiente') }
          : null
    }
  }

  const nav = navigateTarget()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="pendiente-detail-modal">
      <Card variant="modal" className="w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-2 text-sm">
          {rows.map(row => (
            <div key={row.label} className="flex justify-between gap-2 border-b border-slate-50 dark:border-slate-700/50 pb-1.5">
              <span className="text-slate-500">{row.label}</span>
              <span className="font-medium text-slate-700 dark:text-slate-200 text-right">{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
          {nav && (
            <Button
              variant="primary"
              className="!flex !items-center !gap-1.5"
              onClick={() => onNavigate(nav.target)}
              data-testid="pendiente-detail-navigate"
            >
              {nav.actionLabel} <IcoChevronRight size={12} />
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
