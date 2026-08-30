import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { addDays, toDateKey, type CalendarPill } from '@/lib/dateGrid'

interface Props {
  technicianId: number | ''
  onFilterChange: (id: number | '') => void
}

// REQ-260 — vista Agenda equipo. RN1: bloque con el color del técnico. RN2: filtro Todos/uno.
// RN3: técnico sin visitas en el periodo muestra el mensaje de disponibilidad.
//
// SCRUM-803 (2026-08-28) — agrega selector Día/Semana/Mes + navegación de periodo (el backend,
// `InternalTechnicianService::agenda()`, ya soporta `view`/`date`; acá solo se agrega el estado de
// navegación y el label del periodo). Cambiar de vista vuelve siempre al periodo que contiene
// "hoy" — evita dejar al usuario mirando un rango vacío heredado de la vista anterior.
export default function InternalTechnicianAgendaView({ technicianId, onFilterChange }: Props) {
  const { t } = useTranslation(['servicios', 'ventasDiseno'])

  const [pill, setPill] = useState<CalendarPill>('day')
  const [referenceDate, setReferenceDate] = useState(() => new Date())

  const { data: technicians = [] } = useQuery({
    queryKey: ['servicios-internal-technicians'],
    queryFn:  () => serviciosApi.internalTechnicians.list(),
  })

  const dateKey = toDateKey(referenceDate)
  const { data: agenda = [], isLoading } = useQuery({
    queryKey: ['servicios-internal-technicians-agenda', technicianId, pill, dateKey],
    queryFn:  () => serviciosApi.internalTechnicians.agenda(technicianId || undefined, pill, dateKey),
  })

  function shiftPeriod(direction: 1 | -1): void {
    setReferenceDate(current => {
      if (pill === 'day') return addDays(current, direction)
      if (pill === 'week') return addDays(current, 7 * direction)

      return new Date(current.getFullYear(), current.getMonth() + direction, 1)
    })
  }

  function changePill(next: CalendarPill): void {
    setPill(next)
    setReferenceDate(new Date())
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <select
          aria-label={t('technicians.internal.agenda.filterLabel')}
          value={technicianId}
          onChange={e => onFilterChange(e.target.value ? Number(e.target.value) : '')}
          className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-sm"
        >
          <option value="">{t('technicians.internal.agenda.allTechnicians')}</option>
          {technicians.map(tech => (
            <option key={tech.id} value={tech.id}>{tech.nombre}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="secondary" className="!px-2 !py-1 !text-xs"
              aria-label={t('technicians.internal.agenda.previousPeriod')}
              onClick={() => shiftPeriod(-1)}
            >
              ‹
            </Button>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 min-w-[9rem] text-center">
              {periodLabel(pill, referenceDate)}
            </span>
            <Button
              variant="secondary" className="!px-2 !py-1 !text-xs"
              aria-label={t('technicians.internal.agenda.nextPeriod')}
              onClick={() => shiftPeriod(1)}
            >
              ›
            </Button>
          </div>

          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {(['day', 'week', 'month'] as CalendarPill[]).map(p => (
              <Button
                key={p} variant="secondary" active={pill === p} activeVariant="primary"
                className="!rounded-none !border-0 !px-2 !py-1 !text-[11px]" onClick={() => changePill(p)}
              >
                {t(`ventasDiseno:home.calendar.view.${p}`)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('technicians.internal.agenda.loading')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {agenda.map(entry => (
            <Card
              key={entry.id}
              variant="list-item"
              accentColor={entry.color}
              className="!p-4"
              style={{ background: `${entry.color}14` }}
            >
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">{entry.nombre}</h3>
              {entry.visitas.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t(pill === 'day' ? 'technicians.internal.agenda.noVisits' : 'technicians.internal.agenda.noVisitsPeriod')}
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {entry.visitas.map(v => (
                    <li key={v.ticket_id} className="flex items-center gap-3 text-sm">
                      <span className="font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {pill === 'day' ? v.hora : visitDateTimeLabel(v.fecha, v.hora)}
                      </span>
                      <span className="text-slate-600 dark:text-slate-300 truncate">{v.cliente} — {v.numero}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// SCRUM-803 — label del periodo navegado, mismo patrón de locale que CalendarModal.tsx.
function periodLabel(pill: CalendarPill, date: Date): string {
  if (pill === 'month') {
    return date.toLocaleDateString('es', { month: 'long', year: 'numeric' })
  }
  if (pill === 'day') {
    return date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  const start = addDays(date, -date.getDay())
  const end   = addDays(start, 6)
  const sameMonth = start.getMonth() === end.getMonth()
  const startLabel = start.toLocaleDateString('es', { day: 'numeric', month: sameMonth ? undefined : 'short' })
  const endLabel   = end.toLocaleDateString('es', { day: 'numeric', month: 'short' })

  return `${startLabel} – ${endLabel}`
}

// SCRUM-803 — en Semana/Mes cada visita puede caer en un día distinto del periodo navegado, a
// diferencia de Día (siempre "hoy") — se antepone la fecha corta a la hora para desambiguar.
function visitDateTimeLabel(fecha: string | null, hora: string | null): string {
  if (fecha === null) return hora ?? ''
  const [, month, day] = fecha.split('-')

  return hora !== null ? `${day}/${month} ${hora}` : `${day}/${month}`
}
