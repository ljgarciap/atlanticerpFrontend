import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoSearch } from '@/components/icons'
import { TICKET_STATUSES } from '@/types/servicios'
import type { TicketType, TicketStatus } from '@/types/servicios'

type TypeChip = TicketType | ''

const TYPE_CHIPS: TypeChip[] = ['', 'installation', 'warranty', 'claim', 'retrofit']

// REQ-215 (Grupo C, SCRUM-278) — panel "Estado de tickets" de Inicio. Query propia (separada de
// `servicios-home-summary`), re-consultada por `tipo` de chip activo para no recargar el resto de
// la pantalla — GET /servicios/home/estado-tickets. Escenario 3 del criterio de aceptación agrega
// una 6ta tarjeta "Cancelado": el mockup del cliente (`5__Servicios_Home.html`, anterior a que
// existiera ese estado) solo trae 5 — TICKET_STATUSES ya incluye las 6, así que se itera sobre esa
// lista completa a propósito, sin recortarla para calzar con el mockup viejo.
export default function EstadoTicketsPanel() {
  const { t }      = useTranslation('servicios')
  const navigate   = useNavigate()
  const [chip, setChip] = useState<TypeChip>('')

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-home-estado-tickets', chip],
    queryFn:  () => serviciosApi.home.estadoTickets(chip),
  })

  const counts = data?.counts

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('home.estadoTickets.title')}</h2>
        <button
          type="button"
          title={t('home.estadoTickets.seeAll')}
          onClick={() => navigate('/servicios/tickets')}
          className="text-slate-400 hover:text-primary"
        >
          <IcoSearch size={16} />
        </button>
      </div>

      <div className="flex flex-wrap rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden w-fit mb-3">
        {TYPE_CHIPS.map(value => (
          <Button
            key={value || 'all'}
            variant="secondary" active={chip === value} className="!rounded-none !border-0"
            onClick={() => setChip(value)}
          >
            {t(`home.estadoTickets.chips.${value || 'all'}`)}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {TICKET_STATUSES.map(status => (
          <StageCard key={status} status={status} value={counts?.[status]} loading={isLoading} />
        ))}
      </div>
    </Card>
  )
}

function StageCard({ status, value, loading }: { status: TicketStatus; value: number | undefined; loading: boolean }) {
  const { t } = useTranslation('servicios')
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-900 py-2.5 px-3">
      <span className="block text-lg font-bold text-slate-800 dark:text-slate-100">
        {loading || value === undefined ? '—' : value}
      </span>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {t(`tickets.statuses.${status}`)}
        {/* Solo "Cerrado" trae acotamiento real de período del backend (mes en curso) — el resto
            de las 6 tarjetas son un conteo total sin ventana temporal, mostrar "hoy"/"esta semana"
            ahí sería un dato falso (desviación intencional del mockup, ver docblock arriba). */}
        {status === 'closed' && ` (${t('home.estadoTickets.closedThisMonth')})`}
      </span>
    </div>
  )
}
