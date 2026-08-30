import type { CSSProperties } from 'react'
import { useRef, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar as CjsBar, Doughnut as CjsDoughnut } from 'react-chartjs-2'
import {
  BarChart,
  Bar as RcBar,
  XAxis,
  YAxis,
  Tooltip as RcTooltip,
  Cell,
  PieChart,
  Pie as RcPie,
  Legend as RcLegend,
  ResponsiveContainer,
} from 'recharts'
import ReactECharts from 'echarts-for-react'
import * as d3 from 'd3'
import { IcoCheck, IcoBell } from '@/components/icons'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

// ── Shared mock data ───────────────────────────────────────────────────────────

const STAGES_MOCK = [
  { label: 'Lead',               color: '#eab308', count: 8  },
  { label: 'En Diseño',         color: '#3b82f6', count: 5  },
  { label: 'En Cotización',     color: '#a855f7', count: 6  },
  { label: 'Propuesta Enviada', color: '#f97316', count: 3  },
  { label: 'Cerrado',           color: '#16a34a', count: 11 },
  { label: 'Perdido',           color: '#64748b', count: 4  },
]

const TYPES_MOCK = [
  { label: 'Diseño',     value: 12, color: '#3b82f6' },
  { label: 'Cotización', value: 9,  color: '#a855f7' },
  { label: 'Ambos',      value: 16, color: '#5BA5A0' },
]

const PIPELINE_ACTIVO  = 184_500
const PIPELINE_CERRADO =  93_200

const REMINDERS_MOCK = [
  { id: 1, project: 'Hotel Pacífico — Lobby',      stage: 'Propuesta Enviada', date: '2026-07-01', note: 'Llamar al arquitecto' },
  { id: 2, project: 'Residencial Las Palmas',       stage: 'En Cotización',    date: '2026-07-02', note: 'Enviar render final' },
  { id: 3, project: 'Centro Comercial Miraflores', stage: 'En Diseño',        date: '2026-07-03', note: 'Reunión con cliente' },
]

const KPI_TILES = [
  ...STAGES_MOCK.map(s => ({ label: s.label, value: s.count, color: s.color })),
  { label: 'Pipeline Activo', value: `$${PIPELINE_ACTIVO.toLocaleString()}`,  color: '#5BA5A0', sub: 'Proyectos abiertos' },
  { label: 'Cerrado Total',   value: `$${PIPELINE_CERRADO.toLocaleString()}`, color: '#16a34a', sub: 'Ganados este período' },
]

// Etiquetas cortas para ejes donde el espacio es limitado
const stageShort = (label: string) => label.replace('En ', '').replace(' Enviada', '')

// ── Estilos compartidos ────────────────────────────────────────────────────────

const glass: CSSProperties = {
  background: 'rgba(255,255,255,0.55)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  border: '1px solid rgba(255,255,255,0.78)',
  boxShadow: '0 8px 32px rgba(91,165,160,0.11), 0 1px 4px rgba(0,0,0,0.04)',
  borderRadius: '12px',
}

const CHART_BG = 'linear-gradient(135deg, #d9ede9 0%, #eaf5dc 45%, #fafaf7 100%)'

const tooltipStyle = {
  background: 'rgba(255,255,255,0.92)',
  border: '1px solid rgba(91,165,160,0.22)',
  borderRadius: '8px',
  fontSize: '12px',
}

// ── Chart.js options ───────────────────────────────────────────────────────────

const cjsTooltip = {
  backgroundColor: 'rgba(255,255,255,0.92)',
  titleColor: '#1e293b',
  bodyColor: '#475569',
  borderColor: 'rgba(91,165,160,0.22)',
  borderWidth: 1,
  padding: 10,
}

const cjsBarOpts = {
  responsive: true,
  plugins: { legend: { display: false }, tooltip: cjsTooltip },
  scales: {
    y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 }, color: '#94a3b8' }, grid: { color: 'rgba(203,213,225,0.35)' } },
    x: { ticks: { font: { size: 11 }, color: '#94a3b8' }, grid: { display: false } },
  },
}

