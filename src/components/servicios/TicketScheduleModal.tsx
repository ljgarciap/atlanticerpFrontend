import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import type { TicketType } from '@/types/servicios'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'

interface Props {
  ticketId:      number
  tipo:          TicketType
  isReschedule:  boolean
  onClose:       () => void
  onScheduled:   () => void
}

// REQ-226 — Agendar/Reagendar. RN2: técnico filtrado por especialidad según el tipo del ticket
// (el backend ya devuelve solo las opciones válidas con ?tipo=). RN3: selectores reales de
// fecha/hora (nunca texto libre) — se combinan en un único ISO al guardar (RN6: ambos obligatorios).
//
// SCRUM-804 — al reagendar (isReschedule), el motivo es obligatorio (el backend también lo exige
// — este chequeo del frontend es solo UX, la fuente de verdad sigue siendo TicketService::schedule()).
// Al AGENDAR por primera vez no se pide motivo — no hay "anterior" que justificar.
export default function TicketScheduleModal({ ticketId, tipo, isReschedule, onClose, onScheduled }: Props) {
  const { t }     = useTranslation('servicios')
  const toast     = useToastStore(s => s.show)
  const [technicianId, setTechnicianId] = useState<number | ''>('')
  const [date, setDate]                 = useState('')
  const [time, setTime]                 = useState('')
  const [motivo, setMotivo]             = useState('')

  const { data: technicians = [] } = useQuery({
    queryKey: ['servicios-technicians-internal-options', tipo],
    queryFn:  () => serviciosApi.technicians.internalOptions(tipo),
  })

  const mutation = useMutation({
    mutationFn: () => serviciosApi.tickets.schedule(ticketId, {
      internal_technician_id: Number(technicianId),
      scheduled_at:            new Date(`${date}T${time}`).toISOString(),
      ...(isReschedule ? { motivo_reagendamiento: motivo } : {}),
    }),
    onSuccess: onScheduled,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tickets.schedule.error'), 'error')
    },
  })

  const canSave = technicianId !== '' && date !== '' && time !== '' && (!isReschedule || motivo.trim() !== '')

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {isReschedule ? t('tickets.schedule.titleReschedule') : t('tickets.schedule.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('tickets.schedule.technician')}
            </span>
            <select
              value={technicianId}
              onChange={e => setTechnicianId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
            >
              <option value="">{t('tickets.schedule.technicianPlaceholder')}</option>
              {technicians.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.first_name} {tech.last_name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('tickets.schedule.date')}
            </span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
            />
          </label>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('tickets.schedule.time')}
            </span>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
            />
          </label>

          {isReschedule && (
            <label className="text-sm">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                {t('tickets.schedule.motivo')}
              </span>
              <textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder={t('tickets.schedule.motivoPlaceholder')}
                rows={3}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm"
              />
            </label>
          )}

          {!canSave && (
            <p className="text-[11px] text-slate-400">
              {t(isReschedule ? 'tickets.schedule.requiredFieldsReschedule' : 'tickets.schedule.requiredFields')}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('tickets.schedule.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSave} loading={mutation.isPending}>
            {t('tickets.schedule.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
