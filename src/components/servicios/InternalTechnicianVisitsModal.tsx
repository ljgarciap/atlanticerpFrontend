import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import type { InternalTechnician } from '@/types/servicios'

interface Props {
  technician: InternalTechnician
  onClose:    () => void
}

// REQ-257 — modal "Visitas hoy". RN1: estado vacío si no hay ninguna. RN2: orden cronológico (ya
// lo trae el backend). SCRUM-777 — cada visita navega al ticket correspondiente vía el mismo
// deep-link `?ticket=<id>` que ya usa el panel "Pendientes de Inicio" (REQ-210), no una ruta
// `/servicios/tickets/:id` nueva — TicketsPage ya sabe abrir TicketDetailModal desde ese query param.
export default function InternalTechnicianVisitsModal({ technician, onClose }: Props) {
  const { t } = useTranslation('servicios')
  const navigate = useNavigate()

  function goToTicket(ticketId: number) {
    onClose()
    navigate(`/servicios/tickets?ticket=${ticketId}`)
  }

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ['servicios-internal-technician-visits', technician.id],
    queryFn:  () => serviciosApi.internalTechnicians.visitsToday(technician.id),
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-md" data-testid="internal-technician-visits-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('technicians.internal.visitsModal.title', { nombre: technician.nombre })}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-slate-400 text-sm">{t('technicians.internal.visitsModal.loading')}</p>
          ) : visits.length === 0 ? (
            <p className="text-slate-400 text-sm">{t('technicians.internal.visitsModal.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visits.map(v => (
                <li key={v.ticket_id}>
                  <button
                    type="button"
                    onClick={() => goToTicket(v.ticket_id)}
                    className="w-full flex items-start gap-3 rounded-lg bg-slate-50 dark:bg-slate-900 p-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span className="text-sm font-bold text-primary whitespace-nowrap">{v.hora}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{v.cliente}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{v.numero}</span>
                      {v.descripcion && <span className="block text-xs text-slate-400 truncate">{v.descripcion}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