const cjsDoughnutOpts = {
  responsive: true,
  plugins: {
    legend: { position: 'bottom' as const, labels: { font: { size: 11 }, boxWidth: 12, color: '#64748b', padding: 14 } },
    tooltip: cjsTooltip,
  },
  cutout: '68%',
}

// ── D3 sub-components ──────────────────────────────────────────────────────────

function D3BarChart() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef  = useRef<SVGSVGElement>(null)

  const draw = (animated: boolean) => {
    if (!svgRef.current || !wrapRef.current) return
    const W = 500, H = 200, ml = 32, mr = 10, mt = 8, mb = 40
    const iW = W - ml - mr, iH = H - mt - mb

    const x = d3.scaleBand().domain(STAGES_MOCK.map(d => d.label)).range([0, iW]).padding(0.28)
    const y = d3.scaleLinear().domain([0, (d3.max(STAGES_MOCK, d => d.count) ?? 0) + 2]).range([iH, 0])

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const g = svg.append('g').attr('transform', `translate(${ml},${mt})`)

    // Tooltip div
    const tip = d3.select(wrapRef.current)
      .selectAll<HTMLDivElement, null>('.d3-tip').data([null]).join('div')
      .attr('class', 'd3-tip')
      .style('position', 'absolute').style('pointer-events', 'none')
      .style('background', 'rgba(255,255,255,0.92)').style('border', '1px solid rgba(91,165,160,0.22)')
      .style('border-radius', '8px').style('padding', '5px 10px')
      .style('font-size', '12px').style('color', '#1e293b')
      .style('opacity', '0').style('transition', 'opacity .12s').style('white-space', 'nowrap')

    y.ticks(4).forEach(t => {
      g.append('line').attr('x1', 0).attr('x2', iW).attr('y1', y(t)).attr('y2', y(t))
        .attr('stroke', 'rgba(203,213,225,0.4)').attr('stroke-width', 1)
      g.append('text').attr('x', -4).attr('y', y(t) + 4)
        .attr('text-anchor', 'end').attr('font-size', 9).attr('fill', '#94a3b8').text(t)
    })

    const bars = g.selectAll('rect').data(STAGES_MOCK).enter().append('rect')
      .attr('x', d => x(d.label) ?? 0).attr('width', x.bandwidth())
      .attr('fill', d => d.color + 'cc').attr('stroke', d => d.color)
      .attr('stroke-width', 1).attr('rx', 4).style('cursor', 'pointer')
      .attr('y', iH).attr('height', 0)

    // Hover
    bars
      .on('mouseover', function(event, d) {
        d3.select(this).transition().duration(120).attr('fill', d.color).attr('y', y(d.count) - 3).attr('height', iH - y(d.count) + 3)
        const [px, py] = d3.pointer(event, wrapRef.current)
        tip.style('opacity', '1').html(`<strong>${d.label}</strong>: ${d.count} proyectos`)
          .style('left', `${px + 10}px`).style('top', `${py - 38}px`)
      })
      .on('mouseout', function(_, d) {
        d3.select(this).transition().duration(120).attr('fill', d.color + 'cc').attr('y', y(d.count)).attr('height', iH - y(d.count))
        tip.style('opacity', '0')
      })

    if (animated) {
      bars.transition().duration(550).delay((_, i) => i * 70).ease(d3.easeCubicOut)
        .attr('y', d => y(d.count)).attr('height', d => iH - y(d.count))
    } else {
      bars.attr('y', d => y(d.count)).attr('height', d => iH - y(d.count))
    }

    STAGES_MOCK.forEach(d => {
      g.append('text')
        .attr('x', (x(d.label) ?? 0) + x.bandwidth() / 2).attr('y', iH + 14)
        .attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', '#94a3b8')
        .text(stageShort(d.label))
    })
  }

  useEffect(() => {
    draw(false)
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) draw(true) },
      { threshold: 0.5 }
    )
    if (svgRef.current) observer.observe(svgRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg ref={svgRef} viewBox="0 0 500 200" className="w-full" />
    </div>
  )
}

