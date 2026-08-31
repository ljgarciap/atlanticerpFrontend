import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { PIPELINE_STAGES } from '@/types/ventasDiseno'
import type { PipelineCard, PipelineStage } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClock } from '@/components/icons'
import PipelineCardModal from '@/components/PipelineCardModal'
import NewProjectModal from '@/components/NewProjectModal'

type Chip = 'all' | 'final_stage' | 'stagnant' | 'approved'

export default function VentasDisenoPipelinePage() {
  const { t }     = useTranslation(['common', 'ventasDiseno', 'crm'])
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const canSeeTeam = user?.role === 'management' || user?.role === 'superadmin'

  // REQ-022/065: "Ver proyectos" en Clientes navega a Pipeline con la tarjeta
  // resaltada vía ?card={id} — se abre el mismo modal de detalle que un click en el
  // tablero, forzando alcance "Equipo" (si el usuario puede verlo) para que la tarjeta
  // pueda venir de cualquier vendedor, no solo del propio.
  const [params, setParams] = useSearchParams()
  const [initialCardParam] = useState<number | null>(() => {
    const raw = params.get('card')
    return raw ? Number(raw) : null
  })

  // REQ-074 (Reportes — Mejores clientes): "Ver" navega acá con ?stage=approved,
  // ?order=value y ?scope= — se mantiene tal cual (chip='approved', mismo filtro que
  // siempre). SCRUM-166 (Gerencia "En Final Stage"/"Estancados") — ?stage=proposal y
  // ?stage=stagnant mapean a chip='final_stage'/'stagnant', también existentes.
  // SCRUM-796 (secc. 1.1/1.2) agrega un filtro NUEVO e independiente, `stage`, solo
  // para los otros 4 stages que no tienen chip dedicado (lead/design/quote/lost) — el
  // mismo query param de URL (?stage=) puede caer en cualquiera de los mecanismos
  // según el valor.
  const stageParam = params.get('stage')
  const isOtherStageParam = (v: string | null): v is PipelineStage =>
    v !== 'approved' && v !== 'proposal' && v !== 'stagnant' && PIPELINE_STAGES.some(s => s.id === v)

  const [scope,  setScope]  = useState<'own' | 'team'>(() => {
    if (!canSeeTeam) return 'own'
    if (params.get('scope') === 'team') return 'team'
    if (params.get('scope') === 'own') return 'own'
    return initialCardParam !== null || stageParam === 'approved' || stageParam === 'proposal' || stageParam === 'stagnant' || isOtherStageParam(stageParam) ? 'team' : 'own'
  })
  const [chip,  setChip]  = useState<Chip>(() => {
    if (stageParam === 'approved') return 'approved'
    if (stageParam === 'proposal') return 'final_stage'
    if (stageParam === 'stagnant') return 'stagnant'
    return 'all'
  })
  const [stage, setStage] = useState<PipelineStage | null>(() => (isOtherStageParam(stageParam) ? stageParam : null))
  // SCRUM-796 (secc. 1.3) — filtro por etiqueta de tipo de solicitud, llega desde la
  // gráfica "Por tipo de solicitud" del Dashboard CRM como ?tag=design|quote|both — un
  // único valor (SalesProject.tag es un enum de 3, 'both' ya ES "Diseño + Cotización",
  // no se combina mandando dos tags a la vez).
  const [tag, setTag] = useState<string | null>(() => params.get('tag'))
  const [search, setSearch] = useState('')
  const [order,  setOrder]  = useState<'days' | 'value'>(() => (params.get('order') === 'value' ? 'value' : 'days'))
  const [openCardId, setOpenCardId] = useState<number | null>(initialCardParam)
  // REQ-608 (Batch C, Dashboard CRM): "+ Nuevo Proyecto" del Dashboard navega acá con
  // ?openNewProject=1 y abre este mismo modal automáticamente, sin un segundo clic.
  const [showNewProject, setShowNewProject] = useState(() => params.get('openNewProject') === '1')

  const { data: cards, isLoading } = useQuery({
    queryKey: ['ventas-diseno-pipeline', scope, chip, stage, tag, search, order],
    queryFn:  () => ventasDisenoApi.pipeline.list({
      scope, chip, stage: stage ?? undefined, tag: tag ?? undefined, search: search || undefined, order,
    }),
  })

  const allCards = cards ?? []
  // SCRUM-72 criterio 1 — el chip "Final Stage" muestra solo la columna
  // Propuesta, no las 6 columnas con la mayoria vacia. SCRUM-91 (REQ-022/074) — llegar
  // desde "Mejores clientes" en Reportes (?stage=approved) tiene el mismo problema.
  // SCRUM-796 (secc. 1.1/1.2) — `stage` (los otros 5 stages) restringe la misma forma.
  const visibleStages = PIPELINE_STAGES.filter(s => {
    if (chip === 'final_stage') return s.id === 'proposal'
    if (chip === 'approved') return s.id === 'approved'
    if (stage) return s.id === stage
    return true
  })

  const CHIP_OPTS: { value: Chip; label: string }[] = [
    { value: 'all',         label: t('ventasDiseno:filters.all') },
    { value: 'final_stage', label: t('ventasDiseno:filters.finalStage') },
    { value: 'stagnant',    label: t('ventasDiseno:filters.stagnant') },
  ]

  const selectClass = 'border border-slate-200 rounded-lg px-2 py-2 md:py-1.5 text-sm md:text-[12px] bg-white focus:outline-none focus:border-[#5BA5A0]'

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          {t('ventasDiseno:nav.pipeline')}
        </h1>
        {/* REQ-023: accesos rápidos superiores */}
        <div className="flex gap-2 flex-wrap">
          {/* SCRUM-700 (REQ-620, Batch E) — habilitado: el módulo Catálogo ya existe (SCRUM-711
              lo dejaba visual-only "hasta que se desarrolle el módulo CRM"). */}
          <Button variant="secondary" onClick={() => navigate('/ventas-diseno/catalog')}>
            {t('ventasDiseno:kanban.actions.catalog')}
          </Button>
          <Button variant="secondary" onClick={() => setShowNewProject(true)}>
            {t('ventasDiseno:kanban.actions.newProject')}
          </Button>
          <Button variant="secondary" onClick={() => navigate('/ventas-diseno/quotes')}>
            {t('ventasDiseno:kanban.actions.newQuote')}
          </Button>
          {/* REQ-342 — Status de pedidos es una pantalla compartida con Bodega (Batch A4,
              SCRUM-407→413): mismo destino, el backend ya filtra a "solo lo propio" para
              este perfil. */}
          <Button variant="secondary" onClick={() => navigate('/bodega/pedidos/status')}>
            {t('ventasDiseno:kanban.actions.orderStatus')}
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder={t('common:actions.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 md:py-1.5 text-base md:text-[13px] w-full sm:min-w-[220px] sm:flex-1 focus:outline-none focus:border-[#5BA5A0]"
        />

        {/* Alcance — solo Gerencia puede ver "Equipo" (REQ-002) */}
        {canSeeTeam && (
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <Button
              variant="secondary"
              active={scope === 'own'}
              activeVariant="primary"
              className="!rounded-none !border-0"
              onClick={() => setScope('own')}
            >
              {t('ventasDiseno:scope.own')}
            </Button>
            <Button
              variant="secondary"
              active={scope === 'team'}
              activeVariant="primary"
              className="!rounded-none !border-0"
              onClick={() => setScope('team')}
            >
              {t('ventasDiseno:scope.team')}
            </Button>
          </div>
        )}

        {/* Chips rápidos — elegir cualquiera limpia el filtro puntual de stage/tag que
            haya llegado por deep-link (SCRUM-796), para que "Todos" saque de verdad
            del filtro heredado del Dashboard CRM. */}
        {CHIP_OPTS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { setChip(opt.value); setStage(null); setTag(null) }}
            className={[
              'text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors',
              chip === opt.value && !stage && !tag
                ? 'bg-[#5BA5A0] border-[#5BA5A0] text-white'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}

        <select value={order} onChange={e => setOrder(e.target.value as 'days' | 'value')} className={selectClass}>
          <option value="days">{t('ventasDiseno:filters.orderByDays')}</option>
          <option value="value">{t('ventasDiseno:filters.orderByValue')}</option>
        </select>

        {/* SCRUM-796 (secc. 1.1/1.2) — filtro de stage llegado desde el Dashboard CRM
            (indicadores/gráfica "Proyectos por etapa"), removible como cualquier filtro. */}
        {stage && (
          <span className="text-[12px] font-semibold px-3 py-1.5 rounded-full bg-[#E3F0EE] text-primary-dark flex items-center gap-1.5">
            {t(`ventasDiseno:stages.${stage}`)}
            <button type="button" onClick={() => setStage(null)} className="hover:opacity-70" aria-label={t('common:actions.clear')}>
              ×
            </button>
          </span>
        )}

        {/* SCRUM-796 (secc. 1.3) — filtro por etiqueta llegado desde el Dashboard CRM
            ("Por tipo de solicitud"), visible y removible como cualquier otro filtro activo. */}
        {tag && (
          <span className="text-[12px] font-semibold px-3 py-1.5 rounded-full bg-[#E3F0EE] text-primary-dark flex items-center gap-1.5">
            {t(`crm:dashboard.tagLabels.${tag}`)}
            <button type="button" onClick={() => setTag(null)} className="hover:opacity-70" aria-label={t('common:actions.clear')}>
              ×
            </button>
          </span>
        )}
      </Card>

      {/* Kanban de solo lectura — creación/edición de tarjetas llega en un grupo posterior */}
      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6 pb-2">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${visibleStages.length}, minmax(220px, 1fr))` }}
          >
            {visibleStages.map(stage => {
              const stageCards = allCards.filter(c => c.stage === stage.id)
              const totalValue = stageCards.reduce((sum, c) => sum + (c.amount ?? 0), 0)

              return (
                <div key={stage.id} className="bg-slate-100 dark:bg-slate-900 rounded-xl p-2.5 min-h-[200px] flex flex-col">
                  <div className="flex justify-between items-center pb-2.5 mb-2.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: stage.color }} />
                      <span className="text-xs font-medium" style={{ color: stage.color }}>
                        {t(`ventasDiseno:stages.${stage.id}`)}
                      </span>
                    </div>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white dark:bg-slate-800" style={{ color: stage.color }}>
                      {stageCards.length}
                    </span>
                  </div>

                  {totalValue > 0 && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1.5 mb-2">
                      ${totalValue.toLocaleString()}
                    </p>
                  )}

                  {stageCards.length === 0 ? (
                    <p className="text-center text-[12px] text-slate-400 py-8">
                      {/* SCRUM-72 criterio 2 — el chip "Estancados" pide el texto
                          especifico "Sin proyectos estancados", no el generico. */}
                      {t(chip === 'stagnant' ? 'ventasDiseno:kanban.emptyStagnant' : 'ventasDiseno:kanban.empty')}
                    </p>
                  ) : (
                    stageCards.map(c => (
                      <PipelineCardTile
                        key={c.id}
                        card={c}
                        highlighted={c.id === initialCardParam}
                        onClick={() => setOpenCardId(c.id)}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {openCardId !== null && (
        <PipelineCardModal
          cardId={openCardId}
          onClose={() => {
            setOpenCardId(null)
            if (params.has('card')) {
              params.delete('card')
              setParams(params, { replace: true })
            }
          }}
        />
      )}

      {showNewProject && (
        <NewProjectModal
          onClose={() => {
            setShowNewProject(false)
            if (params.has('openNewProject')) {
              params.delete('openNewProject')
              setParams(params, { replace: true })
            }
          }}
          onCreated={card => {
            setShowNewProject(false)
            if (params.has('openNewProject')) {
              params.delete('openNewProject')
              setParams(params, { replace: true })
            }
            setOpenCardId(card.id)
          }}
        />
      )}
    </>
  )
}

function PipelineCardTile({ card, highlighted, onClick }: { card: PipelineCard; highlighted: boolean; onClick: () => void }) {
  const { t } = useTranslation('ventasDiseno')

  return (
    <div
      onClick={onClick}
      className={[
        'bg-white dark:bg-slate-800 rounded-xl p-3.5 mb-2 cursor-pointer transition-all hover:shadow-md hover:-translate-y-px select-none',
        highlighted ? 'ring-2 ring-[#5BA5A0]' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-1.5 mb-0.5">
        <div className="flex items-start gap-1.5 min-w-0">
          {card.is_stagnant && (
            <span
              className="text-amber-500 shrink-0 mt-0.5"
              title={t('kanban.stagnantTooltip', { days: card.days_in_stage })}
            >
              <IcoClock size={13} />
            </span>
          )}
          <p className="font-medium text-[13px] text-slate-900 dark:text-slate-100 leading-tight">
            {card.sales_project.name}
          </p>
        </div>
        {/* SCRUM-75 — hallazgo de Gerencia Test en validación (2026-07-21): la etiqueta
            (Diseño/Cotización/Ambos) se guardaba y persistía bien, pero nunca se pintaba en la
            tarjeta del tablero — solo estaba dentro del modal de edición. */}
        {card.sales_project.tag && (
          <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E3F0EE] text-[#3D7E7A] dark:bg-slate-900 dark:text-[#5BA5A0]">
            {t(`tag.${card.sales_project.tag}`)}
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          {card.master_client?.name ?? '—'}
        </span>
        {card.sub_client && <span className="text-slate-400"> · {card.sub_client.business_name}</span>}
      </p>

      <div className="flex justify-between items-center pt-2 border-t border-slate-50 dark:border-slate-700">
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{card.owner.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-400">{card.days_in_stage}d</span>
          {card.amount != null && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              ${Number(card.amount).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
