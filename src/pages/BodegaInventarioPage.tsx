import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useBodegaInventory, useBodegaInventoryFamily, useBodegaInventoryFamiliesList, useBodegaPorServir,
  useBodegaEnCamino, useConfirmPhysicalArrival, useWarehousesList, useProductWarehouseStock,
  useBodegaInventoryProduct,
} from '@/hooks/useBodega'
import type { BodegaInventoryListParams } from '@/api/bodegaApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { IcoClose, IcoAlertTriangle, IcoBan, IcoBox, IcoCheck, IcoImage, IcoFileText } from '@/components/icons'
import { TechnicalSpecModal } from '@/components/TechnicalSpecModal'
import { NewAdjustmentRequestModal } from '@/pages/SolicitudAjustePage'
import type {
  BodegaInventoryRow, BodegaInventoryEstado, BodegaInventoryChip, BodegaInventoryRotationFilter,
  BodegaInventoryFamilyListItem,
} from '@/types/bodega'
import type { ProductSearchResult } from '@/types/bodega'

/**
 * SCRUM-329 Batch B2 (REQ-344→362, SCRUM-414→432) — "Ver Inventario" de Bodega.
 *
 * DECISIÓN DE ARQUITECTURA (documentada a pedido del Arquitecto, ver reporte de la tarea):
 * pantalla NUEVA, no un 3er modo dentro de `pages/InventarioPage.tsx` (Compras). Esa pantalla ya
 * está bastante acoplada a las acciones de escritura de Compras (editar precio/costo, activar
 * proveedor, generar orden por familia, crear producto) vía sus propios `editing`/`editingGeneral`/
 * `confirming` — forzar un 3er modo `bodega` ahí habría significado wrappear cada bloque de esos
 * en 3 condicionales en vez de 2 (`restricted`/`previewVentas`), y las COLUMNAS no coinciden 1:1
 * (Bodega necesita "Bodega(s)"/"Rotación"/"Referencia pública" con nombre propio, sin
 * precio/costo en ningún caso). Se prefirió una pantalla propia que reusa sub-piezas reales
 * (`useWarehousesList`, `useProductWarehouseStock`, `NewAdjustmentRequestModal`,
 * `ventasDisenoApi.catalogProductFamilies`, íconos) en vez de forzar el acoplamiento — mismo
 * criterio que ya se usó para separar `BodegasPage.tsx` (por bodega física) de `InventarioPage.tsx`
 * (por producto, modo Compras/Ventas & Diseño).
 *
 * CONTRATO DE BACKEND: reconciliado contra el controlador real 2026-07-23 (ver `types/bodega.ts`
 * para el detalle de qué cambió respecto al batch especulativo original — nombres de campo,
 * rutas de drill-down, y el diseño de "Confirmar llegada física" que pasó de acción de encabezado
 * a acción por producto). "Por servir" AQUÍ es un concepto DISTINTO al `por_servir` de reservas de
 * Ventas & Diseño que ya expone Compras/`BodegasPage` — no se reusa ese campo tal cual (ver nota
 * de la tarea).
 */

type Tab = 'products' | 'families'
const CHIPS: BodegaInventoryChip[] = ['todos', 'en_atencion', 'inactivos', 'por_ingresar']
// Deep-link-only, sin botón visible — mismo criterio que `LINKABLE_CHIPS` en `InventarioPage.tsx`
// (Compras, REQ-112): "Mayor rotación"/"Artículos críticos" de Home (`BodegaHomePage.tsx`)
// navegan con `?filter=rotacion` / `?filter=criticos` y deben llegar ya filtrados.
// SCRUM-168 RN2 ("Bajo stock sin ordenar" de Gerencia) NO vive acá — Pre-QA v8 confirmó que el
// backend real de ese indicador es `Compras\Services\InventoryKpiService`, expuesto en
// `InventarioPage.tsx` (Compras, `/inventario?chip=bajo_stock_sin_ordenar`), no en este endpoint
// de Bodega (`BodegaInventoryController` no tiene ningún case para ese chip).
type LinkableFilter = BodegaInventoryChip | 'rotacion' | 'criticos'
const LINKABLE_FILTERS: LinkableFilter[] = [...CHIPS, 'rotacion', 'criticos']
const ROTATIONS: BodegaInventoryRotationFilter[] = ['alta', 'media', 'baja', 'compra_unica']
const ESTADOS: BodegaInventoryEstado[] = ['disponible', 'bajo_stock', 'sin_stock']

