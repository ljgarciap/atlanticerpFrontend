import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { UseMutationResult } from '@tanstack/react-query'
import { useAccountStatementClients } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoChevronLeft, IcoFileText } from '@/components/icons'
import type { ClientCollectionReport, ClientCollectionReportParams } from '@/types/adminContab'

function money(n: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(n)
}

type Translate = (key: string, opts?: Record<string, unknown>) => string

/**
 * Batch 23 Grupo 2 (SCRUM-651→660, REQ-574→583) — vista compartida entre "Reporte mensual por
 * cliente" (4M1, `agrupacion="dia"`) y "Mensual por cliente — acumulado" (4M2,
 * `agrupacion="mes"`) — ~95% idénticas por diseño (mismo filtro/resumen/tabla de cobros por
 * método de pago), la única diferencia real es la columna de agrupación. Los wrappers
 * `MensualClientePage`/`MensualClienteAcumuladoPage` pasan sus propias mutations (generar +
 * excel) para no acoplar esta vista a un endpoint fijo.
 *
 * RN1 REQ-574/579 — sin cliente seleccionado, ningún fetch: la mutation ni se dispara. RN2 — la
 * opción "Todos los clientes" (`masterClientId: 'todos'`) combina todos los registros. Cambiar de
 * cliente dispara la consulta de inmediato; cambiar las fechas NO — hace falta "Filtrar" (mismo
 * comportamiento que el mockup real, `selCliente.addEventListener('change', ...)` vs. el botón).
 */
