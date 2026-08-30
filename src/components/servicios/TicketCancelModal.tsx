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
  ticketId:    number
  numero:      string
  onClose:     () => void
  onCancelled: () => void
}

// REQ-227 — Cancelar ticket. RN2: confirmación explícita (este modal, no un solo clic). RN6:
// motivo obligatorio antes de poder confirmar.
export default function TicketCancelModal({ ticketId, numero, onClose, onCancelled }: Props) {
  const { t }   = useTranslation('servicios')
  const toast   = useToastStore(s => s.show)
  const [motivo, setMotivo] = useState('')

  const mutation = useMutation({
    mutationFn: () => serviciosApi.tickets.cancel(ticketId, motivo.trim()),
    onSuccess:  onCancelled,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tickets.cancelModal.error'), 'error')
    },
  })

  const canConfirm = motivo.trim() !== ''

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('tickets.cancelModal.title', { numero })}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('tickets.cancelModal.warning')}</p>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('tickets.cancelModal.motivoLabel')}
            </span>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder={t('tickets.cancelModal.motivoPlaceholder')}
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </label>

          {!canConfirm && (
            <p className="text-[11px] text-slate-400">{t('tickets.cancelModal.motivoRequired')}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('tickets.cancelModal.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canConfirm} loading={mutation.isPending}>
            {t('tickets.cancelModal.confirm')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
