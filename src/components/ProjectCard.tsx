import { useTranslation } from 'react-i18next'
import type { Project } from '@/types/project'
import { STAGES } from '@/types/project'
import { getFreshnessClass, daysUntil } from '@/utils/urgencyUtils'
import AssigneeAvatarStack from './AssigneeAvatarStack'

interface Props {
  project: Project
  onClick: (p: Project) => void
}

function TipoTag({ tipo }: { tipo: string }) {
  const { t } = useTranslation('crm')
  const cls: Record<string, string> = {
    diseno:     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    cotizacion: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    ambos:      'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  }
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls[tipo] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
      {t(`crm:tipoBadge.${tipo}`, { defaultValue: tipo })}
    </span>
  )
}

export default function ProjectCard({ project, onClick }: Props) {
  const { t } = useTranslation('crm')
  const stage = STAGES.find(s => s.id === project.etapa)
  const days  = daysUntil(project.fecha_entrega)

  return (
    <div
      onClick={() => onClick(project)}
      className="bg-white dark:bg-slate-800 rounded-xl p-3.5 mb-2 cursor-pointer transition-all hover:shadow-md hover:-translate-y-px relative select-none"
    >
      {/* Urgency dot */}
      {project.urgency === 'vencido' && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      )}
      {project.urgency === 'proximo' && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400" />
      )}

      {/* Stage dot + title row */}
      <div className="flex items-start gap-1.5 pr-4 mb-0.5">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
          style={{ background: stage?.color ?? '#94a3b8' }}
        />
        <p className="font-medium text-[13px] text-slate-900 leading-tight">{project.nombre}</p>
      </div>

      <p className="text-[11px] text-slate-500 mb-2">
        <span className="font-semibold text-slate-600">{project.contacto ?? '—'}</span>
        {project.ubicacion && <span className="text-slate-400"> · {project.ubicacion}</span>}
      </p>

      {/* Badges row */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <TipoTag tipo={project.tipo} />
        {project.dialux && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">DIALux</span>
        )}
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getFreshnessClass(project.freshness)}`}
        >
          ● {t(`crm:freshness.${project.freshness}`)}
        </span>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center pt-2 border-t border-slate-50">
        <AssigneeAvatarStack assignees={project.assignees} max={3} size={20} />

        <div className="flex items-center gap-2">
          {days !== null && (
            <span
              className={`text-[10px] font-semibold ${
                days < 0 ? 'text-red-600' : days <= 3 ? 'text-amber-600' : 'text-slate-400'
              }`}
            >
              {days < 0 ? t('crm:project.daysOverdue', { days: Math.abs(days) }) : days === 0 ? t('crm:project.today') : `${days}d`}
            </span>
          )}
          {project.valor != null && (
            <span className="text-[11px] text-slate-500">${Number(project.valor).toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  )
}
