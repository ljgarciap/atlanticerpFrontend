import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { comprasApi } from '@/api/comprasApi'
import { useComprasHomeSummary } from '@/hooks/useCompras'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import CountBadge from '@/components/ui/CountBadge'
import HomeItemDetailModal from '@/components/HomeItemDetailModal'
import ShowMoreListModal from '@/components/ShowMoreListModal'
import ApprovalsPendingCard from '@/components/ApprovalsPendingCard'
import CalendarModal from '@/components/CalendarModal'
import MiniCalendarCard from '@/components/MiniCalendarCard'
import { IcoAlertTriangle } from '@/components/icons'
import { rangeForPill, type CalendarPill } from '@/lib/dateGrid'
import { MAX_HOME_CARD_ITEMS } from '@/lib/homeCards'
import { firstNameOnly } from '@/lib/greeting'
import type { NewOrderPrefillState } from './NewPurchaseOrderPage'
import type { ComprasHomePendiente, ComprasHomeOrdenCritica, ComprasHomeReorderItem } from '@/types/compras'

/** REQ-111→118 (Inicio de Compras). REQ-113 (Mi calendario/Outlook) desbloqueado 2026-07-21. */
export default function ComprasHomePage() {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { data: summary, isLoading } = useComprasHomeSummary()
  // SCRUM-908 — tarjeta "Aprobaciones Pendientes".
  const { data: approvalsPending } = useQuery({
    queryKey: ['compras-home-approvals-pending'],
    queryFn:  () => comprasApi.home.approvalsPending(),
  })

  const [pendienteDetail, setPendienteDetail] = useState<ComprasHomePendiente | null>(null)
  const [ordenDetail, setOrdenDetail] = useState<ComprasHomeOrdenCritica | null>(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarInitialDate, setCalendarInitialDate] = useState<Date | undefined>(undefined)
  const [calendarPill, setCalendarPill] = useState<CalendarPill>('day')
  // SCRUM-871 — "Ver más" por tarjeta (máx. MAX_HOME_CARD_ITEMS visibles antes del modal).
  const [showAllPendientes, setShowAllPendientes] = useState(false)
  const [showAllOrdenes, setShowAllOrdenes] = useState(false)
  const [showAllReorder, setShowAllReorder] = useState(false)

  const pendientes = summary?.pendientes ?? []
  const ordenesCriticas = summary?.ordenes_criticas ?? []
  const porReordenar = summary?.por_reordenar ?? []
  const estadoCompras = summary?.estado_compras ?? []
  const resumenMes = summary?.resumen_mes
  const meetingsToday = summary?.events_today_count ?? 0

  const calendarRange = rangeForPill(calendarPill)
  const { data: calendarData } = useQuery({
    queryKey: ['compras-home-calendar-preview', calendarPill],
    queryFn:  () => comprasApi.calendar.list(calendarRange),
  })
  const calendarEvents = calendarData?.data ?? []

  const monthLabel = new Date().toLocaleDateString('es', { month: 'long' })

  const generarOrden = (item: ComprasHomeReorderItem) => {
    if (item.provider_id === null) return
    const state: NewOrderPrefillState = {
      providerId: item.provider_id,
      product: {
        id:          item.catalog_product_id,
        reference:   item.reference,
        description: item.description,
        unitCost:    item.unit_cost,
        quantity:    item.suggested_quantity,
      },
    }
    navigate('/compras/ordenes/nueva', { state })
  }

  // SCRUM-871 — filas reusadas entre la lista corta (máx. MAX_HOME_CARD_ITEMS) y el modal "Ver más".
  const renderPendienteRow = (p: ComprasHomePendiente, onSelect: () => void) => (
    <button
      onClick={onSelect}
      className="w-full text-left text-[12px] px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 flex items-start gap-1.5"
    >
      {p.priority === 'alta' && <IcoAlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />}
      <span className="text-slate-600 dark:text-slate-300">
        {t(`compras:home.pendientes.text.${p.type}`, { id: p.order_id, days: p.days })}
      </span>
    </button>
  )

  const renderOrdenCriticaRow = (o: ComprasHomeOrdenCritica, onSelect: () => void) => (
    <button
      onClick={onSelect}
      className="w-full text-left text-[12px] px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900"
    >
      <span className="font-semibold text-slate-700 dark:text-slate-200">#{o.order_id}</span>
      {o.motivo && <span className="text-slate-400"> · {o.motivo}</span>}
    </button>
  )

  const renderPorReordenarCells = (item: ComprasHomeReorderItem) => (
    <>
      <td className="py-2">
        <div className="font-medium text-slate-800">{item.description}</div>
        <div className="text-xs text-slate-400">{item.reference}</div>
      </td>
      <td className="py-2 text-xs text-slate-500">
        {t('compras:home.porReordenar.stock')}: {item.disponible} / {t('compras:home.porReordenar.reorderPoint')}: {item.reorder_point}
      </td>
      <td className="py-2 text-xs text-slate-500">{item.provider_name ?? '—'}</td>
      <td className="py-2 text-right">
        <Button className="!text-xs" disabled={item.provider_id === null} onClick={() => generarOrden(item)}>
          {t('compras:home.porReordenar.generateOrder')}
        </Button>
      </td>
    </>
  )

  const renderPorReordenarModalRow = (item: ComprasHomeReorderItem) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 last:border-0">
      <div>
        <div className="font-medium text-slate-800 text-sm">{item.description}</div>
        <div className="text-xs text-slate-400">{item.reference}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {t('compras:home.porReordenar.stock')}: {item.disponible} / {t('compras:home.porReordenar.reorderPoint')}: {item.reorder_point} · {item.provider_name ?? '—'}
        </div>
      </div>
      <Button
        className="!text-xs shrink-0"
        disabled={item.provider_id === null}
        onClick={() => { setShowAllReorder(false); generarOrden(item) }}
      >
        {t('compras:home.porReordenar.generateOrder')}
      </Button>
    </div>
  )

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          {/* SCRUM-175 — Daniela: el saludo debe ser el título principal, sin "Inicio" aparte. */}
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {t('compras:home.greeting', { name: firstNameOnly(user?.first_name) })}
          </h1>
          {!isLoading && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              {t('compras:home.subtitle', { meetings: meetingsToday, pendientes: pendientes.length })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/compras/proveedores')}>
            {t('compras:home.actions.providers')}
          </Button>
          <Button onClick={() => navigate('/compras/ordenes/nueva')}>
            {t('compras:home.actions.newOrder')}
          </Button>
        </div>
      </div>

      {/* SCRUM-175 — Daniela (2026-08-04): en el mockup "Resumen del mes" comparte la primera
          fila con "Mi calendario", y la segunda fila es "Pendientes" + "Órdenes críticas". Antes
          "Resumen del mes" ocupaba la fila 1 completa (lg:col-span-2) sola, lo que empujaba
          "Órdenes críticas" a la fila 3 sin su compañera de fila (el auto-placement de grid no
          encontraba lugar para el siguiente card lg:col-span-2 junto a ella) — dejaba un hueco en
          blanco al lado de "Órdenes críticas". Quitar el span de "Resumen del mes" alcanza: el
          orden natural de los cards de acá abajo ya es Resumen/Calendario (fila 1) y
          Pendientes/Órdenes críticas (fila 2). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Resumen del mes — REQ-112 */}
        <Card variant="panel" className="p-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
            {t('compras:home.resumenMes.title')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <div>
              <p className="text-[11px] text-slate-500 mb-0.5">{t('compras:home.resumenMes.comprado', { month: monthLabel })}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                ${(resumenMes?.comprado_mes ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-0.5">{t('compras:home.resumenMes.onTime')}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {resumenMes?.entregado_a_tiempo_percent != null
                  ? `${resumenMes.entregado_a_tiempo_percent}%`
                  : t('compras:home.resumenMes.onTimeUnavailable')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/compras/ordenes?chip=critical')}
              className="text-left rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 -m-1 p-1"
            >
              <p className="text-[11px] text-slate-500 mb-0.5">{t('compras:home.resumenMes.delayed')}</p>
              <p className="text-lg font-bold text-amber-600">{resumenMes?.productos_retrasados ?? 0}</p>
            </button>
            <button
              type="button"
              onClick={() => navigate('/inventario?chip=bajo_stock')}
              className="text-left rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 -m-1 p-1"
            >
              <p className="text-[11px] text-slate-500 mb-0.5">{t('compras:home.resumenMes.lowStock')}</p>
              <p className="text-lg font-bold text-amber-600">{resumenMes?.bajo_stock ?? 0}</p>
            </button>
            <button
              type="button"
              onClick={() => navigate('/inventario?chip=sin_stock')}
              className="text-left rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 -m-1 p-1"
            >
              <p className="text-[11px] text-slate-500 mb-0.5">{t('compras:home.resumenMes.outOfStock')}</p>
              <p className="text-lg font-bold text-red-600">{resumenMes?.sin_stock ?? 0}</p>
            </button>
          </div>
        </Card>

        {/* Mi calendario — REQ-113, lectura de Outlook real (desbloqueado 2026-07-21) */}
        <Card variant="panel" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {t('compras:home.calendar.title')}
            </h3>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['day', 'week', 'month'] as CalendarPill[]).map(p => (
                <Button
                  key={p} variant="secondary" active={calendarPill === p} activeVariant="primary"
                  className="!rounded-none !border-0 !px-2 !py-1 !text-[11px]" onClick={() => setCalendarPill(p)}
                >
                  {t(`compras:home.calendar.view.${p}`)}
                </Button>
              ))}
            </div>
          </div>
          <MiniCalendarCard
            view={calendarPill}
            events={calendarEvents}
            onSelectDay={day => { setCalendarInitialDate(day); setShowCalendar(true) }}
          />
          <Button variant="secondary" onClick={() => { setCalendarInitialDate(undefined); setShowCalendar(true) }}>
            {t('compras:home.calendar.viewFull')}
          </Button>
        </Card>

        {/* Pendientes — REQ-114 */}
        <Card variant="panel" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {t('compras:home.pendientes.title')}
            </h3>
            <CountBadge count={pendientes.length} />
          </div>
          <ul className="flex flex-col gap-1.5">
            {pendientes.slice(0, MAX_HOME_CARD_ITEMS).map((p, i) => (
              <li key={i}>{renderPendienteRow(p, () => setPendienteDetail(p))}</li>
            ))}
            {pendientes.length === 0 && (
              <li className="text-[12px] text-slate-400 px-2">{t('compras:home.pendientes.empty')}</li>
            )}
          </ul>
          {pendientes.length > MAX_HOME_CARD_ITEMS && (
            <Button variant="secondary" className="!text-xs mt-2 w-full" onClick={() => setShowAllPendientes(true)}>
              {t('common:actions.viewMore')}
            </Button>
          )}
        </Card>

        {/* Órdenes críticas — REQ-115 */}
        <Card variant="panel" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3
              className="text-sm font-bold text-slate-900 dark:text-slate-100 cursor-pointer hover:underline"
              onClick={() => navigate('/compras/ordenes?chip=critical')}
            >
              {t('compras:home.ordenesCriticas.title')}
            </h3>
            <CountBadge count={ordenesCriticas.length} tone="critical" />
          </div>
          <ul className="flex flex-col gap-1.5">
            {ordenesCriticas.slice(0, MAX_HOME_CARD_ITEMS).map(o => (
              <li key={o.order_id}>{renderOrdenCriticaRow(o, () => setOrdenDetail(o))}</li>
            ))}
            {ordenesCriticas.length === 0 && (
              <li className="text-[12px] text-slate-400 px-2">{t('compras:home.ordenesCriticas.empty')}</li>
            )}
          </ul>
          {ordenesCriticas.length > MAX_HOME_CARD_ITEMS && (
            <Button variant="secondary" className="!text-xs mt-2 w-full" onClick={() => setShowAllOrdenes(true)}>
              {t('common:actions.viewMore')}
            </Button>
          )}
        </Card>

        {/* Por reordenar — REQ-116/118 */}
        <Card variant="panel" className="p-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">
            {t('compras:home.porReordenar.title')}
          </h3>
          {porReordenar.length === 0 ? (
            <p className="text-[12px] text-slate-400">{t('compras:home.porReordenar.empty')}</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {porReordenar.slice(0, MAX_HOME_CARD_ITEMS).map(item => (
                    <tr key={item.catalog_product_id}>{renderPorReordenarCells(item)}</tr>
                  ))}
                </tbody>
              </table>
              {porReordenar.length > MAX_HOME_CARD_ITEMS && (
                <Button variant="secondary" className="!text-xs mt-2 w-full" onClick={() => setShowAllReorder(true)}>
                  {t('common:actions.viewMore')}
                </Button>
              )}
            </>
          )}
        </Card>

        {/* Estado de compras — REQ-117 */}
        <Card variant="panel" className="p-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">
            {t('compras:home.estadoCompras.title')}
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
            {estadoCompras.map(s => (
              <div
                key={s.stage}
                className="rounded-lg border border-slate-100 dark:border-slate-700 p-2 text-center"
              >
                <span className="block text-lg font-bold text-slate-900 dark:text-slate-100">{s.count}</span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">{t(`compras:orders.status.${s.stage}`)}</span>
                <span className="block text-[10px] text-slate-400">${s.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>

        <ApprovalsPendingCard items={approvalsPending?.data ?? []} />
      </div>

      {showCalendar && (
        <CalendarModal
          queryKeyPrefix="compras-calendar"
          fetchEvents={range => comprasApi.calendar.list(range)}
          onClose={() => setShowCalendar(false)}
          initialDate={calendarInitialDate}
          initialView={calendarInitialDate ? calendarPill : 'month'}
        />
      )}

      {pendienteDetail && (
        <HomeItemDetailModal
          title={t('compras:home.pendientes.detailTitle')}
          fields={[
            { label: t('compras:home.pendientes.provider'), value: pendienteDetail.provider ?? '—' },
            { label: t('compras:home.pendientes.amount'), value: `$${pendienteDetail.amount.toLocaleString()}` },
            { label: t('compras:home.pendientes.priority'), value: t(`compras:home.pendientes.priorityLevel.${pendienteDetail.priority}`) },
            { label: t('compras:home.pendientes.suggestion'), value: pendienteDetail.suggestion },
          ]}
          onClose={() => setPendienteDetail(null)}
          action={{ label: t('compras:home.viewOrder'), onClick: () => navigate(`/compras/ordenes/${pendienteDetail.order_id}`) }}
        />
      )}

      {ordenDetail && (
        <HomeItemDetailModal
          title={`#${ordenDetail.order_id}`}
          fields={[
            { label: t('compras:home.ordenesCriticas.motivo'), value: ordenDetail.motivo ?? '—' },
            { label: t('compras:home.ordenesCriticas.provider'), value: ordenDetail.provider ?? '—' },
            { label: t('compras:home.ordenesCriticas.amount'), value: `$${ordenDetail.amount.toLocaleString()}` },
          ]}
          onClose={() => setOrdenDetail(null)}
          action={{ label: t('compras:home.viewOrder'), onClick: () => navigate(`/compras/ordenes/${ordenDetail.order_id}`) }}
        />
      )}

      {showAllPendientes && (
        <ShowMoreListModal
          title={t('compras:home.pendientes.title')}
          items={pendientes}
          onClose={() => setShowAllPendientes(false)}
          renderItem={(p, i) => (
            <div key={i}>
              {renderPendienteRow(p, () => { setShowAllPendientes(false); setPendienteDetail(p) })}
            </div>
          )}
        />
      )}

      {showAllOrdenes && (
        <ShowMoreListModal
          title={t('compras:home.ordenesCriticas.title')}
          items={ordenesCriticas}
          onClose={() => setShowAllOrdenes(false)}
          renderItem={o => (
            <div key={o.order_id}>
              {renderOrdenCriticaRow(o, () => { setShowAllOrdenes(false); setOrdenDetail(o) })}
            </div>
          )}
        />
      )}

      {showAllReorder && (
        <ShowMoreListModal
          title={t('compras:home.porReordenar.title')}
          items={porReordenar}
          onClose={() => setShowAllReorder(false)}
          renderItem={item => <div key={item.catalog_product_id}>{renderPorReordenarModalRow(item)}</div>}
        />
      )}
    </>
  )
}
