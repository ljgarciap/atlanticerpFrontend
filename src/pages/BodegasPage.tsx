import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  useWarehousesList, useWarehouseDetail,
  useRelocationRequests, useCreateRelocationRequest, useApproveRelocationRequest, useRejectRelocationRequest,
  useWarehouseLocations, useCreateWarehouseLocation, useUpdateWarehouseLocation,
} from '@/hooks/useBodega'
import { useComprasSettings } from '@/hooks/useCompras'
import { useAuthStore } from '@/store/authStore'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { IcoClose } from '@/components/icons'
import { isWarehouseEmptyLocationRow } from '@/types/bodega'
import type {
  WarehouseProductRow, WarehouseEmptyLocationRow, PhysicalWarehouse,
  RelocationEstadoFilter, RelocationRequest, WarehouseLocationRow,
} from '@/types/bodega'

/** SCRUM-451→456 (REQ-381→386) — pantalla "Bodegas": selector de las 7 bodegas físicas, KPIs,
 * filtros y tabla de productos por ubicación física.
 * SCRUM-454/457/458/459 (Bloque B4, REQ-384/387/388/389) — ver ADR-SCRUM454-459-reubicacion-bodegas.md:
 * chip "Espacio libre" con datos reales, botón "Reubicar" activado + modal, bandeja "Solicitudes
 * de reubicación" y administración del catálogo de ubicaciones físicas. */
