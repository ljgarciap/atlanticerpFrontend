import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { usePaymentDetail, useDownloadPaymentReceipt, useConfirmPayment, useConfirmPaymentPreview, useRequestPaymentVoid, useUpdatePaymentDatos } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPaperclip, IcoPrinter, IcoCheck } from '@/components/icons'
import VerComprobanteModal from './VerComprobanteModal'
import InvoiceDetailModal from './InvoiceDetailModal'
import DetalleNotaCreditoModal from './DetalleNotaCreditoModal'
import RegistrarAbonoModal from './RegistrarAbonoModal'
import QuoteViewerModal from '@/components/QuoteViewerModal'
import GuiaEntregaModal from '@/components/GuiaEntregaModal'
import { formatDateShort } from '@/utils/dates'
import type { ConfirmacionAjustes } from '@/types/adminContab'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

// SCRUM-787 — `formatDate()` local eliminado, reemplazado por `formatDateShort()` compartido
// (`@/utils/dates`), mismo criterio ya aplicado en Notas Crédito.

interface Props {
  paymentId: number
  onClose: () => void
}

/**
 * Batch 6 del cuerpo principal (SCRUM-548, REQ-471) — modal de detalle de un cobro. Batch 7
 * (SCRUM-549/550/552, REQ-472/473/475) agrega las 3 acciones del footer: "Marcar como confirmado"
 * (solo cuando `estado === 'esperando_confirmacion'`, RN1 REQ-475 — desaparece apenas se confirma),
 * "Ver comprobante" y "Ver recibo".
 */
