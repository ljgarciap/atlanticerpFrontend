import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { adminContabApi } from '@/api/adminContabApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import CalendarModal from '@/components/CalendarModal'
import MiniCalendarCard from '@/components/MiniCalendarCard'
import { rangeForPill, type CalendarPill } from '@/lib/dateGrid'

/**
 * Batch Home (SCRUM-503→512), Grupo 2 (SCRUM-509, REQ-432) — "Mi calendario". Mismos componentes
 * genéricos MiniCalendarCard/CalendarModal ya reusados en Ventas & Diseño/Compras/Servicios
 * (SCRUM-66/177/272) — ver `ServiciosMyCalendarPanel.tsx` como referencia directa. Igual que
 * Servicios (no Ventas&Diseño/Compras): SIN toggle Mío/Equipo ni selector de persona — RN1 de
 * REQ-432 es tan estricta como SCRUM-272 ("nadie puede ver el calendario personal de otro usuario
 * desde Inicio"), así que `adminContabApi.home.calendar.list()` nunca manda `scope`/`owner_id`.
 *
 * El mockup muestra un punto de color por "tipo" de evento — `OutlookCalendarEvent` (evento real
 * de Microsoft Graph) no trae ningún campo de tipo/categoría, así que no hay dato real que
 * respalde esa taxonomía. Decisión del Arquitecto: un solo color consistente para todos los
 * eventos (MiniCalendarCard/CalendarModal ya lo resuelven así, sin prop de color) — simplificación
 * de layout, no elimina funcionalidad real.
 */
export default function AdminContMyCalendarPanel() {
  const { t } = useTranslation(['adminContab', 'common', 'ventasDiseno'])

  const [pill, setPill] = useState<CalendarPill>('day')
  const [showFull, setShowFull] = useState(false)
  const [initialDate, setInitialDate] = useState<Date | undefined>(undefined)

  const range = rangeForPill(pill)
  const { data } = useQuery({
    queryKey: ['admincont-my-calendar', range.from, range.to],
    queryFn:  () => adminContabApi.home.calendar.list(range),
  })

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('adminContab:home.calendar.title')}</h2>
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
        {t('adminContab:home.calendar.viewFull')}
      </Button>

      {showFull && (
        <CalendarModal
          queryKeyPrefix="admincont-my-calendar"
          fetchEvents={adminContabApi.home.calendar.list}
          onClose={() => setShowFull(false)}
          initialDate={initialDate}
          initialView={initialDate ? pill : 'month'}
        />
      )}
    </Card>
  )
}
