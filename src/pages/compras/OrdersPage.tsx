import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { comprasApi } from '@/api/comprasApi'
import { usePurchaseOrders, useProviders } from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { ReceptionBadge } from '@/components/compras/ReceptionBadge'
import { OriginBadge } from '@/components/compras/OriginBadge'
import ProjectBreakdownModal from '@/components/compras/ProjectBreakdownModal'
import { usePermission } from '@/hooks/usePermission'
import { orderStatusLabel } from '@/utils/orderStatusLabel'
import { ORDER_STATUSES, type ApprovedProject } from '@/types/compras'
import { IcoAlertTriangle, IcoClose } from '@/components/icons'

type Chip = 'all' | 'critical' | 'zona_libre'
type SortField = 'created_at' | 'status' | 'total_amount' | 'estimated_arrival_date'

export default function OrdersPage() {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // REQ-112 (Inicio de Compras) — "Productos retrasados" navega acá con ?chip=critical ya
  // aplicado, mismo patrón que InventarioPage con ?chip=en_atencion.
  const initialChip: Chip = (['all', 'critical', 'zona_libre'] as Chip[])
    .includes(searchParams.get('chip') as Chip)
    ? (searchParams.get('chip') as Chip)
    : 'all'

  const [search,     setSearch]     = useState('')
  const [query,      setQuery]      = useState('')
  const [providerId, setProviderId] = useState<number | ''>('')
  const [status,     setStatus]     = useState<string>('')
  const [createdBy,  setCreatedBy]  = useState<number | ''>('')
  const [projectId,  setProjectId]  = useState<number | ''>('')
  const [projectLabel, setProjectLabel] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [chip,       setChip]       = useState<Chip>(initialChip)
  const [page,       setPage]       = useState(1)
  const [perPage,    setPerPage]    = useState<number | 'all'>(20)
  const [sortBy,     setSortBy]     = useState<SortField>('created_at')
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('desc')
  const [breakdownOrderId, setBreakdownOrderId] = useState<number | null>(null)
  // SCRUM-773 (CA1) — "+ Nueva orden" no tenía ningún check propio, quedaba visible/clickeable
  // para Líder de Operaciones (compras.limited.view); la ruta real (POST /compras/orders) ya
  // exige compras.write, esto solo alinea la UI con lo que el backend ya bloquea.
  const canCreate = usePermission('compras.write')

  const { data: providersData } = useProviders({ per_page: 'all' })
  const { data, isFetching } = usePurchaseOrders({
    search: query || undefined,
    provider_id: providerId || undefined,
    status: status || undefined,
    created_by: createdBy || undefined,
    sales_project_id: projectId || undefined,
    chip: chip === 'all' ? undefined : chip,
    page,
    per_page: perPage,
    sort_by: sortBy,
    sort_dir: sortDir,
  })

  const orders = data?.data ?? []
  const meta = data?.meta
  const creators = data?.filters.creators ?? []

  // SCRUM-733 (mismo bug gemelo de SCRUM-214/Logística) — NO usar approvedProjects.search(): ese
  // endpoint (QuoteListService::searchApprovedProjects(), pensado para el gate de REQ-133/Nueva
  // Orden) solo devuelve proyectos con una cotización en documentStatus()==='approved', así que
  // cualquier orden de un proyecto sin cotización vigente en ese estado exacto (dato legado,
  // proyecto creado fuera del flujo de cotización) era invisible en este filtro pese a tener una
  // orden real y visible en la tabla. shipmentProjects.search() busca sobre proyectos realmente
  // referenciados por líneas de órdenes, sin ese gate — y a diferencia de Logística (que sí pasa
  // activeShipmentsOnly=true, ver LogisticsPage.tsx) Ver Órdenes lo deja en su default `false`
  // porque acá SÍ hay que ver el proyecto de una orden "Por aprobar" (Logística la excluye a
  // propósito, Ver Órdenes no filtra por status en absoluto).
  const { data: projectResults } = useQuery({
    queryKey: ['compras/orders/shipment-projects', 'all', projectSearch],
    queryFn:  () => comprasApi.shipmentProjects.search(projectSearch),
    enabled:  projectId === '' && projectSearch.length > 0,
  })

  const filtersActive = search !== '' || providerId !== '' || status !== '' || createdBy !== '' || projectId !== ''
  const handleSearch = () => { setQuery(search); setPage(1) }
  const handleClearFilters = () => {
    setSearch(''); setQuery(''); setProviderId(''); setStatus(''); setCreatedBy('')
    setProjectId(''); setProjectLabel(''); setProjectSearch(''); setPage(1)
  }

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('compras:orders.title')}</h1>
          <p className="text-[12px] text-slate-500">
            {t('compras:orders.subtitle', { count: meta?.total ?? 0 })}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate('/compras/ordenes/nueva')}>
            {t('compras:orders.actions.create')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('compras:orders.filters.searchPlaceholder')}
          className="flex-1 max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <Button variant="outline" onClick={handleSearch}>{t('common:actions.search')}</Button>
        <select
          value={providerId}
          onChange={e => { setProviderId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">{t('compras:orders.filters.allProviders')}</option>
          {(providersData?.data ?? []).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">{t('compras:orders.filters.allStatuses')}</option>
          {ORDER_STATUSES.map(s => (
            <option key={s} value={s}>{t(`compras:orders.status.${s}`)}</option>
          ))}
        </select>
        <select
          value={createdBy}
          onChange={e => { setCreatedBy(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">{t('compras:orders.filters.allCreators')}</option>
          {creators.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {projectId === '' ? (
          <div className="relative">
            <input
              type="text"
              value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              placeholder={t('compras:orders.filters.projectPlaceholder')}
              className="w-48 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {projectResults && projectResults.data.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full border border-slate-200 rounded-lg bg-white shadow-lg divide-y divide-slate-100 overflow-hidden">
                {projectResults.data.map((p: ApprovedProject) => (
                  <li key={p.sales_project_id}>
                    <button
                      type="button"
                      onClick={() => {
                        setProjectId(p.sales_project_id)
                        setProjectLabel(p.project_name)
                        setProjectSearch('')
                        setPage(1)
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      {p.project_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Button
            variant="outline"
            active
            activeVariant="primary"
            className="!text-xs !px-3 !py-1.5 inline-flex items-center gap-1.5"
            onClick={() => { setProjectId(''); setProjectLabel(''); setPage(1) }}
            title={t('compras:orders.filters.clearProject') ?? ''}
          >
            {projectLabel}
            <IcoClose size={12} />
          </Button>
        )}

        {filtersActive && (
          <Button variant="outline" onClick={handleClearFilters}>
            {t('compras:orders.filters.clear')}
          </Button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {(['all', 'critical', 'zona_libre'] as Chip[]).map(c => (
          <Button
            key={c}
            variant="outline"
            active={chip === c}
            activeVariant={c === 'critical' ? 'accent' : 'primary'}
            className="!text-xs !px-3 !py-1.5"
            onClick={() => { setChip(c); setPage(1) }}
          >
            {t(`compras:orders.chips.${c === 'zona_libre' ? 'zonaLibre' : c}`)}
          </Button>
        ))}
      </div>

      <Card variant="panel" className="overflow-hidden">
        {/* REQ-140 (SCRUM-203) — con las 5 columnas nuevas la tabla excede el ancho de
            viewports normales; sin este wrapper el "Ver" de Acciones quedaba clippeado
            por el overflow-hidden del Card (confirmado: bounding box fuera del viewport,
            sin scroll posible, botón inalcanzable). overflow-x-auto en un div propio en
            vez de sacar el overflow-hidden del Card, que sigue haciendo falta para
            recortar las esquinas redondeadas. */}
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.id')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.provider')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.modality')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.shippingType')}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer"
                onClick={() => toggleSort('created_at')}
              >
                {t('compras:orders.table.orderDate')}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer"
                onClick={() => toggleSort('estimated_arrival_date')}
              >
                {t('compras:orders.table.estimatedArrival')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.paymentDate')}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer"
                onClick={() => toggleSort('total_amount')}
              >
                {t('compras:orders.table.total')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.shippingCost')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.reception')}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer"
                onClick={() => toggleSort('status')}
              >
                {t('compras:orders.table.status')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.responsible')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.project')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.length === 0 && !isFetching && (
              <tr>
                <td colSpan={14} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('compras:orders.table.empty')}
                </td>
              </tr>
            )}
            {orders.map(o => (
              <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">
                  <div className="flex items-center gap-1.5">
                    {o.is_critical && (
                      <span title={t('compras:orders.table.critical') ?? ''}>
                        <IcoAlertTriangle size={13} className="text-amber-500" />
                      </span>
                    )}
                    #{o.id}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {o.provider_name}
                    <OriginBadge originModule={o.origin_module} t={t} />
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{t(`compras:newOrder.modality.${o.modality === 'zona_libre' ? 'zonaLibre' : 'directo'}`)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {o.shipping_type ? t(`compras:newOrder.shipping.type${o.shipping_type.charAt(0).toUpperCase()}${o.shipping_type.slice(1)}`) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">{new Date(o.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-slate-600">{o.estimated_arrival_date ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{o.last_payment_date ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">${o.total_amount.toFixed(2)}</td>
                <td className="px-4 py-3 text-slate-600">{o.shipping_cost != null ? `$${o.shipping_cost.toFixed(2)}` : '—'}</td>
                <td className="px-4 py-3">
                  <ReceptionBadge status={o.reception_status} t={t} />
                </td>
                <td className="px-4 py-3 text-slate-600">{orderStatusLabel(t, o.status, o.modality)}</td>
                <td className="px-4 py-3 text-slate-600">{o.created_by_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">
                  {o.has_multiple_projects ? (
                    <button
                      type="button"
                      onClick={() => setBreakdownOrderId(o.id)}
                      className="text-primary hover:underline font-medium"
                    >
                      {t('compras:orders.table.projectMultiple', { count: o.sales_project_count })}
                    </button>
                  ) : (
                    o.sales_project_summary ?? (
                      <span className="text-slate-400">{t('compras:orders.table.projectNone')}</span>
                    )
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="outline"
                    className="!px-3 !py-1.5 !text-xs"
                    onClick={() => navigate(`/compras/ordenes/${o.id}`)}
                  >
                    {t('common:actions.view')}
                  </Button>
                </td>
              </tr>
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
          onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
        />
      )}

      {breakdownOrderId !== null && (
        <ProjectBreakdownModal orderId={breakdownOrderId} onClose={() => setBreakdownOrderId(null)} />
      )}
    </div>
  )
}
