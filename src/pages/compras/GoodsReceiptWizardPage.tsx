import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  useGoodsReceiptEligibleOrders, useGoodsReceiptOrderProducts, useGoodsReceipt,
  useCreateGoodsReceipt, useUpdateGoodsReceipt, useWarehouses,
  useUploadGoodsReceiptInvoice, useGoodsReceiptInvoiceMatch,
} from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoPaperclip, IcoAlertTriangle, IcoCheck } from '@/components/icons'
import {
  REMAINDER_STATUSES, type RemainderStatus, type GoodsReceiptLinePayload,
  type GoodsReceiptPartialInfo, type GoodsReceiptPayload, type GoodsReceiptDetail,
} from '@/types/compras'

/**
 * SCRUM-220→230/224 (REQ-157/159/161→167) — Ingreso de Mercancía. Mismo patrón "wizard implícito"
 * que NewPurchaseOrderPage.tsx (gates de renderizado condicional, no un stepper con índice
 * numérico): Paso 0 (adjuntar factura + detección automática, REQ-161/ADR-SCRUM224) → Paso 1
 * (orden vinculada, REQ-162) → Paso 2 (líneas + costeo, REQ-163/164) → Guardar (REQ-165/166) →
 * pantalla de éxito con 3 accesos. `id` en la ruta activa el modo corrección (REQ-167): precarga
 * el registro existente, bloquea el formulario si la orden ya está Recibida — el Paso 0 no aplica
 * en modo corrección (la orden ya está fija).
 */

/** REQ-157 — Logística navega acá con la orden ya preseleccionada (mismo patrón que NewOrderPrefillState). */
export interface GoodsReceiptPrefillState {
  orderId: number
}

interface LineDraft {
  catalogProductId: number
  reference:         string | null
  description:       string | null
  quantity:           string
  unitCost:            string
  warehouseId:         number | ''
  // SCRUM-224 (REQ-161) — true si esta línea vino precargada por la detección automática de factura.
  detected:            boolean
}

function receiptErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
  const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  return firstFieldError ?? data?.message ?? fallback
}

function isPartialInfo(x: GoodsReceiptDetail | GoodsReceiptPartialInfo): x is GoodsReceiptPartialInfo {
  return 'requires_pending_status' in x
}

