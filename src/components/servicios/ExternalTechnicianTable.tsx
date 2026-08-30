import { useTranslation } from 'react-i18next'
import type { ExternalTechnician } from '@/types/servicios'
import { IcoEye } from '@/components/icons'

interface Props {
  technicians:  ExternalTechnician[]
  onViewDetail: (id: number) => void
}

function formatTarifa(t: ExternalTechnician): string {
  if (!t.tarifa_visible || t.tarifa_dia === null) return '—'
  return `$${Number(t.tarifa_dia).toFixed(2)}`
}

// REQ-263 RN1 — listado principal. `tarifa_dia` ya viene null del backend cuando
// tarifa_visible=false (RN "Sin tarifa asignada" de REQ-266 RN3) — acá solo se traduce a texto.
export default function ExternalTechnicianTable({ technicians, onViewDetail }: Props) {
  const { t } = useTranslation('servicios')

  if (technicians.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
        <p className="text-slate-400 text-sm">{t('technicians.external.table.empty')}</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-2">{t('technicians.external.table.columns.nombre')}</th>
              <th className="px-3 py-2">{t('technicians.external.table.columns.empresa')}</th>
              <th className="px-3 py-2">{t('technicians.external.table.columns.especialidad')}</th>
              <th className="px-3 py-2">{t('technicians.external.table.columns.telefono')}</th>
              <th className="px-3 py-2">{t('technicians.external.table.columns.tarifa')}</th>
              <th className="px-3 py-2">{t('technicians.external.table.columns.proyectosActivos')}</th>
              <th className="px-3 py-2">{t('technicians.external.table.columns.estado')}</th>
              <th className="px-3 py-2 text-right">{t('technicians.external.table.columns.detail')}</th>
            </tr>
          </thead>
          <tbody>
            {technicians.map(tech => (
              <tr key={tech.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {tech.nombre}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{tech.empresa}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{tech.especialidad}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{tech.telefono ?? '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{formatTarifa(tech)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{tech.proyectos_activos}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span
                    className={
                      tech.estado === 'active'
                        ? 'text-xs px-2 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'text-xs px-2 py-1 rounded-full font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }
                  >
                    {t(`technicians.external.status.${tech.estado}`)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => onViewDetail(tech.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
                    aria-label={t('technicians.external.table.columns.detail')}
                  >
                    <IcoEye size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
