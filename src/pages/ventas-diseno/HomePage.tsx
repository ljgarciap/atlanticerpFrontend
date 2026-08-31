import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { PIPELINE_STAGES } from '@/types/ventasDiseno'
import type { Pendiente, FinalStageItem } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClock, IcoEye, IcoClose } from '@/components/icons'
import CalendarModal from '@/components/CalendarModal'
import MiniCalendarCard from '@/components/MiniCalendarCard'
import HomeItemDetailModal from '@/components/HomeItemDetailModal'
import { rangeForPill, type CalendarPill } from '@/lib/dateGrid'

type PipelineChip = 'all' | 'final_stage' | 'stagnant'

export default function VentasDisenoHomePage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canSeeTeam = user?.role === 'management' || user?.role === 'superadmin'

  const [scope, setScope] = useState<'own' | 'team'>('own')
  const [vendorId, setVendorId] = useState<number | ''>('')
  const [calendarPill, setCalendarPill] = useState<CalendarPill>('day')
  const [showCalendar, setShowCalendar] = useState(false)
  const [calendarInitialDate, setCalendarInitialDate] = useState<Date | undefined>(undefined)
  const [pipelineChip, setPipelineChip] = useState<PipelineChip>('all')
  const [pendienteDetail, setPendienteDetail] = useState<Pendiente | null>(null)
  // SCRUM-67 (hallazgo QA Gerencia Test, 2026-07-20) — el mock (openPendientesModal) abre un
  // listado completo antes del drill-down al detalle; acá el "+N más" no tenía ningún onClick.
  const [showPendientesList, setShowPendientesList] = useState(false)
  const [finalStageDetail, setFinalStageDetail] = useState<FinalStageItem | null>(null)

  const ownerId = scope === 'team' && vendorId !== '' ? vendorId : undefined

  const { data: vendors } = useQuery({
    queryKey: ['ventas-diseno-home-vendors'],
    queryFn: () => ventasDisenoApi.home.vendors(),
    enabled: canSeeTeam,
  })

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['ventas-diseno-home-summary', scope, ownerId],
    queryFn: () => ventasDisenoApi.home.summary({ scope, owner_id: ownerId }),
  })

  const calendarRange = rangeForPill(calendarPill)
  const { data: calendarData } = useQuery({
    queryKey: ['ventas-diseno-home-calendar-preview', scope, ownerId, calendarPill],
    queryFn: () => ventasDisenoApi.calendar.list({ scope, owner_id: ownerId, ...calendarRange }),
  })
  const calendarEvents = calendarData?.data

  const { data: pipelineCards } = useQuery({
    queryKey: ['ventas-diseno-home-pipeline', scope, ownerId],
    queryFn: () => ventasDisenoApi.pipeline.list({ scope, owner_id: ownerId }),
  })

  const stageCounts = useMemo(() => {
    const cards = pipelineCards ?? []
    return PIPELINE_STAGES.map(stage => {
      const inStage = cards.filter(c => c.stage === stage.id)
      const visible = pipelineChip === 'final_stage'
        ? (stage.id === 'proposal' ? inStage : [])
        : pipelineChip === 'stagnant'
          ? inStage.filter(c => c.is_stagnant)
          : inStage
      return { stage, count: visible.length }
    })
  }, [pipelineCards, pipelineChip])

  const pendientes = summary?.pendientes ?? []
  const finalStage = summary?.final_stage ?? []
  const eventsToday = summary?.events_today_count ?? 0

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:nav.home')}
          </h1>
          {!loadingSummary && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              {t('ventasDiseno:home.subtitle', { events: eventsToday, pendientes: pendientes.length })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {/* SCRUM-741 — habilitado: mismo patrón ya vigente en ClientsPage/PipelinePage
              desde SCRUM-700 (el disabled de SCRUM-711 nunca se quitó acá). */}
          <Button variant="secondary" onClick={() => navigate('/ventas-diseno/catalog')}>
            {t('ventasDiseno:clients.actions.catalog')}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/ventas-diseno/quotes')}>
            {t('ventasDiseno:clients.actions.newQuote')}
          </Button>
        </div>
      </div>

      {canSeeTeam && (
        <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <Button
              variant="secondary" active={scope === 'own'} activeVariant="primary"
              className="!rounded-none !border-0" onClick={() => { setScope('own'); setVendorId('') }}
            >
              {t('ventasDiseno:scope.own')}
            </Button>
            <Button
              variant="secondary" active={scope === 'team'} activeVariant="primary"
              className="!rounded-none !border-0" onClick={() => setScope('team')}
            >
              {t('ventasDiseno:scope.team')}
            </Button>
          </div>
          {scope === 'team' && (
            <select
              value={vendorId}
              onChange={e => setVendorId(e.target.value === '' ? '' : Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[#5BA5A0]"
            >
              <option value="">{t('ventasDiseno:home.wholeTeam')}</option>
              {(vendors ?? []).map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Mi desempeño — REQ-057, datos reales (SalesTotalsService, mes en curso) */}
        <Card variant="panel" className="p-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">
            {t('ventasDiseno:home.performance.title')}
          </h3>
          {/* SCRUM-65 — sin meta configurada, el monto grande de abajo es el
              avance, no la meta; el label tiene que decirlo para no leerse
              ambiguo. */}
          <p className="text-[12px] text-slate-500 mb-1">
            {t(summary?.performance.goal_amount != null
              ? 'ventasDiseno:home.performance.goal'
              : 'ventasDiseno:home.performance.progress')}
          </p>
          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
            <div
              className="h-2 rounded-full bg-[#5BA5A0]"
              style={{ width: `${summary?.performance.progress_percent ?? 0}%` }}
            />
          </div>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
            ${(summary?.performance.current_amount ?? 0).toLocaleString()}
            {summary?.performance.goal_amount != null && (
              <span className="text-sm text-slate-400 font-normal"> / ${summary.performance.goal_amount.toLocaleString()}</span>
            )}
          </p>
          {summary?.performance.goal_amount == null && (
            <p className="text-[11px] text-slate-400 mt-1">{t('ventasDiseno:home.performance.noGoal')}</p>
          )}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div>
              <p className="text-[12px] text-slate-500 mb-0.5">{t('ventasDiseno:home.performance.commission')}</p>
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                ${(summary?.performance.commission_amount ?? 0).toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              title={t('ventasDiseno:home.performance.viewCommissions')}
              onClick={() => navigate('/ventas-diseno/reports#commissions')}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            >
              <IcoEye size={16} />
            </button>
          </div>
        </Card>

        {/* Mi calendario — REQ-058, lectura de Outlook real (SCRUM-66, 2026-07-21) */}
        <Card variant="panel" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {t('ventasDiseno:home.calendar.title')}
            </h3>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['day', 'week', 'month'] as CalendarPill[]).map(p => (
                <Button
                  key={p} variant="secondary" active={calendarPill === p} activeVariant="primary"
                  className="!rounded-none !border-0 !px-2 !py-1 !text-[11px]" onClick={() => setCalendarPill(p)}
                >
                  {t(`ventasDiseno:home.calendar.view.${p}`)}
                </Button>
              ))}
            </div>
          </div>
          <MiniCalendarCard
            view={calendarPill}
            events={calendarEvents ?? []}
            onSelectDay={day => { setCalendarInitialDate(day); setShowCalendar(true) }}
            showOwner={scope === 'team'}
          />
          <Button variant="secondary" onClick={() => { setCalendarInitialDate(undefined); setShowCalendar(true) }}>
            {t('ventasDiseno:home.calendar.viewFull')}
          </Button>
        </Card>

        {/* Pendientes — REQ-059, derivados de señales reales (sin entidad nueva) */}
        <Card variant="panel" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3
              className="text-sm font-bold text-slate-900 dark:text-slate-100 cursor-pointer hover:underline"
              onClick={() => pendientes.length > 0 && setShowPendientesList(true)}
            >
              {t('ventasDiseno:home.pendientes.title')}
            </h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {pendientes.length}
            </span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {pendientes.slice(0, 3).map((p, i) => (
              <li key={i}>
                <button
                  onClick={() => setPendienteDetail(p)}
                  className="w-full text-left text-[12px] px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 flex items-start gap-1.5"
                >
                  {p.priority === 'high' && <IcoClock size={13} className="text-amber-500 shrink-0 mt-0.5" />}
                  <span className="text-slate-600 dark:text-slate-300">
                    {t(`ventasDiseno:home.pendientes.text.${p.type}`, { client: p.client ?? p.project, days: p.days })}
                  </span>
                </button>
              </li>
            ))}
            {pendientes.length === 0 && (
              <li className="text-[12px] text-slate-400 px-2">{t('ventasDiseno:home.pendientes.empty')}</li>
            )}
            {pendientes.length > 3 && (
              <li>
                <button
                  onClick={() => setShowPendientesList(true)}
                  className="w-full text-left text-[11px] text-slate-400 hover:text-slate-600 hover:underline px-2 py-1"
                >
                  {t('ventasDiseno:home.pendientes.more', { count: pendientes.length - 3 })}
                </button>
              </li>
            )}
          </ul>
        </Card>

        {/* Final Stage — REQ-060. SCRUM-68: cn() concatena clases sin tailwind-merge, asi que
            el bg-white/border-slate-* del variant "panel" puede ganarle a este override segun
            el orden en que Tailwind haya emitido cada clase en el CSS final (no el orden en el
            className). El prefijo "!" fuerza !important para que este panel se distinga siempre. */}
        <Card variant="panel" className="p-4 !bg-red-50/50 dark:!bg-red-950/10 !border-red-100 dark:!border-red-900/30">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">
            {t('ventasDiseno:home.finalStage.title')}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {finalStage.slice(0, 4).map(item => (
              <li key={item.id}>
                <button
                  onClick={() => setFinalStageDetail(item)}
                  className="w-full text-left text-[12px] px-2 py-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200"
                >
                  <span className="font-semibold">{item.project_name}</span>
                  {item.client_name && <span className="text-slate-400"> · {item.client_name}</span>}
                </button>
              </li>
            ))}
            {finalStage.length === 0 && (
              <li className="text-[12px] text-slate-400 px-2">{t('ventasDiseno:home.finalStage.empty')}</li>
            )}
          </ul>
        </Card>

        {/* Pipeline de proyectos — REQ-061 */}
        <Card variant="panel" className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3
              className="text-sm font-bold text-slate-900 dark:text-slate-100 cursor-pointer hover:underline"
              onClick={() => navigate('/ventas-diseno/pipeline')}
            >
              {t('ventasDiseno:home.pipelineSummary.title')}
            </h3>
            <div className="flex gap-1.5">
              {(['all', 'final_stage', 'stagnant'] as PipelineChip[]).map(chip => (
                <button
                  key={chip}
                  onClick={() => setPipelineChip(chip)}
                  className={[
                    'text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors',
                    pipelineChip === chip
                      ? 'bg-[#5BA5A0] border-[#5BA5A0] text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  ].join(' ')}
                >
                  {t(`ventasDiseno:filters.${chip === 'all' ? 'all' : chip === 'final_stage' ? 'finalStage' : 'stagnant'}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {stageCounts.map(({ stage, count }) => (
              <button
                key={stage.id}
                onClick={() => navigate('/ventas-diseno/pipeline')}
                className="rounded-lg border border-slate-100 dark:border-slate-700 p-2 text-center hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <span className="block text-lg font-bold" style={{ color: stage.color }}>{count}</span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400">{t(`ventasDiseno:stages.${stage.id}`)}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {showCalendar && (
        <CalendarModal
          queryKeyPrefix="ventas-diseno-calendar"
          fetchEvents={range => ventasDisenoApi.calendar.list({ scope, owner_id: ownerId, ...range })}
          onClose={() => setShowCalendar(false)}
          initialDate={calendarInitialDate}
          initialView={calendarInitialDate ? calendarPill : 'month'}
          showOwner={scope === 'team'}
        />
      )}

      {/* SCRUM-67 — listado completo (mock: openPendientesModal), con drill-down al detalle de
          un pendiente puntual reusando el modal ya existente (mock: openPendienteDetail). */}
      {showPendientesList && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <Card variant="modal" className="w-full max-w-md my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {t('ventasDiseno:home.pendientes.listTitle')}
              </h2>
              <Button variant="icon" onClick={() => setShowPendientesList(false)}><IcoClose /></Button>
            </div>
            <ul className="overflow-y-auto px-2 py-2 flex-1">
              {pendientes.map((p, i) => (
                <li key={i}>
                  <button
                    onClick={() => { setShowPendientesList(false); setPendienteDetail(p) }}
                    className="w-full text-left text-[13px] px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 flex items-start gap-1.5"
                  >
                    {p.priority === 'high' && <IcoClock size={13} className="text-amber-500 shrink-0 mt-0.5" />}
                    <span className="text-slate-600 dark:text-slate-300">
                      {t(`ventasDiseno:home.pendientes.text.${p.type}`, { client: p.client ?? p.project, days: p.days })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
              <Button variant="secondary" onClick={() => setShowPendientesList(false)}>{t('common:actions.close')}</Button>
            </div>
          </Card>
        </div>
      )}

      {pendienteDetail && (
        <HomeItemDetailModal
          title={t('ventasDiseno:home.pendientes.detailTitle')}
          fields={[
            { label: t('ventasDiseno:clients.projectsModal.subClient'), value: pendienteDetail.client ?? '—' },
            { label: t('ventasDiseno:clients.projectsModal.project'), value: pendienteDetail.project },
            { label: t('ventasDiseno:home.pendientes.priority'), value: t(`ventasDiseno:home.pendientes.priorityLevel.${pendienteDetail.priority}`) },
            { label: t('ventasDiseno:modal.owner'), value: pendienteDetail.assignee },
            { label: t('ventasDiseno:home.pendientes.suggestion'), value: pendienteDetail.suggestion },
          ]}
          onClose={() => setPendienteDetail(null)}
          // SCRUM-796 (secc. 2) — botón "Ir": lleva directo al proyecto en Pipeline
          // (mismo deep-link `?card=<id>` que Final Stage/Lista de Proyectos/Pipeline).
          action={{
            label: t('ventasDiseno:home.pendientes.go'),
            onClick: () => navigate(`/ventas-diseno/pipeline?card=${pendienteDetail.card_id}`),
          }}
        />
      )}

      {finalStageDetail && (
        <HomeItemDetailModal
          title={finalStageDetail.project_name}
          fields={[
            { label: t('ventasDiseno:clients.projectsModal.subClient'), value: finalStageDetail.client_name ?? '—' },
            {
              label: t('ventasDiseno:home.finalStage.nextStepLabel'),
              value: t('ventasDiseno:home.finalStage.nextStep', { days: finalStageDetail.days_in_stage }),
            },
            {
              label: t('ventasDiseno:modal.amount'),
              value: finalStageDetail.amount != null ? `$${finalStageDetail.amount.toLocaleString()}` : '—',
            },
            { label: t('ventasDiseno:modal.observations'), value: finalStageDetail.notes ?? '—' },
          ]}
          onClose={() => setFinalStageDetail(null)}
          // SCRUM-765 — desde Final Stage, llevar directo al proyecto en Pipeline (mismo
          // deep-link `?card=<id>` que ya usan Lista de Proyectos y el propio Pipeline).
          action={{
            label: t('common:actions.view'),
            onClick: () => navigate(`/ventas-diseno/pipeline?card=${finalStageDetail.id}`),
          }}
        />
      )}
    </>
  )
}
