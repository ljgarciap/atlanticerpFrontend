import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { PIPELINE_STAGES } from '@/types/ventasDiseno'
import type { PipelineStage } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { IcoEye } from '@/components/icons'
import QuoteViewerModal from '@/components/QuoteViewerModal'

const LISTED_STAGES: PipelineStage[] = ['quote', 'proposal', 'approved', 'lost']

function monthName(mes: string): string {
  const [y, m] = mes.split('-')
  const label = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][Number(m)] ?? mes
  return `${label} ${y}`
}

export default function VentasDisenoQuotesListPage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canSeeTeam = user?.role === 'management' || user?.role === 'superadmin'

  const [scope,  setScope]  = useState<'own' | 'team'>('own')
  const [search, setSearch] = useState('')
  const [stage,  setStage]  = useState<PipelineStage | ''>('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  // SCRUM-734 — "Ver cotizaciones de este proyecto" desde Pipeline navega acá con
  // ?viewQuote=<id> para reutilizar exactamente este mismo modal, sin mecanismo aparte.
  const [searchParams] = useSearchParams()
  const viewQuoteParam = searchParams.get('viewQuote')
  const [viewingId, setViewingId] = useState<number | null>(viewQuoteParam ? Number(viewQuoteParam) : null)
  // SCRUM-166 RN3 (Gerencia → "Monto cotizado en el mes"): llega con ?mes=YYYY-MM.
  // El endpoint /ventas-diseno/quotes no tiene filtro de fecha (confirmado — solo
  // scope/owner_id/stage/search/page/per_page) — se filtra client-side por
  // `quote_date`, mismo criterio ya usado en Pipeline (client-side hasta 500 filas,
  // ver comentario en ventasDisenoApi.ts). Cuando hay mes activo, se trae todo con
  // per_page:'all' para no perder filas fuera de la página actual.
  const [mes] = useState<string | null>(() => searchParams.get('mes'))

  const { data: result, isLoading } = useQuery({
    queryKey: ['ventas-diseno-quotes-list', scope, search, stage, page, perPage, mes],
    queryFn:  () => ventasDisenoApi.quotes.list({
      scope, search: search || undefined, stage: stage || undefined,
      page: mes ? 1 : page, per_page: mes ? 'all' : perPage,
    }),
  })

  const summary = result?.summary
  const rows    = mes ? (result?.data ?? []).filter(r => r.quote_date.startsWith(mes)) : (result?.data ?? [])

  function clearFilters() {
    setSearch('')
    setStage('')
    setPage(1)
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:quotesList.title')}
          </h1>
          {mes && (
            <p className="text-xs text-slate-400 mt-0.5">Filtrado por {monthName(mes)}</p>
          )}
        </div>
        <div className="flex gap-2">
          {/* SCRUM-741 — habilitado: mismo patrón ya vigente en ClientsPage/PipelinePage
              desde SCRUM-700 (el disabled de SCRUM-711 nunca se quitó acá). */}
          <Button variant="secondary" onClick={() => navigate('/ventas-diseno/catalog')}>
            {t('ventasDiseno:kanban.actions.catalog')}
          </Button>
          <Button onClick={() => navigate('/ventas-diseno/quotes')}>
            {t('ventasDiseno:quotesList.newQuote')}
          </Button>
        </div>
      </div>

      {canSeeTeam && (
        <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <Button
              variant="secondary" active={scope === 'own'} activeVariant="primary"
              className="!rounded-none !border-0" onClick={() => { setScope('own'); setPage(1) }}
            >
              {t('ventasDiseno:scope.own')}
            </Button>
            <Button
              variant="secondary" active={scope === 'team'} activeVariant="primary"
              className="!rounded-none !border-0" onClick={() => { setScope('team'); setPage(1) }}
            >
              {t('ventasDiseno:scope.team')}
            </Button>
          </div>
        </Card>
      )}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <Card variant="panel" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:quotesList.summary.pending')}</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">${summary.pending_amount.toLocaleString()}</div>
          </Card>
          <Card variant="panel" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:quotesList.summary.approved')}</div>
            <div className="text-xl font-bold text-emerald-600">${summary.approved_amount.toLocaleString()} <span className="text-sm text-slate-400 font-normal">({summary.approved_count})</span></div>
          </Card>
          <Card variant="panel" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:quotesList.summary.lost')}</div>
            <div className="text-xl font-bold text-red-500">${summary.lost_amount.toLocaleString()} <span className="text-sm text-slate-400 font-normal">({summary.lost_count})</span></div>
          </Card>
          <Card variant="panel" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{t('ventasDiseno:quotesList.summary.conversion')}</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{summary.conversion_rate}%</div>
          </Card>
        </div>
      )}

      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
        <input
          type="text" placeholder={t('ventasDiseno:quotesList.filters.searchPlaceholder')}
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
        <select
          value={stage} onChange={e => { setStage(e.target.value as PipelineStage | ''); setPage(1) }}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white focus:outline-none focus:border-[#5BA5A0]"
        >
          <option value="">{t('ventasDiseno:quotesList.filters.allStages')}</option>
          {LISTED_STAGES.map(s => (
            <option key={s} value={s}>{t(`ventasDiseno:stages.${s}`)}</option>
          ))}
        </select>
        {(search || stage) && (
          <Button variant="secondary" onClick={clearFilters}>{t('ventasDiseno:quotesList.filters.clear')}</Button>
        )}
      </Card>

      {result?.fuzzy && (
        <div className="mb-3 px-3 py-2 rounded-lg border text-[12px] font-medium bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300">
          {t('ventasDiseno:quotesList.filters.approximate')}
        </div>
      )}

      <Card variant="panel" className="p-0 overflow-hidden">
        {isLoading ? (
          <p className="text-slate-400 text-sm p-4">{t('common:labels.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400 text-sm p-4">{t('ventasDiseno:quotesList.table.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">{t('ventasDiseno:quotesList.table.folio')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:quotesList.table.masterClient')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:quotesList.table.subClient')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:quotesList.table.project')}</th>
                  <th className="px-3 py-2 text-right">{t('ventasDiseno:quotesList.table.amount')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:quotesList.table.stage')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:quotesList.table.priceType')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:quotesList.table.owner')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:quotesList.table.date')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:quotesList.table.status')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:quotesList.table.action')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const stageMeta = PIPELINE_STAGES.find(s => s.id === row.stage)
                  return (
                    <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 font-medium">{row.folio ?? '—'}</td>
                      <td className="px-3 py-2">{row.master_client?.name ?? '—'}</td>
                      <td className="px-3 py-2">{row.sub_client?.business_name ?? '—'}</td>
                      <td className="px-3 py-2">{row.sales_project?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-right">${row.amount.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        {row.stage ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: stageMeta?.color }} />
                            {t(`ventasDiseno:stages.${row.stage}`)}
                          </span>
                        ) : t('ventasDiseno:quotesList.table.noStage')}
                      </td>
                      <td className="px-3 py-2">{t(`ventasDiseno:priceType.${row.price_type}`)}</td>
                      <td className="px-3 py-2">{row.owner.name}</td>
                      <td className="px-3 py-2">{new Date(row.quote_date).toLocaleDateString()}</td>
                      <td className="px-3 py-2">{t(`ventasDiseno:quotesList.status.${row.document_status}`)}</td>
                      <td className="px-3 py-2">
                        {/* SCRUM-796 (secc. 13, RN3.1 — corrección de una definición anterior
                            de PM): "Usar como base para nueva versión" ya NO existe como atajo
                            de fila acá. La creación de una nueva versión se gestiona únicamente
                            desde el modal de detalle (QuoteViewerModal, secc. 12/15). */}
                        <button
                          title={t('ventasDiseno:quotesList.table.view')}
                          onClick={() => setViewingId(row.id)}
                          className="text-slate-400 hover:text-[#5BA5A0]"
                        >
                          <IcoEye size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {result?.meta && !mes && (
        <Pagination
          meta={result.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={p => { setPerPage(p); setPage(1) }}
        />
      )}

      {viewingId !== null && (
        <QuoteViewerModal quoteId={viewingId} onClose={() => setViewingId(null)} />
      )}
    </>
  )
}
