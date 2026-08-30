import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { ContactRole, PipelineCardDetail } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import ClientPicker from '@/components/ClientPicker'

type ProjectType = 'lead' | 'design'

interface Props {
  onClose:   () => void
  onCreated: (card: PipelineCardDetail) => void
}

// Grupo 1d — REQ-019 (tipo Lead, sin cliente) + REQ-020 (tipo Diseño, vinculado a un
// Subcliente, nace directo en esa etapa) + REQ-023 (mismo modal, el usuario elige el
// tipo adentro).
export default function NewProjectModal({ onClose, onCreated }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()

  const [type, setType] = useState<ProjectType>('lead')
  const [name, setName] = useState('')
  const [masterClient, setMasterClient] = useState<{ id: number; label: string } | null>(null)
  const [subClient,    setSubClient]    = useState<{ id: number; label: string } | null>(null)
  const [subClientHasNoContacts, setSubClientHasNoContacts] = useState(false)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // REQ-019 (tipo Lead): campos opcionales además de Nombre.
  const [tag, setTag] = useState('')
  const [observations, setObservations] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  // SCRUM-88 — Contacto opcional, mismo formulario/patrón que PipelineCardModal.
  const [contactName,  setContactName]  = useState('')
  const [contactRole,  setContactRole]  = useState<ContactRole>('client')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  // REQ-020 (tipo Diseño): archivos de diseño, múltiples, agregados de a uno con "+".
  const [designFiles, setDesignFiles] = useState<File[]>([])
  const designInputRef = useRef<HTMLInputElement | null>(null)

  // id → contacts_count del último resultado de búsqueda de Subcliente — ClientPicker
  // solo devuelve {id, label} en onSelect, así que se guarda acá para poder consultarlo.
  const subContactsById = useRef<Map<number, number>>(new Map())

  const createMutation = useMutation({
    mutationFn: async () => {
      const card = await ventasDisenoApi.pipeline.create({
        type,
        name,
        sub_client_id: type === 'design' ? subClient?.id ?? null : null,
        tag: type === 'lead' ? (tag || null) : null,
        observations: type === 'lead' ? (observations || null) : null,
      })

      // Pre-QA (SCRUM-88) — un fallo de upload acá NO debe dejar al usuario creyendo que
      // nada se guardó: la tarjeta ya existe en este punto, así que reintentar "Guardar"
      // crearía un duplicado. En vez de propagar el error y dejar el modal abierto,
      // seguimos a onCreated igual (abre el detalle real de la tarjeta, donde el archivo
      // se puede reintentar con el upload propio de PipelineCardModal).
      try {
        if (type === 'lead' && photoFile) {
          await ventasDisenoApi.pipeline.uploadFile(card.id, 'photo', photoFile)
        }
        if (type === 'design' && designFiles.length > 0) {
          for (const file of designFiles) {
            await ventasDisenoApi.pipeline.uploadFile(card.id, 'design', file)
          }
        }
        if (type === 'lead' && contactName.trim() !== '') {
          await ventasDisenoApi.pipeline.contacts.create(card.id, {
            name: contactName, role: contactRole, phone: contactPhone || null, email: contactEmail || null,
          })
        }
      } catch {
        // ignorado a propósito — ver comentario arriba.
      }

      return card
    },
    onSuccess: card => {
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline'] })
      onCreated(card)
    },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setError(message ?? t('ventasDiseno:modal.createError'))
    },
  })

  function selectType(next: ProjectType) {
    setType(next)
    setMasterClient(null)
    setSubClient(null)
    setSubClientHasNoContacts(false)
    setSaveAttempted(false)
    setTag('')
    setObservations('')
    setPhotoFile(null)
    setDesignFiles([])
    setContactName('')
    setContactRole('client')
    setContactPhone('')
    setContactEmail('')
  }

  const searchMasterClients = useCallback(
    (q: string) => ventasDisenoApi.masterClients.list(q).then(opts => opts.map(o => ({ id: o.id, label: o.name }))),
    [],
  )
  const createMasterClient = useCallback(
    (q: string) => ventasDisenoApi.masterClients.create(q).then(c => ({ id: c.id, label: c.name })),
    [],
  )
  const searchSubClients = useCallback(
    (q: string) => masterClient
      ? ventasDisenoApi.subClients.list(masterClient.id, q).then(opts => {
          subContactsById.current = new Map(opts.map(o => [o.id, o.contacts_count ?? 0]))
          return opts.map(o => ({ id: o.id, label: o.business_name }))
        })
      : Promise.resolve([]),
    [masterClient],
  )
  const createSubClient = useCallback(
    (q: string, taxId: string) => masterClient
      ? ventasDisenoApi.subClients.create(masterClient.id, q, taxId).then(c => {
          subContactsById.current.set(c.id, 0)
          return { id: c.id, label: c.business_name }
        })
      : Promise.reject(new Error('no master client')),
    [masterClient],
  )

  function handleSelectSubClient(opt: { id: number; label: string }) {
    setSubClient(opt)
    setSubClientHasNoContacts((subContactsById.current.get(opt.id) ?? 0) === 0)
    setSaveAttempted(false)
  }

  // REQ-020: el primer clic en Guardar solo arma la confirmación (no envía nada);
  // recién el segundo clic — con el botón ya en "Confirmar y crear" — crea el proyecto.
  const awaitingConfirmation = type === 'design' && subClientHasNoContacts && saveAttempted
  // Mismo requisito que PipelineCardModal: un contacto con nombre necesita teléfono o correo.
  const contactIncomplete = type === 'lead' && contactName.trim() !== '' && !contactPhone.trim() && !contactEmail.trim()
  const formValid = name.trim() !== '' && (type === 'lead' || subClient !== null) && !contactIncomplete

  function handleSave() {
    setError(null)
    if (type === 'design' && subClientHasNoContacts && !saveAttempted) {
      setSaveAttempted(true)
      return
    }
    createMutation.mutate()
  }

  const typeButtonClass = (active: boolean) => [
    'flex-1 text-sm font-semibold px-3 py-2 rounded-lg border transition-colors',
    active ? 'bg-[#5BA5A0] border-[#5BA5A0] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
  ].join(' ')

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-lg my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:modal.newProject.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          <div className="flex gap-2 mb-4">
            <button className={typeButtonClass(type === 'lead')} onClick={() => selectType('lead')}>
              {t('ventasDiseno:modal.newProject.typeLead')}
            </button>
            <button className={typeButtonClass(type === 'design')} onClick={() => selectType('design')}>
              {t('ventasDiseno:modal.newProject.typeDesign')}
            </button>
          </div>

          <div className="mb-3">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
              {t('ventasDiseno:modal.newProject.name')}
            </label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#5BA5A0] focus:outline-none"
            />
          </div>

          {type === 'design' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <ClientPicker
                label={t('ventasDiseno:modal.masterClient')}
                value={masterClient?.label ?? ''}
                onSelect={opt => { setMasterClient(opt); setSubClient(null); setSubClientHasNoContacts(false) }}
                search={searchMasterClients}
                onCreate={createMasterClient}
                disabled={false}
              />
              <ClientPicker
                label={t('ventasDiseno:modal.subClient')}
                value={subClient?.label ?? ''}
                onSelect={handleSelectSubClient}
                search={searchSubClients}
                onCreate={createSubClient}
                disabled={!masterClient}
                extraFieldLabel={t('ventasDiseno:modal.subClientTaxId')}
              />
            </div>
          )}

          {type === 'design' && subClientHasNoContacts && (
            <p className="text-xs text-amber-600 mb-3">{t('ventasDiseno:modal.newProject.noContactsWarning')}</p>
          )}

          {type === 'lead' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.tag')}
                  </label>
                  <select
                    value={tag} onChange={e => setTag(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#5BA5A0] focus:outline-none"
                  >
                    <option value="">—</option>
                    <option value="design">{t('ventasDiseno:tag.design')}</option>
                    <option value="quote">{t('ventasDiseno:tag.quote')}</option>
                    <option value="both">{t('ventasDiseno:tag.both')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.newProject.photo')}
                  </label>
                  <input
                    ref={photoInputRef}
                    type="file" accept=".png,.jpg,.jpeg,.pdf" className="hidden"
                    onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
                  />
                  <Button variant="secondary" onClick={() => photoInputRef.current?.click()}>
                    {photoFile ? photoFile.name : t('common:actions.add')}
                  </Button>
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:modal.observations')}
                </label>
                <textarea
                  value={observations} rows={2}
                  onChange={e => setObservations(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#5BA5A0] focus:outline-none"
                />
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:modal.contacts')}
                </label>
                <div className="flex flex-wrap gap-2 items-end">
                  <input
                    type="text" placeholder={t('ventasDiseno:modal.contactName')}
                    value={contactName} onChange={e => setContactName(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm flex-1 min-w-[140px]"
                  />
                  <select
                    value={contactRole} onChange={e => setContactRole(e.target.value as ContactRole)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="client">{t('ventasDiseno:contactRole.client')}</option>
                    <option value="architect">{t('ventasDiseno:contactRole.architect')}</option>
                    <option value="other">{t('ventasDiseno:contactRole.other')}</option>
                  </select>
                  <input
                    type="text" placeholder={t('common:labels.phone')}
                    value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-32"
                  />
                  <input
                    type="email" placeholder={t('common:labels.email')}
                    value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm w-40"
                  />
                </div>
              </div>
            </>
          )}

          {type === 'design' && (
            <div className="mb-3">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {t('ventasDiseno:modal.newProject.designFiles')}
              </label>
              <ul className="mb-2 space-y-1">
                {designFiles.map((file, idx) => (
                  <li key={`${file.name}-${idx}`} className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      className="text-xs text-red-500 ml-2 shrink-0"
                      onClick={() => setDesignFiles(files => files.filter((_, i) => i !== idx))}
                    >
                      {t('common:actions.delete')}
                    </button>
                  </li>
                ))}
              </ul>
              <input
                ref={designInputRef}
                type="file" accept=".png,.jpg,.jpeg,.pdf" className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) setDesignFiles(files => [...files, file])
                  e.target.value = ''
                }}
              />
              <Button variant="secondary" onClick={() => designInputRef.current?.click()}>
                {t('common:actions.add')}
              </Button>
            </div>
          )}

          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button
            onClick={handleSave}
            disabled={!formValid || createMutation.isPending}
            loading={createMutation.isPending}
          >
            {awaitingConfirmation ? t('ventasDiseno:modal.newProject.confirmSave') : t('ventasDiseno:modal.newProject.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
