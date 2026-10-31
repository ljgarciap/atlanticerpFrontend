import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import type { ContactRole, PipelineCardDetail, PipelineCardFile, PipelineCardProductDeliveryAssignmentPayload, PipelineFileType, PipelineStage } from '@/types/ventasDiseno'
import { usePipelineStages } from '@/hooks/usePipelineStages'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoClock, IcoFile, IcoPencil, IcoDownload, IcoTrash } from '@/components/icons'
import ClientPicker from '@/components/ClientPicker'
import PipelineFileViewerModal from '@/components/PipelineFileViewerModal'
import ProductDeliveryAssignmentModal from '@/components/ProductDeliveryAssignmentModal'
import { UserMultiSelect } from '@/components/UserMultiSelect'
import { sanitizeUnsignedDecimalInput } from '@/lib/decimalInput'
import { formatDateTimeShort } from '@/utils/dates'
import { hasGerenciaScope } from '@/lib/gerenciaScope'

// Flujo lineal Lead → Diseño → Cotización → Propuesta → Aprobado (REQ-011/014/016/017), con las etapas propias de la empresa intercaladas
// (Fase 7c: sale del catálogo `pipeline_stage` vía `usePipelineStages().next()`, ya no es un mapa fijo). "perdida" se alcanza desde
// cualquier etapa abierta sin gate; se sale de ella únicamente reactivando a Lead (REQ-018), fuera de esta cadena.

const FILE_TYPES: PipelineFileType[] = ['design', 'signed_quote', 'approval_proof', 'proposal', 'photo']

// SCRUM-909 (rebote 2026-09-14) — el campo "Fecha estimada de entrega" (y "Asignar productos a entrega") se acota a las etapas donde el
// backend realmente permite guardarlo: Cotización en adelante (`isAtOrAfter(stage, 'quote')`, también las etapas propias que vayan después;
// ya no es un callejón sin salida en Cotización porque `PipelineController::update()` acepta esa etapa).

interface Props {
  cardId:  number
  onClose: () => void
}

