import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  onCancel:  () => void
  onConfirm: () => void
  isPending: boolean
  // SCRUM-725 (decisión de Luis, 2026-08-05) — porcentaje real, ya no oculto.
  percent:   number
}

// SCRUM-725 — advertencia de margen mínimo para usuarios con excepción (Mark/David,
// ventas_diseno.override_min_margin): a diferencia de SaveQuoteConfirmModal (paso
// normal de "Guardar"), este modal solo aparece cuando confirm() responde con
// margin_warning=true — mismo patrón de overlay bespoke que el resto de la página.
export default function MarginOverrideWarningModal({ onCancel, onConfirm, isPending, percent }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-md my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:quote.marginWarningModal.title')}
          </h2>
          <Button variant="icon" onClick={onCancel}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t('ventasDiseno:quote.marginWarningModal.body', { percent })}
          </p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onCancel} disabled={isPending}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={isPending} loading={isPending}>
            {t('ventasDiseno:quote.marginWarningModal.confirm')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
