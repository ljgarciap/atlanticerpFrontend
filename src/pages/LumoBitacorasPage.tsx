import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { lumoApi } from '@/api/lumoApi'
import { lumoIdentityBridge, buildOrdering } from '@/lib/lumoIdentityBridge'
import type { LumoBitacorasSortField } from '@/types/lumo'
import { Card } from '@/components/ui/Card'
import { Pagination, type PaginationMeta } from '@/components/ui/Pagination'
import { IcoChevronDown, IcoAlertTriangle } from '@/components/icons'

// SCRUM-925 — Bitácoras de LUMO embebidas en AtlanticERP vía Identity Bridge (solo lectura).
//
// El access token de LUMO (TTL 15 min) vive únicamente en memoria de este componente — nunca en
// localStorage, se pierde al recargar la página a propósito. Se renueva cada 10 min (antes de que
// venza) repitiendo los pasos 1-2 (código de AtlanticERP + exchange contra LUMO), sin esperar un 401
// real. La tabla de bitácoras hace polling cada 60s SOLO con la pestaña visible: `refetchInterval`
// de TanStack Query ya pausa el refetch cuando `document.visibilityState !== 'visible'`
// (`refetchIntervalInBackground` es `false` por default), así que no hace falta un listener de
// `visibilitychange` a mano.
//
// LUMO limita `page_size` a 100 — no hay equivalente real a la opción "todos" del selector
// compartido de Pagination; si el usuario la elige, se pide el máximo permitido (100) en su lugar.
const LUMO_MAX_PAGE_SIZE = 100

