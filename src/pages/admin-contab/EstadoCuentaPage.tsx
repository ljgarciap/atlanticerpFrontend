import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  useAccountStatementClients, useAccountStatementProjects, useGenerateAccountStatement,
  useDownloadAccountStatementExcel, useDownloadAccountStatementPdf,
} from '@/hooks/useAdminContab'
import type { AccountStatementClientOption, AccountStatementMovement, AccountStatementMovementRecibo } from '@/types/adminContab'
import { adminContabApi } from '@/api/adminContabApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import AppLogo from '@/components/AppLogo'
import {
  IcoClose, IcoSearch, IcoFileText, IcoDownload, IcoChevronDown, IcoPrinter, IcoAlertTriangle,
} from '@/components/icons'
import InvoiceDetailModal from '@/components/admin-contab/InvoiceDetailModal'
import DetalleNotaCreditoModal from '@/components/admin-contab/DetalleNotaCreditoModal'
import DetalleCobroModal from '@/components/admin-contab/DetalleCobroModal'
import RegistrarAbonoModal from '@/components/admin-contab/RegistrarAbonoModal'
import QuoteViewerModal from '@/components/QuoteViewerModal'
import GuiaEntregaModal from '@/components/GuiaEntregaModal'
import { Pagination } from '@/components/ui/Pagination'

function fmt(n: number): string {
  const abs = new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(Math.abs(n))
  return n < 0 ? `-${abs}` : abs
}

/**
 * Batch 8 del cuerpo principal (SCRUM-529→533, REQ-452→456) — Estado de Cuenta. Vista SECUNDARIA
 * de apoyo bajo `FocusedViewShell` (RN1 REQ-452 — nunca lleva el menú de navegación principal),
 * pensada para abrirse en pestaña nueva desde Facturación (`FacturacionPage.tsx::openEstadoCuenta`,
 * ya existente desde Batch 2) — reemplaza a `EstadoCuentaPlaceholderPage.tsx` por completo.
 *
 * Batch 9 (SCRUM-534→538, REQ-457→461) agrega la tarjeta de saldo, el bloque de datos de pago, la
 * nota automática de contexto, la tabla de movimientos y la apertura automática desde Facturación
 * (lee `master_client_id` de la query string, mismo patrón que REQ-474 en Cobros).
 */