export default function BodegaInventarioPage() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('products')

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('bodega:inventory.title')}</h1>
          <p className="text-[12px] text-slate-500">{t('bodega:inventory.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/*
            SCRUM-415 (REQ-345) — "Ir a ver Órdenes" debe llevar al listado de Órdenes Zona
            Libre, el único flujo de compra que Bodega puede iniciar (Bodega no tiene
            `compras.write` para el flujo general de Compras). Antes navegaba por error a
            /bodega/pedidos (tablero Kanban de Pedidos, una pantalla completamente distinta) —
            hallazgo de QA (marly.rangel, 2026-07-24).
          */}
          <Button variant="outline" onClick={() => navigate('/bodega/ordenes-zona-libre')}>
            {t('bodega:inventory.actions.goToOrders')}
          </Button>
          {/*
            SCRUM-433 (REQ-345, rebote de Daniela Amaya 2026-08-13, con video) — "+ Nueva orden de
            compra" navegaba a la BANDEJA de Órdenes Zona Libre (`/bodega/ordenes-zona-libre`),
            una parada intermedia: el usuario tenía que volver a pulsar el botón propio de esa
            bandeja para recién ahí llegar al formulario real. RN1: debe ir DIRECTO al formulario
            de creación (`/bodega/ordenes-zona-libre/nueva`), en un solo clic — mismo destino al
            que ya navega el botón "+ Nueva orden de compra" DENTRO de la bandeja (ese no cambia).
          */}
          <Button onClick={() => navigate('/bodega/ordenes-zona-libre/nueva')}>
            {t('bodega:inventory.actions.newPurchaseOrder')}
          </Button>
        </div>
      </div>

      <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-4 w-fit">
        <Button
          variant={tab === 'products' ? 'primary' : 'secondary'}
          className="!rounded-none !border-0"
          onClick={() => setTab('products')}
        >
          {t('bodega:inventory.tabs.products')}
        </Button>
        <Button
          variant={tab === 'families' ? 'primary' : 'secondary'}
          className="!rounded-none !border-0"
          onClick={() => setTab('families')}
        >
          {t('bodega:inventory.tabs.families')}
        </Button>
      </div>

      {tab === 'products' ? <ProductsTab /> : <FamiliesTab />}
    </div>
  )
}

/** REQ-419 — "Compra única" no es un valor real de `rotation` en el backend (ver nota en
 * `types/bodega.ts`); se interpreta como "sin clasificar" (`rotation === null`). Filtro aplicado
 * client-side sobre la página ya traída del backend en vez de mandarse como parámetro, porque el
 * backend (contrato especulativo) solo conoce alta/media/baja — el resto de filtros SÍ viajan al
 * backend en `useBodegaInventory`. */
function matchesRotationFilter(row: BodegaInventoryRow, filter: BodegaInventoryRotationFilter): boolean {
  if (filter === 'compra_unica') return row.rotation === null
  return row.rotation === filter
}

