import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { SubClientCategory, ClientListRow } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import CreateClientModal from '@/components/CreateClientModal'
import ClientDetailModal from '@/components/ClientDetailModal'
import ClientProjectsModal from '@/components/ClientProjectsModal'

const CATEGORY_CHIPS: SubClientCategory[] = ['a_walkin', 'b_architect_designer', 'c_bidding', 'd_referred']
const CATEGORY_CODE: Record<SubClientCategory, string> = {
  a_walkin: 'codeA', b_architect_designer: 'codeB', c_bidding: 'codeC', d_referred: 'codeD',
}

// SCRUM-718 (complemento REQ-063) — "Sin contacto +60 días" es una dimensión de filtro
// distinta a la categoría (A-D), pero los 5 chips son miembros intercambiables del mismo
// conjunto de filtros activos: cualquier combinación es válida (AND lógico), "Todos" es el
// único que limpia todo. Reemplaza el modelo anterior (SCRUM-93) donde "stale" era
// mutuamente excluyente con las categorías.
const STALE_FILTER = 'stale' as const
type FilterChip = SubClientCategory | typeof STALE_FILTER

export default function VentasDisenoClientsPage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()

  // SCRUM-718 — los 5 chips (A/B/C/D + "sin contacto +60 días") son miembros de un mismo
  // conjunto de filtros activos, combinables entre sí sin restricción (AND lógico). "Todos"
  // es el único que limpia la selección completa. Los filtros no se auto-limpian por
  // interacción del usuario — solo por click explícito en el mismo chip o en "Todos".
  const [activeFilters, setActiveFilters] = useState<FilterChip[]>([])
  const [search, setSearch] = useState('')
  // SCRUM-754 (2026-08-18) — paginación real de backend, un Cliente Master por fila.
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const categories = activeFilters.filter((f): f is SubClientCategory => f !== STALE_FILTER)
  const staleOnly = activeFilters.includes(STALE_FILTER)

  function toggleFilter(chip: FilterChip) {
    setActiveFilters(prev => prev.includes(chip) ? prev.filter(x => x !== chip) : [...prev, chip])
    setPage(1)
  }
  function clearFilters() {
    setActiveFilters([])
    setPage(1)
  }
  const [openClientId, setOpenClientId] = useState<number | null>(null)
  const [projectsClientId, setProjectsClientId] = useState<{ id: number; name: string } | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['ventas-diseno-clients', activeFilters, search, page, perPage],
    queryFn: () => ventasDisenoApi.clients.list({
      search: search || undefined,
      category: categories.length > 0 ? categories : undefined,
      stale: staleOnly ? true : undefined,
      page,
      per_page: perPage,
    }),
  })

  const allRows = data?.data ?? []
  const meta    = data?.meta

  const inputClass = 'border border-slate-200 rounded-lg px-3 py-2 md:py-1.5 text-base md:text-[13px] w-full sm:min-w-[220px] sm:flex-1 focus:outline-none focus:border-[#5BA5A0]'

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:clients.title')}
          </h1>
          {!isLoading && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              {t('ventasDiseno:clients.subtitle', { count: meta?.total ?? allRows.length })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {/* SCRUM-700 (REQ-620, Batch E) — habilitado: el módulo Catálogo ya existe (SCRUM-711
              lo dejaba visual-only "hasta que se desarrolle el módulo CRM"). */}
          <Button variant="secondary" onClick={() => navigate('/ventas-diseno/catalog')}>
            {t('ventasDiseno:clients.actions.catalog')}
          </Button>
          <Button variant="secondary" onClick={() => setShowCreate(true)}>
            {t('ventasDiseno:clients.actions.createClient')}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/ventas-diseno/quotes')}>
            {t('ventasDiseno:clients.actions.newQuote')}
          </Button>
        </div>
      </div>

      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder={t('common:labels.searchPlaceholder')}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className={inputClass}
        />
      </Card>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={clearFilters}
          className={[
            'text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors',
            activeFilters.length === 0 ? 'bg-[#5BA5A0] border-[#5BA5A0] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
          ].join(' ')}
        >
          {t('ventasDiseno:filters.all')}
        </button>
        {CATEGORY_CHIPS.map(c => (
          <button
            key={c}
            onClick={() => toggleFilter(c)}
            className={[
              'text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors',
              activeFilters.includes(c) ? 'bg-[#5BA5A0] border-[#5BA5A0] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {t(`ventasDiseno:category.${c}`)}
          </button>
        ))}
        {/* SCRUM-718 — mismo estilo de "seleccionado" que los chips de categoría (criterio 5:
            experiencia visual consistente entre los 5 chips), ya no usa la paleta ámbar que
            lo distinguía como excluyente. */}
        <button
          onClick={() => toggleFilter(STALE_FILTER)}
          className={[
            'text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors',
            staleOnly ? 'bg-[#5BA5A0] border-[#5BA5A0] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
          ].join(' ')}
        >
          {t('ventasDiseno:clients.staleFilter')}
        </button>
      </div>

      <Card variant="panel" className="overflow-x-auto">
        {isLoading ? (
          <p className="text-slate-400 text-sm p-4">{t('common:labels.loading')}</p>
        ) : allRows.length === 0 ? (
          <p className="text-slate-400 text-sm p-4">{t('ventasDiseno:clients.table.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 px-3">{t('ventasDiseno:clients.table.name')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:clients.table.types')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:clients.table.activeProjects')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:clients.table.lostProjects')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:clients.table.totalProjects')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:clients.table.totalAmount')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:clients.table.closedAmount')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:clients.table.lastContact')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:clients.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row: ClientListRow) => (
                <tr
                  key={row.id}
                  onClick={() => setOpenClientId(row.id)}
                  className="cursor-pointer border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                  <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">{row.name}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1">
                      {row.categories.map(c => (
                        <span
                          key={c}
                          title={t(`ventasDiseno:category.${c}`)}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-[#E3F0EE] text-[#3D7E7A] dark:bg-slate-800 dark:text-[#5BA5A0]"
                        >
                          {t(`ventasDiseno:category.${CATEGORY_CODE[c]}`)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-200">{row.active_projects}</td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-200">{row.lost_projects}</td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-200">{row.total_projects}</td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-200">${row.total_amount.toLocaleString()}</td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-200">${row.closed_amount.toLocaleString()}</td>
                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                    {row.last_contact_days === null
                      ? t('ventasDiseno:clients.table.never')
                      : t('ventasDiseno:clients.table.daysAgo', { days: row.last_contact_days })}
                  </td>
                  <td className="py-2 px-3">
                    <Button
                      variant="secondary"
                      onClick={e => { e.stopPropagation(); setProjectsClientId({ id: row.id, name: row.name }) }}
                    >
                      {t('ventasDiseno:clients.table.viewProjects')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {meta && (
        <Pagination
          meta={meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
        />
      )}

      {openClientId !== null && (
        <ClientDetailModal clientId={openClientId} onClose={() => setOpenClientId(null)} />
      )}

      {projectsClientId && (
        <ClientProjectsModal
          masterClientId={projectsClientId.id}
          masterClientName={projectsClientId.name}
          onClose={() => setProjectsClientId(null)}
        />
      )}

      {showCreate && (
        <CreateClientModal
          mode="client"
          onClose={() => setShowCreate(false)}
          onCreated={client => { setShowCreate(false); setOpenClientId(client.id) }}
        />
      )}
    </>
  )
}
