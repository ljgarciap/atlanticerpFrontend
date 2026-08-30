import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import type {
  TicketType, TicketSubtype, TicketInstallationKind, RequirementsPayload,
  MasterClientOption, SubClientOption, ProjectOption, ProductOption, TicketProductInput,
} from '@/types/servicios'
import { TICKET_TYPES } from '@/types/servicios'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoSearch, IcoPaperclip } from '@/components/icons'
import RequirementsChecklist from './RequirementsChecklist'
import ServiciosSearchPickerModal from './ServiciosSearchPickerModal'
import { useToastStore } from '@/store/toastStore'

// REQ-248 RN2 — valores por defecto configurables server-side (ServiciosSettingsService); acá solo
// para fallar rápido client-side antes de gastar un request, el backend sigue siendo la autoridad.
const MAX_ATTACHMENTS = 10
const MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024
const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'mp4', 'mov', 'avi', 'webm', 'pdf', 'doc', 'docx',
]

interface DraftAttachment {
  key:  string
  file: File
}

// REQ-279 RN4 — solo installation/warranty manejan subtipo (mismo mapeo que
// `Ticket::SUBTIPOS_BY_TIPO`, ver también TicketDetailModal).
const SUBTYPES_BY_TIPO: Partial<Record<TicketType, TicketSubtype[]>> = {
  installation: ['installation', 'inspection'],
  warranty:     ['warranty_generic', 'replacement_inspection'],
}

const EMPTY_REQUIREMENTS: RequirementsPayload = { catalog: [], otros: [] }

interface DraftProduct extends TicketProductInput {
  key:       string // React key estable (catalog_product_id ya es único, pero explícito)
  reference: string
  // SCRUM-781 (REQ-247, punto 4.1) — nombre real del catálogo, no `description` (vacío en datos
  // post-migración ICG, mismo bug ya corregido en InsumoCreateModal.tsx para SCRUM-779).
  nombre:    string
}

interface Props {
  onClose:  () => void
  onCreated: (ticketId: number) => void
}

type SearchPicker = 'master' | 'sub' | 'producto' | null

