import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import type { ClaimSheetDiagnostico } from '@/types/servicios'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'

interface Props {
  ticketId:     number
  ticketNumero: string
  canEdit:      boolean
  onClose:      () => void
  onSaved:      () => void
}

const DIAGNOSTICOS: ClaimSheetDiagnostico[] = ['defectuoso', 'no_procede', 'uso_inadecuado', 'pendiente_evaluacion']

// Fase 4 — Servicios, Batch 9 (REQ-278/279). Hoja de Reclamo — contraparte de
// InspectionReportModal para tickets tipo=claim. Secciones 1-2 (reclamante/producto) son SIEMPRE
// de solo lectura, precargadas por el backend desde el ticket — nunca se capturan a mano (RN de
// la spec). RN5: una vez `estado=completed` la hoja queda en solo lectura TOTAL, sin excepción de
// rol — a diferencia de Informe de Inspección, que sigue editable después de Completado.
export default function ClaimSheetModal({ ticketId, ticketNumero, canEdit, onClose, onSaved }: Props) {
  const { t }   = useTranslation('servicios')
  const qc      = useQueryClient()
  const toast   = useToastStore(s => s.show)

  const [descripcionProblema, setDescripcionProblema] = useState('')
  const [fechaReclamo, setFechaReclamo]                 = useState('')
  const [diagnostico, setDiagnostico]                   = useState<ClaimSheetDiagnostico | ''>('')
  const [firmaResponsable, setFirmaResponsable]         = useState('')
  const [hydrated, setHydrated]                         = useState(false)
  const [downloadingPdf, setDownloadingPdf]             = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-claim-sheet', ticketId],
    queryFn:  () => serviciosApi.claimSheets.get(ticketId),
  })

  useEffect(() => {
    if (hydrated || !data) return
    setHydrated(true)
    setDescripcionProblema(data.descripcion_problema ?? '')
    setFechaReclamo(data.fecha_reclamo ?? '')
    setDiagnostico(data.diagnostico ?? '')
    setFirmaResponsable(data.firma_responsable ?? '')
  }, [data, hydrated])

  const isCompleted = data?.estado === 'completed'
  // RN5 — solo lectura TOTAL tras completar, sin excepción de rol (diverge de Informe de Inspección).
  const isLocked    = !canEdit || isCompleted

  const mutation = useMutation({
    mutationFn: () => serviciosApi.claimSheets.save(ticketId, {
      descripcion_problema: descripcionProblema.trim() || null,
      fecha_reclamo:         fechaReclamo || null,
      diagnostico:           diagnostico as ClaimSheetDiagnostico,
      firma_responsable:     firmaResponsable.trim(),
    }),
    // Visual Review (2026-08-11) — reabrir el modal justo después de guardar podía mostrar
    // campos vacíos: `invalidateQueries` dispara el refetch en segundo plano, pero el modal ya se
    // había cerrado (onSaved → unmount) antes de que resolviera; si se reabría antes de que
    // terminara, el nuevo montaje hidrataba desde el cache todavía viejo. `save()` ya devuelve el
    // registro recién guardado completo — sembrarlo directo en el cache con `setQueryData` es
    // sincrónico, sin ventana de carrera (a diferencia de Informe de Inspección, acá no hay
    // sub-recursos async tipo fotos que `save()` no incluya).
    onSuccess: (result) => {
      qc.setQueryData(['servicios-claim-sheet', ticketId], result)
      void qc.invalidateQueries({ queryKey: ['servicios-ticket-detail', ticketId] })
      void qc.invalidateQueries({ queryKey: ['servicios-tickets'] })
      onSaved()
    },
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tickets.claimSheet.saveError'), 'error')
    },
  })

  async function downloadPdf() {
    setDownloadingPdf(true)
    try {
      await serviciosApi.claimSheets.downloadPdf(ticketId, ticketNumero)
    } catch {
      toast(t('tickets.claimSheet.pdfError'), 'error')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const canSave = !isLocked && diagnostico !== '' && firmaResponsable.trim() !== ''

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('tickets.claimSheet.modalTitle')}</h2>
            <p className="text-[11.5px] text-slate-500">{ticketNumero}</p>
          </div>
          <div className="flex items-center gap-2">
            {isCompleted && (
              <Button variant="secondary" onClick={() => void downloadPdf()} loading={downloadingPdf}>
                {t('tickets.claimSheet.print')}
              </Button>
            )}
            <Button variant="icon" onClick={onClose}><IcoClose /></Button>
          </div>
        </div>

        {isLoading || !data ? (
          <div className="px-5 py-8 text-sm text-slate-400">{t('common:labels.loading')}</div>
        ) : (
          <>
            <div className="overflow-y-auto px-5 py-4 flex-1 flex flex-col gap-4">
              <SectionLabel>{t('tickets.claimSheet.section1')}</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ReadOnlyField label={t('tickets.claimSheet.cliente')}>
                  {data.reclamante.cliente_master === data.reclamante.subcliente
                    ? data.reclamante.cliente_master ?? '—'
                    : `${data.reclamante.cliente_master ?? '—'} — ${data.reclamante.subcliente ?? '—'}`}
                </ReadOnlyField>
                <ReadOnlyField label={t('tickets.claimSheet.contacto')}>
                  {[data.reclamante.contacto, data.reclamante.telefono].filter(Boolean).join(' · ') || '—'}
                </ReadOnlyField>
                <ReadOnlyField label={t('tickets.claimSheet.email')}>{data.reclamante.email ?? '—'}</ReadOnlyField>
                <ReadOnlyField label={t('tickets.claimSheet.direccion')}>{data.reclamante.direccion ?? '—'}</ReadOnlyField>
                <ReadOnlyField label={t('tickets.claimSheet.proyecto')}>{data.reclamante.proyecto ?? '—'}</ReadOnlyField>
                <ReadOnlyField label={t('tickets.claimSheet.responsable')}>{data.reclamante.responsable ?? '—'}</ReadOnlyField>
              </div>

              <SectionLabel>{t('tickets.claimSheet.section2')}</SectionLabel>
              {data.productos.length === 0 ? (
                <p className="text-[12.5px] text-slate-400">{t('tickets.claimSheet.noProductos')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.productos.map(p => (
                    <div key={p.id} className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2 text-[12.5px] text-slate-700 dark:text-slate-200">
                      <span className="font-semibold">{p.marca ?? '—'} — {p.referencia ?? '—'}</span>
                      {p.descripcion && <span className="text-slate-500"> · {p.descripcion}</span>}
                      <span className="text-slate-500">
                        {' '}· {t('tickets.claimSheet.cantidadReclamo')}: {p.cantidad_reclamada}
                        {' '}· {t('tickets.claimSheet.cantidadRecibida')}: {p.cantidad_recibida}
                        {' '}· {t('tickets.claimSheet.cantidadPendiente')}: {p.cantidad_pendiente}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <SectionLabel>{t('tickets.claimSheet.section3')}</SectionLabel>
              <Field label={t('tickets.claimSheet.fechaReclamo')}>
                <input type="date" value={fechaReclamo} disabled={isLocked} onChange={e => setFechaReclamo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
              </Field>
              <Field label={t('tickets.claimSheet.descripcionProblema')}>
                <textarea rows={3} value={descripcionProblema} disabled={isLocked} onChange={e => setDescripcionProblema(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
              </Field>
              <Field label={t('tickets.claimSheet.diagnostico')}>
                <select value={diagnostico} disabled={isLocked} onChange={e => setDiagnostico(e.target.value as ClaimSheetDiagnostico)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60">
                  <option value="">{t('tickets.claimSheet.diagnosticoPlaceholder')}</option>
                  {DIAGNOSTICOS.map(d => <option key={d} value={d}>{t(`tickets.claimSheet.diagnosticos.${d}`)}</option>)}
                </select>
              </Field>

              <SectionLabel>{t('tickets.claimSheet.section4')}</SectionLabel>
              <Field label={t('tickets.claimSheet.firmaResponsable')}>
                <input value={firmaResponsable} disabled={isLocked} onChange={e => setFirmaResponsable(e.target.value)}
                  placeholder={t('tickets.claimSheet.firmaPendiente')}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-2 text-sm disabled:opacity-60" />
              </Field>

              {isCompleted && (
                <p className="text-[11.5px] text-slate-400 italic">{t('tickets.claimSheet.lockedNotice')}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
              <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
                {t('tickets.detail.cancel')}
              </Button>
              {!isLocked && (
                <Button onClick={() => mutation.mutate()} disabled={!canSave} loading={mutation.isPending}>
                  {t('tickets.claimSheet.save')}
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      <p className="text-slate-800 dark:text-slate-100">{children}</p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 -mb-1">{children}</p>
}
