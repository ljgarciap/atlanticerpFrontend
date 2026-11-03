import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useClientSegmentOptions } from '@/hooks/useClientSegments'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { usePermission } from '@/hooks/usePermission'
import type { ContactRole, SubClientCategory, PriceType, SubClientDetail, ClientDetail, ReceptorTipo } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import TaxIdValidator from '@/components/TaxIdValidator'
import { dvPattern, useFiscalId } from '@/hooks/useFiscalId'
import { fiscalIdText } from '@/lib/region'
import ReceptorTipoSelect from '@/components/ReceptorTipoSelect'

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

function contactsValid(contacts: ContactDraft[]): boolean {
  return contacts.length > 0 && contacts.every(c => c.name.trim() !== '' && (c.phone.trim() !== '' || c.email.trim() !== ''))
}

/** Cuerpo del 409 `duplicate_tax_id` de las altas de cliente/subcliente. */
interface DuplicateTaxId { sub_client_id: number; master_client_id: number; business_name: string }

type Props =
  | { mode: 'client'; initialText?: string; fromQuoteContext?: boolean; onClose: () => void; onCreated: (client: ClientDetail) => void }
  | { mode: 'sub-client'; masterClientId: number; masterClientName: string; initialText?: string; fromQuoteContext?: boolean; onClose: () => void; onCreated: (subClient: SubClientDetail) => void }

export default function CreateClientModal(props: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const segments = useClientSegmentOptions(t)
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
  const fiscalId = useFiscalId() // Fase 6c: RUC+DV en Panamá, NIT+DV en Colombia, EIN sin DV en EE. UU.
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [category, setCategory]             = useState<SubClientCategory | ''>('')
  const [priceType, setPriceType]           = useState<PriceType | ''>('')
  const [contacts, setContacts]             = useState<ContactDraft[]>([emptyContact()])
  const [error, setError]                   = useState<string | null>(null)
  // Fase 17a — la identificación fiscal ya pertenece a otro cliente (409 duplicate_tax_id): se ofrece usar el existente.
  const [duplicate, setDuplicate]             = useState<DuplicateTaxId | null>(null)

  // SCRUM-1003 — Consumidor Final no manda RUC ni DV.
  const fiscalPayload = () => receptorTipo === '02'
    ? { receptor_tipo: receptorTipo }
    : { receptor_tipo: receptorTipo, tax_id: taxId, tax_id_dv: fiscalId.uses_dv ? taxIdDv.trim() : '' }

  const contactsPayload = () => contacts.map(c => ({
    name: c.name, role: c.role, phone: c.phone || null, email: c.email || null,
  }))

  function handleCreateError(err: unknown) {
    const data = isAxiosError<{ message?: string; code?: string; existing?: DuplicateTaxId }>(err) ? err.response?.data : undefined
    if (data?.code === 'duplicate_tax_id' && data.existing) setDuplicate(data.existing)
    setError(data?.message ?? t('ventasDiseno:modal.createError'))
  }

  const existingMutation = useMutation({
    mutationFn: (existing: DuplicateTaxId) => ventasDisenoApi.clients.get(existing.master_client_id).then(client => ({ client, existing })),
    onSuccess: ({ client, existing }) => {
      if (props.mode === 'client') {
        props.onCreated(client)
        return
      }
      const sub = client.sub_clients.find(sc => sc.id === existing.sub_client_id)
      if (sub) props.onCreated(sub)
    },
  })

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
    onError: handleCreateError,
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
    onError: handleCreateError,
  })

  const isSaving = createClientMutation.isPending || createSubClientMutation.isPending

  function handleSave() {
    setError(null)
    setDuplicate(null)
    if (props.mode === 'client') {
      createClientMutation.mutate()
    } else {
      createSubClientMutation.mutate(props.masterClientId)
    }
  }

  const taxDataValid = receptorTipo === '02' || (taxId.trim() !== '' && (!fiscalId.uses_dv || taxIdDv.trim() === '' || dvPattern(fiscalId).test(taxIdDv.trim())))
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
                  {fiscalIdText(t('ventasDiseno:clients.createModal.taxId'), fiscalId)} *
                </label>
                <input type="text" value={taxId} onChange={e => setTaxId(e.target.value)} className={inputClass} />
              </div>
              {fiscalId.uses_dv && <div className="w-20 shrink-0">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:clients.createModal.taxIdDv')}
                </label>
                {/* Sin `maxLength`: el navegador cortaba el pegado (p. ej. " 81" con un espacio) a 2
                    caracteres ANTES de que el onChange limpie los no dígitos, y quedaba "8". El
                    `slice(0, 2)` de abajo ya limita a 2 dígitos. */}
                <input
                  type="text" inputMode="numeric"
                  value={taxIdDv}
                  onChange={e => setTaxIdDv(e.target.value.replace(/\D/g, '').slice(0, fiscalId.dv_max_length))}
                  className={inputClass}
                />
              </div>}
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
                {segments.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
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
          {duplicate && (props.mode === 'client' || duplicate.master_client_id === props.masterClientId) && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              <span>{t('ventasDiseno:clients.createModal.duplicateTaxId', { name: duplicate.business_name })}</span>
              <Button variant="secondary" onClick={() => existingMutation.mutate(duplicate)} loading={existingMutation.isPending}>
                {t('ventasDiseno:clients.createModal.useExisting')}
              </Button>
            </div>
          )}
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
