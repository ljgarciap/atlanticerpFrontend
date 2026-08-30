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
  year:          number
  month:         number
  currentValue:  number
  onClose:       () => void
  onSaved:       () => void
}

// REQ-211 RN2a(c), Escenario 5 — Gerencia sobrescribe la meta de instalaciones del mes en curso.
// Solo el mes en curso: no hay edición de meses pasados/futuros (mismo alcance del backend).
export default function InstallationGoalModal({ year, month, currentValue, onClose, onSaved }: Props) {
  const { t }   = useTranslation('servicios')
  const toast   = useToastStore(s => s.show)
  const [value, setValue] = useState(String(currentValue))

  const parsed     = Number(value)
  const canConfirm = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0

  const mutation = useMutation({
    mutationFn: () => serviciosApi.home.updateInstallationGoal({ year, month, value: parsed }),
    onSuccess:  onSaved,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('home.indicators.goalModal.error'), 'error')
    },
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('home.indicators.goalModal.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('home.indicators.goalModal.warning')}</p>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('home.indicators.goalModal.valueLabel')}
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={value}
              onChange={e => setValue(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </label>

          {!canConfirm && (
            <p className="text-[11px] text-slate-400">{t('home.indicators.goalModal.valueInvalid')}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('home.indicators.goalModal.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canConfirm} loading={mutation.isPending}>
            {t('home.indicators.goalModal.confirm')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
