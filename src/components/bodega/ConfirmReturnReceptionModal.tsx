import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import {
  useCustomerReturnDetail, useConfirmReturnReception, useRejectCustomerReturn, useWarehousesList,
} from '@/hooks/useBodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { ReasonLabel } from './CustomerReturnDetailModal'

interface Props {
  id: number
  onClose: () => void
}

/**
 * SCRUM-479/480 (REQ-411) — modal "Confirmar recepción física". SCRUM-481 (REQ-411 RN2) — el botón
 * "Rechazar devolución" pide doble clic: el primero solo revela el campo de motivo (sin enviar
 * nada), el segundo (con motivo ya escrito) confirma el rechazo — mismo espíritu que el patrón de
 * "primer clic arma la confirmación" de `NewProjectModal.tsx`, pero con un campo de texto en vez de
 * un banner. El rechazo es exclusivo de Bodega (`bodega.write`), sin el gate de aprobación de Mark
 * que sí tienen Reubicación/Conteos generales.
 */
export default function ConfirmReturnReceptionModal({ id, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data, isLoading } = useCustomerReturnDetail(id)
  const { data: warehousesData } = useWarehousesList()
  const confirmReception = useConfirmReturnReception()
  const reject = useRejectCustomerReturn()

  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [warehouseId, setWarehouseId] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)

  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setQuantities(Object.fromEntries(data.products.map(p => [p.id, String(p.qty_requested)])))
  }, [data])

  useEffect(() => {
    const warehouses = warehousesData?.data ?? []
    if (warehouseId === '' && warehouses.length > 0) setWarehouseId(warehouses[0].id)
  }, [warehousesData, warehouseId])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function handleConfirm() {
    if (!data) return
    if (warehouseId === '') { setError(t('bodega:returns.receptionModal.errors.warehouseRequired')); return }

    const lines: { customer_return_line_id: number; qty_received: number }[] = []
    for (const p of data.products) {
      const raw = quantities[p.id]
      const qty = Number(raw)
      if (raw === undefined || raw.trim() === '' || Number.isNaN(qty) || qty < 0) {
        setError(t('bodega:returns.receptionModal.errors.invalidQuantity'))
        return
      }
      lines.push({ customer_return_line_id: p.id, qty_received: qty })
    }

    setError(null)
    confirmReception.mutate({ id, payload: { destination_warehouse_id: warehouseId, lines } }, {
      onSuccess: onClose,
      // Pre-QA 2026-07-26 — dos usuarios de Bodega pueden abrir el mismo modal a la vez; el
      // backend ya distingue la carrera con un mensaje específico ("Esta devolución ya fue
      // resuelta.", ver `CustomerReturnService::confirmReception()`) — mismo patrón que
      // `BodegaInventarioPage.tsx` (fix Pre-QA 2026-07-23) para no taparlo con el genérico.
      onError: (err) => {
        const backendMessage = isAxiosError<{ message?: string }>(err) ? err.response?.data?.message : undefined
        setError(backendMessage ?? t('bodega:returns.receptionModal.errors.confirmFailed'))
      },
    })
  }

  function handleRejectClick() {
    // Primer clic — solo revela el campo de motivo, no envía nada (REQ-411 RN2).
    if (!rejecting) {
      setRejecting(true)
      return
    }
    // Segundo clic — recién acá se valida y se confirma el rechazo.
    if (rejectReason.trim() === '') {
      setRejectError(t('bodega:returns.receptionModal.errors.rejectReasonRequired'))
      return
    }
    reject.mutate({ id, rejection_reason: rejectReason }, {
      onSuccess: onClose,
      onError: (err) => {
        const backendMessage = isAxiosError<{ message?: string }>(err) ? err.response?.data?.message : undefined
        setRejectError(backendMessage ?? t('bodega:returns.receptionModal.errors.rejectFailed'))
      },
    })
  }

  const warehouses = warehousesData?.data ?? []

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:returns.receptionModal.title')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common:actions.close')}>
            <IcoClose />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">{t('bodega:returns.receptionModal.subtitle')}</p>

        {isLoading || !data ? (
          <p className="text-slate-400 text-sm py-6 text-center">{t('common:labels.loading')}</p>
        ) : (
          <>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <Th>{t('bodega:returns.receptionModal.table.product')}</Th>
                    <Th>{t('bodega:returns.receptionModal.table.requestedQuantity')}</Th>
                    <Th>{t('bodega:returns.receptionModal.table.receivedQuantity')}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {data.products.map(p => (
                    <tr key={p.id}>
                      <td className="py-2 font-medium text-slate-800 dark:text-slate-100">
                        {p.description ?? p.reference ?? '—'}
                        <div className="text-[11px] font-normal text-slate-400">
                          <ReasonLabel reason={p.reason} detail={p.reason_detail} />
                        </div>
                      </td>
                      <td className="py-2 text-slate-600 dark:text-slate-300">{p.qty_requested}</td>
                      <td className="py-2">
                        <input
                          type="number"
                          min={0}
                          value={quantities[p.id] ?? ''}
                          onChange={e => { setQuantities(q => ({ ...q, [p.id]: e.target.value })); setError(null) }}
                          className="w-20 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-800"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mb-4 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
              <label className="block text-xs font-bold text-primary-dark mb-1.5">
                {t('bodega:returns.receptionModal.warehouseLabel')}
              </label>
              <select
                value={warehouseId}
                onChange={e => setWarehouseId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800"
              >
                {warehouses.length === 0 && <option value="">{t('bodega:returns.receptionModal.warehousePlaceholder')}</option>}
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            {rejecting && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  {t('bodega:returns.receptionModal.rejectReasonLabel')}
                </label>
                <textarea
                  value={rejectReason}
                  onChange={e => { setRejectReason(e.target.value); setRejectError(null) }}
                  placeholder={t('bodega:returns.receptionModal.rejectReasonPlaceholder')}
                  rows={2}
                  className="w-full px-3 py-2 border border-red-200 dark:border-red-900/50 rounded-lg text-sm bg-white dark:bg-slate-800"
                />
                {rejectError && <p className="text-red-600 text-xs mt-1">{rejectError}</p>}
              </div>
            )}

            {error && <p className="text-red-600 text-xs mb-3">{error}</p>}

            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1" onClick={handleConfirm} loading={confirmReception.isPending}>
                {t('bodega:returns.receptionModal.save')}
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleRejectClick}
                loading={reject.isPending}
              >
                {rejecting ? t('bodega:returns.receptionModal.confirmReject') : t('bodega:returns.receptionModal.reject')}
              </Button>
            </div>
            <div className="flex justify-end mt-3">
              <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  )
}
