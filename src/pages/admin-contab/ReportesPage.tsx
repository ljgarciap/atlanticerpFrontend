import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarController, BarElement, DoughnutController, Tooltip, Legend } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import {
  useReportsFelixCommission, useReportsCartera, useReportsVentas, useReportsFlujoCaja,
  useReportsComisiones, useReportsNotasCredito,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { IcoBarChart, IcoTrendingUp, IcoChevronRight, IcoCheck, IcoFileText, IcoList, IcoBook, IcoDollarSign } from '@/components/icons'
import type { ReportsPeriodo } from '@/types/adminContab'

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarController, BarElement, DoughnutController, Tooltip, Legend)

const TEAL        = '#5BA5A0'
const TEAL_DEEP    = '#3D7E7A'
const BLUE         = '#4C8FC7'
const BLUE_DEEP     = '#0C447C'
const AGING_COLORS = ['#5BA5A0', '#D9A441', '#D2685A', '#9a3f30']
const NOTAS_COLORS = ['#5BA5A0', '#5BA5A0', '#C15A4A', '#C9A66B']

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

/**
 * Batch 22 (SCRUM-643→647, REQ-566→570) + Batch 23 completo (SCRUM-648→650, REQ-571→573) — home
 * de Reportes con las 11 tarjetas del mockup completo (`4M__Admin_Contabilidad_Reportes.html`).
 * Los 4 accesos de navegación (SCRUM-650, REQ-573) se agregaron recién ahora que las 4 pantallas
 * destino (Grupos 2/3 de Batch 23) ya existen de verdad — nunca antes, para no dejar un link
 * muerto (ver hallazgo de Luis en Sidebar.tsx). Son de navegación pura (RN1 REQ-573): sin dato ni
 * gráfico propio en el dashboard, y nunca dependen del selector de período (RN2).
 *
 * El selector de período (RN1/RN3 REQ-566) recalcula Ventas, Arqueo de Caja y Comisiones —
 * Comisión Felix, Cartera (2 tarjetas) y Notas de Crédito nunca dependen de él (RN4 REQ-567, RN3
 * REQ-568, RN2 REQ-572), por eso esos hooks no reciben `periodo` y su query key es fija (ver
 * useAdminContab.ts).
 */
export default function ReportesPage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<ReportsPeriodo>('hoy')

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div className="flex items-center gap-2">
          <IcoBarChart size={20} className="text-slate-500 dark:text-slate-400" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:reportes.title')}</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('adminContab:reportes.subtitle')}</p>
          </div>
        </div>

        <select
          value={periodo} onChange={e => setPeriodo(e.target.value as ReportsPeriodo)}
          className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300"
        >
          <option value="hoy">{t('adminContab:reportes.periodo.hoy')}</option>
          <option value="3m">{t('adminContab:reportes.periodo.dias3m')}</option>
          <option value="6m">{t('adminContab:reportes.periodo.dias6m')}</option>
          <option value="anio">{t('adminContab:reportes.periodo.anio')}</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FelixCommissionCard t={t} />
        <CarteraPorCobrarCard t={t} onNavigate={() => navigate('/admin-contab/facturacion')} />
        <Cartera90CobradoCard t={t} onNavigate={() => navigate('/admin-contab/facturacion')} />
        <VentasCard t={t} periodo={periodo} onNavigate={() => navigate('/admin-contab/facturacion')} />
        <ArqueoCajaCard t={t} periodo={periodo} onNavigate={() => navigate('/admin-contab/arqueo-caja')} />
        <ComisionesCard t={t} periodo={periodo} navigate={navigate} />
        <NotasCreditoCard t={t} onNavigate={() => navigate('/admin-contab/notas-credito')} />
        <SubReportNavCard
          icon={<IcoFileText size={18} />}
          title={t('adminContab:reportes.subReportes.mensualCliente.title')}
          subtitle={t('adminContab:reportes.subReportes.mensualCliente.subtitle')}
          onNavigate={() => navigate('/admin-contab/reportes/mensual-cliente')}
        />
        <SubReportNavCard
          icon={<IcoList size={18} />}
          title={t('adminContab:reportes.subReportes.acumulado.title')}
          subtitle={t('adminContab:reportes.subReportes.acumulado.subtitle')}
          onNavigate={() => navigate('/admin-contab/reportes/mensual-cliente-acumulado')}
        />
        <SubReportNavCard
          icon={<IcoBook size={18} />}
          title={t('adminContab:reportes.subReportes.libroFacturas.title')}
          subtitle={t('adminContab:reportes.subReportes.libroFacturas.subtitle')}
          onNavigate={() => navigate('/admin-contab/reportes/libro-facturas')}
        />
        <SubReportNavCard
          icon={<IcoDollarSign size={18} />}
          title={t('adminContab:reportes.subReportes.ventasMedioPago.title')}
          subtitle={t('adminContab:reportes.subReportes.ventasMedioPago.subtitle')}
          onNavigate={() => navigate('/admin-contab/reportes/ventas-medio-pago')}
        />
      </div>
    </div>
  )
}