export default function PipelineCardModal({ cardId, onClose }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const pipelineStages = usePipelineStages()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  // SCRUM-849.4 — solo Gerencia puede reasignar (mismo criterio de rol que canViewTeamV2()
  // en el backend, ver PipelineController::update()); para cualquier otro rol, la
  // asignación queda de solo lectura, listando a todos los asignados.
  const canSeeTeam = hasGerenciaScope(user)
  const readsPipelineOnly = (user?.permissions?.includes('ventas_diseno.pipeline.read_all') ?? false)
    && !(user?.permissions?.includes('ventas_diseno.read') ?? false)
  // SCRUM-1139 — Contabilidad además edita el Pipeline (`ventas_diseno.pipeline.edit`): sigue SIN `ventas_diseno.read`
  // (no abre cotizaciones ni clientes), pero recupera los controles de escritura del propio tablero.
  const hasPipelineEdit = user?.permissions?.includes('ventas_diseno.pipeline.edit') ?? false
  const readsPipelineReadOnly = readsPipelineOnly && !hasPipelineEdit

  const { data: card, isLoading } = useQuery({
    queryKey: ['ventas-diseno-pipeline-card', cardId],
    queryFn:  () => ventasDisenoApi.pipeline.get(cardId),
  })

  const { data: teamVendors } = useQuery({
    queryKey: ['ventas-diseno-home-vendors'],
    queryFn:  () => ventasDisenoApi.home.vendors(),
    enabled:  canSeeTeam,
  })

  // SCRUM-884 (rebote 2026-09-16) — cuando quien crea el proyecto es Gerencia (Gerencia/Gerencia2/Will),
  // queda en `assigneeIds` (owner_id) pero `teamVendors` nunca lo incluye (es la lista de
  // vendedores/diseñadores, no de Gerencia). `UserMultiSelect` solo renderiza como "chip"
  // removible a quien esté en la lista `users` que recibe — sin este id ahí, no había forma de
  // desmarcarlo, aunque sí se podía con cualquier creador vendedor/diseñador (esos sí están en
  // `teamVendors`). Unión con los asignados actuales de la tarjeta para que cualquiera ya asignado
  // (sea o no vendedor/diseñador) siempre aparezca como removible; no cambia a quién se puede
  // agregar de nuevo (eso lo sigue acotando `teamVendors`, sin tocar).
  const assignableUsers = useMemo(() => {
    const base = teamVendors ?? []
    const knownIds = new Set(base.map(u => u.id))
    const currentAssignees = (card?.assignees ?? []).filter(a => !knownIds.has(a.id))

    return [...base, ...currentAssignees]
  }, [teamVendors, card?.assignees])

  // SCRUM-909 — solo tiene sentido con Entrega Parcial. Se consulta acá (no solo dentro del
  // modal de asignación) para poder gatear "Mover a Aprobado" (criterio 4) sin depender de que
  // el usuario haya abierto el modal en esta sesión.
  const [showProductAssignmentModal, setShowProductAssignmentModal] = useState(false)
  // SCRUM-1115 — diálogo "Crear cotización": partir de la última cotización confirmada o en blanco.
  const [showQuoteBaseDialog, setShowQuoteBaseDialog] = useState(false)
  const [quoteBaseError, setQuoteBaseError] = useState<string | null>(null)
  // SCRUM-1027 — borrador de asignaciones hecho dentro de la edición (null = sin tocar). Se envía
  // en el mismo PUT que las fechas y se descarta al cancelar o guardar.
  const [productDraft, setProductDraft] = useState<PipelineCardProductDeliveryAssignmentPayload[] | null>(null)
  const { data: productDeliveryRows } = useQuery({
    queryKey: ['ventas-diseno-pipeline-card-product-delivery-assignments', cardId],
    queryFn:  () => ventasDisenoApi.pipeline.productDeliveryAssignments.list(cardId),
    // SCRUM-1128 — el endpoint exige `ventas_diseno.read`; Contabilidad (solo `pipeline.read_all`, sin `.read`)
    // recibiría 403. Se excluye solo ese caso: superadmin llega con `superadmin.all`, no con `.read`.
    enabled:  card?.delivery_type === 'partial' && !readsPipelineReadOnly,
  })
  const hasUnassignedProductDelivery = card?.delivery_type === 'partial'
    && (productDeliveryRows ?? []).some(p => !p.assigned_delivery_date)

  const [name,           setName]           = useState('')
  const [tag,            setTag]            = useState('')
  const [workedAreaM2,   setWorkedAreaM2]   = useState('')
  const [deliveryType,   setDeliveryType]   = useState('')
  const [deliveryDates,  setDeliveryDates]  = useState<string[]>([])
  const [observations,   setObservations]   = useState('')
  const [masterClient,   setMasterClient]   = useState<{ id: number; label: string } | null>(null)
  const [subClient,      setSubClient]      = useState<{ id: number; label: string } | null>(null)
  const [assigneeIds,    setAssigneeIds]    = useState<number[]>([])

  // Contacto nuevo
  const [contactName,  setContactName]  = useState('')
  const [contactRole,  setContactRole]  = useState<ContactRole>('client')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  // Edicion de contacto existente — SCRUM-90, mismo patron que ClientDetailModal.
  const [editingContactId, setEditingContactId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState({ name: '', role: 'client' as ContactRole, phone: '', email: '' })

  // SCRUM-78 — hallazgo de Gerencia Test en validación (2026-07-21): el formulario quedaba
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

  const dialogOpenRef = useRef(false)
  const closePassToOrderDialogRef = useRef<(() => void) | null>(null)

  // SCRUM-76 — Escape cierra el modal, igual que el botón "Cerrar"/la X.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // SCRUM-1128 — con un diálogo de "Pasar a Pedido" abierto, Escape no debe cerrar el modal
      // entero (se perdería la pregunta del abono).
      if (e.key === 'Escape' && !dialogOpenRef.current) onClose()
      // Escape sobre la confirmación de "Pasar a Pedido" equivale a Cancelar (no mientras envía).
      else if (e.key === 'Escape' && closePassToOrderDialogRef.current) closePassToOrderDialogRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // SCRUM-829 — este efecto reseedea el form en cada refetch de la query (upload de archivo,
  // agregar/editar/quitar contacto y cambio de etapa invalidan la misma queryKey). Si el usuario
  // está editando, un refetch de fondo no debe pisar cambios sin guardar; el guard de abajo evita
  // ese revert sin afectar el reseed normal (carga inicial / vista no editando).
  useEffect(() => {
    if (!card) return
    if (isEditing) return
    setName(card.sales_project.name)
    setTag(card.sales_project.tag ?? '')
    setWorkedAreaM2(card.worked_area_m2 != null ? String(card.worked_area_m2) : '')
    setDeliveryType(card.delivery_type ?? '')
    setDeliveryDates(card.delivery_dates)
    setObservations(card.observations ?? '')
    setMasterClient(card.master_client ? { id: card.master_client.id, label: card.master_client.name } : null)
    setSubClient(card.sub_client ? { id: card.sub_client.id, label: card.sub_client.business_name } : null)
    setAssigneeIds(card.assignees.map(a => a.id))
  }, [card, isEditing])

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
    setAssigneeIds(card.assignees.map(a => a.id))
    setSaveError(null)
    setProductDraft(null)
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
      // SCRUM-1027 — solo asignaciones cuya fecha sigue en el borrador de fechas (si el usuario
      // quitó una fecha después de asignarla, esa entrada ya no aplica y el backend la rechazaría).
      ...(productDraft !== null && deliveryType === 'partial'
        ? { product_deliveries: productDraft.filter(d => d.delivery_date === null || deliveryDates.includes(d.delivery_date)) }
        : {}),
      // SCRUM-849.4 — Gerencia-only; el backend lo ignora en silencio para cualquier otro rol,
      // pero no vale la pena mandarlo si ni siquiera se muestra el control para editarlo.
      ...(canSeeTeam ? { assignee_ids: assigneeIds } : {}),
    }),
    onSuccess: () => {
      setSaveError(null)
      setIsEditing(false)
      setProductDraft(null)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card-product-delivery-assignments', cardId] })
      qc.removeQueries({ queryKey: ['ventas-diseno-pipeline-card-product-delivery-assignments-draft', cardId] })
      // SCRUM-677 — guardar puede ser justo la acción que resuelve el dato que
      // faltaba para el gate de avance de etapa (ej. Cliente Master, superficie
      // trabajada). stageError/quoteGateError quedaban pegados en pantalla
      // porque solo se limpiaban en el onSuccess de SU PROPIA mutación — nunca
      // al completar el dato por otra vía. Ver reporte de Gerencia Test
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

  // SCRUM-1128 — "Pasar a Pedido": el estado Aprobado de Pipeline ya no genera el pedido de Bodega;
  // lo genera esta acción explícita, solo para quien tiene el permiso (Gerencia y Contabilidad). El backend
  // vuelve a validar permiso e idempotencia — esto solo decide qué se muestra.
  const canPassToOrder = user?.permissions?.includes('ventas_diseno.pass_to_order') ?? false
  const [showPassToOrderDialog, setShowPassToOrderDialog] = useState(false)
  dialogOpenRef.current = showPassToOrderDialog
  const [passToOrderError, setPassToOrderError] = useState<string | null>(null)
  // Candado síncrono: `isPending` de la mutation se actualiza con un render de retraso y dos clics
  // seguidos alcanzarían a disparar dos requests (el backend igual es idempotente).
  const passToOrderInFlight = useRef(false)
  const passToOrderMutation = useMutation({
    mutationFn: () => ventasDisenoApi.pipeline.passToOrder(cardId),
    onSuccess: () => {
      setPassToOrderError(null)
      setShowPassToOrderDialog(false)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card', cardId] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline'] })
    },
    onError: (err: unknown) => {
      passToOrderInFlight.current = false
      const status = isAxiosError(err) ? err.response?.status : undefined
      if (status === 409) {
        // Ya había pasado a pedido (otro usuario, otra pestaña o un clic previo): no es un error,
        // se refresca con el estado actual y no se vuelve a preguntar por el abono.
        const current = isAxiosError<{ data?: PipelineCardDetail }>(err) ? err.response?.data.data : undefined
        if (current) qc.setQueryData(['ventas-diseno-pipeline-card', cardId], current)
        setPassToOrderError(null)
        setShowPassToOrderDialog(false)
        qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card', cardId] })
        qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline'] })
        return
      }
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      const fallback = status === 403 ? t('ventasDiseno:modal.passToOrder.errorForbidden')
        : status === 422 ? t('ventasDiseno:modal.passToOrder.errorNotApproved')
        : t('ventasDiseno:modal.passToOrder.error')
      setPassToOrderError(message ?? fallback)
    },
  })
  // Fase 16 (5.3) — quien no puede ejecutar el pase (el vendedor) pide que Gerencia lo haga, con una nota opcional.
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestNote, setRequestNote] = useState('')
  const [requestError, setRequestError] = useState<string | null>(null)
  const requestPassToOrderMutation = useMutation({
    mutationFn: () => ventasDisenoApi.pipeline.requestPassToOrder(cardId, requestNote.trim() || undefined),
    onSuccess: () => {
      setRequestError(null)
      setShowRequestForm(false)
      setRequestNote('')
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card', cardId] })
    },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setRequestError(message ?? t('ventasDiseno:modal.passToOrder.requestError'))
    },
  })
  closePassToOrderDialogRef.current = showPassToOrderDialog && !passToOrderMutation.isPending
    ? () => { setPassToOrderError(null); setShowPassToOrderDialog(false) }
    : null

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
      const nextStage = pipelineStages.next(card?.stage)
      if (type === 'signed_quote' && card?.stage === 'quote' && nextStage) {
        changeStageMutation.mutate(nextStage)
      } else if (type === 'approval_proof' && nextStage === 'approved') {
        // SCRUM-909 (criterio 4) — defensa en profundidad en frontend: si el proyecto es
        // Entrega Parcial y falta asignar fecha a algún producto, ni siquiera se intenta el
        // auto-avance (el backend igual lo rechazaría, pero evita el roundtrip fallido y deja
        // el mismo mensaje que el botón manual de abajo).
        if (hasUnassignedProductDelivery) {
          setStageError(t('ventasDiseno:modal.deliveryAssignmentIncomplete'))
        } else {
          changeStageMutation.mutate('approved')
        }
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

  const [removingFileId, setRemovingFileId] = useState<number | null>(null)
  async function handleRemoveFile(file: PipelineCardFile) {
    if (!confirm(t('ventasDiseno:modal.confirmRemoveFile'))) return
    setRemovingFileId(file.id)
    setUploadFileError(null)
    try {
      await ventasDisenoApi.pipeline.deleteFile(cardId, file.id)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline-card', cardId] })
    } catch (err) {
      // Mismo patrón que la subida: si el servidor explica el motivo (p. ej. un proyecto Aprobado no permite quitar
      // archivos de diseño, propuesta, cotización firmada ni comprobante de aprobación) se muestra ese motivo.
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setUploadFileError(message ?? t('ventasDiseno:modal.removeFileError'))
    } finally {
      setRemovingFileId(null)
    }
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
    (q: string, taxId: string, _extra2: string, taxIdDv: string) => masterClient
      ? ventasDisenoApi.subClients.create(masterClient.id, q, taxId, taxIdDv).then(c => ({ id: c.id, label: c.business_name }))
      : Promise.reject(new Error('no master client')),
    [masterClient],
  )

  const stage = card ? pipelineStages.info(card.stage) : undefined
  // SCRUM-1128 — el acceso de solo lectura del Pipeline nunca ve controles de escritura, aunque el payload
  // diga can_edit=true: el backend ya le responde 403 en cualquier escritura. SCRUM-1139 — con
  // `pipeline.edit` deja de ser solo lectura y manda `can_edit` del payload, como para cualquier editor.
  const canEdit = (card?.can_edit ?? false) && !readsPipelineReadOnly

  // SCRUM-909 (criterio 4) — la única transición del flujo que aterriza en 'approved' es la de la etapa anterior a Aprobado
  // (Propuesta, o la última etapa propia que se intercale); bloquear "Mover a Aprobado" (botón genérico o auto-avance por archivo)
  // cuando el proyecto es Entrega Parcial y algún producto sigue sin fecha asignada. Defensa en
  // profundidad — el backend valida lo mismo, esto solo evita el roundtrip fallido y da el
  // mensaje antes del clic.
  const nextStageForCard = card ? pipelineStages.next(card.stage) : null
  const deliveryAssignmentBlocksApproval = nextStageForCard === 'approved' && hasUnassignedProductDelivery

  // SCRUM-1115 — un proyecto restaurado desde Perdido vuelve a Lead/Diseño con su historial de cotizaciones: ofrecer partir de la
  // última confirmada (nueva versión, precarga partidas/ítems/precios) en vez de obligar a empezar en blanco. Sin historial no
  // cambia nada. Los gates de abajo (contacto/cliente en Lead, superficie/archivo en Diseño) ya pasaron cuando se llega acá.
  function proceedToCreateQuote() {
    if (!card) return
    if (card.latest_quote_id != null) {
      setQuoteBaseError(null)
      setShowQuoteBaseDialog(true)
      return
    }
    navigate(`/ventas-diseno/quotes?fromPipelineCard=${card.id}`)
  }

  const quoteFromBaseMutation = useMutation({
    mutationFn: (quoteId: number) => ventasDisenoApi.quotes.duplicate(quoteId),
    onSuccess: (draft) => {
      qc.invalidateQueries({ queryKey: ['ventas-diseno-quotes-list'] })
      setShowQuoteBaseDialog(false)
      navigate(`/ventas-diseno/quotes/${draft.id}`)
    },
    onError: (err: unknown) => {
      // 403: la cotización es de otro vendedor y quien abre la tarjeta no ve el equipo (el backend responde un texto genérico de
      // autorización): se explica y se deja "En blanco" disponible, que sí puede hacer.
      if (isAxiosError(err) && err.response?.status === 403) {
        setQuoteBaseError(t('ventasDiseno:modal.createQuoteBaseForbidden'))
        return
      }
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setQuoteBaseError(message ?? t('ventasDiseno:modal.createQuoteBaseError'))
    },
  })

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
      proceedToCreateQuote()
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
    proceedToCreateQuote()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      {showQuoteBaseDialog && card && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" data-testid="quote-base-dialog">
          <Card variant="modal" className="w-full max-w-md p-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">{t('ventasDiseno:modal.createQuoteBaseTitle')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
              {t('ventasDiseno:modal.createQuoteBaseDescription', { folio: card.latest_quote_folio ?? '' })}
            </p>
            {quoteBaseError && (
              <div role="alert" className="mb-3 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
                {quoteBaseError}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button
                variant="accent"
                disabled={quoteFromBaseMutation.isPending}
                loading={quoteFromBaseMutation.isPending}
                onClick={() => { setQuoteBaseError(null); quoteFromBaseMutation.mutate(card.latest_quote_id as number) }}
              >
                {t('ventasDiseno:modal.createQuoteFromBase', { folio: card.latest_quote_folio ?? '' })}
              </Button>
              <Button
                variant="secondary"
                disabled={quoteFromBaseMutation.isPending}
                onClick={() => { setShowQuoteBaseDialog(false); navigate(`/ventas-diseno/quotes?fromPipelineCard=${card.id}`) }}
              >
                {t('ventasDiseno:modal.createQuoteBlank')}
              </Button>
              <Button variant="secondary" disabled={quoteFromBaseMutation.isPending} onClick={() => setShowQuoteBaseDialog(false)}>
                {t('ventasDiseno:modal.createQuoteBaseCancel')}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {showPassToOrderDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" data-testid="pass-to-order-dialog">
          <Card variant="modal" className="w-full max-w-md p-5">
            <p className="text-sm text-slate-700 dark:text-slate-200 mb-4">{t('ventasDiseno:modal.passToOrder.confirmMessage')}</p>
            {passToOrderError && (
              <div role="alert" className="mb-3 px-3 py-2 rounded-lg border text-[12px] font-medium bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
                {passToOrderError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={passToOrderMutation.isPending}
                onClick={() => { setPassToOrderError(null); setShowPassToOrderDialog(false) }}
              >
                {t('common:actions.cancel')}
              </Button>
              <Button
                variant="accent"
                disabled={passToOrderMutation.isPending}
                loading={passToOrderMutation.isPending}
                onClick={() => {
                  if (passToOrderInFlight.current) return
                  passToOrderInFlight.current = true
                  passToOrderMutation.mutate()
                }}
              >
                {t('ventasDiseno:modal.passToOrder.approve')}
              </Button>
            </div>
          </Card>
        </div>
      )}
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            {stage && <span className="inline-block w-2 h-2 rounded-full" style={{ background: stage.color }} />}
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {card ? pipelineStages.label(card.stage) : t('common:labels.loading')}
            </h2>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !card ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : (
            <>
              {!canEdit && !(readsPipelineReadOnly && pipelineStages.isOpen(card.stage)) && (
                <div className="mb-4 px-3 py-2 rounded-lg border text-[12px] font-medium bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300">
                  {pipelineStages.isLost(card.stage)
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
                      dvFieldLabel={t('ventasDiseno:modal.subClientTaxIdDv')}
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
                  {/* SCRUM-849.4 — solo Gerencia puede reasignar, y solo en modo edición; para
                      cualquier otro caso, lista de solo lectura de TODOS los asignados (antes
                      solo mostraba al owner, aunque ya hubiera compartido_con). */}
                  {isEditing && canSeeTeam ? (
                    <UserMultiSelect users={assignableUsers} selectedIds={assigneeIds} onChange={setAssigneeIds} />
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">
                      {card.assignees.map(a => a.name).join(', ')}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:modal.creator')}
                  </label>
                  {/* SCRUM-884 — Creador es inmutable, siempre de solo lectura, distinto del
                      campo Responsable de arriba (que Gerencia sí puede reasignar). */}
                  <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">
                    {card.creator?.name ?? '—'}
                  </p>
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

                {pipelineStages.isAtOrAfter(card.stage, 'quote') && (
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
                        //
                        // Rebote SCRUM-817: `< 1` solo cubría la lista vacía — al volver de
                        // Parcial con 2, 3 o más fechas, la condición no disparaba y los campos
                        // adicionales quedaban pegados, rompiendo el guardado. `!== 1` colapsa
                        // siempre a exactamente 1 campo (mismo criterio ya usado en
                        // QuotePage.tsx:926).
                        if (v === 'single' && deliveryDates.length !== 1) {
                          setDeliveryDates([''])
                        }
                        // SCRUM-874 — revertir a "—" (vacío) dejaba deliveryDates intacto (ej.
                        // ['', ''] recién sembrado sin completar), así que Guardar seguía
                        // mandando entradas vacías al backend (`delivery_dates.*: date` las
                        // rechaza con 422) aunque delivery_type ya fuera null — el error
                        // quedaba pegado en pantalla sin ninguna forma de resolverlo salvo
                        // Cancelar. Vaciar la lista acá deja que el próximo Guardar mande
                        // delivery_dates: [] y limpie el error en el onSuccess de saveMutation.
                        if (v === '') {
                          setDeliveryDates([])
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
                  {/* SCRUM-909 — solo con Entrega Parcial seleccionada; ver criterio 1. No
                      gateado por isEditing: es una acción propia (abre su propio modal),
                      no un campo de este formulario. SCRUM-1128 — oculto para el acceso de solo
                      lectura del Pipeline (Contabilidad): el modal pide asignaciones que exigen
                      ventas_diseno.read y mostraba 2×403 con un texto engañoso. */}
                  {deliveryType === 'partial' && !readsPipelineReadOnly && (
                    <Button
                      variant="secondary"
                      onClick={() => setShowProductAssignmentModal(true)}
                      className="!mt-1.5"
                    >
                      {t('ventasDiseno:modal.assignProductsToDelivery')}
                    </Button>
                  )}
                  {/* SCRUM-909 (criterio 4) — aviso proactivo, no solo al intentar Aprobar. */}
                  {hasUnassignedProductDelivery && (
                    <p className="mt-1.5 text-[11px] font-semibold text-amber-600">
                      {t('ventasDiseno:modal.deliveryAssignmentIncomplete')}
                    </p>
                  )}
                </div>
                )}
              </div>

              {/* SCRUM-78 originalmente restringía estos inputs a Propuesta/Aprobado. SCRUM-874
                  (Gerencia Test) reportó que en Lead/Diseño/Cotización el selector de Tipo de
                  entrega sigue exigiendo la fecha al guardar (delivery_dates.*: date en
                  UpdatePipelineCardRequest, sin gate de etapa en el backend) pero el input para
                  cargarla nunca aparecía — callejón sin salida real, igual que el bug de
                  QuotePage/2026-07-11 arriba. El criterio de negocio pasaba a ser el mismo en las
                  5 etapas. SCRUM-909 lo vuelve a acotar a DELIVERY_DATE_STAGES (ver ese
                  docblock) — ya no hay callejón sin salida porque Cotización ahora sí guarda. */}
              {pipelineStages.isAtOrAfter(card.stage, 'quote') && deliveryType && (
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
                                  {canEdit && isEditing && (
                                    <button
                                      type="button"
                                      onClick={() => { void handleRemoveFile(f) }}
                                      disabled={removingFileId === f.id}
                                      className="shrink-0 text-slate-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50"
                                      title={t('ventasDiseno:modal.removeFile')}
                                    >
                                      <IcoTrash size={13} />
                                    </button>
                                  )}
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
                          (type === 'design' || type === 'proposal') && pipelineStages.isWon(card.stage)
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
            {card?.latest_quote_id != null && !readsPipelineOnly && (
              <Button
                variant="secondary"
                onClick={() => navigate(`/ventas-diseno/quotes-list?viewQuote=${card.latest_quote_id}`)}
              >
                {t('ventasDiseno:modal.viewProjectQuotes')}
              </Button>
            )}
            {/* SCRUM-1128 — `can_edit` es false en Perdido para todos los roles, así que no sirve
                de gate: Reactivar se oculta explícitamente al acceso de solo lectura (Contabilidad). */}
            {pipelineStages.isLost(card?.stage) && !readsPipelineReadOnly && (
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
                de editar Aprobado, ej. Gerencia). */}
            {card && canEdit && pipelineStages.isOpen(card.stage) && (
              <>
                {/* RN5 (SCRUM-677/680): nunca un botón genérico de movimiento hacia Cotización —
                    la única vía a esa etapa es "Crear cotización" (abajo), generando una
                    cotización real. Hoy el único salto que apunta a 'quote' en STAGE_FLOW es
                    design->quote; excluirlo por destino (no por etapa origen) para que la regla
                    se sostenga sola si el flujo cambia más adelante. */}
                {nextStageForCard && nextStageForCard !== 'quote' && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      // SCRUM-909 (criterio 4) — ver docblock de deliveryAssignmentBlocksApproval.
                      if (deliveryAssignmentBlocksApproval) {
                        setStageError(t('ventasDiseno:modal.deliveryAssignmentIncomplete'))
                        return
                      }
                      changeStageMutation.mutate(nextStageForCard)
                    }}
                    disabled={changeStageMutation.isPending || deliveryAssignmentBlocksApproval}
                    loading={changeStageMutation.isPending}
                  >
                    {t('ventasDiseno:modal.moveToNext', {
                      stage: pipelineStages.label(nextStageForCard),
                    })}
                  </Button>
                )}
                {/* REQ-050: precarga la cotización nueva con Cliente Master/Subcliente/
                    RUC/Proyecto/primer contacto de esta tarjeta — solo tiene sentido
                    antes de que la tarjeta ya esté en Cotización o más adelante. */}
                {pipelineStages.isBefore(card.stage, 'quote') && !readsPipelineOnly && (
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
              <>
                {/* SCRUM-1128 — a la izquierda de "Cerrar": botón (pendiente) o quién/cuándo (ya pasado). */}
                {pipelineStages.isWon(card?.stage) && card?.order_status === 'pending' && card.can_pass_to_order === true && canPassToOrder && (
                  <Button
                    variant="accent"
                    onClick={() => { setPassToOrderError(null); setShowPassToOrderDialog(true) }}
                  >
                    {t('ventasDiseno:modal.passToOrder.button')}
                  </Button>
                )}
                {pipelineStages.isWon(card?.stage) && card?.order_status === 'pending' && card.can_request_pass_to_order === true && !showRequestForm && (
                  <Button variant="accent" onClick={() => { setRequestError(null); setShowRequestForm(true) }} data-testid="request-pass-to-order-btn">
                    {t('ventasDiseno:modal.passToOrder.requestButton')}
                  </Button>
                )}
                {showRequestForm && (
                  <div className="flex items-center gap-2" data-testid="request-pass-to-order-form">
                    <input
                      type="text"
                      value={requestNote}
                      maxLength={500}
                      onChange={e => setRequestNote(e.target.value)}
                      placeholder={t('ventasDiseno:modal.passToOrder.requestNotePlaceholder')}
                      className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                      data-testid="request-pass-to-order-note"
                    />
                    <Button onClick={() => requestPassToOrderMutation.mutate()} disabled={requestPassToOrderMutation.isPending} loading={requestPassToOrderMutation.isPending} data-testid="request-pass-to-order-send">
                      {t('ventasDiseno:modal.passToOrder.requestSend')}
                    </Button>
                    <Button variant="secondary" onClick={() => setShowRequestForm(false)} disabled={requestPassToOrderMutation.isPending}>
                      {t('common:actions.cancel')}
                    </Button>
                  </div>
                )}
                {requestError && <p className="text-[12px] text-red-600 self-center" role="alert">{requestError}</p>}
                {card?.order_status === 'pending' && card.order_request && (
                  <div className="text-[12px] text-slate-600 dark:text-slate-300 leading-tight self-center" data-testid="pass-to-order-request-info">
                    <p>{t('ventasDiseno:modal.passToOrder.requestPending', { name: card.order_request.requested_by?.name ?? '—', date: formatDateTimeShort(card.order_request.requested_at) })}</p>
                    {card.order_request.note && <p className="italic">{card.order_request.note}</p>}
                  </div>
                )}
                {pipelineStages.isWon(card?.stage) && card?.order_status === 'approved' && card.order_approved_by && (
                  <div className="text-[12px] text-slate-600 dark:text-slate-300 leading-tight self-center" data-testid="pass-to-order-info">
                    <p>
                      <span className="font-semibold">{t('ventasDiseno:modal.passToOrder.passedBy')}:</span> {card.order_approved_by.name}
                    </p>
                    {card.order_approved_at && (
                      <p>
                        <span className="font-semibold">{t('ventasDiseno:modal.passToOrder.approvedAt')}:</span> {formatDateTimeShort(card.order_approved_at)}
                      </p>
                    )}
                  </div>
                )}
                <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
              </>
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
      {showProductAssignmentModal && card && (
        <ProductDeliveryAssignmentModal
          cardId={cardId}
          // SCRUM-909 (rebote 2026-09-14) — en modo edición, `card.delivery_dates` sigue siendo
          // el valor YA GUARDADO en el servidor (el efecto de arriba que resincroniza `deliveryDates`
          // desde `card` se desactiva a propósito mientras isEditing, ver su docblock) — si el
          // usuario acaba de definir fechas parciales sin guardar todavía, este modal recibía la
          // lista vieja (vacía la primera vez), por eso el selector de fecha no mostraba nada
          // hasta guardar y reabrir. Usa el estado local (el borrador sin guardar) mientras se
          // edita, y el valor del servidor el resto del tiempo.
          deliveryDates={isEditing ? deliveryDates : card.delivery_dates}
          canEdit={canEdit}
          onClose={() => setShowProductAssignmentModal(false)}
          // SCRUM-1027 — en edición no se llama a la API (las fechas del borrador no existen en
          // BD todavía): la selección vuelve acá y viaja con el guardado del proyecto.
          {...(isEditing ? { onSaveDraft: setProductDraft, initialDraft: productDraft } : {})}
        />
      )}
    </div>
  )
}
