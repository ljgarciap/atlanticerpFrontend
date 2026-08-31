import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { comprasApi } from '@/api/comprasApi'
import { useCreatePurchaseOrder, useOpenPurchaseOrderPdf, useSendPurchaseOrderEmail } from '@/hooks/useCompras'
import ProviderFormDrawer from '@/components/compras/ProviderFormDrawer'
import OrderLinesEditor, {
  emptyOrderDraft, buildLinesPayload, type OrderDraft,
} from '@/components/compras/OrderLinesEditor'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Provider } from '@/types/compras'

/**
 * SCRUM-242 (REQ-179) — prefill de "Generar orden" desde Inventario: el botón en cada producto
 * abre este MISMO formulario, con proveedor + una línea del producto ya cargados (state de
 * navegación, no query params — evita exponer costo/cantidad en la URL). InventarioPage arma
 * este objeto tras leer /inventory/{id}/order-prefill.
 */
export interface NewOrderPrefillState {
  providerId: number
  product: {
    id:          number
    reference:   string
    description: string
    unitCost:    number
    quantity:    number
  }
}

/**
 * SCRUM-194 (hallazgo QA 2026-07-16): al fallar "Crear orden" por una referencia de producto
 * duplicada, la UI solo mostraba el mensaje genérico "No se pudo crear la orden..." sin indicar
 * cuál línea/producto es el conflictivo, aunque el backend YA devuelve el detalle exacto
 * (StorePurchaseOrderRequest::uniquePublicReferenceRule() incluye el nombre del producto). Mismo
 * patrón que ComprasSettingsPanel/ClientDetailModal para leer el 422 estructurado.
 */
function createOrderErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
  const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  return firstFieldError ?? data?.message ?? fallback
}

