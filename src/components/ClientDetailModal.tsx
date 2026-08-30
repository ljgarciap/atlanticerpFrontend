import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { ContactRole, SubClientCategory, SubClientDetail, SubClientContact } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import CreateClientModal from '@/components/CreateClientModal'
import ClientProjectsModal from '@/components/ClientProjectsModal'

const CATEGORIES: SubClientCategory[] = ['a_walkin', 'b_architect_designer', 'c_bidding', 'd_referred']

interface Props {
  clientId: number
  onClose:  () => void
}

function SubClientCard({ subClient }: { subClient: SubClientDetail }) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [addingContact, setAddingContact] = useState(false)
  const [editingContactId, setEditingContactId] = useState<number | null>(null)
  const [draft, setDraft] = useState({ name: '', role: 'client' as ContactRole, phone: '', email: '' })
  const [contactError, setContactError] = useState<string | null>(null)

  function contactErrorMessage(err: unknown): string {
    const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
    const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
    return firstFieldError ?? data?.message ?? t('ventasDiseno:modal.createError')
  }

  const updateCategoryMutation = useMutation({
    mutationFn: (category: SubClientCategory | null) => ventasDisenoApi.clients.updateSubClientCategory(subClient.id, category),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-diseno-client'] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-clients'] })
    },
  })

  const addContactMutation = useMutation({
    mutationFn: () => ventasDisenoApi.subClients.contacts.create(subClient.id, {
      name: draft.name, role: draft.role, phone: draft.phone || null, email: draft.email || null,
    }),
    onSuccess: () => {
      setContactError(null)
      setAddingContact(false)
      setDraft({ name: '', role: 'client', phone: '', email: '' })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-client'] })
    },
    // SCRUM-96 (hallazgo Marly): sin esto, un 422 del backend (ej. email con
    // formato inválido) se perdía en silencio -- el formulario no mostraba
    // nada y el contacto nunca quedaba creado.
    onError: (err: unknown) => setContactError(contactErrorMessage(err)),
  })

  const editContactMutation = useMutation({
    mutationFn: (contactId: number) => ventasDisenoApi.subClients.contacts.update(subClient.id, contactId, {
      name: draft.name, role: draft.role, phone: draft.phone || null, email: draft.email || null,
    }),
    onSuccess: () => {
      setContactError(null)
      setEditingContactId(null)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-client'] })
    },
    onError: (err: unknown) => setContactError(contactErrorMessage(err)),
  })

  function startEdit(c: SubClientContact) {
    setContactError(null)
    setAddingContact(false)
    setEditingContactId(c.id)
    setDraft({ name: c.name, role: c.role, phone: c.phone ?? '', email: c.email ?? '' })
  }

  const contactFormValid = draft.name.trim() !== '' && (draft.phone.trim() !== '' || draft.email.trim() !== '')

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 mb-3">
      <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
        <div>
          <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{subClient.business_name}</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            {t('ventasDiseno:clients.detail.taxId')}: {subClient.tax_id}
            {subClient.delivery_address && <> · {subClient.delivery_address}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={subClient.category ?? ''}
            onChange={e => updateCategoryMutation.mutate((e.target.value || null) as SubClientCategory | null)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="">{t('ventasDiseno:category.none')}</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{t(`ventasDiseno:category.${c}`)}</option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={() => navigate(`/ventas-diseno/quotes?fromSubClient=${subClient.id}`)}
          >
            {t('ventasDiseno:clients.detail.newQuote')}
          </Button>
        </div>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
        {t('ventasDiseno:clients.detail.contacts')}
      </p>
      <ul className="flex flex-col gap-1.5 mb-2">
        {subClient.contacts.map(c => (
          editingContactId === c.id ? (
            <li key={c.id} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2 flex flex-wrap gap-2 items-center">
              <input
                type="text" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm flex-1 min-w-[120px]"
              />
              <select
                value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value as ContactRole }))}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="client">{t('ventasDiseno:contactRole.client')}</option>
                <option value="architect">{t('ventasDiseno:contactRole.architect')}</option>
                <option value="other">{t('ventasDiseno:contactRole.other')}</option>
              </select>
              <input
                type="text" placeholder={t('common:labels.phone')} value={draft.phone}
                onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm w-28"
              />
              <input
                type="email" placeholder={t('common:labels.email')} value={draft.email}
                onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm w-36"
              />
              <Button variant="secondary" onClick={() => { setEditingContactId(null); setContactError(null) }}>{t('common:actions.cancel')}</Button>
              <Button
                onClick={() => editContactMutation.mutate(c.id)}
                disabled={!contactFormValid || editContactMutation.isPending}
                loading={editContactMutation.isPending}
              >
                {t('common:actions.save')}
              </Button>
              {contactError && <p className="w-full text-xs text-red-500">{contactError}</p>}
            </li>
          ) : (
            <li key={c.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-1.5 text-sm">
              <span>
                <span className="font-semibold">{c.name}</span>{' '}
                <span className="text-slate-400">({t(`ventasDiseno:contactRole.${c.role}`)})</span>{' '}
                {c.phone && <span className="text-slate-400">· {c.phone}</span>}
                {c.email && <span className="text-slate-400"> · {c.email}</span>}
              </span>
              <button onClick={() => startEdit(c)} className="text-[#5BA5A0] hover:text-[#3D7E7A] text-xs font-semibold">
                {t('ventasDiseno:clients.detail.editContact')}
              </button>
            </li>
          )
        ))}
        {subClient.contacts.length === 0 && !addingContact && (
          <li className="text-sm text-slate-400">{t('ventasDiseno:modal.noContacts')}</li>
        )}
      </ul>

      {addingContact ? (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 flex flex-wrap gap-2 items-center">
          <input
            type="text" placeholder={t('ventasDiseno:modal.contactName')} value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm flex-1 min-w-[120px]"
          />
          <select
            value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value as ContactRole }))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="client">{t('ventasDiseno:contactRole.client')}</option>
            <option value="architect">{t('ventasDiseno:contactRole.architect')}</option>
            <option value="other">{t('ventasDiseno:contactRole.other')}</option>
          </select>
          <input
            type="text" placeholder={t('common:labels.phone')} value={draft.phone}
            onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm w-28"
          />
          <input
            type="email" placeholder={t('common:labels.email')} value={draft.email}
            onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm w-36"
          />
          <Button variant="secondary" onClick={() => { setAddingContact(false); setContactError(null) }}>{t('common:actions.cancel')}</Button>
          <Button
            onClick={() => addContactMutation.mutate()}
            disabled={!contactFormValid || addContactMutation.isPending}
            loading={addContactMutation.isPending}
          >
            {t('common:actions.add')}
          </Button>
          {contactError && <p className="w-full text-xs text-red-500">{contactError}</p>}
        </div>
      ) : (
        <button onClick={() => { setAddingContact(true); setContactError(null) }} className="text-[12px] font-semibold text-[#5BA5A0]">
          {t('ventasDiseno:clients.detail.addContact')}
        </button>
      )}
    </div>
  )
}

