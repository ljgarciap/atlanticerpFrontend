import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'
import type { InternalTechnician, InternalTechnicianSpecialty } from '@/types/servicios'

interface Props {
  onClose:   () => void
  onCreated: (technician: InternalTechnician) => void
}

interface FormState {
  nombre:       string
  telefono:     string
  email:        string
  especialidad: InternalTechnicianSpecialty
}

const EMPTY: FormState = { nombre: '', telefono: '', email: '', especialidad: 'general' }

const INPUT_CLASSES = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-primary'

// REQ-259 — alta de técnico interno. RN1: nombre/especialidad obligatorios, teléfono/correo
// opcionales. RN2/RN3/RN4 (iniciales, color único, estado inicial) las resuelve el backend.
export default function InternalTechnicianCreateModal({ onClose, onCreated }: Props) {
  const { t }   = useTranslation('servicios')
  const toast   = useToastStore(s => s.show)
  const [form, setForm] = useState<FormState>(EMPTY)

  const mutation = useMutation({
    mutationFn: () => serviciosApi.internalTechnicians.create({
      nombre:       form.nombre.trim(),
      telefono:     form.telefono.trim() || undefined,
      email:        form.email.trim() || undefined,
      especialidad: form.especialidad,
    }),
    onSuccess: onCreated,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('technicians.internal.createModal.error'), 'error')
    },
  })

  const canSubmit = form.nombre.trim() !== ''

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-md" data-testid="internal-technician-create-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('technicians.internal.createModal.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="text-sm block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('technicians.internal.createModal.nombre')} <span className="text-red-500">*</span>
            </span>
            <input autoFocus value={form.nombre} onChange={e => set('nombre', e.target.value)} className={INPUT_CLASSES} />
          </label>
          <label className="text-sm block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('technicians.internal.createModal.especialidad')} <span className="text-red-500">*</span>
            </span>
            <select
              value={form.especialidad}
              onChange={e => set('especialidad', e.target.value as InternalTechnicianSpecialty)}
              className={INPUT_CLASSES}
            >
              <option value="general">{t('technicians.internal.specialty.general')}</option>
              <option value="warranty">{t('technicians.internal.specialty.warranty')}</option>
            </select>
          </label>
          <label className="text-sm block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('technicians.internal.createModal.telefono')}
            </span>
            <input value={form.telefono} onChange={e => set('telefono', e.target.value)} className={INPUT_CLASSES} />
          </label>
          <label className="text-sm block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('technicians.internal.createModal.email')}
            </span>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={INPUT_CLASSES} />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('technicians.internal.createModal.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>
            {t('technicians.internal.createModal.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
