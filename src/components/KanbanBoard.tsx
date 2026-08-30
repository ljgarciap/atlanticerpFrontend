import { useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { useTranslation } from 'react-i18next'
import type { Project } from '@/types/project'
import { STAGES } from '@/types/project'
import ProjectCard from './ProjectCard'

interface Props {
  projects:      Project[]
  onCardClick:   (p: Project) => void
  onStageChange: (projectId: number, etapa: string) => void
}

export default function KanbanBoard({ projects, onCardClick, onStageChange }: Props) {
  const { t } = useTranslation(['crm'])

  const [selectedStage, setSelectedStage] = useState<string>(() => {
    return STAGES.find(s => projects.some(p => p.etapa === s.id))?.id ?? 'lead'
  })

  function handleDragEnd(result: DropResult) {
    const { draggableId, destination } = result
    if (!destination) return

    const newEtapa = destination.droppableId
    const project  = projects.find(p => String(p.id) === draggableId)

    if (!project || project.etapa === newEtapa) return

    onStageChange(project.id, newEtapa)
  }

  const activeStage      = STAGES.find(s => s.id === selectedStage)
  const mobileProjects   = projects.filter(p => p.etapa === selectedStage)

  return (
    <>
      {/* ── Desktop: Kanban con drag-and-drop (>= lg) ── */}
      <div className="hidden lg:block" data-testid="kanban-desktop">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div
            className="grid gap-3 overflow-x-auto pb-2"
            style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px, 1fr))` }}
          >
            {STAGES.map(stage => {
              const cols = projects.filter(p => p.etapa === stage.id)
              return (
                <div key={stage.id} className="bg-slate-100 rounded-xl p-2.5 min-h-[200px] flex flex-col">
                  {/* Column header */}
                  <div className="flex justify-between items-center pb-2.5 mb-2.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: stage.color }} />
                      <span className="text-xs font-medium" style={{ color: stage.color }}>
                        {t(`crm:stages.${stage.id}`)}
                      </span>
                    </div>
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full bg-white"
                      style={{ color: stage.color }}
                    >
                      {cols.length}
                    </span>
                  </div>

                  {/* Droppable column */}
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 rounded-lg transition-colors ${
                          snapshot.isDraggingOver ? 'bg-slate-200 dark:bg-slate-700' : ''
                        }`}
                      >
                        {cols.length === 0 && !snapshot.isDraggingOver && (
                          <p className="text-center text-[12px] text-slate-400 py-8">{t('crm:kanban.empty')}</p>
                        )}

                        {cols.map((p, index) => (
                          <Draggable key={p.id} draggableId={String(p.id)} index={index}>
                            {(drag, dragSnapshot) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                {...drag.dragHandleProps}
                                style={{
                                  ...drag.draggableProps.style,
                                  opacity: dragSnapshot.isDragging ? 0.85 : 1,
                                }}
                              >
                                <ProjectCard project={p} onClick={onCardClick} />
                              </div>
                            )}
                          </Draggable>
                        ))}

                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      </div>

      {/* ── Móvil: vista lista por etapa (< lg) ── */}
      <div className="lg:hidden flex flex-col gap-3" data-testid="kanban-mobile">
        {/* Pills de selección de etapa */}
        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-2 pb-1" style={{ width: 'max-content' }}>
            {STAGES.map(stage => {
              const count    = projects.filter(p => p.etapa === stage.id).length
              const isActive = selectedStage === stage.id
              return (
                <button
                  key={stage.id}
                  onClick={() => setSelectedStage(stage.id)}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold text-[13px] transition-colors"
                  style={{
                    paddingBlock:   '0.5rem',   /* py-2 ≈ 8px, táctil >= 36px total */
                    paddingInline:  '0.75rem',  /* px-3 */
                    backgroundColor: isActive ? stage.color : 'white',
                    borderColor:     stage.color,
                    color:           isActive ? 'white' : '#475569', /* slate-600 */
                  }}
                >
                  <span>{t(`crm:stages.${stage.id}`)}</span>
                  <span
                    className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : stage.color + '1a',
                      color:           isActive ? 'white' : stage.color,
                    }}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Lista de proyectos de la etapa seleccionada */}
        <div className="flex flex-col gap-2">
          {mobileProjects.length === 0 ? (
            <div
              className="rounded-xl bg-slate-100 flex items-center justify-center py-12"
              style={{ borderTop: `3px solid ${activeStage?.color ?? '#64748b'}` }}
            >
              <p className="text-[13px] text-slate-400">{t('crm:kanban.empty')}</p>
            </div>
          ) : (
            mobileProjects.map(p => (
              <ProjectCard key={p.id} project={p} onClick={onCardClick} />
            ))
          )}
        </div>
      </div>
    </>
  )
}
