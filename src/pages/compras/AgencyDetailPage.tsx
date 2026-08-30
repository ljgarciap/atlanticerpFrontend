import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  useLiquidationAgency, useCreateLiquidationAgencyContact,
  useUpdateLiquidationAgencyContact, useRemoveLiquidationAgencyContact,
  useUpdateLiquidationAgencyPayment,
} from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { LiquidationAgencyContact, LiquidationAgencyDetail } from '@/types/compras'

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** SCRUM-254 (REQ-191) — carga manual de "situación de pago" (mock, ver AgenciesSummaryPage). */
function PaymentSection({ agency }: { agency: LiquidationAgencyDetail }) {
  const { t } = useTranslation(['common', 'compras'])
  const updatePayment = useUpdateLiquidationAgencyPayment(agency.id)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    pending_payment_amount: String(agency.pending_payment_amount),
    paid_amount:            String(agency.paid_amount),
    last_payment_date:      agency.last_payment_date ?? '',
    next_payment_date:      agency.next_payment_date ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setDraft({
      pending_payment_amount: String(agency.pending_payment_amount),
      paid_amount:            String(agency.paid_amount),
      last_payment_date:      agency.last_payment_date ?? '',
      next_payment_date:      agency.next_payment_date ?? '',
    })
    setError(null)
    setEditing(true)
  }

  function save() {
    updatePayment.mutate(
      {
        pending_payment_amount: Number(draft.pending_payment_amount) || 0,
        paid_amount:            Number(draft.paid_amount) || 0,
        last_payment_date:      draft.last_payment_date || null,
        next_payment_date:      draft.next_payment_date || null,
      },
      {
        onSuccess: () => setEditing(false),
        onError:   err => {
          const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
          setError(data?.message ?? t('compras:agencies.detail.paymentForm.error'))
        },
      }
    )
  }

  return (
    <Card variant="panel" className="p-5 mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase">
          {t('compras:agencies.detail.paymentTitle')}
        </p>
        {!editing && (
          <button onClick={startEdit} className="text-[12px] font-semibold text-primary hover:underline">
            {t('compras:agencies.detail.paymentEdit')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-[11px] text-slate-500">
            {t('compras:agencies.detail.paymentForm.toPay')}
            <input
              type="number" min="0" step="0.01"
              value={draft.pending_payment_amount}
              onChange={e => setDraft(d => ({ ...d, pending_payment_amount: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm w-28"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-500">
            {t('compras:agencies.detail.paymentForm.paid')}
            <input
              type="number" min="0" step="0.01"
              value={draft.paid_amount}
              onChange={e => setDraft(d => ({ ...d, paid_amount: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm w-28"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-500">
            {t('compras:agencies.detail.paymentForm.lastPaymentDate')}
            <input
              type="date"
              value={draft.last_payment_date}
              onChange={e => setDraft(d => ({ ...d, last_payment_date: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-500">
            {t('compras:agencies.detail.paymentForm.nextPaymentDate')}
            <input
              type="date"
              value={draft.next_payment_date}
              onChange={e => setDraft(d => ({ ...d, next_payment_date: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <Button variant="secondary" onClick={() => { setEditing(false); setError(null) }}>
            {t('compras:agencies.detail.paymentForm.cancel')}
          </Button>
          <Button onClick={save} loading={updatePayment.isPending}>
            {t('compras:agencies.detail.paymentForm.save')}
          </Button>
          {error && <p className="w-full text-xs text-red-500">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-[11px] text-slate-400">{t('compras:agencies.detail.paymentForm.toPay')}</p>
            <p className="font-semibold text-slate-800">{fmtMoney(agency.pending_payment_amount)}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">{t('compras:agencies.detail.paymentForm.paid')}</p>
            <p className="font-semibold text-slate-800">{fmtMoney(agency.paid_amount)}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">{t('compras:agencies.detail.paymentForm.lastPaymentDate')}</p>
            <p className="font-semibold text-slate-800">{agency.last_payment_date ?? t('compras:agencies.table.noDate')}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400">{t('compras:agencies.detail.paymentForm.nextPaymentDate')}</p>
            <p className="font-semibold text-slate-800">{agency.next_payment_date ?? t('compras:agencies.table.noDate')}</p>
          </div>
        </div>
      )}
    </Card>
  )
}

function contactErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

interface DeleteModalProps {
  contact:  LiquidationAgencyContact
  onConfirm: () => void
  onCancel:  () => void
  deleting:  boolean
  error:     string | null
}

/** REQ-192 RN2 — mismo patrón de confirmación que DirectoryPage (CRM), errores 422 en línea. */
function DeleteContactModal({ contact, onConfirm, onCancel, deleting, error }: DeleteModalProps) {
  const { t } = useTranslation(['common', 'compras'])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <Card variant="modal" className="w-full max-w-sm p-6">
        <h2 className="text-[15px] font-bold text-slate-800 mb-2">
          {t('compras:agencies.detail.deleteContact.title')}
        </h2>
        <p className="text-[13px] text-slate-600 mb-4">
          {t('compras:agencies.detail.deleteContact.confirm', { name: contact.name })}
        </p>
        {error && (
          <p className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('common:actions.cancel')}</Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting}>
            {t('common:actions.delete')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default function AgencyDetailPage() {
  const { t } = useTranslation(['common', 'compras'])
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const agencyId = id ? Number(id) : null

  const { data: agency, isLoading } = useLiquidationAgency(agencyId)
  const createContact = useCreateLiquidationAgencyContact(agencyId as number)
  const updateContact = useUpdateLiquidationAgencyContact(agencyId as number)
  const removeContact  = useRemoveLiquidationAgencyContact(agencyId as number)

  const [addingContact, setAddingContact] = useState(false)
  const [editingContactId, setEditingContactId] = useState<number | null>(null)
  const [draft, setDraft] = useState({ name: '', phone: '', email: '' })
  const [contactError, setContactError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LiquidationAgencyContact | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (isLoading || !agency) {
    return <div className="text-slate-400 text-sm">{t('common:status.loading')}</div>
  }

  const draftValid = draft.name.trim() !== ''

  function startEdit(c: LiquidationAgencyContact) {
    setEditingContactId(c.id)
    setDraft({ name: c.name, phone: c.phone ?? '', email: c.email ?? '' })
    setContactError(null)
  }

  function submitAdd() {
    createContact.mutate(
      { name: draft.name, phone: draft.phone || null, email: draft.email || null },
      {
        onSuccess: () => { setAddingContact(false); setDraft({ name: '', phone: '', email: '' }) },
        onError:   err => setContactError(contactErrorMessage(err, t('compras:agencies.detail.contactForm.name'))),
      }
    )
  }

  function submitEdit(contactId: number) {
    updateContact.mutate(
      { contactId, data: { name: draft.name, phone: draft.phone || null, email: draft.email || null } },
      {
        onSuccess: () => setEditingContactId(null),
        onError:   err => setContactError(contactErrorMessage(err, t('compras:agencies.detail.contactForm.name'))),
      }
    )
  }

  function confirmDelete() {
    if (!deleteTarget) return
    removeContact.mutate(deleteTarget.id, {
      onSuccess: () => { setDeleteTarget(null); setDeleteError(null) },
      onError:   err => setDeleteError(contactErrorMessage(err, t('compras:agencies.detail.deleteContact.lastContactError'))),
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/compras/agencias')}
        className="text-[12px] font-semibold text-primary hover:underline mb-3"
      >
        ← {t('compras:agencies.detail.back')}
      </button>

      <h1 className="text-lg font-bold text-slate-900 mb-4">{agency.name}</h1>

      <PaymentSection agency={agency} />

      <Card variant="panel" className="p-5 mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
          {t('compras:agencies.detail.contactsTitle')}
        </p>
        <ul className="flex flex-col gap-1.5 mb-2">
          {agency.contacts.map(c => (
            editingContactId === c.id ? (
              <li key={c.id} className="bg-slate-50 rounded-lg p-2 flex flex-wrap gap-2 items-center">
                <input
                  type="text" placeholder={t('compras:agencies.detail.contactForm.name') ?? ''}
                  value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm flex-1 min-w-[120px]"
                />
                <input
                  type="text" placeholder={t('compras:agencies.detail.contactForm.phone') ?? ''}
                  value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm w-28"
                />
                <input
                  type="email" placeholder={t('compras:agencies.detail.contactForm.email') ?? ''}
                  value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm w-36"
                />
                <Button variant="secondary" onClick={() => { setEditingContactId(null); setContactError(null) }}>
                  {t('compras:agencies.detail.contactForm.cancel')}
                </Button>
                <Button onClick={() => submitEdit(c.id)} disabled={!draftValid} loading={updateContact.isPending}>
                  {t('compras:agencies.detail.contactForm.save')}
                </Button>
                {contactError && <p className="w-full text-xs text-red-500">{contactError}</p>}
              </li>
            ) : (
              <li key={c.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5 text-sm">
                <span>
                  <span className="font-semibold">{c.name}</span>{' '}
                  {c.phone && <span className="text-slate-400">· {c.phone}</span>}
                  {c.email && <span className="text-slate-400"> · {c.email}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <button onClick={() => startEdit(c)} className="text-primary hover:underline text-xs font-semibold">
                    {t('common:actions.edit')}
                  </button>
                  <button
                    onClick={() => { setDeleteTarget(c); setDeleteError(null) }}
                    className="text-red-600 hover:underline text-xs font-semibold"
                  >
                    {t('common:actions.delete')}
                  </button>
                </span>
              </li>
            )
          ))}
        </ul>

        {addingContact ? (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex flex-wrap gap-2 items-center">
            <input
              type="text" placeholder={t('compras:agencies.detail.contactForm.name') ?? ''}
              value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm flex-1 min-w-[120px]"
            />
            <input
              type="text" placeholder={t('compras:agencies.detail.contactForm.phone') ?? ''}
              value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm w-28"
            />
            <input
              type="email" placeholder={t('compras:agencies.detail.contactForm.email') ?? ''}
              value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm w-36"
            />
            <Button variant="secondary" onClick={() => { setAddingContact(false); setContactError(null) }}>
              {t('compras:agencies.detail.contactForm.cancel')}
            </Button>
            <Button onClick={submitAdd} disabled={!draftValid} loading={createContact.isPending}>
              {t('compras:agencies.detail.contactForm.save')}
            </Button>
            {contactError && <p className="w-full text-xs text-red-500">{contactError}</p>}
          </div>
        ) : (
          <button
            onClick={() => { setAddingContact(true); setContactError(null); setDraft({ name: '', phone: '', email: '' }) }}
            className="text-[12px] font-semibold text-primary"
          >
            {t('compras:agencies.detail.addContact')}
          </button>
        )}
      </Card>

      <Card variant="panel" className="overflow-hidden">
        <p className="text-xs font-semibold text-slate-500 uppercase px-5 pt-4 pb-2">
          {t('compras:agencies.detail.ordersTitle')}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.id')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.provider')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.status')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:orders.table.total')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t('compras:agencies.detail.liquidationStatusHeader')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {agency.purchase_orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('compras:agencies.detail.ordersEmpty')}
                </td>
              </tr>
            )}
            {agency.purchase_orders.map(o => (
              <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">#{o.id}</td>
                <td className="px-4 py-3 text-slate-600">{o.provider_name}</td>
                <td className="px-4 py-3 text-slate-600">{t(`compras:orders.status.${o.status}`)}</td>
                <td className="px-4 py-3 text-slate-600">${o.total_amount.toFixed(2)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {t(`compras:agencies.detail.liquidationStatus.${o.liquidation_status}`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {deleteTarget && (
        <DeleteContactModal
          contact={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => { setDeleteTarget(null); setDeleteError(null) }}
          deleting={removeContact.isPending}
          error={deleteError}
        />
      )}
    </div>
  )
}
