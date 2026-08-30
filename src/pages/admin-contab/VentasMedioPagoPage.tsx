import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useVentasMedioPago, useDownloadVentasMedioPagoExcel, useAccountStatementClients } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoChevronLeft } from '@/components/icons'

function money(n: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(n)
}

// Nombres de columna = vocabulario canónico de AdminContPayment::METODOS (mismo que PaymentMethod
// en este archivo) — 'deposito'/'ajuste_cuenta', NO 'deposito_bancario'/'ajustes_cuenta' (bug real
// encontrado en Pre-QA: el shape no coincidía con lo que el backend realmente serializa, ver
// PaymentMethodSalesReportService::report()).
type MetodoKey = 'transferencia' | 'cheque' | 'efectivo' | 'tarjeta' | 'deposito' | 'yappy' | 'link_pago' | 'retencion_impuestos' | 'ajuste_cuenta'

const METODOS: { key: MetodoKey; labelKey: string }[] = [
  { key: 'transferencia', labelKey: 'transferencia' },
  { key: 'cheque', labelKey: 'cheque' },
  { key: 'efectivo', labelKey: 'efectivo' },
  { key: 'tarjeta', labelKey: 'tarjeta' },
  { key: 'deposito', labelKey: 'depositoBancario' },
  { key: 'yappy', labelKey: 'yappy' },
  { key: 'link_pago', labelKey: 'linkPago' },
  { key: 'retencion_impuestos', labelKey: 'retencionImpuestos' },
  { key: 'ajuste_cuenta', labelKey: 'ajustesCuenta' },
]

/**
 * Batch 23 Grupo 3 (SCRUM-665→669, REQ-588→592) — "Ventas por medio de pago" (4M4): una fila por
 * factura COBRADA, con su desglose fiscal + 9 columnas reales de método de pago (decisión
 * confirmada con Luis — el mockup real muestra 7, quedó desactualizado). RN1: a diferencia de
 * Mensual por Cliente, el cliente es OPCIONAL — la pantalla carga con "Todos" desde el inicio, sin
 * estado vacío bloqueante.
 */
