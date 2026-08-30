import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useGerenciaHome, useGerenciaVendors, useGerenciaClients } from '@/hooks/useGerencia'
import { gerenciaApi } from '@/api/gerenciaApi'
import { Card } from '@/components/ui/Card'
import CalendarModal from '@/components/CalendarModal'
import MiniCalendarCard from '@/components/MiniCalendarCard'
import GerenciaAprobacionesPanel from '@/components/gerencia/GerenciaAprobacionesPanel'
import { rangeForPill, type CalendarPill } from '@/lib/dateGrid'
import type { AprobacionItem, ChartMensualItem } from '@/types/gerencia'

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '$—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}k`
  return `${sign}$${abs.toLocaleString()}`
}

function fmtFull(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// SCRUM-162 RN3: navega al módulo de origen con el ítem específico preseleccionado.
function buildContextUrl(item: { type: string; id: number; action_url: string }): string {
  switch (item.type) {
    case 'purchase_order': return `/compras/ordenes?order=${item.id}`
    case 'zona_libre':     return `/bodega/ordenes-zona-libre?zl=${item.id}`
    case 'relocation':     return `/bodega/inventario?relocation=${item.id}`
    case 'adjustment':     return `/bodega/solicitud-ajuste?ajuste=${item.id}`
    case 'general_count':  return `/bodega/inventario-general?count=${item.id}`
    default:               return item.action_url
  }
}

function moduleLabel(type: string): string {
  return type === 'purchase_order' || type === 'zona_libre' ? 'Compras' : 'Bodega'
}

function todayStr(): string {
  return new Date().toLocaleDateString('es-PA', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// SCRUM-166 RN3/RN4: "Monto cotizado en el mes"/"Monto aprobado del mes" navegan
// con el mes ACTUAL, formato "YYYY-MM" (mismo formato que `item.mes` del BarChart).
function currentMonth(): string {
  return startOfMonth().slice(0, 7)
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function monthLabel(mes: string): string {
  const [, m] = mes.split('-')
  return ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][Number(m)] ?? mes
}

// SCRUM-159 RN3: clic en una barra del gráfico mensual navega al detalle de ESE mes
// puntual, no al panel sin filtrar — `mes` viene en formato "YYYY-MM" (ver `item.mes`).
function monthRange(mes: string): { desde: string; hasta: string } {
  const [y, m] = mes.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(lastDay).padStart(2, '0')}` }
}

// ── sub-components ──────────────────────────────────────────────────────────────

interface BarChartProps {
  data:  ChartMensualItem[]
  color: string
  onBarClick?: (mes: string) => void
}
function BarChart({ data, color, onBarClick }: BarChartProps) {
  const max = useMemo(() => Math.max(...data.map(d => d.monto), 1), [data])
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
        Sin datos en el período
      </div>
    )
  }
  return (
    <div className="flex items-end gap-2 h-32 pt-2">
      {data.map((item, i) => {
        const pct = Math.max((item.monto / max) * 100, 4)
        const isLast = i === data.length - 1
        return (
          <div
            key={item.mes}
            className={`flex-1 flex flex-col items-center justify-end gap-1 h-full ${onBarClick ? 'cursor-pointer' : ''}`}
            onClick={() => onBarClick?.(item.mes)}
          >
            <span className={`text-[9px] font-semibold ${isLast ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500'}`}>
              {fmt(item.monto)}
            </span>
            <div className="w-full flex items-end justify-center" style={{ height: '70%' }}>
              <div
                className="w-[62%] rounded-t"
                style={{
                  height: `${pct}%`,
                  background: isLast ? '#3D7E7A' : color,
                  transition: 'height 0.3s',
                }}
              />
            </div>
            <span className="text-[9px] text-slate-400">{monthLabel(item.mes)}</span>
          </div>
        )
      })}
    </div>
  )
}

