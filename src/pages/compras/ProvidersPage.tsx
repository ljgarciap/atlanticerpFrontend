import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProviders } from '@/hooks/useCompras'
import { usePermission } from '@/hooks/usePermission'
import ProviderFormDrawer from '@/components/compras/ProviderFormDrawer'
import ProviderDetailModal from '@/components/compras/ProviderDetailModal'
import ComprasSettingsPanel from '@/components/ComprasSettingsPanel'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import type { Provider } from '@/types/compras'
import { IcoChevronDown } from '@/components/icons'

type SortField = 'name' | 'category' | 'currency' | 'created_at'

export default function ProvidersPage() {
  const { t } = useTranslation(['common', 'compras'])

  const [search,     setSearch]     = useState('')
  const [query,      setQuery]      = useState('')
  const [category,   setCategory]   = useState('')
  const [ratingMin,  setRatingMin]  = useState('')
  const [ratingMax,  setRatingMax]  = useState('')
  const [lowRating,  setLowRating]  = useState(false)
  const [page,       setPage]       = useState(1)
  const [perPage,    setPerPage]    = useState<number | 'all'>(20)
  const [sortBy,     setSortBy]     = useState<SortField>('name')
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('asc')
  const [drawerOpen,  setDrawerOpen]  = useState(false)
  // SCRUM-186 (2026-08-06): "Ver detalle" abre un modal de solo-lectura → editar, distinto del
  // drawer (que ahora es exclusivo del flujo de creación).
  const [detailId,    setDetailId]    = useState<number | null>(null)

  // SCRUM-184 (REQ-121) — hallazgo MEDIO Pre-QA 2026-07-16: panel de ajustes gateado por
  // `compras.settings.configure`, mismo patrón que PricingSettingsPanel/ReportsConfigPanel.
  const canConfigureSettings = usePermission('compras.settings.configure')
  const [showSettings, setShowSettings] = useState(false)

  const { data, isFetching } = useProviders({
    search: query || undefined,
    category: category || undefined,
    rating_range: lowRating ? 'low' : undefined,
    rating_min: ratingMin !== '' ? Number(ratingMin) : undefined,
    rating_max: ratingMax !== '' ? Number(ratingMax) : undefined,
    page,
    per_page: perPage,
    sort_by: sortBy,
    sort_dir: sortDir,
  })

  const providers = data?.data ?? []
  const kpis      = data?.kpis
  const meta      = data?.meta

  const filtersActive = search !== '' || category !== '' || ratingMin !== '' || ratingMax !== '' || lowRating

  const handleSearch = () => { setQuery(search); setPage(1) }
  const handleClearFilters = () => {
    setSearch(''); setQuery(''); setCategory(''); setRatingMin(''); setRatingMax(''); setLowRating(false)
    setPage(1)
  }
  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
    setPage(1)
  }
  const openCreate = () => { setDrawerOpen(true) }
  const openDetail = (p: Provider) => { setDetailId(p.id) }

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none"
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortBy === field && (
          <IcoChevronDown size={12} className={sortDir === 'desc' ? 'rotate-180' : ''} />
        )}
      </span>
    </th>
  )

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('compras:providers.title')}</h1>
          <p className="text-[12px] text-slate-500">
            {t('compras:providers.subtitle', { count: kpis?.total_providers ?? 0 })}
          </p>
        </div>
        <div className="flex gap-2">
          {canConfigureSettings && (
            <Button
              variant="secondary" active={showSettings} activeVariant="primary"
              onClick={() => setShowSettings(v => !v)}
            >
              {t('compras:settings.toggle')}
            </Button>
          )}
          <Button onClick={openCreate}>{t('compras:providers.actions.create')}</Button>
        </div>
      </div>

      {canConfigureSettings && showSettings && <ComprasSettingsPanel />}

      {kpis && (
        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <KpiCard label={t('compras:providers.kpis.total')} value={String(kpis.total_providers)} color="#5BA5A0" />
          <KpiCard
            label={t('compras:providers.kpis.averageRating')}
            value={kpis.average_rating !== null ? `${kpis.average_rating}/100` : t('compras:providers.table.notRated')}
            color="#9fc54d"
          />
          <KpiCard label={t('compras:providers.kpis.lowRating')} value={String(kpis.low_rating_count)} color="#dc6b6b" />
          <KpiCard label={t('compras:providers.kpis.categories')} value={String(kpis.active_categories)} color="#5BA5A0" />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('compras:providers.filters.searchPlaceholder')}
          className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <select
          value={category}
          onChange={e => { setCategory(e.target.value); setPage(1) }}
          className="w-44 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">{t('compras:providers.filters.allCategories')}</option>
          {(kpis?.categories ?? []).map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <input
          type="number" min={0} max={100}
          value={ratingMin}
          onChange={e => { setRatingMin(e.target.value); setPage(1) }}
          placeholder={t('compras:providers.filters.ratingMin')}
          className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <input
          type="number" min={0} max={100}
          value={ratingMax}
          onChange={e => { setRatingMax(e.target.value); setPage(1) }}
          placeholder={t('compras:providers.filters.ratingMax')}
          className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <Button variant="outline" onClick={handleSearch}>{t('common:actions.search')}</Button>
        <Button
          variant="outline"
          active={lowRating}
          activeVariant="accent"
          onClick={() => { setLowRating(v => !v); setPage(1) }}
        >
          {t('compras:providers.filters.lowRatingChip')}
        </Button>
        {filtersActive && (
          <Button variant="outline" onClick={handleClearFilters}>
            {t('compras:providers.filters.clear')}
          </Button>
        )}
      </div>

      <Card variant="panel" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <SortHeader field="name" label={t('compras:providers.table.name')} />
              <SortHeader field="category" label={t('compras:providers.table.category')} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:providers.table.contact')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:providers.table.lastPurchase')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:providers.table.rating')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:providers.table.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {providers.length === 0 && !isFetching && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('compras:providers.table.empty')}
                </td>
              </tr>
            )}
            {providers.map(p => (
              <tr
                key={p.id}
                onClick={() => openDetail(p)}
                className="hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3 font-semibold text-slate-800">{p.name}</td>
                <td className="px-4 py-3 text-slate-600">{p.category ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{p.contact_name ?? t('compras:providers.table.noContact')}</td>
                <td className="px-4 py-3 text-slate-600">
                  {p.last_purchase_at ?? t('compras:providers.table.noPurchases')}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {p.rating !== null ? `${p.rating}/100` : t('compras:providers.table.notRated')}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={() => openDetail(p)}>
                    {t('compras:providers.table.actions')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {meta && (
        <Pagination
          meta={meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
        />
      )}

      {drawerOpen && (
        <ProviderFormDrawer
          providerId={null}
          onClose={() => setDrawerOpen(false)}
          onSaved={() => setDrawerOpen(false)}
        />
      )}

      {detailId !== null && (
        <ProviderDetailModal
          providerId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: `${color}18` }}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold leading-none" style={{ color }}>{value}</div>
    </div>
  )
}
