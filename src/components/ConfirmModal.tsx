import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  title:        string
  message:      string
  confirmLabel: string
  cancelLabel:  string
  onConfirm:    () => void
  onCancel:     () => void
  loading?:     boolean
  /** Mensaje de error del intento anterior (p. ej. el 422 del servidor), si lo hay. */
  error?:       string | null
}

/** Fase 32 — confirmación propia (reemplaza `window.confirm` en bajas de insumos y herramientas). */
export default function ConfirmModal({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel, loading, error }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <Card variant="modal" className="w-full max-w-md" data-testid="confirm-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <Button variant="icon" onClick={onCancel}><IcoClose /></Button>
        </div>
        <div className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
          <p>{message}</p>
          {error && <p className="mt-2 text-xs text-red-500" data-testid="confirm-modal-error">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button onClick={onConfirm} loading={loading} data-testid="confirm-modal-confirm">{confirmLabel}</Button>
        </div>
      </Card>
    </div>
  )
}
