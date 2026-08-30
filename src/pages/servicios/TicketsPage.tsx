import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import TicketFiltersBar, { EMPTY_TICKET_FILTERS } from '@/components/servicios/TicketFiltersBar'
import type { TicketFilterState } from '@/components/servicios/TicketFiltersBar'
import TicketTable from '@/components/servicios/TicketTable'
import TicketBoard from '@/components/servicios/TicketBoard'
import TicketStatCards from '@/components/servicios/TicketStatCards'
import TicketDetailModal from '@/components/servicios/TicketDetailModal'
import TicketScheduleModal from '@/components/servicios/TicketScheduleModal'
import TicketCreateModal from '@/components/servicios/TicketCreateModal'
import { IcoPlus } from '@/components/icons'
import { TICKET_STATUSES } from '@/types/servicios'
import type { Ticket } from '@/types/servicios'

type ViewMode = 'table' | 'board'

// REQ-216→221 (Batch 1) — solo Aaron/Líder de Servicios puede cambiar estado (select inline o
// drag-and-drop, REQ-218/221). superadmin incluido como bypass (mismo criterio que el resto de
// la app, ver Sidebar.tsx `isGerencia`). Vendedor/Diseñador (y cualquier otro rol con acceso de
// solo lectura al módulo) ve el panel completo pero sin poder ejecutar el cambio.
function canEditTicketStatus(role: string | undefined): boolean {
  return role === 'lider_servicios' || role === 'superadmin'
}

// REQ-245 RN4 — Aaron/Líder de Servicios, superadmin, Gerencia (`management`) y Vendedor/Diseñador
// pueden reportar un ticket nuevo — técnico interno/garantías NO tienen este botón disponible
// (mismo criterio que el backend, `role:` en routes/servicios.php, más angosto que servicios.write).
function canCreateTicket(role: string | undefined): boolean {
  return role === 'lider_servicios' || role === 'superadmin' || role === 'management' || role === 'vendedor_disenador'
}