// REQ-245/246/247/249 — formulario completo de "Nuevo ticket". RN4 (REQ-246) — Servicios nunca
// crea Cliente Master/Subcliente/Proyecto, solo busca/selecciona lo que ya existe en Ventas &
// Diseño (`ServiciosSearchPickerModal` + `serviciosApi.lookup`).
export default function TicketCreateModal({ onClose, onCreated }: Props) {
  const { t }  = useTranslation('servicios')
  const qc     = useQueryClient()
  const toast  = useToastStore(s => s.show)

  const [tipo, setTipo]                       = useState<TicketType>('installation')
  const [subtipo, setSubtipo]                 = useState<TicketSubtype>('installation')
  const [tipoInstalacion, setTipoInstalacion] = useState<Exclude<TicketInstallationKind, null>>('internal')
  const [descripcion, setDescripcion]         = useState('')
  const [contacto, setContacto]               = useState('')
  const [telefono, setTelefono]               = useState('')
  const [email, setEmail]                     = useState('')
  const [direccion, setDireccion]             = useState('')
  const [requerimientos, setRequerimientos]   = useState<RequirementsPayload>(EMPTY_REQUIREMENTS)
  const [productos, setProductos]             = useState<DraftProduct[]>([])
  const [observaciones, setObservaciones]     = useState('')
  const [attachments, setAttachments]         = useState<DraftAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [masterClient, setMasterClient] = useState<MasterClientOption | null>(null)
  const [subClient, setSubClient]       = useState<SubClientOption | null>(null)
  const [project, setProject]           = useState<ProjectOption | null>(null)
  const [projectOptions, setProjectOptions] = useState<ProjectOption[] | null>(null)

  const [activePicker, setActivePicker] = useState<SearchPicker>(null)

  function onTipoChange(next: TicketType) {
    setTipo(next)
    setSubtipo(SUBTYPES_BY_TIPO[next]?.[0] ?? null)
  }

  function pickMaster(item: MasterClientOption) {
    setMasterClient(item)
    setSubClient(null)
    setProject(null)
    setProjectOptions(null)
    setActivePicker(null)
  }

  function pickSubClient(item: SubClientOption) {
    setSubClient(item)
    setProject(null)
    setActivePicker(null)
    serviciosApi.lookup.projects(item.id).then(setProjectOptions).catch(() => setProjectOptions([]))
  }

  function pickProduct(item: ProductOption) {
    setProductos(list => [
      ...list,
      { key: String(item.id), catalog_product_id: item.id, cantidad_reclamo: 1, reference: item.reference, nombre: item.name },
    ])
    setActivePicker(null)
  }

  function updateCantidad(key: string, cantidad: number) {
    setProductos(list => list.map(p => (p.key === key ? { ...p, cantidad_reclamo: Math.max(1, cantidad) } : p)))
  }

  function removeProduct(key: string) {
    setProductos(list => list.filter(p => p.key !== key))
  }

  // REQ-248 RN2 — validación client-side (fail-fast), el backend re-valida igual.
  function addAttachments(files: FileList | null) {
    if (!files || files.length === 0) return
    setAttachmentError(null)

    const next = [...attachments]
    for (const file of Array.from(files)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setAttachmentError(t('tickets.create.attachments.maxFilesError', { max: MAX_ATTACHMENTS }))
        break
      }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ACCEPTED_ATTACHMENT_EXTENSIONS.includes(ext)) {
        setAttachmentError(t('tickets.create.attachments.extensionError'))
        continue
      }
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        setAttachmentError(t('tickets.create.attachments.sizeError', { max: 15 }))
        continue
      }
      next.push({ key: `${file.name}-${file.size}-${file.lastModified}`, file })
    }
    setAttachments(next)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(key: string) {
    setAttachments(list => list.filter(a => a.key !== key))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const ticket = await serviciosApi.tickets.create({
        tipo, subtipo, tipo_instalacion: tipoInstalacion, descripcion: descripcion.trim(),
        sales_project_id: project!.id,
        contacto: contacto.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        direccion: direccion.trim() || null,
        requerimientos_especiales: requerimientos,
        observaciones: observaciones.trim() || null,
        productos: productos.map(({ catalog_product_id, cantidad_reclamo }) => ({ catalog_product_id, cantidad_reclamo })),
      })

      // Escenario 1 (REQ-248) — los adjuntos se suben DESPUÉS de crear (necesitan el id real),
      // pero dentro del mismo flujo de creación, antes de que el usuario vea el ticket creado.
      // Secuencial (no Promise.all): si uno falla por una validación server-side que el
      // chequeo client-side no atrapó (ej. límite ya alcanzado por otra pestaña), no queremos
      // perder el orden ni disparar N requests fallidos en paralelo.
      for (const { file } of attachments) {
        try {
          await serviciosApi.tickets.uploadAttachment(ticket.id, file)
        } catch (err) {
          const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
          toast(msg ?? t('tickets.create.attachments.uploadError', { name: file.name }), 'error')
        }
      }

      return ticket
    },
    onSuccess: (ticket) => {
      void qc.invalidateQueries({ queryKey: ['servicios-tickets'] })
      void qc.invalidateQueries({ queryKey: ['servicios-tickets-stats'] })
      onCreated(ticket.id)
    },
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tickets.create.error'), 'error')
    },
  })

  const subtypeOptions = SUBTYPES_BY_TIPO[tipo] ?? []
  const excludedProductIds = productos.map(p => p.catalog_product_id)
  const canSave = descripcion.trim() !== '' && project !== null && !mutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('tickets.create.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('tickets.detail.fields.tipo')}>
              <select
                value={tipo}
                onChange={e => onTipoChange(e.target.value as TicketType)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
              >
                {TICKET_TYPES.map(tp => <option key={tp} value={tp}>{t(`tickets.types.${tp}`)}</option>)}
              </select>
            </Field>

            {subtypeOptions.length > 0 && (
              <Field label={t('tickets.detail.fields.subtipo')}>
                <select
                  value={subtipo ?? ''}
                  onChange={e => setSubtipo(e.target.value as TicketSubtype)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
                >
                  {subtypeOptions.map(st => (
                    <option key={st ?? ''} value={st ?? ''}>{t(`tickets.subtypes.${st}`)}</option>
                  ))}
                </select>
              </Field>
            )}

            <Field label={t('tickets.detail.fields.tipoInstalacion')}>
              <select
                value={tipoInstalacion}
                onChange={e => setTipoInstalacion(e.target.value as Exclude<TicketInstallationKind, null>)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
              >
                <option value="internal">{t('tickets.detail.tipoInstalacionValues.internal')}</option>
                <option value="subcontracted">{t('tickets.detail.tipoInstalacionValues.subcontracted')}</option>
              </select>
            </Field>

            <Field label={t('tickets.create.descripcion')}>
              <input
                type="text"
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                placeholder={t('tickets.create.descripcionPlaceholder')}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
              />
            </Field>
          </div>

          <SectionLabel>{t('tickets.create.clienteSection')}</SectionLabel>
          <div className="flex flex-col gap-2">
            <PickerField
              label={t('tickets.create.clienteMaster')}
              value={masterClient?.name ?? null}
              onSearch={() => setActivePicker('master')}
            />
            {masterClient && (
              <PickerField
                label={t('tickets.detail.fields.subcliente')}
                value={subClient?.business_name ?? null}
                onSearch={() => setActivePicker('sub')}
              />
            )}
            {subClient && (
              <Field label={t('tickets.detail.fields.proyecto')}>
                <select
                  value={project?.id ?? ''}
                  onChange={e => setProject(projectOptions?.find(p => p.id === Number(e.target.value)) ?? null)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
                >
                  <option value="">{t('tickets.create.proyectoPlaceholder')}</option>
                  {(projectOptions ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {projectOptions !== null && projectOptions.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">{t('tickets.create.sinProyectos')}</p>
                )}
              </Field>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('tickets.create.contactoNombre')}>
              <input type="text" value={contacto} onChange={e => setContacto(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm" />
            </Field>
            <Field label={t('tickets.create.contactoTelefono')}>
              <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+507 6000-0000"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm" />
            </Field>
            <Field label={t('tickets.detail.fields.email')}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm" />
            </Field>
            <Field label={t('tickets.detail.fields.direccion')}>
              <input type="text" value={direccion} onChange={e => setDireccion(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm" />
            </Field>
          </div>

          <SectionLabel>{t('tickets.detail.fields.requerimientos')}</SectionLabel>
          <RequirementsChecklist value={requerimientos} onChange={setRequerimientos} />

          <SectionLabel>{t('tickets.create.productosSection')}</SectionLabel>
          <div className="flex flex-col gap-2">
            {productos.map(p => (
              <div key={p.key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/40">
                <div className="flex-1 text-[12.5px] text-slate-700 dark:text-slate-200">
                  <strong>{p.reference}</strong> — {p.nombre}
                </div>
                <div className="w-24">
                  <label className="block text-[10px] text-slate-400 mb-0.5">{t('tickets.create.cantidadReclamada')}</label>
                  <input
                    type="number" min={1} value={p.cantidad_reclamo}
                    onChange={e => updateCantidad(p.key, parseInt(e.target.value, 10) || 1)}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1 text-xs"
                  />
                </div>
                <button type="button" onClick={() => removeProduct(p.key)} aria-label={t('tickets.create.quitarProducto')}
                  className="text-slate-400 hover:text-red-600">
                  <IcoClose size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setActivePicker('producto')}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline self-start"
            >
              <IcoSearch size={12} />
              {t('tickets.create.buscarProducto')}
            </button>
          </div>

          <Field label={t('tickets.detail.fields.observaciones')}>
            <textarea
              rows={2}
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
            />
          </Field>

          <SectionLabel>{t('tickets.detail.fields.adjuntos')}</SectionLabel>
          <div className="flex flex-col gap-2">
            {attachments.map(a => (
              <div key={a.key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/40">
                <IcoPaperclip size={14} className="text-slate-400 shrink-0" />
                <div className="flex-1 text-[12.5px] text-slate-700 dark:text-slate-200 truncate">{a.file.name}</div>
                <button type="button" onClick={() => removeAttachment(a.key)} aria-label={t('tickets.create.attachments.remove')}
                  className="text-slate-400 hover:text-red-600 shrink-0">
                  <IcoClose size={12} />
                </button>
              </div>
            ))}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => addAttachments(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline self-start"
            >
              <IcoPaperclip size={12} />
              {t('tickets.create.attachments.add')}
            </button>
            {attachmentError && <p className="text-red-600 text-[11.5px]">{attachmentError}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('tickets.detail.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSave} loading={mutation.isPending}>
            {t('tickets.create.submit')}
          </Button>
        </div>
      </Card>

      {activePicker === 'master' && (
        <ServiciosSearchPickerModal<MasterClientOption>
          title={t('tickets.create.searchMasterTitle')}
          queryKey={['servicios-lookup-master-clients']}
          fetchResults={search => serviciosApi.lookup.masterClients(search)}
          itemKey={item => item.id}
          renderItem={item => item.name}
          emptyMessage={t('tickets.create.searchMasterEmpty')}
          onSelect={pickMaster}
          onClose={() => setActivePicker(null)}
        />
      )}

      {activePicker === 'sub' && masterClient && (
        <ServiciosSearchPickerModal<SubClientOption>
          title={t('tickets.create.searchSubTitle')}
          queryKey={['servicios-lookup-sub-clients', masterClient.id]}
          fetchResults={search => serviciosApi.lookup.subClients(masterClient.id, search)}
          itemKey={item => item.id}
          renderItem={item => item.business_name}
          emptyMessage={t('tickets.create.searchSubEmpty')}
          onSelect={pickSubClient}
          onClose={() => setActivePicker(null)}
        />
      )}

      {activePicker === 'producto' && (
        <ServiciosSearchPickerModal<ProductOption>
          title={t('tickets.create.searchProductTitle')}
          queryKey={['servicios-lookup-products', excludedProductIds.join(','), project?.id]}
          fetchResults={search => serviciosApi.lookup.products(search, excludedProductIds, project?.id)}
          itemKey={item => item.id}
          renderItem={item => `${item.reference} — ${item.name}`}
          emptyMessage={project ? t('tickets.create.searchProductEmptyByProject') : t('tickets.create.searchProductEmpty')}
          onSelect={pickProduct}
          onClose={() => setActivePicker(null)}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 -mb-1">{children}</p>
}

function PickerField({ label, value, onSearch }: { label: string; value: string | null; onSearch: () => void }) {
  const { t } = useTranslation('servicios')
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
          {value ?? <span className="text-slate-400">{t('tickets.create.sinSeleccionar')}</span>}
        </div>
        <Button variant="secondary" onClick={onSearch} aria-label={label}>
          <IcoSearch size={14} />
        </Button>
      </div>
    </Field>
  )
}
