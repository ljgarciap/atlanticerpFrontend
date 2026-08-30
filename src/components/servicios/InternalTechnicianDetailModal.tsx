import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import type { InternalTechnician } from '@/types/servicios'

interface Props {
  technician: InternalTechnician
  onClose:    () => void
}

// REQ-255 RN5 — clic en nombre/avatar de la tarjeta abre teléfono/correo/especialidad.
export default function InternalTechnicianDetailModal({ technician: t, onClose }: Props) {
  const { t: translate } = useTranslation('servicios')

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-sm" data-testid="internal-technician-detail-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t.nombre}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 text-sm">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {translate('technicians.internal.detailModal.especialidad')}
            </span>
            <span className="text-slate-800 dark:text-slate-100">
              {translate(`technicians.internal.specialty.${t.especialidad}`)}
            </span>
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {translate('technicians.internal.detailModal.telefono')}
            </span>
            <span className="text-slate-800 dark:text-slate-100">{t.telefono ?? '—'}</span>
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {translate('technicians.internal.detailModal.email')}
            </span>
            <span className="text-slate-800 dark:text-slate-100">{t.email ?? '—'}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
