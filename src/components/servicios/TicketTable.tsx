import { useTranslation } from 'react-i18next'
import type { Ticket } from '@/types/servicios'
import { deriveQuoteDisplayStatus } from '@/types/servicios'
import TechnicianBadge from './TechnicianBadge'
import TicketStatusSelect from './TicketStatusSelect'
import { QuoteIndicator, InspectionReportIndicator } from './TicketIndicators'
import { IcoEye, IcoClock } from '@/components/icons'

interface Props {
  tickets:       Ticket[]
  canEditStatus: boolean
  onViewDetail:  (id: number) => void
  // REQ-226 RN1 — Agendar/Reagendar es exclusivo de lider_servicios/superadmin, mismo permiso
  // que canEditStatus (REQ-218 RN7) — se reusa el mismo flag, no uno nuevo.
  onSchedule:    (ticket: Ticket) => void
  // SCRUM-781 — "Generar cotización"/"Generar informe" no abrían nada (onOpen nunca se pasaba).
  onOpenQuote:   (ticketId: number) => void
  onOpenReport:  (ticketId: number) => void
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

// REQ-216 — Vista Tabla, listado principal. Orden por defecto (aplicado por el llamador, ver
// TicketsPage.tsx sortTickets()): primero "Reportado" sin agendar, luego el resto por fecha de
// reporte más reciente primero.
export default function TicketTable({ tickets, canEditStatus, onViewDetail, onSchedule, onOpenQuote, onOpenReport }: Props) {
  const { t } = useTranslation('servicios')

  if (tickets.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
        <p className="text-slate-400 text-sm">{t('tickets.table.empty')}</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2">{t('tickets.table.columns.numero')}</th>
              <th className="px-3 py-2">{t('tickets.table.columns.client')}</th>
              <th className="px-3 py-2">{t('tickets.table.columns.type')}</th>
              <th className="px-3 py-2">{t('tickets.table.columns.subtype')}</th>
              <th className="px-3 py-2">{t('tickets.table.columns.technician')}</th>
              <th className="px-3 py-2">{t('tickets.table.columns.status')}</th>
              <th className="px-3 py-2">{t('tickets.table.columns.quote')}</th>
              <th className="px-3 py-2">{t('tickets.table.columns.inspectionReport')}</th>
              <th className="px-3 py-2">{t('tickets.table.columns.reported')}</th>
              <th className="px-3 py-2">{t('tickets.table.columns.scheduled')}</th>
              <th className="px-3 py-2 text-right">{t('tickets.table.columns.detail')}</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map(ticket => (
              <tr key={ticket.id} className="border-b border-slate-100 dark:border-slate-800 align-top">
                <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {ticket.numero}
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-slate-800 dark:text-slate-100">{ticket.cliente}</div>
                  {ticket.descripcion && (
                    <div className="text-[12px] text-slate-400 max-w-[220px] truncate">{ticket.descripcion}</div>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{t(`tickets.types.${ticket.tipo}`)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {ticket.subtipo ? t(`tickets.subtypes.${ticket.subtipo}`) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <TechnicianBadge technician={ticket.internal_technician} />
                </td>
                <td className="px-3 py-2.5">
                  <TicketStatusSelect ticket={ticket} canEdit={canEditStatus} compact />
                </td>
                <td className="px-3 py-2.5">
                  <QuoteIndicator
                    status={deriveQuoteDisplayStatus(ticket.quote_status, ticket.inspection_report_status)}
                    onOpen={() => onOpenQuote(ticket.id)}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <InspectionReportIndicator
                    status={ticket.inspection_report_status}
                    onOpen={() => onOpenReport(ticket.id)}
                  />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                  {formatDate(ticket.created_at)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                  {ticket.scheduled_at ? (
                    <div className="flex items-center gap-1.5">
                      <span>{formatDate(ticket.scheduled_at)}</span>
                      {canEditStatus && (
                        <button
                          type="button"
                          title={t('tickets.actions.reschedule')}
                          onClick={() => onSchedule(ticket)}
                          className="text-primary hover:text-primary-dark"
                        >
                          <IcoClock size={13} />
                        </button>
                      )}
                    </div>
                  ) : canEditStatus ? (
                    <button
                      type="button"
                      onClick={() => onSchedule(ticket)}
                      className="text-[13px] font-semibold text-primary hover:text-primary-dark underline decoration-dotted"
                    >
                      {t('tickets.actions.schedule')}
                    </button>
                  ) : (
                    t('tickets.table.notScheduled')
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    title={t('tickets.table.viewDetail')}
                    onClick={() => onViewDetail(ticket.id)}
                    className="text-slate-500 hover:text-primary dark:text-slate-400"
                  >
                    <IcoEye size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
