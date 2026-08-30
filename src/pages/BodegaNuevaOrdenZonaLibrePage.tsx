import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { comprasApi } from '@/api/comprasApi'
import { useZonaLibreProvider, useCreateZonaLibreRequest, useZonaLibreRequestDetail, useUpdateZonaLibreRequest } from '@/hooks/useBodega'
import ZonaLibreWarehousesModal from '@/components/bodega/ZonaLibreWarehousesModal'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatMoney, formatInt } from '@/lib/money'
import type { ComprasCatalogProduct } from '@/types/compras'
import type { ZonaLibreShippingType } from '@/types/bodega'

interface CartLine {
  catalogProductId:  number
  reference:         string
  factoryReference:  string | null
  description:       string
  unitCost:          number
  quantity:          number
}

/** 422 estructurado de `GET /bodega/zona-libre/provider` cuando no hay proveedor configurado. */
function providerErrorMessage(err: unknown): string | null {
  if (isAxiosError(err) && err.response?.status === 422) {
    return (err.response.data as { message?: string } | undefined)?.message ?? null
  }
  return null
}

/**
 * SCRUM-433→441 (REQ-363→371) — "Nueva Orden Zona Libre" (3C). Backend ya implementado (ver
 * `atlanticerp-backend/docs/adr/ADR-SCRUM433-445-zona-libre-colon.md`); esta pantalla es 100% frontend.
 *
 * Decisión de diseño (dentro del alcance aprobado): NO reusa `OrderLinesEditor`
 * (`src/components/compras/OrderLinesEditor.tsx`) — ese componente está tejido alrededor de
 * campos que no existen acá (`salesProjectId`, `additionalCostPercent`, `whoPaysShipping`,
 * selector de proveedor). El carrito de este flujo es más chico
 * (Producto/Ref. fábrica/Ref. pública/Cantidad/Costo/Subtotal/Editar/Quitar) y vive inline en
 * esta página, mismo criterio que otras pantallas de Bodega (ej. `SolicitudAjustePage.tsx`).
 */
