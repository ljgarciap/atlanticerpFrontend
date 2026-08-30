import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import type { OutlookCalendarEvent } from '@/types/calendar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoChevronLeft, IcoChevronRight, IcoAlertTriangle } from '@/components/icons'
import { startOfMonth, endOfMonth, startOfWeek, addDays, toDateKey, isSameDay } from '@/lib/dateGrid'

// Re-exportado por compatibilidad — CalendarModal.test.tsx y MiniCalendarCard lo importan de acá
// y de '@/lib/dateGrid' respectivamente; mismo símbolo, sin duplicar la lógica.
export { toDateKey }

type ViewMode = 'day' | 'week' | 'month'

interface Props {
  // SCRUM-66/177 — solo lectura de Outlook real: el modal no sabe si viene de Ventas & Diseño o
  // de Compras, solo pide eventos por rango. `queryKeyPrefix` mantiene cacheadas por separado las
  // consultas de cada pantalla en TanStack Query.
  queryKeyPrefix: string
  fetchEvents: (range: { from: string; to: string }) => Promise<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }>
  onClose: () => void
  // SCRUM-66/177 — hallazgo de Luis (2026-07-21): al hacer click en un día de la miniatura de la
  // tarjeta, el modal debe abrir centrado en ESE día, no siempre en "hoy".
  initialDate?: Date
  initialView?: ViewMode
  // SCRUM-368 — mismo criterio que MiniCalendarCard: solo `true` en scope "team".
  showOwner?: boolean
}

export default function CalendarModal({ queryKeyPrefix, fetchEvents, onClose, initialDate, initialView = 'month', showOwner = false }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])

  const [view, setView] = useState<ViewMode>(initialView)
  const [anchor, setAnchor] = useState(initialDate ?? new Date())
  const [selectedDay, setSelectedDay] = useState<Date>(initialDate ?? new Date())

  const rangeStart = view === 'month' ? startOfMonth(anchor) : view === 'week' ? startOfWeek(anchor) : anchor
  const rangeEnd   = view === 'month' ? endOfMonth(anchor) : view === 'week' ? addDays(startOfWeek(anchor), 6) : anchor

  const { data } = useQuery({
    queryKey: [queryKeyPrefix, 'full', toDateKey(rangeStart), toDateKey(rangeEnd)],
    queryFn:  () => fetchEvents({ from: toDateKey(rangeStart), to: toDateKey(addDays(rangeEnd, 1)) }),
  })

  const allEvents = data?.data ?? []
  const sourceUnavailable = data?.source_unavailable ?? false

  const eventsByDay = useMemo(() => {
    const map = new Map<string, OutlookCalendarEvent[]>()
    for (const e of allEvents) {
      if (e.start_at === null) continue
      const key = e.start_at.slice(0, 10)
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return map
  }, [allEvents])

  function navigate(delta: number) {
    if (view === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1))
    else if (view === 'week') setAnchor(addDays(anchor, delta * 7))
    else setAnchor(addDays(anchor, delta))
  }

  // SCRUM-66 — la clase Tailwind "capitalize" capitaliza CADA palabra, incluida
  // la preposicion ("julio de 2026" -> "Julio De 2026"). Solo el mes debe ir
  // con mayuscula inicial.
  const monthLabelRaw = anchor.toLocaleDateString('es', { month: 'long', year: 'numeric' })
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1)

  const monthDays = useMemo(() => {
    if (view !== 'month') return []
    const first = startOfWeek(startOfMonth(anchor))
    return Array.from({ length: 42 }, (_, i) => addDays(first, i))
  }, [anchor, view])

  const rangeDays = useMemo(() => {
    if (view === 'day') return [anchor]
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
    return []
  }, [anchor, view])

  const selectedDayEvents = eventsByDay.get(toDateKey(selectedDay)) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-3xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:home.calendar.fullTitle')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-700 shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="icon" onClick={() => navigate(-1)}><IcoChevronLeft /></Button>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{monthLabel}</span>
            <Button variant="icon" onClick={() => navigate(1)}><IcoChevronRight /></Button>
          </div>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['day', 'week', 'month'] as ViewMode[]).map(v => (
              <Button
                key={v} variant="secondary" active={view === v} activeVariant="primary"
                className="!rounded-none !border-0" onClick={() => setView(v)}
              >
                {t(`ventasDiseno:home.calendar.view.${v}`)}
              </Button>
            ))}
          </div>
        </div>

        {sourceUnavailable && (
          <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs shrink-0">
            <IcoAlertTriangle size={14} />
            {t('ventasDiseno:home.calendar.sourceUnavailable')}
          </div>
        )}

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {view === 'month' && (
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map(day => {
                const dayEvents = eventsByDay.get(toDateKey(day)) ?? []
                const inMonth = day.getMonth() === anchor.getMonth()
                return (
                  <button
                    key={toDateKey(day)}
                    onClick={() => setSelectedDay(day)}
                    className={[
                      'text-left rounded-lg border p-1.5 min-h-[64px] text-xs',
                      isSameDay(day, selectedDay) ? 'border-[#5BA5A0] bg-[#E3F0EE] dark:bg-slate-900' : 'border-slate-100 dark:border-slate-700',
                      inMonth ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300 dark:text-slate-600',
                    ].join(' ')}
                  >
                    <span className="font-semibold">{day.getDate()}</span>
                    {dayEvents.length > 0 && (
                      <span className="block mt-1 text-[10px] font-semibold text-[#3D7E7A] dark:text-[#5BA5A0]">
                        {dayEvents.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {(view === 'week' || view === 'day') && (
            <div className="flex flex-col gap-2">
              {rangeDays.map(day => (
                <button
                  key={toDateKey(day)}
                  onClick={() => setSelectedDay(day)}
                  className={[
                    'text-left rounded-lg border p-2 text-sm',
                    isSameDay(day, selectedDay) ? 'border-[#5BA5A0] bg-[#E3F0EE] dark:bg-slate-900' : 'border-slate-100 dark:border-slate-700',
                  ].join(' ')}
                >
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {day.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </span>
                  <span className="ml-2 text-[11px] text-slate-400">
                    {(eventsByDay.get(toDateKey(day)) ?? []).length} {t('ventasDiseno:home.calendar.events')}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
              {selectedDay.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>

            <ul className="flex flex-col gap-1.5">
              {selectedDayEvents.map(e => (
                <li key={e.id} className="bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2 text-sm">
                  <div>
                    <span className="font-semibold">{e.title || t('ventasDiseno:home.calendar.untitled')}</span>{' '}
                    {e.start_at && (
                      <span className="text-slate-400">
                        {new Date(e.start_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  {(e.location ?? e.organizer ?? showOwner) && (
                    <div className="text-slate-400 text-xs mt-0.5">
                      {[showOwner ? (e.owner_name ?? e.owner_email) : null, e.location, e.organizer].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </li>
              ))}
              {selectedDayEvents.length === 0 && (
                <li className="text-sm text-slate-400">{t('ventasDiseno:home.calendar.noEvents')}</li>
              )}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