function D3DonutChart() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef  = useRef<SVGSVGElement>(null)

  const draw = (animated: boolean) => {
    if (!svgRef.current || !wrapRef.current) return
    const W = 200, H = 210, outerR = 68, innerR = 44

    type Datum = typeof TYPES_MOCK[0]
    const pieLayout  = d3.pie<Datum>().value(d => d.value).sort(null)
    const arcGen     = d3.arc<d3.PieArcDatum<Datum>>().innerRadius(innerR).outerRadius(outerR)
    const arcHover   = d3.arc<d3.PieArcDatum<Datum>>().innerRadius(innerR).outerRadius(outerR + 9)
    const slices     = pieLayout(TYPES_MOCK)

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2 - 14})`)

    // Tooltip div
    const tip = d3.select(wrapRef.current)
      .selectAll<HTMLDivElement, null>('.d3-tip').data([null]).join('div')
      .attr('class', 'd3-tip')
      .style('position', 'absolute').style('pointer-events', 'none')
      .style('background', 'rgba(255,255,255,0.92)').style('border', '1px solid rgba(91,165,160,0.22)')
      .style('border-radius', '8px').style('padding', '5px 10px')
      .style('font-size', '12px').style('color', '#1e293b')
      .style('opacity', '0').style('transition', 'opacity .12s').style('white-space', 'nowrap')

    const paths = g.selectAll('path').data(slices).enter().append('path')
      .attr('fill',         (_, i) => TYPES_MOCK[i].color + 'cc')
      .attr('stroke',       (_, i) => TYPES_MOCK[i].color)
      .attr('stroke-width', 1.5).style('cursor', 'pointer')

    // Hover — arco se expande + tooltip
    paths
      .on('mouseover', function(event, d) {
        d3.select(this).transition().duration(120).attr('d', arcHover(d) ?? '')
        const [px, py] = d3.pointer(event, wrapRef.current)
        const datum = TYPES_MOCK[d.index]
        tip.style('opacity', '1').html(`<strong>${datum.label}</strong>: ${datum.value} proyectos`)
          .style('left', `${px + 10}px`).style('top', `${py - 38}px`)
      })
      .on('mouseout', function(_, d) {
        d3.select(this).transition().duration(120).attr('d', arcGen(d) ?? '')
        tip.style('opacity', '0')
      })

    if (animated) {
      paths.attr('d', d => arcGen({ ...d, endAngle: d.startAngle }) ?? '')
        .transition().duration(700).delay((_, i) => i * 120).ease(d3.easeCubicOut)
        .attrTween('d', d => {
          const interp = d3.interpolate({ startAngle: d.startAngle, endAngle: d.startAngle }, d)
          return (t: number) => arcGen(interp(t)) ?? ''
        })
    } else {
      paths.attr('d', d => arcGen(d) ?? '')
    }

    TYPES_MOCK.forEach((t, i) => {
      const lg = svg.append('g').attr('transform', `translate(14,${H - 42 + i * 16})`)
      lg.append('rect').attr('width', 8).attr('height', 8)
        .attr('fill', t.color + 'cc').attr('stroke', t.color).attr('rx', 2)
      lg.append('text').attr('x', 13).attr('y', 8)
        .attr('font-size', 10).attr('fill', '#64748b').text(t.label)
    })
  }

  useEffect(() => {
    draw(false)
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) draw(true) },
      { threshold: 0.5 }
    )
    if (svgRef.current) observer.observe(svgRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg ref={svgRef} viewBox="0 0 200 210" className="w-full max-h-48" />
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ title, pkg, license, warn = false }: {
  title: string; pkg: string; license: string; warn?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2.5 mb-3">
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      <code className="text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{pkg}</code>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${warn ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
        {license}
      </span>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TestPage() {

  // Chart.js data
  const cjsBarData = {
    labels: STAGES_MOCK.map(s => s.label),
    datasets: [{
      data: STAGES_MOCK.map(s => s.count),
      backgroundColor: STAGES_MOCK.map(s => s.color + 'cc'),
      borderColor: STAGES_MOCK.map(s => s.color),
      borderWidth: 1, borderRadius: 4,
    }],
  }
  const cjsDoughnutData = {
    labels: TYPES_MOCK.map(t => t.label),
    datasets: [{
      data: TYPES_MOCK.map(t => t.value),
      backgroundColor: TYPES_MOCK.map(t => t.color + 'cc'),
      borderColor: TYPES_MOCK.map(t => t.color),
      borderWidth: 1,
    }],
  }

  // Recharts data
  const rcBarData  = STAGES_MOCK.map(s => ({ name: stageShort(s.label), value: s.count,  color: s.color }))
  const rcPieData  = TYPES_MOCK.map(t  => ({ name: t.label,             value: t.value,  color: t.color }))

  // ECharts options
  const ecBarOpts = {
    backgroundColor: 'transparent',
    grid: { top: 8, right: 8, bottom: 36, left: 32 },
    xAxis: {
      type: 'category',
      data: STAGES_MOCK.map(s => stageShort(s.label)),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 10, color: '#94a3b8' },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#94a3b8' },
      splitLine: { lineStyle: { color: 'rgba(203,213,225,0.35)' } },
    },
    tooltip: {
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderColor: 'rgba(91,165,160,0.22)',
      textStyle: { color: '#1e293b', fontSize: 12 },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 40,
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      data: STAGES_MOCK.map(s => ({ value: s.count, itemStyle: { color: s.color + 'cc', borderColor: s.color, borderWidth: 1 } })),
    }],
  }

  const ecDonutOpts = {
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: 'rgba(255,255,255,0.92)',
      borderColor: 'rgba(91,165,160,0.22)',
      textStyle: { color: '#1e293b', fontSize: 12 },
    },
    legend: {
      bottom: 0,
      itemWidth: 10, itemHeight: 10,
      textStyle: { fontSize: 11, color: '#64748b' },
    },
    series: [{
      type: 'pie',
      radius: ['44%', '68%'],
      center: ['50%', '45%'],
      label: { show: false },
      data: TYPES_MOCK.map(t => ({ name: t.label, value: t.value, itemStyle: { color: t.color + 'cc', borderColor: t.color, borderWidth: 1.5 } })),
    }],
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold text-slate-900">
          Dashboard CRM
          <span className="ml-2 text-xs font-normal text-slate-400">· comparativa de librerías — glassmorphism en gráficos</span>
        </h1>
        <button className="px-4 py-2 text-sm font-semibold text-white rounded-lg" style={{ background: '#5BA5A0' }}>
          Nuevo proyecto
        </button>
      </div>

      {/* KPI tiles — estilo estándar */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {KPI_TILES.map(k => (
          <div key={k.label} className="rounded-2xl p-4 relative overflow-hidden" style={{ background: `${k.color}18` }}>
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">{k.label}</div>
            <div className="text-2xl font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
            {'sub' in k && <div className="text-[11px] text-slate-400 mt-1">{(k as { sub: string }).sub}</div>}
          </div>
        ))}
      </div>

      {/* Divisor */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Comparativa de librerías</span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* ── 1. Chart.js ── */}
      <section>
        <SectionHeader title="Chart.js" pkg="chart.js + react-chartjs-2" license="MIT" />
        <div className="rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4" style={{ background: CHART_BG }}>
          <div className="md:col-span-2 p-4" style={glass}>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Proyectos por etapa</p>
            <CjsBar data={cjsBarData} options={cjsBarOpts} />
          </div>
          <div className="p-4 flex flex-col" style={glass}>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Por tipo</p>
            <div className="flex-1 flex items-center justify-center">
              <CjsDoughnut data={cjsDoughnutData} options={cjsDoughnutOpts} />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Recharts ── */}
      <section>
        <SectionHeader title="Recharts" pkg="recharts" license="MIT" />
        <div className="rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4" style={{ background: CHART_BG }}>
          <div className="md:col-span-2 p-4" style={glass}>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Proyectos por etapa</p>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={rcBarData} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <RcTooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(91,165,160,0.06)' }} />
                <RcBar dataKey="value" radius={[4, 4, 0, 0]}>
                  {rcBarData.map(d => <Cell key={d.name} fill={d.color + 'cc'} stroke={d.color} strokeWidth={1} />)}
                </RcBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="p-4 flex flex-col" style={glass}>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Por tipo</p>
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <RcPie data={rcPieData} dataKey="value" cx="50%" cy="45%" innerRadius={44} outerRadius={68}>
                  {rcPieData.map(d => <Cell key={d.name} fill={d.color + 'cc'} stroke={d.color} strokeWidth={1.5} />)}
                </RcPie>
                <RcTooltip contentStyle={tooltipStyle} />
                <RcLegend iconSize={10} wrapperStyle={{ fontSize: '11px', color: '#64748b' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ── 3. Apache ECharts ── */}
      <section>
        <SectionHeader title="Apache ECharts" pkg="echarts + echarts-for-react" license="Apache 2.0" />
        <div className="rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4" style={{ background: CHART_BG }}>
          <div className="md:col-span-2 p-4" style={glass}>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Proyectos por etapa</p>
            <ReactECharts option={ecBarOpts} style={{ height: '210px' }} />
          </div>
          <div className="p-4 flex flex-col" style={glass}>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Por tipo</p>
            <ReactECharts option={ecDonutOpts} style={{ height: '210px' }} />
          </div>
        </div>
      </section>

      {/* ── 4. D3.js ── */}
      <section>
        <SectionHeader title="D3.js" pkg="d3" license="ISC" />
        <div className="rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4" style={{ background: CHART_BG }}>
          <div className="md:col-span-2 p-4" style={glass}>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Proyectos por etapa</p>
            <D3BarChart />
          </div>
          <div className="p-4 flex flex-col" style={glass}>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400 mb-3">Por tipo</p>
            <div className="flex-1 flex items-center justify-center">
              <D3DonutChart />
            </div>
          </div>
        </div>
      </section>

      {/* Divisor */}
      <div className="h-px bg-slate-100" />

      {/* Pipeline cards — estilo estándar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg font-bold shrink-0" style={{ background: '#5BA5A0' }}>$</div>
          <div>
            <p className="text-xs uppercase tracking-widest font-medium text-slate-400">Pipeline Activo</p>
            <p className="text-2xl font-bold text-slate-900">${PIPELINE_ACTIVO.toLocaleString()}</p>
            <p className="text-xs text-slate-400">Proyectos abiertos</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: '#16a34a' }}><IcoCheck size={18} /></div>
          <div>
            <p className="text-xs uppercase tracking-widest font-medium text-slate-400">Cerrado Total</p>
            <p className="text-2xl font-bold text-slate-900">${PIPELINE_CERRADO.toLocaleString()}</p>
            <p className="text-xs text-slate-400">Ganados este período</p>
          </div>
        </div>
      </div>

      {/* Recordatorios — estilo estándar */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <p className="font-medium text-slate-800 text-sm">Recordatorios pendientes</p>
          <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{REMINDERS_MOCK.length}</span>
        </div>
        <ul className="divide-y divide-slate-50">
          {REMINDERS_MOCK.map(r => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-amber-400 shrink-0"><IcoBell size={16} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-800 truncate">{r.project}</p>
                <p className="text-[11px] text-slate-400">{r.stage} · {r.date} · {r.note}</p>
              </div>
              <button className="shrink-0 text-[11px] font-bold text-green-600 hover:text-green-700 border border-green-200 rounded px-2 py-0.5 hover:bg-green-50 transition">
                Hecho
              </button>
            </li>
          ))}
        </ul>
      </div>

    </div>
  )
}
