import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  usePaymentClients, useDefaultBankAccount, useBankAccounts,
  useAbonoDetail, useAbonoSubClientes, useAbonoInvoicesForSubClient,
  useRegisterAbono, useUpdateAbono, useConfirmAbono, useDownloadAbonoReceipt,
} from '@/hooks/useAdminContab'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import type { PaymentMethod, AbonoPayload } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPaperclip, IcoCheck, IcoPrinter } from '@/components/icons'
import { getRegion } from '@/lib/region'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(getRegion().locale, { style: 'currency', currency: getRegion().currency }).format(value)
}

/**
 * SCRUM-948 — Cobros limpia Proyecto/# Cotización en un solo paso (elegir "Todos los
 * proyectos"/"Todas las cotizaciones" en su `<select>`, ver RegistrarCobroModal.tsx). El
 * buscador de texto de Abono (SCRUM-933, mantenido a propósito — ver decisión del Arquitecto en
 * el ticket) ya limpiaba el filtro al borrar el texto a mano, pero sin una forma de un solo paso
 * como la de Cobros. Este botón × es ese equivalente: mismo resultado que "Todos", un solo clic.
 */
function ClearFieldButton({ onClear, label }: { onClear: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onMouseDown={e => { e.preventDefault(); onClear() }}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
    >
      <IcoClose size={12} />
    </button>
  )
}

const COMPROBANTE_MAX_BYTES = 10 * 1024 * 1024
const COMPROBANTE_ACCEPTED  = ['image/jpeg', 'image/png', 'application/pdf']

/**
 * SCRUM-1128 — datos del proyecto aprobado con los que "Pasar a Pedido" (Pipeline) precarga un abono
 * nuevo: Cliente Master, Subcliente, Proyecto y Cotización. Solo aplica con `abonoId === null`;
 * el usuario sigue las validaciones y el flujo normales del formulario.
 */
export interface AbonoPrefill {
  masterClientId:   number | null
  masterClientName: string
  subClientId:      number | null
  salesProjectId:   number | null
  projectName:      string
  quoteId:          number | null
  quoteFolio:       string
}

interface Props {
  /** `null` = registrar un abono nuevo; un id abre el detalle de ese abono existente. */
  abonoId: number | null
  prefill?: AbonoPrefill | null
  onClose: () => void
  onSaved: () => void
}

/**
 * SCRUM-902 — "Registrar abono" (mockup 4O__Admin_Contabilidad_RegistrarAbono.html). Un solo
 * modal cubre los 3 casos del ticket: registrar uno nuevo, ver el detalle bloqueado de uno
 * existente, y editarlo (solo mientras `estado='por_confirmar'`) — mismo patrón de
 * bloqueado/editable que `DetalleCobroModal`, pero con edición inline en vez de un modal aparte.
 */
