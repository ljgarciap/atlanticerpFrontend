import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { Button } from '@/components/ui/Button'
import ServiceQuotePdfViewerModal from '@/components/servicios/ServiceQuotePdfViewerModal'
import { IcoEye } from '@/components/icons'
import type { ServiceQuoteGlobalHistoryEntry, ServiceQuoteStatus } from '@/types/servicios'

type StatusChip = ServiceQuoteStatus | ''

const CHIP_STATUSES: ServiceQuoteStatus[] = ['draft', 'sent', 'approved', 'rejected']

const ESTADO_BADGE: Record<string, string> = {
  draft:    'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  sent:     'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

// REQ-250 RN — el backend no expone búsqueda de texto en GET /servicios/quotes (solo `?estado=`,
// ver ServiceQuoteController::globalIndex()); mismo criterio ya usado en TicketsPage (REQ-217) —
// filtro de texto aplicado client-side sobre N° cotización/N° ticket/cliente, `estado` sí viaja
// como filtro estructurado a la API (afecta también los conteos de los chips).
function matchesSearch(entry: ServiceQuoteGlobalHistoryEntry, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (q === '') return true
  return entry.numero.toLowerCase().includes(q)
    || (entry.ticket?.numero ?? '').toLowerCase().includes(q)
    || (entry.ticket?.cliente ?? '').toLowerCase().includes(q)
}

// Fase 4 — Servicios, resto del Batch 12 (REQ-250, SCRUM-313). Historial global de cotizaciones,
// transversal a todo el equipo — incluye TODAS las versiones (incluidas las reemplazadas), mismo
// criterio que el historial por ticket de ServiceQuoteModal (REQ-236). "Acceso directo a la
// cotización" = mismo documento formal que REQ-235/236, abierto en pantalla vía
// `ServiceQuotePdfViewerModal` (no hay una vista JSON de solo lectura para una versión puntual —
// ver docblock de `ServiceQuoteController::document()` en el backend, que reusa el mismo endpoint
// para las 3 rutas de acceso).
//
// Entrypoint: botón "Ver cotizaciones" en TicketsPage (REQ-223 RN2, antes deshabilitado a
// propósito hasta que existiera este batch) + ítem "Cotizaciones" en el sidebar (SCRUM-774).
export default function ServiceQuotesHistoryPage() {
  const { t } = useTranslation('servicios')
  const [chip, setChip]                 = useState<StatusChip>('')
  const [search, setSearch]             = useState('')
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [pdfViewer, setPdfViewer]       = useState<{ url: string; numero: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-quotes-history', chip],
    queryFn:  () => serviciosApi.serviceQuotes.globalHistory(chip || undefined),
  })

  const entries = data?.data ?? []
  const counts  = data?.counts ?? { all: 0, draft: 0, sent: 0, approved: 0, rejected: 0 }

  const visible = useMemo(() => entries.filter(e => matchesSearch(e, search)), [entries, search])

  async function viewDocument(entry: ServiceQuoteGlobalHistoryEntry) {
    if (entry.ticket === null) return
    setDownloadingId(entry.id)
    try {
      const blob = await serviciosApi.serviceQuotes.document(entry.ticket.id, entry.id)
      setPdfViewer({ url: URL.createObjectURL(blob), numero: entry.numero })
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('tickets.quotesHistory.title')}</h1>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap gap-2 items-center mb-3">
        <input
          type="text"
          placeholder={t('tickets.quotesHistory.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />

        {/* REQ-250 RN — chips de estado con conteo en tiempo real, mismo patrón visual ya usado en
            ExternalTechniciansPage (Button variant="secondary" active + conteo). */}
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
          <Button variant="secondary" active={chip === ''} className="!rounded-none !border-0" onClick={() => setChip('')}>
            {t('tickets.quotesHistory.chips.all')} ({counts.all})
          </Button>
          {CHIP_STATUSES.map(status => (
            <Button
              key={status} variant="secondary" active={chip === status} className="!rounded-none !border-0"
              onClick={() => setChip(status)}
            >
              {t(`tickets.quote.${status}`)} ({counts[status]})
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('tickets.quotesHistory.table.loading')}</p>
      ) : visible.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
          <p className="text-slate-400 text-sm">{t('tickets.quotesHistory.table.empty')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">{t('tickets.quotesHistory.table.columns.numero')}</th>
                  <th className="px-3 py-2">{t('tickets.quotesHistory.table.columns.ticket')}</th>
                  <th className="px-3 py-2">{t('tickets.quotesHistory.table.columns.cliente')}</th>
                  <th className="px-3 py-2">{t('tickets.quotesHistory.table.columns.fecha')}</th>
                  <th className="px-3 py-2">{t('tickets.quotesHistory.table.columns.total')}</th>
                  <th className="px-3 py-2">{t('tickets.quotesHistory.table.columns.estado')}</th>
                  <th className="px-3 py-2 text-right">{t('tickets.quotesHistory.table.columns.detail')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(entry => (
                  <tr key={entry.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {entry.numero}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{entry.ticket?.numero ?? '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{entry.ticket?.cliente ?? '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(entry.created_at)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">${entry.total.toLocaleString()}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${ESTADO_BADGE[entry.estado]}`}>
                        {t(`tickets.quote.${entry.estado}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => void viewDocument(entry)}
                        disabled={entry.ticket === null || downloadingId === entry.id}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 disabled:opacity-50"
                        aria-label={t('tickets.quotesHistory.table.columns.detail')}
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
      )}

      {pdfViewer && (
        <ServiceQuotePdfViewerModal
          blobUrl={pdfViewer.url}
          numero={pdfViewer.numero}
          onClose={() => setPdfViewer(null)}
        />
      )}
    </>
  )
}
