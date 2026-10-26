import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  usePaymentClients, useOpenInvoices, useDefaultBankAccount, useBankAccounts, useRegisterPaymentV2,
} from '@/hooks/useAdminContab'
import { PAYMENT_METHODS, PAYMENT_METHODS_SIN_CUENTA_BANCARIA } from '@/types/adminContab'
import type { PaymentMethod, PaymentClientOption } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoSearch } from '@/components/icons'
import { getRegion } from '@/lib/region'

const COMPROBANTE_MAX_BYTES = 10 * 1024 * 1024
const COMPROBANTE_ACCEPTED  = ['image/jpeg', 'image/png', 'application/pdf']
/** Métodos que no se aplican a facturas hasta que alguien confirma que el dinero entró al banco. */
const METODOS_CONFIRMACION_INMEDIATA: PaymentMethod[] = ['efectivo', 'retencion_impuestos', 'ajuste_cuenta']

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(getRegion().locale, { style: 'currency', currency: getRegion().currency }).format(value)
}

/** Texto de un input de monto → número con 2 decimales; vacío o inválido = 0. */
function parseMonto(text: string): number {
  const n = Number(text.replace(',', '.').trim())
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0
}

interface Props {
  /** Apertura desde Facturación: llega con el cliente ya elegido. */
  initialMasterClientId?: number | null
  onClose:      () => void
  onRegistered: () => void
}

/**
 * SCRUM-1168 F2 — «Registrar cobro» con el concepto nuevo: un cobro es DINERO QUE ENTRA (cliente, monto, método). Si el usuario ya sabe a qué
 * facturas va, las aplica en el acto con el monto que decida (parcial permitido); lo que no se aplica queda como saldo a favor del cliente,
 * a la espera de la compensación. El resumen muestra esa implicación antes de registrar.
 */