// REQ-216 — orden por defecto: primero "Reportado" sin agendar, luego el resto por fecha de
// reporte más reciente primero.
function sortTickets(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort((a, b) => {
    const aUnscheduled = a.scheduled_at === null
    const bUnscheduled = b.scheduled_at === null
    if (aUnscheduled !== bUnscheduled) return aUnscheduled ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

// REQ-217 — buscador "contiene", case-insensitive, sobre N° ticket/cliente/técnico a la vez.
// Aplicado client-side (ver nota de contrato en el reporte de esta tarea): el backend no estaba
// disponible para confirmar si `search` también matchea nombre de técnico del lado servidor, y
// hacerlo acá evita depender de ese detalle de implementación mientras se reconcilia con Backend
// Dev. tipo/técnico/estado sí viajan como filtro estructurado a la API.
function matchesSearch(ticket: Ticket, search: string): boolean {
  if (!search) return true
  const q = search.trim().toLowerCase()
  if (q === '') return true
  const technicianName = ticket.internal_technician
    ? `${ticket.internal_technician.first_name} ${ticket.internal_technician.last_name}`.toLowerCase()
    : ''
  return ticket.numero.toLowerCase().includes(q)
    || (ticket.cliente ?? '').toLowerCase().includes(q)
    || technicianName.includes(q)
}

export default function TicketsPage() {
  const { t }    = useTranslation(['servicios', 'common'])
  const user     = useAuthStore(s => s.user)
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [view, setView]       = useState<ViewMode>('table')
  // SCRUM-170 (Gerencia → Salud Servicios): "Sin responder"/"Completados este mes"
  // navegan acá con ?estado=reported/resolved — antes se ignoraba, `filters` siempre
  // arrancaba vacío sin importar la URL.
  const [filters, setFilters] = useState<TicketFilterState>(() => {
    const raw = searchParams.get('estado')
    const estado = raw !== null && (TICKET_STATUSES as string[]).includes(raw) ? raw as Ticket['estado'] : ''
    return { ...EMPTY_TICKET_FILTERS, estado }
  })
  // REQ-210 RN5 (panel Pendientes de Inicio) — "acción para ir directo al ticket relacionado,
  // mismo patrón de navegación usado en el resto del módulo": deep-link `?ticket=<id>` que abre el
  // mismo TicketDetailModal que el resto de la pantalla (clic en tabla/tablero), no un modal aparte.
  const [initialTicketId] = useState<number | null>(() => {
    const raw = searchParams.get('ticket')
    return raw ? Number(raw) : null
  })
  const [detailTicketId, setDetailTicketId] = useState<number | null>(initialTicketId)
  // REQ-286 RN2 — la Biblioteca de Reportes agrega `&doc=inspection_report|claim_sheet` al
  // deep-link para que el documento se abra directo (el criterio pide "navega directo al Informe o
  // Hoja de Reclamo", no al ticket contenedor). Se lee una sola vez al montar, igual que `ticket`.
  const [initialDoc] = useState<'inspection_report' | 'claim_sheet' | undefined>(() => {
    const raw = searchParams.get('doc')
    return raw === 'inspection_report' || raw === 'claim_sheet' ? raw : undefined
  })
  const [scheduleTicket, setScheduleTicket] = useState<Ticket | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  // SCRUM-781 — "Generar cotización"/"Generar informe" en Lista/Tablero abren el mismo
  // TicketDetailModal ya en `initialDoc` (REQ-286), directo al documento pedido.
  const [pendingDoc, setPendingDoc] = useState<'inspection_report' | 'quote' | undefined>(undefined)

  function openQuote(ticketId: number) {
    setPendingDoc('quote')
    setDetailTicketId(ticketId)
  }

  function openReport(ticketId: number) {
    setPendingDoc('inspection_report')
    setDetailTicketId(ticketId)
  }

  // "Ver detalle" (ojo) no debe arrastrar un pendingDoc de un click anterior sobre otro ticket.
  function openDetail(ticketId: number) {
    setPendingDoc(undefined)
    setDetailTicketId(ticketId)
  }

  const canEdit   = canEditTicketStatus(user?.role)
  const canCreate = canCreateTicket(user?.role)

  const { data: technicians = [] } = useQuery({
    queryKey: ['servicios-technicians-internal-options'],
    queryFn:  () => serviciosApi.technicians.internalOptions(),
  })

  const { data: rawTickets = [], isLoading } = useQuery({
    queryKey: ['servicios-tickets', filters.tipo, filters.internal_technician_id, filters.estado],
    queryFn:  () => serviciosApi.tickets.list({
      tipo:        filters.tipo || undefined,
      tecnico_id:  filters.internal_technician_id || undefined,
      estado:      filters.estado || undefined,
    }),
  })

  const visibleTickets = useMemo(
    () => sortTickets(rawTickets.filter(ticket => matchesSearch(ticket, filters.search))),
    [rawTickets, filters.search],
  )

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('tickets.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
            <Button
              variant="secondary" active={view === 'table'} className="!rounded-none !border-0"
              onClick={() => setView('table')}
            >
              {t('tickets.views.table')}
            </Button>
            <Button
              variant="secondary" active={view === 'board'} className="!rounded-none !border-0"
              onClick={() => setView('board')}
            >
              {t('tickets.views.board')}
            </Button>
          </div>
          {/* REQ-223 RN2 (SCRUM-286) — "Ver cotizaciones" navega a Historial de cotizaciones
              (REQ-250/SCRUM-313). Estuvo deshabilitado con tooltip mientras Cotización de Servicio
              no existía (Batch 11-12) — ver docs/architecture/servicios-fase4-diseno.md sección 8;
              ambos batches ya cerraron, el botón navega de verdad desde acá. */}
          <Button
            variant="secondary"
            onClick={() => navigate('/servicios/cotizaciones')}
            className="!inline-flex !items-center !gap-1.5"
          >
            {t('tickets.quotesHistory.button')}
          </Button>
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)} className="!inline-flex !items-center !gap-1.5">
              <IcoPlus size={14} />
              {t('tickets.create.newTicket')}
            </Button>
          )}
        </div>
      </div>

      <TicketStatCards />

      <TicketFiltersBar
        value={filters}
        onChange={setFilters}
        technicians={technicians}
        shown={visibleTickets.length}
        total={rawTickets.length}
      />

      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
      ) : view === 'table' ? (
        <TicketTable
          tickets={visibleTickets} canEditStatus={canEdit}
          onViewDetail={openDetail} onSchedule={setScheduleTicket}
          onOpenQuote={openQuote} onOpenReport={openReport}
        />
      ) : (
        <TicketBoard
          tickets={visibleTickets} canDrag={canEdit}
          onViewDetail={openDetail} onSchedule={setScheduleTicket}
          onOpenQuote={openQuote} onOpenReport={openReport}
        />
      )}

      {detailTicketId !== null && (
        <TicketDetailModal
          key={detailTicketId}
          ticketId={detailTicketId}
          canEdit={canEdit}
          onClose={() => setDetailTicketId(null)}
          initialDoc={detailTicketId === initialTicketId ? initialDoc : pendingDoc}
        />
      )}

      {createOpen && (
        <TicketCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(ticketId) => {
            setCreateOpen(false)
            openDetail(ticketId)
          }}
        />
      )}

      {scheduleTicket && (
        <TicketScheduleModal
          ticketId={scheduleTicket.id}
          tipo={scheduleTicket.tipo}
          isReschedule={scheduleTicket.scheduled_at !== null}
          onClose={() => setScheduleTicket(null)}
          onScheduled={() => {
            setScheduleTicket(null)
            void qc.invalidateQueries({ queryKey: ['servicios-tickets'] })
            void qc.invalidateQueries({ queryKey: ['servicios-tickets-stats'] })
          }}
        />
      )}
    </>
  )
}
