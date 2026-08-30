import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useToastStore } from '@/store/toastStore'
import { PIPELINE_STAGES } from '@/types/ventasDiseno'
import type { PipelineStage } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { IcoDownload } from '@/components/icons'

type Tag = 'design' | 'quote' | 'both'
const TAGS: Tag[] = ['design', 'quote', 'both']

function fmtMoney(n: number | null): string {
  return n === null ? '—' : '$' + Math.round(n).toLocaleString('en-US')
}

function fmtArea(n: number | null): string {
  return n === null ? '—' : `${n} m²`
}

/**
 * SCRUM-690→694 (REQ-610→614, Batch D del Epic CRM SCRUM-332). Reemplaza el placeholder
 * "próximamente". A diferencia de PipelinePage (client-side, ≤500 filas), pagina desde el
 * backend (política global, App\Shared\Http\Pagination) — decisión de Luis 2026-07-31, ver
 * memory/project_epic_crm_scrum332_batcha_cerrado.md.
 */
export default function CrmProjectsListPage() {
  const { t: tCrm }    = useTranslation('crm')
  const { t: tVd }     = useTranslation('ventasDiseno')
  const { t: tCommon } = useTranslation('common')
  const navigate  = useNavigate()
  const showToast = useToastStore(s => s.show)

  const [search,   setSearch]   = useState('')
  const [scope,    setScope]    = useState<'own' | 'team'>('own')
  const [ownerId,  setOwnerId]  = useState<number | ''>('')
  const [stage,    setStage]    = useState<PipelineStage | ''>('')
  const [tag,      setTag]      = useState<Tag | ''>('')
  const [page,     setPage]     = useState(1)
  const [perPage,  setPerPage]  = useState<number | 'all'>(20)

  const filters = {
    search: search || undefined,
    scope,
    owner_id: scope === 'team' && ownerId !== '' ? ownerId : undefined,
    stage: stage || undefined,
    tag: tag || undefined,
    page,
    per_page: perPage,
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['ventas-diseno-projects-list', filters],
    queryFn:  () => ventasDisenoApi.projects.list(filters),
    // REQ-611 fix (SCRUM-691) — sin esto, cada tecla en el buscador cambia el queryKey a una
    // combinación sin caché, isLoading vuelve a true, y el `if (isLoading) return ...` de abajo
    // desmonta todo el árbol (incluido el <input>), perdiendo el foco en cada letra.
    placeholderData: keepPreviousData,
  })

  const exportMutation = useMutation({
    mutationFn: () => ventasDisenoApi.projects.exportCsv(filters),
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      showToast(message ?? tCommon('errors.generic'), 'error')
    },
  })

  const rows       = data?.data ?? []
  const meta       = data?.meta
  const canViewTeam = data?.can_view_team ?? false
  const owners     = data?.filters.owners ?? []

  const filtersActive = search !== '' || stage !== '' || tag !== '' || (scope === 'team' && ownerId !== '')
  const handleClearFilters = () => {
    setSearch(''); setStage(''); setTag(''); setOwnerId(''); setPage(1)
  }

  if (isLoading) {
    return <div className="text-sm text-slate-400 py-12 text-center">{tCommon('loading')}</div>
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-start justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{tCrm('projectsList.title')}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{tCrm('projectsList.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            loading={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
            className="inline-flex items-center gap-1.5"
          >
            <IcoDownload size={13} /> {tCrm('projectsList.actions.exportCsv')}
          </Button>
          <Button variant="primary" onClick={() => navigate('/ventas-diseno/pipeline?openNewProject=1')}>
            {tVd('kanban.actions.newProject')}
          </Button>
        </div>
      </div>

      {/* RN4 (REQ-611): el selector de Responsable solo tiene efecto real para
          Líder/Gerencia — can_view_team viene del propio backend (ProjectsListController),
          no de un heurístico de rol en el frontend. SCRUM-690 (pedido de Daniela 2026-08-03):
          alcance Inicio/Equipo (+ Responsable cuando aplica) arriba de los filtros, en su
          propia fila, en vez de mezclado con ellos. */}
      {canViewTeam && (
        <div className="flex flex-wrap gap-2 mb-2 items-center">
          <div className="flex gap-1">
            <Button
              variant="outline"
              active={scope === 'own'}
              className="!px-3 !py-1.5 !text-xs"
              onClick={() => { setScope('own'); setOwnerId(''); setPage(1) }}
            >
              {tVd('scope.own')}
            </Button>
            <Button
              variant="outline"
              active={scope === 'team'}
              className="!px-3 !py-1.5 !text-xs"
              onClick={() => { setScope('team'); setPage(1) }}
            >
              {tVd('scope.team')}
            </Button>
          </div>
          {scope === 'team' && (
            <select
              value={ownerId}
              onChange={e => { setOwnerId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">{tCrm('projectsList.filters.allOwners')}</option>
              {owners.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-2 items-center">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder={tCrm('projectsList.filters.searchPlaceholder')}
          className="flex-1 max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />

        <select
          value={stage}
          onChange={e => { setStage(e.target.value as PipelineStage | ''); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">{tCrm('projectsList.filters.allStages')}</option>
          {PIPELINE_STAGES.map(s => (
            <option key={s.id} value={s.id}>{tVd(`stages.${s.id}`)}</option>
          ))}
        </select>

        <select
          value={tag}
          onChange={e => { setTag(e.target.value as Tag | ''); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">{tCrm('projectsList.filters.allTags')}</option>
          {TAGS.map(tg => (
            // RN5 (REQ-610): mismas 3 etiquetas que Dashboard CRM (Batch C) — reusa
            // crm:dashboard.tagLabels en vez de duplicar el texto acá.
            <option key={tg} value={tg}>{tCrm(`dashboard.tagLabels.${tg}`)}</option>
          ))}
        </select>

        {filtersActive && (
          <Button variant="outline" onClick={handleClearFilters}>
            {tCrm('projectsList.filters.clear')}
          </Button>
        )}
      </div>

      <p className="text-xs text-slate-500 mb-3">
        {tCrm('projectsList.resultsCount', { count: meta?.total ?? 0 })}
      </p>

      <Card variant="panel" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {(['project', 'client', 'stage', 'tag', 'owner', 'value', 'area', 'daysInStage', 'delivery', 'files'] as const).map(col => (
                <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {tCrm(`projectsList.table.${col}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {tCrm('projectsList.table.empty')}
                </td>
              </tr>
            )}
            {rows.map(row => {
              const stageMeta = PIPELINE_STAGES.find(s => s.id === row.stage)
              return (
                // REQ-612: clic en cualquier parte de la fila navega a Pipeline con la
                // tarjeta resaltada — mismo mecanismo (?card=) que REQ-022/065 desde Clientes.
                <tr
                  key={row.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/ventas-diseno/pipeline?card=${row.id}`)}
                >
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.sales_project.name}</td>
                  <td className="px-4 py-3 text-slate-600">{row.master_client?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: stageMeta?.color }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: stageMeta?.color }} />
                      {tVd(`stages.${row.stage}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.sales_project.tag ? tCrm(`dashboard.tagLabels.${row.sales_project.tag}`) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.owner.name}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtMoney(row.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtArea(row.worked_area_m2)}</td>
                  <td className="px-4 py-3 text-slate-600">{row.days_in_stage}</td>
                  <td className="px-4 py-3 text-slate-600">{row.next_delivery_date ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.files_count}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {meta && (
        <>
          <Pagination
            meta={meta}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            {tCrm('projectsList.totalCount', { count: data?.total_unfiltered ?? 0 })}
          </p>
        </>
      )}
    </div>
  )
}