export default function BodegasPage() {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: warehousesData } = useWarehousesList()
  const warehouses = warehousesData?.data ?? []

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [chip, setChip] = useState<'todos' | 'espacio_libre'>('todos')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [categoria, setCategoria] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [relocatingRow, setRelocatingRow] = useState<WarehouseProductRow | null>(null)
  const [showRequestsModal, setShowRequestsModal] = useState(false)
  const [showLocationsModal, setShowLocationsModal] = useState(false)
  // SCRUM-754 (rebote 2026-08-18) — único listado de Bodega sin paginar del batch de
  // estandarización. Una sola página/perPage para ambas tablas (chip "todos" y "espacio_libre"):
  // nunca se muestran a la vez, mismo criterio que el resto de la pantalla con el chip.
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  // REQ-381 RN1 — Bodega Central es la vista por defecto al entrar a la pantalla.
  const activeId = selectedId ?? warehouses[0]?.id ?? null

  const { data: families } = useQuery({
    queryKey: ['ventas-diseno/catalog-product-families'],
    queryFn:  () => ventasDisenoApi.catalogProductFamilies.list(),
    staleTime: 300_000,
  })

  const { data, isFetching } = useWarehouseDetail(activeId, {
    search: query || undefined,
    categoria: categoria ? Number(categoria) : undefined,
    ubicacion: ubicacion || undefined,
    chip,
    page, per_page: perPage,
  })

  const selectWarehouse = (id: number) => {
    setSelectedId(id)
    setChip('todos')
    setSearch('')
    setQuery('')
    setCategoria('')
    setUbicacion('')
    setPage(1)
  }

  const clearFilters = () => {
    setSearch('')
    setQuery('')
    setCategoria('')
    setUbicacion('')
    setPage(1)
  }

  const showClienteColumn = data?.warehouse.modo_detalle === 'cliente'
  const isUbicacionExacta = data?.warehouse.modo_detalle === 'ubicacion_exacta'
  // El discriminador (`isWarehouseEmptyLocationRow`) es la fuente de verdad sobre la forma de cada
  // fila — más robusto que confiar solo en `chip`, que puede seguir en un valor mientras `data`
  // todavía trae la respuesta de la petición anterior (in-flight refetch al cambiar de chip).
  const rows = (data?.data ?? []) as Array<WarehouseProductRow | WarehouseEmptyLocationRow>
  const productRows = rows.filter((r): r is WarehouseProductRow => !isWarehouseEmptyLocationRow(r))
  const emptyLocationRows = rows.filter(isWarehouseEmptyLocationRow)

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-start justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('bodega:warehouses.title')}</h1>
          <p className="text-[12px] text-slate-500">{t('bodega:warehouses.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isUbicacionExacta && (
            <Button variant="outline" className="!text-xs !px-3 !py-1.5" onClick={() => setShowLocationsModal(true)}>
              {t('bodega:warehouses.locations.manageButton')}
            </Button>
          )}
          <Button variant="outline" className="!text-xs !px-3 !py-1.5" onClick={() => setShowRequestsModal(true)}>
            {t('bodega:warehouses.relocationRequests.openButton')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5 border-b border-slate-200 pb-3">
        {warehouses.map(w => (
          <Button
            key={w.id}
            variant="outline"
            active={activeId === w.id}
            activeVariant="primary"
            className="!text-xs !px-3 !py-1.5"
            onClick={() => selectWarehouse(w.id)}
          >
            {w.name}
          </Button>
        ))}
      </div>

      {data && (
        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <KpiCard label={t('bodega:warehouses.kpis.responsable')} value={data.kpis.responsable ?? '—'} color="#5BA5A0" />
          <KpiCard
            label={t('bodega:warehouses.kpis.totalProducts')}
            value={String(data.kpis.total_products)}
            sublabel={t('bodega:warehouses.kpis.totalUnits', { count: data.kpis.total_units })}
            color="#9fc54d"
          />
          <KpiCard
            label={t('bodega:warehouses.kpis.capacityUsed')}
            value={data.kpis.capacidad_pct !== null ? `${data.kpis.capacidad_pct}%` : t('bodega:warehouses.kpis.noData')}
            color={data.kpis.capacidad_pct !== null ? '#5BA5A0' : '#94a3b8'}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setQuery(search); setPage(1) } }}
          placeholder={t('bodega:warehouses.filters.search')}
          className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <select
          value={categoria}
          onChange={e => { setCategoria(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="">{t('bodega:warehouses.filters.category')}</option>
          {(families?.data ?? []).map((f: { id: number; name: string }) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select
          value={ubicacion}
          onChange={e => { setUbicacion(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="">{t('bodega:warehouses.filters.location')}</option>
          {(data?.ubicaciones ?? []).map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <Button variant="outline" onClick={clearFilters}>{t('bodega:warehouses.filters.clear')}</Button>

        <div className="flex rounded-lg border border-slate-200 overflow-hidden ml-auto">
          <Button
            variant={chip === 'todos' ? 'primary' : 'secondary'}
            className="!rounded-none !border-0 !text-xs !px-3 !py-1.5"
            onClick={() => { setChip('todos'); setPage(1) }}
          >
            {t('bodega:warehouses.chips.all')}
          </Button>
          <Button
            variant={chip === 'espacio_libre' ? 'primary' : 'secondary'}
            className="!rounded-none !border-0 !text-xs !px-3 !py-1.5"
            onClick={() => { setChip('espacio_libre'); setPage(1) }}
          >
            {t('bodega:warehouses.chips.freeSpace')}
          </Button>
        </div>
      </div>

      {chip === 'espacio_libre' ? (
        <Card variant="panel" className="overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <Th>{t('bodega:warehouses.freeSpace.location')}</Th>
                <Th>{t('bodega:warehouses.freeSpace.status')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {emptyLocationRows.length === 0 && !isFetching && (
                <tr>
                  <td colSpan={2} className="px-4 py-10 text-center text-slate-400 text-sm">
                    {t('bodega:warehouses.freeSpace.empty')}
                  </td>
                </tr>
              )}
              {emptyLocationRows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.ubicacion}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700">
                      {t('bodega:warehouses.freeSpace.available')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card variant="panel" className="overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <Th>{t('bodega:warehouses.table.factoryRef')}</Th>
                <Th>{t('bodega:warehouses.table.publicRef')}</Th>
                {showClienteColumn ? <Th>{t('bodega:warehouses.table.client')}</Th> : <Th>{t('bodega:warehouses.table.location')}</Th>}
                <Th>{t('bodega:warehouses.table.product')}</Th>
                <Th>{t('bodega:warehouses.table.category')}</Th>
                {/* Mejora SCRUM-752 RN3 — unidades reales de ESTA bodega, justo después de
                    Categoría (posición exigida por el ticket). */}
                <Th>{t('bodega:warehouses.table.unitsInWarehouse', { warehouse: data?.warehouse.name ?? '' })}</Th>
                <Th>{t('bodega:warehouses.table.available')}</Th>
                <Th>{t('bodega:warehouses.table.toServe')}</Th>
                <Th>{t('bodega:warehouses.table.totalStock')}</Th>
                <Th>{t('bodega:warehouses.table.toReceive')}</Th>
                <Th>{t('bodega:warehouses.table.inTransit')}</Th>
                <Th>{t('bodega:warehouses.table.minStock')}</Th>
                <Th>{t('bodega:warehouses.table.status')}</Th>
                <Th>{t('bodega:warehouses.table.provider')}</Th>
                <Th>{t('bodega:warehouses.table.action')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productRows.length === 0 && !isFetching && (
                <tr>
                  <td colSpan={15} className="px-4 py-10 text-center text-slate-400 text-sm">
                    {t('bodega:warehouses.empty')}
                  </td>
                </tr>
              )}
              {productRows.map(row => (
                <tr key={row.stock_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-600">{row.factory_reference ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.reference}</td>
                  {showClienteColumn
                    ? <td className="px-4 py-3 text-slate-600">{row.cliente ?? '—'}</td>
                    : <td className="px-4 py-3 text-slate-600">{row.ubicacion ?? t('bodega:warehouses.modo.pendiente')}</td>}
                  <td className="px-4 py-3 text-slate-600">{row.description}</td>
                  <td className="px-4 py-3 text-slate-600">{row.categoria ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.unidades_en_bodega}</td>
                  <td className="px-4 py-3 text-slate-600">{row.disponible}</td>
                  <td className="px-4 py-3 text-slate-600">{row.por_servir}</td>
                  <td className="px-4 py-3 text-slate-600">{row.stock_total ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.por_ingresar > 0 ? row.por_ingresar : '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.en_camino > 0 ? row.en_camino : '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.stock_minimo ?? '—'}</td>
                  <td className="px-4 py-3"><EstadoBadge estado={row.estado} /></td>
                  <td className="px-4 py-3 text-slate-600">{row.proveedor ?? '—'}</td>
                  <td className="px-4 py-3">
                    {/* Mejora SCRUM-752 RN2 (Gerencia Test 2026-08-13) — antes esta celda mostraba
                        un "Ver detalle" deshabilitado en bodegas modo "pendiente" (Zona Libre); el
                        rebote pide que no exista NINGUNA acción ahí, ni "Reubicar" ni "Ver
                        detalle" — celda vacía. */}
                    {data?.warehouse.modo_detalle !== 'pendiente' && (
                      <Button
                        variant="outline"
                        className="!text-xs !px-2 !py-1"
                        onClick={() => setRelocatingRow(row)}
                      >
                        {t('bodega:warehouses.table.relocate')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data?.meta && (
        <Pagination
          meta={data.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
        />
      )}

      {relocatingRow && activeId !== null && (
        <RelocateModal
          row={relocatingRow}
          currentWarehouseId={activeId}
          warehouses={warehouses}
          onClose={() => setRelocatingRow(null)}
        />
      )}
      {showRequestsModal && <RelocationRequestsModal onClose={() => setShowRequestsModal(false)} />}
      {showLocationsModal && activeId !== null && data && (
        <WarehouseLocationsModal
          warehouseId={activeId}
          warehouseName={data.warehouse.name}
          onClose={() => setShowLocationsModal(false)}
        />
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
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

function EstadoBadge({ estado }: { estado: WarehouseProductRow['estado'] }) {
  const { t } = useTranslation('bodega')
  const colors = {
    disponible: 'bg-emerald-50 text-emerald-700',
    bajo_stock: 'bg-amber-50 text-amber-700',
    sin_stock: 'bg-red-50 text-red-700',
  } as const
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colors[estado]}`}>
      {t(`warehouses.status.${estado}`)}
    </span>
  )
}

/**
 * SCRUM-457 (REQ-387) — modal "Reubicar": producto fijo (solo lectura), cantidad, bodega destino
 * (excluye la bodega actual) y motivo. RN2: no se puede enviar sin cantidad válida (>0), bodega
 * destino y motivo.
 */
function RelocateModal({ row, currentWarehouseId, warehouses, onClose }: {
  row: WarehouseProductRow
  currentWarehouseId: number
  warehouses: PhysicalWarehouse[]
  onClose: () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  const create = useCreateRelocationRequest()
  // Pre-QA 2026-07-25 (Bloque B4, doble-clic real en Playwright): `create.isPending` viene de
  // React Query y solo se refleja en el siguiente render — dos clics disparados en el mismo tick
  // de evento ven ambos `isPending === false` y crean 2 (o más) solicitudes duplicadas. Un ref
  // no depende del ciclo de render, así que bloquea el segundo clic de inmediato.
  const submittingRef = useRef(false)

  const [destinationId, setDestinationId] = useState<number | ''>('')
  const [cantidad, setCantidad] = useState<number | ''>('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Mejora SCRUM-752 RN1 (Gerencia Test 2026-08-13) — Zona Libre ('pendiente', sin ubicación
  // física) nunca debe aparecer como destino de reubicación.
  const destinationOptions = warehouses.filter(w => w.id !== currentWarehouseId && w.modo_detalle !== 'pendiente')
  const originWarehouse = warehouses.find(w => w.id === currentWarehouseId)

  const submit = () => {
    if (submittingRef.current) return
    if (!cantidad || Number(cantidad) <= 0) { setError(t('bodega:warehouses.relocateModal.errors.quantity')); return }
    // Mejora SCRUM-752 RN4/RN5 — mismo tope que ya valida el backend, chequeado también acá para
    // no depender solo del round-trip a la API (el backend sigue siendo la fuente de verdad real).
    if (Number(cantidad) > row.unidades_en_bodega) {
      setError(t('bodega:warehouses.relocateModal.errors.maxQuantity', { max: row.unidades_en_bodega }))
      return
    }
    if (destinationId === '') { setError(t('bodega:warehouses.relocateModal.errors.destination')); return }
    if (motivo.trim() === '') { setError(t('bodega:warehouses.relocateModal.errors.reason')); return }

    setError(null)
    submittingRef.current = true
    create.mutate(
      {
        catalog_product_id: row.catalog_product_id,
        origin_warehouse_id: currentWarehouseId,
        destination_warehouse_id: destinationId,
        cantidad: Number(cantidad),
        motivo,
      },
      {
        onSuccess: onClose,
        onError: err => {
          submittingRef.current = false
          const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
          setError(message ?? t('bodega:warehouses.relocateModal.errors.generic'))
        },
      },
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:warehouses.relocateModal.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>

        <div className="bg-slate-50 rounded-lg px-3 py-2 mb-3">
          <div className="text-[11px] uppercase text-slate-400 font-semibold mb-0.5">{t('bodega:warehouses.relocateModal.product')}</div>
          <div className="text-sm"><span className="font-semibold">{row.reference}</span> — {row.description}</div>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-slate-500 mb-1">{t('bodega:warehouses.relocateModal.originWarehouse')}</label>
          <div className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500">
            {originWarehouse?.name ?? '—'}
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-slate-500 mb-1">{t('bodega:warehouses.relocateModal.destinationWarehouse')}</label>
          <select
            value={destinationId}
            onChange={e => setDestinationId(e.target.value ? Number(e.target.value) : '')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="">{t('bodega:warehouses.relocateModal.selectDestination')}</option>
            {destinationOptions.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-slate-500 mb-1">{t('bodega:warehouses.relocateModal.quantity')}</label>
          <input
            type="number"
            min={1}
            max={row.unidades_en_bodega}
            value={cantidad}
            onChange={e => setCantidad(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div className="mb-3">
          <label className="block text-xs font-semibold text-slate-500 mb-1">{t('bodega:warehouses.relocateModal.reason')}</label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder={t('bodega:warehouses.relocateModal.reasonPlaceholder')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            rows={3}
          />
        </div>

        {error && <p className="text-red-600 text-xs mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button onClick={submit} loading={create.isPending}>{t('bodega:warehouses.relocateModal.submit')}</Button>
        </div>
      </Card>
    </div>
  )
}

const RELOCATION_CHIPS: RelocationEstadoFilter[] = ['todas', 'pendiente', 'aprobada', 'rechazada']

/**
 * SCRUM-458/459 (REQ-388/389) — bandeja "Solicitudes de reubicación". El filtro SIEMPRE vuelve a
 * "Todas" cada vez que el modal se abre (Escenario 1 de REQ-389) — se logra sin lógica extra
 * porque este componente se desmonta al cerrar el modal (`{showRequestsModal && <...>}` en el
 * padre) y el `useState('todas')` de acá arranca de cero en cada apertura.
 *
 * SCRUM-458 (rebote de Gerencia Test 2026-08-13, con imagen) — Aprobar/Rechazar quedaban
 * visibles y clicables para CUALQUIER perfil de Bodega (ej. Esteban, Líder de Bodega), aunque el
 * backend ya devolvía 403 real al intentarlo — la restricción quedaba solo aplicada, no
 * comunicada, violando REQ-388 PERMISOS ("Exclusivo de Mark"). Ahora se ocultan (no solo se
 * deshabilitan) cuando el actor no es Mark, reusando el mismo criterio ya probado en
 * `PurchaseOrderPaymentsPanel.tsx` (SCRUM-252): "Mark" es
 * `compras_settings.primary_approver_user_id` (compartido entre Compras y Bodega — confirmado en el
 * hallazgo de Pre-QA de este mismo ticket, 2026-07-25) comparado contra `user.id` del JWT. Con
 * `primary_approver_user_id` sin configurar todavía, el backend tampoco lo exige — se deja visible
 * para no bloquear un entorno sin ese ajuste hecho. Mientras `settings` está cargando, los
 * botones quedan OCULTOS por defecto (más seguro que mostrar de más un instante).
 */
function RelocationRequestsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const [chip, setChip] = useState<RelocationEstadoFilter>('todas')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  // SCRUM-459 (rebote de Gerencia Test 2026-08-13) — "Ver motivo" era texto estático con solo un
  // `title` (tooltip al pasar el mouse, invisible en touch/sin hover) — ahora abre un modal real
  // con el `motivo_rechazo` real de esa fila.
  const [viewingReason, setViewingReason] = useState<string | null>(null)

  const { data, isFetching } = useRelocationRequests({ estado: chip, page, per_page: perPage })
  const approve = useApproveRelocationRequest()
  const rows = data?.data ?? []

  const { data: settings } = useComprasSettings()
  const currentUserId = useAuthStore(s => s.user?.id)
  const isMark = settings !== undefined
    && (settings.primary_approver_user_id == null || settings.primary_approver_user_id === currentUserId)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-5xl max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:warehouses.relocationRequests.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {RELOCATION_CHIPS.map(c => (
            <Button
              key={c}
              variant="outline"
              active={chip === c}
              activeVariant="primary"
              className="!text-xs !px-3 !py-1.5"
              onClick={() => { setChip(c); setPage(1) }}
            >
              {t(`bodega:warehouses.relocationRequests.chips.${c}`)}
            </Button>
          ))}
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <Th>{t('bodega:warehouses.relocationRequests.table.product')}</Th>
                <Th>{t('bodega:warehouses.relocationRequests.table.origin')}</Th>
                <Th>{t('bodega:warehouses.relocationRequests.table.destination')}</Th>
                <Th>{t('bodega:warehouses.relocationRequests.table.quantity')}</Th>
                <Th>{t('bodega:warehouses.relocationRequests.table.reason')}</Th>
                <Th>{t('bodega:warehouses.relocationRequests.table.requestedBy')}</Th>
                <Th>{t('bodega:warehouses.relocationRequests.table.date')}</Th>
                <Th>{t('bodega:warehouses.relocationRequests.table.status')}</Th>
                <Th>{t('bodega:warehouses.relocationRequests.table.action')}</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && !isFetching && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-sm">
                    {t('bodega:warehouses.relocationRequests.empty')}
                  </td>
                </tr>
              )}
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800">{r.producto.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.bodega_origen ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.bodega_destino ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.cantidad}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate" title={r.motivo}>{r.motivo}</td>
                  <td className="px-4 py-3 text-slate-600">{r.solicitado_por ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(r.fecha).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><RelocationEstadoBadge estado={r.estado} /></td>
                  <td className="px-4 py-3">
                    {r.estado === 'pendiente' ? (
                      isMark ? (
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            className="!text-xs !px-2 !py-1"
                            loading={approve.isPending}
                            onClick={() => approve.mutate(r.id)}
                          >
                            {t('bodega:warehouses.relocationRequests.actions.approve')}
                          </Button>
                          <Button
                            variant="outline"
                            className="!text-xs !px-2 !py-1 !text-red-600 !border-red-200"
                            onClick={() => setRejectingId(r.id)}
                          >
                            {t('bodega:warehouses.relocationRequests.actions.reject')}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )
                    ) : r.estado === 'rechazada' && r.motivo_rechazo ? (
                      <button
                        type="button"
                        className="text-xs text-primary underline decoration-dotted"
                        onClick={() => setViewingReason(r.motivo_rechazo)}
                      >
                        {t('bodega:warehouses.relocationRequests.table.viewReason')}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data?.meta && (
          <Pagination
            meta={data.meta}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
          />
        )}
      </Card>

      {rejectingId !== null && <RelocationRejectModal id={rejectingId} onClose={() => setRejectingId(null)} />}
      {viewingReason !== null && <RelocationReasonModal reason={viewingReason} onClose={() => setViewingReason(null)} />}
    </div>
  )
}

/** SCRUM-459 (REQ-389, rebote de Gerencia Test 2026-08-13) — el motivo ya viaja en la propia fila
 * (`RelocationRequest.motivo_rechazo`), sin necesidad de un fetch aparte (a diferencia de
 * `ReasonModal` de `BodegaOrdenesZonaLibrePage.tsx`, que sí lo pide por id). */
function RelocationReasonModal({ reason, onClose }: { reason: string; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:warehouses.relocationRequests.reasonModal.title')}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{reason}</p>
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}

function RelocationEstadoBadge({ estado }: { estado: RelocationRequest['estado'] }) {
  const { t } = useTranslation('bodega')
  const colors = {
    pendiente: 'bg-amber-50 text-amber-700',
    aprobada:  'bg-emerald-50 text-emerald-700',
    rechazada: 'bg-red-50 text-red-700',
  } as const
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colors[estado]}`}>
      {t(`warehouses.relocationRequests.status.${estado}`)}
    </span>
  )
}

/** RN1 de REQ-389 — no se puede rechazar sin motivo. Mismo patrón que `RejectModal` de
 * `SolicitudAjustePage.tsx`, solo cambia el hook que llama. */
function RelocationRejectModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState(false)
  const reject = useRejectRelocationRequest()

  const submit = () => {
    if (motivo.trim() === '') { setError(true); return }
    reject.mutate({ id, motivo }, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:warehouses.relocationRequests.rejectModal.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        <textarea
          value={motivo}
          onChange={e => { setMotivo(e.target.value); setError(false) }}
          placeholder={t('bodega:warehouses.relocationRequests.rejectModal.placeholder')}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-1"
          rows={3}
        />
        {error && <p className="text-red-600 text-xs mb-3">{t('bodega:warehouses.relocationRequests.rejectModal.required')}</p>}
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button onClick={submit} loading={reject.isPending}>{t('bodega:warehouses.relocationRequests.rejectModal.confirm')}</Button>
        </div>
      </Card>
    </div>
  )
}

/**
 * SCRUM-454 (REQ-384) — "Administrar ubicaciones": catálogo editable de códigos de ubicación de
 * la bodega activa, base del chip "Espacio libre". Visible solo con `modo_detalle ===
 * 'ubicacion_exacta'` (mismo gate que ya aplica el resto de la lógica de modo en esta pantalla).
 * Sin hard-delete — "Desactivar" en vez de borrar, para no perder historial (RN del ADR).
 */
function WarehouseLocationsModal({ warehouseId, warehouseName, onClose }: {
  warehouseId: number
  warehouseName: string
  onClose: () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data, isFetching } = useWarehouseLocations(warehouseId)
  const create = useCreateWarehouseLocation()
  const update = useUpdateWarehouseLocation()

  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const locations = data?.data ?? []

  const submitNew = () => {
    if (codigo.trim() === '') { setError(t('bodega:warehouses.locations.errors.required')); return }
    setError(null)
    create.mutate(
      { warehouseId, codigo: codigo.trim() },
      {
        onSuccess: () => setCodigo(''),
        onError: err => {
          const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
          setError(message ?? t('bodega:warehouses.locations.errors.generic'))
        },
      },
    )
  }

  const toggleActive = (location: WarehouseLocationRow) => {
    update.mutate({ warehouseId, id: location.id, patch: { is_active: !location.is_active } })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">
            {t('bodega:warehouses.locations.title', { warehouse: warehouseName })}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={codigo}
            onChange={e => { setCodigo(e.target.value); setError(null) }}
            placeholder={t('bodega:warehouses.locations.addPlaceholder')}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <Button onClick={submitNew} loading={create.isPending}>{t('bodega:warehouses.locations.add')}</Button>
        </div>
        {error && <p className="text-red-600 text-xs mb-3">{error}</p>}

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {locations.length === 0 && !isFetching && (
            <p className="px-3 py-6 text-center text-slate-400 text-sm">{t('bodega:warehouses.locations.empty')}</p>
          )}
          {locations.map(location => (
            <div key={location.id} className="flex items-center justify-between px-3 py-2.5">
              <div>
                <div className="text-sm font-semibold text-slate-800">{location.codigo}</div>
                <div className={`text-xs ${location.is_active ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {location.is_active ? t('bodega:warehouses.locations.active') : t('bodega:warehouses.locations.inactive')}
                </div>
              </div>
              <Button
                variant="outline"
                className="!text-xs !px-2 !py-1"
                loading={update.isPending}
                onClick={() => toggleActive(location)}
              >
                {location.is_active ? t('bodega:warehouses.locations.deactivate') : t('bodega:warehouses.locations.activate')}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
