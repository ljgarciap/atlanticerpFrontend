import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { TICKET_STATUSES } from '@/types/servicios'
import type { Ticket, TicketStatus, TicketCloseBlockedResponse } from '@/types/servicios'
import TicketCancelModal from './TicketCancelModal'

interface Props {
  ticket:  Ticket
  canEdit: boolean
  compact?: boolean
}

// REQ-218 — el gate más importante del batch. El select llama al mismo endpoint que el
// drag-and-drop del Tablero (TicketBoard.tsx). Antes de resolved/closed el backend valida
// cotización+informe; si bloquea (422), este componente vuelve el valor al estado anterior y
// muestra el mensaje específico devuelto por el backend — nunca un genérico.
//
// SCRUM-781 (punto 2, REQ-227 RN6) — "cancelled" ya no llama a changeStatus() directo: reusa el
// mismo TicketCancelModal del botón "Cancelar" explícito (motivo obligatorio, mismo endpoint
// dedicado `tickets.cancel()`), para que este punto de entrada quede con la misma validación que
// el botón, en vez de dejar cancelar sin motivo por acá.
export default function TicketStatusSelect({ ticket, canEdit, compact }: Props) {
  const { t }  = useTranslation('servicios')
  const qc     = useQueryClient()
  const [value, setValue] = useState<TicketStatus>(ticket.estado)
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)

  // El ticket puede refrescar por invalidación de query (ej. otro usuario lo cambió) —
  // mantener el select sincronizado con la fuente de verdad.
  useEffect(() => { setValue(ticket.estado) }, [ticket.estado])

  const mutation = useMutation({
    mutationFn: (estado: TicketStatus) => serviciosApi.tickets.changeStatus(ticket.id, estado),
    onSuccess: () => {
      setError(null)
      void qc.invalidateQueries({ queryKey: ['servicios-tickets'] })
    },
    onError: (err) => {
      // Rollback — vuelve al valor previo del backend, no al último intentado.
      setValue(ticket.estado)
      const msg = isAxiosError(err) && err.response?.status === 422
        ? (err.response.data as TicketCloseBlockedResponse | undefined)?.message
        : undefined
      setError(msg ?? t('tickets.status.changeError'))
    },
  })

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TicketStatus
    if (next === 'cancelled') {
      // No se aplica todavía — el select vuelve visualmente al estado real mientras se pide el
      // motivo; TicketCancelModal es quien de verdad completa (o descarta) la transición.
      setCancelOpen(true)
      return
    }
    setError(null)
    setValue(next)
    mutation.mutate(next)
  }

  return (
    <div>
      <select
        aria-label={t('tickets.table.columns.status')}
        value={value}
        disabled={!canEdit || mutation.isPending}
        onChange={handleChange}
        title={!canEdit ? t('tickets.status.readOnlyTooltip') : undefined}
        className={[
          'rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800',
          'text-slate-700 dark:text-slate-200 focus:outline-none focus:border-primary',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          compact ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-sm',
        ].join(' ')}
      >
        {TICKET_STATUSES.map(s => (
          <option key={s} value={s}>{t(`tickets.statuses.${s}`)}</option>
        ))}
      </select>
      {error && <p className="text-red-600 text-[11px] mt-1 max-w-[180px]">{error}</p>}

      {cancelOpen && (
        <TicketCancelModal
          ticketId={ticket.id}
          numero={ticket.numero}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => {
            setCancelOpen(false)
            setError(null)
            setValue('cancelled')
            void qc.invalidateQueries({ queryKey: ['servicios-tickets'] })
          }}
        />
      )}
    </div>
  )
}