interface ModuleHealthMetricProps {
  label:   string
  value:   string | number
  variant?: 'normal' | 'warn' | 'danger'
  onClick?: () => void
}
function ModuleHealthMetric({ label, value, variant = 'normal', onClick }: ModuleHealthMetricProps) {
  const valueClass =
    variant === 'danger' ? 'text-red-600 dark:text-red-400 font-bold' :
    variant === 'warn'   ? 'text-amber-600 dark:text-amber-400 font-semibold' :
                           'text-slate-800 dark:text-slate-100 font-semibold'
  return (
    <div
      className={`flex items-center justify-between py-[7px] border-b border-slate-100 dark:border-slate-700 last:border-0 ${onClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40 -mx-3 px-3 rounded' : ''}`}
      onClick={onClick}
    >
      <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-[12.5px] ${valueClass}`}>{value}</span>
    </div>
  )
}

// ── main component ──────────────────────────────────────────────────────────────

const PILL_LABEL: Record<CalendarPill, string> = { day: 'Día', week: 'Semana', month: 'Mes' }

export default function GerenciaPage() {
  const navigate     = useNavigate()
  const { user }     = useAuthStore()
  const queryClient  = useQueryClient()

  const [desde,       setDesde]       = useState(startOfMonth())
  const [hasta,       setHasta]       = useState(today())
  const [vendedorId,  setVendedorId]  = useState<number | ''>('')
  const [clienteId,   setClienteId]   = useState<number | ''>('')
  const [calView,     setCalView]     = useState<CalendarPill>('day')
  const [calShowFull, setCalShowFull] = useState(false)
  const [calInitialDate, setCalInitialDate] = useState<Date | undefined>(undefined)
  const [showAprobacionesConfig, setShowAprobacionesConfig] = useState(false)
  const [pendingAction, setPendingAction] = useState<{ item: AprobacionItem; action: 'aprobar' | 'rechazar' } | null>(null)
  const [detailItem,    setDetailItem]    = useState<AprobacionItem | null>(null)
  const isSuperadmin = user?.role === 'superadmin'

  const { data: vendors } = useGerenciaVendors()
  const { data: clients } = useGerenciaClients()

  const isRangeInverted = desde > hasta

  // SCRUM-164 (REQ-102) — "Mi calendario", solo lectura, sin scope de equipo (mismo criterio que
  // Servicios, ver ServiciosMyCalendarPanel.tsx). Consulta independiente del filtro Desde/Hasta de
  // arriba (que gobierna Facturación/Proyectos) — este panel tiene su propio rango Día/Semana/Mes.
  const calRange = rangeForPill(calView)
  const { data: calData } = useQuery({
    queryKey: ['gerencia-my-calendar', calRange.from, calRange.to],
    queryFn:  () => gerenciaApi.calendar.list(calRange),
  })

  // SCRUM-162 — aprobar / rechazar directamente desde el panel
  const aprobarMutation = useMutation({
    mutationFn: (item: AprobacionItem) => gerenciaApi.aprobaciones.aprobar(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gerencia/home'] })
      setPendingAction(null)
      setDetailItem(null)
    },
  })
  const rechazarMutation = useMutation({
    mutationFn: (item: AprobacionItem) => gerenciaApi.aprobaciones.rechazar(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gerencia/home'] })
      setPendingAction(null)
      setDetailItem(null)
    },
  })

  const filters = useMemo(() => ({
    desde,
    hasta,
    ...(vendedorId !== '' ? { vendedor_id: vendedorId } : {}),
    ...(clienteId  !== '' ? { cliente_id:  clienteId  } : {}),
  }), [desde, hasta, vendedorId, clienteId])

  const { data, isLoading, isError } = useGerenciaHome(isRangeInverted ? undefined : filters)

  function clearFilters() {
    setDesde(startOfMonth())
    setHasta(today())
    setVendedorId('')
    setClienteId('')
  }

  // ── loading / error ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-slate-400 text-sm">
        Cargando...
      </div>
    )
  }
  if (isError || !data) {
    return (
      <div className="flex items-center justify-center py-32 text-red-500 text-sm">
        Error al cargar los datos. Intenta recargar la página.
      </div>
    )
  }

  const { kpis, facturacion, proyectos, aprobaciones, is_approver, pending_total, salud_modulos, agendas } = data
  const variacion = kpis.variacion_margen
  const hasVariacion = variacion.variacion_pct !== null
  const isNegative = hasVariacion && variacion.variacion_pct! < 0
  const cxcAlDia = Math.max(0, kpis.cxc_al_dia.total - kpis.cxc_al_dia.vencidas)

  return (
    <div className="p-6 space-y-5 max-w-screen-2xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Bienvenido, {user?.first_name ?? 'Gerencia'}
          </h1>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5 capitalize">
            {todayStr()} · pulso general del negocio
          </p>
        </div>
        <button
          disabled
          title="Próximamente"
          className="shrink-0 px-4 py-2 text-sm font-medium border border-slate-200 dark:border-slate-600 rounded-lg text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
        >
          Exportar reporte
        </button>
      </div>

      {/* ── Big KPIs (3 tarjetas) ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Variación margen */}
        <Card className="p-5 cursor-pointer hover:shadow-md transition-shadow relative" onClick={() => navigate(`/admin-contab/facturacion?desde=${desde}&hasta=${hasta}`)}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Variación margen facturado vs. cotizado
          </p>
          <p className={`text-3xl font-bold leading-none ${!hasVariacion ? 'text-slate-400' : isNegative ? 'text-red-600 dark:text-red-400' : 'text-teal-700 dark:text-teal-400'}`}>
            {hasVariacion ? `${isNegative ? '' : '+'}${variacion.variacion_pct!.toFixed(1)} pts` : 'N/A'}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {!hasVariacion ? 'Sin cotizaciones aprobadas para comparar' : isNegative ? 'Margen real por debajo de lo cotizado' : 'Margen real por encima de lo cotizado'}
          </p>
          {(variacion.margen_real_pct != null || variacion.margen_cotiz_pct != null) && (
            <p className="text-[10.5px] text-slate-400 mt-1">
              Real {variacion.margen_real_pct != null ? `${variacion.margen_real_pct.toFixed(1)}` : '—'}% · Cotizado {variacion.margen_cotiz_pct != null ? `${variacion.margen_cotiz_pct.toFixed(1)}` : '—'}%
            </p>
          )}
          <p className="text-[10.5px] text-slate-400">
            Facturado {fmtFull(variacion.facturado)} · Cotizado {fmtFull(variacion.cotizado)}
          </p>
          <span className="absolute top-4 right-4 text-slate-300 dark:text-slate-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
        </Card>

        {/* CxC al día */}
        <Card className="p-5 cursor-pointer hover:shadow-md transition-shadow relative" onClick={() => navigate('/admin-contab/facturacion')}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">CxC al día</p>
          <p className="text-3xl font-bold leading-none text-slate-800 dark:text-slate-100">
            {fmtFull(cxcAlDia)}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {kpis.cxc_al_dia.total > 0
              ? `${Math.round((cxcAlDia / kpis.cxc_al_dia.total) * 100)}% del total en CxC (${fmtFull(kpis.cxc_al_dia.total)})`
              : 'Sin cuentas por cobrar registradas'}
          </p>
          {kpis.cxc_al_dia.vencidas > 0 && (
            <p className="text-[10.5px] text-red-500 mt-1">
              {fmtFull(kpis.cxc_al_dia.vencidas)} vencidas &gt; 30 días
            </p>
          )}
          <span className="absolute top-4 right-4 text-slate-300 dark:text-slate-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
        </Card>

        {/* Proyectos activos */}
        <Card className="p-5 cursor-pointer hover:shadow-md transition-shadow relative" onClick={() => navigate('/ventas-diseno/pipeline')}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Proyectos activos</p>
          <p className="text-3xl font-bold leading-none text-slate-800 dark:text-slate-100">
            {kpis.proyectos_activos}
          </p>
          <p className="text-xs text-slate-400 mt-2">en todos los módulos</p>
          <span className="absolute top-4 right-4 text-slate-300 dark:text-slate-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
        </Card>
      </div>

      {/* ── Filtros compartidos (Facturación + Proyectos) ──────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10.5px] text-slate-400 font-medium">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
            className={`px-2.5 py-1.5 text-xs border rounded-lg text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 ${isRangeInverted ? 'border-red-400' : 'border-slate-200 dark:border-slate-600'}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10.5px] text-slate-400 font-medium">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
            className={`px-2.5 py-1.5 text-xs border rounded-lg text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 ${isRangeInverted ? 'border-red-400' : 'border-slate-200 dark:border-slate-600'}`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10.5px] text-slate-400 font-medium">Vendedor</label>
          <select
            value={vendedorId}
            onChange={e => setVendedorId(e.target.value === '' ? '' : Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="">Todos los vendedores</option>
            {vendors?.map(v => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10.5px] text-slate-400 font-medium">Cliente</label>
          <select
            value={clienteId}
            onChange={e => setClienteId(e.target.value === '' ? '' : Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="">Todos los clientes</option>
            {clients?.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {isRangeInverted && (
          <p className="text-[10.5px] text-red-500 font-medium">La fecha «Desde» debe ser anterior a «Hasta»</p>
        )}
        <button
          onClick={clearFilters}
          className="ml-auto px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          Limpiar filtro
        </button>
      </div>

      {/* ── Panel Facturación ────────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Facturación</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Resumen — haz clic en cualquier dato o barra para ver el detalle
          </p>
        </div>

        {/* KPIs x4 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3.5 cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" onClick={() => navigate('/admin-contab/facturacion')}>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">Facturado este año</p>
            <p className="text-[19px] font-bold text-slate-800 dark:text-slate-100 leading-none">
              {fmtFull(facturacion.kpis.facturado_anio)}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3.5 cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" onClick={() => navigate('/admin-contab/facturacion')}>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">Facturado este mes</p>
            <p className="text-[19px] font-bold text-slate-800 dark:text-slate-100 leading-none">
              {fmtFull(facturacion.kpis.facturado_mes)}
            </p>
            <p className="text-[10.5px] text-slate-400 mt-1">{facturacion.kpis.facturas_count} facturas</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3.5 cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" onClick={() => navigate('/admin-contab/facturacion')}>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">Margen del año</p>
            <p className="text-[19px] font-bold text-teal-700 dark:text-teal-400 leading-none">
              {facturacion.kpis.margen_anio_pct != null ? `${facturacion.kpis.margen_anio_pct.toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3.5 cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" onClick={() => navigate('/admin-contab/facturacion')}>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">Margen del mes</p>
            <p className="text-[19px] font-bold text-teal-700 dark:text-teal-400 leading-none">
              {facturacion.kpis.margen_mes_pct != null ? `${facturacion.kpis.margen_mes_pct.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>

        {/* Chart */}
        <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-3">
          Facturado por mes
        </p>
        <BarChart data={facturacion.chart_mensual} color="#5BA5A0" onBarClick={mes => { const { desde, hasta } = monthRange(mes); navigate(`/admin-contab/facturacion?desde=${desde}&hasta=${hasta}`) }} />

        <button
          className="mt-3 flex items-center gap-1 text-[11px] font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 transition-colors"
          onClick={() => navigate('/admin-contab/facturacion')}
        >
          Ver detalle completo por vendedor y cliente
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
          </svg>
        </button>
      </Card>

      {/* ── Panel Proyectos ──────────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Proyectos</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monto y margen cotizado — haz clic en cualquier dato para ver el detalle
          </p>
        </div>

        {/* KPIs x4 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3.5 cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" onClick={() => navigate('/ventas-diseno/pedidos')}>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">Proyectos cerrados este año</p>
            <p className="text-[19px] font-bold text-slate-800 dark:text-slate-100 leading-none">
              {fmtFull(proyectos.kpis.cerrados_anio)}
            </p>
            <p className="text-[10.5px] text-slate-400 mt-1">{proyectos.kpis.cerrados_anio_count} proyectos cerrados</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3.5 cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" onClick={() => navigate('/ventas-diseno/pedidos')}>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">Proyectos cerrados este mes</p>
            <p className="text-[19px] font-bold text-slate-800 dark:text-slate-100 leading-none">
              {fmtFull(proyectos.kpis.cerrados_mes)}
            </p>
            <p className="text-[10.5px] text-slate-400 mt-1">{proyectos.kpis.cerrados_mes_count} proyectos cerrados</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3.5 cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" onClick={() => navigate('/ventas-diseno/pedidos')}>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">Margen del año</p>
            <p className="text-[19px] font-bold text-teal-700 dark:text-teal-400 leading-none">
              {proyectos.kpis.margen_anio_pct != null ? `${proyectos.kpis.margen_anio_pct.toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3.5 cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" onClick={() => navigate('/ventas-diseno/pedidos')}>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">Margen del mes</p>
            <p className="text-[19px] font-bold text-teal-700 dark:text-teal-400 leading-none">
              {proyectos.kpis.margen_mes_pct != null ? `${proyectos.kpis.margen_mes_pct.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>

        <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-3">
          Proyectos por mes
        </p>
        <BarChart data={proyectos.chart_mensual} color="#5BA5A0" onBarClick={() => navigate('/ventas-diseno/pedidos')} />

        <button
          className="mt-3 flex items-center gap-1 text-[11px] font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 transition-colors"
          onClick={() => navigate('/ventas-diseno/pedidos')}
        >
          Ver detalle completo por vendedor y cliente
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
          </svg>
        </button>
      </Card>

      {/* ── Aprobaciones + Calendario ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Aprobaciones por validar */}
        <Card className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Aprobaciones por validar</h2>
              <p className="text-xs text-slate-400 mt-0.5">Requieren visto bueno de Gerencia</p>
            </div>
            {isSuperadmin && (
              <button
                onClick={() => setShowAprobacionesConfig(true)}
                className="shrink-0 text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border-none rounded-lg px-3 py-1.5 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors"
              >
                Configurar
              </button>
            )}
          </div>
          {!is_approver ? (
            <div className="py-10 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Solo para aprobadores</p>
              <p className="text-xs text-slate-400 max-w-[220px]">
                Las aprobaciones son visibles solo para el aprobador designado.
              </p>
            </div>
          ) : aprobaciones.length === 0 ? (
            <div className="py-10 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5BA5A0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Todo al día</p>
              <p className="text-xs text-slate-400 max-w-[200px]">
                No hay aprobaciones pendientes en este momento.
              </p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[380px] overflow-y-auto">
              {aprobaciones.map((item, i) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0"
                >
                  <div
                    className="flex items-start gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 -mx-2 px-2 rounded-lg pb-2"
                    onClick={() => setDetailItem(item)}
                  >
                    <span className="shrink-0 w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                        {item.reference}
                        <span className="ml-1.5 text-[10px] text-slate-400 font-normal">· {item.module}</span>
                      </p>
                      <p className="text-[10.5px] text-slate-400 truncate">{item.description}</p>
                    </div>
                    {item.amount != null && item.amount > 0 && (
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                        {fmtFull(item.amount)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {pending_total > aprobaciones.length && (
                <p className="text-[10.5px] text-amber-600 dark:text-amber-400 text-center pt-2">
                  +{pending_total - aprobaciones.length} aprobaciones más
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Mi calendario — SCRUM-164 (REQ-102), solo lectura, sin scope de equipo */}
        <Card className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Mi calendario</h2>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">Sincronizado con Outlook</p>
            </div>
            {/* Pill toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded-full p-0.5 gap-0.5">
              {(['day', 'week', 'month'] as CalendarPill[]).map(v => (
                <button
                  key={v}
                  onClick={() => setCalView(v)}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${calView === v ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                >
                  {PILL_LABEL[v]}
                </button>
              ))}
            </div>
          </div>

          <MiniCalendarCard
            view={calView}
            events={calData?.data ?? []}
            onSelectDay={day => { setCalInitialDate(day); setCalShowFull(true) }}
          />

          <button
            onClick={() => { setCalInitialDate(undefined); setCalShowFull(true) }}
            className="mt-3 w-full text-center text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 transition-colors"
          >
            Ver calendario completo
          </button>

          {calShowFull && (
            <CalendarModal
              queryKeyPrefix="gerencia-my-calendar"
              fetchEvents={gerenciaApi.calendar.list}
              onClose={() => setCalShowFull(false)}
              initialDate={calInitialDate}
              initialView={calInitialDate ? calView : 'month'}
            />
          )}
        </Card>
      </div>

      {/* ── Salud por módulo ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Salud por módulo</h2>

        {/* Fila 2 — Ventas & Diseño + Admin & Contab */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {/* Ventas & Diseño */}
          <Card className="p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5BA5A0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21l3.6-1 11-11-2.6-2.6-11 11z"/><path d="M14 6.4 17.6 10"/>
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ventas &amp; Diseño</span>
            </div>
            <ModuleHealthMetric label="En Final Stage" value={salud_modulos.ventas_diseno.en_final_stage} onClick={() => navigate('/ventas-diseno/pipeline?stage=proposal')} />
            <ModuleHealthMetric label="Estancados" value={salud_modulos.ventas_diseno.estancados} variant={salud_modulos.ventas_diseno.estancados > 0 ? 'warn' : 'normal'} onClick={() => navigate('/ventas-diseno/pipeline?stage=stagnant')} />
            <ModuleHealthMetric label="Monto cotizado en el mes" value={fmt(salud_modulos.ventas_diseno.monto_cotizado_mes)} onClick={() => navigate(`/ventas-diseno/quotes-list?mes=${currentMonth()}`)} />
            <ModuleHealthMetric label="Monto aprobado del mes" value={fmt(salud_modulos.ventas_diseno.monto_aprobado_mes)} onClick={() => navigate(`/ventas-diseno/pedidos?mes=${currentMonth()}`)} />
            <ModuleHealthMetric label="Pipeline total" value={fmt(salud_modulos.ventas_diseno.pipeline_total)} onClick={() => navigate('/ventas-diseno/pipeline')} />
          </Card>

          {/* Admin & Contab — SCRUM-167 RN1/RN3 */}
          <Card className="p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5BA5A0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3"/><path d="M9 12h6"/><path d="M9 15h6"/>
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Admin. &amp; Contab.</span>
            </div>
            <ModuleHealthMetric label="CxC Total" value={fmt(salud_modulos.admin_contab.cxc_total)} onClick={() => navigate('/admin-contab/cobros?estado=esperando_confirmacion')} />
            <ModuleHealthMetric label="Cuentas al día" value={fmt(salud_modulos.admin_contab.cuentas_al_dia)} onClick={() => navigate('/admin-contab/cobros')} />
          </Card>
        </div>

        {/* Fila 3 — Compras + Bodega + Servicios */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Compras */}
          <Card className="p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5BA5A0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/>
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Compras</span>
            </div>
            <ModuleHealthMetric label="Órdenes críticas" value={salud_modulos.compras.ordenes_criticas} variant={salud_modulos.compras.ordenes_criticas > 0 ? 'danger' : 'normal'} onClick={() => navigate('/compras/ordenes?chip=critical')} />
            <ModuleHealthMetric label="Bajo stock sin ordenar" value={salud_modulos.compras.bajo_stock_sin_ordenar ?? 0} variant={(salud_modulos.compras.bajo_stock_sin_ordenar ?? 0) > 0 ? 'warn' : 'normal'} onClick={() => navigate('/inventario?chip=bajo_stock_sin_ordenar')} />
            <ModuleHealthMetric label="En tránsito" value={salud_modulos.compras.en_transito} onClick={() => navigate('/compras/logistica')} />
            <ModuleHealthMetric label="Próximas a llegar" value={salud_modulos.compras.proximas_a_llegar} onClick={() => navigate('/compras/logistica')} />
            <ModuleHealthMetric label="Cantidad de pedidos" value={salud_modulos.compras.cantidad_pedidos} onClick={() => navigate('/compras/ordenes')} />
          </Card>

          {/* Bodega — SCRUM-169 RN1-RN4 */}
          <Card className="p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5BA5A0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z"/>
                  <path d="M3 8.5V16l9 4.5 9-4.5V8.5"/>
                  <path d="M12 13v7.5"/>
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Bodega</span>
            </div>
            <ModuleHealthMetric label="Despachos urgentes" value={salud_modulos.bodega.despachos_urgentes} variant={salud_modulos.bodega.despachos_urgentes > 0 ? 'warn' : 'normal'} onClick={() => navigate('/bodega/pedidos?chip=urgentes')} />
            <ModuleHealthMetric label="Despachos atrasados" value={salud_modulos.bodega.despachos_atrasados} variant={salud_modulos.bodega.despachos_atrasados > 0 ? 'danger' : 'normal'} onClick={() => navigate('/bodega/pedidos?chip=atrasados')} />
            <ModuleHealthMetric label="Despachado a tiempo" value={salud_modulos.bodega.despachado_a_tiempo} />
            <ModuleHealthMetric label="Completados hoy" value={salud_modulos.bodega.completados_hoy} onClick={() => navigate('/bodega/pedidos')} />
          </Card>

          {/* Servicios — SCRUM-170 RN1/RN3 */}
          <Card className="p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5BA5A0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a3 3 0 0 0-4.2 4.2L3 18l3 3 7.5-7.5a3 3 0 0 0 4.2-4.2l-2.6-2.6Z"/>
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Servicios</span>
            </div>
            <ModuleHealthMetric label="Sin responder" value={salud_modulos.servicios.sin_responder} variant={salud_modulos.servicios.sin_responder > 5 ? 'warn' : 'normal'} onClick={() => navigate('/servicios/tickets?estado=reported')} />
            <ModuleHealthMetric label="Completados este mes" value={salud_modulos.servicios.completados_mes} onClick={() => navigate('/servicios/tickets?estado=resolved')} />
          </Card>
        </div>
      </div>

      {/* ── Agendas del día ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Agenda Bodega */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5BA5A0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z"/>
                  <path d="M3 8.5V16l9 4.5 9-4.5V8.5"/>
                  <path d="M12 13v7.5"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Agenda de Bodega — hoy</p>
                <p className="text-xs text-slate-400">{agendas.bodega.length} movimientos programados</p>
              </div>
            </div>
            <button
              className="text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border-none rounded-lg px-3 py-1.5 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors"
              onClick={() => navigate('/bodega/rutas-dia')}
            >
              Ver detalle
            </button>
          </div>
          {agendas.bodega.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Sin movimientos programados para hoy.</p>
          ) : (
            <div>
              {agendas.bodega.map(item => (
                <div key={item.id} className="flex gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 -mx-2 px-2 rounded-lg" onClick={() => navigate(`/bodega/pedidos?order=${item.id}`)}>
                  <span className="text-[10px] text-slate-400 w-11 shrink-0 font-mono pt-0.5">{item.order_number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{item.customer}</p>
                    <p className="text-[10.5px] text-slate-400 truncate">{item.project ?? item.address ?? '—'}</p>
                  </div>
                  <span className="text-[10px] text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded-full self-center shrink-0">{item.stage.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Agenda Servicios */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5BA5A0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a3 3 0 0 0-4.2 4.2L3 18l3 3 7.5-7.5a3 3 0 0 0 4.2-4.2l-2.6-2.6Z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Agenda de Servicios — hoy</p>
                <p className="text-xs text-slate-400">{agendas.servicios.length} visitas programadas</p>
              </div>
            </div>
            <button
              className="text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border-none rounded-lg px-3 py-1.5 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition-colors"
              onClick={() => navigate('/servicios/inicio')}
            >
              Ver detalle
            </button>
          </div>
          {agendas.servicios.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Sin visitas programadas para hoy.</p>
          ) : (
            <div>
              {agendas.servicios.map(item => (
                <div key={item.id} className="flex gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 -mx-2 px-2 rounded-lg" onClick={() => navigate(`/servicios/tickets?ticket=${item.id}`)}>
                  <span className="text-[10px] text-slate-400 w-11 shrink-0 font-mono pt-0.5">{item.hora ?? '—'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{item.cliente}</p>
                    <p className="text-[10.5px] text-slate-400 truncate">
                      {item.numero} · {item.tipo}{item.tecnico ? ` · ${item.tecnico}` : ''}
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full self-center shrink-0 ${item.estado === 'on_site' ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' : 'text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-900/20'}`}>
                    {item.estado === 'on_site' ? 'en sitio' : 'programado'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {showAprobacionesConfig && (
        <GerenciaAprobacionesPanel onClose={() => setShowAprobacionesConfig(false)} />
      )}

      {/* Modal detalle de aprobación — SCRUM-162 RN1/RN2/RN3 */}
      {detailItem !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            {/* Encabezado */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 rounded-full">
                  {moduleLabel(detailItem.type)}
                </span>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-2">
                  {detailItem.reference}
                </h3>
              </div>
              <button
                onClick={() => setDetailItem(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                aria-label="Cerrar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>

            {/* Detalle — RN1: motivo, monto, contexto */}
            <div className="space-y-3 mb-5">
              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Descripción</p>
                <p className="text-sm text-slate-700 dark:text-slate-200">{detailItem.description}</p>
              </div>
              {detailItem.amount != null && detailItem.amount > 0 && (
                <div>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Monto</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{fmtFull(detailItem.amount)}</p>
                </div>
              )}
              {detailItem.created_at && (
                <div>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-0.5">Creado</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(detailItem.created_at).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              )}
            </div>

            {/* Acciones — RN2: Aprobar/Rechazar sin salir de Gerencia; RN3: Ver en módulo con contexto */}
            <div className="flex flex-wrap gap-2">
              {detailItem.can_approve && (
                <button
                  onClick={() => setPendingAction({ item: detailItem, action: 'aprobar' })}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors"
                >
                  Aprobar
                </button>
              )}
              {detailItem.can_approve && detailItem.type !== 'purchase_order' && (
                <button
                  onClick={() => setPendingAction({ item: detailItem, action: 'rechazar' })}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
                  Rechazar
                </button>
              )}
              <button
                onClick={() => { navigate(buildContextUrl(detailItem)); setDetailItem(null) }}
                className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Ver en {moduleLabel(detailItem.type)} →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación Aprobar / Rechazar — SCRUM-162 */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">
              {pendingAction.action === 'aprobar' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {pendingAction.action === 'aprobar'
                ? `¿Aprobar ${pendingAction.item.reference}?`
                : `¿Rechazar ${pendingAction.item.reference}? Esta acción no se puede deshacer.`}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingAction(null)}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-600 rounded-lg text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={aprobarMutation.isPending || rechazarMutation.isPending}
                onClick={() => {
                  if (pendingAction.action === 'aprobar') {
                    aprobarMutation.mutate(pendingAction.item)
                  } else {
                    rechazarMutation.mutate(pendingAction.item)
                  }
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                  pendingAction.action === 'aprobar'
                    ? 'bg-teal-600 hover:bg-teal-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {aprobarMutation.isPending || rechazarMutation.isPending
                  ? 'Procesando...'
                  : pendingAction.action === 'aprobar' ? 'Sí, aprobar' : 'Sí, rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
