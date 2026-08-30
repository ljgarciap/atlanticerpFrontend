import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useClaims, useUpdateClaimStatus } from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { IcoAlertTriangle } from '@/components/icons'
import { formatMoney } from '@/lib/money'
import NewClaimModal from '@/components/compras/NewClaimModal'
import ClaimDetailModal from '@/components/compras/ClaimDetailModal'
import type { PurchaseOrderClaimSummary, ClaimChip } from '@/types/compras'

const CHIPS: ClaimChip[] = ['todos', 'atencion', 'reportado', 'en_revision', 'resuelto']
const RESOLUTION_TYPES = [
  'reposicion', 'nota_credito_favor', 'nota_credito_reembolso', 'envio_repuestos', 'negado',
] as const

/**
 * SCRUM-257/258 (REQ-194/195, hallazgo de Daniela Amaya 2026-08-09) — Garantías y Reclamos.
 * KPIs nuevos (Total/Reportados-En revisión/Resueltos este mes/Monto en disputa), filtros
 * (texto libre, proveedor, tipo de resolución) combinables, chips con la nomenclatura exacta del
 * requerimiento ("Todos", no "Todas"; se agrega "Reportado" — ver nota sobre esta ambigüedad más
 * abajo), y tabla con las 8 columnas del requerimiento en orden.
 */
export default function ClaimsPage() {
  const { t } = useTranslation(['common', 'compras'])

  const [chip, setChip] = useState<ClaimChip>('todos')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [providerId, setProviderId] = useState<number | ''>('')
  const [resolution, setResolution] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data, isFetching } = useClaims({
    chip: chip === 'todos' ? undefined : chip,
    search: query || undefined,
    provider_id: providerId === '' ? undefined : providerId,
    expected_resolution: resolution || undefined,
    page, per_page: perPage,
  })
  const claims = data?.data ?? []
  const meta = data?.meta
  const kpis = data?.kpis
  const providers = data?.filters.providers ?? []

  const hasActiveFilters = chip !== 'todos' || search !== '' || query !== '' || providerId !== '' || resolution !== ''
  const handleSearch = () => { setQuery(search); setPage(1) }
  const handleClearFilters = () => {
    setChip('todos'); setSearch(''); setQuery(''); setProviderId(''); setResolution(''); setPage(1)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('compras:claims.title')}</h1>
        <Button onClick={() => setShowNewModal(true)}>{t('compras:claims.actions.create')}</Button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <Card variant="panel" className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:claims.kpis.total')}</p>
          <p className="text-xl font-bold text-slate-800">{kpis?.total ?? 0}</p>
        </Card>
        <Card variant="panel" className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:claims.kpis.reportedInReview')}</p>
          <p className="text-xl font-bold text-slate-800">{kpis?.reportados_en_revision ?? 0}</p>
        </Card>
        <Card variant="panel" className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:claims.kpis.resolvedThisMonth')}</p>
          <p className="text-xl font-bold text-slate-800">{kpis?.resueltos_este_mes ?? 0}</p>
        </Card>
        <Card variant="panel" className="p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('compras:claims.kpis.disputedAmount')}</p>
          <p className="text-xl font-bold text-slate-800">${formatMoney(kpis?.disputed_amount ?? 0)}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('compras:claims.filters.searchPlaceholder') ?? ''}
          className="flex-1 max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <Button variant="outline" onClick={handleSearch}>{t('common:actions.search')}</Button>
        <select
          value={providerId}
          onChange={e => { setProviderId(e.target.value === '' ? '' : Number(e.target.value)); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">{t('compras:claims.filters.allProviders')}</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={resolution}
          onChange={e => { setResolution(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">{t('compras:claims.filters.allResolutions')}</option>
          {RESOLUTION_TYPES.map(r => (
            <option key={r} value={r}>{t(`compras:claims.resolutionTypes.${r}`)}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {CHIPS.map(c => (
          <Button
            key={c} variant="outline" active={chip === c}
            className="!text-xs !px-3 !py-1.5 !inline-flex !items-center !gap-1"
            onClick={() => { setChip(c); setPage(1) }}
          >
            {c === 'atencion' && <IcoAlertTriangle size={12} className="text-amber-500" />}
            {t(`compras:claims.chips.${c}`)}
          </Button>
        ))}
        {hasActiveFilters && (
          <Button variant="outline" className="!text-xs !px-3 !py-1.5" onClick={handleClearFilters}>
            {t('compras:claims.filters.clear')}
          </Button>
        )}
      </div>

      <Card variant="panel" className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:claims.table.code')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:claims.table.order')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:claims.table.provider')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:claims.table.product')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:claims.table.resolutionType')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:claims.table.status')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:claims.table.reportedDate')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:claims.table.serviceTicket')}</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:orders.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {claims.length === 0 && !isFetching && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-sm">{t('compras:claims.table.empty')}</td>
              </tr>
            )}
            {claims.map(c => (
              <ClaimRow key={c.id} claim={c} onView={() => setDetailId(c.id)} />
            ))}
          </tbody>
        </table>
        </div>
      </Card>

      {meta && (
        <Pagination
          meta={meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={p => { setPerPage(p); setPage(1) }}
        />
      )}

      {showNewModal && (
        <NewClaimModal onClose={() => setShowNewModal(false)} onCreated={() => setShowNewModal(false)} />
      )}
      {detailId !== null && (
        <ClaimDetailModal claimId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}

function ClaimRow({ claim, onView }: { claim: PurchaseOrderClaimSummary; onView: () => void }) {
  const { t } = useTranslation(['common', 'compras'])
  const updateStatus = useUpdateClaimStatus(claim.id)

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 font-semibold text-slate-800">
        <div className="flex items-center gap-1.5">
          {claim.needs_attention && (
            <span title={t('compras:claims.table.attention') ?? ''}>
              <IcoAlertTriangle size={13} className="text-amber-500" />
            </span>
          )}
          {claim.code}
        </div>
      </td>
      <td className="px-4 py-3 text-slate-600">#{claim.purchase_order_id}</td>
      <td className="px-4 py-3 text-slate-600">{claim.provider_name}</td>
      <td className="px-4 py-3 text-slate-600">{claim.product ?? '—'}</td>
      <td className="px-4 py-3 text-slate-600">
        {claim.expected_resolution
          ? t(`compras:claims.resolutionTypes.${claim.expected_resolution}`, { defaultValue: claim.expected_resolution })
          : '—'}
      </td>
      <td className="px-4 py-3">
        {/* SCRUM-258 (hallazgo de Daniela Amaya) — un único selector, sirve como display Y como
            edición inline a la vez (nunca se duplica visualmente el estado). */}
        <select
          value={claim.status}
          onChange={e => updateStatus.mutate(e.target.value as 'en_revision' | 'resuelto')}
          className="px-2 py-1 border border-slate-300 rounded-lg text-xs bg-white"
        >
          <option value="en_revision">{t('compras:claims.status.en_revision')}</option>
          <option value="resuelto">{t('compras:claims.status.resuelto')}</option>
        </select>
      </td>
      <td className="px-4 py-3 text-slate-600">{new Date(claim.created_at).toLocaleDateString()}</td>
      <td className="px-4 py-3 text-slate-400">{claim.service_ticket ?? '—'}</td>
      <td className="px-4 py-3 text-right">
        <Button variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={onView}>
          {t('common:actions.view')}
        </Button>
      </td>
    </tr>
  )
}
