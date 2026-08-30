import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Project, Etapa, TipoSolicitud, TipoActividad } from '@/types/project'
import { STAGES, ACTIVITY_META, AREA_OPTS } from '@/types/project'
import { projectsApi } from '@/api/projectsApi'
import { autocompleteApi } from '@/api/autocompleteApi'
import { usePermission } from '@/hooks/usePermission'
import ActivityTimeline from './ActivityTimeline'
import AutocompleteInput from './AutocompleteInput'
import ContactoAutocomplete from './ContactoAutocomplete'
import AssigneeAvatarStack from './AssigneeAvatarStack'
import AISection from './AISection'
import DocumentSection from './DocumentSection'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ICONS_BY_NAME, IcoClock, IcoClose, IcoCheck } from '@/components/icons'

interface Props {
  project: Project | null
  isNew:   boolean
  onClose: () => void
  onSaved: (created?: Project) => void
}

export default function ProjectModal({ project, isNew, onClose, onSaved }: Props) {
  const { t } = useTranslation(['crm', 'common'])
  const qc = useQueryClient()
  const canWrite  = usePermission('crm.write')
  const canEdit   = usePermission('crm.edit')
  const canDelete = usePermission('crm.delete')
  const canAI     = usePermission('ai.use')

  const [nombre,       setNombre]       = useState('')
  const [contacto,     setContacto]     = useState('')
  const [email,        setEmail]        = useState('')
  const [celular,      setCelular]      = useState('')
  const [encargado,    setEncargado]    = useState('')
  const [developer,    setDeveloper]    = useState('')
  const [arquitecto,   setArquitecto]   = useState('')
  const [tipo,         setTipo]         = useState<TipoSolicitud>('ambos')
  const [dialux,       setDialux]       = useState(false)
  const [despacho,     setDespacho]     = useState('')
  const [ubicacion,    setUbicacion]    = useState('')
  const [etapa,        setEtapa]        = useState<Etapa>('lead')
  const [fechaEntrega, setFechaEntrega] = useState('')
  const [valor,             setValor]             = useState('')
  const [area,              setArea]              = useState('')
  const [notas,             setNotas]             = useState('')
  const [assigneeIds,       setAssigneeIds]       = useState<number[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // New reminder form
  const [remTipo,  setRemTipo]  = useState('')
  const [remFecha, setRemFecha] = useState('')
  const [remNota,  setRemNota]  = useState('')

  useEffect(() => {
    if (isNew || !project) {
      setNombre(''); setContacto(''); setEmail(''); setCelular('')
      setEncargado(''); setDeveloper(''); setArquitecto('')
      setTipo('ambos'); setDialux(false); setDespacho(''); setUbicacion('')
      setEtapa('lead'); setFechaEntrega(''); setValor(''); setArea(''); setNotas('')
      setAssigneeIds([]); setShowDeleteConfirm(false)
    } else {
      setNombre(project.nombre)
      setContacto(project.contacto ?? '')
      setEmail(project.email ?? '')
      setCelular(project.celular ?? '')
      setEncargado(project.encargado ?? '')
      setDeveloper(project.developer ?? '')
      setArquitecto(project.arquitecto ?? '')
      setTipo(project.tipo)
      setDialux(project.dialux)
      setDespacho(project.despacho ?? '')
      setUbicacion(project.ubicacion ?? '')
      setEtapa(project.etapa)
      setFechaEntrega(project.fecha_entrega ?? '')
      setValor(project.valor != null ? String(project.valor) : '')
      setArea(project.area ?? '')
      setNotas(project.notas ?? '')
      setAssigneeIds(project.assignees.map(a => a.id))
    }
  }, [project, isNew])

  // Load full project detail (with reminders) when editing
  const { data: detail } = useQuery({
    queryKey: ['project', project?.id],
    queryFn:  () => projectsApi.get(project!.id),
    enabled:  !isNew && project != null,
  })

  // Activities fetched separately
  const { data: activitiesResp } = useQuery({
    queryKey: ['project-activities', project?.id],
    queryFn:  () => projectsApi.listActivities(project!.id),
    enabled:  !isNew && project != null,
  })
  const activities = activitiesResp?.data ?? []

  // Autocomplete user search
  const { data: userOptions = [] } = useQuery({
    queryKey: ['autocomplete-users'],
    queryFn:  () => autocompleteApi.users(''),
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        nombre, tipo, dialux, etapa,
        contacto:      contacto  || null,
        email:         email     || null,
        celular:       celular   || null,
        encargado:     encargado || null,
        developer:     developer || null,
        arquitecto:    arquitecto || null,
        despacho:      despacho  || null,
        ubicacion:     ubicacion || null,
        fecha_entrega: fechaEntrega || null,
        valor:         valor ? Number(valor) : null,
        area:          area || null,
        notas:         notas || null,
        assignee_ids:  assigneeIds,
      }
      return isNew
        ? projectsApi.create(payload)
        : projectsApi.update(project!.id, payload)
    },
    onSuccess: async (saved) => {
      if (isNew && remTipo && remFecha) {
        await projectsApi.addReminder(saved.id, {
          tipo: remTipo, fecha: remFecha, nota: remNota || null,
        })
      }
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['kpis'] })
      // Al crear, pasa el proyecto al padre para abrir en modo edición
      // (así DocumentSection queda visible de inmediato)
      onSaved(isNew ? saved : undefined)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(project!.id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['projects'] }); onSaved() },
  })

  const addReminderMutation = useMutation({
    mutationFn: () => projectsApi.addReminder(project!.id, {
      tipo: remTipo, fecha: remFecha, nota: remNota || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project?.id] })
      setRemTipo(''); setRemFecha(''); setRemNota('')
    },
  })

  const toggleReminderMutation = useMutation({
    mutationFn: (remId: number) => projectsApi.toggleReminder(project!.id, remId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['project', project?.id] }),
  })

  const deleteReminderMutation = useMutation({
    mutationFn: (remId: number) => projectsApi.deleteReminder(project!.id, remId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['project', project?.id] }),
  })

  const fetchEncargado = useCallback((q: string) => autocompleteApi.fields('encargado', q), [])
  const fetchDeveloper  = useCallback((q: string) => autocompleteApi.fields('developer', q), [])
  const fetchArquitecto = useCallback((q: string) => autocompleteApi.fields('arquitecto', q), [])
  const fetchDespacho   = useCallback((q: string) => autocompleteApi.fields('despacho', q), [])
  const fetchUbicacion  = useCallback((q: string) => autocompleteApi.fields('ubicacion', q), [])

  function toggleAssignee(id: number) {
    setAssigneeIds(ids =>
      ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    )
  }

  const reminders = detail?.reminders ?? project?.reminders ?? []

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[1000] flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-lg font-bold text-slate-900">
            {isNew ? t('crm:project.newProject') : t('crm:project.editProject')}
          </h2>
          <Button variant="icon" onClick={onClose} className="w-10 h-10 flex items-center justify-center"><IcoClose size={18} /></Button>
        </div>

        {/* Body — scrollable */}
        <div className="px-4 sm:px-6 py-5 space-y-5 flex-1 overflow-y-auto">
          {/* — Información principal — */}
          <section>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">{t('crm:modal.sectionInfo')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label-sm">{t('crm:project.nombre')}</label>
                <input className="input-field" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Torre Residencial Vista Hermosa" />
              </div>

              {/* Tipo radio */}
              <div className="col-span-2">
                <label className="label-sm">{t('crm:project.tipo')}</label>
                <div className="flex gap-4 pt-1">
                  {(['diseno','cotizacion','ambos'] as TipoSolicitud[]).map(tp => (
                    <label key={tp} className="flex items-center gap-1.5 cursor-pointer text-sm font-medium text-slate-600">
                      <input type="radio" name="tipo" checked={tipo === tp} onChange={() => setTipo(tp)} className="w-auto" />
                      {t(`crm:project.tipoRadio.${tp}`)}
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={dialux} onChange={e => setDialux(e.target.checked)} className="w-auto" />
                  {t('crm:project.dialux')}
                </label>
              </div>

              <div>
                <label className="label-sm">{t('crm:project.stage')}</label>
                <select className="input-field" value={etapa} onChange={e => setEtapa(e.target.value as Etapa)}>
                  {STAGES.map(s => <option key={s.id} value={s.id}>{t(`crm:stages.${s.id}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">{t('crm:project.fechaEntrega')}</label>
                <input className="input-field" type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} />
              </div>
              <div>
                <label className="label-sm">{t('crm:project.valor')}</label>
                <input className="input-field" type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="label-sm">{t('crm:project.area')}</label>
                <select className="input-field" value={area} onChange={e => setArea(e.target.value)}>
                  <option value="">{t('common:labels.selectOption')}</option>
                  {AREA_OPTS.map(a => <option key={a.value} value={a.value}>{t(`crm:areas.${a.key}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="label-sm">{t('crm:project.despacho')}</label>
                <AutocompleteInput value={despacho} onChange={setDespacho} fetchOptions={fetchDespacho} placeholder="Panamá, Zona Libre..." />
              </div>
              <div>
                <label className="label-sm">{t('crm:project.ubicacion')}</label>
                <AutocompleteInput value={ubicacion} onChange={setUbicacion} fetchOptions={fetchUbicacion} placeholder="Ciudad, país..." />
              </div>
            </div>
          </section>

          {/* — Contacto — */}
          <section>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">{t('crm:modal.sectionContact')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-sm">{t('crm:project.contacto')}</label>
                <ContactoAutocomplete
                  value={contacto}
                  onChange={setContacto}
                  onSelect={c => {
                    if (c.email    && !email)   setEmail(c.email)
                    if (c.telefono && !celular) setCelular(c.telefono)
                  }}
                  placeholder="Nombre del contacto principal"
                />
              </div>
              <div>
                <label className="label-sm">{t('common:labels.email')}</label>
                <input className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="label-sm">{t('crm:project.celular')}</label>
                <input className="input-field" value={celular} onChange={e => setCelular(e.target.value)} />
              </div>
              <div>
                <label className="label-sm">{t('crm:project.encargado')}</label>
                <AutocompleteInput value={encargado} onChange={setEncargado} fetchOptions={fetchEncargado} />
              </div>
              <div>
                <label className="label-sm">{t('crm:project.developer')}</label>
                <AutocompleteInput value={developer} onChange={setDeveloper} fetchOptions={fetchDeveloper} />
              </div>
              <div>
                <label className="label-sm">{t('crm:project.arquitecto')}</label>
                <AutocompleteInput value={arquitecto} onChange={setArquitecto} fetchOptions={fetchArquitecto} />
              </div>
            </div>
          </section>

          {/* — Responsables — */}
          <section>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">
              {t('crm:modal.sectionAssignees')}
              {assigneeIds.length > 0 && (
                <span className="ml-2 normal-case text-[#5BA5A0] font-bold">{assigneeIds.length} seleccionado{assigneeIds.length > 1 ? 's' : ''}</span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
              {userOptions.map(u => (
                <label
                  key={u.id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
                    assigneeIds.includes(u.id)
                      ? 'bg-[#d1ede9] text-[#1f6b66] font-semibold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-auto"
                    checked={assigneeIds.includes(u.id)}
                    onChange={() => toggleAssignee(u.id)}
                  />
                  {u.first_name} {u.last_name}
                </label>
              ))}
            </div>
            {assigneeIds.length > 0 && (
              <div className="mt-2">
                <AssigneeAvatarStack
                  assignees={userOptions.filter(u => assigneeIds.includes(u.id)).map(u => ({ id: u.id, first_name: u.first_name, last_name: u.last_name }))}
                  max={5}
                  size={24}
                />
              </div>
            )}
          </section>

          {/* — Notas — */}
          <div>
            <label className="label-sm">{t('crm:project.notas')}</label>
            <textarea className="input-field resize-none h-16" value={notas} onChange={e => setNotas(e.target.value)} />
          </div>

          {/* — Recordatorio de seguimiento — visible siempre, incluso al crear — */}
          <section className="rounded-xl border border-teal-100 dark:border-slate-700 bg-teal-50/60 dark:bg-slate-800/60 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-[#5BA5A0] mb-1 flex items-center gap-1.5">
              <IcoClock size={13} /> {t('crm:modal.sectionReminders')}
            </p>
            <p className="text-xs text-slate-500 mb-3">
              {t('crm:reminder.hint')}
            </p>

            {/* Recordatorios pendientes (solo en proyectos existentes) */}
            {!isNew && reminders.filter(r => !r.completado).length > 0 && (
              <ul className="space-y-1.5 mb-3">
                {reminders.filter(r => !r.completado).map(r => (
                  <li key={r.id} className="flex items-center gap-2 text-sm text-slate-700 bg-amber-50 rounded-lg px-3 py-2">
                    <span className="text-amber-500">
                      {(() => { const Icon = ICONS_BY_NAME[ACTIVITY_META[r.tipo as TipoActividad]?.icon] ?? IcoClock; return <Icon size={13} /> })()}
                    </span>
                    <span className="font-semibold text-xs">{r.fecha}</span>
                    <span className="flex-1 text-slate-600 text-xs">{r.nota ?? r.tipo}</span>
                    <button onClick={() => toggleReminderMutation.mutate(r.id)} className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 text-xs font-bold min-h-[36px] px-1">{t('crm:reminder.done')}</button>
                    <Button variant="danger-text" onClick={() => deleteReminderMutation.mutate(r.id)} className="!text-xs min-h-[36px] px-1"><IcoClose size={12} /></Button>
                  </li>
                ))}
              </ul>
            )}

            {/* Formulario de recordatorio */}
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="w-full sm:w-auto">
                <label className="label-sm">{t('crm:reminder.tipo')}</label>
                <select className="input-field py-2 text-sm" value={remTipo} onChange={e => setRemTipo(e.target.value)}>
                  <option value="">{t('crm:reminder.types.none')}</option>
                  <option value="llamada">{t('crm:reminder.types.llamada')}</option>
                  <option value="email">{t('crm:reminder.types.email')}</option>
                  <option value="whatsapp">{t('crm:reminder.types.whatsapp')}</option>
                  <option value="reunion">{t('crm:reminder.types.reunion')}</option>
                  <option value="visita">{t('crm:reminder.types.visita')}</option>
                  <option value="cotizacion">{t('crm:reminder.types.cotizacion')}</option>
                  <option value="diseno">{t('crm:reminder.types.diseno')}</option>
                  <option value="otro">{t('crm:reminder.types.otro')}</option>
                </select>
              </div>
              <div className="w-full sm:w-auto">
                <label className="label-sm">{t('crm:reminder.fecha')}</label>
                <input type="date" className="input-field py-2 text-sm" value={remFecha} onChange={e => setRemFecha(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="label-sm">{t('crm:reminder.nota')}</label>
                <input className="input-field py-2 text-sm" value={remNota} onChange={e => setRemNota(e.target.value)} placeholder={t('crm:reminder.notaPlaceholder')} />
              </div>
              {/* En proyectos existentes se guarda inmediatamente; en nuevos se guarda con el proyecto */}
              {!isNew && (
                <Button
                  onClick={() => (remTipo && remFecha) && addReminderMutation.mutate()}
                  disabled={!remTipo || !remFecha || addReminderMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {t('crm:reminder.new')}
                </Button>
              )}
            </div>
            {isNew && remTipo && remFecha && (
              <p className="mt-2 text-xs text-[#5BA5A0] font-medium flex items-center gap-1.5">
                <IcoCheck size={12} /> {t('crm:reminder.savedWithProject')}
              </p>
            )}
          </section>

          {/* — Actividades (solo en proyectos existentes) — */}
          {!isNew && project && (
            <ActivityTimeline
              activities={activities}
              canWrite={canWrite}
              onAdd={async (data) => {
                await projectsApi.addActivity(project.id, data as Record<string, unknown>)
                qc.invalidateQueries({ queryKey: ['project-activities', project.id] })
                qc.invalidateQueries({ queryKey: ['projects'] })
              }}
              onDelete={async (actId) => {
                await projectsApi.deleteActivity(project.id, actId)
                qc.invalidateQueries({ queryKey: ['project-activities', project.id] })
              }}
            />
          )}

          {/* — Documentos — visible siempre; placeholder griseado al crear — */}
          {!isNew && project ? (
            <DocumentSection
              projectId={project.id}
              canWrite={canWrite}
              canDelete={canDelete}
            />
          ) : isNew ? (
            <section className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-4">
              <p className="text-xs font-extrabold uppercase tracking-widest text-slate-300 mb-2">
                {t('crm:document.title')}
              </p>
              <p className="text-[12px] text-slate-400">
                {t('crm:document.saveFirst')}
              </p>
            </section>
          ) : null}
        </div>

        {/* AI Section — solo en proyectos existentes con permiso ai.use */}
        {!isNew && project && canAI && (
          <div className="px-4 sm:px-6">
            <AISection projectId={project.id} />
          </div>
        )}

        {/* Footer — shrink-0 para que siempre sea visible aunque el body scrollee */}
        <div className="flex justify-between items-center px-4 sm:px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl shrink-0">
          <div>
            {!isNew && canDelete && (
              showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 font-medium">¿Eliminar proyecto?</span>
                  <Button
                    variant="danger"
                    onClick={() => { setShowDeleteConfirm(false); deleteMutation.mutate() }}
                    disabled={deleteMutation.isPending}
                  >
                    {t('common:actions.confirm')}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
                    {t('common:actions.cancel')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="danger"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleteMutation.isPending}
                >
                  {t('common:actions.delete')}
                </Button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
            {(isNew ? canWrite : canEdit) && (
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!nombre.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? t('crm:project.saving') : t('crm:project.save')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
