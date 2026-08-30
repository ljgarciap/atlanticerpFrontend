import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { PIPELINE_STAGES } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  masterClientId:   number
  masterClientName: string
  onClose:          () => void
}

// REQ-065: navegación cruzada a Pipeline, resaltando la tarjeta (ver PipelinePage,
// que lee ?card={id} para reabrir el mismo modal de detalle).
export default function ClientProjectsModal({ masterClientId, masterClientName, onClose }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()

  const { data: projects, isLoading } = useQuery({
    queryKey: ['ventas-diseno-client-projects', masterClientId],
    queryFn:  () => ventasDisenoApi.clients.projects(masterClientId),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:clients.projectsModal.title', { name: masterClientName })}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : !projects || projects.length === 0 ? (
            <p className="text-slate-400 text-sm">{t('ventasDiseno:clients.projectsModal.empty')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-2 pr-2">{t('ventasDiseno:clients.projectsModal.subClient')}</th>
                  <th className="py-2 pr-2">{t('ventasDiseno:clients.projectsModal.project')}</th>
                  <th className="py-2 pr-2">{t('ventasDiseno:clients.projectsModal.stage')}</th>
                  <th className="py-2 pr-2">{t('ventasDiseno:clients.projectsModal.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const stage = PIPELINE_STAGES.find(s => s.id === p.stage)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/ventas-diseno/pipeline?card=${p.id}`)}
                      className="cursor-pointer border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                    >
                      <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">{p.sub_client?.business_name ?? '—'}</td>
                      <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">{p.project.name}</td>
                      <td className="py-2 pr-2">
                        {stage && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: stage.color }}>
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: stage.color }} />
                            {t(`ventasDiseno:stages.${p.stage}`)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-slate-700 dark:text-slate-200">
                        {p.amount != null ? `$${Number(p.amount).toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
