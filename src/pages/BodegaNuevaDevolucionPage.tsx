import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSearchReturnOrders, useCreateCustomerReturn } from '@/hooks/useBodega'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { CustomerReturnReason, ReturnSearchOrderItem, ReturnSearchOrderResult } from '@/types/bodega'

const REASONS: CustomerReturnReason[] = [
  'danado_defectuoso', 'no_corresponde', 'cliente_cambio_opinion', 'excedente', 'error_instalacion', 'otra',
]

interface LineDraft {
  included:     boolean
  quantity:     string
  reason:       CustomerReturnReason
  reasonDetail: string
}

/**
 * SCRUM-484→489 (REQ-415→419) — "Nueva devolución" (3K). Backend ya implementado localmente
 * (ver `BodegaDevolucionesPage.tsx` para el detalle del estado del backend) — 100% frontend acá.
 *
 * REQ-415 — el buscador ya trae Cliente/Proyecto/productos entregados en una sola llamada
 * (`search-orders`), sin una segunda llamada para resolver el detalle de la guía elegida.
 */
export default function BodegaNuevaDevolucionPage() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<ReturnSearchOrderResult | null>(null)
  const [lines, setLines] = useState<Record<number, LineDraft>>({})
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ return_number: string } | null>(null)

  const { data: searchResults, isFetching } = useSearchReturnOrders(search)
  const createReturn = useCreateCustomerReturn()

  function selectOrder(order: ReturnSearchOrderResult) {
    setSelectedOrder(order)
    setLines(Object.fromEntries(order.items.map(item => [
      item.order_item_id,
      { included: false, quantity: String(item.qty_delivered), reason: REASONS[0], reasonDetail: '' } satisfies LineDraft,
    ])))
    setContactName('')
    setContactPhone('')
    setFormError(null)
    setSearch(`${order.order_number} — ${order.customer_name}`)
  }

  function updateLine(orderItemId: number, patch: Partial<LineDraft>) {
    setLines(prev => ({ ...prev, [orderItemId]: { ...prev[orderItemId], ...patch } }))
    setFormError(null)
  }

  function startOver() {
    setSearch('')
    setSelectedOrder(null)
    setLines({})
    setContactName('')
    setContactPhone('')
    setFormError(null)
    setCreated(null)
  }

  async function handleSubmit() {
    if (!selectedOrder) { setFormError(t('bodega:returns.newReturnPage.errors.noOrderSelected')); return }

    const included = selectedOrder.items
      .map(item => ({ item, draft: lines[item.order_item_id] }))
      .filter(({ draft }) => draft?.included)

    if (included.length === 0) { setFormError(t('bodega:returns.newReturnPage.errors.noProductsSelected')); return }
    if (contactName.trim() === '' || contactPhone.trim() === '') {
      setFormError(t('bodega:returns.newReturnPage.errors.missingContact'))
      return
    }

    const items: { order_item_id: number; qty_requested: number; reason: CustomerReturnReason; reason_detail?: string }[] = []
    for (const { item, draft } of included) {
      const qty = Number(draft.quantity)
      if (!qty || qty <= 0 || !Number.isFinite(qty)) {
        setFormError(t('bodega:returns.newReturnPage.errors.invalidQuantity'))
        return
      }
      if (qty > item.qty_delivered) {
        setFormError(t('bodega:returns.newReturnPage.errors.quantityExceeded'))
        return
      }
      if (draft.reason === 'otra' && draft.reasonDetail.trim() === '') {
        setFormError(t('bodega:returns.newReturnPage.errors.missingReasonDetail'))
        return
      }
      items.push({
        order_item_id: item.order_item_id,
        qty_requested:  qty,
        reason:         draft.reason,
        ...(draft.reason === 'otra' ? { reason_detail: draft.reasonDetail.trim() } : {}),
      })
    }

    setFormError(null)
    try {
      const result = await createReturn.mutateAsync({
        order_id:      selectedOrder.order_id,
        contact_name:  contactName.trim(),
        contact_phone: contactPhone.trim(),
        items,
      })
      setCreated({ return_number: result.return_number })
    } catch (err) {
      // Hallazgo Pre-QA 2026-07-26 (RN2 acumulado, ver CustomerReturnService::create()) — a
      // diferencia de las excepciones de negocio simples (confirmReception/reject, ver
      // ConfirmReturnReceptionModal.tsx), `create()` lanza `CustomerReturnException` con el
      // mensaje específico dentro de `errors` (shape de `ValidationException`), no en el
      // `message` de nivel superior — que acá siempre trae el genérico "No se pudo crear la
      // devolución.". Leer `response.data.message` directo (primer intento de este mismo Pre-QA)
      // seguía mostrando el genérico; confirmado con curl directo al endpoint antes de este fix.
      const backendMessage = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err)
        ? Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? err.response?.data?.message
        : undefined
      setFormError(backendMessage ?? t('bodega:returns.newReturnPage.errors.createFailed'))
    }
  }

  if (created) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <Card variant="panel" className="p-6">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
            {t('bodega:returns.newReturnPage.success.title', { number: created.return_number })}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            {t('bodega:returns.newReturnPage.success.status')}: <b>{t('bodega:returns.newReturnPage.success.pendingLabel')}</b>
          </p>
          <p className="text-xs text-slate-400 mb-6">{t('bodega:returns.newReturnPage.success.note')}</p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => navigate('/bodega/devoluciones')}>
              {t('bodega:returns.newReturnPage.success.goToTray')}
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-4">
            {t('bodega:returns.newReturnPage.success.another')}{' '}
            <button className="text-primary font-semibold underline" onClick={startOver}>
              {t('bodega:returns.newReturnPage.success.createNew')}
            </button>
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('bodega:returns.newReturnPage.title')}</h1>
        <p className="text-[12px] text-slate-500">{t('bodega:returns.newReturnPage.subtitle')}</p>
      </div>

      <Card variant="panel" className="p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
          {t('bodega:returns.newReturnPage.search.title')}
        </h2>
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); if (selectedOrder) setSelectedOrder(null) }}
          placeholder={t('bodega:returns.newReturnPage.search.placeholder')}
          className="w-full mb-3 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />

        {!selectedOrder && search.trim() !== '' && (
          <div>
            {isFetching && <p className="text-slate-400 text-xs py-2">{t('common:labels.loading')}</p>}
            {!isFetching && (searchResults?.data.length ?? 0) === 0 && (
              <p className="text-slate-400 text-xs py-2">{t('bodega:returns.newReturnPage.search.empty')}</p>
            )}
            <div className="space-y-2">
              {(searchResults?.data ?? []).map(order => (
                <button
                  key={order.order_id}
                  type="button"
                  onClick={() => selectOrder(order)}
                  className="w-full text-left px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                    {t('bodega:returns.table.order')} #{order.order_number} — {order.customer_name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {t('bodega:returns.newReturnPage.search.resultMeta', { project: order.project ?? '—', count: order.items.length })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedOrder && (
          <button type="button" className="text-primary text-xs underline" onClick={startOver}>
            {t('bodega:returns.newReturnPage.search.change')}
          </button>
        )}
      </Card>

      {selectedOrder && (
        <Card variant="panel" className="p-5 mb-8">
          <div className="mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {t('bodega:returns.newReturnPage.details.title')}
            </h2>
            <p className="text-[11px] text-slate-400">
              {t('bodega:returns.newReturnPage.details.subtitle', { orderNumber: selectedOrder.order_number, client: selectedOrder.customer_name })}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <ReadOnlyField label={t('bodega:returns.newReturnPage.details.client')} value={selectedOrder.customer_name} />
            <ReadOnlyField label={t('bodega:returns.newReturnPage.details.project')} value={selectedOrder.project ?? '—'} />
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {t('bodega:returns.newReturnPage.details.contactName')}
              </label>
              <input
                type="text"
                value={contactName}
                onChange={e => { setContactName(e.target.value); setFormError(null) }}
                placeholder={t('bodega:returns.newReturnPage.details.contactNamePlaceholder')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                {t('bodega:returns.newReturnPage.details.contactPhone')}
              </label>
              <input
                type="text"
                value={contactPhone}
                onChange={e => { setContactPhone(e.target.value); setFormError(null) }}
                placeholder={t('bodega:returns.newReturnPage.details.contactPhonePlaceholder')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-500 mb-2">{t('bodega:returns.newReturnPage.productsTitle')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <Th />
                  <Th>{t('bodega:returns.newReturnPage.table.product')}</Th>
                  <Th>{t('bodega:returns.newReturnPage.table.publicRef')}</Th>
                  <Th>{t('bodega:returns.newReturnPage.table.factoryRef')}</Th>
                  <Th>{t('bodega:returns.newReturnPage.table.delivered')}</Th>
                  <Th>{t('bodega:returns.newReturnPage.table.quantity')}</Th>
                  <Th>{t('bodega:returns.newReturnPage.table.reason')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {selectedOrder.items.map(item => (
                  <ProductLineRow
                    key={item.order_item_id}
                    item={item}
                    draft={lines[item.order_item_id]}
                    onChange={patch => updateLine(item.order_item_id, patch)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {formError && (
            <div className="mt-4 px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg text-red-600 dark:text-red-400 text-xs">
              {formError}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button onClick={handleSubmit} loading={createReturn.isPending}>
              {t('bodega:returns.newReturnPage.save')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function ProductLineRow({ item, draft, onChange }: {
  item:     ReturnSearchOrderItem
  draft:    LineDraft | undefined
  onChange: (patch: Partial<LineDraft>) => void
}) {
  const { t } = useTranslation('bodega')
  if (!draft) return null

  return (
    <tr>
      <td className="py-2">
        <input
          type="checkbox"
          checked={draft.included}
          onChange={e => onChange({ included: e.target.checked, quantity: String(item.qty_delivered) })}
        />
      </td>
      <td className="py-2 font-medium text-slate-800 dark:text-slate-100">{item.description ?? '—'}</td>
      <td className="py-2 text-slate-600 dark:text-slate-300">{item.reference ?? '—'}</td>
      <td className="py-2 text-slate-600 dark:text-slate-300">{item.factory_reference ?? '—'}</td>
      <td className="py-2 text-slate-600 dark:text-slate-300">{item.qty_delivered}</td>
      <td className="py-2">
        <input
          type="number"
          min={1}
          max={item.qty_delivered}
          value={draft.quantity}
          disabled={!draft.included}
          onChange={e => onChange({ quantity: e.target.value })}
          className="w-16 px-2 py-1 border border-slate-200 dark:border-slate-600 rounded text-sm disabled:bg-slate-50 dark:disabled:bg-slate-900 bg-white dark:bg-slate-800"
        />
      </td>
      <td className="py-2">
        <select
          value={draft.reason}
          disabled={!draft.included}
          onChange={e => onChange({ reason: e.target.value as CustomerReturnReason })}
          className="px-2 py-1 border border-slate-200 dark:border-slate-600 rounded text-sm disabled:bg-slate-50 dark:disabled:bg-slate-900 bg-white dark:bg-slate-800"
        >
          {REASONS.map(r => <option key={r} value={r}>{t(`returns.reasons.${r}`)}</option>)}
        </select>
        {draft.included && draft.reason === 'otra' && (
          <input
            type="text"
            value={draft.reasonDetail}
            onChange={e => onChange({ reasonDetail: e.target.value })}
            placeholder={t('returns.newReturnPage.reasonDetailPlaceholder')}
            className="mt-1 w-full px-2 py-1 border border-slate-200 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-800"
          />
        )}
      </td>
    </tr>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">{label}</label>
      <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {value}
      </div>
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
