import { useTranslation } from 'react-i18next'
import type { KpiData } from '@/types/project'
import { STAGES } from '@/types/project'

interface Props { kpis: KpiData }

export default function KpiGrid({ kpis }: Props) {
  const { t } = useTranslation(['crm'])
  const stageKpis = STAGES.map(s => ({
    label: t(`crm:stages.${s.id}`),
    value: kpis.counts_by_stage[s.id] ?? 0,
    color: s.color,
  }))

  const extra = [
    { label: t('crm:dashboard.activePipeline'),  value: `$${(kpis.pipeline_activo  ?? 0).toLocaleString()}`, color: '#5BA5A0', sub: t('crm:dashboard.activePipelineSub') },
    { label: t('crm:dashboard.closed'),          value: `$${(kpis.pipeline_cerrado ?? 0).toLocaleString()}`, color: '#16a34a', sub: t('crm:dashboard.closedSub') },
  ]

  return (
    <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {[...stageKpis, ...extra].map(k => (
        <div key={k.label} className="rounded-2xl p-4 relative overflow-hidden" style={{ background: `${k.color}18` }}>
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">{k.label}</div>
          <div className="text-2xl font-bold leading-none" style={{ color: k.color }}>{k.value}</div>
          {'sub' in k && <div className="text-[11px] text-slate-400 mt-1">{(k as { sub: string }).sub}</div>}
        </div>
      ))}
    </div>
  )
}