type Translate = (key: string, opts?: Record<string, unknown>) => string

function CardLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary-dark hover:underline whitespace-nowrap">
      {label} <IcoChevronRight size={12} />
    </button>
  )
}

/** REQ-567 — 3 KPIs + los tramos (`tiers`, ya resueltos por el backend desde la tabla paramétrica
 *  `cartera_commission_tiers`, ver ADR del batch) con el actual resaltado vía `es_actual`. Nunca
 *  hardcodea los montos de los tramos — vienen todos de la API. */
function FelixCommissionCard({ t }: { t: Translate }) {
  const { data, isLoading } = useReportsFelixCommission()

  return (
    <Card variant="panel" className="p-4 sm:col-span-2">
      <div className="mb-4">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('adminContab:reportes.felixCommission.title')}</div>
        <div className="text-[10.5px] text-slate-400 mt-0.5">{t('adminContab:reportes.felixCommission.subtitle')}</div>
      </div>

      {isLoading || !data ? (
        <div className="h-32 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : (
        <>
          <div className="flex flex-wrap gap-8 justify-center text-center mb-4">
            <div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('adminContab:reportes.felixCommission.cobradoMes')}</div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(data.cobrado_mes)}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('adminContab:reportes.felixCommission.rangoActual')}</div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{data.rango_actual}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('adminContab:reportes.felixCommission.comision')}</div>
              <div className="text-xl font-bold text-primary-dark">{formatCurrency(data.comision)}</div>
            </div>
          </div>

          <div className="flex gap-2 justify-center max-w-xl mx-auto">
            {data.tiers.map(tier => (
              <div
                key={tier.orden}
                className={`flex-1 rounded-lg px-3 py-2.5 text-center ${tier.es_actual ? 'bg-primary-soft border-[1.5px] border-primary-dark' : 'bg-slate-50 dark:bg-slate-800/60'}`}
              >
                <div className={`text-[10.5px] font-semibold ${tier.es_actual ? 'text-primary-dark' : 'text-slate-600 dark:text-slate-300'}`}>
                  {tier.monto_maximo === null
                    ? t('adminContab:reportes.felixCommission.tramoDesde', { desde: formatCurrency(tier.monto_minimo), pct: tier.porcentaje })
                    : t('adminContab:reportes.felixCommission.tramoRango', { desde: formatCurrency(tier.monto_minimo), hasta: formatCurrency(tier.monto_maximo), pct: tier.porcentaje })}
                </div>
                {tier.es_actual && (
                  <div className="flex items-center justify-center gap-1 text-[10px] text-primary-dark mt-0.5">
                    <IcoCheck size={10} />
                    {t('adminContab:reportes.felixCommission.rangoActualTag')}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[10.5px] text-slate-400 mt-4 text-center">{t('adminContab:reportes.felixCommission.footnote')}</p>
        </>
      )}
    </Card>
  )
}

/** REQ-568 — donut de 4 rangos de antigüedad, solo lectura, click navega a Facturación. */
function CarteraPorCobrarCard({ t, onNavigate }: { t: Translate; onNavigate: () => void }) {
  const { data, isLoading } = useReportsCartera()
  const ranges = data?.aging.ranges ?? []
  const total  = ranges.reduce((sum, r) => sum + r.monto, 0)

  const chartData = ranges.length > 0 ? {
    labels: ranges.map(r => r.hasta_dias === null ? t('adminContab:reportes.cartera.rangoMas', { desde: r.desde_dias }) : t('adminContab:reportes.cartera.rango', { desde: r.desde_dias, hasta: r.hasta_dias })),
    datasets: [{ data: ranges.map(r => r.monto), backgroundColor: AGING_COLORS, borderWidth: 0 }],
  } : null

  return (
    <Card variant="panel" className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={onNavigate}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('adminContab:reportes.cartera.title')}</div>
          <div className="text-[10.5px] text-slate-400 mt-0.5">{t('adminContab:reportes.cartera.subtitle', { total: formatCurrency(total) })}</div>
        </div>
        <CardLink label={t('adminContab:reportes.verEnFacturacion')} onClick={onNavigate} />
      </div>

      {isLoading || !chartData ? (
        <div className="h-28 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : (
        <div className="flex items-center gap-5 justify-center flex-wrap">
          <div className="w-24 h-24">
            <Chart type="doughnut" data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '60%' }} />
          </div>
          <div className="flex flex-col gap-1.5">
            {ranges.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: AGING_COLORS[i] }} />
                {r.hasta_dias === null ? t('adminContab:reportes.cartera.rangoMas', { desde: r.desde_dias }) : t('adminContab:reportes.cartera.rango', { desde: r.desde_dias, hasta: r.hasta_dias })}
                <span className="font-semibold ml-auto pl-2">{formatCurrency(r.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

/** REQ-568 — cobrado del mes de cartera +90 días + pendiente, solo lectura. Nunca depende del
 *  período (RN3). */
function Cartera90CobradoCard({ t, onNavigate }: { t: Translate; onNavigate: () => void }) {
  const { data, isLoading } = useReportsCartera()

  return (
    <Card variant="panel" className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={onNavigate}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('adminContab:reportes.cartera90.title')}</div>
          <div className="text-[10.5px] text-slate-400 mt-0.5">{t('adminContab:reportes.cartera90.subtitle')}</div>
        </div>
        <CardLink label={t('adminContab:reportes.verEnFacturacion')} onClick={onNavigate} />
      </div>

      {isLoading || !data ? (
        <div className="h-28 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : (
        <div className="flex items-center justify-center py-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-dark">{formatCurrency(data.cobrado_90.cobrado_mes)}</div>
            <div className="text-[11px] text-slate-400 mt-1">
              {t('adminContab:reportes.cartera90.detalle', { pendiente: formatCurrency(data.cobrado_90.pendiente) })}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

/** REQ-569 — "Hoy": KPI simple + promedio diario del mes anterior. Cualquier otro período: barras
 *  por mes con el último resaltado + variación % vs. anterior (RN3, solo si hay ≥2 meses). */
function VentasCard({ t, periodo, onNavigate }: { t: Translate; periodo: ReportsPeriodo; onNavigate: () => void }) {
  const { data, isLoading } = useReportsVentas(periodo)

  const chartData = useMemo(() => {
    if (!data || data.tipo !== 'meses') return null
    return {
      labels: data.meses.map(m => `${m.mes} ${m.anio}`),
      datasets: [{
        data: data.meses.map(m => m.total),
        backgroundColor: data.meses.map((_, i) => i === data.meses.length - 1 ? TEAL_DEEP : TEAL),
        borderRadius: 4, minBarLength: 4,
      }],
    }
  }, [data])

  const variacion = useMemo(() => {
    if (!data || data.tipo !== 'meses' || data.meses.length < 2) return null
    const ultimo = data.meses[data.meses.length - 1]
    const previo  = data.meses[data.meses.length - 2]
    if (previo.total === 0) return null
    return ((ultimo.total - previo.total) / previo.total) * 100
  }, [data])

  return (
    <Card variant="panel" className="p-4 sm:col-span-2 cursor-pointer hover:shadow-md transition-shadow" onClick={onNavigate}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('adminContab:reportes.ventas.title')}</div>
          <div className="text-[10.5px] text-slate-400 mt-0.5">
            {data?.tipo === 'hoy' ? t('adminContab:reportes.ventas.subtituloHoy') : t('adminContab:reportes.ventas.subtituloPeriodo')}
          </div>
        </div>
        <CardLink label={t('adminContab:reportes.verEnFacturacion')} onClick={onNavigate} />
      </div>

      {isLoading || !data ? (
        <div className="h-32 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : data.tipo === 'hoy' ? (
        <div className="flex flex-wrap gap-8 justify-center text-center py-4">
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('adminContab:reportes.ventas.hoyLabel')}</div>
            <div className="text-2xl font-bold text-primary-dark">{formatCurrency(data.hoy)}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('adminContab:reportes.ventas.promedioMesAnterior')}</div>
            <div className="text-2xl font-bold text-slate-700 dark:text-slate-200">{formatCurrency(data.promedio_diario_mes_anterior)}</div>
          </div>
        </div>
      ) : chartData && (
        <>
          <div className="h-32">
            <Chart type="bar" data={chartData} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { display: false }, ticks: { precision: 0, font: { size: 10 } } },
                x: { ticks: { font: { size: 10 } } },
              },
            }} />
          </div>
          {variacion !== null && (
            <div className={`text-[11px] font-semibold text-center mt-2 ${variacion >= 0 ? 'text-primary-dark' : 'text-red-600 dark:text-red-400'}`}>
              {variacion >= 0 ? '+' : ''}{variacion.toFixed(0)}% {t('adminContab:reportes.ventas.vsMesAnterior')}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

/** REQ-570 — flujo neto por mes (o KPI hoy), + saldo disponible hoy/proyectado a 30 días, SIEMPRE
 *  visibles sin importar el período (RN2) — vienen ya calculados del backend. */
function ArqueoCajaCard({ t, periodo, onNavigate }: { t: Translate; periodo: ReportsPeriodo; onNavigate: () => void }) {
  const { data, isLoading } = useReportsFlujoCaja(periodo)

  const chartData = useMemo(() => {
    if (!data || data.tipo !== 'meses' || !data.meses) return null
    return {
      labels: data.meses.map(m => `${m.mes} ${m.anio}`),
      datasets: [{
        data: data.meses.map(m => m.neto),
        backgroundColor: data.meses.map(m => m.neto >= 0 ? TEAL : '#C15A4A'),
        borderRadius: 4, minBarLength: 4,
      }],
    }
  }, [data])

  return (
    <Card variant="panel" className="p-4 sm:col-span-2 cursor-pointer hover:shadow-md transition-shadow" onClick={onNavigate}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <IcoTrendingUp size={16} className="text-slate-400" />
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('adminContab:reportes.arqueoCaja.title')}</div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">{t('adminContab:reportes.arqueoCaja.subtitle')}</div>
          </div>
        </div>
        <CardLink label={t('adminContab:reportes.arqueoCaja.ver')} onClick={onNavigate} />
      </div>

      {isLoading || !data ? (
        <div className="h-32 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : (
        <>
          {data.tipo === 'hoy' && data.hoy ? (
            <div className="flex items-center justify-center py-4">
              <div className="text-center">
                <div className={`text-2xl font-bold ${data.hoy.neto >= 0 ? 'text-primary-dark' : 'text-red-600 dark:text-red-400'}`}>
                  {data.hoy.neto >= 0 ? '+' : ''}{formatCurrency(data.hoy.neto)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {t('adminContab:reportes.arqueoCaja.entradasMenosSalidas', { entradas: formatCurrency(data.hoy.entradas), salidas: formatCurrency(data.hoy.salidas) })}
                </div>
              </div>
            </div>
          ) : chartData && (
            <div className="h-28">
              <Chart type="bar" data={chartData} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, grid: { display: false }, ticks: { precision: 0, font: { size: 10 } } },
                  x: { ticks: { font: { size: 10 } } },
                },
              }} />
            </div>
          )}

          <div className="flex gap-8 justify-center text-center mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('adminContab:reportes.arqueoCaja.saldoHoy')}</div>
              <div className="text-base font-bold text-primary-dark">{formatCurrency(data.saldo_disponible_hoy)}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('adminContab:reportes.arqueoCaja.proyectado30')}</div>
              <div className="text-base font-bold text-primary-dark">{formatCurrency(data.saldo_proyectado_30_dias)}</div>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

/** REQ-571 — Internas vs. Externas por mes (barras pareadas) o 2 KPIs en "Hoy". SÍ depende del
 *  selector de período (a diferencia de Felix/Cartera/Notas de Crédito). Montos siempre iguales a
 *  los que ya muestran Comisiones Internas/Externas (REQ-499/508) — nunca recalculados acá. */
function ComisionesCard({ t, periodo, navigate }: { t: Translate; periodo: ReportsPeriodo; navigate: (path: string) => void }) {
  const { data, isLoading } = useReportsComisiones(periodo)

  const chartData = useMemo(() => {
    if (!data || data.tipo !== 'meses') return null
    return {
      labels: data.meses.map(m => `${m.mes} ${m.anio}`),
      datasets: [
        { label: t('adminContab:reportes.comisiones.internas'), data: data.meses.map(m => m.internas), backgroundColor: TEAL, borderRadius: 4, minBarLength: 4 },
        { label: t('adminContab:reportes.comisiones.externas'), data: data.meses.map(m => m.externas), backgroundColor: BLUE, borderRadius: 4, minBarLength: 4 },
      ],
    }
  }, [data, t])

  return (
    <Card variant="panel" className="p-4 sm:col-span-2">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('adminContab:reportes.comisiones.title')}</div>
          <div className="text-[10.5px] text-slate-400 mt-0.5">{t('adminContab:reportes.comisiones.subtitle')}</div>
        </div>
        <div className="flex gap-4">
          <CardLink label={t('adminContab:reportes.comisiones.verInternas')} onClick={() => navigate('/admin-contab/comisiones/internas')} />
          <CardLink label={t('adminContab:reportes.comisiones.verExternas')} onClick={() => navigate('/admin-contab/comisiones/externas')} />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="h-32 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : data.tipo === 'hoy' ? (
        <div className="flex flex-wrap gap-8 justify-center text-center py-4">
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('adminContab:reportes.comisiones.internas')}</div>
            <div className="text-2xl font-bold" style={{ color: TEAL_DEEP }}>{formatCurrency(data.hoy.internas)}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{t('adminContab:reportes.comisiones.externas')}</div>
            <div className="text-2xl font-bold" style={{ color: BLUE_DEEP }}>{formatCurrency(data.hoy.externas)}</div>
          </div>
        </div>
      ) : chartData && (
        <>
          <div className="flex gap-4 mb-2">
            <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400"><span className="w-2 h-2 rounded-sm" style={{ background: TEAL }} />{t('adminContab:reportes.comisiones.internas')}</div>
            <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400"><span className="w-2 h-2 rounded-sm" style={{ background: BLUE }} />{t('adminContab:reportes.comisiones.externas')}</div>
          </div>
          <div className="h-32">
            <Chart type="bar" data={chartData} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { display: false }, ticks: { precision: 0, font: { size: 10 } } },
                x: { ticks: { font: { size: 10 } } },
              },
            }} />
          </div>
        </>
      )}
    </Card>
  )
}

