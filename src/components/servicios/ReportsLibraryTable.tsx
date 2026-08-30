import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { IcoBook, IcoEye } from '@/components/icons'
import type { ReportsBibliotecaFilters, ReportsBibliotecaTipoDocumento, ReportsBibliotecaEstado } from '@/types/servicios'

const EMPTY_FILTERS: ReportsBibliotecaFilters = { search: '', tipo_documento: undefined, estado: undefined }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

/**
 * REQ-280 — "Biblioteca de documentos" (informes de inspección + hojas de reclamo, NUNCA
 * "documentos de satisfacción" — ese vocabulario del mockup viejo no existe en el dominio real,
 * ver docblock de ReportsPage.tsx). Reusa Pagination.tsx (política global de paginación,
 * memory/feedback_pagination_sorting_policy.md), no arma Anterior/Siguiente ad-hoc.
 *
 * Búsqueda: input local + commit a query state on Enter/botón (mismo patrón `handleSearch` que
 * UsersPage.tsx) — evita un fetch por tecla. Los selects de tipo/estado disparan fetch inmediato,
 * sin debounce (no existe ese hook en el proyecto todavía).
 */
export default function ReportsLibraryTable() {
  const { t } = useTranslation('servicios')
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<ReportsBibliotecaFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data, isFetching } = useQuery({
    queryKey: ['servicios-reports-biblioteca', filters, page, perPage],
    queryFn:  () => serviciosApi.reportes.biblioteca({
      ...filters,
      page,
      per_page: perPage === 'all' ? undefined : perPage,
    }),
  })

  const items = data?.data ?? []
  const meta  = data?.meta

  function handleSearch() {
    setFilters(f => ({ ...f, search }))
    setPage(1)
  }

  function handleTipoChange(value: string) {
    setFilters(f => ({ ...f, tipo_documento: (value || undefined) as ReportsBibliotecaTipoDocumento | undefined }))
    setPage(1)
  }

  function handleEstadoChange(value: string) {
    setFilters(f => ({ ...f, estado: (value || undefined) as ReportsBibliotecaEstado | undefined }))
    setPage(1)
  }

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <IcoBook size={16} className="text-slate-400" />
        <div className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t('reports.library.title')}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('reports.library.searchPlaceholder')}
          className="flex-1 min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        <Button variant="outline" onClick={handleSearch}>{t('common:actions.search')}</Button>

        <select
          aria-label={t('reports.library.columns.tipo')}
          value={filters.tipo_documento ?? ''}
          onChange={e => handleTipoChange(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-2 py-2 text-sm bg-white focus:outline-none focus:border-primary"
        >
          <option value="">{t('reports.library.allTypes')}</option>
          <option value="inspection_report">{t('reports.library.type.inspection_report')}</option>
          <option value="claim_sheet">{t('reports.library.type.claim_sheet')}</option>
        </select>

        <select
          aria-label={t('reports.library.columns.estado')}
          value={filters.estado ?? ''}
          onChange={e => handleEstadoChange(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-2 py-2 text-sm bg-white focus:outline-none focus:border-primary"
        >
          <option value="">{t('reports.library.allStatuses')}</option>
          <option value="pending">{t('reports.library.status.pending')}</option>
          <option value="completed">{t('reports.library.status.completed')}</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2">{t('reports.library.columns.ticket')}</th>
              <th className="px-3 py-2">{t('reports.library.columns.cliente')}</th>
              <th className="px-3 py-2">{t('reports.library.columns.tipo')}</th>
              <th className="px-3 py-2">{t('reports.library.columns.tecnico')}</th>
              <th className="px-3 py-2">{t('reports.library.columns.fecha')}</th>
              <th className="px-3 py-2">{t('reports.library.columns.estado')}</th>
              <th className="px-3 py-2 text-right">{t('reports.library.columns.detail')}</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">{t('reports.library.loading')}</td></tr>
            )}
            {!isFetching && items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">{t('reports.library.empty')}</td></tr>
            )}
            {items.map(item => (
              <tr key={`${item.tipo_documento}-${item.id}`} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {item.ticket_numero}
                </td>
                <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">{item.cliente ?? '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{t(`reports.library.type.${item.tipo_documento}`)}</td>
                <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">{item.tecnico ?? t('reports.library.unassigned')}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatDate(item.fecha)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{t(`reports.library.status.${item.estado}`)}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    title={t('reports.library.viewTicket')}
                    // RN2 — "clic navega al informe o a la hoja de reclamo de ese ticket, según su
                    // tipo": `doc` hace que TicketsPage abra directo el modal del documento, no
                    // solo el ticket contenedor (hallazgo de Pre-QA 2026-08-12).
                    onClick={() => navigate(`/servicios/tickets?ticket=${item.ticket_id}&doc=${item.tipo_documento}`)}
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

      {meta && (
        <Pagination
          meta={meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={p => { setPerPage(p); setPage(1) }}
        />
      )}
    </Card>
  )
}