export default function VentasMedioPagoPage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const navigate = useNavigate()

  const [clientQuery, setClientQuery] = useState('')
  const [clientOpen, setClientOpen] = useState(false)
  const [masterClientId, setMasterClientId] = useState<number | undefined>(undefined)
  const [desdeInput, setDesdeInput] = useState('')
  const [hastaInput, setHastaInput] = useState('')
  const [applied, setApplied] = useState<{ desde?: string; hasta?: string }>({})

  const { data: clientOptions = [] } = useAccountStatementClients(clientQuery)
  const { data, isLoading } = useVentasMedioPago({ masterClientId, desde: applied.desde, hasta: applied.hasta })
  const excelMutation = useDownloadVentasMedioPagoExcel()

  function filtrar() {
    setApplied({ desde: desdeInput || undefined, hasta: hastaInput || undefined })
  }

  function limpiar() {
    setClientQuery('')
    setMasterClientId(undefined)
    setDesdeInput('')
    setHastaInput('')
    setApplied({})
  }

  const tieneDatos = (data?.filas.length ?? 0) > 0
  const descargarDisabled = !tieneDatos || excelMutation.isPending

  function descargar() {
    if (!tieneDatos) return
    excelMutation.mutate({ masterClientId, desde: applied.desde, hasta: applied.hasta })
  }

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <button
        type="button" onClick={() => navigate('/admin-contab/reportes')}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-3"
      >
        <IcoChevronLeft size={14} /> {t('adminContab:reportes.ventasMedioPago.volver')}
      </button>

      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:reportes.ventasMedioPago.title')}</h1>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('adminContab:reportes.ventasMedioPago.subtitle')}</p>
      </div>

      <Card variant="panel" className="p-4 mb-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="relative">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('adminContab:reportes.ventasMedioPago.cliente')}
            </label>
            <input
              type="text"
              value={clientQuery}
              onChange={e => { setClientQuery(e.target.value); setClientOpen(true); if (e.target.value === '') setMasterClientId(undefined) }}
              onFocus={() => setClientOpen(true)}
              onBlur={() => setTimeout(() => setClientOpen(false), 150)}
              placeholder={t('adminContab:reportes.ventasMedioPago.clientePlaceholder')}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm min-w-[220px]"
            />
            {clientOpen && (
              <ul className="absolute z-10 mt-1 w-full min-w-[220px] rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-48 overflow-auto">
                <li
                  onMouseDown={() => { setMasterClientId(undefined); setClientQuery(''); setClientOpen(false) }}
                  className="cursor-pointer px-3 py-1.5 text-sm font-medium text-primary-dark hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {t('adminContab:reportes.ventasMedioPago.todos')}
                </li>
                {clientOptions.map(opt => (
                  <li key={opt.id} onMouseDown={() => { setMasterClientId(opt.id); setClientQuery(opt.name); setClientOpen(false) }}
                    className="cursor-pointer px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
                    {opt.name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminContab:reportes.ventasMedioPago.desde')}</span>
            <input type="date" value={desdeInput} onChange={e => setDesdeInput(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminContab:reportes.ventasMedioPago.hasta')}</span>
            <input type="date" value={hastaInput} onChange={e => setHastaInput(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm" />
          </label>

          <Button onClick={filtrar} loading={isLoading}>{t('adminContab:reportes.ventasMedioPago.filtrar')}</Button>
          <Button variant="secondary" onClick={limpiar}>{t('adminContab:reportes.ventasMedioPago.limpiar')}</Button>
          <Button variant="outline" onClick={descargar} disabled={descargarDisabled} loading={excelMutation.isPending} className="ml-auto">
            {t('adminContab:reportes.ventasMedioPago.descargar')}
          </Button>
        </div>
        {!tieneDatos && !isLoading && (
          <p className="text-[11px] text-slate-400 mt-2">{t('adminContab:reportes.ventasMedioPago.sinDatosParaDescargar')}</p>
        )}
      </Card>

      <Card variant="panel" className="p-5">
        {isLoading || !data ? (
          <div className="h-40 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              <Kpi label={t('adminContab:reportes.ventasMedioPago.facturasCobradas')} value={String(data.resumen.facturas_cobradas)} />
              <Kpi label={t('adminContab:reportes.ventasMedioPago.baseImponible')} value={money(data.resumen.base_imponible)} />
              <Kpi label={t('adminContab:reportes.ventasMedioPago.itbms')} value={money(data.resumen.itbms)} />
              <Kpi label={t('adminContab:reportes.ventasMedioPago.total')} value={money(data.resumen.total)} good />
            </div>

            {data.filas.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">{t('adminContab:reportes.ventasMedioPago.sinFacturas')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      <th className="py-1.5 px-2">{t('adminContab:reportes.ventasMedioPago.columnas.fecha')}</th>
                      <th className="py-1.5 px-2">{t('adminContab:reportes.ventasMedioPago.columnas.cliente')}</th>
                      <th className="py-1.5 px-2">{t('adminContab:reportes.ventasMedioPago.columnas.documento')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.ventasMedioPago.columnas.baseImponible')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.ventasMedioPago.columnas.itbms')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.ventasMedioPago.columnas.total')}</th>
                      {METODOS.map(m => (
                        <th key={m.key} className="py-1.5 px-2 text-right whitespace-nowrap">{t(`adminContab:reportes.ventasMedioPago.metodos.${m.labelKey}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.filas.map((f, i) => (
                      <tr key={i} className="border-b border-slate-50 dark:border-slate-800">
                        <td className="py-1.5 px-2 whitespace-nowrap">{f.fecha}</td>
                        <td className="py-1.5 px-2">{f.cliente}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{f.documento}</td>
                        <td className="py-1.5 px-2 text-right">{money(f.base_imponible)}</td>
                        <td className="py-1.5 px-2 text-right">{money(f.itbms)}</td>
                        <td className="py-1.5 px-2 text-right font-semibold">{money(f.total)}</td>
                        {METODOS.map(m => (
                          <td key={m.key} className="py-1.5 px-2 text-right">{money(f[m.key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 dark:bg-slate-700/40 font-semibold">
                      <td className="py-1.5 px-2" colSpan={3}>{t('adminContab:reportes.ventasMedioPago.totalPeriodo')}</td>
                      <td className="py-1.5 px-2 text-right">{money(data.resumen.base_imponible)}</td>
                      <td className="py-1.5 px-2 text-right">{money(data.resumen.itbms)}</td>
                      <td className="py-1.5 px-2 text-right">{money(data.resumen.total)}</td>
                      {METODOS.map(m => (
                        <td key={m.key} className="py-1.5 px-2 text-right">
                          {money(data.filas.reduce((sum, f) => sum + f[m.key], 0))}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* RN1 REQ-591 — sección solo aparece con al menos 1 registro pendiente. */}
            {data.pendientes.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  {t('adminContab:reportes.ventasMedioPago.pendientesTitle')}
                </div>
                <div className="flex flex-col gap-1.5">
                  {data.pendientes.map((p, i) => (
                    <div key={i} className="flex justify-between items-center px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs">
                      <span className="text-slate-600 dark:text-slate-300">{p.fecha} · {p.documento} · {p.proyecto ?? '—'}</span>
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