export default function LumoBitacorasPage() {
  const { t } = useTranslation(['common', 'lumo'])

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  const [sortBy, setSortBy] = useState<LumoBitacorasSortField>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // SCRUM-946 — mismos 3 filtros que la vista de bitácoras de LUMO standalone (Vendedor, Desde,
  // Hasta). Se aplican al instante y cualquier cambio vuelve a la página 1, igual que allá; sin
  // botón "Limpiar" a propósito (LUMO no lo tiene: "Todos" y fecha vacía ya restablecen).
  const [vendedor, setVendedor] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const tokenQuery = useQuery({
    queryKey: ['lumo-access-token'],
    queryFn: async () => {
      const { code } = await lumoApi.getBitacorasCode()
      const { access } = await lumoIdentityBridge.exchange(code)
      return access
    },
    refetchInterval: 10 * 60 * 1000,
    staleTime: 0,
    // Sin retry: si AtlanticERP o LUMO devuelven error, mostramos el estado de "no disponible" de
    // inmediato en vez de demorar la señal — el próximo poll/renovación ya reintenta solo.
    retry: false,
  })

  const requestPageSize = perPage === 'all' ? LUMO_MAX_PAGE_SIZE : perPage

  const bitacorasQuery = useQuery({
    queryKey: ['lumo-bitacoras', page, requestPageSize, sortBy, sortDir, vendedor, desde, hasta, tokenQuery.data],
    queryFn: () =>
      lumoIdentityBridge.bitacoras(tokenQuery.data as string, {
        page,
        page_size: requestPageSize,
        ordering: buildOrdering(sortBy, sortDir),
        vendedor: vendedor ? Number(vendedor) : undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      }),
    enabled: !!tokenQuery.data,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  })

  // Opciones del select de Vendedor. Si falla, el select queda solo con "Todos" y la tabla sigue
  // funcionando (mismo criterio que LUMO, que ignora el error de esa carga) — por eso no cuenta
  // para `isUnavailable`. La lista casi no cambia, así que no hace falta refrescarla con el token.
  const vendedoresQuery = useQuery({
    queryKey: ['lumo-vendedores'],
    queryFn: () => lumoIdentityBridge.vendedores(tokenQuery.data as string),
    enabled: !!tokenQuery.data,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const vendedores = vendedoresQuery.data ?? []

  const hasFilters = !!(vendedor || desde || hasta)
  const inputClass =
    'rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#5BA5A0]'

  const toggleSort = (field: LumoBitacorasSortField) => {
    if (sortBy === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  const SortHeader = ({ field, label }: { field: LumoBitacorasSortField; label: string }) => (
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

  const isUnavailable = tokenQuery.isError || bitacorasQuery.isError
  const isLoading = tokenQuery.isLoading || (tokenQuery.isSuccess && bitacorasQuery.isLoading)

  const rows = bitacorasQuery.data?.results ?? []
  const meta: PaginationMeta | null = bitacorasQuery.data
    ? {
        total:        bitacorasQuery.data.count,
        per_page:     requestPageSize,
        current_page: page,
        last_page:    Math.max(1, Math.ceil(bitacorasQuery.data.count / requestPageSize)),
      }
    : null

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('lumo:title')}</h1>
        <p className="text-[12px] text-slate-500">{t('lumo:subtitle')}</p>
      </div>

      <Card variant="panel" className="overflow-hidden">
        {!isUnavailable && (
          <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-slate-100">
            <div className="flex flex-col gap-1">
              <label htmlFor="lumo-f-vendedor" className="text-xs font-semibold text-slate-500">
                {t('lumo:filters.vendedor')}
              </label>
              <select
                id="lumo-f-vendedor"
                value={vendedor}
                onChange={e => { setVendedor(e.target.value); setPage(1) }}
                className={inputClass}
              >
                <option value="">{t('lumo:filters.todos')}</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.id}>{v.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lumo-f-desde" className="text-xs font-semibold text-slate-500">
                {t('lumo:filters.desde')}
              </label>
              <input
                id="lumo-f-desde"
                type="date"
                value={desde}
                onChange={e => { setDesde(e.target.value); setPage(1) }}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lumo-f-hasta" className="text-xs font-semibold text-slate-500">
                {t('lumo:filters.hasta')}
              </label>
              <input
                id="lumo-f-hasta"
                type="date"
                value={hasta}
                onChange={e => { setHasta(e.target.value); setPage(1) }}
                className={inputClass}
              />
            </div>
          </div>
        )}
        {isUnavailable ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500 justify-center">
            <IcoAlertTriangle size={16} />
            {t('lumo:unavailable')}
          </div>
        ) : isLoading ? (
          <div className="px-4 py-8 text-sm text-slate-500 text-center">{t('lumo:loading')}</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-sm text-slate-500 text-center">{t(hasFilters ? 'lumo:emptyFiltered' : 'lumo:empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100">
                <tr>
                  <SortHeader field="vendedor__first_name" label={t('lumo:columns.vendedor')} />
                  <SortHeader field="fecha" label={t('lumo:columns.fecha')} />
                  <SortHeader field="cliente" label={t('lumo:columns.cliente')} />
                  <SortHeader field="proyecto" label={t('lumo:columns.proyecto')} />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {t('lumo:columns.motivo')}
                  </th>
                  <SortHeader field="tipo_atencion" label={t('lumo:columns.tipoAtencion')} />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {t('lumo:columns.observaciones')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-slate-700">{row.vendedor_nombre}</td>
                    <td className="px-4 py-3 text-slate-700">{row.fecha}</td>
                    <td className="px-4 py-3 text-slate-700">{row.cliente}</td>
                    <td className="px-4 py-3 text-slate-700">{row.proyecto}</td>
                    <td className="px-4 py-3 text-slate-700">{row.motivo}</td>
                    <td className="px-4 py-3 text-slate-700">{row.tipo_atencion}</td>
                    <td className="px-4 py-3 text-slate-500">{row.observaciones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && !isUnavailable && (
          <div className="px-4 pb-3">
            <Pagination
              meta={meta}
              perPage={perPage}
              onPageChange={setPage}
              onPerPageChange={p => { setPerPage(p); setPage(1) }}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
