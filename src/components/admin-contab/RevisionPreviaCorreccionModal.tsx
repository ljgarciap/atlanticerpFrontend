import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { usePreviewCorreccionNotaCredito, useRegisterCorreccionNotaCredito } from '@/hooks/useAdminContab'
import type { PreviewCorreccionPayload } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoEye, IcoAlertTriangle, IcoPaperclip } from '@/components/icons'
import { FiscalItemsTable, FiscalTotalsBlock } from './FiscalDocumentPreview'

const COMPROBANTE_MAX_BYTES = 10 * 1024 * 1024
const COMPROBANTE_ACCEPTED  = ['image/jpeg', 'image/png', 'application/pdf']

function labelize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function CardBlock({ title, data }: { title: string; data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{title}</div>
      {entries.length === 0 ? (
        <div className="text-sm text-slate-400">—</div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 text-sm">
              <span className="text-slate-500 dark:text-slate-400">{labelize(k)}</span>
              <span className="text-slate-800 dark:text-slate-100 text-right">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  params: PreviewCorreccionPayload
  /** RN4 REQ-489 — vuelve al formulario ya lleno sin perder nada (el padre mantiene
   *  `RegistrarNotaCreditoModal` montado-pero-oculto mientras este modal está abierto). */
  onBack: () => void
  onClose: () => void
  onConfirmed: () => void
}

/**
 * Batch 12 (SCRUM-566/567, REQ-489/490) — revisión previa + vista previa de factura nueva antes de
 * confirmar una "Corrección de datos". RN1 REQ-489: nada se persiste hasta "Confirmar y generar
 * factura nueva". El documento de factura nueva reusa `FiscalItemsTable`/`FiscalTotalsBlock`
 * (extraídos de `FacturacionPage.tsx` para este batch) — mismo formato visual que cualquier otra
 * factura del sistema (RN2 REQ-489).
 */
export default function RevisionPreviaCorreccionModal({ params, onBack, onClose, onConfirmed }: Props) {
  const { t } = useTranslation('adminContab')
  const previewMutation  = usePreviewCorreccionNotaCredito()
  const registerMutation = useRegisterCorreccionNotaCredito()

  const [facturaVisible, setFacturaVisible] = useState(false)
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    previewMutation.mutate(params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const preview = previewMutation.data

  function pickComprobante(file: File | undefined | null) {
    if (!file) return
    if (!COMPROBANTE_ACCEPTED.includes(file.type)) {
      setError(t('notasCredito.formulario.comprobanteInvalidType'))
      return
    }
    if (file.size > COMPROBANTE_MAX_BYTES) {
      setError(t('notasCredito.formulario.comprobanteTooLarge'))
      return
    }
    setError(null)
    setComprobante(file)
  }

  // REQ-487 — "Corrección de datos" es un subtipo de Anulación completa, siempre obligatorio
  // (mismo criterio que `comprobanteObligatorio` en `RegistrarNotaCreditoModal`).
  function handleConfirmar() {
    if (comprobante === null) {
      setError(t('notasCredito.formulario.comprobanteObligatorioHint'))
      return
    }
    setError(null)
    registerMutation.mutate({ ...params, comprobante }, {
      onSuccess: onConfirmed,
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setError(msg ?? t('notasCredito.correccion.error'))
      },
    })
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('notasCredito.correccion.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-slate-400 dark:text-slate-500">{t('notasCredito.correccion.subtitle')}</p>

          {previewMutation.isPending && <p className="text-sm text-slate-400">…</p>}
          {previewMutation.isError && (
            <p className="text-red-600 text-sm">{t('notasCredito.correccion.previewError')}</p>
          )}

          {preview && (
            <>
              <CardBlock title={t('notasCredito.correccion.tarjetas.facturaOrigen')} data={preview.tarjetas.factura_origen} />
              <CardBlock title={t('notasCredito.correccion.tarjetas.proyecto')} data={preview.tarjetas.proyecto} />
              <CardBlock title={t('notasCredito.correccion.tarjetas.cotizacion')} data={preview.tarjetas.cotizacion} />
              <CardBlock title={t('notasCredito.correccion.tarjetas.guiaEntrega')} data={preview.tarjetas.guia_entrega} />
              <CardBlock title={t('notasCredito.correccion.tarjetas.notaAGenerar')} data={preview.tarjetas.nota_a_generar} />
              <CardBlock title={t('notasCredito.correccion.tarjetas.correccionAplicada')} data={preview.tarjetas.correccion_aplicada} />

              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('notasCredito.correccion.tarjetas.motivo')}
                </span>
                <p className="text-sm text-slate-700 dark:text-slate-200">{preview.tarjetas.motivo}</p>
              </div>

              {/* RN2 REQ-490 — si queda pendiente, dejar explícito que NO se generó ningún
                  documento fiscal todavía y que la factura original sigue activa. */}
              {preview.requiere_aprobacion && (
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg text-amber-700 dark:text-amber-300 text-xs">
                  <IcoAlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {t('notasCredito.correccion.pendienteAprobacionAviso')}
                </div>
              )}

              <div>
                <Button variant="secondary" onClick={() => setFacturaVisible(v => !v)}>
                  <span className="inline-flex items-center gap-1.5">
                    <IcoEye size={13} />
                    {facturaVisible ? t('notasCredito.correccion.ocultarFacturaButton') : t('notasCredito.correccion.verFacturaButton')}
                  </span>
                </Button>
              </div>

              {facturaVisible && (
                <div className="rounded-lg border border-slate-100 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/20">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    {preview.factura_preview.order_number} {preview.factura_preview.cliente ? `— ${preview.factura_preview.cliente}` : ''}
                  </div>
                  <FiscalItemsTable items={preview.factura_preview.items} t={t} />
                  <FiscalTotalsBlock
                    subtotal={preview.factura_preview.subtotal}
                    descuentos={preview.factura_preview.descuentos}
                    itbms={preview.factura_preview.itbms}
                    total={preview.factura_preview.total}
                    monto={preview.factura_preview.monto}
                    t={t}
                  />
                  {(preview.factura_preview.cuenta_pago || preview.factura_preview.responsable) && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 space-y-0.5">
                      {preview.factura_preview.cuenta_pago && <div>{t('adminContab:facturacion.detalle.cuentaPago')}: {preview.factura_preview.cuenta_pago}</div>}
                      {preview.factura_preview.responsable && <div>{t('adminContab:facturacion.detalle.responsable')}: {preview.factura_preview.responsable}</div>}
                    </div>
                  )}
                </div>
              )}

              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('notasCredito.formulario.comprobanteLabel')}
                  <span className="text-red-500"> *</span>
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500 dark:text-slate-400 cursor-pointer hover:border-primary">
                    <IcoPaperclip size={14} />
                    {comprobante ? comprobante.name : t('notasCredito.formulario.comprobantePlaceholder')}
                    <input
                      type="file" className="hidden" accept={COMPROBANTE_ACCEPTED.join(',')}
                      onChange={e => pickComprobante(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </label>
            </>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onBack}>
            {t('notasCredito.correccion.volverButton')}
          </Button>
          <Button
            disabled={!preview || comprobante === null || registerMutation.isPending}
            loading={registerMutation.isPending}
            onClick={handleConfirmar}
          >
            {t('notasCredito.correccion.confirmarButton')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
