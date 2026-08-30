import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPencil, IcoAlertTriangle } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'
import type { ExternalTechnicianDeactivationConfirmationResponse } from '@/types/servicios'

interface Props {
  technicianId: number
  canEdit:      boolean
  onClose:      () => void
}

function formatTarifa(visible: boolean, value: number | string | null): string {
  if (!visible || value === null) return 'Sin tarifa asignada'
  return `$${Number(value).toFixed(2)}`
}

// REQ-265/266/267 — ficha del técnico externo: tarifa (editar + historial + mostrar/ocultar),
// activar/inactivar (con advertencia si tiene proyectos activos), proyectos asignados.
export default function ExternalTechnicianDetailModal({ technicianId, canEdit, onClose }: Props) {
  const { t, i18n } = useTranslation('servicios')
  const toast        = useToastStore(s => s.show)
  const qc           = useQueryClient()

  const [editingTarifa, setEditingTarifa] = useState(false)
  const [tarifaInput, setTarifaInput]     = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState<{ activeCount: number } | null>(null)

  const { data: technician, isLoading } = useQuery({
    queryKey: ['servicios-external-technician', technicianId],
    queryFn:  () => serviciosApi.externalTechnicians.get(technicianId),
  })

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['servicios-external-technician', technicianId] })
    void qc.invalidateQueries({ queryKey: ['servicios-external-technicians'] })
  }

  const tarifaMutation = useMutation({
    mutationFn: (payload: { tarifa_dia?: number; tarifa_visible?: boolean }) =>
      serviciosApi.externalTechnicians.updateTarifa(technicianId, payload),
    onSuccess: () => {
      setEditingTarifa(false)
      invalidate()
    },
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('technicians.external.detail.tarifaError'), 'error')
    },
  })

  const estadoMutation = useMutation({
    mutationFn: (confirm: boolean) => {
      const target = technician?.estado === 'active' ? 'inactive' : 'active'
      return serviciosApi.externalTechnicians.updateEstado(technicianId, target, confirm)
    },
    onSuccess: () => {
      setPendingConfirmation(null)
      invalidate()
    },
    onError: (err) => {
      // REQ-265 RN2 — 409 = requiere confirmación explícita, no es un error real.
      if (isAxiosError(err) && err.response?.status === 409) {
        const body = err.response.data as ExternalTechnicianDeactivationConfirmationResponse
        setPendingConfirmation({ activeCount: body.active_projects_count })
        return
      }
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('technicians.external.detail.estadoError'), 'error')
    },
  })

  function startEditTarifa() {
    setTarifaInput(technician ? String(technician.tarifa_dia ?? '') : '')
    setEditingTarifa(true)
  }

  function saveTarifa() {
    const value = Number(tarifaInput)
    if (Number.isNaN(value) || value < 0) return
    tarifaMutation.mutate({ tarifa_dia: value })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-lg" data-testid="external-technician-detail-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {technician?.nombre ?? t('technicians.external.detail.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          {isLoading || !technician ? (
            <p className="text-slate-400 text-sm">{t('technicians.external.detail.loading')}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('technicians.external.table.columns.empresa')}</span>
                  <span className="text-slate-800 dark:text-slate-100">{technician.empresa}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('technicians.external.table.columns.especialidad')}</span>
                  <span className="text-slate-800 dark:text-slate-100">{technician.especialidad}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('technicians.external.table.columns.telefono')}</span>
                  <span className="text-slate-800 dark:text-slate-100">{technician.telefono ?? '—'}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('technicians.external.createModal.email')}</span>
                  <span className="text-slate-800 dark:text-slate-100">{technician.email ?? '—'}</span>
                </div>
              </div>

              {/* REQ-266 — tarifa: editar + historial + mostrar/ocultar */}
              <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('technicians.external.detail.tarifaSection')}</h3>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => tarifaMutation.mutate({ tarifa_visible: !technician.tarifa_visible })}
                      className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300"
                    >
                      {t('technicians.external.detail.showTarifa')}
                      <span
                        role="switch"
                        aria-checked={technician.tarifa_visible}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${technician.tarifa_visible ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${technician.tarifa_visible ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                      </span>
                    </button>
                  )}
                </div>

                {editingTarifa ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} step="0.01" autoFocus
                      value={tarifaInput}
                      onChange={e => setTarifaInput(e.target.value)}
                      className="w-32 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-1.5 text-sm"
                    />
                    <Button variant="secondary" onClick={() => setEditingTarifa(false)} disabled={tarifaMutation.isPending}>
                      {t('technicians.external.createModal.cancel')}
                    </Button>
                    <Button onClick={saveTarifa} loading={tarifaMutation.isPending}>
                      {t('technicians.external.createModal.save')}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-slate-800 dark:text-slate-100">
                      {formatTarifa(technician.tarifa_visible, technician.tarifa_dia)}
                    </span>
                    {canEdit && (
                      <button type="button" onClick={startEditTarifa} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
                        <IcoPencil size={14} />
                      </button>
                    )}
                  </div>
                )}

                {technician.rate_history && technician.rate_history.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                    {technician.rate_history.map((entry, i) => (
                      <li key={i} className="flex justify-between">
                        <span>${Number(entry.tarifa_dia).toFixed(2)}{entry.changed_by ? ` — ${entry.changed_by}` : ''}</span>
                        <span>{new Date(entry.created_at).toLocaleDateString(i18n.language)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* REQ-267 — proyectos/tickets asignados. SCRUM-337 (rebote QA 2026-08-13,
                  CRÍTICO): esto era solo un contador de texto — el entregable central del
                  ticket es la tabla, no un conteo. */}
              <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  {t('technicians.external.detail.assignedProjects')}
                </h3>
                {technician.proyectos_asignados.length === 0 ? (
                  <p className="text-sm text-slate-400">{t('technicians.external.detail.noAssignedProjects')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-800">
                          <th className="py-1.5 pr-2">{t('technicians.external.detail.assignedProjectsColumns.ticket')}</th>
                          <th className="py-1.5 pr-2">{t('technicians.external.detail.assignedProjectsColumns.cliente')}</th>
                          <th className="py-1.5 pr-2">{t('technicians.external.detail.assignedProjectsColumns.cotizacion')}</th>
                          <th className="py-1.5 pr-2 text-right">{t('technicians.external.detail.assignedProjectsColumns.dias')}</th>
                          {technician.puede_ver_costos && (
                            <>
                              <th className="py-1.5 pr-2 text-right">{t('technicians.external.detail.assignedProjectsColumns.costoDia')}</th>
                              <th className="py-1.5 pr-2 text-right">{t('technicians.external.detail.assignedProjectsColumns.margen')}</th>
                            </>
                          )}
                          <th className="py-1.5 pr-2 text-right">{t('technicians.external.detail.assignedProjectsColumns.precioFinal')}</th>
                          <th className="py-1.5">{t('technicians.external.detail.assignedProjectsColumns.estado')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {technician.proyectos_asignados.map(p => (
                          <tr key={`${p.ticket_id}-${p.quote_numero}`} className="border-b border-slate-50 dark:border-slate-800/60">
                            <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">{p.ticket_numero}</td>
                            <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{p.cliente ?? '—'}</td>
                            <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">{p.quote_numero}</td>
                            <td className="py-1.5 pr-2 text-right text-slate-600 dark:text-slate-300">{p.dias_cotizados}</td>
                            {technician.puede_ver_costos && (
                              <>
                                <td className="py-1.5 pr-2 text-right text-slate-600 dark:text-slate-300">
                                  {p.costo_dia != null ? `$${Number(p.costo_dia).toFixed(2)}` : '—'}
                                </td>
                                <td className="py-1.5 pr-2 text-right text-slate-600 dark:text-slate-300">
                                  {p.margen_percent != null ? `${Number(p.margen_percent).toFixed(1)}%` : '—'}
                                </td>
                              </>
                            )}
                            <td className="py-1.5 pr-2 text-right font-medium text-slate-800 dark:text-slate-100">${Number(p.precio_final).toFixed(2)}</td>
                            <td className="py-1.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{p.quote_estado}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* REQ-265 — activar/inactivar */}
              {canEdit && (
                <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                  {pendingConfirmation ? (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 p-3">
                      <div className="flex gap-2 items-start">
                        <IcoAlertTriangle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-800 dark:text-amber-300">
                          {t('technicians.external.detail.deactivateWarning', { count: pendingConfirmation.activeCount })}
                        </p>
                      </div>
                      <div className="flex justify-end gap-2 mt-3">
                        <Button variant="secondary" onClick={() => setPendingConfirmation(null)} disabled={estadoMutation.isPending}>
                          {t('technicians.external.createModal.cancel')}
                        </Button>
                        <Button variant="danger" onClick={() => estadoMutation.mutate(true)} loading={estadoMutation.isPending}>
                          {t('technicians.external.detail.deactivateConfirm')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant={technician.estado === 'active' ? 'danger' : 'secondary'}
                      onClick={() => estadoMutation.mutate(false)}
                      loading={estadoMutation.isPending}
                    >
                      {technician.estado === 'active'
                        ? t('technicians.external.detail.deactivate')
                        : t('technicians.external.detail.activate')}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
