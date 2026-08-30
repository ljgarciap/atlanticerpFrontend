import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { TICKET_STATUSES, deriveQuoteDisplayStatus } from '@/types/servicios'
import type { Ticket, TicketStatus, TicketCloseBlockedResponse, TicketType } from '@/types/servicios'
import TechnicianBadge from './TechnicianBadge'
import { QuoteIndicator, InspectionReportIndicator } from './TicketIndicators'
import TicketCancelModal from './TicketCancelModal'
import { useToastStore } from '@/store/toastStore'
import { IcoEye } from '@/components/icons'

interface Props {
  tickets:      Ticket[]
  canDrag:      boolean
  onViewDetail: (id: number) => void
  onSchedule:   (ticket: Ticket) => void
  // SCRUM-781 — "Generar cotización"/"Generar informe" no abrían nada desde el Tablero (onOpen
  // nunca se pasaba); el informe ni siquiera se mostraba en la tarjeta. Mismo mecanismo que Lista.
  onOpenQuote:  (ticketId: number) => void
  onOpenReport: (ticketId: number) => void
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  reported:  '#94a3b8',
  scheduled: '#5BA5A0',
  on_site:   '#f59e0b',
  resolved:  '#10b981',
  closed:    '#334155',
  cancelled: '#ef4444',
}

