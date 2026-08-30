import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { ContactRole, PipelineCardFile, PipelineFileType, PipelineStage } from '@/types/ventasDiseno'
import { PIPELINE_STAGES } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoClock, IcoFile, IcoPencil, IcoDownload } from '@/components/icons'
import ClientPicker from '@/components/ClientPicker'
import PipelineFileViewerModal from '@/components/PipelineFileViewerModal'
import { sanitizeUnsignedDecimalInput } from '@/lib/decimalInput'

// Flujo lineal Lead → Diseño → Cotización → Propuesta → Aprobado (REQ-011/014/016/017).
// "lost" se alcanza desde cualquier etapa activa sin gate; se sale de "lost" únicamente
// reactivando a Lead (REQ-018), fuera de esta cadena.
const STAGE_FLOW: Record<Exclude<PipelineStage, 'lost'>, PipelineStage | null> = {
  lead: 'design', design: 'quote', quote: 'proposal', proposal: 'approved', approved: null,
}

const FILE_TYPES: PipelineFileType[] = ['design', 'signed_quote', 'approval_proof', 'proposal', 'photo']

interface Props {
  cardId:  number
  onClose: () => void
}

export default function PipelineCardModal({ cardId, onClose }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: card, isLoading } = useQuery({
    queryKey: ['ventas-diseno-pipeline-card', cardId],
    queryFn:  () => ventasDisenoApi.pipeline.get(cardId),
  })

  const [name,           setName]           = useState('')
  const [tag,            setTag]            = useState('')
  const [workedAreaM2,   setWorkedAreaM2]   = useState('')
  const [deliveryType,   setDeliveryType]   = useState('')
  const [deliveryDates,  setDeliveryDates]  = useState<string[]>([])
  const [observations,   setObservations]   = useState('')
  const [masterClient,   setMasterClient]   = useState<{ id: number; label: string } | null>(null)
  const [subClient,      setSubClient]      = useState<{ id: number; label: string } | null>(null)

  // Contacto nuevo
  const [contactName,  setContactName]  = useState('')
  const [contactRole,  setContactRole]  = useState<ContactRole>('client')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  // Edicion de contacto existente — SCRUM-90, mismo patron que ClientDetailModal.
  const [editingContactId, setEditingContactId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState({ name: '', role: 'client' as ContactRole, phone: '', email: '' })

  // SCRUM-78 — hallazgo de Daniela Amaya en validación (2026-07-21): el formulario quedaba
  // editable apenas se abría la tarjeta, sin ningún gate — riesgo de cambiar/borrar algo por
  // accidente. El mockup abre siempre en modo vista (campos de solo lectura) con un botón
  // "Editar" explícito que recién ahí habilita el formulario ya existente.
  const [isEditing, setIsEditing] = useState(false)

  const [stageError, setStageError] = useState<string | null>(null)
  const [quoteGateError, setQuoteGateError] = useState<string | null>(null)
  const fileInputRefs = useRef<Partial<Record<PipelineFileType, HTMLInputElement | null>>>({})
  const masterClientInputRef = useRef<HTMLInputElement | null>(null)

  // REQ-011 criterio 2 — al bloquear un intento de avance por falta de Cliente
  // Master, enfocar (y con eso abrir el dropdown de) el picker en vez de dejar
  // solo el mensaje de error.
  function focusMasterClientPicker() {
    masterClientInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    masterClientInputRef.current?.focus()
  }

  // SCRUM-76 — Escape cierra el modal, igual que el botón "Cerrar"/la X.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!card) return
    setName(card.sales_project.name)
    setTag(card.sales_project.tag ?? '')
    setWorkedAreaM2(card.worked_area_m2 != null ? String(card.worked_area_m2) : '')
    setDeliveryType(card.delivery_type ?? '')
    setDeliveryDates(card.delivery_dates)
    setObservations(card.observations ?? '')
    setMasterClient(card.master_client ? { id: card.master_client.id, label: card.master_client.name } : null)
    setSubClient(card.sub_client ? { id: card.sub_client.id, label: card.sub_client.business_name } : null)
  }, [card])

  // SCRUM-78 — "Cancelar" descarta cambios sin guardar y vuelve a modo vista, sin cerrar el
  // modal. Mismo seed que el efecto de arriba, reusado acá para no duplicar la lista de campos.
  function cancelEditing() {
    if (!card) return
    setName(card.sales_project.name)
    setTag(card.sales_project.tag ?? '')
    setWorkedAreaM2(card.worked_area_m2 != null ? String(card.worked_area_m2) : '')
    setDeliveryType(card.delivery_type ?? '')
    setDeliveryDates(card.delivery_dates)
    setObservations(card.observations ?? '')
    setMasterClient(card.master_client ? { id: card.master_client.id, label: card.master_client.name } : null)
    setSubClient(card.sub_client ? { id: card.sub_client.id, label: card.sub_client.business_name } : null)
    setSaveError(null)
    setIsEditing(false)
  }

  const [saveError, setSaveError] = useState<string | null>(null)
  const saveMutation = useMutation({
    mutationFn: () => ventasDisenoApi.pipeline.update(cardId, {
      name,
      tag: tag || null,
      master_client_id: masterClient?.id ?? null,
      sub_client_id:     subClient?.id ?? null,
      worked_area_m2:    workedAreaM2 === '' ? null : Number(workedAreaM2),
      delivery_type:      (deliveryType || null) as 'single' | 'partial' | null,
      delivery_dates:      deliveryDates,
      observations:        observations || null,
    }),
    onSuccess: () => {
      setSaveError(null)
      setIsEditing(false)
      // SCRUM-677 — guardar puede ser justo la acción que resuelve el dato que
      // faltaba para el gate de avance de etapa (ej. Cliente Master, superficie
      // trabajada). stageError/quoteGateError quedaban pegados en pantalla
      // porque solo se limpiaban en el onSuccess de SU PROPIA mutación — nunca
      // al completar el dato por otra vía. Ver reporte de Daniela Amaya
      // (2026-08-03/04).
      setStageError(null)
      setQuoteGateError(null)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card', cardId] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline'] })
    },
    // SCRUM-81 — un 422 (ej. superficie negativa o fuera de rango) no tenía onError:
    // la UI quedaba muda y el valor anterior reaparecía al recargar sin ninguna pista.
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setSaveError(message ?? t('ventasDiseno:modal.saveError'))
    },
  })

  const addContactMutation = useMutation({
    mutationFn: () => ventasDisenoApi.pipeline.contacts.create(cardId, {
      name: contactName, role: contactRole, phone: contactPhone || null, email: contactEmail || null,
    }),
    onSuccess: () => {
      setContactName(''); setContactPhone(''); setContactEmail('')
      // SCRUM-677 — agregar un contacto puede resolver el gate de "falta contacto"
      // (REQ-011) — mismo motivo que en saveMutation.onSuccess arriba.
      setStageError(null)
      setQuoteGateError(null)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card', cardId] })
    },
  })

  const removeContactMutation = useMutation({
    mutationFn: (contactId: number) => ventasDisenoApi.pipeline.contacts.remove(cardId, contactId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card', cardId] }),
  })

  const editContactMutation = useMutation({
    mutationFn: (contactId: number) => ventasDisenoApi.pipeline.contacts.update(cardId, contactId, {
      name: editDraft.name, role: editDraft.role, phone: editDraft.phone || null, email: editDraft.email || null,
    }),
    onSuccess: () => {
      setEditingContactId(null)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card', cardId] })
    },
  })

  function startEditContact(c: { id: number; name: string; role: ContactRole; phone: string | null; email: string | null }) {
    setEditingContactId(c.id)
    setEditDraft({ name: c.name, role: c.role, phone: c.phone ?? '', email: c.email ?? '' })
  }

  const editDraftValid = editDraft.name.trim() !== '' && (editDraft.phone.trim() !== '' || editDraft.email.trim() !== '')

  const changeStageMutation = useMutation({
    mutationFn: (stage: PipelineStage) => ventasDisenoApi.pipeline.changeStage(cardId, stage),
    onSuccess: () => {
      setStageError(null)
      // SCRUM-677 — un cambio de etapa exitoso (ej. el auto-avance disparado desde
      // uploadFileMutation) también resuelve cualquier quoteGateError pendiente de
      // un intento previo de "Crear cotización".
      setQuoteGateError(null)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card', cardId] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline'] })
    },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setStageError(message ?? t('ventasDiseno:modal.stageChangeError'))
      if (message?.includes('Cliente Master')) focusMasterClientPicker()
    },
  })

  const [uploadFileError, setUploadFileError] = useState<string | null>(null)
  const uploadFileMutation = useMutation({
    mutationFn: ({ type, file }: { type: PipelineFileType; file: File }) =>
      ventasDisenoApi.pipeline.uploadFile(cardId, type, file),
    onSuccess: (_data, { type }) => {
      setUploadFileError(null)
      // SCRUM-677 — subir el archivo que faltaba (ej. diseño para "Crear cotización")
      // resuelve el quoteGateError de un intento previo, incluso cuando este tipo de
      // archivo no dispara el auto-avance de abajo (que solo cubre stageError).
      setQuoteGateError(null)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card', cardId] })
      // REQ-016/017 criterio 3 — subir el archivo "gate" de la etapa actual avanza la
      // tarjeta automaticamente, en vez de dejar un clic extra en "Mover a...". Si el
      // otro requisito del gate (superficie / fecha de entrega) todavia falta, la
      // mutation falla igual que un clic manual y stageError ya lo muestra.
      if (type === 'signed_quote' && card?.stage === 'quote') {
        changeStageMutation.mutate('proposal')
      } else if (type === 'approval_proof' && card?.stage === 'proposal') {
        changeStageMutation.mutate('approved')
      }
    },
    // REQ-052 criterio 2 — el 422 de "extensions:" no puede quedar silencioso:
    // antes no habia onError, asi que un archivo invalido simplemente
    // desaparecia sin ningun aviso.
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setUploadFileError(message ?? t('ventasDiseno:modal.uploadFileError'))
    },
  })

  // SCRUM-767 — un archivo ya cargado quedaba listado pero funcionalmente inaccesible (ningún
  // onClick/href en el <li>). "Ver" pide una URL presignada 'inline' y abre el visor embebido;
  // "Descargar" pide una URL presignada aparte con 'attachment' (mismo patrón que
  // `projectsApi.downloadDocument` en CRM, con el fix de Pre-QA 2026-08-15: sin el
  // Content-Disposition correcto por parte de S3, el navegador ignora `a.download` en una URL
  // cross-origin y termina guardando el archivo con la key UUID interna, no `file_name`).
  const [fileUrlError, setFileUrlError] = useState<string | null>(null)
  const [viewingFile, setViewingFile] = useState<{ file: PipelineCardFile; url: string; filename: string; mimeType: string } | null>(null)
  const fileUrlMutation = useMutation({
    mutationFn: ({ file, disposition }: { file: PipelineCardFile; disposition: 'inline' | 'attachment' }) =>
      ventasDisenoApi.pipeline.fileUrl(cardId, file.id, disposition),
    onError: () => setFileUrlError(t('ventasDiseno:modal.fileUrlError')),
  })

  function handleViewFile(file: PipelineCardFile) {
    setFileUrlError(null)
    fileUrlMutation.mutate({ file, disposition: 'inline' }, {
      onSuccess: ({ url, filename, mime_type }) => setViewingFile({ file, url, filename, mimeType: mime_type }),
    })
  }

  function handleDownloadFile(file: PipelineCardFile) {
    setFileUrlError(null)
    fileUrlMutation.mutate({ file, disposition: 'attachment' }, {
      onSuccess: ({ url, filename }) => {
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      },
    })
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
      ? ventasDisenoApi.subClients.list(masterClient.id, q).then(opts => opts.map(o => ({ id: o.id, label: o.business_name })))
      : Promise.resolve([]),
    [masterClient],
  )
  const createSubClient = useCallback(
    (q: string, taxId: string) => masterClient
      ? ventasDisenoApi.subClients.create(masterClient.id, q, taxId).then(c => ({ id: c.id, label: c.business_name }))
      : Promise.reject(new Error('no master client')),
    [masterClient],
  )

  const stage = PIPELINE_STAGES.find(s => s.id === card?.stage)
  const canEdit = card?.can_edit ?? false

  // "Crear cotizacion" bypasea changeStageMutation (no cambia la etapa, ver
  // REQ-050) asi que necesita su propio gate -- distinto segun la etapa:
  // - Lead (REQ-011): igual que mover-desde-Lead, exige contacto + Cliente
  //   Master + Subcliente antes de dejar avanzar un Lead vacio.
  // - Diseno (REQ-014): exige superficie trabajada y al menos un archivo de
  //   diseno, contra los datos ya guardados en el servidor (card), no el
  //   estado local sin guardar, para coincidir con lo que REQ-050 precarga.
  function handleCreateQuoteClick() {
    if (!card) return
    setQuoteGateError(null)

    if (card.stage === 'lead') {
      if (card.contacts.length === 0) {
        setQuoteGateError(t('ventasDiseno:modal.stageChangeMissingContact'))
        return
      }
      if (card.master_client === null) {
        setQuoteGateError(t('ventasDiseno:modal.stageChangeMissingMasterClient'))
        focusMasterClientPicker()
        return
      }
      if (card.sub_client === null) {
        setQuoteGateError(t('ventasDiseno:modal.stageChangeMissingSubClient'))
        return
      }
      navigate(`/ventas-diseno/quotes?fromPipelineCard=${card.id}`)
      return
    }

    if (card.worked_area_m2 == null) {
      setQuoteGateError(t('ventasDiseno:modal.createQuoteMissingArea'))
      return
    }
    const hasDesignFile = card.files.some(f => f.type === 'design')
    if (!hasDesignFile) {
      setQuoteGateError(t('ventasDiseno:modal.createQuoteMissingFile'))
      fileInputRefs.current.design?.click()
      return
    }
    navigate(`/ventas-diseno/quotes?fromPipelineCard=${card.id}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            {stage && <span className="inline-block w-2 h-2 rounded-full" style={{ background: stage.color }} />}
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {card ? t(`ventasDiseno:stages.${card.stage}`) : t('common:labels.loading')}
            </h2>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !card ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : (
            <>
              {!canEdit && (
                <div className="mb-4 px-3 py-2 rounded-lg border text-[12px] font-medium bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300">
                  {card.stage === 'lost'
                    ? t('ventasDiseno:modal.notEditableLost')
                    : t('ventasDiseno:modal.notEditableApproved')}
                </div>
              )}

              {/* SCRUM-78 — la tarjeta abre siempre en modo vista; "Editar" recién ahí habilita
                  el formulario. Evita cambiar/borrar un campo por accidente al solo mirar la
                  tarjeta. */}
              {canEdit && !isEditing && (
                <div className="mb-4">
                  <Button variant="secondary" onClick={() => setIsEditing(true)} className="!flex !items-center !gap-1.5">
                    <IcoPencil size={14} /> {t('common:actions.edit')}
                  </Button>
                </div>
              )}

              {stageError && (
                <div className="mb-4 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
                  {stageError}
                </div>
              )}

              {quoteGateError && (
                <div className="mb-4 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
                  {quoteGateError}
                </div>
              )}

              {/* SCRUM-738 — unificado en un solo grid de 2 columnas (antes eran 4 bloques
                  grid apilados, uno de ellos a sm:grid-cols-3, con anchos de columna
                  distintos entre sí — eso desalineaba "Días en etapa"/"Valor" respecto al
                  resto de los campos). Un único grid deja que CSS alinee cada fila a la
                  celda más alta, aunque haya valores largos o vacíos. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.name')}
                  </label>
                  {isEditing ? (
                    <input
                      type="text" value={name} disabled={!canEdit}
                      onChange={e => setName(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:border-[#5BA5A0] focus:outline-none"
                    />
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">{name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.tag')}
                  </label>
                  {isEditing ? (
                    <select
                      value={tag} disabled={!canEdit}
                      onChange={e => setTag(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">—</option>
                      <option value="design">{t('ventasDiseno:tag.design')}</option>
                      <option value="quote">{t('ventasDiseno:tag.quote')}</option>
                      <option value="both">{t('ventasDiseno:tag.both')}</option>
                    </select>
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">
                      {tag ? t(`ventasDiseno:tag.${tag}`) : '—'}
                    </p>
                  )}
                </div>

                {isEditing ? (
                  <>
                    <ClientPicker
                      inputRef={masterClientInputRef}
                      label={t('ventasDiseno:modal.masterClient')}
                      value={masterClient?.label ?? ''}
                      onSelect={opt => { setMasterClient(opt); setSubClient(null) }}
                      search={searchMasterClients}
                      onCreate={createMasterClient}
                      disabled={!canEdit}
                    />
                    <ClientPicker
                      label={t('ventasDiseno:modal.subClient')}
                      value={subClient?.label ?? ''}
                      onSelect={setSubClient}
                      search={searchSubClients}
                      onCreate={createSubClient}
                      disabled={!canEdit || !masterClient}
                      extraFieldLabel={t('ventasDiseno:modal.subClientTaxId')}
                    />
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                        {t('ventasDiseno:modal.masterClient')}
                      </label>
                      <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">{masterClient?.label ?? '—'}</p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                        {t('ventasDiseno:modal.subClient')}
                      </label>
                      <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">{subClient?.label ?? '—'}</p>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.owner')}
                  </label>
                  <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">{card.owner.name}</p>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.daysInStage')}
                  </label>
                  <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">{card.days_in_stage}d</p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.amount')}
                  </label>
                  <p className="text-sm text-slate-400 py-1.5">
                    {card.amount != null ? `$${Number(card.amount).toLocaleString()}` : t('ventasDiseno:modal.amountNote')}
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.workedArea')}
                  </label>
                  {isEditing ? (
                    <input
                      type="text" inputMode="decimal" value={workedAreaM2} disabled={!canEdit}
                      onChange={e => setWorkedAreaM2(sanitizeUnsignedDecimalInput(e.target.value))}
                      placeholder={t('ventasDiseno:modal.undefined')}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">
                      {workedAreaM2 || t('ventasDiseno:modal.undefined')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.deliveryType')}
                  </label>
                  {isEditing ? (
                    <select
                      value={deliveryType} disabled={!canEdit}
                      onChange={e => {
                        const v = e.target.value
                        setDeliveryType(v)
                        if (v === 'partial' && deliveryDates.length < 2) {
                          setDeliveryDates(['', ''])
                        }
                        // QA formal 2026-07-11: "Única" nunca sembraba deliveryDates, así que
                        // no aparecía ningún input de fecha para tipearla (el botón "+" tampoco
                        // se muestra para 'single') — callejón sin salida real, bloqueaba el
                        // gate Propuesta→Aprobado. Mismo bug ya corregido en QuotePage.tsx.
                        if (v === 'single' && deliveryDates.length < 1) {
                          setDeliveryDates([''])
                        }
                      }}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">—</option>
                      <option value="single">{t('ventasDiseno:modal.deliverySingle')}</option>
                      <option value="partial">{t('ventasDiseno:modal.deliveryPartial')}</option>
                    </select>
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">
                      {deliveryType ? t(`ventasDiseno:modal.delivery${deliveryType === 'single' ? 'Single' : 'Partial'}`) : '—'}
                    </p>
                  )}
                </div>
              </div>

              {/* SCRUM-78 — el criterio define los campos de fecha para Propuesta/
                  Aprobado; antes aparecian en cualquier etapa apenas se elegia un
                  Tipo de entrega. El selector sigue visible siempre (se puede
                  precargar), solo se ocultan los inputs de fecha. */}
              {deliveryType && (card.stage === 'proposal' || card.stage === 'approved') && (
                <div className="mb-3">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.deliveryDates')}
                  </label>
                  {isEditing ? (
                  <div className="flex flex-wrap gap-2">
                    {deliveryDates.map((d, i) => (
                      <input
                        key={i} type="date" value={d} disabled={!canEdit}
                        onChange={e => setDeliveryDates(dates => dates.map((x, xi) => xi === i ? e.target.value : x))}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                      />
                    ))}
                    {canEdit && deliveryType === 'partial' && (
                      <Button variant="secondary" onClick={() => setDeliveryDates(d => [...d, ''])}>+</Button>
                    )}
                  </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {deliveryDates.map((d, i) => (
                        <p key={i} className="text-sm text-slate-700 dark:text-slate-200 py-1.5 px-2">{d || '—'}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mb-3">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('ventasDiseno:modal.observations')}
                </label>
                {isEditing ? (
                  <textarea
                    value={observations} disabled={!canEdit} rows={2}
                    onChange={e => setObservations(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  />
                ) : (
                  <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5 whitespace-pre-wrap">
                    {observations || '—'}
                  </p>
                )}
              </div>

              <div className="mb-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                  {t('ventasDiseno:modal.files')}
                </p>
                {fileUrlError && (
                  <div className="mb-2 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
                    {fileUrlError}
                  </div>
                )}
                {uploadFileError && (
                  <div className="mb-2 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
                    {uploadFileError}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {FILE_TYPES.map(type => {
                    const filesOfType = card.files.filter(f => f.type === type)
                    return (
                      <div key={type} className="flex items-start justify-between gap-2 bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500 mb-1">
                            {t(`ventasDiseno:fileType.${type}`)}
                          </p>
                          {filesOfType.length === 0 ? (
                            <p className="text-sm text-slate-400">{t('ventasDiseno:modal.noFilesYet')}</p>
                          ) : (
                            <ul className="flex flex-col gap-1">
                              {filesOfType.map(f => (
                                <li key={f.id} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                                  <IcoFile size={13} className="shrink-0" />
                                  {/* SCRUM-767 — antes texto estático sin onClick/href, el archivo
                                      quedaba guardado pero funcionalmente inaccesible. El nombre
                                      es clickeable (abre "Ver") y hay una acción explícita de
                                      "Descargar" aparte — visualizar y descargar son
                                      independientes, ninguna dispara la otra. */}
                                  <button
                                    type="button"
                                    onClick={() => handleViewFile(f)}
                                    disabled={fileUrlMutation.isPending}
                                    className="truncate text-left text-primary hover:text-primary-dark dark:text-primary-light underline underline-offset-2 disabled:opacity-50"
                                    title={f.file_name}
                                  >
                                    {f.file_name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadFile(f)}
                                    disabled={fileUrlMutation.isPending}
                                    className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
                                    title={t('ventasDiseno:modal.fileDownload')}
                                  >
                                    <IcoDownload size={13} />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {/* REQ-013/REQ-015 — archivos de diseno y de propuesta quedan de solo
                            lectura en Aprobado, sin excepcion (a diferencia de canEdit, que si
                            tiene una para otros campos via el permiso ventas_diseno.edit.approved).
                            approval_proof queda afuera a proposito, ver PipelineController::uploadFile.
                            SCRUM-78 — tambien gateado por isEditing, como el resto del formulario. */}
                        {canEdit && isEditing && !(
                          (type === 'design' || type === 'proposal') && card.stage === 'approved'
                        ) && (
                          <>
                            <input
                              ref={el => { fileInputRefs.current[type] = el }}
                              type="file" accept=".png,.jpg,.jpeg,.pdf" className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0]
                                if (file) uploadFileMutation.mutate({ type, file })
                                e.target.value = ''
                              }}
                            />
                            <Button
                              variant="secondary"
                              onClick={() => fileInputRefs.current[type]?.click()}
                              disabled={uploadFileMutation.isPending}
                            >
                              {t('common:actions.add')}
                            </Button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Contactos — REQ-021 */}
              <div className="mt-5 pt-5 border-t-2 border-slate-200 dark:border-slate-700">
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center justify-between">
                  <span>{t('ventasDiseno:modal.contacts')}</span>
                  {!card.has_architect_contact && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                      <IcoClock size={13} /> {t('ventasDiseno:modal.missingArchitect')}
                    </span>
                  )}
                </h3>

                <ul className="mb-3 flex flex-col gap-2">
                  {card.contacts.map(c => (
                    editingContactId === c.id ? (
                      <li key={c.id} className="bg-slate-50 dark:bg-slate-900 rounded-lg p-2 flex flex-wrap gap-2 items-center">
                        <input
                          type="text" value={editDraft.name}
                          onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm flex-1 min-w-[120px]"
                        />
                        <select
                          value={editDraft.role}
                          onChange={e => setEditDraft(d => ({ ...d, role: e.target.value as ContactRole }))}
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                        >
                          <option value="client">{t('ventasDiseno:contactRole.client')}</option>
                          <option value="architect">{t('ventasDiseno:contactRole.architect')}</option>
                          <option value="other">{t('ventasDiseno:contactRole.other')}</option>
                        </select>
                        <input
                          type="text" placeholder={t('common:labels.phone')} value={editDraft.phone}
                          onChange={e => setEditDraft(d => ({ ...d, phone: e.target.value }))}
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm w-28"
                        />
                        <input
                          type="email" placeholder={t('common:labels.email')} value={editDraft.email}
                          onChange={e => setEditDraft(d => ({ ...d, email: e.target.value }))}
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm w-36"
                        />
                        <Button variant="secondary" onClick={() => setEditingContactId(null)}>
                          {t('common:actions.cancel')}
                        </Button>
                        <Button
                          onClick={() => editContactMutation.mutate(c.id)}
                          disabled={!editDraftValid || editContactMutation.isPending}
                          loading={editContactMutation.isPending}
                        >
                          {t('common:actions.save')}
                        </Button>
                      </li>
                    ) : (
                      <li key={c.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 rounded-lg px-3 py-2 text-sm">
                        <span>
                          <span className="font-semibold">{c.name}</span>{' '}
                          <span className="text-slate-400">({t(`ventasDiseno:contactRole.${c.role}`)})</span>{' '}
                          {c.phone && <span className="text-slate-400">· {c.phone}</span>}
                          {c.email && <span className="text-slate-400"> · {c.email}</span>}
                        </span>
                        {/* SCRUM-78 — gateado por isEditing, no solo canEdit, mismo criterio que
                            el resto del formulario. */}
                        {canEdit && isEditing && (
                          <span className="flex items-center gap-3">
                            <button
                              onClick={() => startEditContact(c)}
                              className="text-[#5BA5A0] hover:text-[#3D7E7A] text-xs font-semibold"
                            >
                              {t('ventasDiseno:clients.detail.editContact')}
                            </button>
                            <button
                              onClick={() => removeContactMutation.mutate(c.id)}
                              className="text-red-500 hover:text-red-700 text-xs font-semibold"
                            >
                              {t('common:actions.delete')}
                            </button>
                          </span>
                        )}
                      </li>
                    )
                  ))}
                  {card.contacts.length === 0 && (
                    <li className="text-sm text-slate-400">{t('ventasDiseno:modal.noContacts')}</li>
                  )}
                </ul>

                {canEdit && isEditing && (
                  <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap gap-2 items-end">
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
                    <Button
                      onClick={() => addContactMutation.mutate()}
                      disabled={!contactName.trim() || (!contactPhone.trim() && !contactEmail.trim()) || addContactMutation.isPending}
                    >
                      {t('common:actions.add')}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between items-center gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {/* SCRUM-734 (sección 3) — visible en cualquier etapa (incl. Perdido/
                Aprobado, de solo lectura) siempre que el proyecto tenga al menos 1
                cotización confirmada; a diferencia de "Crear cotización" no depende
                de canEdit, es una acción de navegación, no de edición. */}
            {card?.latest_quote_id != null && (
              <Button
                variant="secondary"
                onClick={() => navigate(`/ventas-diseno/quotes-list?viewQuote=${card.latest_quote_id}`)}
              >
                {t('ventasDiseno:modal.viewProjectQuotes')}
              </Button>
            )}
            {card?.stage === 'lost' && (
              <Button
                variant="accent"
                onClick={() => changeStageMutation.mutate('lead')}
                disabled={changeStageMutation.isPending}
                loading={changeStageMutation.isPending}
              >
                {t('ventasDiseno:modal.reactivate')}
              </Button>
            )}
            {/* REQ-597 RN3 / REQ-603 RN2 (Epic CRM Batch B) — Aprobado es terminal, sin ningún
                botón de movimiento (ni "Mover a siguiente" — ya cubierto por STAGE_FLOW.approved
                === null — ni "Marcar como Perdido", que sí se colaba para un usuario con permiso
                de editar Aprobado, ej. Mark). */}
            {card && canEdit && card.stage !== 'lost' && card.stage !== 'approved' && (
              <>
                {/* RN5 (SCRUM-677/680): nunca un botón genérico de movimiento hacia Cotización —
                    la única vía a esa etapa es "Crear cotización" (abajo), generando una
                    cotización real. Hoy el único salto que apunta a 'quote' en STAGE_FLOW es
                    design->quote; excluirlo por destino (no por etapa origen) para que la regla
                    se sostenga sola si el flujo cambia más adelante. */}
                {STAGE_FLOW[card.stage as Exclude<PipelineStage, 'lost'>] && STAGE_FLOW[card.stage as Exclude<PipelineStage, 'lost'>] !== 'quote' && (
                  <Button
                    variant="secondary"
                    onClick={() => changeStageMutation.mutate(STAGE_FLOW[card.stage as Exclude<PipelineStage, 'lost'>]!)}
                    disabled={changeStageMutation.isPending}
                    loading={changeStageMutation.isPending}
                  >
                    {t('ventasDiseno:modal.moveToNext', {
                      stage: t(`ventasDiseno:stages.${STAGE_FLOW[card.stage as Exclude<PipelineStage, 'lost'>]}`),
                    })}
                  </Button>
                )}
                {/* REQ-050: precarga la cotización nueva con Cliente Master/Subcliente/
                    RUC/Proyecto/primer contacto de esta tarjeta — solo tiene sentido
                    antes de que la tarjeta ya esté en Cotización o más adelante. */}
                {(card.stage === 'lead' || card.stage === 'design') && (
                  <Button
                    variant="secondary"
                    onClick={handleCreateQuoteClick}
                  >
                    {t('ventasDiseno:modal.createQuote')}
                  </Button>
                )}
                <Button
                  variant="danger"
                  onClick={() => changeStageMutation.mutate('lost')}
                  disabled={changeStageMutation.isPending}
                >
                  {t('ventasDiseno:modal.markAsLost')}
                </Button>
              </>
            )}
          </div>

          {saveError && (
            <div className="mb-2 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
              {saveError}
            </div>
          )}

          <div className="flex gap-2">
            {isEditing ? (
              <Button variant="secondary" onClick={cancelEditing} disabled={saveMutation.isPending}>
                {t('common:actions.cancel')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
            )}
            {/* SCRUM-78 — "Guardar" solo tiene sentido en modo edición; en modo vista no hay
                cambios pendientes que guardar. */}
            {canEdit && isEditing && (
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!name.trim() || saveMutation.isPending}
                loading={saveMutation.isPending}
              >
                {t('common:actions.save')}
              </Button>
            )}
          </div>
        </div>
      </Card>
      {viewingFile && (
        <PipelineFileViewerModal
          url={viewingFile.url}
          filename={viewingFile.filename}
          mimeType={viewingFile.mimeType}
          onClose={() => setViewingFile(null)}
          onDownload={() => handleDownloadFile(viewingFile.file)}
        />
      )}
    </div>
  )
}
