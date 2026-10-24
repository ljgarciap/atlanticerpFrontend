import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/store/toastStore'
import type { InternalTechnician } from '@/types/servicios'

interface Props {
  technician: InternalTechnician
  onClose:    () => void
  onDeleted:  () => void
}

// SCRUM-1015 — confirmación antes de eliminar. El backend hace soft delete (el historial de
// servicios queda intacto) y responde 422 con el motivo si todavía hay servicios sin cerrar o
// herramientas asignadas — se muestra tal cual.
export default function InternalTechnicianDeleteConfirmModal({ technician, onClose, onDeleted }: Props) {
  const { t } = useTranslation('servicios')
  const toast = useToastStore(s => s.show)

  const mutation = useMutation({
    mutationFn: () => serviciosApi.internalTechnicians.remove(technician.id),
    onSuccess: onDeleted,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('technicians.internal.deleteModal.error'), 'error')
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-sm" data-testid="internal-technician-delete-modal">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('technicians.internal.deleteModal.title')}
          </h2>
        </div>
        <p className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
          {t('technicians.internal.deleteModal.message', { nombre: technician.nombre })}
        </p>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('technicians.internal.deleteModal.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            {t('technicians.internal.deleteModal.confirm')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