export default function BodegaNuevaOrdenZonaLibrePage() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()

  // SCRUM-797 (revierte SCRUM-440) — modo edición: mismo formulario que "Nueva Orden", precargado
  // desde la solicitud existente. El gate real de quién puede editar (y hasta qué estado) lo
  // enforcea el backend (`update()`, 403/422) — acá solo se bloquea la UI como defensa en
  // profundidad si alguien llega a esta ruta con una orden que ya no está `pendiente`.
  const { id } = useParams<{ id?: string }>()
  const isEdit = id !== undefined
  const zonaLibreId = isEdit ? Number(id) : null

  const { data: provider, isLoading: providerLoading, isError: providerIsError, error: providerError } = useZonaLibreProvider()
  const { data: existing, isLoading: existingLoading } = useZonaLibreRequestDetail(zonaLibreId)
  const createRequest = useCreateZonaLibreRequest()
  const updateRequest = useUpdateZonaLibreRequest()
  const [prefilled, setPrefilled] = useState(false)

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [quantityDrafts, setQuantityDrafts] = useState<Record<number, string>>({})
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null)
  const [warehousesModal, setWarehousesModal] = useState<{ id: number; name: string } | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState(false)

  const [shippingType, setShippingType] = useState<ZonaLibreShippingType>('terrestre')
  const [estimatedArrival, setEstimatedArrival] = useState('')

  const [createdOrder, setCreatedOrder] = useState<{ order_number: string } | null>(null)

  // REQ-364 — buscador acotado SIEMPRE al proveedor fijo, nunca a otro (RN de REQ-363: Bodega no
  // elige proveedor en este flujo).
  const { data: productResults } = useQuery({
    queryKey: ['compras/products/zona-libre', provider?.id, search],
    queryFn:  () => comprasApi.products.search(provider!.id, search),
    enabled:  provider !== undefined,
  })

  // REQ-365 — un producto agregado al carrito desaparece de "disponibles" sin recargar, y
  // reaparece al quitarlo (derivado del propio estado del carrito en cada render).
  const cartIds = new Set(cart.map(l => l.catalogProductId))
  const availableProducts = (productResults?.data ?? []).filter(p => !cartIds.has(p.id))

  const total = cart.reduce((sum, l) => sum + l.unitCost * l.quantity, 0)

  // SCRUM-797 — precarga el carrito/envío desde la solicitud existente una sola vez (no en cada
  // render — `existing` es la misma referencia mientras React Query no la invalide, pero el guard
  // `!prefilled` evita pisar ediciones del usuario si `existing` llegara a refetchear).
  useEffect(() => {
    if (isEdit && existing && !prefilled) {
      setCart(existing.lines.map(l => ({
        catalogProductId: l.catalog_product_id,
        reference:        l.reference ?? '',
        factoryReference: l.factory_reference,
        description:      l.description ?? '',
        unitCost:          l.unit_cost_snapshot,
        quantity:           l.quantity,
      })))
      setShippingType(existing.shipping_type ?? 'terrestre')
      setEstimatedArrival(existing.estimated_arrival_date ?? '')
      setPrefilled(true)
    }
  }, [isEdit, existing, prefilled])

  const addToCart = (p: ComprasCatalogProduct) => {
    const qty = Number(quantityDrafts[p.id] ?? '0')
    // REQ-364 RN1/Escenario 1 — cantidad 0 (o inválida, incl. no-entera como "1.5" — Pre-QA
    // 2026-07-24: el backend ya rechazaba fracciones con 422 `integer`, pero el frontend dejaba
    // agregarlas al carrito sin aviso, mostrando luego un error genérico recién al guardar la
    // orden completa) no agrega la línea, feedback inline.
    if (!qty || qty <= 0 || !Number.isInteger(qty)) {
      setRowError({ id: p.id, message: t('bodega:zonaLibre.newOrder.products.errors.zeroQuantity') })
      return
    }
    setCart(c => [...c, {
      catalogProductId: p.id,
      reference:        p.reference,
      factoryReference: p.factory_reference,
      description:      p.description,
      unitCost:          p.cost ?? 0,
      quantity:           qty,
    }])
    setQuantityDrafts(d => { const next = { ...d }; delete next[p.id]; return next })
    setRowError(null)
  }

  const removeFromCart = (id: number) => setCart(c => c.filter(l => l.catalogProductId !== id))

  const startEdit = (line: CartLine) => {
    setEditingId(line.catalogProductId)
    setEditValue(String(line.quantity))
    setEditError(false)
  }

  const confirmEdit = () => {
    const qty = Number(editValue)
    // REQ-366 RN1 — no se puede editar a 0 o valor inválido (incl. no-entero, ej. "1.5" — Pre-QA
    // 2026-07-24: `Number.isFinite` sí aceptaba fracciones); el sistema rechaza y mantiene la
    // cantidad anterior (no se toca `cart`, solo se marca el error).
    if (!qty || qty <= 0 || !Number.isInteger(qty)) {
      setEditError(true)
      return
    }
    setCart(c => c.map(l => l.catalogProductId === editingId ? { ...l, quantity: qty } : l))
    setEditingId(null)
    setEditError(false)
  }

  const cancelEdit = () => { setEditingId(null); setEditError(false) }

  const canSubmit = cart.length > 0 && !createRequest.isPending && !updateRequest.isPending

  const handleSubmit = async () => {
    // REQ-369 RN1 — nunca se dispara con el carrito vacío (el botón tampoco se renderiza en ese
    // caso, ver JSX abajo — doble bloqueo, mismo criterio que NewPurchaseOrderPage).
    if (cart.length === 0) return
    const payload = {
      shipping_type: shippingType,
      estimated_arrival_date: estimatedArrival || undefined,
      lines: cart.map(l => ({ catalog_product_id: l.catalogProductId, quantity: l.quantity })),
    }
    try {
      if (isEdit && zonaLibreId !== null) {
        // SCRUM-797 CA7 — sin pantalla de éxito propia, vuelve directo a la bandeja (mismo
        // criterio que "Guardar" en el resto de flujos de edición de Bodega).
        await updateRequest.mutateAsync({ id: zonaLibreId, payload })
        navigate('/bodega/ordenes-zona-libre')
      } else {
        const result = await createRequest.mutateAsync(payload)
        setCreatedOrder({ order_number: result.order_number })
      }
    } catch {
      // error mostrado inline vía createRequest.isError/updateRequest.isError
    }
  }

  // REQ-371 RN1 — "Crear una nueva" reinicia el formulario SIN navegar.
  const startOver = () => {
    setCart([])
    setQuantityDrafts({})
    setRowError(null)
    setShippingType('terrestre')
    setEstimatedArrival('')
    setCreatedOrder(null)
    setSearch('')
  }

  if (providerLoading || (isEdit && existingLoading)) {
    return <p className="text-slate-400 text-sm py-8 text-center">{t('common:labels.loading')}</p>
  }

  if (providerIsError) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-red-600 text-sm">
          {providerErrorMessage(providerError) ?? t('bodega:zonaLibre.newOrder.providerMissing')}
        </p>
      </div>
    )
  }

  // SCRUM-797 CA8/CA9 — defensa en profundidad: el backend ya rechaza con 422 si la orden dejó de
  // estar pendiente, pero si alguien llega a esta ruta por URL directa con una orden ya resuelta,
  // ni siquiera se muestra el formulario.
  if (isEdit && existing && existing.status !== 'pendiente') {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-red-600 text-sm">
          {t('bodega:zonaLibre.newOrder.editBlocked', { status: t(`bodega:zonaLibre.orders.status.${existing.status}`) })}
        </p>
      </div>
    )
  }

  if (createdOrder !== null) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <Card variant="panel" className="p-6">
          <h1 className="text-lg font-bold text-slate-900 mb-1">
            {t('bodega:zonaLibre.newOrder.success.title', { number: createdOrder.order_number })}
          </h1>
          <p className="text-sm text-slate-600 mb-4">
            {t('bodega:zonaLibre.newOrder.success.status')}: <b>{t('bodega:zonaLibre.newOrder.success.pendingLabel')}</b>
          </p>
          <p className="text-xs text-slate-400 mb-6">{t('bodega:zonaLibre.newOrder.success.note')}</p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => navigate('/bodega/ordenes-zona-libre')}>
              {t('bodega:zonaLibre.newOrder.success.goToOrders')}
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            {t('bodega:zonaLibre.newOrder.success.another')}{' '}
            <button className="text-primary font-semibold underline" onClick={startOver}>
              {t('bodega:zonaLibre.newOrder.success.createNew')}
            </button>
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">
          {isEdit
            ? t('bodega:zonaLibre.newOrder.editTitle', { number: existing?.order_number ?? id })
            : t('bodega:zonaLibre.newOrder.title')}
        </h1>
        <p className="text-[12px] text-slate-500">
          {isEdit ? t('bodega:zonaLibre.newOrder.editSubtitle') : t('bodega:zonaLibre.newOrder.subtitle')}
        </p>
      </div>

      {/* SCRUM-433 RN2 — aviso de restricción de proveedor único, siempre visible */}
      <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
        {t('bodega:zonaLibre.newOrder.providerRestrictionNotice', { provider: provider?.name })}
      </div>

      {/* Proveedor (fijo, sin selector) */}
      <Card variant="panel" className="p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
          {t('bodega:zonaLibre.newOrder.steps.provider')}
        </h2>
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-3 py-2.5">
          <span className="font-semibold text-slate-800">{provider?.name}</span>
          <span className="text-[11px] text-slate-400 uppercase tracking-wide">
            {t('bodega:zonaLibre.newOrder.provider.fixedBadge')}
          </span>
        </div>
      </Card>

      {/* Productos del proveedor */}
      <Card variant="panel" className="p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
          {t('bodega:zonaLibre.newOrder.steps.products')}
        </h2>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('bodega:zonaLibre.newOrder.products.searchPlaceholder')}
          className="w-full mb-3 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <Th>{t('bodega:zonaLibre.newOrder.products.table.factoryRef')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.products.table.publicRef')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.products.table.product')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.products.table.available')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.products.table.warehouses')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.products.table.unitCost')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.products.table.quantity')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {availableProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400 text-xs">
                    {t('bodega:zonaLibre.newOrder.products.empty')}
                  </td>
                </tr>
              )}
              {availableProducts.map(p => (
                <tr key={p.id}>
                  <td className="py-2 text-slate-600">{p.factory_reference ?? '—'}</td>
                  <td className="py-2 text-slate-600">{p.reference}</td>
                  <td className="py-2 font-medium text-slate-800">{p.description}</td>
                  <td className="py-2 text-slate-600">{p.stock_quantity ?? 0}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-primary text-xs underline"
                      onClick={() => setWarehousesModal({ id: p.id, name: p.description })}
                    >
                      {t('bodega:zonaLibre.newOrder.products.viewWarehouses')}
                    </button>
                  </td>
                  {/* SCRUM-436 (rebote de Daniela Amaya 2026-08-13, RN2 — aplica a todo campo
                      numérico monetario, no solo al carrito) */}
                  <td className="py-2 text-slate-600">${formatMoney(p.cost ?? 0)}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={quantityDrafts[p.id] ?? '0'}
                      onChange={e => { setQuantityDrafts(d => ({ ...d, [p.id]: e.target.value })); setRowError(null) }}
                      className="w-16 px-2 py-1 border border-slate-200 rounded text-sm"
                    />
                    {rowError?.id === p.id && (
                      <p className="text-red-600 text-[11px] mt-1 max-w-[140px]">{rowError.message}</p>
                    )}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button variant="outline" className="!text-xs !px-2 !py-1" onClick={() => addToCart(p)}>
                      {t('bodega:zonaLibre.newOrder.products.add')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Líneas de la orden + envío + guardar — solo visible con carrito no vacío (REQ-369 RN1) */}
      {cart.length > 0 && (
        <Card variant="panel" className="p-5 mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
            {t('bodega:zonaLibre.newOrder.steps.lines')}
          </h2>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-slate-200">
                <Th>{t('bodega:zonaLibre.newOrder.lines.product')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.lines.factoryRef')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.lines.publicRef')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.lines.quantity')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.lines.unitCost')}</Th>
                <Th>{t('bodega:zonaLibre.newOrder.lines.subtotal')}</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cart.map(line => (
                <tr key={line.catalogProductId}>
                  <td className="py-2 font-medium text-slate-800">{line.description}</td>
                  <td className="py-2 text-slate-600">{line.factoryReference ?? '—'}</td>
                  <td className="py-2 text-slate-600">{line.reference}</td>
                  <td className="py-2">
                    {editingId === line.catalogProductId ? (
                      <div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={editValue}
                            onChange={e => { setEditValue(e.target.value); setEditError(false) }}
                            className="w-16 px-2 py-1 border border-slate-200 rounded text-sm"
                            autoFocus
                          />
                          <Button variant="outline" className="!text-xs !px-1.5 !py-1" onClick={confirmEdit}>
                            {t('common:actions.confirm')}
                          </Button>
                          <Button variant="outline" className="!text-xs !px-1.5 !py-1" onClick={cancelEdit}>
                            {t('common:actions.cancel')}
                          </Button>
                        </div>
                        {editError && (
                          <p className="text-red-600 text-[11px] mt-1">
                            {t('bodega:zonaLibre.newOrder.lines.errors.invalidQuantity')}
                          </p>
                        )}
                      </div>
                    ) : (
                      // SCRUM-436 (rebote de Daniela Amaya 2026-08-13) — separador de miles
                      // también en Cantidad (RN1/Escenario 2: cantidades grandes agrupadas).
                      formatInt(line.quantity)
                    )}
                  </td>
                  <td className="py-2 text-slate-600">${formatMoney(line.unitCost)}</td>
                  <td className="py-2 font-semibold text-slate-800">${formatMoney(line.unitCost * line.quantity)}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button type="button" className="text-primary text-xs underline mr-3" onClick={() => startEdit(line)}>
                      {t('common:actions.edit')}
                    </button>
                    <button
                      type="button"
                      className="text-red-600 text-xs underline"
                      onClick={() => removeFromCart(line.catalogProductId)}
                    >
                      {t('bodega:zonaLibre.newOrder.lines.remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end font-bold text-slate-800 text-sm mb-4">
            {t('bodega:zonaLibre.newOrder.lines.total')}: ${formatMoney(total)}
          </div>

          {/* Detalles del envío */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('bodega:zonaLibre.newOrder.shipping.modality')}
              </label>
              <select
                disabled
                value="zona_libre"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400"
              >
                <option value="zona_libre">{t('bodega:zonaLibre.newOrder.shipping.modalityValue')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('bodega:zonaLibre.newOrder.shipping.type')}
              </label>
              <select
                value={shippingType}
                onChange={e => setShippingType(e.target.value as ZonaLibreShippingType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="terrestre">{t('bodega:zonaLibre.newOrder.shipping.terrestre')}</option>
                <option value="aereo">{t('bodega:zonaLibre.newOrder.shipping.aereo')}</option>
                <option value="maritimo">{t('bodega:zonaLibre.newOrder.shipping.maritimo')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('bodega:zonaLibre.newOrder.shipping.estimatedArrival')}
              </label>
              <input
                type="date"
                value={estimatedArrival}
                onChange={e => setEstimatedArrival(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          {(createRequest.isError || updateRequest.isError) && (
            <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
              {t('bodega:zonaLibre.newOrder.errors.generic')}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button disabled={!canSubmit} loading={createRequest.isPending || updateRequest.isPending} onClick={handleSubmit}>
              {isEdit ? t('bodega:zonaLibre.newOrder.actions.submitEdit') : t('bodega:zonaLibre.newOrder.actions.submit')}
            </Button>
          </div>
        </Card>
      )}

      {warehousesModal && (
        <ZonaLibreWarehousesModal
          productName={warehousesModal.name}
          catalogProductId={warehousesModal.id}
          onClose={() => setWarehousesModal(null)}
        />
      )}
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  )
}
