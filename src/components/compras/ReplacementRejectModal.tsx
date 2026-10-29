import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  loading?:  boolean
  onClose:   () => void
  onConfirm: (motivo: string) => void
}

// Fase 12a — rechazar una solicitud de sustitución exige un motivo (mínimo 5 caracteres, igual que el backend).
const MIN_MOTIVO = 5

export default function ReplacementRejectModal({ loading = false, onClose, onConfirm }: Props) {
  const { t } = useTranslation('compras')
  const [motivo, setMotivo] = useState('')
  const canConfirm = motivo.trim().length >= MIN_MOTIVO

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <Card variant="modal" className="w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('replacements.rejectModal.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('replacements.rejectModal.motivoLabel')}
            </span>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder={t('replacements.rejectModal.motivoPlaceholder')}
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </label>
          {!canConfirm && <p className="text-[11px] text-slate-400">{t('replacements.rejectModal.motivoRequired')}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={loading}>{t('replacements.rejectModal.cancel')}</Button>
          <Button onClick={() => onConfirm(motivo.trim())} disabled={!canConfirm} loading={loading}>{t('replacements.rejectModal.confirm')}</Button>
        </div>
      </Card>
    </div>
  )
}
