import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useLibroFacturas, useDownloadLibroFacturasExcel } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoChevronLeft } from '@/components/icons'
import type { InvoiceBookTipo } from '@/types/adminContab'

function money(n: number): string {
  const sign = n < 0 ? '-' : ''
  return sign + new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(Math.abs(n))
}

/**
 * Batch 23 Grupo 3 (SCRUM-661→664, REQ-584→587) — "Libro de facturas" (4M3): tabla cronológica de
 * TODAS las facturas + notas de crédito, con desglose fiscal real por documento. RN2: el filtro de
 * tipo se aplica de inmediato al cambiar (sin esperar "Filtrar"); el rango de fechas sí espera el
 * botón — mismo criterio que el resto de Reportes. Notas de crédito ya vienen con montos negativos
 * y su propio % de impuesto real desde el backend — nunca se recalculan acá. Sin sección
 * "Pendientes de cobro" (no aplica a este reporte).
 */
export default function LibroFacturasPage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const navigate = useNavigate()

  const [desdeInput, setDesdeInput] = useState('')
  const [hastaInput, setHastaInput] = useState('')
  const [applied, setApplied] = useState<{ desde?: string; hasta?: string }>({})
  const [tipo, setTipo] = useState<InvoiceBookTipo | ''>('')

  const { data, isLoading } = useLibroFacturas({ desde: applied.desde, hasta: applied.hasta, tipo: tipo || undefined })
  const excelMutation = useDownloadLibroFacturasExcel()

  function filtrar() {
    setApplied({ desde: desdeInput || undefined, hasta: hastaInput || undefined })
  }

  function limpiar() {
    setDesdeInput('')
    setHastaInput('')
    setApplied({})
    setTipo('')
  }

  const tieneDatos = (data?.documentos.length ?? 0) > 0
  const descargarDisabled = !tieneDatos || excelMutation.isPending

  function descargar() {
    if (!tieneDatos) return
    excelMutation.mutate({ desde: applied.desde, hasta: applied.hasta, tipo: tipo || undefined })
  }

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <button
        type="button" onClick={() => navigate('/admin-contab/reportes')}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-3"
      >
        <IcoChevronLeft size={14} /> {t('adminContab:reportes.libroFacturas.volver')}
      </button>

      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:reportes.libroFacturas.title')}</h1>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('adminContab:reportes.libroFacturas.subtitle')}</p>
      </div>

      <Card variant="panel" className="p-4 mb-4">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminContab:reportes.libroFacturas.desde')}</span>
            <input type="date" value={desdeInput} onChange={e => setDesdeInput(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminContab:reportes.libroFacturas.hasta')}</span>
            <input type="date" value={hastaInput} onChange={e => setHastaInput(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t('adminContab:reportes.libroFacturas.tipo')}</span>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as InvoiceBookTipo | '')}
              className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">{t('adminContab:reportes.libroFacturas.tipoTodos')}</option>
              <option value="factura">{t('adminContab:reportes.libroFacturas.tipoSoloFacturas')}</option>
              <option value="nota_credito">{t('adminContab:reportes.libroFacturas.tipoSoloNotas')}</option>
            </select>
          </label>

          <Button onClick={filtrar} loading={isLoading}>{t('adminContab:reportes.libroFacturas.filtrar')}</Button>
          <Button variant="secondary" onClick={limpiar}>{t('adminContab:reportes.libroFacturas.limpiar')}</Button>
          <Button variant="outline" onClick={descargar} disabled={descargarDisabled} loading={excelMutation.isPending} className="ml-auto">
            {t('adminContab:reportes.libroFacturas.descargar')}
          </Button>
        </div>
        {!tieneDatos && !isLoading && (
          <p className="text-[11px] text-slate-400 mt-2">{t('adminContab:reportes.libroFacturas.sinDatosParaDescargar')}</p>
        )}
      </Card>

      <Card variant="panel" className="p-5">
        {isLoading || !data ? (
          <div className="h-40 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-5">
              <Kpi label={t('adminContab:reportes.libroFacturas.facturas')} value={String(data.resumen.facturas)} />
              <Kpi label={t('adminContab:reportes.libroFacturas.notasCredito')} value={String(data.resumen.notas_credito)} />
              <Kpi label={t('adminContab:reportes.libroFacturas.baseImponible')} value={money(data.resumen.base_imponible)} />
              <Kpi label={t('adminContab:reportes.libroFacturas.itbms')} value={money(data.resumen.itbms)} />
              <Kpi label={t('adminContab:reportes.libroFacturas.total')} value={money(data.resumen.total)} good />
            </div>

            {data.documentos.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">{t('adminContab:reportes.libroFacturas.sinDocumentos')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-700">
                      <th className="py-1.5 px-2">{t('adminContab:reportes.libroFacturas.columnas.fecha')}</th>
                      <th className="py-1.5 px-2">{t('adminContab:reportes.libroFacturas.columnas.ruc')}</th>
                      <th className="py-1.5 px-2">{t('adminContab:reportes.libroFacturas.columnas.cliente')}</th>
                      <th className="py-1.5 px-2">{t('adminContab:reportes.libroFacturas.columnas.tipo')}</th>
                      <th className="py-1.5 px-2">{t('adminContab:reportes.libroFacturas.columnas.motivo')}</th>
                      <th className="py-1.5 px-2">{t('adminContab:reportes.libroFacturas.columnas.documento')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.libroFacturas.columnas.baseImponible')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.libroFacturas.columnas.porcentaje')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.libroFacturas.columnas.itbms')}</th>
                      <th className="py-1.5 px-2 text-right">{t('adminContab:reportes.libroFacturas.columnas.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documentos.map((d, i) => (
                      <tr key={i} className="border-b border-slate-50 dark:border-slate-800">
                        <td className="py-1.5 px-2 whitespace-nowrap">{d.fecha}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{d.ruc}</td>
                        <td className="py-1.5 px-2">{d.cliente}</td>
                        <td className="py-1.5 px-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${d.tipo === 'Factura' ? 'bg-primary-soft text-primary-dark' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                            {d.tipo}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">{d.motivo ?? '—'}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{d.documento}</td>
                        <td className="py-1.5 px-2 text-right">{money(d.base_imponible)}</td>
                        <td className="py-1.5 px-2 text-right">{d.porcentaje}%</td>
                        <td className="py-1.5 px-2 text-right">{money(d.itbms)}</td>
                        <td className="py-1.5 px-2 text-right font-semibold">{money(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 dark:bg-slate-700/40 font-semibold">
                      <td className="py-1.5 px-2" colSpan={6}>{t('adminContab:reportes.libroFacturas.totalPeriodo')}</td>
                      <td className="py-1.5 px-2 text-right">{money(data.resumen.base_imponible)}</td>
                      <td />
                      <td className="py-1.5 px-2 text-right">{money(data.resumen.itbms)}</td>
                      <td className="py-1.5 px-2 text-right">{money(data.resumen.total)}</td>
                    </tr>
                  </tfoot>
                </table>
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
