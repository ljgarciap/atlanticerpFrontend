import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { useCompensacionCliente, usePreviewCompensacion, useConfirmCompensacion, useReverseCompensacion, useUnapplyMovement, useRequestRefund, useBankAccounts } from '@/hooks/useAdminContab'
import { adminContabApi } from '@/api/adminContabApi'
import type { Compensacion, CompensacionFuente, CompensacionFactura, CompensacionLinea, CompensacionVistaPrevia } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { formatDateShort } from '@/utils/dates'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

function parseMonto(text: string): number {
  const n = Number(text.replace(',', '.').trim())
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

/**
 * Convierte lo que el usuario decidió por FACTURA en líneas fuente→factura: cada factura toma el dinero de las fuentes de la más antigua a la más
 * reciente (el mismo orden en que las trae el servidor). `faltante` > 0 = se pidió más de lo que hay disponible.
 */
export function armarLineas(
  fuentes: CompensacionFuente[], facturas: CompensacionFactura[], montos: Record<number, string>,
): { lines: CompensacionLinea[]; faltante: number } {
  const left = fuentes.map(f => ({ f, left: f.disponible }))
  const lines: CompensacionLinea[] = []
  let faltante = 0

  for (const factura of facturas) {
    let need = parseMonto(montos[factura.id] ?? '')
    for (const src of left) {
      if (need <= 0.004) break
      if (src.left <= 0.004) continue
      const take = Math.round(Math.min(need, src.left) * 100) / 100
      lines.push({ source_type: src.f.source_type, source_id: src.f.source_id, invoice_id: factura.id, monto: take })
      src.left = Math.round((src.left - take) * 100) / 100
      need = Math.round((need - take) * 100) / 100
    }
    if (need > 0.004) faltante = Math.round((faltante + need) * 100) / 100
  }

  return { lines, faltante }
}

interface Props {
  masterClientId: number
  onClose: () => void
}

/**
 * SCRUM-1168 F3 — cruce de UN cliente: qué dinero tiene a favor, qué facturas debe, y a cuáles aplicarlo (total o parcial). El sistema solo sugiere;
 * Contabilidad decide el monto por factura, ve cómo quedaría todo (vista previa) y recién al confirmar se compromete. Nada cambia antes de confirmar.
 */
export default function CompensacionClienteModal({ masterClientId, onClose }: Props) {
  const { t } = useTranslation('adminContab')
  const { data: detalle, isLoading, isError } = useCompensacionCliente(masterClientId)
  const previewMutation = usePreviewCompensacion()
  const confirmMutation = useConfirmCompensacion()
  // SCRUM-1168 F4 — desaplicar una aplicación o reversar un cruce completo: sin aprobación, con motivo obligatorio (queda en el libro con autor).
  const unapplyMutation  = useUnapplyMovement()
  const reverseMutation  = useReverseCompensacion()
  const [reverso, setReverso] = useState<{ kind: 'movimiento' | 'cruce'; id: number; etiqueta: string } | null>(null)
  const [reversoMotivo, setReversoMotivo] = useState('')
  const [reversoResultado, setReversoResultado] = useState<string | null>(null)

  // F5 — devolver dinero al cliente desde una fuente de su saldo a favor (lo aprueba Gerencia).
  const refundMutation = useRequestRefund()
  const { data: cuentas = [] } = useBankAccounts()
  const [devolver, setDevolver] = useState<CompensacionFuente | null>(null)
  const [devMonto, setDevMonto] = useState('')
  const [devCuenta, setDevCuenta] = useState('')
  const [devReferencia, setDevReferencia] = useState('')
  const [devMotivo, setDevMotivo] = useState('')
  const [devArchivo, setDevArchivo] = useState<File | null>(null)
  const [devResultado, setDevResultado] = useState<string | null>(null)

  const [montos, setMontos] = useState<Record<number, string>>({})
  const [vistaPrevia, setVistaPrevia] = useState<CompensacionVistaPrevia | null>(null)
  const [confirmada, setConfirmada] = useState<Compensacion | null>(null)
  const [error, setError] = useState<string | null>(null)

  const facturas = detalle?.facturas ?? []
  const fuentes  = detalle?.fuentes ?? []

  const { lines, faltante } = useMemo(() => armarLineas(fuentes, facturas, montos), [fuentes, facturas, montos])
  const totalAplicar = Math.round(lines.reduce((acc, l) => acc + l.monto, 0) * 100) / 100
  const saldoFavor   = detalle?.saldo_a_favor ?? 0
  const filaExcede   = (f: CompensacionFactura) => parseMonto(montos[f.id] ?? '') > f.pendiente + 0.005
  const algunaExcede = facturas.some(filaExcede)
  const puedeRevisar = lines.length > 0 && faltante <= 0.004 && !algunaExcede && confirmada === null

  function editar(invoiceId: number, valor: string) {
    setMontos(prev => ({ ...prev, [invoiceId]: valor }))
    setVistaPrevia(null)
    setError(null)
  }

  function usarSugerencia() {
    const porFactura: Record<number, number> = {}
    for (const l of detalle?.sugerencia ?? []) porFactura[l.invoice_id] = Math.round(((porFactura[l.invoice_id] ?? 0) + l.monto) * 100) / 100
    setMontos(Object.fromEntries(Object.entries(porFactura).map(([id, v]) => [id, String(v)])))
    setVistaPrevia(null)
    setError(null)
  }

  function mensaje(err: unknown, fallback: string): string {
    return (isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined) ?? fallback
  }

  function revisar() {
    setError(null)
    previewMutation.mutate({ masterClientId, lines }, {
      onSuccess: setVistaPrevia,
      onError: err => setError(mensaje(err, t('compensaciones.errorPreview'))),
    })
  }

  function enviarDevolucion() {
    if (!devolver || !devArchivo) return
    setError(null)
    const form = new FormData()
    form.append('source_type', devolver.source_type)
    form.append('source_id', String(devolver.source_id))
    form.append('monto', devMonto)
    form.append('bank_account_id', devCuenta)
    form.append('referencia', devReferencia.trim())
    form.append('motivo', devMotivo.trim())
    form.append('comprobante', devArchivo)
    refundMutation.mutate({ masterClientId, form }, {
      onSuccess: () => {
        setDevResultado(t('compensaciones.devolucion.enviada')); setDevolver(null)
        setDevMonto(''); setDevCuenta(''); setDevReferencia(''); setDevMotivo(''); setDevArchivo(null)
      },
      onError: err => setError(mensaje(err, t('compensaciones.devolucion.error'))),
    })
  }
  const devolucionLista = devolver !== null && Number(devMonto) > 0 && Number(devMonto) <= devolver.disponible + 0.005 && devCuenta !== '' && devReferencia.trim() !== '' && devMotivo.trim() !== '' && devArchivo !== null

  function ejecutarReverso() {
    if (!reverso || reversoMotivo.trim() === '') return
    setError(null)
    const onSuccess = () => { setReversoResultado(t('compensaciones.reverso.hecho', { etiqueta: reverso.etiqueta })); setReverso(null); setReversoMotivo(''); setVistaPrevia(null) }
    const onError = (err: unknown) => setError(mensaje(err, t('compensaciones.reverso.error')))
    if (reverso.kind === 'movimiento') unapplyMutation.mutate({ id: reverso.id, motivo: reversoMotivo.trim() }, { onSuccess, onError })
    else reverseMutation.mutate({ id: reverso.id, motivo: reversoMotivo.trim() }, { onSuccess, onError })
  }

  function confirmar() {
    setError(null)
    confirmMutation.mutate({ masterClientId, lines }, {
      onSuccess: c => { setConfirmada(c); setVistaPrevia(null); setMontos({}) },
      onError: err => { setVistaPrevia(null); setError(mensaje(err, t('compensaciones.errorConfirmar'))) },
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-4xl my-8" data-testid="compensacion-modal">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{detalle?.cliente ?? t('compensaciones.cargando')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('compensaciones.modal.subtitulo')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('compensaciones.cerrar')} className="text-slate-400 hover:text-slate-600"><IcoClose size={16} /></button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {isLoading && <p className="text-sm text-slate-400">{t('compensaciones.cargando')}</p>}
          {isError && <p className="text-sm text-red-600">{t('compensaciones.errorCargar')}</p>}

          {detalle && (
            <>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-primary-soft/60 dark:bg-slate-700/40 px-3 py-2"><div className="text-[11px] text-slate-500">{t('compensaciones.modal.saldoAFavor')}</div><div className="font-bold" data-testid="comp-saldo-a-favor">{formatCurrency(detalle.saldo_a_favor)}</div></div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2"><div className="text-[11px] text-slate-500">{t('compensaciones.modal.pendiente')}</div><div className="font-bold">{formatCurrency(detalle.pendiente)}</div></div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2"><div className="text-[11px] text-slate-500">{t('compensaciones.modal.aAplicar')}</div><div className="font-bold" data-testid="comp-total-aplicar">{formatCurrency(totalAplicar)}</div></div>
              </div>

              {confirmada && (
                <div role="status" data-testid="comp-confirmada" className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3">
                  <span>{t('compensaciones.modal.confirmada', { folio: confirmada.folio, monto: formatCurrency(confirmada.monto_total) })}</span>
                  <Button variant="secondary" onClick={() => void adminContabApi.compensaciones.downloadPdf(confirmada.id, confirmada.folio)}>{t('compensaciones.modal.descargarDocumento')}</Button>
                </div>
              )}

              {/* Fuentes del dinero */}
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('compensaciones.modal.fuentes')}</h3>
                {fuentes.length === 0 ? (
                  <p className="text-xs text-slate-400" data-testid="comp-sin-fuentes">{t('compensaciones.modal.sinFuentes')}</p>
                ) : (
                  <table className="w-full text-sm"><tbody>
                    {fuentes.map(f => (
                      <tr key={`${f.source_type}-${f.source_id}`} className="border-b border-slate-50 dark:border-slate-800">
                        <td className="py-1.5 pr-3 font-medium text-slate-700 dark:text-slate-200">{f.etiqueta}</td>
                        <td className="py-1.5 pr-3 text-slate-500 text-xs">{f.referencia ?? ''}</td>
                        <td className="py-1.5 pr-3 text-slate-500 text-xs whitespace-nowrap">{formatDateShort(f.fecha)}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold text-primary-dark">{formatCurrency(f.disponible)}</td>
                        <td className="py-1.5 text-right">
                          <button type="button" data-testid={`devolver-${f.source_type}-${f.source_id}`} onClick={() => { setDevolver(f); setDevMonto(String(f.disponible)); setDevResultado(null) }} className="text-xs text-primary-dark hover:underline">
                            {t('compensaciones.devolucion.boton')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
              </section>

              {devResultado && <p role="status" data-testid="devolucion-enviada" className="text-sm text-emerald-700 dark:text-emerald-300">{devResultado}</p>}
              {devolver && (
                <div data-testid="devolucion-form" className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm space-y-2">
                  <p className="font-semibold">{t('compensaciones.devolucion.titulo', { etiqueta: devolver.etiqueta })}</p>
                  <p className="text-[11px] text-slate-500">{t('compensaciones.devolucion.ayuda')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" step="0.01" value={devMonto} onChange={e => setDevMonto(e.target.value)} aria-label={t('compensaciones.devolucion.monto')} placeholder={t('compensaciones.devolucion.monto')} className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2" />
                    <select value={devCuenta} onChange={e => setDevCuenta(e.target.value)} aria-label={t('compensaciones.devolucion.cuenta')} className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2">
                      <option value="">{t('compensaciones.devolucion.cuenta')}</option>
                      {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco} · {c.ultimos_4_digitos}</option>)}
                    </select>
                    <input value={devReferencia} onChange={e => setDevReferencia(e.target.value)} aria-label={t('compensaciones.devolucion.referencia')} placeholder={t('compensaciones.devolucion.referencia')} className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2" />
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setDevArchivo(e.target.files?.[0] ?? null)} aria-label={t('compensaciones.devolucion.comprobante')} className="text-xs" />
                  </div>
                  <textarea value={devMotivo} onChange={e => setDevMotivo(e.target.value)} rows={2} placeholder={t('compensaciones.devolucion.motivo')} className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2" />
                  <div className="flex gap-2">
                    <Button variant="accent" onClick={enviarDevolucion} disabled={!devolucionLista} loading={refundMutation.isPending}>{t('compensaciones.devolucion.enviar')}</Button>
                    <Button variant="secondary" onClick={() => setDevolver(null)}>{t('compensaciones.devolucion.cancelar')}</Button>
                  </div>
                </div>
              )}

              {/* Facturas pendientes y monto a aplicar */}
              <section>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('compensaciones.modal.facturas')}</h3>
                  <div className="flex gap-3 text-xs">
                    <button type="button" onClick={usarSugerencia} disabled={(detalle.sugerencia ?? []).length === 0} className="text-primary-dark hover:underline disabled:opacity-40">{t('compensaciones.modal.usarSugerencia')}</button>
                    <button type="button" onClick={() => { setMontos({}); setVistaPrevia(null) }} className="text-slate-500 hover:underline">{t('compensaciones.modal.limpiar')}</button>
                  </div>
                </div>
                {facturas.length === 0 ? (
                  <p className="text-xs text-slate-400" data-testid="comp-sin-facturas">{t('compensaciones.modal.sinFacturas')}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[11px] uppercase text-slate-400"><th className="py-1 pr-3">{t('compensaciones.modal.colFactura')}</th><th className="py-1 pr-3">{t('compensaciones.modal.colProyecto')}</th><th className="py-1 pr-3 text-right">{t('compensaciones.modal.colPendiente')}</th><th className="py-1 text-right">{t('compensaciones.modal.colAplicar')}</th></tr></thead>
                    <tbody>
                      {facturas.map(f => (
                        <tr key={f.id} className="border-b border-slate-50 dark:border-slate-800" data-testid={`comp-factura-${f.id}`}>
                          <td className="py-1.5 pr-3"><div className="font-medium text-slate-700 dark:text-slate-200">{f.numero}</div><div className="text-[11px] text-slate-400">{formatDateShort(f.fecha)}</div></td>
                          <td className="py-1.5 pr-3 text-xs text-slate-500">{[f.proyecto, f.cotizacion_folio].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="py-1.5 pr-3 text-right">{formatCurrency(f.pendiente)}</td>
                          <td className="py-1.5 text-right">
                            <input
                              type="text" inputMode="decimal" placeholder="$0.00" value={montos[f.id] ?? ''}
                              aria-label={t('compensaciones.modal.montoAAplicar', { numero: f.numero })}
                              onChange={e => editar(f.id, e.target.value)}
                              className={`w-28 rounded-md border px-2 py-1 text-sm text-right dark:bg-slate-900 ${filaExcede(f) ? 'border-red-400' : 'border-slate-200 dark:border-slate-600'}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {algunaExcede && <p className="text-[11px] text-red-600 mt-1">{t('compensaciones.modal.excedeFactura')}</p>}
                {faltante > 0.004 && <p className="text-[11px] text-red-600 mt-1" data-testid="comp-faltante">{t('compensaciones.modal.excedeSaldo', { monto: formatCurrency(saldoFavor) })}</p>}
              </section>

              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

              {/* Vista previa antes de confirmar */}
              {vistaPrevia && (
                <div data-testid="comp-vista-previa" className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                  <p className="font-semibold mb-1">{t('compensaciones.modal.previaTitulo')}</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {vistaPrevia.facturas.map(f => (
                      <li key={f.id}>{t('compensaciones.modal.previaFactura', { numero: f.numero, aplicado: formatCurrency(f.aplicado), despues: formatCurrency(f.pendiente_despues) })}</li>
                    ))}
                    <li>{t('compensaciones.modal.previaSaldo', { antes: formatCurrency(vistaPrevia.saldo_a_favor_antes), despues: formatCurrency(vistaPrevia.saldo_a_favor_despues) })}</li>
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <Button variant="accent" onClick={confirmar} loading={confirmMutation.isPending}>{t('compensaciones.modal.confirmar')}</Button>
                    <Button variant="secondary" onClick={() => setVistaPrevia(null)}>{t('compensaciones.modal.volver')}</Button>
                  </div>
                </div>
              )}

              {reversoResultado && <p role="status" data-testid="reverso-hecho" className="text-sm text-emerald-700 dark:text-emerald-300">{reversoResultado}</p>}
              {reverso && (
                <div data-testid="reverso-form" className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm">
                  <p className="font-semibold">{reverso.kind === 'cruce' ? t('compensaciones.reverso.tituloCruce', { etiqueta: reverso.etiqueta }) : t('compensaciones.reverso.tituloMovimiento', { etiqueta: reverso.etiqueta })}</p>
                  <p className="text-[11px] text-slate-500 mb-2">{t('compensaciones.reverso.ayuda')}</p>
                  <textarea value={reversoMotivo} onChange={e => setReversoMotivo(e.target.value)} rows={2} placeholder={t('compensaciones.reverso.motivo')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm" />
                  <div className="mt-2 flex gap-2">
                    <Button variant="accent" onClick={ejecutarReverso} disabled={reversoMotivo.trim() === ''} loading={unapplyMutation.isPending || reverseMutation.isPending}>{t('compensaciones.reverso.confirmar')}</Button>
                    <Button variant="secondary" onClick={() => { setReverso(null); setReversoMotivo('') }}>{t('compensaciones.reverso.cancelar')}</Button>
                  </div>
                </div>
              )}

              {/* Traza y cruces anteriores */}
              <details className="text-sm">
                <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('compensaciones.modal.traza')}</summary>
                <table className="w-full text-xs mt-2"><tbody>
                  {detalle.movimientos.map(m => (
                    <tr key={m.id} className="border-b border-slate-50 dark:border-slate-800">
                      <td className="py-1 pr-2 whitespace-nowrap text-slate-500">{formatDateShort(m.fecha)}</td>
                      <td className="py-1 pr-2 font-medium">{t(`compensaciones.tiposMovimiento.${m.tipo}`, { defaultValue: m.tipo })}</td>
                      <td className="py-1 pr-2 text-slate-500">{[m.cobro, m.abono, m.factura, m.compensacion, m.motivo].filter(Boolean).join(' · ')}</td>
                      <td className="py-1 pr-2 text-slate-500">{m.usuario ?? ''}</td>
                      <td className={`py-1 pr-2 text-right ${m.delta_disponible < 0 ? 'text-red-600' : 'text-primary-dark'}`}>{m.delta_disponible !== 0 ? formatCurrency(m.delta_disponible) : formatCurrency(m.monto)}</td>
                      <td className="py-1 text-right whitespace-nowrap">
                        {m.reversado && <span className="text-[10.5px] text-slate-400">{t('compensaciones.reverso.reversado')}</span>}
                        {m.reversible && (
                          <button type="button" data-testid={`desaplicar-${m.id}`} onClick={() => { setReverso({ kind: 'movimiento', id: m.id, etiqueta: [m.factura, formatCurrency(m.monto)].filter(Boolean).join(' · ') }); setReversoResultado(null) }} className="text-primary-dark hover:underline">
                            {t('compensaciones.reverso.desaplicar')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody></table>
                {detalle.compensaciones.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('compensaciones.modal.cruces')}</h4>
                    {detalle.compensaciones.map(c => (
                      <div key={c.id} className="flex items-center justify-between py-1 text-xs">
                        <span>{c.folio} · {formatDateShort(c.confirmed_at)} · {formatCurrency(c.monto_total)}{c.estado === 'reversado' ? ` · ${t('compensaciones.reverso.reversado')}` : ''}</span>
                        <span className="flex gap-3">
                          {c.estado === 'confirmado' && (
                            <button type="button" data-testid={`reversar-cruce-${c.id}`} onClick={() => { setReverso({ kind: 'cruce', id: c.id, etiqueta: c.folio }); setReversoResultado(null) }} className="text-red-600 hover:underline">{t('compensaciones.reverso.reversarCruce')}</button>
                          )}
                          <button type="button" onClick={() => void adminContabApi.compensaciones.downloadPdf(c.id, c.folio)} className="text-primary-dark hover:underline">{t('compensaciones.modal.descargarDocumento')}</button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('compensaciones.cerrar')}</Button>
          <Button onClick={revisar} disabled={!puedeRevisar} loading={previewMutation.isPending}>{t('compensaciones.modal.revisar')}</Button>
        </div>
      </Card>
    </div>
  )
}
