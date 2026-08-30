import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  usePettyCashExpenseDetail, useUpdatePettyCashExpense, useAddPettyCashExpenseAttachment,
  useReopenPettyCashExpense,
} from '@/hooks/useAdminContab'
import type { UpdatePettyCashExpensePayload } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoAlertTriangle, IcoCheck, IcoPlus } from '@/components/icons'
import VerSoporteCajaChicaModal from './VerSoporteCajaChicaModal'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

function emptyForm(): UpdatePettyCashExpensePayload {
  return { fecha: '', proveedor: '', descripcion: '', monto_bruto: '', itbms: '' }
}

interface Props {
  expenseId: number
  onClose: () => void
}

/**
 * Batch 21 (SCRUM-622, REQ-545) — modal unificado de detalle de línea: funciona igual en
 * Pendientes, dentro de un reporte, o en Rechazados, con comportamiento distinto según
 * `detail.ubicacion` — todos los flags (`editable`/`puede_agregar_soporte`/`puede_reabrir`) son
 * calculados server-side (mismo criterio que `puede_aprobar` de PettyCashReportDetail), el
 * frontend nunca decide por su cuenta si una línea es editable o quién puede reabrir.
 *
 * Clonado del patrón de `DetalleNotaCreditoModal.tsx` — textarea de motivo revelada inline (nunca
 * un segundo modal ni window.prompt(), a diferencia del mockup original).
 */
