import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { usePermission } from '@/hooks/usePermission'
import type { ContactRole, SubClientCategory, PriceType, SubClientDetail, ClientDetail, ReceptorTipo } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import TaxIdValidator from '@/components/TaxIdValidator'
import ReceptorTipoSelect from '@/components/ReceptorTipoSelect'

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

// SCRUM-928 — DV del RUC: solo dígitos, 1 o 2 caracteres.
const DV_PATTERN = /^\d{1,2}$/

function contactsValid(contacts: ContactDraft[]): boolean {
  return contacts.length > 0 && contacts.every(c => c.name.trim() !== '' && (c.phone.trim() !== '' || c.email.trim() !== ''))
}

type Props =
  | { mode: 'client'; initialText?: string; fromQuoteContext?: boolean; onClose: () => void; onCreated: (client: ClientDetail) => void }
  | { mode: 'sub-client'; masterClientId: number; masterClientName: string; initialText?: string; fromQuoteContext?: boolean; onClose: () => void; onCreated: (subClient: SubClientDetail) => void }

export default function CreateClientModal(props: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()
  const canSelectPartnerPrice = usePermission('ventas_diseno.select_partner_price')
  // Decisión de Luis (2026-09-30): marcar un Consumidor Final es solo de Gerencia y Contabilidad.
  const canMarkConsumidorFinal = usePermission('ventas_diseno.edit.client_tax_data')

  // SCRUM-734 (RN7.1) — el texto que el usuario ya tipeó en el buscador precarga
  // el campo principal (Cliente Master en modo 'client', Razón social en modo
  // 'sub-client') — nunca arranca vacío si venía de un "+ Crear nuevo" con texto.
  const [name, setName]                     = useState(props.mode === 'client' ? props.initialText ?? '' : '')
  const [businessName, setBusinessName]     = useState(props.mode === 'sub-client' ? props.initialText ?? '' : '')
  const [receptorTipo, setReceptorTipo]     = useState<ReceptorTipo>('01')
  const [taxId, setTaxId]                   = useState('')
  const [taxIdDv, setTaxIdDv]               = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [category, setCategory]             = useState<SubClientCategory | ''>('')
  const [priceType, setPriceType]           = useState<PriceType | ''>('')
  const [contacts, setContacts]             = useState<ContactDraft[]>([emptyContact()])
  const [error, setError]                   = useState<string | null>(null)

  // SCRUM-1003 — Consumidor Final no manda RUC ni DV.
  const fiscalPayload = () => receptorTipo === '02'
    ? { receptor_tipo: receptorTipo }
    : { receptor_tipo: receptorTipo, tax_id: taxId, tax_id_dv: taxIdDv.trim() }

  const contactsPayload = () => contacts.map(c => ({
    name: c.name, role: c.role, phone: c.phone || null, email: c.email || null,
  }))

  const createClientMutation = useMutation({
    mutationFn: () => ventasDisenoApi.clients.create({
      name,
      default_price_type: priceType || null,
      business_name: businessName,
      ...fiscalPayload(),
      delivery_address: deliveryAddress || null,
      category: category || null,
      contacts: contactsPayload(),
      from_quote_context: props.fromQuoteContext,
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
      ...fiscalPayload(),
      delivery_address: deliveryAddress || null,
      category: category || null,
      contacts: contactsPayload(),
      from_quote_context: props.fromQuoteContext,
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

  const taxDataValid = receptorTipo === '02' || (taxId.trim() !== '' && (taxIdDv.trim() === '' || DV_PATTERN.test(taxIdDv.trim())))
  const formValid = businessName.trim() !== '' && taxDataValid && contactsValid(contacts)
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
            {/* SCRUM-1003 — selector explícito; con Consumidor Final se ocultan RUC, DV y validación. */}
            <ReceptorTipoSelect id="create-receptor-tipo" value={receptorTipo} onChange={setReceptorTipo} permitirConsumidorFinal={canMarkConsumidorFinal} />
            {/* SCRUM-928 — el DV va inmediatamente después del RUC, en la misma celda. */}
            {receptorTipo === '01' && <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:clients.createModal.taxId')} *
                </label>
                <input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} className={inputClass} />
              </div>
              <div className="w-20 shrink-0">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:clients.createModal.taxIdDv')}
                </label>
                {/* Sin `maxLength`: el navegador cortaba el pegado (p. ej. " 81" con un espacio) a 2
                    caracteres ANTES de que el onChange limpie los no dígitos, y quedaba "8". El
                    `slice(0, 2)` de abajo ya limita a 2 dígitos. */}
                <input
                  type="text" inputMode="numeric"
                  value={taxIdDv}
                  onChange={e => setTaxIdDv(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className={inputClass}
                />
              </div>
            </div>}
            {/* SCRUM-1002 — valida contra la DGI sin bloquear el guardado; propone (nunca pisa) el DV y la razón social oficiales. */}
            {receptorTipo === '01' && <div className="sm:col-span-2">
              <TaxIdValidator
                taxId={taxId} taxIdDv={taxIdDv} businessName={businessName}
                onApply={({ dv, nombre }) => {
                  if (dv !== null) setTaxIdDv(dv)
                  if (nombre !== null) setBusinessName(nombre)
                }}
              />
            </div>}
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
