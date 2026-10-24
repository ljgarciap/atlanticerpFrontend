import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { Toggle } from '@/components/ui/Toggle'
import { IcoAlertTriangle, IcoChevronDown, IcoClock, IcoImage, IcoLock, IcoSearch } from '@/components/icons'
import { KpiCard, Th } from '@/components/bodega/BodegaTableParts'
import { useZonaLibreCatalogo } from '@/hooks/useBodega'
import {
  ZONA_LIBRE_DEFAULT_SORT, ariaSortFor, buildZonaLibreParams, displayText, effectiveSearch, hasActiveFilters, nextSort, safeImageUrl,
} from '@/lib/zonaLibreCatalogo'
import { formatInt, formatMoney } from '@/lib/money'
import { formatDateFromTimestamp, formatTimeShort } from '@/utils/dates'
import {
  ZONA_LIBRE_PER_PAGE_OPTIONS,
  type WarehouseKpis, type ZonaLibreCatalogoPerPage, type ZonaLibreCatalogoRow, type ZonaLibreCatalogoSort,
} from '@/types/bodega'

/** Debounce de la búsqueda (spec UX SCRUM-990): Enter la aplica de inmediato. */
const SEARCH_DEBOUNCE_MS = 400

const NOTICE_ID = 'zona-libre-notice'
const KPI_COLOR = '#94a3b8' // gris neutro: no iguala estos KPI a los (teal/lima) del inventario de Atlantic

/**
 * SCRUM-990 — Bodega > Vista Bodegas > Zona Libre: catálogo de Lafayette Lighting de SOLO CONSULTA. Es el catálogo de una
 * empresa externa (tabla propia `lafayette_productos`), NO inventario de Atlantic, así que esta vista no tiene ninguna
 * acción: ni reubicar, ni editar, ni ajustar, ni contar, ni reservar, ni exportar (tampoco botones deshabilitados). Spec visual:
 * atlanticerp-backend/docs/specs/scrum990-zona-libre-ux.md. Contrato: `GET /bodega/zona-libre/productos` (paginado en el servidor;
 * ~25.800 filas nunca se cargan enteras).
 */