export default function GoodsReceiptWizardPage() {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = (location.state as GoodsReceiptPrefillState | null) ?? null
  const { id: idParam } = useParams()
  const editingId = idParam ? Number(idParam) : null

  const { data: existingReceipt } = useGoodsReceipt(editingId)

  const [orderId, setOrderId] = useState<number | null>(prefill?.orderId ?? null)
  const [orderSearch, setOrderSearch] = useState('')
  const { data: eligibleOrders } = useGoodsReceiptEligibleOrders(orderSearch)
  const { data: orderProducts } = useGoodsReceiptOrderProducts(orderId)
  const { data: warehousesData } = useWarehouses()

  const [lines, setLines] = useState<LineDraft[]>([])
  const [addProductId, setAddProductId] = useState('')
  const [importCostTotal, setImportCostTotal] = useState('')
  const [freightTotal, setFreightTotal] = useState('')
  const [handlingTotal, setHandlingTotal] = useState('')
  const [otherCostsTotal, setOtherCostsTotal] = useState('')

  const [partialInfo, setPartialInfo] = useState<GoodsReceiptPartialInfo | null>(null)
  const [remainderStatus, setRemainderStatus] = useState<RemainderStatus | ''>('')
  const [savedId, setSavedId] = useState<number | null>(null)

  // SCRUM-224 (REQ-161, ADR-SCRUM224) — Paso 0: adjuntar factura + detección automática.
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [invoiceJobId, setInvoiceJobId] = useState<string | null>(null)
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const uploadInvoice = useUploadGoodsReceiptInvoice()
  const invoicePoll = useGoodsReceiptInvoiceMatch(invoiceJobId)
  const matchResult = invoicePoll.data?.status === 'completed' ? invoicePoll.data.result : null
  const detecting = uploadInvoice.isPending || invoicePoll.data?.status === 'pending' || invoicePoll.data?.status === 'running'

  const createReceipt = useCreateGoodsReceipt()
  const updateReceipt = useUpdateGoodsReceipt()
  const saving = createReceipt.isPending || updateReceipt.isPending
  const saveErrorObj = createReceipt.isError ? createReceipt.error : (updateReceipt.isError ? updateReceipt.error : undefined)

  // Hallazgo de Pre-QA (2026-07-20): al navegar desde la pantalla de éxito a "Corregir ingreso"
  // (misma ruta /compras/ingresos/*, React Router NO remonta el componente), `savedId` seguía
  // seteado y la pantalla de éxito quedaba pegada para siempre en vez de mostrar el wizard de
  // edición. Resetear el estado de guardado cada vez que cambia `editingId` (incluye null→id).
  useEffect(() => {
    setSavedId(null)
    setPartialInfo(null)
    setRemainderStatus('')
  }, [editingId])

  // REQ-167 — precarga al corregir un ingreso ya guardado.
  useEffect(() => {
    if (existingReceipt === undefined) return
    setOrderId(existingReceipt.purchase_order_id)
    setLines(existingReceipt.lines.map(l => ({
      catalogProductId: l.catalog_product_id,
      reference:         l.reference,
      description:       l.description,
      quantity:           String(l.quantity),
      unitCost:            String(l.unit_cost),
      warehouseId:         l.warehouse_id,
      detected:            false,
    })))
    setImportCostTotal(existingReceipt.import_cost_total !== null ? String(existingReceipt.import_cost_total) : '')
    setFreightTotal(existingReceipt.freight_total !== null ? String(existingReceipt.freight_total) : '')
    setHandlingTotal(existingReceipt.handling_total !== null ? String(existingReceipt.handling_total) : '')
    setOtherCostsTotal(existingReceipt.other_costs_total !== null ? String(existingReceipt.other_costs_total) : '')
  }, [existingReceipt])

  // REQ-162 RN — al vincular una orden, precarga TODOS sus productos esperados con su cantidad
  // COMPLETA pedida (no la que falta). Solo en modo creación — nunca pisa lo ya cargado al editar.
  // SCRUM-224 — si la detección de factura ya resolvió esta MISMA orden, la cantidad/costo
  // detectados reemplazan la precarga estándar y la línea queda marcada `detected: true` (badge
  // en la tabla) — nunca se agregan líneas que la orden no esperaba (mismo alcance que REQ-163).
  useEffect(() => {
    if (editingId !== null || orderProducts === undefined) return
    const detectedByProduct = new Map(
      (matchResult?.matched_order_id === orderProducts.id ? matchResult.lines : []).map(l => [l.catalog_product_id, l]),
    )
    setLines(orderProducts.products.map(p => {
      const detected = detectedByProduct.get(p.catalog_product_id)

      return {
        catalogProductId: p.catalog_product_id,
        reference:         p.reference,
        description:       p.description,
        quantity:           String(detected?.quantity ?? p.expected_quantity),
        unitCost:            String(detected?.unit_cost ?? p.unit_cost),
        warehouseId:         '',
        detected:            detected !== undefined,
      }
    }))
  }, [orderProducts, editingId, matchResult])

  // SCRUM-224 — si la detección resolvió una orden real y el usuario todavía no eligió ninguna a
  // mano, la precarga automáticamente (Paso 1). Nunca pisa una orden ya elegida manualmente — y,
  // hallazgo de Pre-QA, tampoco vuelve a pisarla si el usuario la deselecciona a propósito con
  // "Cambiar" (eso pone orderId en null de nuevo, lo que sin este guard reactivaba el efecto y
  // el botón "Cambiar" parecía no hacer nada). El guard es por jobId: subir una factura NUEVA sí
  // puede volver a auto-seleccionar.
  const autoSelectedForJobRef = useRef<string | null>(null)
  useEffect(() => {
    if (editingId !== null || orderId !== null) return
    if (matchResult === null || matchResult.matched_order_id === null) return
    if (invoiceJobId !== null && autoSelectedForJobRef.current === invoiceJobId) return
    autoSelectedForJobRef.current = invoiceJobId
    setOrderId(matchResult.matched_order_id)
  }, [matchResult, orderId, editingId, invoiceJobId])

  const handleDetectInvoice = () => {
    if (invoiceFile === null) return
    setInvoiceError(null)
    setInvoiceJobId(null)
    uploadInvoice.mutate(invoiceFile, {
      onSuccess: res => setInvoiceJobId(res.job_id),
      onError:   err => setInvoiceError(receiptErrorMessage(err, t('compras:goodsReceipts.wizard.invoice.errors.generic'))),
    })
  }

  const isLocal = orderProducts?.provider_origin === 'local'

  // REQ-164 Escenario 1 (fix Pre-QA 2026-07-20, rechazado por marly: el reparto no era
  // observable) — preview client-side del costeo por línea, mismo cálculo que
  // GoodsReceiptController::saveReceipt() (proveedor local: ITBMS 7%; no local: prorrateo
  // proporcional al valor de línea). Es solo un preview -- la fuente de verdad persistida es la
  // respuesta del backend al guardar (GoodsReceiptLine.cost_total).
  const ITBMS_RATE_LOCAL_PREVIEW = 0.07
  const lineValue = (l: LineDraft): number => (Number(l.quantity) || 0) * (Number(l.unitCost) || 0)
  const totalLineValue = lines.reduce((sum, l) => sum + lineValue(l), 0)
  const shippingTotal = (Number(importCostTotal) || 0) + (Number(freightTotal) || 0)
    + (Number(handlingTotal) || 0) + (Number(otherCostsTotal) || 0)
  const previewLineCostTotal = (l: LineDraft): number => {
    const value = lineValue(l)
    if (isLocal) {
      return value + value * ITBMS_RATE_LOCAL_PREVIEW
    }
    if (shippingTotal <= 0 || totalLineValue <= 0) {
      return value
    }
    return value + (value / totalLineValue) * shippingTotal
  }

  const selectOrder = (id: number) => {
    setOrderId(id)
    setOrderSearch('')
  }

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }
  const removeLine = (index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index))
  }
  const addBackProduct = (catalogProductId: number) => {
    const product = orderProducts?.products.find(p => p.catalog_product_id === catalogProductId)
    if (!product) return
    setLines(prev => [...prev, {
      catalogProductId: product.catalog_product_id,
      reference:         product.reference,
      description:       product.description,
      quantity:           String(product.expected_quantity),
      unitCost:            String(product.unit_cost),
      warehouseId:         '',
      detected:            false,
    }])
    setAddProductId('')
  }

  // REQ-163 — el buscador de "agregar producto" solo ofrece productos esperados que todavía no
  // están en la lista (para el caso de haber quitado uno por error).
  const availableToAdd = (orderProducts?.products ?? [])
    .filter(p => !lines.some(l => l.catalogProductId === p.catalog_product_id))

  const canSave = orderId !== null && lines.length > 0
    && lines.every(l => l.warehouseId !== '' && Number(l.quantity) > 0)

  const buildPayload = (pendingRemainderStatus?: RemainderStatus): GoodsReceiptPayload => {
    const linePayload: GoodsReceiptLinePayload[] = lines.map(l => ({
      catalog_product_id: l.catalogProductId,
      quantity:            Number(l.quantity || 0),
      unit_cost:            Number(l.unitCost || 0),
      warehouse_id:         l.warehouseId as number,
    }))

    return {
      ...(editingId === null ? { purchase_order_id: orderId as number } : {}),
      lines: linePayload,
      ...(!isLocal ? {
        import_cost_total: importCostTotal !== '' ? Number(importCostTotal) : undefined,
        freight_total:       freightTotal !== '' ? Number(freightTotal) : undefined,
        handling_total:      handlingTotal !== '' ? Number(handlingTotal) : undefined,
        other_costs_total:   otherCostsTotal !== '' ? Number(otherCostsTotal) : undefined,
      } : {}),
      ...(pendingRemainderStatus ? { pending_remainder_status: pendingRemainderStatus } : {}),
    }
  }

  const handleSave = async (pendingRemainderStatus?: RemainderStatus) => {
    const payload = buildPayload(pendingRemainderStatus)
    try {
      const result = editingId !== null
        ? await updateReceipt.mutateAsync({ id: editingId, data: payload })
        : await createReceipt.mutateAsync(payload)

      if (isPartialInfo(result)) {
        setPartialInfo(result)
        return
      }
      setPartialInfo(null)
      setRemainderStatus('')
      setSavedId(result.id)
    } catch {
      // error mostrado inline via mutation state
    }
  }

  const startOver = () => {
    setOrderId(null); setOrderSearch(''); setLines([])
    setImportCostTotal(''); setFreightTotal(''); setHandlingTotal(''); setOtherCostsTotal('')
    setPartialInfo(null); setRemainderStatus(''); setSavedId(null)
    setInvoiceFile(null); setInvoiceJobId(null); setInvoiceError(null)
  }

  // REQ-167 RN — un ingreso de una orden ya "Recibida" queda bloqueado para edición.
  if (editingId !== null && existingReceipt !== undefined && !existingReceipt.editable) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-sm text-slate-600 mb-4">{t('compras:goodsReceipts.wizard.notEditable')}</p>
        <Button variant="outline" onClick={() => navigate('/compras/ingresos')}>
          {t('compras:goodsReceipts.title')}
        </Button>
      </div>
    )
  }

  if (savedId !== null) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h1 className="text-lg font-bold text-slate-900 mb-2">{t('compras:goodsReceipts.wizard.success.title')}</h1>
        <p className="text-sm text-slate-600 mb-6">{t('compras:goodsReceipts.wizard.success.message', { id: savedId })}</p>
        <div className="flex flex-col items-center gap-2">
          <Button onClick={() => navigate('/inventario?chip=por_ingresar')}>
            {t('compras:goodsReceipts.wizard.success.viewInventory')}
          </Button>
          <Button variant="outline" onClick={() => navigate(`/compras/ingresos/${savedId}/editar`)}>
            {t('compras:goodsReceipts.wizard.success.correct')}
          </Button>
          <Button variant="outline" onClick={startOver}>
            {t('compras:goodsReceipts.wizard.success.registerAnother')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-lg font-bold text-slate-900 mb-5">
        {editingId !== null ? t('compras:goodsReceipts.wizard.editTitle') : t('compras:goodsReceipts.wizard.title')}
      </h1>

      {/* Paso 0 — Adjuntar factura + detección automática (REQ-161/ADR-SCRUM224).
          SCRUM-224 (rebote de Gerencia Test 2026-08-12, con video) — el input de archivo y el
          botón "Detectar automáticamente" solo se renderizaban cuando `orderId === null`. Eso
          rompía el caso real de uso: al entrar desde Logística (REQ-157, `GoodsReceiptPrefillState`)
          la orden YA viene preseleccionada, así que esta sección colapsaba al branch
          `invoiceFile !== null && (...)` — que no renderiza nada porque `invoiceFile` arranca en
          null. El usuario veía el encabezado "Adjuntar factura (opcional)" sin ningún control
          debajo, y recién podía subir un archivo si primero pulsaba "Cambiar" en Orden vinculada
          para volver a poner `orderId` en null. El propósito del paso es justamente detectar la
          orden A PARTIR de la factura — no debe depender de tener la orden ya elegida. Ahora el
          input + botón están siempre visibles (sin tocar `handleDetectInvoice`/el motor de
          detección, que ya funciona igual con orderId preseleccionado: `matchResult` se sigue
          cruzando contra `orderId` para decidir si lo detectado aplica a la orden vinculada,
          ver efectos más arriba). */}
      {editingId === null && (
        <Card variant="panel" className="p-5 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
            {t('compras:goodsReceipts.wizard.steps.invoice')}
          </h2>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('compras:goodsReceipts.wizard.invoice.fileLabel')}
              </label>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,.xlsx,.xls,.csv"
                onChange={e => {
                  setInvoiceFile(e.target.files?.[0] ?? null)
                  setInvoiceJobId(null)
                  setInvoiceError(null)
                }}
                className="text-sm"
              />
            </div>
            <Button variant="outline" disabled={invoiceFile === null} loading={detecting} onClick={handleDetectInvoice}>
              <span className="inline-flex items-center gap-1.5">
                <IcoPaperclip size={13} />
                {detecting ? t('compras:goodsReceipts.wizard.invoice.detecting') : t('compras:goodsReceipts.wizard.invoice.detectButton')}
              </span>
            </Button>
          </div>

          {invoiceFile !== null && (
            <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
              <IcoPaperclip size={13} />
              {matchResult?.matched_order_id === orderId && orderId !== null
                ? t('compras:goodsReceipts.wizard.invoice.detectedSummary', { filename: invoiceFile.name })
                : t('compras:goodsReceipts.wizard.invoice.attachedSummary', { filename: invoiceFile.name })}
            </p>
          )}
          {invoiceError && <p className="text-xs text-red-600 mt-3">{invoiceError}</p>}
          {invoicePoll.data?.status === 'failed' && (
            <p className="text-xs text-red-600 mt-3">
              {invoicePoll.data.error ?? t('compras:goodsReceipts.wizard.invoice.errors.generic')}
            </p>
          )}
          {matchResult?.already_processed && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
              <IcoAlertTriangle size={13} />
              {t('compras:goodsReceipts.wizard.invoice.alreadyProcessed')}
            </p>
          )}
          {matchResult && !matchResult.already_processed && matchResult.matched_order_id === null && (
            <p className="text-xs text-slate-500 mt-3">
              {t('compras:goodsReceipts.wizard.invoice.noMatch')}
            </p>
          )}
        </Card>
      )}

      {/* Paso 1 — Orden vinculada (REQ-162) */}
      <Card variant="panel" className="p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
          {t('compras:goodsReceipts.wizard.steps.order')}
        </h2>
        {orderId === null ? (
          <div>
            <input
              type="text"
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value)}
              placeholder={t('compras:goodsReceipts.wizard.order.searchPlaceholder')}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {eligibleOrders && eligibleOrders.data.length > 0 && (
              <ul className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                {eligibleOrders.data.map(o => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => selectOrder(o.id)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between"
                    >
                      <span>#{o.id} — {o.provider_name}</span>
                      <span className="text-slate-400">{t(`compras:orders.status.${o.status}`)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800">
              #{orderId} — {orderProducts?.provider_name}
              {orderProducts && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {t(`compras:goodsReceipts.wizard.origin.${orderProducts.provider_origin}`)}
                </span>
              )}
            </span>
            {editingId === null && (
              <Button variant="outline" className="!text-xs !px-3 !py-1.5" onClick={() => { setOrderId(null); setLines([]) }}>
                {t('compras:goodsReceipts.wizard.order.change')}
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Paso 2 — Líneas + costeo (REQ-163/164) */}
      {orderId !== null && (
        <Card variant="panel" className="p-5 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
            {t('compras:goodsReceipts.wizard.steps.lines')}
          </h2>

          {/* SCRUM-224 — detección parcial: invita a revisar/completar con el buscador ya existente (REQ-163). */}
          {matchResult?.matched_order_id === orderId && matchResult.unmatched_count > 0 && (
            <p className="text-xs text-amber-600 mb-3 flex items-center gap-1.5">
              <IcoAlertTriangle size={13} />
              {t('compras:goodsReceipts.wizard.invoice.partialDetection', { count: matchResult.unmatched_count })}
            </p>
          )}

          {isLocal ? (
            <p className="text-xs text-slate-500 mb-3">{t('compras:goodsReceipts.wizard.costing.localNote')}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <label className="flex flex-col gap-1 text-xs">
                {t('compras:goodsReceipts.wizard.costing.importCostTotal')}
                <input type="number" step="0.01" value={importCostTotal} onChange={e => setImportCostTotal(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                {t('compras:goodsReceipts.wizard.costing.freightTotal')}
                <input type="number" step="0.01" value={freightTotal} onChange={e => setFreightTotal(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                {t('compras:goodsReceipts.wizard.costing.handlingTotal')}
                <input type="number" step="0.01" value={handlingTotal} onChange={e => setHandlingTotal(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                {t('compras:goodsReceipts.wizard.costing.otherCostsTotal')}
                <input type="number" step="0.01" value={otherCostsTotal} onChange={e => setOtherCostsTotal(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
              </label>
            </div>
          )}

          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.product')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.quantity')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.unitCost')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:goodsReceipts.wizard.lines.costTotal')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:goodsReceipts.wizard.lines.warehouse')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => (
                <tr key={l.catalogProductId}>
                  <td className="py-2">
                    <div className="font-medium text-slate-800 flex items-center gap-1.5">
                      {l.description}
                      {l.detected && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 rounded px-1.5 py-0.5">
                          <IcoCheck size={9} />
                          {t('compras:goodsReceipts.wizard.invoice.detectedBadge')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">{l.reference}</div>
                  </td>
                  <td className="py-2">
                    <input type="number" min="1" value={l.quantity} onChange={e => updateLine(i, { quantity: e.target.value })}
                      className="w-20 px-2 py-1 border border-slate-200 rounded text-sm" />
                  </td>
                  <td className="py-2">
                    <input type="number" step="0.01" value={l.unitCost} onChange={e => updateLine(i, { unitCost: e.target.value })}
                      className="w-24 px-2 py-1 border border-slate-200 rounded text-sm" />
                  </td>
                  <td className="py-2 text-slate-700">
                    {previewLineCostTotal(l).toFixed(2)}
                  </td>
                  <td className="py-2">
                    <select value={l.warehouseId} onChange={e => updateLine(i, { warehouseId: e.target.value ? Number(e.target.value) : '' })}
                      className="px-2 py-1 border border-slate-200 rounded text-sm bg-white">
                      <option value="">—</option>
                      {(warehousesData?.data ?? []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => removeLine(i)} className="text-xs text-red-500 hover:underline">
                      {t('compras:goodsReceipts.wizard.lines.remove')}
                    </button>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 text-sm">
                    {t('compras:goodsReceipts.wizard.lines.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {availableToAdd.length > 0 && (
            <select value={addProductId} onChange={e => e.target.value && addBackProduct(Number(e.target.value))}
              className="px-2 py-1.5 border border-slate-200 rounded text-sm bg-white">
              <option value="">{t('compras:goodsReceipts.wizard.lines.addProduct')}</option>
              {availableToAdd.map(p => <option key={p.catalog_product_id} value={p.catalog_product_id}>{p.reference} — {p.description}</option>)}
            </select>
          )}

          {saveErrorObj && (
            <p className="text-xs text-red-500 mt-3">{receiptErrorMessage(saveErrorObj, t('compras:goodsReceipts.wizard.errors.generic'))}</p>
          )}

          <div className="flex justify-end mt-4">
            <Button disabled={!canSave || saving} loading={saving} onClick={() => handleSave()}>
              {t('compras:goodsReceipts.wizard.actions.save')}
            </Button>
          </div>
        </Card>
      )}

      {/* REQ-165 — modal "Estado de lo pendiente" cuando alguna línea queda incompleta. */}
      {partialInfo && (
        <div className="fixed inset-0 bg-slate-900/50 z-[2000] flex items-center justify-center p-4">
          <Card variant="modal" className="p-6 max-w-md w-full">
            <h3 className="text-sm font-bold text-slate-800 mb-3">{t('compras:goodsReceipts.wizard.partial.title')}</h3>
            <ul className="text-sm mb-4 divide-y divide-slate-100">
              {partialInfo.partial.map(p => {
                const line = lines.find(l => l.catalogProductId === p.catalog_product_id)
                return (
                  <li key={p.catalog_product_id} className="py-1.5">
                    <div className="font-medium text-slate-700">{line?.description ?? p.catalog_product_id}</div>
                    <div className="text-xs text-slate-500">
                      {t('compras:goodsReceipts.wizard.partial.receivedOfExpected', { received: p.received, expected: p.expected })}
                    </div>
                  </li>
                )
              })}
            </ul>
            <label className="flex flex-col gap-1 text-xs mb-4">
              {t('compras:goodsReceipts.wizard.partial.remainderStatus')}
              <select value={remainderStatus} onChange={e => setRemainderStatus(e.target.value as RemainderStatus)}
                className="px-2 py-1.5 border border-slate-200 rounded text-sm bg-white">
                <option value="">—</option>
                {REMAINDER_STATUSES.map(s => (
                  <option key={s} value={s}>{t(`compras:goodsReceipts.wizard.partial.remainder.${s}`)}</option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPartialInfo(null)}>{t('common:actions.cancel')}</Button>
              <Button disabled={remainderStatus === ''} loading={saving} onClick={() => handleSave(remainderStatus as RemainderStatus)}>
                {t('common:actions.confirm')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