export default function DetalleCobroModal({ paymentId, onClose }: Props) {
  const { t } = useTranslation('adminContab')
  const { data: payment, isLoading, isError } = usePaymentDetail(paymentId)
  const [comprobanteOpen, setComprobanteOpen] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const downloadReceipt = useDownloadPaymentReceipt()
  const confirmMutation  = useConfirmPayment()
  const previewMutation  = useConfirmPaymentPreview()
  // SCRUM-1168 F4 — pedir la anulación del cobro (la decide Gerencia): motivo obligatorio.
  const voidMutation = useRequestPaymentVoid()
  // SCRUM-1168 F5 — después de confirmado solo se corrigen referencia y comprobante.
  const datosMutation = useUpdatePaymentDatos()
  const [editOpen, setEditOpen]     = useState(false)
  const [editRef, setEditRef]       = useState('')
  const [editFile, setEditFile]     = useState<File | null>(null)
  const [editHecho, setEditHecho]   = useState(false)
  const [anularOpen, setAnularOpen]       = useState(false)
  const [anularMotivo, setAnularMotivo]   = useState('')
  const [anularEnviada, setAnularEnviada] = useState(false)
  const [anularError, setAnularError]     = useState<string | null>(null)
  // SCRUM-1168 F0 — implicación de confirmar (antes) y lo que se ajustó (después): el dinero ya entró, lo que no cabe en la factura
  // pasa a saldo a favor del cliente; el usuario lo ve antes de confirmar y queda a la vista tras hacerlo.
  const [ajustesPrevios, setAjustesPrevios] = useState<ConfirmacionAjustes | null>(null)
  const [ajustesAplicados, setAjustesAplicados] = useState<ConfirmacionAjustes | null>(null)

  // SCRUM-931 — Cotización/Guía de Entrega/Abono/Nota de Crédito, cada uno abre su modal de
  // detalle ya existente (ver ADR-SCRUM931) — uno a la vez, los 4 tipos son mutuamente
  // excluyentes en la UI.
  const [detailOrderId, setDetailOrderId]   = useState<number | null>(null)
  const [detailInvoiceId, setDetailInvoiceId] = useState<number | null>(null)
  const [quoteId, setQuoteId]     = useState<number | null>(null)
  const [guiaOrderId, setGuiaOrderId] = useState<number | null>(null)
  const [abonoId, setAbonoId]     = useState<number | null>(null)
  const [notaId, setNotaId]       = useState<number | null>(null)

  // SCRUM-931 — un cobro cubre N facturas, cada una con su propia Cotización/Guía; se deduplican
  // por id (no asume cardinalidad 1, ver ADR-SCRUM931).
  const cotizaciones = useMemo(() => {
    const byId = new Map<number, string | null>()
    for (const f of payment?.facturas ?? []) {
      if (f.quote_id !== null) byId.set(f.quote_id, f.cotizacion_folio)
    }
    return Array.from(byId, ([id, folio]) => ({ id, folio }))
  }, [payment])

  const guiasEntrega = useMemo(() => {
    const byId = new Map<number, string | null>()
    for (const f of payment?.facturas ?? []) {
      if (f.guia_entrega_order_id !== null) byId.set(f.guia_entrega_order_id, f.guia_entrega_numero)
    }
    return Array.from(byId, ([orderId, numero]) => ({ orderId, numero }))
  }, [payment])

  function verRecibo() {
    if (!payment) return
    downloadReceipt.mutate({ id: payment.id, numeroRecibo: payment.numero_recibo })
  }

  function confirmarAhora() {
    if (!payment) return
    setConfirmError(null)
    setAjustesPrevios(null)
    confirmMutation.mutate(payment.id, {
      onSuccess: (confirmed) => setAjustesAplicados(confirmed.ajustes_confirmacion ?? null),
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setConfirmError(msg ?? t('cobros.detalle.confirmarError'))
      },
    })
  }

  // Primero se consulta qué pasaría: si se aplica tal cual, se confirma directo (como siempre); si parte pasa a saldo a favor,
  // se le muestra al usuario y confirma él.
  function marcarConfirmado() {
    if (!payment) return
    setConfirmError(null)
    previewMutation.mutate(payment.id, {
      onSuccess: (preview) => {
        if (preview.ajustes_confirmacion === null) {
          confirmarAhora()
        } else {
          setAjustesPrevios(preview.ajustes_confirmacion)
        }
      },
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setConfirmError(msg ?? t('cobros.detalle.confirmarError'))
      },
    })
  }

  function guardarDatos() {
    if (!payment || (editRef.trim() === '' && editFile === null)) return
    setAnularError(null)
    const form = new FormData()
    if (editRef.trim() !== '') form.append('referencia', editRef.trim())
    if (editFile) form.append('comprobante', editFile)
    datosMutation.mutate({ id: payment.id, form }, {
      onSuccess: () => { setEditHecho(true); setEditOpen(false); setEditFile(null) },
      onError: (err) => setAnularError((isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined) ?? t('cobros.detalle.editar.error')),
    })
  }

  function enviarAnulacion() {
    if (!payment || anularMotivo.trim() === '') return
    setAnularError(null)
    voidMutation.mutate({ id: payment.id, motivo: anularMotivo.trim() }, {
      onSuccess: () => { setAnularEnviada(true); setAnularOpen(false); setAnularMotivo('') },
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setAnularError(msg ?? t('cobros.detalle.anular.error'))
      },
    })
  }

  function AjustesDetalle({ ajustes }: { ajustes: ConfirmacionAjustes }) {
    return (
      <ul className="list-disc pl-5 space-y-0.5">
        {ajustes.facturas.map(f => (
          <li key={f.numero}>{t('cobros.detalle.ajustes.facturaLinea', { numero: f.numero, aplicado: formatCurrency(f.aplicado), solicitado: formatCurrency(f.solicitado) })}</li>
        ))}
        {ajustes.excedente_a_saldo_favor > 0 && (
          <li>{t('cobros.detalle.ajustes.excedente', { monto: formatCurrency(ajustes.excedente_a_saldo_favor) })}</li>
        )}
        {ajustes.saldo_insuficiente > 0 && (
          <li>{t('cobros.detalle.ajustes.saldoInsuficiente', { monto: formatCurrency(ajustes.saldo_insuficiente) })}</li>
        )}
      </ul>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-2xl my-8">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {payment ? `${payment.numero_recibo} — ${payment.cliente ?? ''}` : t('cobros.detalle.title')}
            </h2>
            {payment && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {formatDateShort(payment.created_at)} · {t(`cobros.metodos.${payment.metodo_pago}`)}
              </p>
            )}
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {isLoading && <p className="text-sm text-slate-400">…</p>}
          {isError && <p className="text-sm text-red-600">{t('cobros.detalle.error')}</p>}

          {payment && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <DetailField label={t('cobros.detalle.montoTotal')} value={formatCurrency(payment.monto_recibido)} />
                <DetailField label={t('cobros.detalle.estado')} value={t(`cobros.historial.estados.${payment.estado}`)} />
                <DetailField label={t('cobros.detalle.registradoPor')} value={payment.registrado_por ?? '—'} />
                <DetailField label={t('cobros.detalle.referencia')} value={payment.referencia ?? '—'} />
                <DetailField label={t('cobros.detalle.numeroRecibo')} value={payment.numero_recibo} />
                <DetailField label={t('cobros.detalle.fechaRegistro')} value={formatDateShort(payment.created_at)} />
                <DetailField label={t('cobros.detalle.cuentaBancaria')} value={payment.bank_account ?? '—'} />
                {payment.saldo_favor_aplicado > 0 && (
                  <DetailField label={t('cobros.detalle.saldoFavorAplicado')} value={`-${formatCurrency(payment.saldo_favor_aplicado)}`} />
                )}
                {payment.comentario_ajuste && (
                  <div className="col-span-2 sm:col-span-3">
                    <DetailField label={t('cobros.detalle.comentarioAjuste')} value={payment.comentario_ajuste} />
                  </div>
                )}
                {payment.confirmacion && (
                  <div className="col-span-2 sm:col-span-3">
                    <DetailField
                      label={t('cobros.detalle.confirmacion')}
                      value={t('cobros.detalle.confirmadoPorLine', {
                        numero: payment.confirmacion.numero_confirmacion,
                        nombre: payment.confirmacion.confirmado_por ?? '—',
                        fecha: formatDateShort(payment.confirmacion.confirmado_at),
                      })}
                    />
                  </div>
                )}
              </div>

              {/* SCRUM-1168 F4 — estado de la anulación: anulado, solicitud pendiente de Gerencia o solicitud rechazada. */}
              {payment.estado === 'anulado' && (
                <div role="status" data-testid="cobro-anulado" className="mt-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700 px-3 py-2 text-sm text-red-900 dark:text-red-200">
                  <p className="font-semibold">{t('cobros.detalle.anular.anuladoTitulo')}</p>
                  <p>{t('cobros.detalle.anular.anuladoDetalle', { fecha: payment.anulado_at ? formatDateShort(payment.anulado_at) : '—', motivo: payment.motivo_anulacion ?? '—' })}</p>
                </div>
              )}
              {payment.estado !== 'anulado' && (payment.solicitud_anulacion?.estado === 'solicitada' || anularEnviada) && (
                <div role="status" data-testid="cobro-anulacion-pendiente" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                  <p className="font-semibold">{t('cobros.detalle.anular.pendienteTitulo')}</p>
                  <p>{anularEnviada && !payment.solicitud_anulacion ? t('cobros.detalle.anular.enviada') : t('cobros.detalle.anular.pendienteDetalle', { motivo: payment.solicitud_anulacion?.motivo ?? '' })}</p>
                </div>
              )}
              {payment.estado !== 'anulado' && payment.solicitud_anulacion?.estado === 'rechazada' && !anularEnviada && (
                <div data-testid="cobro-anulacion-rechazada" className="mt-3 rounded-lg border border-slate-300 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                  <p className="font-semibold">{t('cobros.detalle.anular.rechazadaTitulo')}</p>
                  <p>{t('cobros.detalle.anular.rechazadaDetalle', { motivo: payment.solicitud_anulacion.motivo_rechazo ?? '—' })}</p>
                </div>
              )}
              {editHecho && <p role="status" data-testid="cobro-datos-guardados" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{t('cobros.detalle.editar.guardado')}</p>}
              {editOpen && (
                <div data-testid="cobro-editar-form" className="mt-3 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm">
                  <p className="font-semibold">{t('cobros.detalle.editar.titulo')}</p>
                  <p className="text-[11px] text-slate-500 mb-2">{t('cobros.detalle.editar.ayuda')}</p>
                  <input value={editRef} onChange={e => setEditRef(e.target.value)} placeholder={t('cobros.detalle.editar.referencia')} aria-label={t('cobros.detalle.editar.referencia')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 mb-2" />
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setEditFile(e.target.files?.[0] ?? null)} aria-label={t('cobros.detalle.editar.comprobante')} className="text-xs" />
                  <div className="mt-2 flex gap-2">
                    <Button variant="accent" onClick={guardarDatos} disabled={editRef.trim() === '' && editFile === null} loading={datosMutation.isPending}>{t('cobros.detalle.editar.guardar')}</Button>
                    <Button variant="secondary" onClick={() => setEditOpen(false)}>{t('cobros.detalle.anular.cancelar')}</Button>
                  </div>
                </div>
              )}
              {anularOpen && (
                <div data-testid="cobro-anular-form" className="mt-3 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm">
                  <p className="font-semibold">{t('cobros.detalle.anular.titulo')}</p>
                  <p className="text-[11px] text-slate-500 mb-2">{t('cobros.detalle.anular.ayuda')}</p>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('cobros.detalle.anular.motivoLabel')}</label>
                  <textarea
                    value={anularMotivo} onChange={e => setAnularMotivo(e.target.value)} rows={2} placeholder={t('cobros.detalle.anular.motivoPlaceholder')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button variant="accent" onClick={enviarAnulacion} disabled={anularMotivo.trim() === ''} loading={voidMutation.isPending}>{t('cobros.detalle.anular.enviar')}</Button>
                    <Button variant="secondary" onClick={() => { setAnularOpen(false); setAnularError(null) }}>{t('cobros.detalle.anular.cancelar')}</Button>
                  </div>
                </div>
              )}
              {anularError && <p role="alert" className="text-red-600 text-sm mt-2">{anularError}</p>}

              {payment.cobros_v2 && payment.saldo_sin_aplicar != null && payment.saldo_sin_aplicar > 0 && (
                <div data-testid="cobro-saldo-sin-aplicar" className="mt-3 rounded-lg bg-primary-soft/60 dark:bg-slate-700/40 px-3 py-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{t('cobros.detalle.saldoSinAplicar')}</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(payment.saldo_sin_aplicar)}</span>
                </div>
              )}

              {confirmError && <p className="text-red-600 text-sm mt-3">{confirmError}</p>}

              {ajustesPrevios && (
                <div role="alert" data-testid="cobro-ajustes-previos" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                  <p className="font-semibold mb-1">{t('cobros.detalle.ajustes.tituloPrevio')}</p>
                  <AjustesDetalle ajustes={ajustesPrevios} />
                  <div className="mt-2 flex gap-2">
                    <Button variant="accent" onClick={confirmarAhora} loading={confirmMutation.isPending}>{t('cobros.detalle.ajustes.confirmarIgual')}</Button>
                    <Button variant="secondary" onClick={() => setAjustesPrevios(null)}>{t('cobros.detalle.ajustes.cancelar')}</Button>
                  </div>
                </div>
              )}

              {ajustesAplicados && (
                <div role="status" data-testid="cobro-ajustes-aplicados" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                  <p className="font-semibold mb-1">{t('cobros.detalle.ajustes.tituloAplicado')}</p>
                  <AjustesDetalle ajustes={ajustesAplicados} />
                </div>
              )}

              <div className="mt-4">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                  {t('cobros.detalle.facturasAplicadas')}
                </span>
                {payment.facturas.length === 0 && (
                  <p data-testid="cobro-sin-facturas" className="text-sm text-slate-500 dark:text-slate-400">{t('cobros.detalle.sinFacturas')}</p>
                )}
                <div className="flex flex-col gap-1.5">
                  {payment.facturas.map(f => (
                    <div key={f.invoice_id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 text-sm">
                      <DocLink
                        label={f.numero}
                        onClick={f.order_id !== null ? () => { setDetailOrderId(f.order_id); setDetailInvoiceId(f.invoice_id) } : null}
                      />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(f.monto_aplicado)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SCRUM-931 — Cotización/Guía de Entrega/Abonos/Notas de Crédito asociados; cada
                  sección solo aparece si hay datos (AC explícito del ticket, nunca placeholder
                  inventado). */}
              {cotizaciones.length > 0 && (
                <DetalleSection label={t('cobros.detalle.cotizaciones')}>
                  {cotizaciones.map(c => (
                    <DocChip key={c.id} label={c.folio ?? `#${c.id}`} onClick={() => setQuoteId(c.id)} />
                  ))}
                </DetalleSection>
              )}
              {guiasEntrega.length > 0 && (
                <DetalleSection label={t('cobros.detalle.guiasEntrega')}>
                  {guiasEntrega.map(g => (
                    <DocChip key={g.orderId} label={g.numero ?? `#${g.orderId}`} onClick={() => setGuiaOrderId(g.orderId)} />
                  ))}
                </DetalleSection>
              )}
              {payment.abonos.length > 0 && (
                <DetalleSection label={t('cobros.detalle.abonos')}>
                  {payment.abonos.map(id => (
                    <DocChip key={id} label={t('cobros.detalle.abonoNumero', { id })} onClick={() => setAbonoId(id)} />
                  ))}
                </DetalleSection>
              )}
              {payment.notas_credito.length > 0 && (
                <DetalleSection label={t('cobros.detalle.notasCredito')}>
                  {payment.notas_credito.map(n => (
                    <DocChip key={n.id} label={n.numero} onClick={() => setNotaId(n.id)} />
                  ))}
                </DetalleSection>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('cobros.detalle.cerrar')}</Button>
          {/* Los 3 botones de acción dependen de `payment` — ocultos por completo mientras carga,
              nunca visibles-pero-deshabilitados (RN1 REQ-475 ya seguía este criterio, acá se
              extiende a los otros 2). */}
          {payment && payment.estado !== 'anulado' && !editOpen && (
            <Button variant="secondary" onClick={() => { setEditOpen(true); setEditHecho(false); setEditRef(payment.referencia ?? '') }} data-testid="cobro-editar-boton">{t('cobros.detalle.editar.boton')}</Button>
          )}
          {payment && payment.estado !== 'anulado' && payment.solicitud_anulacion?.estado !== 'solicitada' && !anularEnviada && !anularOpen && (
            <Button variant="secondary" onClick={() => setAnularOpen(true)} data-testid="cobro-anular-boton">{t('cobros.detalle.anular.boton')}</Button>
          )}
          {payment && payment.estado === 'esperando_confirmacion' && (
            <Button variant="accent" onClick={marcarConfirmado} loading={confirmMutation.isPending || previewMutation.isPending}>
              <span className="inline-flex items-center gap-1.5"><IcoCheck size={13} />{t('cobros.detalle.marcarConfirmado')}</span>
            </Button>
          )}
          {payment && (
            <>
              <Button variant="secondary" onClick={() => setComprobanteOpen(true)}>
                <span className="inline-flex items-center gap-1.5"><IcoPaperclip size={13} />{t('cobros.detalle.verComprobante')}</span>
              </Button>
              <Button onClick={verRecibo} loading={downloadReceipt.isPending}>
                <span className="inline-flex items-center gap-1.5"><IcoPrinter size={13} />{t('cobros.detalle.verRecibo')}</span>
              </Button>
            </>
          )}
        </div>
      </Card>

      {comprobanteOpen && payment && (
        <VerComprobanteModal paymentId={payment.id} onClose={() => setComprobanteOpen(false)} />
      )}

      {/* SCRUM-931 — modales de detalle, ya reusables tal cual desde otras pantallas. */}
      {detailOrderId !== null && (
        <InvoiceDetailModal
          orderId={detailOrderId} invoiceId={detailInvoiceId} t={t}
          onClose={() => { setDetailOrderId(null); setDetailInvoiceId(null) }}
        />
      )}
      {quoteId !== null && <QuoteViewerModal quoteId={quoteId} onClose={() => setQuoteId(null)} />}
      {guiaOrderId !== null && <GuiaEntregaModal orderId={guiaOrderId} onClose={() => setGuiaOrderId(null)} />}
      {abonoId !== null && <RegistrarAbonoModal abonoId={abonoId} onClose={() => setAbonoId(null)} onSaved={() => setAbonoId(null)} />}
      {notaId !== null && <DetalleNotaCreditoModal notaId={notaId} onClose={() => setNotaId(null)} />}
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 dark:text-slate-100 mt-0.5">{value}</div>
    </div>
  )
}

/** SCRUM-931 — número de documento como botón-link cuando hay id para enlazar; texto plano si no
 *  hay id — mismo criterio que `DocLink` en `EstadoCuentaPage.tsx` (SCRUM-930). */
function DocLink({ label, onClick }: { label: string | null; onClick: (() => void) | null }) {
  if (!label) return <span className="text-slate-700 dark:text-slate-200">—</span>
  if (!onClick) return <span className="text-slate-700 dark:text-slate-200">{label}</span>
  return (
    <button type="button" onClick={onClick} className="text-primary-dark hover:underline font-medium">
      {label}
    </button>
  )
}

function DetalleSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function DocChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="px-2.5 py-1 rounded-full bg-slate-50 dark:bg-slate-700/40 text-primary-dark text-xs font-medium hover:underline"
    >
      {label}
    </button>
  )
}
