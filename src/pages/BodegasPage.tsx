import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { usePermission } from '@/hooks/usePermission'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { IcoClose, IcoEye } from '@/components/icons'
import { KpiCard, Th } from '@/components/bodega/BodegaTableParts'
import ZonaLibreCatalogoTable from '@/components/bodega/ZonaLibreCatalogoTable'
import { isWarehouseEmptyLocationRow } from '@/types/bodega'
import { formatDateFromTimestamp } from '@/utils/dates'
import AutocompleteInput from '@/components/AutocompleteInput'
import { fetchWarehouseProductSuggestions } from '@/utils/searchSuggestionsBodega'
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
  // SCRUM-990 — las bodegas de solo consulta (Zona Libre / Lafayette) van AL FINAL de la fila de pestañas, separadas por un
  // divisor, para que no parezcan una bodega operativa más; las operativas conservan el orden del API.
  const operativeWarehouses = warehouses.filter(w => !w.solo_consulta)
  const soloConsultaWarehouses = warehouses.filter(w => w.solo_consulta)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [chip, setChip] = useState<'todos' | 'espacio_libre'>('todos')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [categoria, setCategoria] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [relocatingRow, setRelocatingRow] = useState<WarehouseProductRow | null>(null)
  // SCRUM-1154 — la notificación de «Aprobaciones pendientes» llega con `?relocation={id}`: abre la bandeja de solicitudes de
  // reubicación (filtrada a pendientes) con esa solicitud resaltada. Solo con bodega.read (el vendedor es de consulta pura).
  const [searchParams, setSearchParams] = useSearchParams()
  const relocationParam = searchParams.get('relocation')
  const highlightRelocationId = relocationParam !== null && /^\d+$/.test(relocationParam) ? Number(relocationParam) : null
  const [showRequestsModal, setShowRequestsModal] = useState(relocationParam !== null)
  // Senior Review: si ya se está en esta pantalla y se hace clic en la campana, la ruta cambia de parámetro pero el componente
  // sigue montado y el estado inicial no se vuelve a evaluar — sin esto el modal no se abría la 2.ª vez.
  useEffect(() => {
    if (relocationParam !== null) setShowRequestsModal(true)
  }, [relocationParam])
  const [showLocationsModal, setShowLocationsModal] = useState(false)
  // SCRUM-754 (rebote 2026-08-18) — único listado de Bodega sin paginar del batch de
  // estandarización. Una sola página/perPage para ambas tablas (chip "todos" y "espacio_libre"):
  // nunca se muestran a la vez, mismo criterio que el resto de la pantalla con el chip.
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  // REQ-381 RN1 — Bodega Central es la vista por defecto al entrar a la pantalla (SCRUM-990: la primera OPERATIVA, nunca la de
  // solo consulta aunque el API la devolviera primero).
  const activeId = selectedId ?? operativeWarehouses[0]?.id ?? warehouses[0]?.id ?? null
  const activeWarehouse = warehouses.find(w => w.id === activeId)
  const isSoloConsulta = activeWarehouse?.solo_consulta === true
  // SCRUM-1021 — el vendedor entra con `bodega.warehouses.view` y SIN `bodega.read`: consulta pura, sin
  // ningún botón de acción (administrar ubicaciones, solicitudes de reubicación, "Reubicar" en tablas).
  // Quien sí tiene bodega.read ve la pantalla exactamente igual que antes.
  const hasBodegaRead = usePermission('bodega.read')
  const soloConsultaPorPermiso = !hasBodegaRead

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
          {isUbicacionExacta && !isSoloConsulta && !soloConsultaPorPermiso && (
            <Button variant="outline" className="!text-xs !px-3 !py-1.5" onClick={() => setShowLocationsModal(true)}>
              {t('bodega:warehouses.locations.manageButton')}
            </Button>
          )}
          {/* SCRUM-990 — con una bodega de solo consulta activa no existen reubicaciones ni ubicaciones que administrar. */}
          {!isSoloConsulta && !soloConsultaPorPermiso && (
            <Button variant="outline" className="!text-xs !px-3 !py-1.5" onClick={() => setShowRequestsModal(true)}>
              {t('bodega:warehouses.relocationRequests.openButton')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-nowrap overflow-x-auto md:flex-wrap md:overflow-visible gap-2 mb-5 border-b border-slate-200 pb-3 items-center">
        {operativeWarehouses.map(w => (
          <Button
            key={w.id}
            variant="outline"
            active={activeId === w.id}
            activeVariant="primary"
            className="!text-xs !px-3 !py-1.5 shrink-0"
            onClick={() => selectWarehouse(w.id)}
          >
            {w.name}
          </Button>
        ))}
        {soloConsultaWarehouses.length > 0 && (
          <div className="flex shrink-0 gap-2 border-l border-slate-200 pl-2 ml-1" data-testid="solo-consulta-tabs">
            {soloConsultaWarehouses.map(w => (
              <Button
                key={w.id}
                variant="outline"
                active={activeId === w.id}
                activeVariant="primary"
                className="!text-xs !px-3 !py-1.5"
                onClick={() => selectWarehouse(w.id)}
              >
                <span className="inline-flex items-center gap-1.5">
                  {w.name}
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    <IcoEye size={12} />
                    {t('bodega:warehouses.zonaLibre.badge')}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* SCRUM-990 — Zona Libre / Lafayette es de SOLO CONSULTA: su propia vista (aviso, 3 KPIs del catálogo externo, tabla paginada
          en el servidor) reemplaza por completo a los KPIs, filtros, chips, tabla de 15 columnas y paginación de una bodega operativa. */}
      {isSoloConsulta ? (
        <ZonaLibreCatalogoTable kpis={data?.kpis} />
      ) : (
        <>
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

        {/* SCRUM-1023 (mismo fix que SCRUM-949 en Ver Inventario) — el buscador en su propia fila:
            dentro de la fila compartida con los filtros, `flex-1` (flex-basis 0%) lo dejaba diminuto. */}
        <div className="max-w-md mb-2" data-testid="warehouses-search-row">
          <AutocompleteInput
            value={search}
            onChange={setSearch}
            onSelect={opt => { setSearch(opt); setQuery(opt); setPage(1) }}
            onEnterWithoutSelection={() => { setQuery(search); setPage(1) }}
            fetchOptions={q => activeId !== null ? fetchWarehouseProductSuggestions(activeId, q) : Promise.resolve([])}
            placeholder={t('bodega:warehouses.filters.search')}
            noResultsLabel={t('common:buscador.sinResultados')}
          />
        </div>
        <div className="flex flex-wrap gap-2 mb-4 items-center">
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
                      {data?.warehouse.modo_detalle !== 'pendiente' && !soloConsultaPorPermiso && (
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
        </>
      )}

      {relocatingRow && activeId !== null && (
        <RelocateModal
          row={relocatingRow}
          currentWarehouseId={activeId}
          warehouses={warehouses}
          onClose={() => setRelocatingRow(null)}
        />
      )}
      {showRequestsModal && !soloConsultaPorPermiso && (
        <RelocationRequestsModal
          initialChip={relocationParam !== null ? 'pendiente' : 'todas'}
          highlightId={highlightRelocationId}
          onClose={() => {
            setShowRequestsModal(false)
            if (relocationParam !== null) {
              // Quita el parámetro para que recargar o volver no reabra la bandeja.
              const next = new URLSearchParams(searchParams)
              next.delete('relocation')
              setSearchParams(next, { replace: true })
            }
          }}
        />
      )}
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
  // SCRUM-990 — y tampoco una bodega de solo consulta (el backend ya la rechaza con `Warehouse::operativaRule()`).
  const destinationOptions = warehouses.filter(
    w => w.id !== currentWarehouseId && w.modo_detalle !== 'pendiente' && !w.solo_consulta,
  )
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
 * visibles y clicables para CUALQUIER perfil de Bodega (ej. Lider Bodega, Líder de Bodega), aunque el
 * backend ya devolvía 403 real al intentarlo — la restricción quedaba solo aplicada, no
 * comunicada, violando REQ-388 PERMISOS ("Exclusivo de Gerencia"). Ahora se ocultan (no solo se
 * deshabilitan) cuando el actor no es Gerencia, reusando el mismo criterio ya probado en
 * `PurchaseOrderPaymentsPanel.tsx` (SCRUM-252): "Gerencia" es
 * `compras_settings.primary_approver_user_id` (compartido entre Compras y Bodega — confirmado en el
 * hallazgo de Pre-QA de este mismo ticket, 2026-07-25) comparado contra `user.id` del JWT. Con
 * `primary_approver_user_id` sin configurar todavía, el backend tampoco lo exige — se deja visible
 * para no bloquear un entorno sin ese ajuste hecho. Mientras `settings` está cargando, los
 * botones quedan OCULTOS por defecto (más seguro que mostrar de más un instante).
 */
function RelocationRequestsModal({ onClose, initialChip = 'todas', highlightId = null }: { onClose: () => void; initialChip?: RelocationEstadoFilter; highlightId?: number | null }) {
  const { t } = useTranslation(['common', 'bodega'])
  const [chip, setChip] = useState<RelocationEstadoFilter>(initialChip)
  const [page, setPage] = useState(1)
  // Pre-QA SCRUM-1154: con una solicitud de la notificación se trae TODA la lista pendiente (son pocas), no solo la 1.ª página de 20:
  // las más antiguas —las que lista primero la tarjeta de Aprobaciones— caían en la página 2 y no se resaltaban.
  const [perPage, setPerPage] = useState<number | 'all'>(highlightId !== null ? 'all' : 20)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  // SCRUM-459 (rebote de Gerencia Test 2026-08-13) — "Ver motivo" era texto estático con solo un
  // `title` (tooltip al pasar el mouse, invisible en touch/sin hover) — ahora abre un modal real
  // con el `motivo_rechazo` real de esa fila.
  const [viewingReason, setViewingReason] = useState<string | null>(null)
  // SCRUM-1160 — «Ver detalle»: la fila completa (ya viaja en el listado, sin fetch aparte) en una vista de solo consulta, antes de aprobar o rechazar.
  const [viewingDetail, setViewingDetail] = useState<RelocationRequest | null>(null)

  const { data, isFetching } = useRelocationRequests({ estado: chip, page, per_page: perPage })
  const approve = useApproveRelocationRequest()
  const rows = data?.data ?? []

  // SCRUM-1154 — lleva la solicitud de la notificación a la vista cuando está en la página cargada.
  const highlightRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    highlightRef.current?.scrollIntoView?.({ block: 'center' })
  }, [rows.length, highlightId])

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

        {/* Pre-QA SCRUM-1154 — la notificación puede ser vieja: si esa solicitud ya no está pendiente (se aprobó o rechazó), se dice
            en vez de abrir la bandeja sin resaltar nada y sin explicación. */}
        {highlightId !== null && chip === 'pendiente' && data !== undefined && !isFetching && !rows.some(r => r.id === highlightId) && (
          <p role="status" data-testid="relocation-not-pending" className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
            {t('bodega:warehouses.relocationRequests.notPending', { id: highlightId })}
          </p>
        )}

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
                <tr
                  key={r.id}
                  ref={r.id === highlightId ? highlightRef : undefined}
                  data-highlighted={r.id === highlightId ? 'true' : undefined}
                  className={r.id === highlightId ? 'bg-amber-50 ring-2 ring-inset ring-amber-300 transition-colors' : 'hover:bg-slate-50 transition-colors'}
                >
                  <td className="px-4 py-3 font-semibold text-slate-800">{r.producto.reference ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.bodega_origen ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.bodega_destino ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{r.cantidad}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate" title={r.motivo}>{r.motivo}</td>
                  <td className="px-4 py-3 text-slate-600">{r.solicitado_por ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDateFromTimestamp(r.fecha)}</td>
                  <td className="px-4 py-3"><RelocationEstadoBadge estado={r.estado} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="outline"
                        className="!text-xs !px-2 !py-1"
                        onClick={() => setViewingDetail(r)}
                      >
                        {t('bodega:warehouses.relocationRequests.actions.viewDetail')}
                      </Button>
                      {r.estado === 'pendiente' && isMark && (
                        <>
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
                        </>
                      )}
                      {r.estado === 'rechazada' && r.motivo_rechazo && (
                        <button
                          type="button"
                          className="text-xs text-primary underline decoration-dotted"
                          onClick={() => setViewingReason(r.motivo_rechazo)}
                        >
                          {t('bodega:warehouses.relocationRequests.table.viewReason')}
                        </button>
                      )}
                    </div>
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
      {viewingDetail !== null && <RelocationDetailModal request={viewingDetail} onClose={() => setViewingDetail(null)} />}
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

/** SCRUM-1160 — vista de solo consulta de una solicitud de reubicación (cualquier estado): producto y referencia, cantidad, bodegas, quien la pidió, fecha,
 * motivo COMPLETO (en la tabla se corta), estado y, si ya se resolvió, quién la resolvió y el motivo del rechazo. No altera el flujo de aprobar o rechazar. */
function RelocationDetailModal({ request: r, onClose }: { request: RelocationRequest; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const k = 'bodega:warehouses.relocationRequests'
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800 mt-0.5 break-words whitespace-pre-wrap">{children}</dd>
    </div>
  )
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" data-testid="relocation-detail-modal">
      <Card variant="modal" className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t(`${k}.detailModal.title`)} #{r.id}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common:actions.close')}><IcoClose /></button>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <Field label={t(`${k}.detailModal.reference`)}>{r.producto.reference ?? '—'}</Field>
          <Field label={t(`${k}.detailModal.description`)}>{r.producto.description ?? '—'}</Field>
          <Field label={t(`${k}.table.quantity`)}>{r.cantidad}</Field>
          <Field label={t(`${k}.table.status`)}><RelocationEstadoBadge estado={r.estado} /></Field>
          <Field label={t(`${k}.table.origin`)}>{r.bodega_origen ?? '—'}</Field>
          <Field label={t(`${k}.table.destination`)}>{r.bodega_destino ?? '—'}</Field>
          <Field label={t(`${k}.table.requestedBy`)}>{r.solicitado_por ?? '—'}</Field>
          <Field label={t(`${k}.table.date`)}>{formatDateFromTimestamp(r.fecha)}</Field>
          <div className="sm:col-span-2"><Field label={t(`${k}.table.reason`)}>{r.motivo.trim() !== '' ? r.motivo : '—'}</Field></div>
          {r.estado !== 'pendiente' && <Field label={t(`${k}.detailModal.resolvedBy`)}>{r.resuelto_por ?? '—'}</Field>}
          {r.estado === 'rechazada' && <Field label={t(`${k}.detailModal.rejectionReason`)}>{r.motivo_rechazo ?? '—'}</Field>}
        </dl>
        <div className="flex justify-end mt-5">
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