export default function RegistrarAbonoModal({ abonoId, prefill, onClose, onSaved }: Props) {
  const { t } = useTranslation('adminContab')
  const metodosPago = usePaymentMethods()
  const isNew = abonoId === null

  const { data: abono, isLoading: loadingAbono } = useAbonoDetail(abonoId)
  const [editing, setEditing] = useState(isNew)

  const [clientQuery, setClientQuery]   = useState('')
  const [clientOpen, setClientOpen]     = useState(false)
  const [masterClientId, setMasterClientId] = useState<number | null>(null)
  const [subClientId, setSubClientId]       = useState<number | null>(null)
  const [salesProjectId, setSalesProjectId] = useState<number | null>(null)
  const [invoiceId, setInvoiceId]           = useState<number | null>(null)

  // SCRUM-933 — Proyecto/# de Cotización como buscador de texto cruzado (el ticket dice "buscar",
  // no "seleccionar" — a diferencia de Cobros/Notas de Crédito, que usan <select>), mismo patrón
  // visual que el buscador de Cliente Master de arriba: el query ES el texto mostrado, elegir una
  // opción lo fija al label elegido. `selectedQuoteId` es nuevo (antes no existía ninguna noción de
  // cotización acá); `salesProjectId` sigue siendo el mismo estado de siempre.
  const [proyectoQuery, setProyectoQuery]     = useState('')
  const [proyectoOpen, setProyectoOpen]       = useState(false)
  const [cotizacionQuery, setCotizacionQuery] = useState('')
  const [cotizacionOpen, setCotizacionOpen]   = useState(false)
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null)
  const [monto, setMonto]                   = useState('')
  const [metodoPago, setMetodoPago]         = useState<PaymentMethod>('transferencia')
  const [bankAccountId, setBankAccountId]   = useState<number | null>(null)
  const [bankAccountTouched, setBankAccountTouched] = useState(false)
  const [referencia, setReferencia]         = useState('')
  const [comprobante, setComprobante]       = useState<File | null>(null)
  const [comprobanteDragOver, setComprobanteDragOver] = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [confirmAsk, setConfirmAsk]         = useState(false)

  const { data: clientOptions = [] }  = usePaymentClients(clientQuery)
  const { data: subClientes = [] }    = useAbonoSubClientes(masterClientId)
  const { data: invoicesForSubClient = [] } = useAbonoInvoicesForSubClient(subClientId)
  const { data: bankAccounts = [] }   = useBankAccounts()
  const { data: suggestedAccount }    = useDefaultBankAccount(editing ? metodoPago : null)

  // REQ-466 RN4 (mismo criterio que RegistrarCobroModal) — estos 2 métodos nunca representan
  // dinero entrando a una cuenta bancaria real.
  const sinCuentaBancaria = metodosPago.sinCuentaBancaria(metodoPago)

  // SCRUM-933 — opciones de Proyecto/Cotización derivadas de `invoicesForSubClient`, acotadas por
  // la selección VIGENTE del otro campo (cruce real) y por el texto tipeado (mismo criterio "buscar
  // indistintamente" del ticket) — deduplicadas por id, nunca una entrada repetida por tener varias
  // facturas del mismo proyecto/cotización.
  const proyectoOptions = useMemo(() => {
    const q = proyectoQuery.trim().toLowerCase()
    const byId = new Map<number, string>()
    for (const f of invoicesForSubClient) {
      if (f.sales_project_id === null) continue
      if (selectedQuoteId !== null && f.quote_id !== selectedQuoteId) continue
      const label = f.proyecto ?? `#${f.sales_project_id}`
      if (q !== '' && !label.toLowerCase().includes(q)) continue
      if (!byId.has(f.sales_project_id)) byId.set(f.sales_project_id, label)
    }
    return Array.from(byId, ([id, name]) => ({ id, name }))
  }, [invoicesForSubClient, selectedQuoteId, proyectoQuery])

  const cotizacionOptions = useMemo(() => {
    const q = cotizacionQuery.trim().toLowerCase()
    const byId = new Map<number, string>()
    for (const f of invoicesForSubClient) {
      if (f.quote_id === null) continue
      if (salesProjectId !== null && f.sales_project_id !== salesProjectId) continue
      const label = f.cotizacion_folio ?? `#${f.quote_id}`
      if (q !== '' && !label.toLowerCase().includes(q)) continue
      if (!byId.has(f.quote_id)) byId.set(f.quote_id, label)
    }
    return Array.from(byId, ([id, folio]) => ({ id, folio }))
  }, [invoicesForSubClient, salesProjectId, cotizacionQuery])

  // Factura(s) que matchean la combinación Proyecto+Cotización vigente — nunca asume cardinalidad
  // 1 (una cotización puede tener varias entregas facturadas por separado, ver SCRUM-929).
  const visibleFacturas = useMemo(
    () => invoicesForSubClient.filter(f =>
      (salesProjectId === null || f.sales_project_id === salesProjectId)
      && (selectedQuoteId === null || f.quote_id === selectedQuoteId)),
    [invoicesForSubClient, salesProjectId, selectedQuoteId],
  )

  // Si el filtro oculta la factura ya elegida, se limpia — mismo bug de fondo ya encontrado y
  // corregido en RegistrarCobroModal.tsx (SCRUM-931)/RegistrarNotaCreditoModal.tsx (SCRUM-932).
  useEffect(() => {
    if (invoiceId !== null && !visibleFacturas.some(f => f.id === invoiceId)) {
      setInvoiceId(null)
    }
  }, [visibleFacturas, invoiceId])

  // SCRUM-955 — monto de la factura elegida, para mostrarlo y validar el tope del abono contra
  // él. La factura sigue siendo siempre opcional (§1 del ticket) — sin factura elegida no hay tope.
  const facturaSeleccionada = useMemo(
    () => invoiceId === null ? null : invoicesForSubClient.find(f => f.id === invoiceId) ?? null,
    [invoicesForSubClient, invoiceId],
  )

  function selectProyecto(id: number, name: string) {
    setSalesProjectId(id)
    setProyectoQuery(name)
    setProyectoOpen(false)
    // Si la Cotización ya elegida no pertenece a este Proyecto, la combinación queda inconsistente.
    if (selectedQuoteId !== null) {
      const stillValid = invoicesForSubClient.some(f => f.quote_id === selectedQuoteId && f.sales_project_id === id)
      if (!stillValid) { setSelectedQuoteId(null); setCotizacionQuery('') }
    }
  }

  function selectCotizacion(id: number, folio: string) {
    setSelectedQuoteId(id)
    setCotizacionQuery(folio)
    setCotizacionOpen(false)
    // AC — elegir Cotización autocompleta/filtra el Proyecto al de esa cotización.
    const row = invoicesForSubClient.find(f => f.quote_id === id)
    if (row?.sales_project_id != null) {
      setSalesProjectId(row.sales_project_id)
      setProyectoQuery(row.proyecto ?? `#${row.sales_project_id}`)
    }
  }

  const registerMutation = useRegisterAbono()
  const updateMutation   = useUpdateAbono()
  const confirmMutation  = useConfirmAbono()
  const downloadReceipt  = useDownloadAbonoReceipt()
  const saving = registerMutation.isPending || updateMutation.isPending

  function verRecibo() {
    if (!abono || !abono.numero_recibo) return
    downloadReceipt.mutate({ id: abono.id, numeroRecibo: abono.numero_recibo })
  }

  // Al abrir el detalle de un abono existente, hidrata el formulario con sus valores. La
  // Cotización NUNCA se persiste (ADR-SCRUM933 — es solo mecanismo de búsqueda), así que un abono
  // existente nunca trae una cotización preseleccionada, solo su Proyecto (que sí se persiste).
  useEffect(() => {
    if (!abono) return
    setClientQuery(abono.cliente)
    setMasterClientId(abono.master_client_id)
    setSubClientId(abono.sub_client_id)
    setSalesProjectId(abono.sales_project_id)
    setProyectoQuery(abono.proyecto ?? '')
    setSelectedQuoteId(null)
    setCotizacionQuery('')
    setInvoiceId(abono.invoice_id)
    setMonto(String(abono.monto_original))
    setMetodoPago(abono.metodo_pago)
    setBankAccountId(abono.cuenta_bancaria_id)
    setReferencia(abono.referencia)
    setEditing(false)
  }, [abono])

  // SCRUM-1128 — precarga desde "Pasar a Pedido" (solo abono nuevo, una vez al montar).
  useEffect(() => {
    if (!isNew || !prefill) return
    setMasterClientId(prefill.masterClientId)
    setClientQuery(prefill.masterClientName)
    setSubClientId(prefill.subClientId)
    setSalesProjectId(prefill.salesProjectId)
    setProyectoQuery(prefill.projectName)
    setSelectedQuoteId(prefill.quoteId)
    setCotizacionQuery(prefill.quoteFolio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setBankAccountTouched(false)
  }, [metodoPago])
  useEffect(() => {
    if (!editing) return
    if (sinCuentaBancaria) { setBankAccountId(null); return }
    if (!bankAccountTouched) setBankAccountId(suggestedAccount?.id ?? null)
  }, [suggestedAccount, bankAccountTouched, editing, sinCuentaBancaria])

  function selectClient(opt: { id: number; name: string }) {
    setMasterClientId(opt.id)
    setClientQuery(opt.name)
    setClientOpen(false)
    setSubClientId(null); setSalesProjectId(null); setInvoiceId(null)
    setProyectoQuery(''); setSelectedQuoteId(null); setCotizacionQuery('')
  }

  // SCRUM-948 — mismo resultado que borrar el texto a mano, en un solo clic (ver ClearFieldButton).
  function clearClient() {
    setClientQuery(''); setMasterClientId(null); setClientOpen(false)
    setSubClientId(null); setSalesProjectId(null); setInvoiceId(null)
    setProyectoQuery(''); setSelectedQuoteId(null); setCotizacionQuery('')
  }

  function clearProyecto() {
    setProyectoQuery(''); setSalesProjectId(null); setInvoiceId(null); setProyectoOpen(false)
  }

  function clearCotizacion() {
    setCotizacionQuery(''); setSelectedQuoteId(null); setCotizacionOpen(false)
  }

  function pickComprobante(file: File | undefined | null) {
    if (!file) return
    if (!COMPROBANTE_ACCEPTED.includes(file.type)) { setError(t('abonos.form.comprobanteInvalidType')); return }
    if (file.size > COMPROBANTE_MAX_BYTES) { setError(t('abonos.form.comprobanteTooLarge')); return }
    setError(null)
    setComprobante(file)
  }

  const montoNumber = parseFloat(monto.replace(/[^0-9.]/g, ''))
  // SCRUM-955 §1 — el monto del abono no puede superar el de la factura asociada, cuando hay una.
  // Ajuste de alcance (Luis, post Backend Dev SCRUM-902 §4.5): un bloqueo duro acá rompe el
  // camino ya aprobado donde el excedente de un abono a nivel Factura se convierte en saldo a
  // favor de Cliente al cobrarse — la validación queda como advertencia inline, nunca bloquea.
  const montoExcedeFactura = facturaSeleccionada !== null && montoNumber > facturaSeleccionada.monto
  const canSubmit = masterClientId !== null && montoNumber > 0 && referencia.trim() !== ''
    && (sinCuentaBancaria || bankAccountId !== null) && (subClientId === null || salesProjectId !== null)

  function buildPayload(): AbonoPayload {
    return {
      master_client_id: masterClientId as number,
      sub_client_id: subClientId,
      sales_project_id: salesProjectId,
      invoice_id: invoiceId,
      monto_original: montoNumber,
      metodo_pago: metodoPago,
      cuenta_bancaria_id: sinCuentaBancaria ? null : bankAccountId,
      referencia: referencia.trim(),
      comprobante,
    }
  }

  function handleGuardarNuevo() {
    if (!canSubmit) return
    setError(null)
    registerMutation.mutate(buildPayload(), {
      onSuccess: onSaved,
      onError: (err) => setError(extractError(err) ?? t('abonos.form.errorGenerico')),
    })
  }

  function handleGuardarEdicion() {
    if (!canSubmit || abonoId === null) return
    setError(null)
    updateMutation.mutate({ id: abonoId, payload: buildPayload() }, {
      onSuccess: () => setEditing(false),
      onError: (err) => setError(extractError(err) ?? t('abonos.form.errorGenerico')),
    })
  }

  function handleCancelarEdicion() {
    if (!abono) return
    setClientQuery(abono.cliente)
    setMasterClientId(abono.master_client_id)
    setSubClientId(abono.sub_client_id)
    setSalesProjectId(abono.sales_project_id)
    setProyectoQuery(abono.proyecto ?? '')
    setSelectedQuoteId(null)
    setCotizacionQuery('')
    setInvoiceId(abono.invoice_id)
    setMonto(String(abono.monto_original))
    setMetodoPago(abono.metodo_pago)
    setBankAccountId(abono.cuenta_bancaria_id)
    setReferencia(abono.referencia)
    setError(null)
    setEditing(false)
  }

  function handleConfirmar() {
    if (abonoId === null) return
    confirmMutation.mutate(abonoId, { onSuccess: () => setConfirmAsk(false) })
  }

  const confirmado = abono?.estado === 'confirmado'
  const title = isNew ? t('abonos.form.tituloRegistrar') : t('abonos.form.tituloDetalle', { referencia: abono?.referencia ?? '' })

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <div className="flex items-center gap-2">
            {!isNew && !editing && !confirmado && (
              <Button variant="outline" onClick={() => setEditing(true)}>{t('abonos.form.editar')}</Button>
            )}
            <Button variant="icon" onClick={onClose}><IcoClose /></Button>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {loadingAbono && <p className="text-sm text-slate-400">…</p>}

          {!loadingAbono && (
            <>
              {confirmado && (
                <div className="rounded-lg bg-primary-soft text-primary-dark px-3 py-2.5 text-sm font-medium flex items-center gap-2">
                  <IcoCheck size={14} />{t('abonos.form.bannerConfirmado')}
                </div>
              )}
              {!isNew && editing && !confirmado && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                  {t('abonos.form.bannerEditable')}
                </div>
              )}

              {/* Cliente master */}
              <div className="relative">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('abonos.form.clienteMasterLabel')}
                </label>
                <div className="relative">
                  <input
                    type="text" value={clientQuery} disabled={!editing}
                    onChange={e => { setClientQuery(e.target.value); setClientOpen(true); setMasterClientId(null) }}
                    onFocus={() => setClientOpen(true)}
                    onBlur={() => setTimeout(() => setClientOpen(false), 150)}
                    placeholder={t('abonos.form.clienteMasterPlaceholder')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 pr-8 text-sm disabled:bg-slate-50 disabled:dark:bg-slate-800 disabled:text-slate-400"
                  />
                  {editing && clientQuery !== '' && (
                    <ClearFieldButton onClear={clearClient} label={t('abonos.form.limpiarBusqueda')} />
                  )}
                </div>
                {editing && clientOpen && clientOptions.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-72 overflow-auto">
                    {clientOptions.map(opt => (
                      <li key={opt.id} onMouseDown={() => selectClient(opt)}
                        className="cursor-pointer px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                        {opt.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Sub-cliente */}
              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('abonos.form.subClienteLabel')}
                </span>
                <select
                  value={subClientId ?? ''} disabled={!editing || masterClientId === null}
                  onChange={e => {
                    setSubClientId(e.target.value ? Number(e.target.value) : null)
                    setSalesProjectId(null); setInvoiceId(null)
                    setProyectoQuery(''); setSelectedQuoteId(null); setCotizacionQuery('')
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm disabled:bg-slate-50 disabled:dark:bg-slate-800 disabled:text-slate-400"
                >
                  <option value="">{masterClientId === null ? t('abonos.form.subClienteDisabledHint') : t('abonos.form.subClientePlaceholder')}</option>
                  {subClientes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>

              {/* Proyecto — SCRUM-933, buscador de texto (no <select>, el ticket dice "buscar"),
                  obligatorio si hay sub-cliente elegido. */}
              <div className="relative">
                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {subClientId !== null ? t('abonos.form.proyectoLabelRequerido') : t('abonos.form.proyectoLabel')}
                  </span>
                  <div className="relative">
                    <input
                      type="text" value={proyectoQuery} disabled={!editing || subClientId === null}
                      onChange={e => { setProyectoQuery(e.target.value); setProyectoOpen(true); setSalesProjectId(null); setInvoiceId(null) }}
                      onFocus={() => setProyectoOpen(true)}
                      onBlur={() => setTimeout(() => setProyectoOpen(false), 150)}
                      placeholder={subClientId === null ? t('abonos.form.proyectoDisabledHint') : t('abonos.form.proyectoPlaceholder')}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 pr-8 text-sm disabled:bg-slate-50 disabled:dark:bg-slate-800 disabled:text-slate-400"
                    />
                    {editing && proyectoQuery !== '' && (
                      <ClearFieldButton onClear={clearProyecto} label={t('abonos.form.limpiarBusqueda')} />
                    )}
                  </div>
                </label>
                {editing && proyectoOpen && proyectoOptions.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-56 overflow-auto">
                    {proyectoOptions.map(p => (
                      <li key={p.id} onMouseDown={() => selectProyecto(p.id, p.name)}
                        className="cursor-pointer px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                        {p.name}
                      </li>
                    ))}
                  </ul>
                )}
                {editing && subClientId !== null && salesProjectId === null && (
                  <p className="text-[11px] text-red-600 mt-1">{t('abonos.form.errorSubclienteSinProyecto')}</p>
                )}
              </div>

              {/* # de Cotización — SCRUM-933, nuevo, mismo buscador cruzado que Proyecto. */}
              <div className="relative">
                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('abonos.form.cotizacionLabel')}
                  </span>
                  <div className="relative">
                    <input
                      type="text" value={cotizacionQuery} disabled={!editing || subClientId === null}
                      onChange={e => { setCotizacionQuery(e.target.value); setCotizacionOpen(true); setSelectedQuoteId(null) }}
                      onFocus={() => setCotizacionOpen(true)}
                      onBlur={() => setTimeout(() => setCotizacionOpen(false), 150)}
                      placeholder={subClientId === null ? t('abonos.form.proyectoDisabledHint') : t('abonos.form.cotizacionPlaceholder')}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 pr-8 text-sm disabled:bg-slate-50 disabled:dark:bg-slate-800 disabled:text-slate-400"
                    />
                    {editing && cotizacionQuery !== '' && (
                      <ClearFieldButton onClear={clearCotizacion} label={t('abonos.form.limpiarBusqueda')} />
                    )}
                  </div>
                </label>
                {editing && cotizacionOpen && cotizacionOptions.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-56 overflow-auto">
                    {cotizacionOptions.map(q => (
                      <li key={q.id} onMouseDown={() => selectCotizacion(q.id, q.folio)}
                        className="cursor-pointer px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                        {q.folio}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Factura — siempre opcional; SCRUM-933, opciones acotadas a la combinación
                  Proyecto+Cotización vigente (antes: todas las del proyecto sin más filtro). */}
              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('abonos.form.facturaLabel')}
                </span>
                <select
                  value={invoiceId ?? ''} disabled={!editing || salesProjectId === null}
                  onChange={e => setInvoiceId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm disabled:bg-slate-50 disabled:dark:bg-slate-800 disabled:text-slate-400"
                >
                  <option value="">{salesProjectId === null ? t('abonos.form.facturaDisabledHint') : t('abonos.form.facturaPlaceholder')}</option>
                  {visibleFacturas.map(f => <option key={f.id} value={f.id}>{f.numero}</option>)}
                </select>
                {/* SCRUM-955 §1 — monto de referencia de la factura elegida, antes de que el
                    usuario ingrese el monto del abono. */}
                {facturaSeleccionada !== null && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {t('abonos.form.facturaMontoHint', { monto: formatCurrency(facturaSeleccionada.monto) })}
                  </p>
                )}
              </label>

              {/* Monto */}
              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('abonos.form.montoLabel')}
                </span>
                <input
                  type="text" value={monto} disabled={!editing} placeholder="$0.00"
                  onChange={e => setMonto(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm disabled:bg-slate-50 disabled:dark:bg-slate-800 disabled:text-slate-400"
                />
                {montoExcedeFactura && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">{t('abonos.form.montoExcedeFactura')}</p>
                )}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('abonos.form.metodoPagoLabel')}
                  </span>
                  <select
                    value={metodoPago} disabled={!editing}
                    onChange={e => setMetodoPago(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm disabled:bg-slate-50 disabled:dark:bg-slate-800 disabled:text-slate-400"
                  >
                    {metodosPago.methods.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('abonos.form.cuentaBancariaLabel')}
                  </span>
                  {/* SCRUM-955 §3 — retención de impuestos/ajuste de cuenta nunca representan un
                      movimiento bancario real (RN4): el campo queda bloqueado en "Otros" en vez
                      de pedir una cuenta real. El payload sigue mandando null (ver buildPayload). */}
                  <select
                    value={sinCuentaBancaria ? 'otros' : (bankAccountId ?? '')}
                    disabled={!editing || sinCuentaBancaria}
                    onChange={e => { setBankAccountId(e.target.value ? Number(e.target.value) : null); setBankAccountTouched(true) }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm disabled:bg-slate-50 disabled:dark:bg-slate-800 disabled:text-slate-400"
                  >
                    {sinCuentaBancaria ? (
                      <option value="otros">{t('abonos.form.cuentaBancariaOtros')}</option>
                    ) : (
                      <>
                        <option value="" />
                        {bankAccounts.filter(a => a.activa).map(a => (
                          <option key={a.id} value={a.id}>{a.banco} — {t(`cuentasBancarias.tipos.${a.tipo_cuenta}`)} ****{a.ultimos_4_digitos}</option>
                        ))}
                      </>
                    )}
                  </select>
                </label>
              </div>

              <label className="text-sm">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  {t('abonos.form.referenciaLabel')}
                </span>
                <input
                  type="text" value={referencia} disabled={!editing}
                  onChange={e => setReferencia(e.target.value)}
                  placeholder={t('abonos.form.referenciaPlaceholder')}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm disabled:bg-slate-50 disabled:dark:bg-slate-800 disabled:text-slate-400"
                />
              </label>

              {editing && (
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('abonos.form.comprobanteLabel')}
                  </span>
                  <label
                    onDragOver={e => { e.preventDefault(); setComprobanteDragOver(true) }}
                    onDragLeave={() => setComprobanteDragOver(false)}
                    onDrop={e => { e.preventDefault(); setComprobanteDragOver(false); pickComprobante(e.dataTransfer.files[0]) }}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-4 text-center cursor-pointer transition-colors ${
                      comprobanteDragOver ? 'border-primary bg-primary-soft/40' : 'border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    <input type="file" accept="image/jpeg,image/png,.pdf" className="hidden" onChange={e => pickComprobante(e.target.files?.[0])} />
                    <IcoPaperclip size={18} className="text-slate-400" />
                    {comprobante ? (
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate max-w-[260px]">{comprobante.name}</span>
                    ) : (
                      <>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{t('abonos.form.comprobanteDragText')}</div>
                        <div className="text-[11px] text-slate-400">{t('abonos.form.comprobanteHint')}</div>
                      </>
                    )}
                  </label>
                </div>
              )}

              {error && <p className="text-red-600 text-sm">{error}</p>}
            </>
          )}
        </div>

        <div className="flex justify-end flex-wrap gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          {isNew ? (
            <>
              <Button variant="secondary" onClick={onClose}>{t('abonos.form.cerrar')}</Button>
              <Button onClick={handleGuardarNuevo} disabled={!canSubmit} loading={saving}>{t('abonos.form.guardarAbono')}</Button>
            </>
          ) : editing ? (
            <>
              <Button variant="secondary" onClick={handleCancelarEdicion}>{t('abonos.form.cancelar')}</Button>
              <Button onClick={handleGuardarEdicion} disabled={!canSubmit} loading={saving}>{t('abonos.form.guardar')}</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>{t('abonos.form.cerrar')}</Button>
              {!confirmado && (
                <Button variant="accent" onClick={() => setConfirmAsk(true)} loading={confirmMutation.isPending}>
                  <span className="inline-flex items-center gap-1.5"><IcoCheck size={13} />{t('abonos.form.marcarConfirmado')}</span>
                </Button>
              )}
              {abono?.comprobante_url && (
                <Button variant="outline" onClick={() => window.open(abono.comprobante_url as string, '_blank')}>
                  <span className="inline-flex items-center gap-1.5"><IcoPaperclip size={13} />{t('abonos.form.verComprobante')}</span>
                </Button>
              )}
              {/* SCRUM-955 §2 — mismo comportamiento que "Ver recibo" en Cobros (DetalleCobroModal). */}
              {abono?.numero_recibo && (
                <Button onClick={verRecibo} loading={downloadReceipt.isPending}>
                  <span className="inline-flex items-center gap-1.5"><IcoPrinter size={13} />{t('abonos.form.verRecibo')}</span>
                </Button>
              )}
            </>
          )}
        </div>
      </Card>

      {confirmAsk && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <Card variant="modal" className="w-full max-w-sm p-5">
            <p className="text-sm text-slate-700 dark:text-slate-200">{t('abonos.form.confirmarPregunta')}</p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => setConfirmAsk(false)}>{t('abonos.form.cancelar')}</Button>
              <Button variant="accent" onClick={handleConfirmar} loading={confirmMutation.isPending}>{t('abonos.form.marcarConfirmado')}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function extractError(err: unknown): string | undefined {
  return isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
}
