import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Manual } from '@/types/manuales'

interface Props {
  manual:    Manual
  loading:   boolean
  onConfirm: () => void
  onCancel:  () => void
}

// SCRUM-984 — confirmación de borrado (spec UX 2.6): alertdialog con foco inicial en Cancelar.
export default function ManualDeleteModal({ manual, loading, onConfirm, onCancel }: Props) {
  const { t } = useTranslation('manuales')
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { cancelRef.current?.focus() }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[1100] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="manual-delete-title"
        aria-describedby="manual-delete-body"
        className="w-full max-w-sm"
      >
        <Card variant="modal" className="p-5 space-y-3">
          <h2 id="manual-delete-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('admin.deleteTitle')}
          </h2>
          <p id="manual-delete-body" className="text-sm text-slate-600 dark:text-slate-300">
            {t('admin.deleteBody', { name: manual.name })}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button ref={cancelRef} variant="outline" onClick={onCancel} disabled={loading}>
              {t('admin.cancel')}
            </Button>
            <Button variant="danger" onClick={onConfirm} loading={loading}>
              {t('admin.delete')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
