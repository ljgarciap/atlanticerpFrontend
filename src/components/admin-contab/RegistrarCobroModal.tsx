import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  usePaymentClients, useOpenInvoices, useDefaultBankAccount, useBankAccounts, useRegisterPayment,
} from '@/hooks/useAdminContab'
import { PAYMENT_METHODS, PAYMENT_METHODS_SIN_CUENTA_BANCARIA } from '@/types/adminContab'
import type { PaymentMethod, PaymentClientOption } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoSearch, IcoPaperclip } from '@/components/icons'

const COMPROBANTE_MAX_BYTES = 10 * 1024 * 1024
const COMPROBANTE_ACCEPTED  = ['image/jpeg', 'image/png', 'application/pdf']

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

interface Props {
  /** REQ-462 RN2 — apertura automática desde Facturación llega con el cliente ya elegido. */
  initialMasterClientId?: number | null
  onClose:      () => void
  onRegistered: () => void
}

// Batch 5 del cuerpo principal (SCRUM-539→544, REQ-462→467) — formulario "Registrar nuevo cobro".
export default function RegistrarCobroModal({ initialMasterClientId, onClose, onRegistered }: Props) {
  const { t } = useTranslation('adminContab')

  const [clientQuery, setClientQuery]   = useState('')
  const [clientOpen, setClientOpen]     = useState(false)
  const [masterClientId, setMasterClientId] = useState<number | null>(initialMasterClientId ?? null)

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set())
  const [aplicarSaldoFavor, setAplicarSaldoFavor]   = useState(true)
  const [metodoPago, setMetodoPago]                 = useState<PaymentMethod>('transferencia')
  const [bankAccountId, setBankAccountId]           = useState<number | null>(null)
  const [bankAccountTouched, setBankAccountTouched] = useState(false)
  const [numeroDocumentoRetencion, setNumeroDocumentoRetencion] = useState('')
  const [comentarioAjuste, setComentarioAjuste]     = useState('')
  const [referencia, setReferencia]                 = useState('')
  const [comprobante, setComprobante]               = useState<File | null>(null)
  const [comprobanteDragOver, setComprobanteDragOver] = useState(false)
  const [error, setError]                           = useState<string | null>(null)

  const { data: clientOptions = [] } = usePaymentClients(clientQuery)
  const { data: openInvoicesResult, isFetching: loadingInvoices } = useOpenInvoices(masterClientId)
  const { data: bankAccounts = [] } = useBankAccounts()
  const { data: suggestedAccount } = useDefaultBankAccount(metodoPago)
  const registerMutation = useRegisterPayment()

  const invoices      = openInvoicesResult?.invoices ?? []
  const creditBalance = openInvoicesResult?.credit_balance ?? 0
  const sinCuentaBancaria = PAYMENT_METHODS_SIN_CUENTA_BANCARIA.includes(metodoPago)

  // REQ-462 RN2 — al llegar preseleccionado desde Facturación, la query string solo trae el id;
  // el nombre se completa apenas responde open-invoices (mismo request que ya se necesita).
  // REQ-474 RN2 — si ese id no existe en el catálogo (`master_client_name` viene `null`), el
  // formulario cae a comportarse como si se hubiera abierto manualmente sin preselección: se
  // limpia `masterClientId` (nunca un error visible).
  useEffect(() => {
    if (initialMasterClientId === null || initialMasterClientId === undefined || openInvoicesResult === undefined) return
    if (openInvoicesResult.master_client_name) {
      setClientQuery(openInvoicesResult.master_client_name)
    } else {
      setMasterClientId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInvoicesResult])

  // REQ-466 RN3/RN5 — la sugerencia se aplica cada vez que cambia el método, salvo que el usuario
  // ya haya tocado el campo a mano para ESTE método (no pisar una elección manual).
  useEffect(() => {
    setBankAccountTouched(false)
  }, [metodoPago])
  useEffect(() => {
    if (!bankAccountTouched && !sinCuentaBancaria) {
      setBankAccountId(suggestedAccount?.id ?? null)
    }
    if (sinCuentaBancaria) {
      setBankAccountId(null)
    }
  }, [suggestedAccount, sinCuentaBancaria, bankAccountTouched])

  // RN1 REQ-465 — el saldo a favor se ofrece marcado por defecto en cuanto hay al menos 1 factura
  // seleccionada y el cliente tiene saldo disponible.
  useEffect(() => {
    setAplicarSaldoFavor(creditBalance > 0)
  }, [masterClientId, creditBalance])

  const totalFacturas = useMemo(
    () => invoices.filter(i => selectedInvoiceIds.has(i.id)).reduce((sum, i) => sum + i.saldo_pendiente, 0),
    [invoices, selectedInvoiceIds],
  )
  const saldoFavorAplicado = aplicarSaldoFavor ? Math.min(creditBalance, totalFacturas) : 0
  const montoRecibido = Math.max(0, Math.round((totalFacturas - saldoFavorAplicado) * 100) / 100)

  function selectClient(opt: PaymentClientOption) {
    setMasterClientId(opt.id)
    setClientQuery(opt.name)
    setClientOpen(false)
    setSelectedInvoiceIds(new Set())
  }

  // REQ-468 RN1 — JPG/PNG/PDF, máx. 10MB. La validación de tipo/tamaño es solo UX inmediata acá
  // (el backend revalida igual, ver StorePaymentRequest).
  function pickComprobante(file: File | undefined | null) {
    if (!file) return
    if (!COMPROBANTE_ACCEPTED.includes(file.type)) {
      setError(t('cobros.registrarModal.comprobanteInvalidType'))
      return
    }
    if (file.size > COMPROBANTE_MAX_BYTES) {
      setError(t('cobros.registrarModal.comprobanteTooLarge'))
      return
    }
    setError(null)
    setComprobante(file)
  }

  function toggleInvoice(id: number) {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const canSubmit = masterClientId !== null && selectedInvoiceIds.size > 0
    && (sinCuentaBancaria || montoRecibido === 0 || bankAccountId !== null)
    && (metodoPago !== 'ajuste_cuenta' || comentarioAjuste.trim() !== '')

  function handleSubmit() {
    if (masterClientId === null || !canSubmit) return
    setError(null)
    registerMutation.mutate({
      master_client_id: masterClientId,
      invoice_ids: Array.from(selectedInvoiceIds),
      aplicar_saldo_favor: aplicarSaldoFavor,
      metodo_pago: metodoPago,
      monto_recibido_estimado: montoRecibido,
      // RN4 REQ-465/466 — sin cuenta bancaria cuando el método no la usa O cuando no entra
      // dinero real (saldo a favor cubrió el 100%) — aunque el campo haya quedado auto-completado
      // en pantalla, no tiene sentido mandarlo si no representa un movimiento bancario real.
      bank_account_id: (sinCuentaBancaria || montoRecibido === 0) ? null : bankAccountId,
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

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('cobros.registrarModal.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {/* Cliente */}
          <div className="relative">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('cobros.registrarModal.clienteLabel')}
            </label>
            <div className="relative">
              <IcoSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={clientQuery}
                onChange={e => { setClientQuery(e.target.value); setClientOpen(true); setMasterClientId(null) }}
                onFocus={() => setClientOpen(true)}
                onBlur={() => setTimeout(() => setClientOpen(false), 150)}
                placeholder={t('cobros.registrarModal.clientePlaceholder')}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 pl-8 pr-3 py-2 text-sm"
              />
            </div>
            {clientOpen && clientOptions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-48 overflow-auto">
                {clientOptions.map(opt => (
                  <li key={opt.id} onMouseDown={() => selectClient(opt)}
                    className="cursor-pointer px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                    {opt.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {masterClientId !== null && (
            <>
              {/* Facturas abiertas — REQ-464 */}
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('cobros.registrarModal.facturasLabel')}
                </span>
                {loadingInvoices ? (
                  <p className="text-xs text-slate-400">{t('cobros.registrarModal.cargandoFacturas')}</p>
                ) : invoices.length === 0 ? (
                  <p className="text-xs text-slate-400">{t('cobros.registrarModal.sinFacturasPendientes')}</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {invoices.map(inv => (
                      <label key={inv.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 text-sm cursor-pointer">
                        <input type="checkbox" checked={selectedInvoiceIds.has(inv.id)} onChange={() => toggleInvoice(inv.id)} />
                        <span className="flex-1 text-slate-700 dark:text-slate-200">{inv.numero}</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(inv.saldo_pendiente)}</span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedInvoiceIds.size > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {t('cobros.registrarModal.totalFacturas')}: <span data-testid="total-facturas" className="font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(totalFacturas)}</span>
                  </p>
                )}
              </div>

              {/* Saldo a favor — REQ-465 */}
              {creditBalance > 0 && selectedInvoiceIds.size > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={aplicarSaldoFavor} onChange={e => setAplicarSaldoFavor(e.target.checked)} />
                  <span className="text-slate-700 dark:text-slate-200">
                    {t('cobros.registrarModal.aplicarSaldoFavor', { monto: formatCurrency(creditBalance) })}
                  </span>
                </label>
              )}
              {aplicarSaldoFavor && saldoFavorAplicado > 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {t('cobros.registrarModal.saldoFavorAplicadoLine')}: -{formatCurrency(saldoFavorAplicado)}
                </p>
              )}

              {/* Monto recibido — autocalculado, RN3 REQ-465 */}
              {selectedInvoiceIds.size > 0 && (
                <div className="rounded-lg bg-primary-soft/60 dark:bg-slate-700/40 px-3 py-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('cobros.registrarModal.montoRecibidoLabel')}</span>
                  <span data-testid="monto-recibido" className="text-base font-bold text-slate-900 dark:text-slate-100">{formatCurrency(montoRecibido)}</span>
                </div>
              )}

              {/* Método de pago — REQ-466 */}
              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('cobros.registrarModal.metodoPagoLabel')}
                </span>
                <select
                  value={metodoPago}
                  onChange={e => setMetodoPago(e.target.value as PaymentMethod)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`cobros.metodos.${m}`)}</option>)}
                </select>
              </label>

              {/* Cuenta bancaria destino — RN4 REQ-466, oculto para retencion/ajuste */}
              {!sinCuentaBancaria && (
                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('cobros.registrarModal.cuentaBancariaLabel')}
                  </span>
                  <select
                    value={bankAccountId ?? ''}
                    onChange={e => { setBankAccountId(e.target.value ? Number(e.target.value) : null); setBankAccountTouched(true) }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  >
                    <option value="">{t('cobros.registrarModal.cuentaBancariaPlaceholder')}</option>
                    {bankAccounts.filter(a => a.activa).map(a => (
                      <option key={a.id} value={a.id}>{a.banco} — {t(`cuentasBancarias.tipos.${a.tipo_cuenta}`)} ****{a.ultimos_4_digitos}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Campos condicionales — REQ-467 */}
              {metodoPago === 'retencion_impuestos' && (
                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('cobros.registrarModal.numeroDocumentoRetencionLabel')}
                  </span>
                  <input
                    type="text" value={numeroDocumentoRetencion} onChange={e => setNumeroDocumentoRetencion(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </label>
              )}
              {metodoPago === 'ajuste_cuenta' && (
                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('cobros.registrarModal.comentarioAjusteLabel')}
                  </span>
                  <textarea
                    value={comentarioAjuste} onChange={e => setComentarioAjuste(e.target.value)} rows={2}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                  {comentarioAjuste.trim() === '' && (
                    <p className="text-[11px] text-slate-400 mt-1">{t('cobros.registrarModal.comentarioAjusteRequired')}</p>
                  )}
                </label>
              )}

              {/* Referencia / N° de transacción — REQ-470/471, siempre visible, opcional */}
              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('cobros.registrarModal.referenciaLabel')}
                </span>
                <input
                  type="text" value={referencia} onChange={e => setReferencia(e.target.value)}
                  placeholder={t('cobros.registrarModal.referenciaPlaceholder')}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </label>

              {/* Comprobante de pago — REQ-468, opcional */}
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('cobros.registrarModal.comprobanteLabel')}
                </span>
                <label
                  onDragOver={e => { e.preventDefault(); setComprobanteDragOver(true) }}
                  onDragLeave={() => setComprobanteDragOver(false)}
                  onDrop={e => { e.preventDefault(); setComprobanteDragOver(false); pickComprobante(e.dataTransfer.files[0]) }}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-4 text-center cursor-pointer transition-colors ${
                    comprobanteDragOver ? 'border-primary bg-primary-soft/40' : 'border-slate-200 dark:border-slate-600'
                  }`}
                >
                  <input
                    type="file" accept="image/jpeg,image/png,.pdf" className="hidden"
                    onChange={e => pickComprobante(e.target.files?.[0])}
                  />
                  <IcoPaperclip size={18} className="text-slate-400" />
                  {comprobante ? (
                    <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <span className="truncate max-w-[220px]">{comprobante.name}</span>
                      <button
                        type="button"
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setComprobante(null) }}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <IcoClose size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        {t('cobros.registrarModal.comprobanteDragText')}
                      </div>
                      <div className="text-[11px] text-slate-400">{t('cobros.registrarModal.comprobanteHint')}</div>
                    </>
                  )}
                </label>
              </div>
            </>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={registerMutation.isPending}>
            {t('cobros.registrarModal.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} loading={registerMutation.isPending}>
            {t('cobros.registrarModal.confirm')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
