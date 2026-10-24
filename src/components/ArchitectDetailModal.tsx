import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { PIPELINE_STAGES } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  architectId: number
  onClose:     () => void
}

// SCRUM-907 — pantalla "Arquitectos": detalle de solo consulta con edición limitada (solo
// Teléfono/Correo — Nombre y la tabla de proyectos son de solo lectura, ver ticket). Reutiliza
// el mismo endpoint de edición in-place que ya usa Cotización (SCRUM-734 RN8.5), mandando
// siempre el name sin cambios.
export default function ArchitectDetailModal({ architectId, onClose }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [isEditing, setIsEditing] = useState(false)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: architect, isLoading } = useQuery({
    queryKey: ['ventas-diseno-architect', architectId],
    queryFn:  () => ventasDisenoApi.architects.get(architectId),
  })

  function startEdit() {
    if (!architect) return
    setError(null)
    setPhone(architect.phone ?? '')
    setEmail(architect.email ?? '')
    setIsEditing(true)
  }

  const saveMutation = useMutation({
    mutationFn: () => ventasDisenoApi.architects.update(architectId, {
      name: architect!.name, phone: phone || null, email: email || null,
    }),
    onSuccess: () => {
      setIsEditing(false)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-architect', architectId] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-architects'] })
    },
    onError: (err: unknown) => {
      // Pre-QA (SCRUM-907) — un 422 real (ej. borrar Teléfono Y Correo, el backend exige al
      // menos uno) traía solo el message genérico "The given data was invalid.", sin decir
      // cuál campo ni por qué. Mismo patrón que ClientDetailModal::contactErrorMessage().
      const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
      const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
      setError(firstFieldError ?? data?.message ?? t('ventasDiseno:architects.detail.saveError'))
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:architects.detail.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !architect ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : (
            <>
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:architects.detail.name')}
                  </label>
                  {/* Nunca editable desde esta pantalla — solo lectura aunque isEditing sea true. */}
                  <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">{architect.name}</p>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:architects.detail.phone')}
                  </label>
                  {isEditing ? (
                    <input
                      type="text" value={phone} onChange={e => setPhone(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">{architect.phone ?? '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('ventasDiseno:architects.detail.email')}
                  </label>
                  {isEditing ? (
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                    />
                  ) : (
                    <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">{architect.email ?? '—'}</p>
                  )}
                </div>
              </div>

              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                {t('ventasDiseno:architects.detail.projects')}
              </p>
              {architect.projects.length === 0 ? (
                <p className="text-slate-400 text-sm">{t('ventasDiseno:architects.detail.projectsEmpty')}</p>
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
                    {architect.projects.map(p => {
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
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          {isEditing ? (
            <>
              <Button variant="secondary" onClick={() => setIsEditing(false)}>{t('ventasDiseno:architects.detail.cancel')}</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {t('ventasDiseno:architects.detail.save')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
              {architect && <Button onClick={startEdit}>{t('ventasDiseno:architects.detail.edit')}</Button>}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