/** REQ-572 — distribución del mes en curso por los 4 motivos reales de Notas Crédito y
 *  Devoluciones (nunca una categoría inventada). Nunca depende del selector de período (RN2). */
function NotasCreditoCard({ t, onNavigate }: { t: Translate; onNavigate: () => void }) {
  const { data, isLoading } = useReportsNotasCredito()

  const chartData = useMemo(() => {
    if (!data) return null
    return {
      labels: data.motivos.map(m => m.motivo),
      datasets: [{ data: data.motivos.map(m => m.monto), backgroundColor: NOTAS_COLORS, borderRadius: 4, minBarLength: 4 }],
    }
  }, [data])

  return (
    <Card variant="panel" className="p-4 sm:col-span-2 cursor-pointer hover:shadow-md transition-shadow" onClick={onNavigate}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('adminContab:reportes.notasCredito.title')}</div>
          <div className="text-[10.5px] text-slate-400 mt-0.5">{t('adminContab:reportes.notasCredito.subtitle')}</div>
        </div>
        <CardLink label={t('adminContab:reportes.notasCredito.ver')} onClick={onNavigate} />
      </div>

      {isLoading || !chartData ? (
        <div className="h-24 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />
      ) : (
        <div className="h-24">
          <Chart type="bar" data={chartData} options={{
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, grid: { display: false }, ticks: { precision: 0, font: { size: 9 } } },
              x: { ticks: { font: { size: 9 } } },
            },
          }} />
        </div>
      )}
    </Card>
  )
}

/** REQ-573 — acceso de navegación puro, sin dato ni gráfico propio (RN1), nunca depende del
 *  selector de período (RN2). */
function SubReportNavCard({ icon, title, subtitle, onNavigate }: { icon: React.ReactNode; title: string; subtitle: string; onNavigate: () => void }) {
  return (
    <Card variant="panel" className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={onNavigate}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="text-slate-400 mt-0.5">{icon}</span>
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">{subtitle}</div>
          </div>
        </div>
        <IcoChevronRight size={14} className="text-slate-300 flex-shrink-0 mt-1" />
      </div>
    </Card>
  )
}
