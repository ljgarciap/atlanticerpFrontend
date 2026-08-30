import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import CalendarModal from '@/components/CalendarModal'
import MiniCalendarCard from '@/components/MiniCalendarCard'
import { rangeForPill, type CalendarPill } from '@/lib/dateGrid'

// REQ-209 (Mi calendario, SCRUM-272) — mismos componentes genéricos MiniCalendarCard/CalendarModal
// ya reusados en Ventas & Diseño/Compras/Bodega (SCRUM-66/177). Diferencia deliberada con esos 3:
// acá NO hay toggle Mío/Equipo ni selector de persona — RN1/PERMISOS de este ticket son estrictos
// ("nadie puede ver el calendario personal de otro usuario desde aquí"), a diferencia de "Rutas del
// día" (REQ-208, todo el equipo) — por eso `serviciosApi.calendar.list()` no acepta `scope`/
// `owner_id` (ver docblock en serviciosApi.ts). RN3 (Aaron/Gerencia sin visitas propias → vacío) se
// cumple gratis: sin scope=team, el backend siempre devuelve el calendario Outlook propio del actor
// logueado, nunca el de otro — si ese actor no tiene eventos reales, el estado vacío ya existente de
// MiniCalendarCard/CalendarModal ("Sin eventos") lo cubre sin lógica extra.
export default function ServiciosMyCalendarPanel() {
  const { t } = useTranslation(['servicios', 'ventasDiseno'])

  const [pill, setPill] = useState<CalendarPill>('day')
  const [showFull, setShowFull] = useState(false)
  const [initialDate, setInitialDate] = useState<Date | undefined>(undefined)

  const range = rangeForPill(pill)
  const { data } = useQuery({
    queryKey: ['servicios-my-calendar', range.from, range.to],
    queryFn:  () => serviciosApi.calendar.list(range),
  })

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('home.calendar.title')}</h2>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          {(['day', 'week', 'month'] as CalendarPill[]).map(p => (
            <Button
              key={p} variant="secondary" active={pill === p} activeVariant="primary"
              className="!rounded-none !border-0 !px-2 !py-1 !text-[11px]" onClick={() => setPill(p)}
            >
              {t(`ventasDiseno:home.calendar.view.${p}`)}
            </Button>
          ))}
        </div>
      </div>

      <MiniCalendarCard
        view={pill}
        events={data?.data ?? []}
        onSelectDay={day => { setInitialDate(day); setShowFull(true) }}
      />

      <Button variant="secondary" onClick={() => { setInitialDate(undefined); setShowFull(true) }}>
        {t('ventasDiseno:home.calendar.viewFull')}
      </Button>

      {showFull && (
        <CalendarModal
          queryKeyPrefix="servicios-my-calendar"
          fetchEvents={serviciosApi.calendar.list}
          onClose={() => setShowFull(false)}
          initialDate={initialDate}
          initialView={initialDate ? pill : 'month'}
        />
      )}
    </Card>
  )
}
