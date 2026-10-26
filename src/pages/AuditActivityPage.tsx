import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarController, BarElement, Tooltip,
} from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { isAxiosError } from 'axios'
import { auditActivityApi, ACTIVITY_MAX_DAYS, ACTIVITY_TYPES } from '@/api/auditLogsApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { getRegion } from '@/lib/region'

ChartJS.register(CategoryScale, LinearScale, BarController, BarElement, Tooltip)

// SCRUM-1020 (Epic SCRUM-788) — dashboard de actividad sobre audit_logs. Un solo color de marca:
// cada gráfico mide una sola cosa (nº de interacciones), así que no hay leyenda que codificar.
const BAR_COLOR = '#5BA5A0'
const PRESETS = [7, 30, 90] as const
const DAY_MS = 86_400_000

/** Fecha de hoy (Y-m-d) en hora de Panamá, igual que interpreta el rango el backend (SCRUM-883). */
function todayPanama(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: getRegion().timezone })
}

function shiftDays(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Días inclusivos del rango; NaN si alguna fecha es inválida. */
function rangeDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1
}

function humanize(raw: string): string {
  return raw.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

interface BarsProps {
  title:      string
  labels:     string[]
  values:     number[]
  horizontal?: boolean
  onBarClick?: (index: number) => void
  emptyText:  string
  testId:     string
}

function BarsCard({ title, labels, values, horizontal = false, onBarClick, emptyText, testId }: BarsProps) {
  return (
    <Card variant="panel" className="p-4" data-testid={testId}>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">{title}</div>
      {values.length === 0 || values.every(v => v === 0) ? (
        <div className="text-sm text-slate-400 text-center py-10">{emptyText}</div>
      ) : (
        <div style={{ height: horizontal ? Math.max(180, labels.length * 28 + 40) : 220 }}>
          <Chart
            type="bar"
            data={{ labels, datasets: [{ data: values, backgroundColor: BAR_COLOR, borderRadius: 4, minBarLength: 3 }] }}
            options={{
              indexAxis: horizontal ? 'y' : 'x',
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              onClick: (_e, elements) => { if (onBarClick && elements[0]) onBarClick(elements[0].index) },
              onHover: (e, elements) => {
                const target = e.native?.target as HTMLElement | undefined
                if (target && onBarClick) target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
              },
              scales: {
                x: { beginAtZero: true, grid: { display: horizontal }, ticks: { precision: 0, font: { size: 11 }, maxTicksLimit: horizontal ? 6 : 12 } },
                y: { beginAtZero: true, grid: { display: !horizontal }, ticks: { precision: 0, font: { size: 11 } } },
              },
            }}
          />
        </div>
      )}
    </Card>
  )
}

function StatCard({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <Card variant="panel" className="p-4" data-testid={testId}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{value}</div>
    </Card>
  )
}

export default function AuditActivityPage() {
  const { t, i18n } = useTranslation(['logs', 'common'])
  const navigate = useNavigate()

  const [to, setTo]     = useState(todayPanama)
  const [from, setFrom] = useState(() => shiftDays(todayPanama(), -6))

  const days = rangeDays(from, to)
  const rangeError = !from || !to || Number.isNaN(days)
    ? t('logs:activity.errors.invalid')
    : days < 1
      ? t('logs:activity.errors.inverted')
      : days > ACTIVITY_MAX_DAYS
        ? t('logs:activity.errors.tooLong', { max: ACTIVITY_MAX_DAYS })
        : null

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-activity-summary', from, to],
    queryFn:  () => auditActivityApi.summary(from, to),
    enabled:  rangeError === null,
    staleTime: 60_000,
  })

  const numberFmt = useMemo(() => new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : getRegion().locale), [i18n.language])
  const n = (v: number) => numberFmt.format(v)

  function applyPreset(daysBack: number) {
    const today = todayPanama()
    setTo(today)
    setFrom(shiftDays(today, -(daysBack - 1)))
  }

  function goToLogs(params: Record<string, string>) {
    navigate(`/auditoria/logs?${new URLSearchParams({ from, to, ...params }).toString()}`)
  }

  const moduleLabel = (m: string) => t(`logs:module.${m}`, { defaultValue: humanize(m) })
  const userLabel = (u: { user_id: number | null; name: string | null }) =>
    u.user_id === null ? t('logs:activity.system') : (u.name || `#${u.user_id}`)

  const serverError = isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined
  const empty = t('logs:activity.empty')

  return (
    <>
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('logs:activity.title')}</h1>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('logs:activity.subtitle')}</p>
      </div>

      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
        {PRESETS.map(p => (
          <Button
            key={p} variant="secondary" className="!py-1.5 !text-xs"
            active={!rangeError && days === p && to === todayPanama()}
            onClick={() => applyPreset(p)}
          >
            {t('logs:activity.presetDays', { count: p })}
          </Button>
        ))}
        <input
          type="date" value={from} max={to || undefined} aria-label={t('logs:activity.from')}
          onChange={e => setFrom(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[#5BA5A0]"
        />
        <span className="text-slate-400 text-sm">—</span>
        <input
          type="date" value={to} min={from || undefined} aria-label={t('logs:activity.to')}
          onChange={e => setTo(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[#5BA5A0]"
        />
        <span className="text-[11px] text-slate-400 ml-auto">{t('logs:activity.maxRange', { max: ACTIVITY_MAX_DAYS })}</span>
      </Card>

      {rangeError && <p role="alert" className="text-sm text-red-500 mb-3">{rangeError}</p>}
      {!rangeError && serverError && <p role="alert" className="text-sm text-red-500 mb-3">{serverError}</p>}
      {!rangeError && !serverError && error && <p role="alert" className="text-sm text-red-500 mb-3">{t('logs:activity.errors.load')}</p>}

      {!rangeError && isLoading && <div className="h-64 rounded-lg bg-slate-50 dark:bg-slate-900 animate-pulse" />}

      {!rangeError && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <StatCard testId="stat-interactions" label={t('logs:activity.stats.interactions')} value={n(data.totals.interactions)} />
            <StatCard testId="stat-users" label={t('logs:activity.stats.activeUsers')} value={n(data.totals.active_users)} />
            <StatCard testId="stat-changes" label={t('logs:activity.stats.dataChanges')} value={`${data.totals.data_changes_pct}%`} />
            <StatCard testId="stat-denied" label={t('logs:activity.stats.accessDenied')} value={n(data.totals.access_denied)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <BarsCard
              testId="chart-by-user" horizontal emptyText={empty} title={t('logs:activity.charts.byUser')}
              labels={data.by_user.map(userLabel)} values={data.by_user.map(u => u.count)}
              onBarClick={i => { const u = data.by_user[i]; if (u?.user_id != null) goToLogs({ user_id: String(u.user_id) }) }}
            />
            <BarsCard
              testId="chart-by-type" horizontal emptyText={empty} title={t('logs:activity.charts.byType')}
              labels={ACTIVITY_TYPES.map(k => t(`logs:activity.types.${k}`))} values={ACTIVITY_TYPES.map(k => data.by_type[k])}
            />
            <BarsCard
              testId="chart-by-module" horizontal emptyText={empty} title={t('logs:activity.charts.byModule')}
              labels={data.by_module.map(m => moduleLabel(m.module))} values={data.by_module.map(m => m.count)}
              onBarClick={i => { const m = data.by_module[i]; if (m) goToLogs({ module: m.module }) }}
            />
            <BarsCard
              testId="chart-by-day" emptyText={empty} title={t('logs:activity.charts.byDay')}
              labels={data.by_day.map(d => d.date.slice(5))} values={data.by_day.map(d => d.count)}
              onBarClick={i => { const d = data.by_day[i]; if (d) navigate(`/auditoria/logs?${new URLSearchParams({ from: d.date, to: d.date }).toString()}`) }}
            />
          </div>

          <p className="text-[11px] text-slate-400">{t('logs:activity.note')}</p>
        </>
      )}
    </>
  )
}