const TYPE_COLORS: Record<TicketType, string> = {
  installation: '#5BA5A0',
  warranty:     '#9fc54d',
  claim:        '#ef4444',
  retrofit:     '#8b5cf6',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

interface CardProps {
  ticket:       Ticket
  canDrag:      boolean
  onViewDetail: (id: number) => void
  onSchedule:   (ticket: Ticket) => void
  onOpenQuote:  (ticketId: number) => void
  onOpenReport: (ticketId: number) => void
}

function TicketCard({ ticket, canDrag, onViewDetail, onSchedule, onOpenQuote, onOpenReport }: CardProps) {
  const { t } = useTranslation('servicios')
  return (
    // SCRUM-781 (Corrección visual #7, rebote Daniela 2026-08-20 sobre el fix anterior) — el badge
    // de tipo/subtipo y el número de ticket compartían una sola fila (`justify-between`); un badge
    // largo (ej. "Garantía · Garantía general") le dejaba tan poco ancho al número que truncaba a
    // "GAR-..." — el tooltip `title` del fix anterior lo hacía LEÍBLE al pasar el mouse, pero no
    // VISIBLE de entrada, que es lo que "no debe ocultar información" pide. Fix real: cada dato
    // vive en su propia fila (flex-col en vez de compartir ancho) — el badge nunca vuelve a
    // competir por espacio con el número, ninguno necesita truncar en el ancho real de la tarjeta.
    <div className="w-full min-w-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 mb-2 shadow-sm">
      <div className="flex justify-between items-center gap-2 mb-1">
        <span title={ticket.numero} className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate min-w-0">{ticket.numero}</span>
        <button
          type="button"
          title={t('tickets.table.viewDetail')}
          onClick={() => onViewDetail(ticket.id)}
          className="text-slate-400 hover:text-primary shrink-0"
        >
          <IcoEye size={13} />
        </button>
      </div>
      <div className="mb-1">
        <span
          className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white whitespace-nowrap max-w-full truncate align-bottom"
          style={{ background: TYPE_COLORS[ticket.tipo] }}
          title={`${t(`tickets.types.${ticket.tipo}`)}${ticket.subtipo ? ` · ${t(`tickets.subtypes.${ticket.subtipo}`)}` : ''}`}
        >
          {t(`tickets.types.${ticket.tipo}`)}{ticket.subtipo ? ` · ${t(`tickets.subtypes.${ticket.subtipo}`)}` : ''}
        </span>
      </div>
      <p title={ticket.cliente ?? undefined} className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate mb-1.5">{ticket.cliente}</p>
      <div className="flex items-center gap-3 mb-1.5">
        <QuoteIndicator
          status={deriveQuoteDisplayStatus(ticket.quote_status, ticket.inspection_report_status)}
          amount={ticket.quote_amount} showAmount
          onOpen={() => onOpenQuote(ticket.id)}
        />
        <InspectionReportIndicator
          status={ticket.inspection_report_status}
          onOpen={() => onOpenReport(ticket.id)}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <TechnicianBadge technician={ticket.internal_technician} size={20} />
        {ticket.scheduled_at ? (
          <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(ticket.scheduled_at)}</span>
        ) : canDrag ? (
          <button type="button" onClick={() => onSchedule(ticket)}
            className="text-[11px] font-semibold text-primary underline decoration-dotted">
            {t('tickets.actions.schedule')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

// REQ-221 — Vista Tablero (kanban), 6 columnas fijas desde el día 1. Arrastrar llama al mismo
// endpoint de cambio de estado que el select de la Tabla (REQ-218) — mismo gate: si el backend
// bloquea (422 antes de resolved/closed), no se aplica ningún cambio optimista de columna, así
// que la tarjeta simplemente permanece/vuelve a su columna de origen al re-renderizar desde la
// query (sin necesidad de lógica de rollback manual) y se muestra el mensaje específico vía toast.
export default function TicketBoard({ tickets, canDrag, onViewDetail, onSchedule, onOpenQuote, onOpenReport }: Props) {
  const { t }  = useTranslation('servicios')
  const qc     = useQueryClient()
  const toast  = useToastStore(s => s.show)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  // SCRUM-781 (punto 2, REQ-227 RN6) — arrastrar a "Cancelado" no llama a changeStatus() directo,
  // pide motivo primero (mismo TicketCancelModal que el botón explícito y el select de la Tabla).
  // Sin mutation.mutate() de por medio, la tarjeta vuelve sola a su columna de origen al
  // re-renderizar (mismo mecanismo ya usado para el bloqueo 422 — ver docblock más abajo).
  const [cancelTicket, setCancelTicket] = useState<Ticket | null>(null)

  const mutation = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: TicketStatus }) =>
      serviciosApi.tickets.changeStatus(id, estado),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['servicios-tickets'] })
    },
    onError: (err) => {
      const msg = isAxiosError(err) && err.response?.status === 422
        ? (err.response.data as TicketCloseBlockedResponse | undefined)?.message
        : undefined
      toast(msg ?? t('tickets.status.changeError'), 'error')
    },
    onSettled: () => setDraggingId(null),
  })

  function handleDragEnd(result: DropResult) {
    const { draggableId, destination } = result
    if (!destination || !canDrag) return

    const newEstado = destination.droppableId as TicketStatus
    const ticket = tickets.find(t2 => String(t2.id) === draggableId)
    if (!ticket || ticket.estado === newEstado) return

    if (newEstado === 'cancelled') {
      setCancelTicket(ticket)
      return
    }

    setDraggingId(ticket.id)
    mutation.mutate({ id: ticket.id, estado: newEstado })
  }

  return (
    <div className="overflow-x-auto pb-2">
      <DragDropContext onDragEnd={handleDragEnd}>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${TICKET_STATUSES.length}, minmax(260px, 1fr))` }}
          data-testid="ticket-board"
        >
          {TICKET_STATUSES.map(status => {
            const cols = tickets.filter(t2 => t2.estado === status)
            return (
              <div key={status} className="bg-slate-100 dark:bg-slate-900 rounded-xl p-2.5 min-h-[200px] flex flex-col">
                <div className="flex justify-between items-center pb-2.5 mb-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                    <span className="text-xs font-semibold" style={{ color: STATUS_COLORS[status] }}>
                      {t(`tickets.board.columns.${status}`)}
                    </span>
                  </div>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full bg-white dark:bg-slate-800"
                    style={{ color: STATUS_COLORS[status] }}
                  >
                    {cols.length}
                  </span>
                </div>

                <Droppable droppableId={status} isDropDisabled={!canDrag}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 rounded-lg transition-colors ${snapshot.isDraggingOver ? 'bg-slate-200 dark:bg-slate-700' : ''}`}
                    >
                      {cols.length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-center text-[12px] text-slate-400 py-8">{t('tickets.board.empty')}</p>
                      )}

                      {cols.map((ticket, index) => (
                        <Draggable
                          key={ticket.id}
                          draggableId={String(ticket.id)}
                          index={index}
                          isDragDisabled={!canDrag || mutation.isPending}
                        >
                          {(drag, dragSnapshot) => (
                            <div
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              {...(canDrag ? drag.dragHandleProps : {})}
                              style={{
                                ...drag.draggableProps.style,
                                opacity: dragSnapshot.isDragging || draggingId === ticket.id ? 0.85 : 1,
                              }}
                            >
                              <TicketCard
                                ticket={ticket} canDrag={canDrag} onViewDetail={onViewDetail} onSchedule={onSchedule}
                                onOpenQuote={onOpenQuote} onOpenReport={onOpenReport}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}

                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      {cancelTicket && (
        <TicketCancelModal
          ticketId={cancelTicket.id}
          numero={cancelTicket.numero}
          onClose={() => setCancelTicket(null)}
          onCancelled={() => {
            setCancelTicket(null)
            void qc.invalidateQueries({ queryKey: ['servicios-tickets'] })
          }}
        />
      )}
    </div>
  )
}
