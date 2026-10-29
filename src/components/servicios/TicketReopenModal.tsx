import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'

interface Props {
  ticketId:   number
  numero:     string
  onClose:    () => void
  onReopened: () => void
}

// Fase 12a — un ticket cerrado o cancelado es final: solo se reabre con motivo (mínimo 10 caracteres, igual que el backend).
const MIN_MOTIVO = 10

export default function TicketReopenModal({ ticketId, numero, onClose, onReopened }: Props) {
  const { t }   = useTranslation('servicios')
  const toast   = useToastStore(s => s.show)
  const [motivo, setMotivo] = useState('')

  const mutation = useMutation({
    mutationFn: () => serviciosApi.tickets.reopen(ticketId, motivo.trim()),
    onSuccess:  onReopened,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tickets.reopenModal.error'), 'error')
    },
  })

  const canConfirm = motivo.trim().length >= MIN_MOTIVO

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <Card variant="modal" className="w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('tickets.reopenModal.title', { numero })}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('tickets.reopenModal.warning')}</p>
          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('tickets.reopenModal.motivoLabel')}</span>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder={t('tickets.reopenModal.motivoPlaceholder')}
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </label>
          {!canConfirm && <p className="text-[11px] text-slate-400">{t('tickets.reopenModal.motivoRequired')}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>{t('tickets.reopenModal.cancel')}</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canConfirm} loading={mutation.isPending}>{t('tickets.reopenModal.confirm')}</Button>
        </div>
      </Card>
    </div>
  )
}
