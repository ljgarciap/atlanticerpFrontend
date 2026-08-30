import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  useAdjustmentRequests, useCreateAdjustmentRequest, useApproveAdjustmentLine,
  useRejectAdjustmentLine, useSearchAdjustmentProducts, useWarehousesList, useProductWarehouseStock,
  useBodegaPorServir,
} from '@/hooks/useBodega'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { IcoClose } from '@/components/icons'
import { ADJUSTMENT_MOTIVOS } from '@/types/bodega'
import type {
  AdjustmentDuplicateWarning, AdjustmentEstado, AdjustmentMotivo, AdjustmentRequestLine, AdjustmentRequestLineDraft, AdjustmentTipo, ProductSearchResult,
} from '@/types/bodega'

const CHIPS: Array<AdjustmentEstado | 'todas'> = ['todas', 'Pendiente', 'Aprobada', 'Rechazada']

/** SCRUM-428/429/430/446/447/448/449/450 — pantalla "Solicitud de ajuste". */
export default function SolicitudAjustePage() {
  const { t } = useTranslation(['common', 'bodega'])
  const [chip, setChip] = useState<AdjustmentEstado | 'todas'>('todas')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  const [creating, setCreating] = useState(false)
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  // SCRUM-797 CA5 — "Ver detalle" no necesita un fetch propio: `index()` ya devuelve todos los
  // campos de la línea (incl. `descripcion`/`responsable`, que el tipo del frontend no declaraba
  // hasta ahora), así que basta con guardar la fila ya cargada en memoria.
  const [detailLine, setDetailLine] = useState<AdjustmentRequestLine | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // SCRUM-369 (REQ-299, corrección 2026-08-11) — deep link desde el panel "Pendientes" de Bodega
  // Home (`?line=<id>`): un ajuste pendiente vive SIEMPRE en `estado=Pendiente`, así que forzar
  // ese chip + "todos" en una sola página (nunca paginado) garantiza que la fila exista en el
  // DOM para poder resaltarla/hacerle scroll, sin depender de en qué página cayó. Se lee UNA sola
  // vez al montar (estado propio, no derivado de `searchParams` en cada render) porque el query
  // param se limpia de la URL apenas se consume — si se derivara en vivo, se perdería junto con
  // el param y el resaltado desaparecería en el siguiente render.
  const [highlightLineId] = useState<number | null>(() => {
    const raw = searchParams.get('line')
    return raw !== null && Number.isInteger(Number(raw)) ? Number(raw) : null
  })
  const highlightRef = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    if (highlightLineId === null) return
    setChip('Pendiente')
    setPerPage('all')
    setPage(1)
    // Se consume una sola vez — no debe volver a forzar el chip si el usuario cambia de filtro.
    setSearchParams(params => { params.delete('line'); return params }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // jsdom (tests) no implementa scrollIntoView — guard defensivo, no solo un mock de test.
    highlightRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  })

  const { data, isFetching } = useAdjustmentRequests({
    estado: chip === 'todas' ? undefined : chip,
    page, per_page: perPage,
  })
  const approve = useApproveAdjustmentLine()
  const rows = data?.data ?? []

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('bodega:adjustments.title')}</h1>
          <p className="text-[12px] text-slate-500">{t('bodega:adjustments.subtitle')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t('bodega:adjustments.actions.new')}</Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {CHIPS.map(c => (
          <Button
            key={c}
            variant="outline"
            active={chip === c}
            activeVariant="primary"
            className="!text-xs !px-3 !py-1.5"
            onClick={() => { setChip(c); setPage(1) }}
          >
            {t(`bodega:adjustments.chips.${c}`)}
          </Button>
        ))}
      </div>

      <Card variant="panel" className="overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {/* SCRUM-447 (rebote de Daniela Amaya 2026-08-13) — nueva columna "Ref. fábrica" al
                  inicio de la tabla (RN1); "Producto" pasa a mostrar solo el nombre, ver <td>
                  abajo. */}
              <Th>{t('bodega:adjustments.table.factoryReference')}</Th>
              <Th>{t('bodega:adjustments.table.product')}</Th>
              <Th>{t('bodega:adjustments.table.warehouse')}</Th>
              <Th>{t('bodega:adjustments.table.type')}</Th>
              <Th>{t('bodega:adjustments.table.quantity')}</Th>
              <Th>{t('bodega:adjustments.table.reason')}</Th>
              <Th>{t('bodega:adjustments.table.evidence')}</Th>
              <Th>{t('bodega:adjustments.table.requestedBy')}</Th>
              <Th>{t('bodega:adjustments.table.date')}</Th>
              <Th>{t('bodega:adjustments.table.status')}</Th>
              <Th>{t('bodega:adjustments.table.action')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('bodega:adjustments.empty')}
                </td>
              </tr>
            )}
            {rows.map(line => (
              <tr
                key={line.id}
                ref={line.id === highlightLineId ? highlightRef : undefined}
                data-testid={`adjustment-row-${line.id}`}
                className={[
                  'hover:bg-slate-50 transition-colors',
                  line.id === highlightLineId ? 'bg-amber-50 ring-1 ring-inset ring-amber-300' : '',
                ].join(' ')}
              >
                {/* SCRUM-447 (rebote de Daniela Amaya 2026-08-13) — "Ref. fábrica" columna nueva
                    con la referencia (antes mezclada dentro de "Producto"); "Producto" pasa a
                    mostrar solo el nombre (`description`), nunca la referencia. */}
                <td className="px-4 py-3 text-slate-600">{line.producto.reference ?? '—'}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{line.producto.description ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{line.bodega}</td>
                <td className="px-4 py-3 text-slate-600">{line.tipo}</td>
                <td className="px-4 py-3 text-slate-600">{line.cantidad}</td>
                <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={line.motivo}>{line.motivo}</td>
                <td className="px-4 py-3">
                  {line.evidencia_url && (
                    <a href={line.evidencia_url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">
                      {t('bodega:adjustments.table.view')}
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{line.solicitado_por}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(line.fecha).toLocaleDateString()}</td>
                <td className="px-4 py-3"><EstadoBadge estado={line.estado} /></td>
                <td className="px-4 py-3">
                  {/* SCRUM-429 (rebote de Daniela Amaya 2026-08-13) — Aprobar/Rechazar quedaban
                      visibles/clicables para CUALQUIER perfil de Bodega (Bodega solicita, Mark
                      aprueba — el backend ya rechazaba con 403 a quien no fuera Mark, pero el
                      botón no daba ninguna señal de eso). `can_approve` (si el usuario actual ES
                      Mark, ver AdjustmentRequestController::index()) oculta el botón por completo
                      para todos los demás, en vez de dejarlo visible sin ninguna afordancia. */}
                  {line.estado === 'Pendiente' && data?.can_approve && (
                    <div className="flex gap-1.5 mb-1">
                      <Button
                        variant="outline"
                        className="!text-xs !px-2 !py-1"
                        loading={approve.isPending}
                        onClick={() => approve.mutate(line.id)}
                      >
                        {t('bodega:adjustments.actions.approve')}
                      </Button>
                      <Button
                        variant="outline"
                        className="!text-xs !px-2 !py-1 !text-red-600 !border-red-200"
                        onClick={() => setRejectingId(line.id)}
                      >
                        {t('bodega:adjustments.actions.reject')}
                      </Button>
                    </div>
                  )}
                  {/* SCRUM-797 CA5 — "Ver detalle" reemplaza el antiguo tooltip "Ver motivo" (solo
                      rechazada, no clicable de verdad) — ahora disponible para cualquier estado,
                      con toda la información de la línea (antes se descartaba sin renderizar). */}
                  <button
                    type="button"
                    className="text-primary text-[11px] underline"
                    onClick={() => setDetailLine(line)}
                  >
                    {t('bodega:adjustments.table.viewDetail')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data?.meta && (
        <Pagination
          meta={data.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
        />
      )}

      {creating && <NewAdjustmentRequestModal onClose={() => setCreating(false)} />}
      {rejectingId !== null && <RejectModal lineId={rejectingId} onClose={() => setRejectingId(null)} />}
      {detailLine && <DetailModal line={detailLine} onClose={() => setDetailLine(null)} />}
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

function EstadoBadge({ estado }: { estado: AdjustmentEstado }) {
  const { t } = useTranslation('bodega')
  const colors: Record<AdjustmentEstado, string> = {
    Pendiente: 'bg-amber-50 text-amber-700',
    Aprobada: 'bg-emerald-50 text-emerald-700',
    Rechazada: 'bg-red-50 text-red-700',
    Reemplazada: 'bg-slate-100 text-slate-400',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colors[estado]}`}>
      {t(`adjustments.status.${estado}`)}
    </span>
  )
}

function RejectModal({ lineId, onClose }: { lineId: number; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState(false)
  const reject = useRejectAdjustmentLine()

  const submit = () => {
    if (motivo.trim() === '') { setError(true); return }
    reject.mutate({ lineId, motivo }, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:adjustments.rejectModal.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        <textarea
          value={motivo}
          onChange={e => { setMotivo(e.target.value); setError(false) }}
          placeholder={t('bodega:adjustments.rejectModal.placeholder')}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-1"
          rows={3}
        />
        {error && <p className="text-red-600 text-xs mb-3">{t('bodega:adjustments.rejectModal.required')}</p>}
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button onClick={submit} loading={reject.isPending}>{t('bodega:adjustments.rejectModal.confirm')}</Button>
        </div>
      </Card>
    </div>
  )
}

/** SCRUM-797 CA5/CA8/CA9 — "Ver detalle" de una línea de ajuste, sin fetch propio (ver el
 * comentario de `detailLine` arriba): muestra todo lo que `AdjustmentRequestController::
 * formatLine()` ya devuelve — antes solo el motivo de rechazo se asomaba, vía tooltip, y solo
 * para `Rechazada`. */
function DetailModal({ line, onClose }: { line: AdjustmentRequestLine; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">
            {t('bodega:adjustments.detailModal.title', { id: line.id })}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <EstadoBadge estado={line.estado} />
            <span className="text-xs text-slate-400">
              {t('bodega:adjustments.detailModal.date')}: {new Date(line.fecha).toLocaleDateString()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-400 uppercase tracking-wide mb-0.5">{t('bodega:adjustments.detailModal.product')}</p>
              <p className="text-slate-700 font-medium">{line.producto.description ?? '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wide mb-0.5">{t('bodega:adjustments.detailModal.warehouse')}</p>
              <p className="text-slate-700 font-medium">{line.bodega ?? '—'}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wide mb-0.5">{t('bodega:adjustments.detailModal.type')}</p>
              <p className="text-slate-700 font-medium">{line.tipo}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wide mb-0.5">{t('bodega:adjustments.detailModal.quantity')}</p>
              <p className="text-slate-700 font-medium">{line.cantidad}</p>
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wide mb-0.5">{t('bodega:adjustments.detailModal.requestedBy')}</p>
              <p className="text-slate-700 font-medium">{line.solicitado_por ?? '—'}</p>
            </div>
            {line.estado !== 'Pendiente' && (
              <div>
                <p className="text-slate-400 uppercase tracking-wide mb-0.5">{t('bodega:adjustments.detailModal.resolvedBy')}</p>
                <p className="text-slate-700 font-medium">{line.resuelto_por ?? '—'}</p>
              </div>
            )}
          </div>

          <div>
            <p className="text-slate-400 uppercase tracking-wide text-xs mb-0.5">{t('bodega:adjustments.detailModal.reason')}</p>
            <p className="text-sm text-slate-700">{t(`bodega:adjustments.newModal.reasons.${line.motivo}`, line.motivo)}</p>
          </div>

          {line.estado === 'Rechazada' && (
            <div>
              <p className="text-slate-400 uppercase tracking-wide text-xs mb-0.5">{t('bodega:adjustments.detailModal.rejectionReason')}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{line.motivo_rechazo ?? '—'}</p>
            </div>
          )}

          <div>
            <p className="text-slate-400 uppercase tracking-wide text-xs mb-0.5">{t('bodega:adjustments.detailModal.description')}</p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {line.descripcion ?? t('bodega:adjustments.detailModal.descriptionEmpty')}
            </p>
          </div>

          <div>
            <p className="text-slate-400 uppercase tracking-wide text-xs mb-0.5">{t('bodega:adjustments.detailModal.responsible')}</p>
            <p className="text-sm text-slate-700">
              {line.responsable ?? t('bodega:adjustments.detailModal.responsibleEmpty')}
            </p>
          </div>

          {line.evidencia_url && (
            <div>
              <p className="text-slate-400 uppercase tracking-wide text-xs mb-0.5">{t('bodega:adjustments.detailModal.evidence')}</p>
              <a href={line.evidencia_url} target="_blank" rel="noreferrer" className="text-primary underline text-sm">
                {t('bodega:adjustments.table.view')}
              </a>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}

/**
 * SCRUM-329 Batch B2 (REQ-421) — "Solicitar ajuste" ahora también se abre por fila desde "Ver
 * Inventario" (`BodegaInventarioPage.tsx`), con el producto de esa fila ya elegido — de ahí
 * `initialProduct`, optional para no romper el flujo original de esta pantalla (búsqueda manual).
 */
export function NewAdjustmentRequestModal({ onClose, initialProduct = null }: {
  onClose: () => void
  initialProduct?: ProductSearchResult | null
}) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: warehousesData } = useWarehousesList()
  const warehouses = warehousesData?.data ?? []
  const create = useCreateAdjustmentRequest()

  // SCRUM-428 (REQ-358) — cuando se entra con un producto ya fijo (fila de Ver Inventario), el
  // producto NO es editable: el ticket lo describe como "producto ya viene fijo según la fila
  // donde se hizo clic", a diferencia del punto de entrada libre de REQ-376 ("+ Nueva solicitud",
  // que nunca pasa `initialProduct`).
  const isProductLocked = initialProduct !== null

  const [productSearch, setProductSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(initialProduct)
  const { data: searchResults } = useSearchAdjustmentProducts(productSearch)
  // SCRUM-428 RN1/RN5 — cantidad actual por bodega + unidades comprometidas (hallazgo de Pre-QA).
  const { data: stockData } = useProductWarehouseStock(selectedProduct?.id ?? null)
  const quantityByWarehouse = new Map((stockData?.warehouses ?? []).map(w => [w.warehouse_id, w.quantity]))

  // Fix Pre-QA 2026-07-28 (RN5, re-check SCRUM-428) — `stockData.por_servir` (endpoint
  // `adjustment-requests/products/{id}/warehouse-stock`, `WarehouseStockService`) es el concepto
  // de reserva de VENTAS & DISEÑO al momento de comprar (`InventoryKpiService::porServirMap()`,
  // ver docblock de `ProductWarehouseStockResponse` en `types/bodega.ts`) — NO el "comprometido"
  // real de Bodega (clientes/pedidos con unidades ya asignadas, el mismo dato que muestra el modal
  // "Por servir" de Ver Inventario, `commitment-detail`). Confirmado en vivo contra
  // dev.atlanticerp.ai: LAMP-COL-001 tiene por_servir=6 en `/bodega/inventory` (comprometido real) pero
  // `warehouse-stock` devolvía 0 para el MISMO producto — la advertencia de RN5 nunca se disparaba
  // para el caso real que el ticket pide cubrir. Se reemplaza por `useBodegaPorServir` (mismo
  // endpoint que ya usa `PorServirModal` en `BodegaInventarioPage.tsx`), sumando las líneas reales.
  const { data: porServirData } = useBodegaPorServir(selectedProduct?.id ?? null)
  const committedUnits = (porServirData?.data ?? []).reduce((sum, l) => sum + l.quantity, 0)

  const [lines, setLines] = useState<Array<Partial<AdjustmentRequestLineDraft>>>([])
  const [error, setError] = useState<string | null>(null)
  // SCRUM-797 RN5→RN7 — crear ES el único momento de "enviar a aprobación de Mark" de este flujo
  // (a diferencia de Inventario General, acá no hay borrador previo), así que la advertencia y la
  // confirmación de reemplazo ocurren en el mismo 409.
  const [duplicates, setDuplicates] = useState<AdjustmentDuplicateWarning[] | null>(null)

  const usedWarehouseIds = lines.map(l => l.warehouse_id).filter((id): id is number => id !== undefined)
  const availableWarehouses = warehouses.filter(w => !usedWarehouseIds.includes(w.id))
  const hasCommittedUnits = committedUnits > 0

  const addLine = () => {
    if (availableWarehouses.length === 0) return
    setLines([...lines, { warehouse_id: availableWarehouses[0].id, tipo: 'Sumar' }])
  }

  const updateLine = (index: number, patch: Partial<AdjustmentRequestLineDraft>) => {
    setLines(lines.map((l, i) => i === index ? { ...l, ...patch } : l))
  }

  const removeLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const submit = (confirmReplace = false) => {
    if (selectedProduct === null) { setError(t('bodega:adjustments.newModal.errors.product')); return }
    if (lines.length === 0) { setError(t('bodega:adjustments.newModal.errors.noLines')); return }
    for (const line of lines) {
      if (!line.warehouse_id || !line.tipo || !line.cantidad || !line.motivo || !line.evidencia) {
        setError(t('bodega:adjustments.newModal.errors.incomplete'))
        return
      }
    }
    setError(null)
    create.mutate(
      { catalogProductId: selectedProduct.id, lines: lines as AdjustmentRequestLineDraft[], confirmReplace },
      {
        onSuccess: onClose,
        // SCRUM-429 (rebote de Daniela Amaya 2026-08-17) — sin onError, un submit fallido no
        // mostraba nada: ni confirmación ni error, el usuario se quedaba sin saber qué pasó.
        // Mismo patrón que PickingSheetModal.tsx: primer error de validación del backend, o el
        // mensaje general si no es un 422 con `errors`.
        onError: (err) => {
          // SCRUM-797 RN6/RN7 — 409 con `duplicates[]` (ver AdjustmentDuplicateWarning) abre el
          // modal de confirmación en vez del error genérico.
          if (!confirmReplace && isAxiosError(err) && err.response?.status === 409) {
            const found = (err.response.data as { duplicates?: AdjustmentDuplicateWarning[] } | undefined)?.duplicates
            if (found && found.length > 0) { setDuplicates(found); return }
          }
          const backendMessage = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err)
            ? Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message
            : undefined
          setError(backendMessage ?? t('bodega:adjustments.newModal.errors.submitFailed'))
        },
      },
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:adjustments.newModal.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>

        {selectedProduct === null ? (
          <div className="mb-4">
            <input
              type="text"
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              placeholder={t('bodega:adjustments.newModal.searchProduct')}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            {(searchResults?.data ?? []).length > 0 && (
              <div className="border border-slate-200 rounded-lg mt-1 overflow-hidden">
                {searchResults!.data.map(p => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                    onClick={() => { setSelectedProduct(p); setProductSearch('') }}
                  >
                    <span className="font-semibold">{p.reference}</span> — {p.description}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 mb-4">
            <span className="text-sm"><span className="font-semibold">{selectedProduct.reference}</span> — {selectedProduct.description}</span>
            {!isProductLocked && (
              <button onClick={() => setSelectedProduct(null)} className="text-xs text-primary underline">{t('common:actions.change')}</button>
            )}
          </div>
        )}

        {lines.map((line, i) => (
          <div key={i} className="border border-slate-200 rounded-lg p-3 mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">{t('bodega:adjustments.newModal.lineLabel', { n: i + 1 })}</span>
              <button onClick={() => removeLine(i)} className="text-slate-400 hover:text-red-600"><IcoClose /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select
                value={line.warehouse_id}
                onChange={e => updateLine(i, { warehouse_id: Number(e.target.value) })}
                className="px-2 py-1.5 border border-slate-300 rounded text-sm"
              >
                {warehouses
                  .filter(w => w.id === line.warehouse_id || !usedWarehouseIds.includes(w.id))
                  .map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({t('bodega:adjustments.newModal.unitsCount', { count: quantityByWarehouse.get(w.id) ?? 0 })})
                    </option>
                  ))}
              </select>
              <select
                value={line.tipo}
                onChange={e => updateLine(i, { tipo: e.target.value as AdjustmentTipo })}
                className="px-2 py-1.5 border border-slate-300 rounded text-sm"
              >
                <option value="Sumar">{t('bodega:adjustments.newModal.sum')}</option>
                <option value="Restar">{t('bodega:adjustments.newModal.subtract')}</option>
              </select>
            </div>
            {line.tipo === 'Restar' && hasCommittedUnits && (
              <p className="text-amber-700 bg-amber-50 rounded px-2 py-1.5 text-xs mb-2">
                {t('bodega:adjustments.newModal.committedWarning', { count: committedUnits })}
              </p>
            )}
            <input
              type="number"
              min={1}
              placeholder={t('bodega:adjustments.newModal.quantity')}
              value={line.cantidad ?? ''}
              onChange={e => updateLine(i, { cantidad: Number(e.target.value) })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm mb-2"
            />
            {/* SCRUM-428 (corrección de Daniela Amaya 2026-08-13) — Motivo pasa de texto libre a
                desplegable obligatorio con exactamente 6 opciones fijas; el usuario ya no puede
                escribir un motivo arbitrario. */}
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('bodega:adjustments.newModal.reason')} *
            </label>
            <select
              value={line.motivo ?? ''}
              onChange={e => updateLine(i, { motivo: e.target.value as AdjustmentMotivo | '' })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm mb-2 bg-white"
            >
              <option value="">{t('bodega:adjustments.newModal.reasonPlaceholder')}</option>
              {ADJUSTMENT_MOTIVOS.map(m => (
                <option key={m} value={m}>{t(`bodega:adjustments.newModal.reasons.${m}`)}</option>
              ))}
            </select>

            {/* SCRUM-428 — Descripción y Responsable, ambos opcionales (incl. cuando Motivo es
                "Otro (especificar)": el criterio de aceptación exige explícitamente que Descripción
                siga sin ser obligatoria incluso en ese caso, solo "puede utilizarse" para detallar). */}
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('bodega:adjustments.newModal.description')}{' '}
              <span className="font-normal text-slate-400">({t('bodega:adjustments.newModal.descriptionOptional')})</span>
            </label>
            <textarea
              placeholder={t('bodega:adjustments.newModal.descriptionPlaceholder')}
              value={line.descripcion ?? ''}
              onChange={e => updateLine(i, { descripcion: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm mb-2"
              rows={2}
            />

            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('bodega:adjustments.newModal.responsible')}{' '}
              <span className="font-normal text-slate-400">({t('bodega:adjustments.newModal.responsibleOptional')})</span>
            </label>
            <input
              type="text"
              placeholder={t('bodega:adjustments.newModal.responsiblePlaceholder')}
              value={line.responsable ?? ''}
              onChange={e => updateLine(i, { responsable: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm mb-2"
            />

            <input
              type="file"
              accept="image/*,.pdf"
              onChange={e => updateLine(i, { evidencia: e.target.files?.[0] })}
              className="text-sm"
            />
          </div>
        ))}

        <Button variant="outline" onClick={addLine} disabled={availableWarehouses.length === 0} className="mb-4">
          {t('bodega:adjustments.newModal.addWarehouse')}
        </Button>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          {/* onClick={() => submit()}, nunca onClick={submit} — `submit` ahora tiene un parámetro
              (`confirmReplace`) y React pasaría el SyntheticEvent del click en su lugar. */}
          <Button onClick={() => submit()} loading={create.isPending}>{t('bodega:adjustments.newModal.submit')}</Button>
        </div>
      </Card>

      {duplicates && (
        <AdjustmentDuplicateModal
          duplicates={duplicates}
          onConfirm={() => { setDuplicates(null); submit(true) }}
          onCancel={() => setDuplicates(null)}
        />
      )}
    </div>
  )
}

/** SCRUM-797 RN5→RN7 — mismo patrón visual que `RejectModal`/`DetailModal` de este archivo (nunca
 * `confirm()` nativo). Cada entrada distingue colisión de mismo tipo (se reemplaza al confirmar)
 * de colisión cruzada con un conteo general (solo informativa). */
function AdjustmentDuplicateModal({ duplicates, onConfirm, onCancel }: {
  duplicates: AdjustmentDuplicateWarning[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:adjustments.duplicateModal.title')}</h2>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        <ul className="text-sm text-slate-700 mb-4 space-y-2 max-h-56 overflow-y-auto">
          {duplicates.map(d => (
            <li key={d.warehouse_id} className="border-b border-slate-100 pb-2 last:border-0">
              <p className="font-semibold">{d.warehouse_name ?? '—'}</p>
              {d.adjustment && (
                <p className="text-xs text-amber-700">
                  {t('bodega:adjustments.duplicateModal.sameType', { date: new Date(d.adjustment.fecha).toLocaleDateString() })}
                </p>
              )}
              {d.general_count && (
                <p className="text-xs text-slate-500">
                  {t('bodega:adjustments.duplicateModal.crossType', { date: new Date(d.general_count.fecha).toLocaleDateString() })}
                </p>
              )}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('common:actions.cancel')}</Button>
          <Button onClick={onConfirm}>{t('bodega:adjustments.duplicateModal.confirm')}</Button>
        </div>
      </Card>
    </div>
  )
}