export default function RegistrarCobroV2Modal({ initialMasterClientId, onClose, onRegistered }: Props) {
  const { t } = useTranslation('adminContab')

  const [clientQuery, setClientQuery]   = useState('')
  const [clientOpen, setClientOpen]     = useState(false)
  const [masterClientId, setMasterClientId] = useState<number | null>(initialMasterClientId ?? null)
  const [monto, setMonto]               = useState('')
  const [metodoPago, setMetodoPago]     = useState<PaymentMethod>('transferencia')
  const [bankAccountId, setBankAccountId]           = useState<number | null>(null)
  const [bankAccountTouched, setBankAccountTouched] = useState(false)
  const [numeroDocumentoRetencion, setNumeroDocumentoRetencion] = useState('')
  const [comentarioAjuste, setComentarioAjuste] = useState('')
  const [referencia, setReferencia]     = useState('')
  const [comprobante, setComprobante]   = useState<File | null>(null)
  const [aplicaciones, setAplicaciones] = useState<Record<number, string>>({})
  const [error, setError]               = useState<string | null>(null)

  const { data: clientOptions = [] } = usePaymentClients(clientQuery, false, false)
  const { data: openInvoicesResult, isFetching: loadingInvoices } = useOpenInvoices(masterClientId)
  const { data: bankAccounts = [] } = useBankAccounts()
  const { data: suggestedAccount } = useDefaultBankAccount(metodoPago)
  const registerMutation = useRegisterPaymentV2()

  const invoices = openInvoicesResult?.invoices ?? []
  const sinCuentaBancaria = PAYMENT_METHODS_SIN_CUENTA_BANCARIA.includes(metodoPago)
  const confirmacionDiferida = !METODOS_CONFIRMACION_INMEDIATA.includes(metodoPago)

  const montoRecibido = parseMonto(monto)
  const totalAplicado = useMemo(
    () => Math.round(Object.values(aplicaciones).reduce((acc, text) => acc + parseMonto(text), 0) * 100) / 100,
    [aplicaciones],
  )
  const saldoAFavor = Math.round((montoRecibido - totalAplicado) * 100) / 100

  const filaExcedeFactura = (invoiceId: number, pendiente: number) => parseMonto(aplicaciones[invoiceId] ?? '') > pendiente + 0.005
  const algunaFilaExcede  = invoices.some(inv => filaExcedeFactura(inv.id, inv.saldo_pendiente))
  const aplicaMasQueElCobro = totalAplicado > montoRecibido + 0.005

  // Retención y ajuste no son dinero que entra a una cuenta: se aplican completos a facturas y no dejan saldo.
  const sinCuentaDebeAplicarTodo = sinCuentaBancaria && Math.abs(saldoAFavor) > 0.005

  // Cuenta sugerida según el método (misma regla del formulario anterior), mientras el usuario no elija una.
  useEffect(() => {
    if (!bankAccountTouched && suggestedAccount?.id !== undefined && suggestedAccount?.id !== null) {
      setBankAccountId(suggestedAccount.id)
    }
  }, [suggestedAccount, bankAccountTouched])

  useEffect(() => {
    if (initialMasterClientId === null || initialMasterClientId === undefined || openInvoicesResult === undefined) return
    if (openInvoicesResult.master_client_name) setClientQuery(openInvoicesResult.master_client_name)
    else setMasterClientId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInvoicesResult])

  function selectClient(opt: PaymentClientOption) {
    setMasterClientId(opt.id)
    setClientQuery(opt.name)
    setClientOpen(false)
    setAplicaciones({})
  }

  function pickComprobante(file: File | undefined | null) {
    if (!file) return
    if (!COMPROBANTE_ACCEPTED.includes(file.type)) { setError(t('cobros.registrarModal.comprobanteInvalidType')); return }
    if (file.size > COMPROBANTE_MAX_BYTES) { setError(t('cobros.registrarModal.comprobanteTooLarge')); return }
    setError(null)
    setComprobante(file)
  }

  /** Aplica a esa factura todo su pendiente o lo que quede del cobro, lo que sea menor. */
  function aplicarTodo(invoiceId: number, pendiente: number) {
    const yaEnOtras = Object.entries(aplicaciones).reduce((acc, [id, text]) => acc + (Number(id) === invoiceId ? 0 : parseMonto(text)), 0)
    const restante  = Math.max(0, Math.round((montoRecibido - yaEnOtras) * 100) / 100)
    const valor = Math.min(pendiente, restante)
    setAplicaciones(prev => ({ ...prev, [invoiceId]: valor > 0 ? String(valor) : '' }))
  }

  const canSubmit = masterClientId !== null && montoRecibido > 0 && !algunaFilaExcede && !aplicaMasQueElCobro && !sinCuentaDebeAplicarTodo
    && (sinCuentaBancaria || bankAccountId !== null)
    && (metodoPago !== 'ajuste_cuenta' || comentarioAjuste.trim() !== '')

  function handleSubmit() {
    if (masterClientId === null || !canSubmit) return
    setError(null)
    registerMutation.mutate({
      master_client_id: masterClientId,
      monto_recibido: montoRecibido,
      metodo_pago: metodoPago,
      bank_account_id: sinCuentaBancaria ? null : bankAccountId,
      aplicaciones: invoices
        .map(inv => ({ invoice_id: inv.id, monto: parseMonto(aplicaciones[inv.id] ?? '') }))
        .filter(a => a.monto > 0),
      numero_documento_retencion: metodoPago === 'retencion_impuestos' ? numeroDocumentoRetencion.trim() || null : null,
      comentario_ajuste: metodoPago === 'ajuste_cuenta' ? comentarioAjuste.trim() : null,
      referencia: referencia.trim() || null,
      comprobante,
    }, {
      onSuccess: onRegistered,
      onError: (err) => {
        const msg = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
        setError(msg ?? t('cobros.registrarModal.error'))
      },
    })
  }

  const inputClass = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm'
  const labelClass = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1'

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-2xl my-8" data-testid="registrar-cobro-v2">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('cobros.v2.titulo')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('cobros.v2.subtitulo')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('cobros.detalle.cerrar')} className="text-slate-400 hover:text-slate-600">
            <IcoClose size={16} />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="relative">
            <label className={labelClass}>{t('cobros.registrarModal.clienteLabel')}</label>
            <div className="relative">
              <IcoSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" value={clientQuery}
                onChange={e => { setClientQuery(e.target.value); setClientOpen(true); setMasterClientId(null) }}
                onFocus={() => setClientOpen(true)}
                onBlur={() => setTimeout(() => setClientOpen(false), 150)}
                placeholder={t('cobros.registrarModal.clientePlaceholder')}
                className={`${inputClass} pl-8`}
              />
            </div>
            {clientOpen && clientOptions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-80 overflow-auto">
                {clientOptions.map(opt => (
                  <li key={opt.id} onMouseDown={() => selectClient(opt)}
                    className="cursor-pointer px-3 py-2.5 text-sm leading-snug text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                    {opt.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-5 pb-4 pt-4 flex flex-col gap-4 max-h-[calc(70vh-90px)] overflow-y-auto">
          {masterClientId !== null && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className={labelClass}>{t('cobros.v2.montoLabel')}</span>
                  <input type="text" inputMode="decimal" value={monto} placeholder="$0.00" onChange={e => setMonto(e.target.value)} className={inputClass} data-testid="cobro-monto" />
                </label>
                <label className="text-sm">
                  <span className={labelClass}>{t('cobros.registrarModal.metodoPagoLabel')}</span>
                  <select value={metodoPago} onChange={e => setMetodoPago(e.target.value as PaymentMethod)} className={inputClass}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`cobros.metodos.${m}`)}</option>)}
                  </select>
                </label>
              </div>

              <label className="text-sm">
                <span className={labelClass}>{t('cobros.registrarModal.cuentaBancariaLabel')}</span>
                <select
                  value={sinCuentaBancaria ? '' : (bankAccountId ?? '')} disabled={sinCuentaBancaria}
                  onChange={e => { setBankAccountId(e.target.value ? Number(e.target.value) : null); setBankAccountTouched(true) }}
                  className={inputClass}
                >
                  <option value="">{sinCuentaBancaria ? t('cobros.registrarModal.cuentaBancariaOtros') : t('cobros.registrarModal.cuentaBancariaPlaceholder')}</option>
                  {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.banco} — {t(`cuentasBancarias.tipos.${a.tipo_cuenta}`)} ****{a.ultimos_4_digitos}</option>)}
                </select>
              </label>

              {metodoPago === 'retencion_impuestos' && (
                <label className="text-sm">
                  <span className={labelClass}>{t('cobros.registrarModal.numeroDocumentoRetencionLabel')}</span>
                  <input type="text" value={numeroDocumentoRetencion} onChange={e => setNumeroDocumentoRetencion(e.target.value)} className={inputClass} />
                </label>
              )}
              {metodoPago === 'ajuste_cuenta' && (
                <label className="text-sm">
                  <span className={labelClass}>{t('cobros.registrarModal.comentarioAjusteLabel')}</span>
                  <textarea value={comentarioAjuste} onChange={e => setComentarioAjuste(e.target.value)} rows={2} className={inputClass} />
                </label>
              )}

              {/* Aplicación directa a facturas — opcional */}
              <div>
                <span className={labelClass}>{t('cobros.v2.aplicarLabel')}</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">{t('cobros.v2.aplicarAyuda')}</p>
                {loadingInvoices ? (
                  <p className="text-xs text-slate-400">{t('cobros.registrarModal.cargandoFacturas')}</p>
                ) : invoices.length === 0 ? (
                  <p className="text-xs text-slate-400">{t('cobros.v2.sinFacturasPendientes')}</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {invoices.map(inv => (
                      <div key={inv.id} className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2 text-sm" data-testid={`cobro-factura-${inv.id}`}>
                        <span className="flex-1 text-slate-700 dark:text-slate-200">{inv.numero}</span>
                        <span className="text-xs text-slate-500">{t('cobros.v2.pendiente')}: <strong>{formatCurrency(inv.saldo_pendiente)}</strong></span>
                        <input
                          type="text" inputMode="decimal" placeholder="$0.00" aria-label={t('cobros.v2.montoAAplicar', { numero: inv.numero })}
                          value={aplicaciones[inv.id] ?? ''}
                          onChange={e => setAplicaciones(prev => ({ ...prev, [inv.id]: e.target.value }))}
                          className={`w-28 rounded-md border px-2 py-1 text-sm text-right dark:bg-slate-900 ${filaExcedeFactura(inv.id, inv.saldo_pendiente) ? 'border-red-400' : 'border-slate-200 dark:border-slate-600'}`}
                        />
                        <button type="button" onClick={() => aplicarTodo(inv.id, inv.saldo_pendiente)} className="text-xs text-primary-dark hover:underline whitespace-nowrap">
                          {t('cobros.v2.aplicarTodo')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {algunaFilaExcede && <p className="text-[11px] text-red-600 mt-1">{t('cobros.v2.excedeFactura')}</p>}
                {aplicaMasQueElCobro && <p className="text-[11px] text-red-600 mt-1">{t('cobros.v2.aplicaMasQueElCobro')}</p>}
              </div>

              {/* Resumen: la implicación a la vista antes de registrar */}
              <div className="rounded-lg bg-primary-soft/60 dark:bg-slate-700/40 px-3 py-2 text-sm flex flex-col gap-1" data-testid="cobro-resumen">
                <div className="flex justify-between"><span>{t('cobros.v2.resumenRecibido')}</span><strong>{formatCurrency(montoRecibido)}</strong></div>
                <div className="flex justify-between"><span>{t('cobros.v2.resumenAplicado')}</span><strong data-testid="cobro-aplicado">{formatCurrency(totalAplicado)}</strong></div>
                <div className="flex justify-between"><span>{t('cobros.v2.resumenSaldoAFavor')}</span><strong data-testid="cobro-saldo-a-favor">{formatCurrency(Math.max(0, saldoAFavor))}</strong></div>
                {saldoAFavor > 0.005 && !sinCuentaBancaria && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{t('cobros.v2.implicacionSaldo', { monto: formatCurrency(saldoAFavor) })}</p>
                )}
                {confirmacionDiferida && totalAplicado > 0 && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{t('cobros.v2.implicacionConfirmacion')}</p>
                )}
                {sinCuentaDebeAplicarTodo && <p className="text-[11px] text-red-600 mt-1">{t('cobros.v2.sinCuentaAplicarTodo')}</p>}
              </div>

              <label className="text-sm">
                <span className={labelClass}>{t('cobros.registrarModal.referenciaLabel')}</span>
                <input type="text" value={referencia} onChange={e => setReferencia(e.target.value)} className={inputClass} />
              </label>

              <label className="text-sm">
                <span className={labelClass}>{t('cobros.registrarModal.comprobanteLabel')}</span>
                <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={e => pickComprobante(e.target.files?.[0])} className="text-xs" />
                {comprobante && <span className="block text-[11px] text-slate-500 mt-1">{comprobante.name}</span>}
              </label>
            </>
          )}

          {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('cobros.registrarModal.cancel')}</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} loading={registerMutation.isPending}>{t('cobros.v2.registrar')}</Button>
        </div>
      </Card>
    </div>
  )
}
