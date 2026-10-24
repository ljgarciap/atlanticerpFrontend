import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { PIPELINE_STAGES } from '@/types/ventasDiseno'
import type { PipelineCard, PipelineStage } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClock } from '@/components/icons'
import PipelineCardModal from '@/components/PipelineCardModal'
import NewProjectModal from '@/components/NewProjectModal'
import { UserMultiSelect } from '@/components/UserMultiSelect'
import { hasGerenciaScope } from '@/lib/gerenciaScope'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'

type Chip = 'all' | 'final_stage' | 'stagnant' | 'approved'

export default function VentasDisenoPipelinePage() {
  const { t }     = useTranslation(['common', 'ventasDiseno', 'crm'])
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const canSeeTeam = hasGerenciaScope(user)
  // SCRUM-1128 — Contabilidad (`ventas_diseno.pipeline.read_all`) ve el Pipeline de TODO el equipo en solo
  // lectura, pero no es Gerencia: sin esto el listado salía con scope='own' y le llegaba vacío (el
  // backend solo da alcance de equipo con scope='team'). `canSeeTeam` se mantiene para lo que exige
  // `ventas_diseno.read` (selector de dueños, /home/vendors): Contabilidad no lo tiene y recibiría 403.
  const readsAllPipeline = user?.permissions?.includes('ventas_diseno.pipeline.read_all') ?? false
  const canViewTeamScope = canSeeTeam || readsAllPipeline
  // SCRUM-1128 — Contabilidad entra al Pipeline en solo lectura (más la acción "Pasar a Pedido" dentro del
  // detalle de un proyecto aprobado). Sin permiso de edición del módulo se ocultan las acciones de
  // escritura del tablero; el backend las rechaza igual (403). Sin permiso real de escritura => solo lectura.
  // Sin el claim de módulo (Contabilidad no tiene `modules.ventas_diseno`) NO se asume edición: se exige permiso real de escritura.
  // SCRUM-1139 — `ventas_diseno.pipeline.edit` (Contabilidad) habilita la edición del tablero SOLO en el Pipeline: es el
  // permiso angosto gemelo de `pipeline.read_all`, no abre ninguna otra pantalla del módulo.
  const canEditModule = user?.modules?.ventas_diseno?.edit === true || (user?.permissions?.includes('ventas_diseno.write') ?? false)
  const hasPipelineEdit = user?.permissions?.includes('ventas_diseno.pipeline.edit') ?? false
  const canEditPipeline = canEditModule || hasPipelineEdit
  // Con solo `pipeline.edit` (sin edición del módulo) no se ofrece "Nueva cotización": llevaría a Cotizaciones, que esa persona no abre.
  const canCreateQuoteFromPipeline = canEditModule
  // El Catálogo exige `ventas_diseno.read`: quien solo tiene los permisos angostos del Pipeline (`read_all`/`pipeline.edit`, Contabilidad) no lo abre
  // (la ruta lo redirige), así que el botón sería un enlace muerto. Se oculta solo para ese perfil; el resto lo ve igual que antes.
  const perms = user?.permissions ?? []
  const pipelineOnlyAccess = (readsAllPipeline || hasPipelineEdit) && !perms.includes('ventas_diseno.read') && !perms.includes('superadmin.all')
  const qc = useQueryClient()
  const toast = useToastStore(s => s.show)

  // SCRUM-849.1 — mover una tarjeta arrastrándola entre columnas, reusando el mismo
  // endpoint/gate que ya usa el botón "Mover a..." del modal de detalle
  // (PipelineCardModal): ninguna validación de negocio se resuelve acá, solo se muestra
  // el mensaje que el backend ya devuelve si la transición no es válida.
  const [draggedCardId, setDraggedCardId] = useState<number | null>(null)
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null)
  const dropMutation = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: PipelineStage }) => ventasDisenoApi.pipeline.changeStage(id, stage),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ventas-diseno-pipeline'] }),
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      toast(message ?? t('ventasDiseno:modal.stageChangeError'), 'error')
    },
  })
  function handleDrop(targetStage: PipelineStage) {
    const cardId = draggedCardId
    setDraggedCardId(null)
    if (cardId === null) return
    const card = allCards.find(c => c.id === cardId)
    if (card && card.stage !== targetStage) {
      dropMutation.mutate({ id: cardId, stage: targetStage })
    }
  }

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
    if (!canViewTeamScope) return 'own'
    if (!canSeeTeam) return 'team'
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
  // SCRUM-1128 — filtro "Pedidos": clasifica por el estado real del paso a pedido, no por `stage`.
  const [orders, setOrders] = useState<'approved' | 'pending' | ''>('')
  const [search, setSearch] = useState('')
  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).
  const searchTerm = useDebouncedSearchTerm(search)
  // SCRUM-854 — multi-selección Vendedor/Diseñador, solo relevante en scope='team'. Sin
  // selección = todo el equipo (mismo criterio que `WarehouseMultiSelect`/`UserMultiSelect`).
  const [ownerIds, setOwnerIds] = useState<number[]>([])
  const { data: teamVendors } = useQuery({
    queryKey: ['ventas-diseno-home-vendors'],
    queryFn:  () => ventasDisenoApi.home.vendors(),
    enabled:  canSeeTeam,
  })
  const [order,  setOrder]  = useState<'days' | 'value'>(() => (params.get('order') === 'value' ? 'value' : 'days'))
  const [openCardId, setOpenCardId] = useState<number | null>(initialCardParam)
  // REQ-608 (Batch C, Dashboard CRM): "+ Nuevo Proyecto" del Dashboard navega acá con
  // ?openNewProject=1 y abre este mismo modal automáticamente, sin un segundo clic.
  const [showNewProject, setShowNewProject] = useState(() => params.get('openNewProject') === '1')

  const { data: cards, isLoading } = useQuery({
    queryKey: ['ventas-diseno-pipeline', scope, chip, stage, tag, searchTerm, order, ownerIds, orders],
    queryFn:  () => ventasDisenoApi.pipeline.list({
      scope, chip, stage: stage ?? undefined, tag: tag ?? undefined, search: searchTerm || undefined, order,
      orders: orders || undefined,
      owner_ids: scope === 'team' && ownerIds.length > 0 ? ownerIds : undefined,
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
    if (orders) return s.id === 'approved'
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
          {!pipelineOnlyAccess && (
            <Button variant="secondary" onClick={() => navigate('/ventas-diseno/catalog')}>
              {t('ventasDiseno:kanban.actions.catalog')}
            </Button>
          )}
          {canEditPipeline && (
            <Button variant="secondary" onClick={() => setShowNewProject(true)}>
              {t('ventasDiseno:kanban.actions.newProject')}
            </Button>
          )}
          {canCreateQuoteFromPipeline && (
            <Button variant="secondary" onClick={() => navigate('/ventas-diseno/quotes')}>
              {t('ventasDiseno:kanban.actions.newQuote')}
            </Button>
          )}
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

        {/* Alcance — solo Gerencia puede ver "Equipo" (REQ-002); Contabilidad queda fijo en Equipo, sin toggle */}
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

        {/* SCRUM-854 — solo visible en alcance "Equipo", igual que el selector viejo de Inicio. */}
        {canSeeTeam && scope === 'team' && (
          <UserMultiSelect users={teamVendors ?? []} selectedIds={ownerIds} onChange={setOwnerIds} />
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

        <select
          value={orders}
          onChange={e => setOrders(e.target.value as 'approved' | 'pending' | '')}
          className={selectClass}
          aria-label={t('ventasDiseno:filters.orders')}
          data-testid="pipeline-orders-filter"
        >
          <option value="">{t('ventasDiseno:filters.ordersAll')}</option>
          <option value="approved">{t('ventasDiseno:filters.ordersApproved')}</option>
          <option value="pending">{t('ventasDiseno:filters.ordersPending')}</option>
        </select>

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

              const isLost = stage.id === 'lost'
              const isDropTarget = dragOverStage === stage.id

              return (
                <div
                  key={stage.id}
                  data-testid={`pipeline-stage-${stage.id}`}
                  onDragOver={e => { e.preventDefault(); if (draggedCardId !== null) setDragOverStage(stage.id) }}
                  onDragLeave={() => setDragOverStage(cur => (cur === stage.id ? null : cur))}
                  onDrop={e => { e.preventDefault(); setDragOverStage(null); handleDrop(stage.id) }}
                  className={[
                    isLost
                      // SCRUM-849.2 — diferenciar PERDIDO del flujo normal: borde rojo fuerte +
                      // fondo rojo claro tenue (mismo tono que Ventas y Diseño → Inicio → Final
                      // Stage), nunca gris.
                      ? 'bg-red-50/50 dark:bg-red-950/10 border-2 border-red-400 dark:border-red-800'
                      : 'bg-slate-100 dark:bg-slate-900',
                    'rounded-xl p-2.5 min-h-[200px] flex flex-col transition-colors',
                    // SCRUM-849.1 — resalte de la columna mientras se arrastra una tarjeta encima.
                    isDropTarget ? 'ring-2 ring-[#5BA5A0]' : '',
                  ].join(' ')}
                >
                  <div className="flex justify-between items-center pb-2.5 mb-2.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: stage.color }} />
                      <span
                        className={isLost ? 'text-xs font-bold uppercase' : 'text-xs font-medium'}
                        style={{ color: stage.color }}
                      >
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
                        draggable={canEditPipeline}
                        onDragStart={() => setDraggedCardId(c.id)}
                        onDragEnd={() => { setDraggedCardId(null); setDragOverStage(null) }}
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

function PipelineCardTile({ card, highlighted, draggable, onClick, onDragStart, onDragEnd }: {
  card: PipelineCard
  highlighted: boolean
  draggable: boolean
  onClick: () => void
  // SCRUM-849.1 — mover directo desde el tablero; el padre resuelve el drop real
  // contra el endpoint de cambio de etapa (mismas validaciones de siempre).
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const { t } = useTranslation('ventasDiseno')

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      data-testid={`pipeline-card-${card.id}`}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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
