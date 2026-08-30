import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import type { DashboardAlertItem } from '@/types/ventasDiseno'

interface Props {
  title:     string
  items:     DashboardAlertItem[]
  daysLabel: string
  onClose:   () => void
}

/**
 * SCRUM-796 (secc. 3/4) — "Ver más" de las alertas del Dashboard CRM (propuestas
 * vencidas / clientes sin contacto reciente): lista completa, reusada por las dos
 * alertas. Cada fila navega directo a la tarjeta puntual en Pipeline
 * (`?card=<id>`, mismo mecanismo ya usado por Clientes/Reportes) — no hay que
 * volver a filtrar nada a mano una vez adentro.
 */
export default function DashboardAlertListModal({ title, items, daysLabel, onClose }: Props) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-md my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-2 py-2 flex-1">
          {items.map(item => (
            <button
              key={item.card_id}
              type="button"
              onClick={() => navigate(`/ventas-diseno/pipeline?card=${item.card_id}`)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0"
            >
              <span>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{item.project_name}</span>
                {item.client_name && (
                  <span className="block text-xs text-slate-400">{item.client_name}</span>
                )}
              </span>
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">{item.days} {daysLabel}</span>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>{t('actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
