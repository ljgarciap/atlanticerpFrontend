import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import {
  useAccountStatementClients, useAccountStatementProjects, useGenerateAccountStatement,
  useDownloadAccountStatementExcel,
} from '@/hooks/useAdminContab'
import type { AccountStatementClientOption, AccountStatementMovement } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import AppLogo from '@/components/AppLogo'
import {
  IcoClose, IcoSearch, IcoFileText, IcoDownload, IcoChevronDown, IcoPrinter, IcoAlertTriangle,
} from '@/components/icons'

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
  const { t } = useTranslation('adminContab')
  const [searchParams, setSearchParams] = useSearchParams()

  const [clientQuery, setClientQuery] = useState('')
  const [clientOpen, setClientOpen]   = useState(false)
  const [masterClientId, setMasterClientId] = useState<number | null>(null)
  const [salesProjectId, setSalesProjectId] = useState<number | null>(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [vistaAgrupada, setVistaAgrupada] = useState(true)
  const [clientError, setClientError]     = useState<string | null>(null)
  const [searched, setSearched]           = useState(false)

  const { data: clientOptions = [] } = useAccountStatementClients(clientQuery)
  const { data: projects = [] }      = useAccountStatementProjects(masterClientId)
  const generateMutation  = useGenerateAccountStatement()
  const excelMutation     = useDownloadAccountStatementExcel()

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
    generateMutation.mutate({ masterClientId: id, salesProjectId: null }, {
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
    generateMutation.mutate({ masterClientId, salesProjectId, desde: desde || undefined, hasta: hasta || undefined })
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
    generateMutation.reset()
  }

  function descargarExcel() {
    if (masterClientId === null) return
    excelMutation.mutate({ masterClientId, salesProjectId, desde: desde || undefined, hasta: hasta || undefined })
  }

  const showEmptyState = !searched || (generateMutation.isError && !generateMutation.data)

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <div className="flex items-start justify-between mb-5 pb-4 border-b border-slate-100 dark:border-slate-700 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AppLogo size={24} iconOnly />
            <span className="text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400 uppercase">
              Atlantic · AtlanticERP
            </span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('estadoCuenta.title')}</h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('estadoCuenta.subtitle')}</p>
        </div>
        {/* RN2 REQ-452 — cierra la pestaña/ventana actual. Oculto al imprimir (mismo criterio que
            el mockup: solo el resultado se imprime, no los controles de la pantalla). */}
        <button
          type="button"
          onClick={() => window.close()}
          className="print:hidden inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2"
        >
          <IcoClose size={13} />
          {t('estadoCuenta.close')}
        </button>
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
              <ExportMenu t={t} onPrint={() => window.print()} onExcel={descargarExcel} loading={excelMutation.isPending} />
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

            {/* REQ-458 — bloque de datos de pago, siempre visible. */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 bg-slate-50 dark:bg-slate-700/30 rounded-lg px-4 py-3 mb-3 text-xs">
              <div><span className="text-slate-400">{t('estadoCuenta.resultado.pagoA')}:</span>{' '}
                <strong className="text-slate-700 dark:text-slate-200">{statement.pago_a ?? '—'}</strong></div>
              <div><span className="text-slate-400">{t('estadoCuenta.resultado.cuentaNumero')}:</span>{' '}
                <strong className="text-slate-700 dark:text-slate-200">{statement.cuenta_pago ?? '—'}</strong></div>
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
            <MovementsTable t={t} movements={statement.movimientos} grouped={vistaAgrupada} />
          </div>
        )}
      </Card>
    </div>
  )
}

function ExportMenu(
  { t, onPrint, onExcel, loading }:
  { t: (key: string, opts?: Record<string, unknown>) => string; onPrint: () => void; onExcel: () => void; loading: boolean },
) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative print:hidden">
      <Button variant="secondary" onClick={() => setOpen(prev => !prev)} loading={loading}>
        <span className="inline-flex items-center gap-1.5">
          {t('estadoCuenta.resultado.descargarImprimir')} <IcoChevronDown size={12} />
        </span>
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-52 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-20 py-1">
            <button
              type="button" onClick={() => { setOpen(false); onPrint() }}
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
function MovementsTable(
  { t, movements, grouped }:
  { t: (key: string, opts?: Record<string, unknown>) => string; movements: AccountStatementMovement[]; grouped: boolean },
) {
  if (movements.length === 0) return null

  if (!grouped) {
    return (
      <table className="w-full text-xs">
        <MovementsHead t={t} withProyecto />
        <tbody>
          {movements.map((m, i) => <MovementRow key={i} m={m} t={t} withProyecto />)}
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
                {rows.map((m, i) => <MovementRow key={i} m={m} t={t} />)}
                <tr className="bg-slate-50 dark:bg-slate-700/40 font-semibold">
                  <td colSpan={4} className="py-1.5 px-2">{t('estadoCuenta.resultado.subtotalProyecto')}</td>
                  <td className="py-1.5 px-2 text-right">{fmt(subDebito)}</td>
                  <td className="py-1.5 px-2 text-right">{fmt(subCredito)}</td>
                  <td className="py-1.5 px-2 text-right">{fmt(subDebito - subCredito)}</td>
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
        <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.concepto')}</th>
        <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.cotizacion')}</th>
        <th className="py-1.5 px-2">{t('estadoCuenta.resultado.columnas.guiaEntrega')}</th>
        <th className="py-1.5 px-2 text-right">{t('estadoCuenta.resultado.columnas.debito')}</th>
        <th className="py-1.5 px-2 text-right">{t('estadoCuenta.resultado.columnas.credito')}</th>
        <th className="py-1.5 px-2 text-right">{t('estadoCuenta.resultado.columnas.saldo')}</th>
      </tr>
    </thead>
  )
}

function MovementRow(
  { m, t, withProyecto }:
  { m: AccountStatementMovement; t: (key: string) => string; withProyecto?: boolean },
) {
  return (
    <tr className="border-b border-slate-50 dark:border-slate-800">
      <td className="py-1.5 px-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{m.fecha}</td>
      {withProyecto && <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{m.proyecto ?? '—'}</td>}
      <td className="py-1.5 px-2 text-slate-700 dark:text-slate-200">{m.numero_factura}</td>
      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">
        {m.tipo === 'factura' ? t('estadoCuenta.resultado.tipoFactura') : t('estadoCuenta.resultado.tipoCobro')}
      </td>
      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{m.cotizacion_folio ?? '—'}</td>
      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{m.guia_entrega ? t('estadoCuenta.resultado.guiaSi') : '—'}</td>
      <td className={`py-1.5 px-2 text-right ${m.debito > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-300 dark:text-slate-600'}`}>
        {m.debito > 0 ? fmt(m.debito) : '—'}
      </td>
      <td className={`py-1.5 px-2 text-right ${m.credito > 0 ? 'text-primary-dark' : 'text-slate-300 dark:text-slate-600'}`}>
        {m.credito > 0 ? fmt(m.credito) : '—'}
      </td>
      <td className="py-1.5 px-2 text-right font-semibold text-slate-800 dark:text-slate-100">{fmt(m.saldo)}</td>
    </tr>
  )
}