export default function DetalleLineaCajaChicaModal({ expenseId, onClose }: Props) {
  const { t } = useTranslation('adminContab')
  const { data: detail, isLoading, isError } = usePettyCashExpenseDetail(expenseId)
  const updateMutation   = useUpdatePettyCashExpense()
  const attachMutation   = useAddPettyCashExpenseAttachment()
  const reopenMutation   = useReopenPettyCashExpense()

  const [editing, setEditing]     = useState(false)
  const [form, setForm]           = useState<UpdatePettyCashExpensePayload>(emptyForm())
  const [editError, setEditError] = useState<string | null>(null)

  const [reopening, setReopening]         = useState(false)
  const [motivoReapertura, setMotivo]     = useState('')
  const [motivoError, setMotivoError]     = useState<string | null>(null)
  const [reopenError, setReopenError]     = useState<string | null>(null)

  const [soporteOpen, setSoporteOpen] = useState<{ id: number; nombre: string; mime: string } | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)

  function startEditing() {
    if (!detail) return
    setForm({
      fecha: detail.fecha, proveedor: detail.proveedor, descripcion: detail.descripcion,
      monto_bruto: String(detail.monto_bruto), itbms: String(detail.itbms),
    })
    setEditError(null)
    setEditing(true)
  }

  function saveEdit() {
    setEditError(null)
    updateMutation.mutate({ id: expenseId, payload: form }, {
      onSuccess: () => setEditing(false),
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setEditError(msg ?? t('cajaChica.detalleLineaModal.editarError'))
      },
    })
  }

  function handleAddAttachment(input: HTMLInputElement) {
    const file = input.files?.[0]
    if (!file) return
    setAttachError(null)
    attachMutation.mutate({ id: expenseId, foto: file }, {
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setAttachError(msg ?? t('cajaChica.detalleLineaModal.agregarSoporteError'))
      },
    })
    input.value = ''
  }

  function confirmarReapertura() {
    if (motivoReapertura.trim() === '') {
      setMotivoError(t('cajaChica.detalleLineaModal.motivoRequerido'))
      return
    }
    setReopenError(null)
    reopenMutation.mutate({ id: expenseId, motivo: motivoReapertura }, {
      onSuccess: () => { setReopening(false); setMotivo(''); setMotivoError(null); onClose() },
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setReopenError(msg ?? t('cajaChica.detalleLineaModal.reabrirError'))
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-xl my-8">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {detail ? `${detail.proveedor} — ${formatCurrency(detail.total)}` : t('cajaChica.detalleLineaModal.title')}
            </h2>
            {detail && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {detail.solicitante_nombre} · {detail.fecha}
                {detail.ubicacion === 'reporte' && detail.reporte_estado === 'finalizado' && ` · ${t('cajaChica.detalleLineaModal.reporteFinalizado')}`}
              </p>
            )}
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {isLoading && <p className="text-sm text-slate-400">…</p>}
          {isError && <p className="text-sm text-red-600">{t('cajaChica.detalleLineaModal.error')}</p>}

          {detail && (
            <>
              {editing ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('cajaChica.nuevoGastoModal.fecha')}</label>
                    <input
                      type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('cajaChica.detalleLineaModal.solicitante')}</label>
                    <div className="text-sm text-slate-800 dark:text-slate-100 pt-1.5">
                      {detail.solicitante_nombre} <span className="text-slate-400 text-[10.5px]">({t('cajaChica.detalleLineaModal.solicitanteNoEditable')})</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('cajaChica.nuevoGastoModal.proveedor')}</label>
                    <input
                      type="text" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('cajaChica.nuevoGastoModal.descripcion')}</label>
                    <input
                      type="text" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('cajaChica.nuevoGastoModal.montoBruto')}</label>
                    <input
                      type="number" step="0.01" min="0" value={form.monto_bruto} onChange={e => setForm(f => ({ ...f, monto_bruto: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t('cajaChica.nuevoGastoModal.itbms')}</label>
                    <input
                      type="number" step="0.01" min="0" value={form.itbms} onChange={e => setForm(f => ({ ...f, itbms: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-1.5 text-sm"
                    />
                  </div>
                  {editError && <p className="col-span-2 text-xs text-red-500">{editError}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('cajaChica.nuevoGastoModal.descripcion')}</div>
                    <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">{detail.descripcion}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('cajaChica.detalleLineaModal.montos')}</div>
                    <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">
                      {formatCurrency(detail.monto_bruto)} + {formatCurrency(detail.itbms)} = {formatCurrency(detail.total)}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                  {t('cajaChica.detalleLineaModal.soportes')}
                </div>
                {detail.attachments.length === 0 && (
                  <p className="text-xs text-slate-400">{t('cajaChica.detalleLineaModal.sinSoportes')}</p>
                )}
                {detail.attachments.map(a => (
                  <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-slate-800 text-xs">
                    <span className="text-slate-700 dark:text-slate-200">{a.nombre_archivo}</span>
                    <button
                      type="button" className="text-primary-dark hover:underline"
                      onClick={() => setSoporteOpen({ id: a.id, nombre: a.nombre_archivo, mime: a.mime_type })}
                    >
                      {t('cajaChica.detalleLineaModal.ver')}
                    </button>
                  </div>
                ))}
                {detail.puede_agregar_soporte && (
                  <label className="inline-flex items-center gap-1 mt-2 text-xs text-primary-dark hover:underline cursor-pointer">
                    <IcoPlus size={11} /> {t('cajaChica.detalleLineaModal.agregarSoporte')}
                    <input
                      type="file" accept="image/*,.pdf" className="hidden"
                      onChange={e => handleAddAttachment(e.target)}
                    />
                  </label>
                )}
                {attachError && <p className="text-xs text-red-500 mt-1">{attachError}</p>}
              </div>

              {detail.historial.length > 0 && (
                <div className="mt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    {t('cajaChica.detalleLineaModal.historial')}
                  </div>
                  {detail.historial.map((h, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 mb-2 text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                        {h.accion === 'rechazo'
                          ? <IcoAlertTriangle size={12} className="text-red-500" />
                          : <IcoCheck size={12} className="text-emerald-500" />}
                        {h.accion === 'rechazo' ? t('cajaChica.detalleLineaModal.historialRechazo') : t('cajaChica.detalleLineaModal.historialReapertura')}
                        <span className="text-slate-400 font-normal">· {h.fecha} · {h.actor_nombre}</span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 mt-1">{h.motivo}</div>
                    </div>
                  ))}
                </div>
              )}

              {reopening && (
                <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-3 space-y-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('cajaChica.detalleLineaModal.motivoReaperturaLabel')}
                  </label>
                  <textarea
                    value={motivoReapertura}
                    onChange={e => { setMotivo(e.target.value); setMotivoError(null) }}
                    placeholder={t('cajaChica.detalleLineaModal.motivoReaperturaPlaceholder')}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                    rows={2}
                  />
                  {motivoError && <p className="text-xs text-red-500">{motivoError}</p>}
                  {reopenError && <p className="text-xs text-red-500">{reopenError}</p>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          {editing ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(false)}>{t('cajaChica.generarReporteModal.cancel')}</Button>
              <Button onClick={saveEdit} loading={updateMutation.isPending}>{t('cajaChica.detalleLineaModal.guardarCambios')}</Button>
            </>
          ) : reopening ? (
            <>
              <Button variant="secondary" onClick={() => { setReopening(false); setMotivo(''); setMotivoError(null) }}>
                {t('cajaChica.generarReporteModal.cancel')}
              </Button>
              <Button onClick={confirmarReapertura} loading={reopenMutation.isPending}>{t('cajaChica.detalleLineaModal.confirmarReapertura')}</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>{t('cajaChica.detalleReporteModal.cerrar')}</Button>
              {detail?.editable && <Button variant="secondary" onClick={startEditing}>{t('cajaChica.detalleLineaModal.editar')}</Button>}
              {detail?.puede_reabrir && <Button onClick={() => setReopening(true)}>{t('cajaChica.detalleLineaModal.reabrir')}</Button>}
            </>
          )}
        </div>
      </Card>

      {soporteOpen && (
        <VerSoporteCajaChicaModal
          expenseId={expenseId} attachmentId={soporteOpen.id}
          nombreArchivo={soporteOpen.nombre} mimeType={soporteOpen.mime}
          onClose={() => setSoporteOpen(null)}
        />
      )}
    </div>
  )
}