function ProductsTab() {
  const { t } = useTranslation(['common', 'bodega'])
  const [searchParams] = useSearchParams()

  // REQ-432/362 — deep-link desde Home ("Mayor rotación" -> ?filter=rotacion, "Artículos
  // críticos" -> ?filter=criticos), llega ya filtrado sin necesitar un clic adicional.
  const linkedFilter = LINKABLE_FILTERS.includes(searchParams.get('filter') as LinkableFilter)
    ? (searchParams.get('filter') as LinkableFilter)
    : 'todos'

  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<LinkableFilter>(linkedFilter)
  const [categoria, setCategoria] = useState('')
  const [estado, setEstado] = useState<BodegaInventoryEstado | ''>('')
  const [rotacionFilter, setRotacionFilter] = useState<BodegaInventoryRotationFilter | ''>('')
  const [warehouseId, setWarehouseId] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [marca, setMarca] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data: families } = useBodegaInventoryFamiliesList()
  const { data: warehousesData } = useWarehousesList()
  const warehouses = warehousesData?.data ?? []

  const listParams: BodegaInventoryListParams = {
    search: query || undefined,
    family_id: categoria ? Number(categoria) : undefined,
    estado: estado || undefined,
    // 'compra_unica' no viaja al backend (ver `matchesRotationFilter`) — solo alta/media/baja.
    rotation: rotacionFilter && rotacionFilter !== 'compra_unica' ? rotacionFilter : undefined,
    warehouse_id: warehouseId ? Number(warehouseId) : undefined,
    // `proveedor` (estado local) ahora guarda el ID del proveedor (fix SCRUM-419/422 2026-07-28:
    // la faceta `providers` de `BodegaInventoryListResponse` trae `{id, name}`, no solo el nombre).
    provider_id: proveedor ? Number(proveedor) : undefined,
    brand: marca || undefined,
    chip: chip === 'todos' ? undefined : chip,
    page, per_page: perPage,
  }
  const { data, isFetching } = useBodegaInventory(listParams)

  const rowsRaw = data?.data ?? []
  const rows = rotacionFilter === 'compra_unica'
    ? rowsRaw.filter(r => matchesRotationFilter(r, 'compra_unica'))
    : rowsRaw
  const kpis = data?.kpis

  const handleSearch = () => { setQuery(search); setPage(1) }

  const clearFilters = () => {
    setSearch(''); setQuery(''); setCategoria(''); setEstado(''); setRotacionFilter('')
    setWarehouseId(''); setProveedor(''); setMarca(''); setChip('todos'); setPage(1)
  }

  return (
    <div>
      {kpis && (
        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <KpiCard label={t('bodega:inventory.kpis.total')} value={String(kpis.total_products)} color="#5BA5A0" />
          <KpiCard label={t('bodega:inventory.kpis.lowStock')} value={String(kpis.low_stock)} color="#d4a017" />
          <KpiCard label={t('bodega:inventory.kpis.outOfStock')} value={String(kpis.out_of_stock)} color="#dc6b6b" />
          <KpiCard
            label={t('bodega:inventory.kpis.inAttention')}
            value={String(kpis.in_attention)}
            sublabel={t('bodega:inventory.kpis.inAttentionHelp')}
            color="#dc6b6b"
          />
          <KpiCard label={t('bodega:inventory.kpis.totalToServe')} value={String(kpis.total_por_servir)} color="#9fc54d" />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('bodega:inventory.filters.searchPlaceholder')}
          className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <Button variant="outline" onClick={handleSearch}>{t('common:actions.search')}</Button>

        <select value={categoria} onChange={e => { setCategoria(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white dark:bg-slate-800">
          <option value="">{t('bodega:inventory.filters.category')}</option>
          {(families?.data ?? []).map((f: { id: number; name: string }) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <select value={estado} onChange={e => { setEstado(e.target.value as BodegaInventoryEstado | ''); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white dark:bg-slate-800">
          <option value="">{t('bodega:inventory.filters.status')}</option>
          {ESTADOS.map(s => <option key={s} value={s}>{t(`bodega:inventory.status.${s}`)}</option>)}
        </select>

        <select value={rotacionFilter} onChange={e => { setRotacionFilter(e.target.value as BodegaInventoryRotationFilter | ''); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white dark:bg-slate-800">
          <option value="">{t('bodega:inventory.filters.rotation')}</option>
          {ROTATIONS.map(r => <option key={r} value={r}>{t(`bodega:inventory.rotation.${r}`)}</option>)}
        </select>

        <select value={warehouseId} onChange={e => { setWarehouseId(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white dark:bg-slate-800">
          <option value="">{t('bodega:inventory.filters.warehouse')}</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>

        <select value={proveedor} onChange={e => { setProveedor(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white dark:bg-slate-800">
          <option value="">{t('bodega:inventory.filters.provider')}</option>
          {(data?.providers ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select value={marca} onChange={e => { setMarca(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white dark:bg-slate-800">
          <option value="">{t('bodega:inventory.filters.brand')}</option>
          {(data?.brands ?? []).map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <Button variant="outline" onClick={clearFilters}>{t('bodega:inventory.filters.clear')}</Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button variant="outline" active={chip === 'todos'} activeVariant="primary"
          className="!text-xs !px-3 !py-1.5" onClick={() => { setChip('todos'); setPage(1) }}>
          {t('bodega:inventory.chips.todos')}
        </Button>
        <Button variant="outline" active={chip === 'en_atencion'} activeVariant="primary"
          className="!text-xs !px-3 !py-1.5 !inline-flex !items-center !gap-1.5" onClick={() => { setChip('en_atencion'); setPage(1) }}>
          <IcoAlertTriangle size={13} />{t('bodega:inventory.chips.en_atencion')}
        </Button>
        <Button variant="outline" active={chip === 'inactivos'} activeVariant="primary"
          className="!text-xs !px-3 !py-1.5 !inline-flex !items-center !gap-1.5" onClick={() => { setChip('inactivos'); setPage(1) }}>
          <IcoBan size={13} />{t('bodega:inventory.chips.inactivos')}
        </Button>
        <Button variant="outline" active={chip === 'por_ingresar'} activeVariant="primary"
          className="!text-xs !px-3 !py-1.5 !inline-flex !items-center !gap-1.5" onClick={() => { setChip('por_ingresar'); setPage(1) }}>
          <IcoBox size={13} />{t('bodega:inventory.chips.por_ingresar')}
        </Button>
      </div>

      <BodegaInventoryProductsTable rows={rows} isFetching={isFetching} />

      {data?.meta && (
        <Pagination
          meta={data.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
        />
      )}
    </div>
  )
}

/**
 * SCRUM-418 (REQ-418, rebote de Daniela Amaya 2026-08-12) — extraída de `ProductsTab` para que
 * el acordeón de "Familias" (`FamiliesTab` más abajo) reuse EXACTAMENTE la misma tabla de 14
 * columnas (mismo componente, no una segunda implementación que pudiera desincronizarse) al
 * expandir una familia. Dueña de sus propios modales (detalle/bodegas/por servir/en camino/
 * ajuste) — cada instancia (Productos, o cada familia expandida) tiene su propio estado, sin
 * compartirlo entre sí.
 */
function BodegaInventoryProductsTable({ rows, isFetching }: { rows: BodegaInventoryRow[]; isFetching?: boolean }) {
  const { t } = useTranslation(['common', 'bodega'])

  // Fix Pre-QA 2026-07-23 (SCRUM-427 RN2) — guardar solo el id, no el objeto `row` completo:
  // antes, `detailRow` era un snapshot congelado tomado en el momento del click, asi que
  // cuando `useConfirmPhysicalArrival` invalidaba y refrescaba `bodega/inventory` DESPUES de
  // confirmar, el modal seguia leyendo el `arrival_confirmation` VIEJO (pending_bodega_action
  // todavia true) y el boton "Confirmar llegada fisica" volvia a aparecer en vez de la nota de
  // espera, sin necesidad de cerrar y reabrir el modal. Derivar el row en vivo desde `rows` (mas
  // abajo) lo mantiene sincronizado con cada refetch. Ver docs/pre-qa/bloque-b2-ver-inventario-20260723.md.
  const [detailRowId, setDetailRowId] = useState<number | null>(null)
  const [breakdownRow, setBreakdownRow] = useState<BodegaInventoryRow | null>(null)
  const [porServirRow, setPorServirRow] = useState<BodegaInventoryRow | null>(null)
  const [enCaminoRow, setEnCaminoRow] = useState<BodegaInventoryRow | null>(null)
  const [adjustingRow, setAdjustingRow] = useState<BodegaInventoryRow | null>(null)

  return (
    <>
      <Card variant="panel" className="overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {/*
                SCRUM-421 (REQ-351) — columna de imagen, primera del header. El mockup adjunto
                (3B) confirma que este encabezado va vacío a propósito (es la miniatura del
                producto, sin título de columna) — `sr-only` para no dejar la columna sin
                nombre accesible para lectores de pantalla.
              */}
              <Th><span className="sr-only">{t('bodega:inventory.table.image')}</span></Th>
              <Th>{t('bodega:inventory.table.publicRef')}</Th>
              <Th>{t('bodega:inventory.table.product')}</Th>
              <Th>{t('bodega:inventory.table.category')}</Th>
              <Th>{t('bodega:inventory.table.rotation')}</Th>
              <Th>{t('bodega:inventory.table.warehouses')}</Th>
              <Th>{t('bodega:inventory.table.available')}</Th>
              <Th>{t('bodega:inventory.table.toServe')}</Th>
              <Th>{t('bodega:inventory.table.totalStock')}</Th>
              <Th>{t('bodega:inventory.table.toReceive')}</Th>
              <Th>{t('bodega:inventory.table.inTransit')}</Th>
              <Th>{t('bodega:inventory.table.minStock')}</Th>
              <Th>{t('bodega:inventory.table.status')}</Th>
              <Th>{t('bodega:inventory.table.provider')}</Th>
              <Th>{t('bodega:inventory.table.action')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={15} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('bodega:inventory.empty')}
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr
                key={row.id}
                className={`hover:bg-slate-50 transition-colors cursor-pointer ${!row.is_active ? 'opacity-50' : ''}`}
                onClick={() => setDetailRowId(row.id)}
              >
                <td className="px-4 py-3">
                  {row.photo_url ? (
                    <img
                      src={row.photo_url}
                      alt={row.description}
                      className="w-10 h-10 rounded object-cover border border-slate-200"
                    />
                  ) : (
                    <IcoImage size={20} className="text-slate-300" />
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-slate-800">
                  {row.reference}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {row.description}
                </td>
                <td className="px-4 py-3 text-slate-600">{row.family_name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">
                  {row.rotation ? t(`bodega:inventory.rotation.${row.rotation}`) : t('bodega:inventory.rotation.compra_unica')}
                </td>
                <td className="px-4 py-3">
                  <button className="text-primary underline text-xs" onClick={e => { e.stopPropagation(); setBreakdownRow(row) }}>
                    {t('bodega:inventory.table.warehousesCount', { count: row.warehouse_count })}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.disponible}</td>
                <td className="px-4 py-3">
                  <button className="text-primary underline text-xs" onClick={e => { e.stopPropagation(); setPorServirRow(row) }}>
                    {row.por_servir}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.stock_total ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{row.por_ingresar > 0 ? row.por_ingresar : '—'}</td>
                <td className="px-4 py-3">
                  <button className="text-primary underline text-xs" onClick={e => { e.stopPropagation(); setEnCaminoRow(row) }}>
                    {row.en_camino}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.reorder_point ?? '—'}</td>
                <td className="px-4 py-3"><EstadoBadge estado={row.estado} /></td>
                <td className="px-4 py-3 text-slate-600">{row.provider_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <Button variant="outline" className="!text-xs !px-2 !py-1" onClick={e => { e.stopPropagation(); setAdjustingRow(row) }}>
                    {t('bodega:inventory.actions.requestAdjustment')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {detailRowId !== null && (() => {
        const liveDetailRow = rows.find(r => r.id === detailRowId) ?? null
        return liveDetailRow
          ? <ProductDetailModal row={liveDetailRow} onClose={() => setDetailRowId(null)} />
          : null
      })()}
      {breakdownRow && <WarehouseBreakdownModal row={breakdownRow} onClose={() => setBreakdownRow(null)} />}
      {porServirRow && <PorServirModal row={porServirRow} onClose={() => setPorServirRow(null)} />}
      {enCaminoRow && <EnCaminoModal row={enCaminoRow} onClose={() => setEnCaminoRow(null)} />}
      {adjustingRow && (
        <NewAdjustmentRequestModal
          onClose={() => setAdjustingRow(null)}
          initialProduct={{ id: adjustingRow.id, reference: adjustingRow.reference, description: adjustingRow.description } as ProductSearchResult}
        />
      )}
    </>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  )
}

function KpiCard({ label, value, sublabel, color }: { label: string; value: string; sublabel?: string; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: `${color}18` }}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold leading-none" style={{ color }}>{value}</div>
      {sublabel && <div className="text-[11px] text-slate-400 mt-1">{sublabel}</div>}
    </div>
  )
}

function EstadoBadge({ estado }: { estado: BodegaInventoryEstado }) {
  const { t } = useTranslation('bodega')
  const colors: Record<BodegaInventoryEstado, string> = {
    disponible: 'bg-emerald-50 text-emerald-700',
    bajo_stock: 'bg-amber-50 text-amber-700',
    sin_stock:  'bg-red-50 text-red-700',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colors[estado]}`}>
      {t(`inventory.status.${estado}`)}
    </span>
  )
}

/** SCRUM-431 (REQ-361) — modal "Ver detalle", solo lectura. Se arma con los datos que YA trae la
 * fila de la tabla (sin un fetch aparte) — la tabla ya expone todos los campos que el ticket pide
 * mostrar; agregar un endpoint de detalle solo para repetir el mismo dato hubiera sido una
 * segunda fuente de verdad sin necesidad real.
 *
 * SCRUM-427 (REQ-357) — "Confirmar llegada física" vive ACÁ (no de encabezado, ver
 * reconciliación de contrato en `types/bodega.ts`/docblock del archivo): mismo lugar que el
 * mockup real (`pd-confirmar-llegada-btn` dentro del detalle del producto), gateado por
 * `row.arrival_confirmation` — botón cuando `pending_bodega_action`, nota de espera cuando
 * `awaiting_compras` (RN2: ambos pueden darse a la vez con un reparto parcial). */
function ProductDetailModal({ row, onClose }: { row: BodegaInventoryRow; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const [confirming, setConfirming] = useState(false)
  // SCRUM-425 (REQ-355) — "Ver ficha técnica", mismo modal compartido con Compras
  // (`components/TechnicalSpecModal.tsx`). Hallazgo de QA (marly.rangel, 2026-07-27): el botón
  // existía en Compras > Inventario pero faltaba acá — el ticket dice UBICACION "Ver inventario"
  // y PERMISOS "Visible para todos los perfiles de Bodega".
  const [showTechnicalSpec, setShowTechnicalSpec] = useState(false)
  const { data: detail } = useBodegaInventoryProduct(showTechnicalSpec ? row.id : null)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        {/* Rebote REQ-361/SCRUM-431 (Daniela Amaya 2026-08-13) — el título genérico "Detalle del
            producto" se reemplaza por el nombre real + categoría (Bloque 1 del mockup), con el
            botón de cerrar alineado a la derecha del nombre. */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-base font-bold text-slate-900">{row.name}</h2>
            <p className="text-xs text-slate-500">{row.category ?? t('bodega:inventory.detailModal.noCategory')}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0"><IcoClose /></button>
        </div>
        <hr className="my-3 border-slate-200" />
        {/* Fix Pre-QA 2026-07-23 (SCRUM-431 RN1) — el modal no mostraba ningun aviso cuando el
            producto esta marcado Inactivo por Compras (Escenario 1 de REQ-361 lo pide
            explicitamente); solo la fila de la tabla tenia opacidad reducida. Aviso informativo,
            SIN boton de reactivar (exclusivo de Compras). */}
        {!row.is_active && (
          <div className="mb-4 p-2 rounded bg-slate-100 border border-slate-300 text-xs text-slate-600 flex items-center gap-1.5">
            <IcoBan size={13} />
            {t('bodega:inventory.detailModal.inactiveBanner')}
          </div>
        )}

        {/* Bloque 1 — indicadores operativos: 2 filas de 4 columnas + 1 fila de En camino,
            exactamente el agrupamiento del mockup (RN2/Escenario 3). */}
        <div className="grid grid-cols-4 gap-3 mb-3 text-sm">
          <Field label={t('bodega:inventory.table.rotation')} value={row.rotation ? t(`bodega:inventory.rotation.${row.rotation}`) : t('bodega:inventory.rotation.compra_unica')} />
          <Field label={t('bodega:inventory.table.status')} value={t(`bodega:inventory.status.${row.estado}`)} />
          <Field label={t('bodega:inventory.table.provider')} value={row.provider_name ?? '—'} />
          <Field label={t('bodega:inventory.table.minStock')} value={row.reorder_point ?? '—'} />
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3 text-sm">
          <Field label={t('bodega:inventory.table.available')} value={row.disponible} />
          <Field label={t('bodega:inventory.table.toServe')} value={row.por_servir} />
          <Field label={t('bodega:inventory.table.totalStock')} value={row.stock_total ?? '—'} />
          <Field label={t('bodega:inventory.table.toReceive')} value={row.por_ingresar} />
        </div>
        <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
          <Field label={t('bodega:inventory.table.inTransit')} value={row.en_camino} />
        </div>
        <hr className="my-3 border-slate-200" />

        {/* Bloque 2 — "Información del producto" (RN2/Escenario 4): referencias, marca/código de
            barras, familia con texto de ayuda siempre visible, descripción, ficha técnica. */}
        <h3 className="text-sm font-bold text-slate-800 mb-3">{t('bodega:inventory.detailModal.sectionInfo')}</h3>
        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
          <Field label={t('bodega:warehouses.table.factoryRef')} value={row.factory_reference ?? '—'} />
          <Field label={t('bodega:inventory.table.publicRef')} value={row.reference} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
          <Field label={t('bodega:inventory.detailModal.brand')} value={row.brand ?? '—'} />
          <Field label={t('bodega:inventory.detailModal.barcode')} value={row.barcode ?? '—'} />
        </div>
        {/* Fix Pre-QA 2026-07-23 (SCRUM-431 RN2), texto de ayuda SIEMPRE visible (RN4) — antes
            reusaba la etiqueta "Categoria" de la tabla; el criterio pide literalmente el campo
            "Familia", marcado opcional con texto de ayuda incluso sin valor asignado. */}
        <div className="mb-3 text-sm">
          <div className="text-[10px] uppercase text-slate-400 font-bold">{t('bodega:inventory.detailModal.familyLabel')}</div>
          <div className="text-slate-700">{row.family_name ?? '—'}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{t('bodega:inventory.detailModal.familyHelp')}</div>
        </div>
        <div className="mb-4 text-sm">
          <Field label={t('bodega:inventory.detailModal.description')} value={row.description || '—'} />
        </div>

        <div className="mb-4">
          <Button
            variant="outline" className="!text-xs inline-flex items-center gap-1.5"
            onClick={() => setShowTechnicalSpec(true)}
          >
            <IcoFileText size={14} />
            {t('bodega:inventory.technicalSpec.button')}
          </Button>
        </div>

        {row.arrival_confirmation.pending_bodega_action && !confirming && (
          <div className="mb-4">
            <Button variant="outline" onClick={() => setConfirming(true)}>
              {t('bodega:inventory.actions.confirmArrival')}
            </Button>
          </div>
        )}
        {row.arrival_confirmation.awaiting_compras && !confirming && (
          <p className="text-[13px] font-semibold mb-4" style={{ color: 'var(--color-primary-dark, #3D7E7A)' }}>
            {row.arrival_confirmation.confirmed_by_name
              ? t('bodega:inventory.confirmArrivalModal.awaitingComprasDetail', {
                  count: row.arrival_confirmation.confirmed_quantity,
                  user: row.arrival_confirmation.confirmed_by_name,
                })
              : t('bodega:inventory.confirmArrivalModal.awaitingCompras')}
          </p>
        )}
        {confirming && (
          <ConfirmArrivalForm productId={row.id} onDone={() => setConfirming(false)} />
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>{t('bodega:inventory.actions.close')}</Button>
        </div>
      </Card>

      {showTechnicalSpec && (
        <TechnicalSpecModal
          reference={row.reference}
          spec={detail?.technical_spec}
          title={t('bodega:inventory.technicalSpec.title')}
          fieldLabel={key => t(`bodega:inventory.technicalSpec.fields.${key}`)}
          emptyText={t('bodega:inventory.technicalSpec.empty')}
          closeLabel={t('bodega:inventory.actions.close')}
          onClose={() => setShowTechnicalSpec(false)}
        />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-400 font-bold">{label}</div>
      <div className="text-slate-700">{value}</div>
    </div>
  )
}

/** SCRUM-422 (REQ-353) — modal desglose "Bodega(s)". Reusa `useProductWarehouseStock` (ya real,
 * `bodega.read`, mismo endpoint que ya consume `SolicitudAjustePage.tsx`) en vez de inventar un
 * segundo endpoint de desglose por bodega — misma fuente, un solo lugar de verdad. */
function WarehouseBreakdownModal({ row, onClose }: { row: BodegaInventoryRow; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data } = useProductWarehouseStock(row.id)
  // Pre-QA 2026-07-28 (SCRUM-422 re-check) — `useProductWarehouseStock` pega a
  // `WarehouseStockService::breakdownForProducts()` (compartido con SolicitudAjustePage, que sí
  // necesita ver las 7 bodegas para poder elegir un destino en 0), no al endpoint ya filtrado de
  // `BodegaInventoryController::warehouseBreakdown()`. Ese servicio devuelve SIEMPRE las 7 bodegas
  // del sistema, con quantity=0 en las que no tienen stock — RN1 de este ticket ("solo muestra las
  // bodegas donde el producto tiene stock registrado, sin inventar cantidades donde no hay dato")
  // exige filtrar acá, sin tocar el servicio compartido (rompería el caso de uso legítimo de
  // Solicitud de Ajuste).
  const warehouses = (data?.warehouses ?? []).filter(w => w.quantity > 0)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:inventory.warehouseModal.title', { reference: row.reference })}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        <ul className="text-sm mb-2">
          {warehouses.map(w => (
            <li key={w.warehouse_id} className="flex justify-between py-1.5 border-b border-slate-100">
              <span>{w.name}</span>
              <span className="font-medium">{w.quantity}</span>
            </li>
          ))}
          {data && warehouses.length === 0 && (
            <li className="text-slate-400 text-xs py-2">{t('bodega:inventory.warehouseModal.empty')}</li>
          )}
        </ul>
        <div className="flex justify-end mt-3">
          <Button variant="outline" onClick={onClose}>{t('bodega:inventory.actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}

/** SCRUM-423 (REQ-354) — modal "Por servir": clientes/pedidos comprometidos, con mensaje cuando
 * no hay nada (nunca la nota de "data de ejemplo" del mockup — REQ-354 pide dato real). */
function PorServirModal({ row, onClose }: { row: BodegaInventoryRow; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data, isLoading } = useBodegaPorServir(row.id)
  const lines = data?.data ?? []

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:inventory.porServirModal.title', { reference: row.reference })}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        {!isLoading && lines.length === 0 && (
          <p className="text-slate-400 text-sm py-4 text-center">{t('bodega:inventory.porServirModal.empty')}</p>
        )}
        <ul className="text-sm mb-2">
          {lines.map(l => (
            <li key={l.order_id} className="py-1.5 border-b border-slate-100 flex justify-between">
              <span>{l.order_number} — {l.customer_name ?? '—'}</span>
              <span className="font-medium">{l.quantity}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end mt-3">
          <Button variant="outline" onClick={onClose}>{t('bodega:inventory.actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}

/** SCRUM-424 (REQ-355) — modal "En camino": proveedor/fecha real de la orden, con mensaje cuando
 * no hay nada. */
function EnCaminoModal({ row, onClose }: { row: BodegaInventoryRow; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data, isLoading } = useBodegaEnCamino(row.id)
  const lines = data?.data ?? []

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:inventory.enCaminoModal.title', { reference: row.reference })}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        {!isLoading && lines.length === 0 && (
          <p className="text-slate-400 text-sm py-4 text-center">{t('bodega:inventory.enCaminoModal.empty')}</p>
        )}
        <ul className="text-sm mb-2">
          {lines.map(l => (
            <li key={l.purchase_order_id} className="py-1.5 border-b border-slate-100">
              <div className="flex justify-between">
                <span>{l.provider_name ?? '—'}</span>
                <span className="font-medium">{l.quantity}</span>
              </div>
              <div className="text-xs text-slate-400 flex justify-between">
                <span>{t('bodega:inventory.enCaminoModal.order', { id: l.purchase_order_id })}</span>
                <span>{l.estimated_arrival_date ?? t('bodega:inventory.enCaminoModal.noDate')}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-end mt-3">
          <Button variant="outline" onClick={onClose}>{t('bodega:inventory.actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}

/**
 * SCRUM-427 (REQ-357) — formulario "Confirmar llegada física", embebido en `ProductDetailModal`
 * (ver reconciliación de contrato: acción POR PRODUCTO, no de encabezado). Un solo input de
 * "Cantidad entregada" — `ArrivalConfirmationService::confirmArrival()` reparte esa cantidad FIFO
 * entre las líneas pendientes de este producto y devuelve error 422 si supera lo pedido, RN
 * validada server-side (no hay "cantidad pedida" única que mostrar client-side de antemano cuando
 * hay varias líneas parciales).
 */
function ConfirmArrivalForm({ productId, onDone }: { productId: number; onDone: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const confirmArrival = useConfirmPhysicalArrival()
  const [cantidad, setCantidad] = useState('')
  // Fix Pre-QA 2026-07-23 — antes, cantidad invalida (0/vacio) hacia un `return` silencioso: el
  // usuario apretaba "Confirmar" y no pasaba absolutamente nada, sin ningun mensaje. Ahora se
  // muestra una validacion inline explicita en vez de un no-op mudo.
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = () => {
    const n = Number(cantidad)
    if (!cantidad || Number.isNaN(n) || n < 1) {
      setLocalError(t('bodega:inventory.confirmArrivalModal.errors.invalidQuantity'))
      return
    }
    setLocalError(null)
    confirmArrival.mutate(
      { id: productId, payload: { cantidad_entregada: n } },
      { onSuccess: onDone },
    )
  }

  // Fix Pre-QA 2026-07-23 — antes siempre mostraba el mensaje generico aunque el backend ya
  // devolviera el detalle real (ej. "La cantidad entregada no puede superar lo pedido pendiente
  // (25 unidades)."), perdiendo la unica pista util que tiene Bodega para corregir la cantidad.
  const backendMessage = isAxiosError<{ message?: string }>(confirmArrival.error)
    ? confirmArrival.error.response?.data?.message
    : undefined

  return (
    <div className="mb-4 p-3 rounded-lg border border-slate-200">
      <label className="block text-[11px] uppercase text-slate-400 font-bold mb-1">
        {t('bodega:inventory.confirmArrivalModal.qtyDelivered')}
      </label>
      <div className="flex gap-2 items-start">
        <input
          type="number" min={1}
          value={cantidad}
          onChange={e => { setCantidad(e.target.value); setLocalError(null) }}
          className="w-24 px-2 py-1 border border-slate-300 rounded text-sm"
        />
        <Button onClick={handleSubmit} loading={confirmArrival.isPending}>
          {t('bodega:inventory.actions.confirmAndNotify')}
        </Button>
      </div>
      {localError && (
        <p className="text-red-600 text-xs mt-2">{localError}</p>
      )}
      {confirmArrival.isSuccess && (
        <p className="text-emerald-700 text-xs mt-2 flex items-center gap-1"><IcoCheck size={12} />{t('bodega:inventory.confirmArrivalModal.success')}</p>
      )}
      {confirmArrival.isError && (
        <p className="text-red-600 text-xs mt-2">{backendMessage ?? t('bodega:inventory.confirmArrivalModal.errors.generic')}</p>
      )}
    </div>
  )
}

/**
 * REQ-417/418 — pestaña "Familias", SIN "Generar compra" (Bodega no tiene `compras.edit`) y sin
 * costo/valor total en ningún caso (a diferencia del modo `restricted` opcional de la misma
 * pestaña en Compras).
 *
 * SCRUM-418 (rebote de Daniela Amaya 2026-08-12) — reescrita como ACORDEÓN: antes clickear una
 * familia reemplazaba TODA la vista por un "back + lista plana sin encabezados" (se sentía como
 * navegar a otra pantalla, aunque técnicamente fuera el mismo componente sin cambio de ruta). Ahora
 * la lista de familias se mantiene siempre visible; clickear una expande/colapsa su detalle en el
 * mismo lugar, sin perder el contexto de las demás. El detalle expandido muestra la MISMA tabla de
 * 14 columnas que "Productos" (`BodegaInventoryProductsTable`, arriba en este archivo), no una
 * lista reducida. Etiqueta "[N] producto(s)" explícita (antes solo el número pelado).
 */
function FamiliesTab() {
  const { t } = useTranslation(['common', 'bodega'])
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: families } = useBodegaInventoryFamiliesList()

  return (
    <Card variant="panel" className="divide-y divide-slate-100 overflow-hidden">
      {(families?.data ?? []).map(f => (
        <FamilyAccordionItem
          key={f.id}
          family={f}
          expanded={expandedId === f.id}
          onToggle={() => setExpandedId(current => current === f.id ? null : f.id)}
        />
      ))}
      {(families?.data ?? []).length === 0 && (
        <p className="text-slate-400 text-sm py-4 px-3">{t('bodega:inventory.families.empty')}</p>
      )}
    </Card>
  )
}

function FamilyAccordionItem({ family, expanded, onToggle }: {
  family: BodegaInventoryFamilyListItem
  expanded: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  // Solo se pide el detalle una vez expandida (mismo criterio que el resto de modales on-demand
  // del módulo) — no hace 5 llamadas al renderizar la lista completa de familias.
  const { data: detail, isLoading } = useBodegaInventoryFamily(expanded ? family.id : null)

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-3 hover:bg-slate-50 flex justify-between items-center text-sm"
        aria-expanded={expanded}
      >
        <span className="font-medium text-slate-800">{family.name}</span>
        <span className="text-slate-400 text-xs">
          {t('bodega:inventory.families.productsCount', { count: family.product_count })}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          {isLoading || !detail ? (
            <p className="text-slate-400 text-sm py-4">{t('common:labels.loading')}</p>
          ) : detail.products.length === 0 ? (
            <p className="text-slate-400 text-sm py-4">{t('bodega:inventory.families.empty')}</p>
          ) : (
            <BodegaInventoryProductsTable rows={detail.products} />
          )}
        </div>
      )}
    </div>
  )
}