export default function ZonaLibreCatalogoTable({ kpis }: { kpis?: WarehouseKpis }) {
  const { t } = useTranslation(['common', 'bodega'])

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState('')
  const [soloDisponibles, setSoloDisponibles] = useState(false)
  const [sortState, setSortState] = useState<{ sort: ZonaLibreCatalogoSort; dir: 'asc' | 'desc' }>({
    sort: ZONA_LIBRE_DEFAULT_SORT, dir: 'asc',
  })
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<ZonaLibreCatalogoPerPage>(ZONA_LIBRE_PER_PAGE_OPTIONS[0])

  // Búsqueda aplicada (ya con el mínimo de 2 caracteres); un cambio de filtro siempre vuelve a la página 1.
  const appliedSearch = useRef('')
  const applySearch = (raw: string) => {
    const next = effectiveSearch(raw)
    if (next === appliedSearch.current) return
    appliedSearch.current = next
    setSearch(next)
    setPage(1)
  }

  useEffect(() => {
    const id = setTimeout(() => applySearch(searchInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [searchInput])

  const filterState = { search, categoria, soloDisponibles }
  const filtersActive = hasActiveFilters(filterState)

  const params = buildZonaLibreParams({ ...filterState, ...sortState, page, perPage })
  const { data, isPending, isError, isFetching, refetch } = useZonaLibreCatalogo(params)

  const clearFilters = () => {
    appliedSearch.current = ''
    setSearchInput('')
    setSearch('')
    setCategoria('')
    setSoloDisponibles(false)
    setPage(1)
  }

  const onSort = (column: ZonaLibreCatalogoSort) => {
    setSortState(nextSort(sortState, column))
    setPage(1)
  }

  const notice = (
    <div
      id={NOTICE_ID}
      role="note"
      className="mb-5 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
    >
      <IcoLock size={14} className="mt-0.5 shrink-0 text-slate-600" />
      <div>
        <div className="text-sm font-semibold text-slate-800">{t('bodega:warehouses.zonaLibre.noticeTitle')}</div>
        <p className="text-[12px] text-slate-600">{t('bodega:warehouses.zonaLibre.noticeBody')}</p>
      </div>
    </div>
  )

  // Estado "catálogo aún sin sincronizar": sin filtros y sin ningún producto vigente. Se mantiene solo el aviso permanente.
  const notSynced = !filtersActive && data !== undefined && data.meta.total_catalogo === 0
  if (notSynced) {
    return (
      <div data-testid="zona-libre-catalogo">
        {notice}
        <Card variant="panel" className="px-6 py-12 text-center">
          <IcoClock size={28} className="mx-auto mb-3 text-slate-400" />
          <p className="text-sm font-semibold text-slate-800">{t('bodega:warehouses.zonaLibre.notSynced')}</p>
          <p className="mt-1 text-[12px] text-slate-500">{t('bodega:warehouses.zonaLibre.notSyncedHint')}</p>
        </Card>
      </div>
    )
  }

  const rows = data?.data ?? []
  const lastSync = kpis?.last_synced_at ?? null
  // SCRUM-990 (ronda 2) — el precio de Lafayette solo lo ve quien tiene compras.read o superadmin.all. Sin ese permiso el backend manda
  // `precio: null` en todas las filas y responde 422 a `sort=precio`: no se muestra la columna, ni su encabezado ordenable, ni el precio en la
  // tarjeta móvil (no se deja una columna de "—"). Mientras no hay respuesta se asume que NO (y el orden por precio solo se ofrece cuando sí).
  const showPrice = data?.meta.puede_ver_precio === true
  const columnCount = showPrice ? 8 : 7
  const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5BA5A0]'

  return (
    <div data-testid="zona-libre-catalogo">
      {notice}

      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <KpiCard
          label={t('bodega:warehouses.zonaLibre.kpis.products')}
          value={kpis ? formatInt(kpis.total_products) : '—'}
          color={KPI_COLOR}
        />
        <KpiCard
          label={t('bodega:warehouses.zonaLibre.kpis.available')}
          value={kpis ? formatInt(kpis.total_units) : '—'}
          color={KPI_COLOR}
        />
        <KpiCard
          label={t('bodega:warehouses.zonaLibre.kpis.lastSync')}
          value={lastSync ? formatDateFromTimestamp(lastSync) : '—'}
          sublabel={lastSync ? formatTimeShort(lastSync) : undefined}
          color={KPI_COLOR}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <label htmlFor="zona-libre-search" className="sr-only">{t('bodega:warehouses.zonaLibre.filters.searchLabel')}</label>
          <IcoSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="zona-libre-search"
            type="search"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applySearch(searchInput) }}
            aria-describedby={NOTICE_ID}
            placeholder={t('bodega:warehouses.zonaLibre.filters.search')}
            className={`w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm ${focusRing}`}
          />
        </div>

        {(data?.meta.categorias.length ?? 0) > 0 && (
          <select
            value={categoria}
            onChange={e => { setCategoria(e.target.value); setPage(1) }}
            aria-label={t('bodega:warehouses.filters.category')}
            className={`px-3 py-2 border border-slate-300 rounded-lg text-sm ${focusRing}`}
          >
            <option value="">{t('bodega:warehouses.filters.category')}</option>
            {data?.meta.categorias.map(c => <option key={c} value={c}>{displayText(c) ?? c}</option>)}
          </select>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Toggle
            checked={soloDisponibles}
            onChange={v => { setSoloDisponibles(v); setPage(1) }}
            label={t('bodega:warehouses.zonaLibre.filters.withStock')}
          />
          {t('bodega:warehouses.zonaLibre.filters.withStock')}
        </label>

        <Button variant="outline" onClick={clearFilters}>{t('bodega:warehouses.filters.clear')}</Button>
      </div>

      {isError ? (
        <Card variant="panel" className="px-6 py-10 text-center">
          <div role="alert">
            <IcoAlertTriangle size={24} className="mx-auto mb-2 text-amber-600" />
            <p className="text-sm font-semibold text-slate-800">{t('bodega:warehouses.zonaLibre.error')}</p>
            <Button variant="outline" className="mt-3" onClick={() => { void refetch() }}>
              {t('bodega:warehouses.zonaLibre.retry')}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            {data ? t('bodega:warehouses.zonaLibre.resultsCount', { count: data.meta.total }) : ''}
          </p>

          {/* Escritorio/tablet: tabla. En móvil (< 768 px) las filas pasan a tarjetas (lista de abajo). */}
          <Card variant="panel" className={`hidden md:block overflow-hidden overflow-x-auto ${isFetching && !isPending ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm" aria-busy={isPending || isFetching}>
              <caption className="sr-only">{t('bodega:warehouses.zonaLibre.table.caption')}</caption>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <Th>{t('bodega:warehouses.zonaLibre.table.image')}</Th>
                  <SortTh column="referencia_lafayette" label={t('bodega:warehouses.zonaLibre.table.lafayetteId')} sortState={sortState} onSort={onSort} className="hidden lg:table-cell" />
                  <SortTh column="referencia" label={t('bodega:warehouses.zonaLibre.table.reference')} sortState={sortState} onSort={onSort} />
                  <SortTh column="descripcion" label={t('bodega:warehouses.zonaLibre.table.description')} sortState={sortState} onSort={onSort} />
                  <SortTh column="marca" label={t('bodega:warehouses.zonaLibre.table.brand')} sortState={sortState} onSort={onSort} className="hidden lg:table-cell" />
                  <SortTh column="categoria" label={t('bodega:warehouses.zonaLibre.table.category')} sortState={sortState} onSort={onSort} />
                  <SortTh column="disponible" label={t('bodega:warehouses.zonaLibre.table.available')} sortState={sortState} onSort={onSort} className="!text-right" />
                  {showPrice && (
                    <SortTh column="precio" label={t('bodega:warehouses.zonaLibre.table.price')} sortState={sortState} onSort={onSort} className="!text-right" />
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isPending && Array.from({ length: 8 }, (_, i) => (
                  <tr key={`sk-${i}`} data-testid="zona-libre-skeleton">
                    {Array.from({ length: columnCount }, (_, c) => (
                      <td key={c} className={`px-4 py-3 ${c === 1 || c === 4 ? 'hidden lg:table-cell' : ''}`}>
                        <div className="h-4 animate-pulse rounded bg-slate-100" />
                      </td>
                    ))}
                  </tr>
                ))}
                {!isPending && rows.length === 0 && (
                  <tr>
                    <td colSpan={columnCount} className="px-4 py-10 text-center text-slate-500 text-sm">
                      {t('bodega:warehouses.zonaLibre.empty')}{' '}
                      <button type="button" onClick={clearFilters} className={`font-semibold text-slate-700 underline ${focusRing}`}>
                        {t('bodega:warehouses.filters.clear')}
                      </button>
                    </td>
                  </tr>
                )}
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className="px-4 py-2"><ProductThumb url={row.url_imagen} /></td>
                    <td className="hidden lg:table-cell px-4 py-3 text-slate-600">{text(row.referencia_lafayette)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{text(row.referencia)}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs">
                      <span className="line-clamp-2" title={displayText(row.descripcion) ?? undefined}>{text(row.descripcion)}</span>
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-slate-600">{text(row.marca)}</td>
                    <td className="px-4 py-3 text-slate-600">{text(row.categoria)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${row.disponible === 0 ? 'text-slate-400' : 'text-slate-600'}`}>
                      {formatInt(row.disponible)}
                    </td>
                    {showPrice && <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatPrice(row)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <ul className={`md:hidden space-y-3 ${isFetching && !isPending ? 'opacity-60' : ''}`} aria-label={t('bodega:warehouses.zonaLibre.table.caption')}>
            {isPending && Array.from({ length: 4 }, (_, i) => (
              <li key={`skc-${i}`}><div className="h-20 animate-pulse rounded-xl bg-slate-100" /></li>
            ))}
            {!isPending && rows.length === 0 && (
              <li className="py-8 text-center text-sm text-slate-500">
                {t('bodega:warehouses.zonaLibre.empty')}{' '}
                <button type="button" onClick={clearFilters} className={`font-semibold text-slate-700 underline ${focusRing}`}>
                  {t('bodega:warehouses.filters.clear')}
                </button>
              </li>
            )}
            {rows.map(row => (
              <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex gap-3">
                  <ProductThumb url={row.url_imagen} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800">{text(row.referencia)}</div>
                    <div className="line-clamp-2 text-[12px] text-slate-600">{text(row.descripcion)}</div>
                  </div>
                </div>
                <dl className={`mt-2 grid gap-2 text-[12px] ${showPrice ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <dt className="text-slate-500">{t('bodega:warehouses.zonaLibre.table.available')}</dt>
                    <dd className={`tabular-nums ${row.disponible === 0 ? 'text-slate-400' : 'text-slate-700'}`}>{formatInt(row.disponible)}</dd>
                  </div>
                  {showPrice && (
                    <div>
                      <dt className="text-slate-500">{t('bodega:warehouses.zonaLibre.table.price')}</dt>
                      <dd className="tabular-nums text-slate-700">{formatPrice(row)}</dd>
                    </div>
                  )}
                </dl>
              </li>
            ))}
          </ul>

          {data?.meta && (
            <Pagination
              meta={data.meta}
              perPage={perPage}
              perPageOptions={ZONA_LIBRE_PER_PAGE_OPTIONS}
              allowAll={false}
              onPageChange={setPage}
              onPerPageChange={pp => {
                if (pp === 'all') return
                setPerPage(pp as ZonaLibreCatalogoPerPage)
                setPage(1)
              }}
            />
          )}

          <p className="mt-3 text-[12px] text-slate-500">{t('bodega:warehouses.zonaLibre.help')}</p>
        </>
      )}
    </div>
  )
}

/** Texto de un tercero para pintar: saneado de controles y siempre como texto de React; vacío o null -> "—". */
function text(value: string | null): string {
  return displayText(value) ?? '—'
}

function formatPrice(row: ZonaLibreCatalogoRow): string {
  return row.precio === null ? '—' : `$${formatMoney(row.precio)}`
}

/**
 * Miniatura 40x40; sin URL, con una URL no segura o con error de carga, un cuadro neutro con el icono de imagen (la foto es
 * decorativa: `alt=""`). `url_imagen` viene de un TERCERO sin sanear: solo se usa en `<img src>` y solo si `safeImageUrl` la
 * acepta (https, sin credenciales ni caracteres de control, <= 2048); `referrerPolicy="no-referrer"` para no filtrar la
 * dirección de AtlanticERP al host de imágenes; jamás se enlaza (`href`) ni se abre en una pestaña. Sin `crossOrigin`: pedir la imagen
 * en modo CORS la dejaría en blanco si el host de Lafayette no envía `Access-Control-Allow-Origin` (host real por confirmar).
 * El `onError` solo cambia un estado para mostrar el cuadro neutro; no inyecta nada.
 */
function ProductThumb({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false)
  const safe = safeImageUrl(url)
  if (safe === null || failed) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
        <IcoImage size={16} />
      </div>
    )
  }
  return (
    <img
      src={safe}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-md bg-slate-100 object-cover"
    />
  )
}

/** Encabezado ordenable: `<button>` dentro del `th` con `aria-sort`; flecha girada en ascendente y atenuada sin orden. */
function SortTh({ column, label, sortState, onSort, className = '' }: {
  column: ZonaLibreCatalogoSort
  label: string
  sortState: { sort: ZonaLibreCatalogoSort; dir: 'asc' | 'desc' }
  onSort: (column: ZonaLibreCatalogoSort) => void
  className?: string
}) {
  const aria = ariaSortFor(sortState, column)
  return (
    <th
      aria-sort={aria}
      className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 rounded uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5BA5A0]"
      >
        {label}
        <IcoChevronDown
          size={12}
          className={aria === 'ascending' ? 'rotate-180' : aria === 'none' ? 'opacity-30' : ''}
        />
      </button>
    </th>
  )
}