export default function EstadoCuentaPage() {
  const { t } = useTranslation(['adminContab', 'bodega', 'common'])
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // SCRUM-930 (F3) — documento abierto en su modal de detalle, uno a la vez (los 4 tipos son
  // mutuamente excluyentes en la UI, no hace falta un estado combinado).
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null)
  const [detailInvoiceId, setDetailInvoiceId] = useState<number | null>(null)
  const [notaId, setNotaId] = useState<number | null>(null)
  const [quoteId, setQuoteId] = useState<number | null>(null)
  const [guiaOrderId, setGuiaOrderId] = useState<number | null>(null)
  // SCRUM-955 §5 — recibo de Cobro o de Abono asociado a una fila (columna "Cobro").
  const [reciboPaymentId, setReciboPaymentId] = useState<number | null>(null)
  const [reciboAbonoId, setReciboAbonoId]     = useState<number | null>(null)

  const [clientQuery, setClientQuery] = useState('')
  const [clientOpen, setClientOpen]   = useState(false)
  const [masterClientId, setMasterClientId] = useState<number | null>(null)
  const [salesProjectId, setSalesProjectId] = useState<number | null>(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [vistaAgrupada, setVistaAgrupada] = useState(true)
  const [clientError, setClientError]     = useState<string | null>(null)
  const [searched, setSearched]           = useState(false)
  // SCRUM-947 — paginación estándar sobre `movimientos`. La página actual la refleja
  // `statement.meta.current_page` (viene del backend); solo `perPage` necesita estado propio,
  // para recordar la elección del usuario incluso antes de la primera respuesta.
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data: clientOptions = [] } = useAccountStatementClients(clientQuery)
  const { data: projects = [] }      = useAccountStatementProjects(masterClientId)
  const generateMutation  = useGenerateAccountStatement()
  const excelMutation     = useDownloadAccountStatementExcel()
  const pdfMutation       = useDownloadAccountStatementPdf()

  const statement = generateMutation.data ?? null

  // REQ-461 — apertura automática con cliente preseleccionado desde Facturación (u otras
  // pantallas). RN1: genera de inmediato, sin que el usuario presione "Buscar". RN2: un id
  // inválido cae al estado vacío inicial, sin ningún error visible.
  useEffect(() => {
    const idParam = searchParams.get('master_client_id')
    if (!idParam) return
    const id = Number(idParam)
    if (!Number.isFinite(id)) return

    setMasterClientId(id)
    setSearched(true)
    generateMutation.mutate({ masterClientId: id, salesProjectId: null, page: 1, per_page: perPage }, {
      onSuccess: (data) => setClientQuery(data.cliente),
      onError: () => {
        setMasterClientId(null)
        setSearched(false)
        generateMutation.reset()
      },
    })
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectClient(opt: AccountStatementClientOption) {
    setMasterClientId(opt.id)
    setClientQuery(opt.name)
    setClientOpen(false)
    setSalesProjectId(null)
  }

  // RN2 REQ-453 — buscar sin cliente no está permitido, mensaje explícito (nunca window.alert()).
  function buscar() {
    if (masterClientId === null) {
      setClientError(t('estadoCuenta.busqueda.clienteRequerido'))
      return
    }
    setClientError(null)
    setSearched(true)
    generateMutation.mutate({ masterClientId, salesProjectId, desde: desde || undefined, hasta: hasta || undefined, page: 1, per_page: perPage })
  }

  // SCRUM-947 — cambiar de página/cantidad por página mantiene el resto de los filtros activos
  // (RN de la ficha), sin refrescar la pantalla — misma mutation, solo cambia page/per_page.
  function irAPagina(nuevaPagina: number) {
    if (masterClientId === null) return
    generateMutation.mutate({ masterClientId, salesProjectId, desde: desde || undefined, hasta: hasta || undefined, page: nuevaPagina, per_page: perPage })
  }

  function cambiarPerPage(nuevoPerPage: number | 'all') {
    if (masterClientId === null) return
    setPerPage(nuevoPerPage)
    generateMutation.mutate({ masterClientId, salesProjectId, desde: desde || undefined, hasta: hasta || undefined, page: 1, per_page: nuevoPerPage })
  }

  // RN3 REQ-453 — resetea todo y vuelve al estado vacío inicial.
  function limpiar() {
    setClientQuery('')
    setMasterClientId(null)
    setSalesProjectId(null)
    setDesde('')
    setHasta('')
    setClientError(null)
    setSearched(false)
    setPerPage(20)
    generateMutation.reset()
  }

  function descargarExcel() {
    if (masterClientId === null) return
    excelMutation.mutate({ masterClientId, salesProjectId, desde: desde || undefined, hasta: hasta || undefined })
  }

  // SCRUM-857 (REQ-456) — antes esto era window.print() de la pantalla en vivo (de ahí el nombre
  // engañoso del botón, "Descargar PDF" que en realidad imprimía) — ahora descarga el documento
  // real generado en servidor.
  function descargarPdf() {
    if (masterClientId === null) return
    pdfMutation.mutate({ masterClientId, salesProjectId, desde: desde || undefined, hasta: hasta || undefined })
  }

  const showEmptyState = !searched || (generateMutation.isError && !generateMutation.data)

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <div className="flex items-start justify-between mb-5 pb-4 border-b border-slate-100 dark:border-slate-700 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AppLogo size={24} iconOnly />
            <span className="text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400 uppercase">
              Atlantic
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('estadoCuenta.title')}</h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('estadoCuenta.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {/* SCRUM-930 (F4) — mismo botón/pantalla que ya usa Facturación (misma ruta, misma key
              de traducción), a la izquierda de "Cerrar Ventana". */}
          <Button variant="secondary" onClick={() => navigate('/bodega/pedidos/status')}>
            {t('bodega:pedidos.actions.orderStatus')}
          </Button>
          {/* RN2 REQ-452 — cierra la pestaña/ventana actual. Oculto al imprimir (mismo criterio que
              el mockup: solo el resultado se imprime, no los controles de la pantalla). */}
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2"
          >
            <IcoClose size={13} />
            {t('estadoCuenta.close')}
          </button>
        </div>
      </div>

      <Card variant="panel" className="p-4 mb-4 print:hidden">
        <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">{t('estadoCuenta.busqueda.title')}</div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="relative">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('estadoCuenta.busqueda.subclienteLabel')}
            </label>
            <div className="relative">
              <IcoSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={clientQuery}
                onChange={e => { setClientQuery(e.target.value); setClientOpen(true); setMasterClientId(null); setClientError(null) }}
                onFocus={() => setClientOpen(true)}
                onBlur={() => setTimeout(() => setClientOpen(false), 150)}
                placeholder={t('estadoCuenta.busqueda.subclientePlaceholder')}
                className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 pl-8 pr-3 py-2 text-sm min-w-[220px]"
              />
            </div>
            {clientOpen && clientOptions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full min-w-[220px] rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-48 overflow-auto">
                {clientOptions.map(opt => (
                  <li key={opt.id} onMouseDown={() => selectClient(opt)}
                    className="cursor-pointer px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                    {opt.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('estadoCuenta.busqueda.proyectoLabel')}
            </span>
            <select
              value={salesProjectId ?? ''}
              onChange={e => setSalesProjectId(e.target.value ? Number(e.target.value) : null)}
              disabled={masterClientId === null}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm min-w-[190px] disabled:opacity-50"
            >
              <option value="">{t('estadoCuenta.busqueda.proyectoPlaceholder')}</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('estadoCuenta.busqueda.desde')}
            </span>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm" />
          </label>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('estadoCuenta.busqueda.hasta')}
            </span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm" />
          </label>

          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('estadoCuenta.busqueda.vistaLabel')}
            </span>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/40 rounded-lg p-1">
              <button type="button" onClick={() => setVistaAgrupada(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${vistaAgrupada ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                {t('estadoCuenta.busqueda.vistaAgrupado')}
              </button>
              <button type="button" onClick={() => setVistaAgrupada(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${!vistaAgrupada ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                {t('estadoCuenta.busqueda.vistaPlana')}
              </button>
            </div>
          </div>

          <Button onClick={buscar} loading={generateMutation.isPending}>{t('estadoCuenta.busqueda.buscar')}</Button>
          <Button variant="secondary" onClick={limpiar}>{t('estadoCuenta.busqueda.limpiar')}</Button>
        </div>
        {clientError && <p className="text-red-600 text-xs mt-2">{clientError}</p>}
      </Card>

      <Card variant="panel" className="p-5">
        {showEmptyState && !generateMutation.isPending && (
          <div className="flex flex-col items-center text-center py-14 text-slate-400">
            <IcoFileText size={32} className="mb-3" />
            <p className="text-sm max-w-sm">{t('estadoCuenta.vacio.mensaje')}</p>
          </div>
        )}

        {generateMutation.isError && (
          <p className="text-red-600 text-sm text-center py-4">{t('estadoCuenta.resultado.error')}</p>
        )}

        {statement && (
          <div>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {statement.cliente}{statement.proyecto ? ` · ${statement.proyecto}` : ''}
                </div>
                <div className="text-[11.5px] text-slate-400 mt-0.5">
                  {t('estadoCuenta.resultado.metaLine', {
                    tarifa: statement.tarifa ? t(`ventasDiseno:priceType.${statement.tarifa}`) : t('ventasDiseno:priceType.none'),
                    regimen: t(`estadoCuenta.regimen.${statement.regimen_fiscal}`),
                    terminos: statement.terminos_pago,
                  })}
                </div>
              </div>
              <ExportMenu
                t={t} onPdf={descargarPdf} onExcel={descargarExcel}
                loadingPdf={pdfMutation.isPending} loadingExcel={excelMutation.isPending}
              />
            </div>

            {/* REQ-457 — tarjeta de saldo. */}
            <div
              className={`inline-flex items-baseline gap-2 rounded-xl px-4 py-3 mb-4 ${statement.saldo_a_favor ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary-soft dark:bg-slate-700/40'}`}
            >
              <span className={`text-[11.5px] font-medium ${statement.saldo_a_favor ? 'text-amber-800 dark:text-amber-300' : 'text-primary-dark'}`}>
                {statement.saldo_a_favor ? t('estadoCuenta.resultado.saldoAFavor') : t('estadoCuenta.resultado.saldoActual')}
              </span>
              <span className={`text-xl font-bold ${statement.saldo_a_favor ? 'text-amber-800 dark:text-amber-300' : 'text-primary-dark'}`}>
                {fmt(Math.abs(statement.saldo))}
              </span>
            </div>

            {/* REQ-458 — bloque de datos de pago, siempre visible. Tipo de cuenta/Banco se
                agregaron sueltos (SCRUM-857) junto a Cuenta número (ahora el número real, no
                enmascarado — ver InvoiceService::paymentBlock() en el backend). */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 bg-slate-50 dark:bg-slate-700/30 rounded-lg px-4 py-3 mb-3 text-xs">
              <div><span className="text-slate-400">{t('estadoCuenta.resultado.pagoA')}:</span>{' '}
                <strong className="text-slate-700 dark:text-slate-200">{statement.pago_a ?? '—'}</strong></div>
              <div><span className="text-slate-400">{t('estadoCuenta.resultado.cuentaNumero')}:</span>{' '}
                <strong className="text-slate-700 dark:text-slate-200">{statement.numero_cuenta ?? '—'}</strong></div>
              <div><span className="text-slate-400">{t('estadoCuenta.resultado.tipoCuenta')}:</span>{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {statement.tipo_cuenta ? t(`cuentasBancarias.tipos.${statement.tipo_cuenta}`) : '—'}
                </strong></div>
              <div><span className="text-slate-400">{t('estadoCuenta.resultado.banco')}:</span>{' '}
                <strong className="text-slate-700 dark:text-slate-200">{statement.banco ?? '—'}</strong></div>
              <div><span className="text-slate-400">{t('estadoCuenta.resultado.responsable')}:</span>{' '}
                <strong className="text-slate-700 dark:text-slate-200">{statement.responsable ?? '—'}</strong></div>
            </div>

            {/* REQ-459 — nota automática de contexto (nunca escrita a mano). */}
            {(statement.nota_contexto || (statement.proyectos_count ?? 0) > 1) && (
              <div className="flex items-start gap-2 text-[11.5px] text-slate-500 dark:text-slate-400 mb-4">
                <IcoAlertTriangle size={13} className="mt-0.5 shrink-0" />
                <div className="flex flex-col gap-0.5">
                  {statement.nota_contexto && <span>{statement.nota_contexto}</span>}
                  {(statement.proyectos_count ?? 0) > 1 && (
                    <span>{t('estadoCuenta.resultado.multiplesProyectos', { count: statement.proyectos_count })}</span>
                  )}
                </div>
              </div>
            )}

            {/* REQ-460 — tabla de movimientos. */}
            <MovementsTable
              t={t} movements={statement.movimientos} grouped={vistaAgrupada}
              onOpenInvoice={(orderId, invoiceId) => { setDetailOrderId(orderId); setDetailInvoiceId(invoiceId) }}
              onOpenNota={setNotaId}
              onOpenQuote={setQuoteId}
              onOpenGuia={setGuiaOrderId}
              onOpenRecibo={(recibo) => {
                if (recibo.tipo === 'cobro') setReciboPaymentId(recibo.id)
                // SCRUM-1168 F3 — una compensación no tiene modal propio: su documento con folio CMP se descarga.
                else if (recibo.tipo === 'compensacion') void adminContabApi.compensaciones.downloadPdf(recibo.id, recibo.numero_recibo)
                else setReciboAbonoId(recibo.id)
              }}
            />

            {/* SCRUM-947 — paginación estándar. En vista agrupada, el subtotal por proyecto de
                cada bloque queda acotado a lo que trae la página actual (mismo criterio que
                cualquier tabla agrupada y paginada del sistema). */}
            <div className="print:hidden">
              <Pagination meta={statement.meta} perPage={perPage} onPageChange={irAPagina} onPerPageChange={cambiarPerPage} />
            </div>
          </div>
        )}
      </Card>

      {/* SCRUM-930 (F3) — los 4 modales de detalle, ya reusables tal cual desde otras pantallas. */}
      {detailOrderId !== null && (
        <InvoiceDetailModal
          orderId={detailOrderId} invoiceId={detailInvoiceId} t={t}
          onClose={() => { setDetailOrderId(null); setDetailInvoiceId(null) }}
        />
      )}
      {notaId !== null && <DetalleNotaCreditoModal notaId={notaId} onClose={() => setNotaId(null)} />}
      {quoteId !== null && <QuoteViewerModal quoteId={quoteId} onClose={() => setQuoteId(null)} />}
      {guiaOrderId !== null && <GuiaEntregaModal orderId={guiaOrderId} onClose={() => setGuiaOrderId(null)} />}
      {/* SCRUM-955 §5 — columna "Cobro": recibo de Cobro (modal ya existente) o de Abono (mismo
          componente que Registrar Abono, que también cubre el detalle bloqueado). */}
      {reciboPaymentId !== null && <DetalleCobroModal paymentId={reciboPaymentId} onClose={() => setReciboPaymentId(null)} />}
      {reciboAbonoId !== null && (
        <RegistrarAbonoModal abonoId={reciboAbonoId} onClose={() => setReciboAbonoId(null)} onSaved={() => setReciboAbonoId(null)} />
      )}
    </div>
  )
}

function ExportMenu(
  { t, onPdf, onExcel, loadingPdf, loadingExcel }: {
    t: (key: string, opts?: Record<string, unknown>) => string
    onPdf: () => void
    onExcel: () => void
    loadingPdf: boolean
    loadingExcel: boolean
  },
) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative print:hidden">
      <Button variant="secondary" onClick={() => setOpen(prev => !prev)} loading={loadingPdf || loadingExcel}>
        <span className="inline-flex items-center gap-1.5">
          {t('estadoCuenta.resultado.descargarImprimir')} <IcoChevronDown size={12} />
        </span>
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-52 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-20 py-1">
            {/* SCRUM-857 — antes disparaba window.print() de la pantalla en vivo (de ahí el ícono
                de impresora, que se mantiene igual porque sigue siendo la acción de "imprimible"
                para el usuario, ahora sobre el PDF real). */}
            <button
              type="button" onClick={() => { setOpen(false); onPdf() }}
              className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            >
              <IcoPrinter size={13} /> {t('estadoCuenta.resultado.descargarPdf')}
            </button>
            <button
              type="button" onClick={() => { setOpen(false); onExcel() }}
              className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            >
              <IcoDownload size={13} /> {t('estadoCuenta.resultado.descargarExcel')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * REQ-460 — "Agrupado por proyecto" (RN3, subtotal por bloque) o "Vista plana" (RN4, columna
 * Proyecto/Pedido visible). El backend siempre devuelve un único array cronológico con saldo
 * corrido ya calculado (RN1/RN2) — agrupar es puramente de presentación, no un fetch aparte.
 */
/** SCRUM-930 (F3) — callbacks que abren cada uno de los 4 modales de detalle, uno por tipo de documento. */
interface MovementLinkHandlers {
  onOpenInvoice: (orderId: number, invoiceId: number | null) => void
  onOpenNota: (notaId: number) => void
  onOpenQuote: (quoteId: number) => void
  onOpenGuia: (orderId: number) => void
  onOpenRecibo: (recibo: AccountStatementMovementRecibo) => void
}

function MovementsTable(
  { t, movements, grouped, onOpenInvoice, onOpenNota, onOpenQuote, onOpenGuia, onOpenRecibo }:
  { t: (key: string, opts?: Record<string, unknown>) => string; movements: AccountStatementMovement[]; grouped: boolean }
  & MovementLinkHandlers,
) {
  if (movements.length === 0) return null

  const handlers = { onOpenInvoice, onOpenNota, onOpenQuote, onOpenGuia, onOpenRecibo }

  if (!grouped) {
    return (
      <table className="w-full text-xs">
        <MovementsHead t={t} withProyecto />
        <tbody>
          {movements.map((m, i) => <MovementRow key={i} m={m} t={t} withProyecto {...handlers} />)}
        </tbody>
      </table>
    )
  }

  const groups = new Map<string, AccountStatementMovement[]>()
  for (const m of movements) {
    const key = m.proyecto ?? t('estadoCuenta.resultado.sinProyecto')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }

  return (
    <div className="flex flex-col gap-5">
      {Array.from(groups.entries()).map(([proyecto, rows]) => {
        const subDebito  = rows.reduce((s, r) => s + r.debito, 0)
        const subCredito = rows.reduce((s, r) => s + r.credito, 0)
        return (
          <div key={proyecto}>
            <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-1.5 mb-1">
              {proyecto}
            </div>
            <table className="w-full text-xs">
              <MovementsHead t={t} />
              <tbody>
                {rows.map((m, i) => <MovementRow key={i} m={m} t={t} {...handlers} />)}
                <tr className="bg-slate-50 dark:bg-slate-700/40 font-semibold">
                  {/* SCRUM-877 p2 / SCRUM-955 §5 — la vista agrupada tiene 6 columnas antes de
                      Débito (Fecha, N° Factura, Cobro, Concepto, N° Cotización, Guía de entrega);
                      el colSpan={5} anterior corría los 3 totales una columna a la izquierda. */}
                  <td colSpan={6} className="py-1.5 px-2">{t('estadoCuenta.resultado.subtotalProyecto')}</td>
                  <td className="py-1.5 px-2 text-right">{fmt(subDebito)}</td>
                  <td className="py-1.5 px-2 text-right">{fmt(subCredito)}</td>
                  <td className="py-1.5 px-2 text-right">{fmt(subDebito - subCredito)}</td>
                  {/* SCRUM-930 — "Antigüedad de cartera" no tiene un subtotal significativo (es
                      categórica, por factura individual), la fila de subtotal la deja en blanco. */}
                  <td className="py-1.5 px-2" />
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function MovementsHead({ t, withProyecto }: { t: (key: string) => string; withProyecto?: boolean }) {
  return (
    <thead>
      <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-700">
        <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.fecha')}</th>
        {withProyecto && <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.proyecto')}</th>}
        <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.numeroFactura')}</th>
        {/* SCRUM-955 §5 — al lado derecho de "N° Factura", como pide el ticket. */}
        <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.cobro')}</th>
        <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.concepto')}</th>
        <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.cotizacion')}</th>
        <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.guiaEntrega')}</th>
        <th className="py-1.5 px-2 text-right">{t('estadoCuenta.resultado.columnas.debito')}</th>
        <th className="py-1.5 px-2 text-right">{t('estadoCuenta.resultado.columnas.credito')}</th>
        <th className="py-1.5 px-2 text-right">{t('estadoCuenta.resultado.columnas.saldo')}</th>
        {/* SCRUM-930 (F2) — inmediatamente después de Saldo, tal como pide el ticket. */}
        <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.antiguedadCartera')}</th>
      </tr>
    </thead>
  )
}

/** SCRUM-877 p1 — etiqueta de la columna "Concepto" por tipo de movimiento. */
const MOVEMENT_TIPO_KEY: Record<AccountStatementMovement['tipo'], string> = {
  factura: 'estadoCuenta.resultado.tipoFactura',
  cobro: 'estadoCuenta.resultado.tipoCobro',
  descuento: 'estadoCuenta.resultado.tipoDescuento',
  devolucion: 'estadoCuenta.resultado.tipoDevolucion',
  anulacion: 'estadoCuenta.resultado.tipoAnulacion',
  compensacion: 'estadoCuenta.resultado.tipoCompensacion',
  devolucion_saldo: 'estadoCuenta.resultado.tipoDevolucionSaldo',
}

/** SCRUM-930 (F2) — etiqueta del rango de antigüedad; claves propias en vez de reusar
 *  `facturacion.aging.*` (ese bloque espera params `desde`/`hasta` numéricos, acá el backend ya
 *  entrega el bucket resuelto como string). */
const ANTIGUEDAD_KEY: Record<NonNullable<AccountStatementMovement['antiguedad_cartera']>, string> = {
  '0-30':  'estadoCuenta.resultado.antiguedad.dias0a30',
  '31-60': 'estadoCuenta.resultado.antiguedad.dias31a60',
  '61-90': 'estadoCuenta.resultado.antiguedad.dias61a90',
  '91+':   'estadoCuenta.resultado.antiguedad.dias91mas',
}

/** SCRUM-930 (F3) — número de documento como botón-link cuando hay id para enlazar; texto plano
 *  ("—" si no hay número) cuando no — mismo criterio en las 4 columnas de documento. */
function DocLink({ label, onClick }: { label: string | null; onClick: (() => void) | null }) {
  if (!label) return <>—</>
  if (!onClick) return <>{label}</>
  return (
    <button type="button" onClick={onClick} className="text-primary-dark hover:underline font-medium">
      {label}
    </button>
  )
}

function MovementRow(
  { m, t, withProyecto, onOpenInvoice, onOpenNota, onOpenQuote, onOpenGuia, onOpenRecibo }:
  { m: AccountStatementMovement; t: (key: string) => string; withProyecto?: boolean } & MovementLinkHandlers,
) {
  // SCRUM-930 (F3) — la tabla no tiene una columna propia de "Nota Crédito": el documento de
  // descuento/devolución/anulación se identifica hoy por la celda Concepto (que ya dice
  // "Descuento"/"Devolución"/"Anulación" para esas filas) — se vuelve el link de esa fila.
  const notaClick = m.nota_id !== null ? () => onOpenNota(m.nota_id!) : null
  const facturaClick = m.order_id !== null && m.invoice_id !== null ? () => onOpenInvoice(m.order_id!, m.invoice_id!) : null
  const cotizacionClick = m.quote_id !== null ? () => onOpenQuote(m.quote_id!) : null
  const guiaClick = m.guia_entrega_order_id !== null ? () => onOpenGuia(m.guia_entrega_order_id!) : null
  // SCRUM-955 §5 — el folio ya distingue Recibo de Cobro (REC-XXX) de Recibo de Abono (ABN-XXX,
  // secuencia propia) sin necesidad de un label aparte.
  const reciboClick = m.recibo !== null ? () => onOpenRecibo(m.recibo!) : null

  return (
    <tr className="border-b border-slate-50 dark:border-slate-800">
      <td className="py-1.5 px-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{m.fecha}</td>
      {withProyecto && <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{m.proyecto ?? '—'}</td>}
      <td className="py-1.5 px-2 text-slate-700 dark:text-slate-200">
        <DocLink label={m.numero_factura} onClick={facturaClick} />
      </td>
      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">
        <DocLink label={m.recibo?.numero_recibo ?? null} onClick={reciboClick} />
      </td>
      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">
        {notaClick
          ? <button type="button" onClick={notaClick} className="text-primary-dark hover:underline font-medium">
              {t(MOVEMENT_TIPO_KEY[m.tipo] ?? 'estadoCuenta.resultado.tipoCobro')}
            </button>
          : t(MOVEMENT_TIPO_KEY[m.tipo] ?? 'estadoCuenta.resultado.tipoCobro')}
      </td>
      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">
        <DocLink label={m.cotizacion_folio} onClick={cotizacionClick} />
      </td>
      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">
        <DocLink label={m.guia_entrega_numero} onClick={guiaClick} />
      </td>
      {/* SCRUM-955 §4 — colores invertidos a pedido del ticket: Débito ahora verde, Crédito ahora
          rojo (antes era al revés; el valor/lógica contable no cambia, solo el color). */}
      <td className={`py-1.5 px-2 text-right ${m.debito > 0 ? 'text-green-700 dark:text-green-400' : 'text-slate-300 dark:text-slate-600'}`}>
        {m.debito > 0 ? fmt(m.debito) : '—'}
      </td>
      <td className={`py-1.5 px-2 text-right ${m.credito > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-300 dark:text-slate-600'}`}>
        {m.credito > 0 ? fmt(m.credito) : '—'}
      </td>
      <td className="py-1.5 px-2 text-right font-semibold text-slate-800 dark:text-slate-100">{fmt(m.saldo)}</td>
      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">
        {m.antiguedad_cartera ? t(ANTIGUEDAD_KEY[m.antiguedad_cartera]) : '—'}
      </td>
    </tr>
  )
}
