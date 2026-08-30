import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { usePettyCashPending, useGeneratePettyCashReport } from '@/hooks/useAdminContab'
import { PETTY_CASH_FORMAS_PAGO } from '@/types/adminContab'
import type { PettyCashFormaPago } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

interface Props {
  onClose: () => void
  onGenerated: (numero: string) => void
}

/**
 * REQ-538 (SCRUM-615) — flujo de 2 pasos: 1) seleccionar qué gastos pendientes entran al reporte
 * (todo marcado por defecto, RN1), 2) forma de pago (RN4). Un solo POST al confirmar el paso 2 —
 * el backend no necesita saber que hubo un paso intermedio.
 */
export default function GenerarReportePettyCashModal({ onClose, onGenerated }: Props) {
  const { t } = useTranslation('adminContab')
  const { data: pending } = usePettyCashPending()
  const generateMutation = useGeneratePettyCashReport()

  const grupos = useMemo(() => pending?.grupos ?? [], [pending])
  const allIds = useMemo(() => grupos.flatMap(g => g.lineas.map(l => l.id)), [grupos])

  const [step, setStep]             = useState<1 | 2>(1)
  const [selectedIds, setSelected]  = useState<Set<number>>(() => new Set(allIds))
  const [formaPago, setFormaPago]   = useState<PettyCashFormaPago | ''>('')
  const [error, setError]           = useState<string | null>(null)

  function toggleLinea(id: number, checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }

  function toggleGrupo(ids: number[], checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      ids.forEach(id => (checked ? next.add(id) : next.delete(id)))
      return next
    })
  }

  function goToFormaPago() {
    if (selectedIds.size === 0) { setError(t('cajaChica.generarReporteModal.seleccionVaciaError')); return }
    setError(null)
    setStep(2)
  }

  const seleccionadas = grupos.flatMap(g => g.lineas.filter(l => selectedIds.has(l.id)))
  const total = seleccionadas.reduce((s, l) => s + l.total, 0)

  function confirmar() {
    if (!formaPago) { setError(t('cajaChica.generarReporteModal.formaPagoRequeridaError')); return }
    setError(null)
    generateMutation.mutate({ expense_ids: Array.from(selectedIds), forma_pago: formaPago }, {
      onSuccess: (report) => onGenerated(report.numero),
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setError(msg ?? t('cajaChica.generarReporteModal.error'))
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {step === 1 ? t('cajaChica.generarReporteModal.step1Title') : t('cajaChica.generarReporteModal.step2Title')}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {step === 1
                ? t('cajaChica.generarReporteModal.step1Subtitle')
                : t('cajaChica.generarReporteModal.step2Subtitle', { count: seleccionadas.length, total: formatCurrency(total) })}
            </p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {step === 1 ? (
            grupos.map(g => {
              const ids = g.lineas.map(l => l.id)
              const allChecked = ids.every(id => selectedIds.has(id))
              return (
                <div key={g.solicitante_id}>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5 cursor-pointer">
                    <input type="checkbox" checked={allChecked} onChange={e => toggleGrupo(ids, e.target.checked)} />
                    {g.solicitante_nombre} <span className="text-slate-400 font-normal">({formatCurrency(g.subtotal)})</span>
                  </label>
                  <div className="flex flex-col gap-1 pl-6">
                    {g.lineas.map(l => (
                      <label key={l.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input type="checkbox" checked={selectedIds.has(l.id)} onChange={e => toggleLinea(l.id, e.target.checked)} />
                        {l.fecha} · {l.proveedor} · {l.descripcion} — <span className="font-semibold">{formatCurrency(l.total)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            <label className="text-sm">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                {t('cajaChica.generarReporteModal.formaPagoLabel')}
              </span>
              <select
                value={formaPago} onChange={e => setFormaPago(e.target.value as PettyCashFormaPago)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
              >
                <option value="">{t('cajaChica.generarReporteModal.formaPagoPlaceholder')}</option>
                {PETTY_CASH_FORMAS_PAGO.map(m => <option key={m} value={m}>{t(`cajaChica.formasPago.${m}`)}</option>)}
              </select>
            </label>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          {step === 1 ? (
            <>
              <Button variant="secondary" onClick={onClose}>{t('cajaChica.generarReporteModal.cancel')}</Button>
              <Button onClick={goToFormaPago}>{t('cajaChica.generarReporteModal.continuar')}</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStep(1)}>{t('cajaChica.generarReporteModal.back')}</Button>
              <Button onClick={confirmar} loading={generateMutation.isPending}>{t('cajaChica.generarReporteModal.confirmar')}</Button>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}
