import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  usePurchaseOrderPayments, useRegisterPayment, useRequestPayment,
  useRequestAmountChange, useApproveAmountChange, useRejectAmountChange, useComprasSettings,
} from '@/hooks/useCompras'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatMoney } from '@/lib/money'
import type { PurchaseOrderDetail } from '@/types/compras'

function paymentErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

interface Props {
  order: PurchaseOrderDetail
}

/** SCRUM-250→253 (REQ-187→190) — Pagos a Proveedores, dentro del detalle de la orden. */
export default function PurchaseOrderPaymentsPanel({ order }: Props) {
  const { t } = useTranslation(['common', 'compras'])

  const { data: paymentsData } = usePurchaseOrderPayments(order.id)
  const registerPayment = useRegisterPayment(order.id)
  const requestPayment = useRequestPayment(order.id)
  const requestAmountChange = useRequestAmountChange(order.id)
  const approveAmountChange = useApproveAmountChange(order.id)
  const rejectAmountChange = useRejectAmountChange(order.id)
  const { data: settings } = useComprasSettings()
  const currentUserId = useAuthStore(s => s.user?.id)

  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [proof, setProof] = useState<File | null>(null)

  const [showAmountChangeForm, setShowAmountChangeForm] = useState(false)
  const [newAmount, setNewAmount] = useState('')

  const payments = paymentsData?.data ?? []
  const balance = order.total_amount - order.paid_amount
  const canRequestAmountChange = payments.length === 0 && order.pending_amount_change === null
  // SCRUM-252 (hallazgo de Daniela Amaya) — gate REAL, no solo informativo: mientras haya un
  // cambio de monto pendiente de aprobación, "Enviar a pago" y "Registrar pago" quedan
  // bloqueados (el backend ya lo rechaza con 422; acá se deshabilitan antes de intentarlo).
  const hasPendingAmountChange = order.pending_amount_change !== null
  // SCRUM-252 — "Aprobar/Rechazar cambio" solo para Mark. Si no hay mark_approver_user_id
  // configurado todavía, el backend tampoco lo exige (mismo criterio que approveAmountChange()
  // del lado del servidor) — se deja visible para no bloquear un entorno sin ese ajuste hecho.
  // Mientras no se sepa con certeza quién es Mark (settings todavía cargando), el botón
  // sensible queda OCULTO por defecto en vez de mostrarse de más un instante — más seguro que
  // arriesgar un falso "sí sos Mark" mientras la respuesta no llegó.
  const isMark = settings !== undefined
    && (settings.mark_approver_user_id == null || settings.mark_approver_user_id === currentUserId)

  // SCRUM-252 — validación en vivo mientras se escribe el monto a registrar.
  const liveAmount = Number(amount || 0)
  const livePreview = amount === '' ? null : liveAmount > balance
    ? { kind: 'exceeds' as const }
    : liveAmount >= balance
      ? { kind: 'complete' as const }
      : { kind: 'partial' as const, remaining: balance - liveAmount }

  const handleRegister = () => {
    if (amount === '' || proof === null) return
    registerPayment.mutate({ amount: Number(amount), proof }, {
      onSuccess: () => { setShowRegisterForm(false); setAmount(''); setProof(null) },
    })
  }

  const handleRequestAmountChange = () => {
    if (newAmount === '') return
    requestAmountChange.mutate(Number(newAmount), {
      onSuccess: () => { setShowAmountChangeForm(false); setNewAmount('') },
    })
  }

  return (
    <Card variant="panel" className="p-5 mb-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
        {t('compras:orders.detail.payments.title')}
      </h2>

      <div className="grid grid-cols-3 gap-3 text-sm mb-3">
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase">{t('compras:orders.detail.payments.status')}</span>
          <p className="text-slate-800 font-medium">{t(`compras:orders.detail.payments.statusValue.${order.payment_status}`)}</p>
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase">{t('compras:orders.detail.payments.paid')}</span>
          <p className="text-slate-800 font-medium">${order.paid_amount.toFixed(2)}</p>
        </div>
        <div>
          <span className="text-xs font-semibold text-slate-500 uppercase">{t('compras:orders.detail.payments.balance')}</span>
          <p className="text-slate-800 font-medium">${balance.toFixed(2)}</p>
        </div>
      </div>

      {hasPendingAmountChange && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs mb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span>{t('compras:orders.detail.payments.pendingAmountChange', { amount: order.pending_amount_change?.toFixed(2) })}</span>
            {/* SCRUM-252 (hallazgo de Daniela Amaya) — "Aprobar/Rechazar cambio" SOLO para Mark;
                Yirena (quien pidió el cambio) nunca debe poder aprobar su propio pedido. */}
            {isMark && (
              <div className="flex gap-2">
                <Button
                  variant="outline" className="!text-xs !px-2 !py-1"
                  loading={approveAmountChange.isPending}
                  onClick={() => approveAmountChange.mutate()}
                >
                  {t('compras:orders.detail.payments.approveAmountChange')}
                </Button>
                <Button
                  variant="outline" className="!text-xs !px-2 !py-1"
                  loading={rejectAmountChange.isPending}
                  onClick={() => rejectAmountChange.mutate()}
                >
                  {t('compras:orders.detail.payments.rejectAmountChange')}
                </Button>
              </div>
            )}
          </div>
          <p className="mt-1.5">{t('compras:orders.detail.payments.pendingAmountChangeBlocksActions')}</p>
        </div>
      )}
      {approveAmountChange.isError && (
        <p className="text-xs text-red-600 mb-3">
          {paymentErrorMessage(approveAmountChange.error, t('compras:orders.detail.payments.approveAmountChangeError'))}
        </p>
      )}
      {rejectAmountChange.isError && (
        <p className="text-xs text-red-600 mb-3">
          {paymentErrorMessage(rejectAmountChange.error, t('compras:orders.detail.payments.rejectAmountChangeError'))}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        {order.payment_requested_at === null && (
          <Button
            variant="outline" loading={requestPayment.isPending} disabled={hasPendingAmountChange}
            onClick={() => requestPayment.mutate()}
          >
            {t('compras:orders.detail.payments.requestPayment')}
          </Button>
        )}
        {balance > 0 && (
          <Button variant="outline" disabled={hasPendingAmountChange} onClick={() => setShowRegisterForm(v => !v)}>
            {t('compras:orders.detail.payments.registerPayment')}
          </Button>
        )}
        {canRequestAmountChange && (
          <Button variant="outline" onClick={() => setShowAmountChangeForm(v => !v)}>
            {t('compras:orders.detail.payments.requestAmountChange')}
          </Button>
        )}
      </div>

      {showRegisterForm && (
        <div className="p-3 bg-slate-50 rounded-lg mb-3 flex flex-wrap gap-2 items-center">
          <input
            type="number" step="0.01" placeholder={t('compras:orders.detail.payments.amount') ?? ''}
            value={amount} onChange={e => setAmount(e.target.value)}
            className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <input
            type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
            onChange={e => setProof(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <Button variant="secondary" onClick={() => { setShowRegisterForm(false); setAmount(''); setProof(null) }}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            loading={registerPayment.isPending}
            disabled={amount === '' || proof === null || livePreview?.kind === 'exceeds'}
            onClick={handleRegister}
          >
            {t('common:actions.save')}
          </Button>
          {/* SCRUM-252 (hallazgo de Daniela Amaya) — resultado del pago EN VIVO mientras se
              escribe el monto, sin esperar a guardar. */}
          {livePreview && (
            <p className={`w-full text-xs ${livePreview.kind === 'exceeds' ? 'text-red-500' : 'text-slate-600'}`}>
              {livePreview.kind === 'exceeds' && t('compras:orders.detail.payments.livePreview.exceedsBalance', { balance: formatMoney(balance) })}
              {livePreview.kind === 'complete' && t('compras:orders.detail.payments.livePreview.complete')}
              {livePreview.kind === 'partial' && t('compras:orders.detail.payments.livePreview.partial', {
                amount: formatMoney(liveAmount), remaining: formatMoney(livePreview.remaining),
              })}
            </p>
          )}
          {registerPayment.isError && (
            <p className="w-full text-xs text-red-500">
              {paymentErrorMessage(registerPayment.error, t('compras:orders.detail.payments.registerError'))}
            </p>
          )}
        </div>
      )}

      {showAmountChangeForm && (
        <div className="p-3 bg-slate-50 rounded-lg mb-3 flex flex-wrap gap-2 items-center">
          <input
            type="number" step="0.01" placeholder={t('compras:orders.detail.payments.newAmount') ?? ''}
            value={newAmount} onChange={e => setNewAmount(e.target.value)}
            className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <Button variant="secondary" onClick={() => { setShowAmountChangeForm(false); setNewAmount('') }}>
            {t('common:actions.cancel')}
          </Button>
          <Button loading={requestAmountChange.isPending} disabled={newAmount === ''} onClick={handleRequestAmountChange}>
            {t('common:actions.save')}
          </Button>
          {requestAmountChange.isError && (
            <p className="w-full text-xs text-red-500">
              {paymentErrorMessage(requestAmountChange.error, t('compras:orders.detail.payments.requestAmountChangeError'))}
            </p>
          )}
        </div>
      )}

      <p className="text-xs font-semibold text-slate-500 uppercase mt-4 mb-2">
        {t('compras:orders.detail.payments.history')}
      </p>
      {payments.length === 0 ? (
        <p className="text-sm text-slate-400">{t('compras:orders.detail.payments.historyEmpty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {payments.map(p => (
            <li key={p.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5 text-sm">
              <span>
                <span className="font-semibold">${p.amount.toFixed(2)}</span>{' '}
                <span className="text-slate-400">· {p.registered_by_name ?? '—'} · {new Date(p.created_at).toLocaleDateString()}</span>
              </span>
              <a href={p.proof_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs font-semibold">
                {t('compras:orders.detail.payments.viewProof')}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