export default function ClientCollectionReportView(
  { t, title, subtitle, agrupacion, generateMutation, excelMutation }: {
    t: Translate
    title: string
    subtitle: string
    agrupacion: 'dia' | 'mes'
    generateMutation: UseMutationResult<ClientCollectionReport, unknown, ClientCollectionReportParams>
    excelMutation: UseMutationResult<void, unknown, ClientCollectionReportParams>
  },
) {
  const navigate = useNavigate()
  const [clientQuery, setClientQuery] = useState('')
  const [clientOpen, setClientOpen] = useState(false)
  const [masterClientId, setMasterClientId] = useState<number | 'todos' | null>(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const { data: clientOptions = [] } = useAccountStatementClients(clientQuery)

  function runReport(id: number | 'todos', desdeVal: string, hastaVal: string) {
    generateMutation.mutate({ masterClientId: id, desde: desdeVal || undefined, hasta: hastaVal || undefined })
  }

  function selectClient(id: number | 'todos', label: string) {
    setMasterClientId(id)
    setClientQuery(label)
    setClientOpen(false)
    runReport(id, desde, hasta)
  }

  function filtrar() {
    if (masterClientId === null) return
    runReport(masterClientId, desde, hasta)
  }

  function limpiar() {
    setClientQuery('')
    setMasterClientId(null)
    setDesde('')
    setHasta('')
    generateMutation.reset()
  }

  function descargar() {
    if (masterClientId === null || report?.estado !== 'ok' || report.filas.length === 0) return
    excelMutation.mutate({ masterClientId, desde: desde || undefined, hasta: hasta || undefined })
  }

  const report = generateMutation.data
  const tieneDatos = report?.estado === 'ok' && report.filas.length > 0
  const descargarDisabled = masterClientId === null || !tieneDatos || excelMutation.isPending

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <button
        type="button" onClick={() => navigate('/admin-contab/reportes')}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-3"
      >
        <IcoChevronLeft size={14} /> {t('adminContab:reportes.mensualCliente.volver')}
      </button>

      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
      </div>

      <Card variant="panel" className="p-4 mb-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="relative">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('adminContab:reportes.mensualCliente.cliente')}
            </label>
            <input
              type="text"
              value={clientQuery}
              onChange={e => { setClientQuery(e.target.value); setClientOpen(true) }}
              onFocus={() => setClientOpen(true)}
              onBlur={() => setTimeout(() => setClientOpen(false), 150)}
              placeholder={t('adminContab:reportes.mensualCliente.clientePlaceholder')}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm min-w-[220px]"
            />
            {clientOpen && (
              <ul className="absolute z-10 mt-1 w-full min-w-[220px] rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-48 overflow-auto">
                <li
                  onMouseDown={() => selectClient('todos', t('adminContab:reportes.mensualCliente.todosLosClientes'))}
                  className="cursor-pointer px-3 py-1.5 text-sm font-medium text-primary-dark hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {t('adminContab:reportes.mensualCliente.todosLosClientes')}
                </li>
                {clientOptions.map(opt => (
                  <li key={opt.id} onMouseDown={() => selectClient(opt.id, opt.name)}
                    className="cursor-pointer px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                    {opt.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminContab:reportes.mensualCliente.desde')}</span>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminContab:reportes.mensualCliente.hasta')}</span>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm" />
          </label>

          <Button onClick={filtrar} disabled={masterClientId === null} loading={generateMutation.isPending}>
            {t('adminContab:reportes.mensualCliente.filtrar')}
          </Button>
          <Button variant="secondary" onClick={limpiar}>{t('adminContab:reportes.mensualCliente.limpiar')}</Button>
          <Button variant="outline" onClick={descargar} disabled={descargarDisabled} loading={excelMutation.isPending} className="ml-auto">
            {t('adminContab:reportes.mensualCliente.descargar')}
          </Button>
        </div>
        {descargarDisabled && masterClientId !== null && !tieneDatos && (
          <p className="text-[11px] text-slate-400 mt-2">{t('adminContab:reportes.mensualCliente.sinDatosParaDescargar')}</p>
        )}
      </Card>

      <Card variant="panel" className="p-5">
        {masterClientId === null && (
          <div className="flex flex-col items-center text-center py-14 text-slate-400">
            <IcoFileText size={32} className="mb-3" />
            <p className="text-sm">{t('adminContab:reportes.mensualCliente.seleccionaCliente')}</p>
          </div>
        )}

        {masterClientId !== null && report?.estado === 'ok' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <Kpi label={t('adminContab:reportes.mensualCliente.registros')} value={String(report.resumen.registros)} />
              <Kpi label={t('adminContab:reportes.mensualCliente.totalFacturado')} value={money(report.resumen.total_facturado)} />
              <Kpi label={t('adminContab:reportes.mensualCliente.totalCobrado')} value={money(report.resumen.total_cobrado)} good />
              <Kpi label={t('adminContab:reportes.mensualCliente.totalPendiente')} value={money(report.resumen.total_pendiente)} />
            </div>

            {report.filas.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">{t('adminContab:reportes.mensualCliente.sinRegistros')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      {agrupacion === 'dia'
                        ? <th className="py-1.5 px-2">{t('adminContab:reportes.mensualCliente.columnas.fecha')}</th>
                        : <><th className="py-1.5 px-2">{t('adminContab:reportes.mensualCliente.columnas.anio')}</th><th className="py-1.5 px-2">{t('adminContab:reportes.mensualCliente.columnas.mes')}</th></>}
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.mensualCliente.columnas.num')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.mensualCliente.columnas.importe')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.mensualCliente.columnas.media')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.mensualCliente.columnas.transferencia')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.mensualCliente.columnas.cheque')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.mensualCliente.columnas.efectivo')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.mensualCliente.columnas.yappy')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.mensualCliente.columnas.otros')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.mensualCliente.columnas.totalCaja')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.filas.map((f, i) => (
                      <tr key={i} className="border-b border-slate-50 dark:border-slate-800">
                        {agrupacion === 'dia'
                          ? <td className="py-1.5 px-2 whitespace-nowrap">{f.fecha}</td>
                          : <><td className="py-1.5 px-2">{f.anio}</td><td className="py-1.5 px-2">{f.mes}</td></>}
                        <td className="py-1.5 px-2 text-right">{f.num}</td>
                        <td className="py-1.5 px-2 text-right">{money(f.importe)}</td>
                        <td className="py-1.5 px-2 text-right">{money(f.media)}</td>
                        <td className="py-1.5 px-2 text-right">{money(f.transferencia)}</td>
                        <td className="py-1.5 px-2 text-right">{money(f.cheque)}</td>
                        <td className="py-1.5 px-2 text-right">{money(f.efectivo)}</td>
                        <td className="py-1.5 px-2 text-right">{money(f.yappy)}</td>
                        <td className="py-1.5 px-2 text-right">{money(f.otros)}</td>
                        <td className="py-1.5 px-2 text-right font-semibold">{money(f.total_caja)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 dark:bg-slate-700/40 font-semibold">
                      {agrupacion === 'dia'
                        ? <td className="py-1.5 px-2">{t('adminContab:reportes.mensualCliente.totalPeriodo')}</td>
                        : <td className="py-1.5 px-2" colSpan={2}>{t('adminContab:reportes.mensualCliente.totalPeriodo')}</td>}
                      <td className="py-1.5 px-2 text-right">{report.totales.num}</td>
                      <td className="py-1.5 px-2 text-right">{money(report.totales.importe)}</td>
                      <td className="py-1.5 px-2 text-right">{money(report.totales.media)}</td>
                      <td className="py-1.5 px-2 text-right">{money(report.totales.transferencia)}</td>
                      <td className="py-1.5 px-2 text-right">{money(report.totales.cheque)}</td>
                      <td className="py-1.5 px-2 text-right">{money(report.totales.efectivo)}</td>
                      <td className="py-1.5 px-2 text-right">{money(report.totales.yappy)}</td>
                      <td className="py-1.5 px-2 text-right">{money(report.totales.otros)}</td>
                      <td className="py-1.5 px-2 text-right">{money(report.totales.total_caja)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* RN1 REQ-577/582 — sección solo aparece con al menos 1 registro pendiente. */}
            {report.pendientes.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  {t('adminContab:reportes.mensualCliente.pendientesTitle')}
                </div>
                <div className="flex flex-col gap-1.5">
                  {report.pendientes.map((p, i) => (
                    <div key={i} className="flex justify-between items-center px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs">
                      <span className="text-slate-600 dark:text-slate-300">{p.fecha} · {p.factura} · {p.proyecto}</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{money(p.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

function Kpi({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold ${good ? 'text-primary-dark' : 'text-slate-800 dark:text-slate-100'}`}>{value}</div>
    </div>
  )
}
