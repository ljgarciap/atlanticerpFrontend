import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { OutlookCalendarEvent } from '@/types/calendar'
import { startOfWeek, startOfMonth, addDays, toDateKey, isSameDay } from '@/lib/dateGrid'

type ViewMode = 'day' | 'week' | 'month'

interface Props {
  view:   ViewMode
  events: OutlookCalendarEvent[]
  today?: Date
  // SCRUM-66/177 — hallazgo de Luis en validación (2026-07-21): la grilla de Semana/Mes no tenía
  // forma de interactuar (ni navegar, ni ver detalle). Como la miniatura en sí es de solo vistazo
  // (sin flechas de navegación, eso lo tiene el calendario completo), un click en un día abre el
  // modal completo ya centrado en ese día — no hace falta duplicar la navegación acá.
  onSelectDay?: (date: Date) => void
  // SCRUM-368 — Visual Review CRÍTICO (2026-07-28): en scope "team" la lista combina eventos de
  // varias personas sin indicar de quién es cada uno (RN2/Escenario 2). Solo se pasa `true` desde
  // el scope "team" de cada Home — en "own" es redundante (todo es del mismo usuario).
  showOwner?: boolean
}

/**
 * SCRUM-66/177 — hallazgo de Luis en validación (2026-07-21): el mockup (`1__Ventas_Disen_o_Home.html`
 * / `2__Compras_Home.html`) no muestra una lista de eventos para Semana/Mes en la tarjeta — muestra
 * una miniatura real (tira de 7 días con punto si hay evento / grilla de mes con punto por día).
 * Día sí es una lista (eso ya estaba bien). Reusado tal cual en Ventas & Diseño y Compras.
 *
 * Segunda ronda de feedback de Luis (mismo día): la grilla de Mes se veía "muy grande e inútil" en
 * la tarjeta — sin tope de ancho, las celdas escalaban con el ancho completo del panel. Ahora la
 * grilla tiene un ancho máximo fijo (compacta, centrada) sin importar cuán ancho sea el panel, y
 * cada día es clickeable — abre el calendario completo ya parado en esa fecha.
 */
export default function MiniCalendarCard({ view, events, today = new Date(), onSelectDay, showOwner = false }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, OutlookCalendarEvent[]>()
    for (const e of events) {
      if (e.start_at === null) continue
      const key = e.start_at.slice(0, 10)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return map
  }, [events])

  if (view === 'day') {
    const todays = eventsByDay.get(toDateKey(today)) ?? []
    return (
      <ul className="flex flex-col gap-1.5 mb-2">
        {todays.map(e => (
          <li key={e.id} className="flex flex-col text-[12px] text-slate-600 dark:text-slate-300">
            <div className="flex items-baseline gap-2">
              {e.start_at && (
                <span className="font-semibold shrink-0">
                  {new Date(e.start_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <span className="truncate">{e.title || t('ventasDiseno:home.calendar.untitled')}</span>
            </div>
            {(showOwner || e.location) && (
              <span className="text-[10px] text-slate-400 truncate">
                {[showOwner ? (e.owner_name ?? e.owner_email) : null, e.location].filter(Boolean).join(' · ')}
              </span>
            )}
          </li>
        ))}
        {todays.length === 0 && (
          <li className="text-[12px] text-slate-400">{t('ventasDiseno:home.calendar.noEvents')}</li>
        )}
      </ul>
    )
  }

  if (view === 'week') {
    const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today), i))
    return (
      <div className="flex gap-1 justify-center mb-2 max-w-[300px] mx-auto">
        {days.map(d => {
          const hasEvent = (eventsByDay.get(toDateKey(d)) ?? []).length > 0
          const active = isSameDay(d, today)
          return (
            <button
              key={toDateKey(d)}
              type="button"
              onClick={() => onSelectDay?.(d)}
              className={[
                'w-9 shrink-0 flex flex-col items-center gap-1 rounded-lg py-1.5 transition-colors',
                onSelectDay ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800' : 'cursor-default',
                active ? 'bg-[#E3F0EE] dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-900/50',
              ].join(' ')}
            >
              <span className="text-[10px] uppercase text-slate-400">
                {d.toLocaleDateString('es', { weekday: 'short' }).replace('.', '')}
              </span>
              <span className={['text-sm font-medium', active ? 'text-[#3D7E7A] dark:text-[#5BA5A0]' : 'text-slate-700 dark:text-slate-200'].join(' ')}>
                {d.getDate()}
              </span>
              {hasEvent && <span className="w-1.5 h-1.5 rounded-full bg-[#5BA5A0]" />}
            </button>
          )
        })}
      </div>
    )
  }

  // month
  const first = startOfWeek(startOfMonth(today))
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i))
  const inCurrentMonth = (d: Date) => d.getMonth() === today.getMonth()

  return (
    <div className="grid grid-cols-7 gap-1 mb-2 max-w-[224px] mx-auto">
      {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((h, i) => (
        <div key={i} className="text-center text-[9px] text-slate-400 pb-1">{h}</div>
      ))}
      {days.map(d => {
        const hasEvent = (eventsByDay.get(toDateKey(d)) ?? []).length > 0
        const active = isSameDay(d, today)
        return (
          <button
            key={toDateKey(d)}
            type="button"
            onClick={() => onSelectDay?.(d)}
            className={[
              'aspect-square flex flex-col items-center justify-center gap-0.5 rounded-md text-[10px] transition-colors',
              onSelectDay ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800' : 'cursor-default',
              active
                ? 'bg-[#5BA5A0] text-white font-semibold hover:!bg-[#3D7E7A]'
                : inCurrentMonth(d) ? 'text-slate-600 dark:text-slate-300' : 'text-slate-300 dark:text-slate-700',
            ].join(' ')}
          >
            {d.getDate()}
            {hasEvent && <span className={['w-1 h-1 rounded-full', active ? 'bg-white' : 'bg-[#5BA5A0]'].join(' ')} />}
          </button>
        )
      })}
    </div>
  )
}