export default function ClientDetailModal({ clientId, onClose }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const [showNewSubClient, setShowNewSubClient] = useState(false)
  const [showProjects, setShowProjects] = useState(false)

  const { data: client, isLoading } = useQuery({
    queryKey: ['ventas-diseno-client', clientId],
    queryFn:  () => ventasDisenoApi.clients.get(clientId),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {client?.name ?? t('common:labels.loading')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !client ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : (
            <>
              <div className="mb-4 px-3 py-2 rounded-lg bg-[#E3F0EE] dark:bg-slate-900">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {t('ventasDiseno:clients.detail.priceType')}
                </p>
                <p className="text-sm font-semibold text-[#3D7E7A] dark:text-[#5BA5A0]">
                  {client.default_price_type ? t(`ventasDiseno:priceType.${client.default_price_type}`) : t('ventasDiseno:priceType.none')}
                </p>
              </div>

              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                {t('ventasDiseno:clients.detail.subClients')}
              </p>
              {client.sub_clients.map(sc => <SubClientCard key={sc.id} subClient={sc} />)}
            </>
          )}
        </div>

        <div className="flex justify-between items-center gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0 flex-wrap">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowProjects(true)}>
              {t('ventasDiseno:clients.detail.viewProjects')}
            </Button>
            <Button variant="secondary" onClick={() => setShowNewSubClient(true)}>
              {t('ventasDiseno:clients.detail.newSubClient')}
            </Button>
          </div>
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>

      {showNewSubClient && client && (
        <CreateClientModal
          mode="sub-client"
          masterClientId={client.id}
          masterClientName={client.name}
          onClose={() => setShowNewSubClient(false)}
          onCreated={() => setShowNewSubClient(false)}
        />
      )}

      {showProjects && client && (
        <ClientProjectsModal
          masterClientId={client.id}
          masterClientName={client.name}
          onClose={() => setShowProjects(false)}
        />
      )}
    </div>
  )
}
