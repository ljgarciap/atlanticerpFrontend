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

  // SCRUM-931 — filtro cruzado Proyecto↔Cotización, resuelto local sobre la lista de facturas
  // abiertas ya cargada (ver ADR-SCRUM931): sin request nueva, sin asumir que la combinación
  // siempre acota a una sola factura (una cotización puede tener varias entregas facturadas por
  // separado, ver SCRUM-929).
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [selectedQuoteId, setSelectedQuoteId]     = useState<number | null>(null)

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set())
  // SCRUM-902 §4.4 — reemplaza el viejo checkbox todo-o-nada `aplicarSaldoFavor`: monto editable
  // que el usuario decide aplicar del saldo a nivel Cliente master, con tope al disponible. El
  // saldo a nivel Factura/Proyecto (abono_obligatorio) nunca pasa por acá — se aplica solo,
  // bloqueado, por factura (ver el desglose en cada fila de "Facturas abiertas" abajo).
  const [montoSaldoCliente, setMontoSaldoCliente]   = useState('')
  const [metodoPago, setMetodoPago]                 = useState<PaymentMethod>('transferencia')
  const [bankAccountId, setBankAccountId]           = useState<number | null>(null)
  const [bankAccountTouched, setBankAccountTouched] = useState(false)
  const [numeroDocumentoRetencion, setNumeroDocumentoRetencion] = useState('')
  const [comentarioAjuste, setComentarioAjuste]     = useState('')
  const [referencia, setReferencia]                 = useState('')
  const [comprobante, setComprobante]               = useState<File | null>(null)
  const [comprobanteDragOver, setComprobanteDragOver] = useState(false)
  const [error, setError]                           = useState<string | null>(null)

  // SCRUM-905 — solo clientes con facturas pendientes de cobro (no la lista completa de clientes
  // del sistema, que era el comportamiento por defecto de `usePaymentClients`).
  const { data: clientOptions = [] } = usePaymentClients(clientQuery, false, true)
  const { data: openInvoicesResult, isFetching: loadingInvoices } = useOpenInvoices(masterClientId)
  const { data: bankAccounts = [] } = useBankAccounts()
  const { data: suggestedAccount } = useDefaultBankAccount(metodoPago)
  const registerMutation = useRegisterPayment()

  const invoices      = openInvoicesResult?.invoices ?? []
  const creditBalance = openInvoicesResult?.credit_balance ?? 0
  const sinCuentaBancaria = PAYMENT_METHODS_SIN_CUENTA_BANCARIA.includes(metodoPago)

  // SCRUM-931 — opciones de cada select derivadas de `invoices`, acotadas por la selección
  // VIGENTE del otro campo (filtrado cruzado real, no solo padre→hijo).
  const projectOptions = useMemo(() => {
    const byId = new Map<number, string>()
    for (const inv of invoices) {
      if (inv.sales_project_id === null) continue
      if (selectedQuoteId !== null && inv.quote_id !== selectedQuoteId) continue
      if (!byId.has(inv.sales_project_id)) byId.set(inv.sales_project_id, inv.proyecto ?? `#${inv.sales_project_id}`)
    }
    return Array.from(byId, ([id, name]) => ({ id, name }))
  }, [invoices, selectedQuoteId])

  const quoteOptions = useMemo(() => {
    const byId = new Map<number, string>()
    for (const inv of invoices) {
      if (inv.quote_id === null) continue
      if (selectedProjectId !== null && inv.sales_project_id !== selectedProjectId) continue
      if (!byId.has(inv.quote_id)) byId.set(inv.quote_id, inv.cotizacion_folio ?? `#${inv.quote_id}`)
    }
    return Array.from(byId, ([id, folio]) => ({ id, folio }))
  }, [invoices, selectedProjectId])

  // Factura(s) que matchean la combinación elegida — nunca asume cardinalidad 1.
  const visibleInvoices = useMemo(
    () => invoices.filter(inv =>
      (selectedProjectId === null || inv.sales_project_id === selectedProjectId)
      && (selectedQuoteId === null || inv.quote_id === selectedQuoteId)),
    [invoices, selectedProjectId, selectedQuoteId],
  )

  // Si el filtro Proyecto/Cotización oculta una factura ya tildada, la selección se poda para que
  // no quede una factura "cobrándose" sin checkbox visible en pantalla (el total y el submit usan
  // `selectedInvoiceIds`, no `visibleInvoices` — sin esto, el neto a cobrar podía incluir una
  // factura que el usuario ya no ve).
  useEffect(() => {
    const visibleIds = new Set(visibleInvoices.map(inv => inv.id))
    setSelectedInvoiceIds(prev => {
      const next = new Set([...prev].filter(id => visibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visibleInvoices])

  function selectProject(id: number | null) {
    setSelectedProjectId(id)
    // Si la Cotización ya elegida no pertenece a este Proyecto, la combinación queda inconsistente
    // — se limpia en vez de dejar un filtro que no matchea ninguna factura.
    if (id !== null && selectedQuoteId !== null) {
      const stillValid = invoices.some(inv => inv.quote_id === selectedQuoteId && inv.sales_project_id === id)
      if (!stillValid) setSelectedQuoteId(null)
    }
  }

  function selectQuote(id: number | null) {
    setSelectedQuoteId(id)
    // AC — elegir Cotización autocompleta/filtra el Proyecto al de esa cotización.
    if (id !== null) {
      const projectOfQuote = invoices.find(inv => inv.quote_id === id)?.sales_project_id
      if (projectOfQuote != null) setSelectedProjectId(projectOfQuote)
    }
  }

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

  // Reinicia el monto de saldo a aplicar al cambiar de cliente (mismo criterio que antes con
  // `aplicarSaldoFavor` — nunca arrastrar una elección de un cliente distinto).
  useEffect(() => {
    setMontoSaldoCliente('')
  }, [masterClientId])

  // SCRUM-902 §4.2/4.3 — `neto_a_cobrar` ya viene reducido por el backend cuando la factura tiene
  // un abono obligatorio (Factura/Proyecto); para el resto es simplemente `saldo_pendiente`.
  const totalFacturas = useMemo(
    () => invoices.filter(i => selectedInvoiceIds.has(i.id)).reduce((sum, i) => sum + i.neto_a_cobrar, 0),
    [invoices, selectedInvoiceIds],
  )
  const montoSaldoClienteNumber = parseFloat(montoSaldoCliente.replace(/[^0-9.]/g, '')) || 0
  const saldoClienteExcedeDisponible = montoSaldoClienteNumber > creditBalance
  const montoRecibido = Math.max(0, Math.round((totalFacturas - montoSaldoClienteNumber) * 100) / 100)

  function selectClient(opt: PaymentClientOption) {
    setMasterClientId(opt.id)
    setClientQuery(opt.name)
    setClientOpen(false)
    setSelectedInvoiceIds(new Set())
    setSelectedProjectId(null)
    setSelectedQuoteId(null)
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

  const canSubmit = masterClientId !== null && selectedInvoiceIds.size > 0 && !saldoClienteExcedeDisponible
    && (sinCuentaBancaria || montoRecibido === 0 || bankAccountId !== null)
    && (metodoPago !== 'ajuste_cuenta' || comentarioAjuste.trim() !== '')

  function handleSubmit() {
    if (masterClientId === null || !canSubmit) return
    setError(null)
    registerMutation.mutate({
      master_client_id: masterClientId,
      invoice_ids: Array.from(selectedInvoiceIds),
      monto_saldo_cliente_aplicado: montoSaldoClienteNumber,
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

        {/* Cliente — rebote Daniela (SCRUM-905, 2026-09-13): un ancestro con overflow-y-auto
            clippea cualquier hijo absolutamente posicionado que caiga fuera de su propio alto,
            sin importar z-index — por eso el desplegable de resultados "no se veía" al tipear
            (SÍ se renderizaba, solo quedaba recortado por el scroll del cuerpo del modal). El
            buscador de cliente es siempre el primer paso del flujo y no necesita co-scrollear
            con el resto del formulario, así que vive en su propio contenedor SIN overflow, fuera
            del área scrolleable de abajo. */}
        <div className="px-5 pt-4">
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
            {/* SCRUM-905 — max-h-48/py-1.5 se sentía comprimido con nombres largos de cliente;
                más alto + más padding por fila para que se lea cómodo sin tapar el resto del modal. */}
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
              {/* Proyecto / # de Cotización — SCRUM-931, filtrado cruzado sobre las facturas ya
                  cargadas de este cliente (sin request nueva, ver ADR-SCRUM931). */}
              {!loadingInvoices && invoices.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      {t('cobros.registrarModal.proyectoLabel')}
                    </span>
                    <select
                      value={selectedProjectId ?? ''}
                      onChange={e => selectProject(e.target.value ? Number(e.target.value) : null)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                    >
                      <option value="">{t('cobros.registrarModal.proyectoTodos')}</option>
                      {projectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      {t('cobros.registrarModal.cotizacionLabel')}
                    </span>
                    <select
                      value={selectedQuoteId ?? ''}
                      onChange={e => selectQuote(e.target.value ? Number(e.target.value) : null)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                    >
                      <option value="">{t('cobros.registrarModal.cotizacionTodas')}</option>
                      {quoteOptions.map(q => <option key={q.id} value={q.id}>{q.folio}</option>)}
                    </select>
                  </label>
                </div>
              )}

              {/* Facturas abiertas — REQ-464 */}
              <div>
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('cobros.registrarModal.facturasLabel')}
                </span>
                {loadingInvoices ? (
                  <p className="text-xs text-slate-400">{t('cobros.registrarModal.cargandoFacturas')}</p>
                ) : invoices.length === 0 ? (
                  <p className="text-xs text-slate-400">{t('cobros.registrarModal.sinFacturasPendientes')}</p>
                ) : visibleInvoices.length === 0 ? (
                  <p className="text-xs text-slate-400">{t('cobros.registrarModal.sinFacturasParaFiltro')}</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {visibleInvoices.map(inv => (
                      <div key={inv.id} className="rounded-lg bg-slate-50 dark:bg-slate-700/40 text-sm">
                        <label className="flex items-center gap-2 px-3 py-2 cursor-pointer">
                          <input type="checkbox" checked={selectedInvoiceIds.has(inv.id)} onChange={() => toggleInvoice(inv.id)} />
                          <span className="flex-1 text-slate-700 dark:text-slate-200">{inv.numero}</span>
                          {inv.abono_obligatorio ? (
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(inv.neto_a_cobrar)}</span>
                          ) : (
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(inv.saldo_pendiente)}</span>
                          )}
                        </label>
                        {/* SCRUM-902 §4.2/4.3 — abono obligatorio de nivel Factura/Proyecto: monto
                            ya reducido y BLOQUEADO, desglose de los 3 montos siempre visible
                            (Escenario 5: "$1,200 − $500 de abono aplicado = $700"). */}
                        {inv.abono_obligatorio && (
                          <div className="px-3 pb-2 -mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                            <span>{formatCurrency(inv.monto)}</span>
                            <span>−</span>
                            <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(inv.abono_obligatorio.monto)} {t('cobros.registrarModal.abonoAplicadoTag')}</span>
                            <span>=</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(inv.neto_a_cobrar)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {selectedInvoiceIds.size > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {t('cobros.registrarModal.totalFacturas')}: <span data-testid="total-facturas" className="font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(totalFacturas)}</span>
                  </p>
                )}
              </div>

              {/* Saldo a favor a nivel Cliente master — SCRUM-902 §4.4, opcional y editable con
                  tope al disponible (nunca cubre el abono obligatorio de arriba, que se aplica solo). */}
              {creditBalance > 0 && selectedInvoiceIds.size > 0 && (
                <div>
                  <label className="text-sm">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                      {t('cobros.registrarModal.saldoClienteLabel', { monto: formatCurrency(creditBalance) })}
                    </span>
                    <input
                      type="text" value={montoSaldoCliente} placeholder="$0.00"
                      onChange={e => setMontoSaldoCliente(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                  </label>
                  {saldoClienteExcedeDisponible && (
                    <p className="text-[11px] text-red-600 mt-1">
                      {t('cobros.registrarModal.saldoClienteExcede', { monto: formatCurrency(creditBalance) })}
                    </p>
                  )}
                </div>
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

              {/* Cuenta bancaria destino — RN4 REQ-466. SCRUM-955 §3: retención/ajuste ya no
                  ocultan el campo, lo muestran bloqueado en "Otros" (el payload sigue mandando
                  null, ver bank_account_id más abajo — sin cambio de contrato con backend). */}
              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('cobros.registrarModal.cuentaBancariaLabel')}
                </span>
                <select
                  value={sinCuentaBancaria ? 'otros' : (bankAccountId ?? '')}
                  disabled={sinCuentaBancaria}
                  onChange={e => { setBankAccountId(e.target.value ? Number(e.target.value) : null); setBankAccountTouched(true) }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm disabled:bg-slate-50 disabled:dark:bg-slate-800 disabled:text-slate-400"
                >
                  {sinCuentaBancaria ? (
                    <option value="otros">{t('cobros.registrarModal.cuentaBancariaOtros')}</option>
                  ) : (
                    <>
                      <option value="">{t('cobros.registrarModal.cuentaBancariaPlaceholder')}</option>
                      {bankAccounts.filter(a => a.activa).map(a => (
                        <option key={a.id} value={a.id}>{a.banco} — {t(`cuentasBancarias.tipos.${a.tipo_cuenta}`)} ****{a.ultimos_4_digitos}</option>
                      ))}
                    </>
                  )}
                </select>
              </label>

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
