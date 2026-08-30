import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  title:   string
  fields:  { label: string; value: string }[]
  onClose: () => void
  // SCRUM-179 (hallazgo QA 2026-07-20) — acción primaria opcional (ej. "Ver orden") para que el
  // detalle del Home dé acceso a la entidad real, no solo al resumen.
  action?: { label: string; onClick: () => void }
}

// Modal apilado (mock: "modal apilado con el detalle completo") — reusado por
// Pendientes (REQ-059) y Final Stage (REQ-060), mismos campos base (cliente,
// proyecto, etc.) con distinto contenido.
export default function HomeItemDetailModal({ title, fields, onClose, action }: Props) {
  const { t } = useTranslation('common')

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-md my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 flex flex-col gap-3">
          {fields.map(f => (
            <div key={f.label}>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">{f.label}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{f.value}</p>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>{t('actions.close')}</Button>
          {action && <Button onClick={action.onClick}>{action.label}</Button>}
        </div>
      </Card>
    </div>
  )
}