export default function NewPurchaseOrderPage() {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = (location.state as NewOrderPrefillState | null) ?? null
  const createOrder = useCreatePurchaseOrder()
  const openPdf = useOpenPurchaseOrderPdf()
  const sendEmail = useSendPurchaseOrderEmail()
  const [includeCostInDocs, setIncludeCostInDocs] = useState(true)

  // ── Paso 1: Proveedor ──────────────────────────────────────────────────
  const [providerId,   setProviderId]   = useState<number | null>(prefill?.providerId ?? null)
  const [providerName, setProviderName] = useState('')
  const [providerSearch, setProviderSearch] = useState('')
  // SCRUM-729 — el listado quedaba permanentemente desplegado apenas había resultados,
  // sin importar si el campo tenía foco (regresión reportada por Daniela). Mismo patrón
  // de foco/blur que ContactoAutocomplete/AutocompleteInput: se abre al enfocar/tipear,
  // se cierra al perder el foco (con delay para que el onMouseDown de una opción alcance
  // a dispararse antes de que el blur la oculte).
  const [providerListOpen, setProviderListOpen] = useState(false)
  const [showNewProviderDrawer, setShowNewProviderDrawer] = useState(false)
  const [confirmChangeProvider, setConfirmChangeProvider] = useState(false)

  const { data: providerResults } = useQuery({
    queryKey: ['compras/providers/picker', providerSearch],
    queryFn:  () => comprasApi.providers.list({ search: providerSearch || undefined, per_page: 20 }),
    enabled:  providerId === null,
  })

  // Inventario solo manda el providerId (evita otro round-trip antes de navegar) — el nombre se
  // resuelve acá para mostrarlo en el Paso 1 ya "cerrado", igual que cuando se elige a mano.
  const { data: prefillProviderDetail } = useQuery({
    queryKey: ['compras/providers', prefill?.providerId],
    queryFn:  () => comprasApi.providers.get((prefill as NewOrderPrefillState).providerId),
    enabled:  prefill !== null,
  })
  useEffect(() => {
    if (prefillProviderDetail) setProviderName(prefillProviderDetail.name)
  }, [prefillProviderDetail])

  // ── Paso 2/3: Productos + Líneas + envío ────────────────────────────────
  const [draft, setDraft] = useState<OrderDraft>(() => prefill === null ? emptyOrderDraft() : {
    ...emptyOrderDraft(),
    lines: [{
      key:                    `prefill-${prefill.product.id}`,
      catalogProductId:       prefill.product.id,
      newProduct:             null,
      reference:              prefill.product.reference,
      factoryReference:       null,
      description:            prefill.product.description,
      unitCost:               prefill.product.unitCost,
      quantity:               prefill.product.quantity,
      additionalCostAmount:   null,
      additionalCostType:     null,
      salesProjectId:         null,
      salesProjectLabel:      null,
    }],
  })

  // ── Paso 4: Orden creada ────────────────────────────────────────────────
  const [createdOrderId,       setCreatedOrderId]       = useState<number | null>(null)
  const [createdRequiresApproval, setCreatedRequiresApproval] = useState(false)

  const selectProvider = (p: Provider) => {
    setProviderId(p.id)
    setProviderName(p.name)
    setProviderSearch('')
    setProviderListOpen(false)
  }

  const requestChangeProvider = () => {
    if (draft.lines.length > 0) {
      setConfirmChangeProvider(true)
    } else {
      resetProvider()
    }
  }
  const resetProvider = () => {
    setProviderId(null)
    setProviderName('')
    setDraft(emptyOrderDraft())
    setConfirmChangeProvider(false)
  }

  const canSubmit = providerId !== null && draft.lines.length > 0 && !createOrder.isPending

  const handleSubmit = async () => {
    if (providerId === null) return
    try {
      const order = await createOrder.mutateAsync({
        provider_id: providerId,
        shipping_type: draft.shippingType,
        who_pays_shipping: draft.whoPaysShipping,
        shipping_cost: draft.shippingCost !== '' ? Number(draft.shippingCost) : null,
        modality: draft.modality,
        estimated_arrival_date: draft.estimatedArrivalDate || null,
        lines: buildLinesPayload(draft),
      })
      setCreatedOrderId(order.id)
      setCreatedRequiresApproval(order.requires_primary_approval)
    } catch {
      // error mostrado inline via mutation state
    }
  }

  const startOver = () => {
    setProviderId(null); setProviderName(''); setDraft(emptyOrderDraft())
    setCreatedOrderId(null); setCreatedRequiresApproval(false)
  }

  if (createdOrderId !== null) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h1 className="text-lg font-bold text-slate-900 mb-2">{t('compras:newOrder.success.title')}</h1>
        <p className="text-sm text-slate-600 mb-2">{t('compras:newOrder.success.message', { id: createdOrderId })}</p>
        {createdRequiresApproval && (
          <p className="text-sm text-amber-600 mb-4">{t('compras:newOrder.success.requiresApproval')}</p>
        )}

        <div className="flex items-center justify-center gap-3 mt-4">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={includeCostInDocs}
              onChange={e => setIncludeCostInDocs(e.target.checked)}
              className="rounded border-slate-300"
            />
            {t('compras:orders.detail.includeCost')}
          </label>
          <Button
            variant="outline"
            className="!text-xs !px-3 !py-1.5"
            loading={openPdf.isPending}
            onClick={() => {
              // Ver OrderDetailPage: window.open() sincrónico, atado al click, antes del
              // await del fetch del PDF — si no, el navegador lo bloquea como popup.
              const targetWindow = window.open('', '_blank')
              openPdf.mutate({ id: createdOrderId, includeCost: includeCostInDocs, targetWindow })
            }}
          >
            {t('compras:orders.actions.viewPdf')}
          </Button>
          <Button
            variant="outline"
            className="!text-xs !px-3 !py-1.5"
            loading={sendEmail.isPending}
            onClick={() => sendEmail.mutate({ id: createdOrderId, includeCost: includeCostInDocs })}
          >
            {t('compras:orders.actions.sendEmail')}
          </Button>
        </div>
        {sendEmail.isSuccess && (
          <p className="text-xs text-emerald-600 mt-2">{t('compras:orders.detail.emailSent')}</p>
        )}
        {sendEmail.isError && (
          <p className="text-xs text-red-600 mt-2">{t('compras:orders.errors.sendEmailGeneric')}</p>
        )}

        <div className="flex justify-center gap-3 mt-6">
          <Button variant="outline" onClick={() => navigate('/compras/ordenes')}>
            {t('compras:nav.orders')}
          </Button>
          <Button onClick={startOver}>{t('compras:newOrder.title')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-lg font-bold text-slate-900 mb-5">{t('compras:newOrder.title')}</h1>

      {/* Paso 1 — Proveedor */}
      <Card variant="panel" className="p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
          {t('compras:newOrder.steps.provider')}
        </h2>
        {providerId === null ? (
          <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                value={providerSearch}
                onChange={e => { setProviderSearch(e.target.value); setProviderListOpen(true) }}
                onFocus={() => setProviderListOpen(true)}
                onBlur={() => setTimeout(() => setProviderListOpen(false), 150)}
                placeholder={t('compras:newOrder.provider.searchPlaceholder')}
                autoComplete="off"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <Button variant="outline" onClick={() => setShowNewProviderDrawer(true)}>
                {t('compras:newOrder.provider.newProvider')}
              </Button>
            </div>
            {providerListOpen && providerResults && providerResults.data.length > 0 && (
              <ul className="absolute z-50 mt-1 w-full max-w-[calc(100%-6.5rem)] border border-slate-200 rounded-lg bg-white divide-y divide-slate-100 overflow-hidden shadow-lg">
                {providerResults.data.map(p => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseDown={() => selectProvider(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800">{providerName}</span>
            <Button variant="outline" className="!text-xs !px-3 !py-1.5" onClick={requestChangeProvider}>
              {t('compras:newOrder.provider.change')}
            </Button>
          </div>
        )}
      </Card>

      {/* Paso 2/3 — Productos, líneas, envío */}
      {providerId !== null && (
        <OrderLinesEditor
          providerId={providerId}
          draft={draft}
          onChange={setDraft}
          errorMessage={createOrder.isError
            ? createOrderErrorMessage(createOrder.error, t('compras:newOrder.errors.generic'))
            : undefined}
        />
      )}

      {draft.lines.length > 0 && (
        <div className="flex justify-end mb-8">
          <Button disabled={!canSubmit} loading={createOrder.isPending} onClick={handleSubmit}>
            {t('compras:newOrder.actions.submit')}
          </Button>
        </div>
      )}

      {showNewProviderDrawer && (
        <ProviderFormDrawer
          providerId={null}
          onClose={() => setShowNewProviderDrawer(false)}
          onSaved={(provider) => {
            // REQ-129 RN2: queda seleccionado automáticamente — nombre real del proveedor
            // recién creado, no una suposición basada en la búsqueda o en una lista vieja.
            setProviderId(provider.id)
            setProviderName(provider.name)
            setShowNewProviderDrawer(false)
          }}
        />
      )}

      {confirmChangeProvider && (
        <div className="fixed inset-0 bg-slate-900/50 z-[2000] flex items-center justify-center p-4">
          <Card variant="modal" className="p-6 max-w-sm w-full">
            <p className="text-sm text-slate-700 mb-5 leading-relaxed">
              {t('compras:newOrder.provider.changeWarning')}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmChangeProvider(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button variant="danger" onClick={resetProvider}>
                {t('common:actions.confirm')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
