import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { usePermission } from '@/hooks/usePermission'
import type { ContactRole, SubClientCategory, PriceType, SubClientDetail, ClientDetail } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

const CATEGORIES: SubClientCategory[] = ['a_walkin', 'b_architect_designer', 'c_bidding', 'd_referred']
const PRICE_TYPES: PriceType[] = ['public', 'project', 'special', 'partner', 'premium']

interface ContactDraft {
  name:  string
  role:  ContactRole
  phone: string
  email: string
}

function emptyContact(): ContactDraft {
  return { name: '', role: 'client', phone: '', email: '' }
}

function contactsValid(contacts: ContactDraft[]): boolean {
  return contacts.length > 0 && contacts.every(c => c.name.trim() !== '' && (c.phone.trim() !== '' || c.email.trim() !== ''))
}

type Props =
  | { mode: 'client'; initialText?: string; onClose: () => void; onCreated: (client: ClientDetail) => void }
  | { mode: 'sub-client'; masterClientId: number; masterClientName: string; initialText?: string; onClose: () => void; onCreated: (subClient: SubClientDetail) => void }

export default function CreateClientModal(props: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()
  const canSelectPartnerPrice = usePermission('ventas_diseno.select_partner_price')

  // SCRUM-734 (RN7.1) — el texto que el usuario ya tipeó en el buscador precarga
  // el campo principal (Cliente Master en modo 'client', Razón social en modo
  // 'sub-client') — nunca arranca vacío si venía de un "+ Crear nuevo" con texto.
  const [name, setName]                     = useState(props.mode === 'client' ? props.initialText ?? '' : '')
  const [businessName, setBusinessName]     = useState(props.mode === 'sub-client' ? props.initialText ?? '' : '')
  const [taxId, setTaxId]                   = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [category, setCategory]             = useState<SubClientCategory | ''>('')
  const [priceType, setPriceType]           = useState<PriceType | ''>('')
  const [contacts, setContacts]             = useState<ContactDraft[]>([emptyContact()])
  const [error, setError]                   = useState<string | null>(null)

  const contactsPayload = () => contacts.map(c => ({
    name: c.name, role: c.role, phone: c.phone || null, email: c.email || null,
  }))

  const createClientMutation = useMutation({
    mutationFn: () => ventasDisenoApi.clients.create({
      name,
      default_price_type: priceType || null,
      business_name: businessName,
      tax_id: taxId,
      delivery_address: deliveryAddress || null,
      category: category || null,
      contacts: contactsPayload(),
    }),
    onSuccess: client => {
      qc.invalidateQueries({ queryKey: ['ventas-diseno-clients'] })
      if (props.mode === 'client') props.onCreated(client)
    },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setError(message ?? t('ventasDiseno:modal.createError'))
    },
  })

  const createSubClientMutation = useMutation({
    mutationFn: (masterClientId: number) => ventasDisenoApi.clients.addSubClient(masterClientId, {
      business_name: businessName,
      tax_id: taxId,
      delivery_address: deliveryAddress || null,
      category: category || null,
      contacts: contactsPayload(),
    }),
    onSuccess: subClient => {
      qc.invalidateQueries({ queryKey: ['ventas-diseno-clients'] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-client', props.mode === 'sub-client' ? props.masterClientId : undefined] })
      if (props.mode === 'sub-client') props.onCreated(subClient)
    },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setError(message ?? t('ventasDiseno:modal.createError'))
    },
  })

  const isSaving = createClientMutation.isPending || createSubClientMutation.isPending

  function handleSave() {
    setError(null)
    if (props.mode === 'client') {
      createClientMutation.mutate()
    } else {
      createSubClientMutation.mutate(props.masterClientId)
    }
  }

  const formValid = businessName.trim() !== '' && taxId.trim() !== '' && contactsValid(contacts)
    && (props.mode === 'sub-client' || name.trim() !== '')

  const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#5BA5A0] focus:outline-none'

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {props.mode === 'client'
              ? t('ventasDiseno:clients.createModal.titleClient')
              : t('ventasDiseno:clients.createModal.titleSubClient', { master: props.masterClientName })}
          </h2>
          <Button variant="icon" onClick={props.onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {props.mode === 'client' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:clients.createModal.masterClient')} *
                </label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
              </div>
            )}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {t('ventasDiseno:clients.createModal.businessName')} *
              </label>
              <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {t('ventasDiseno:clients.createModal.deliveryAddress')}
              </label>
              <input type="text" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {t('ventasDiseno:clients.createModal.taxId')} *
              </label>
              <input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {t('ventasDiseno:clients.createModal.category')}
              </label>
              <select value={category} onChange={e => setCategory(e.target.value as SubClientCategory | '')} className={inputClass}>
                <option value="">{t('ventasDiseno:category.none')}</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{t(`ventasDiseno:category.${c}`)}</option>
                ))}
              </select>
            </div>
          </div>

          {props.mode === 'client' && (
            <div className="mb-4">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {t('ventasDiseno:clients.createModal.priceType')}
              </label>
              <select value={priceType} onChange={e => setPriceType(e.target.value as PriceType | '')} className={inputClass}>
                <option value="">{t('ventasDiseno:priceType.none')}</option>
                {PRICE_TYPES.map(p => (
                  <option key={p} value={p} disabled={p === 'partner' && !canSelectPartnerPrice}>
                    {t(`ventasDiseno:priceType.${p}`)}{p === 'partner' && !canSelectPartnerPrice ? ` — ${t('ventasDiseno:priceType.partnerLocked')}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
            {t('ventasDiseno:clients.createModal.contacts')} *
          </label>
          <div className="flex flex-col gap-2 mb-2">
            {contacts.map((c, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center">
                <input
                  type="text" placeholder={t('ventasDiseno:modal.contactName')}
                  value={c.name}
                  onChange={e => setContacts(cs => cs.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm flex-1 min-w-[140px]"
                />
                <select
                  value={c.role}
                  onChange={e => setContacts(cs => cs.map((x, xi) => xi === i ? { ...x, role: e.target.value as ContactRole } : x))}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="client">{t('ventasDiseno:contactRole.client')}</option>
                  <option value="architect">{t('ventasDiseno:contactRole.architect')}</option>
                  <option value="other">{t('ventasDiseno:contactRole.other')}</option>
                </select>
                <input
                  type="text" placeholder={t('common:labels.phone')}
                  value={c.phone}
                  onChange={e => setContacts(cs => cs.map((x, xi) => xi === i ? { ...x, phone: e.target.value } : x))}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-32"
                />
                <input
                  type="email" placeholder={t('common:labels.email')}
                  value={c.email}
                  onChange={e => setContacts(cs => cs.map((x, xi) => xi === i ? { ...x, email: e.target.value } : x))}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-40"
                />
                {contacts.length > 1 && (
                  <Button variant="icon" onClick={() => setContacts(cs => cs.filter((_, xi) => xi !== i))}>
                    <IcoClose size={12} />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setContacts(cs => [...cs, emptyContact()])}
            className="text-[12px] font-semibold text-[#5BA5A0] mb-2"
          >
            {t('ventasDiseno:clients.createModal.addAnotherContact')}
          </button>
          <p className="text-[11px] text-slate-400 mb-3">{t('ventasDiseno:clients.createModal.requiredNote')}</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">{t('ventasDiseno:clients.createModal.leadRuleNote')}</p>

          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={props.onClose}>{t('common:actions.cancel')}</Button>
          <Button onClick={handleSave} disabled={!formValid || isSaving} loading={isSaving}>
            {props.mode === 'client'
              ? t('ventasDiseno:clients.createModal.saveClient')
              : t('ventasDiseno:clients.createModal.saveSubClient')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
