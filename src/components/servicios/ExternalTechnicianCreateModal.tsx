import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'
import type { ExternalTechnician } from '@/types/servicios'

interface Props {
  onClose:   () => void
  onCreated: (technician: ExternalTechnician) => void
}

interface FormState {
  nombre:        string
  empresa:       string
  especialidad:  string
  telefono:      string
  email:         string
  tarifa_dia:    string
}

const EMPTY: FormState = { nombre: '', empresa: '', especialidad: '', telefono: '', email: '', tarifa_dia: '' }

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-sm block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  )
}

const INPUT_CLASSES = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-primary'

// REQ-264 — alta de técnico externo. RN1: nombre/empresa/tarifa obligatorios, el resto opcional.
export default function ExternalTechnicianCreateModal({ onClose, onCreated }: Props) {
  const { t }     = useTranslation('servicios')
  const toast     = useToastStore(s => s.show)
  const [form, setForm] = useState<FormState>(EMPTY)

  const mutation = useMutation({
    mutationFn: () => serviciosApi.externalTechnicians.create({
      nombre:       form.nombre.trim(),
      empresa:      form.empresa.trim(),
      especialidad: form.especialidad.trim() || undefined,
      telefono:     form.telefono.trim() || undefined,
      email:        form.email.trim() || undefined,
      tarifa_dia:   Number(form.tarifa_dia),
    }),
    onSuccess: onCreated,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('technicians.external.createModal.error'), 'error')
    },
  })

  const canSubmit = form.nombre.trim() !== '' && form.empresa.trim() !== '' && form.tarifa_dia.trim() !== '' && Number(form.tarifa_dia) >= 0

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-md" data-testid="external-technician-create-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('technicians.external.createModal.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          <Field label={t('technicians.external.createModal.nombre')} required>
            <input autoFocus value={form.nombre} onChange={e => set('nombre', e.target.value)} className={INPUT_CLASSES} />
          </Field>
          <Field label={t('technicians.external.createModal.empresa')} required>
            <input value={form.empresa} onChange={e => set('empresa', e.target.value)} className={INPUT_CLASSES} />
          </Field>
          <Field label={t('technicians.external.createModal.especialidad')}>
            <input value={form.especialidad} onChange={e => set('especialidad', e.target.value)} className={INPUT_CLASSES} />
          </Field>
          <Field label={t('technicians.external.createModal.telefono')}>
            <input value={form.telefono} onChange={e => set('telefono', e.target.value)} className={INPUT_CLASSES} />
          </Field>
          <Field label={t('technicians.external.createModal.email')}>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={INPUT_CLASSES} />
          </Field>
          <Field label={t('technicians.external.createModal.tarifaDia')} required>
            <input
              type="number" min={0} step="0.01"
              value={form.tarifa_dia}
              onChange={e => set('tarifa_dia', e.target.value)}
              className={INPUT_CLASSES}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('technicians.external.createModal.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>
            {t('technicians.external.createModal.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
