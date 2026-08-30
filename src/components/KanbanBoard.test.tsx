import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Project } from '@/types/project'
import { STAGES } from '@/types/project'
import KanbanBoard from './KanbanBoard'

// ── Mock react-i18next ────────────────────────────────────────────────────
const STAGE_LABELS_ES: Record<string, string> = {
  lead: 'Lead', diseno: 'En Diseño', cotizacion: 'En Cotización',
  propuesta: 'Propuesta Enviada', cerrado: 'Cerrado', perdido: 'Perdido',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = { 'crm:kanban.empty': 'Sin proyectos' }
      if (key in map) return map[key]
      const stageId = key.startsWith('crm:stages.') ? key.replace('crm:stages.', '') : null
      if (stageId && stageId in STAGE_LABELS_ES) return STAGE_LABELS_ES[stageId]
      return key
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// ── Mock @hello-pangea/dnd ─────────────────────────────────────────────────
// jsdom doesn't support pointer events required by DnD — we mock the library
// to render children directly, which lets us test rendering and callback logic.

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Droppable: ({
    children,
    droppableId,
  }: {
    children: (provided: object, snapshot: object) => React.ReactNode
    droppableId: string
  }) =>
    children(
      { innerRef: vi.fn(), droppableProps: { 'data-droppable-id': droppableId }, placeholder: null },
      { isDraggingOver: false },
    ),
  Draggable: ({
    children,
    draggableId,
  }: {
    children: (provided: object, snapshot: object) => React.ReactNode
    draggableId: string
  }) =>
    children(
      {
        innerRef: vi.fn(),
        draggableProps: { 'data-draggable-id': draggableId },
        dragHandleProps: {},
      },
      { isDragging: false },
    ),
}))

// ── Factory ────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id:              1,
    nombre:          'Proyecto Test',
    contacto:        null,
    email:           null,
    celular:         null,
    encargado:       null,
    developer:       null,
    arquitecto:      null,
    tipo:            'ambos',
    dialux:          false,
    area:            null,
    despacho:        null,
    ubicacion:       null,
    etapa:           'lead',
    fecha_entrega:   null,
    valor:           null,
    notas:           null,
    urgency:         'ok',
    freshness:       'recent',
    assignees:       [],
    latest_activity: null,
    created_by:      1,
    documents_count: 0,
    created_at:      '2026-06-01T00:00:00Z',
    updated_at:      '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

// ── Columnas ───────────────────────────────────────────────────────────────

describe('KanbanBoard — columnas', () => {
  it('renderiza las 6 columnas de etapa', () => {
    render(
      <KanbanBoard projects={[]} onCardClick={vi.fn()} onStageChange={vi.fn()} />
    )

    const desktop = within(screen.getByTestId('kanban-desktop'))
    for (const stage of STAGES) {
      expect(desktop.getByText(STAGE_LABELS_ES[stage.id])).toBeInTheDocument()
    }
  })

  it('muestra el contador de proyectos en cada columna', () => {
    const projects = [
      makeProject({ id: 1, nombre: 'Proyecto Lead 1', etapa: 'lead' }),
      makeProject({ id: 2, nombre: 'Proyecto Lead 2', etapa: 'lead' }),
      makeProject({ id: 3, nombre: 'Proyecto Diseño', etapa: 'diseno' }),
    ]

    render(
      <KanbanBoard projects={projects} onCardClick={vi.fn()} onStageChange={vi.fn()} />
    )

    const desktop = within(screen.getByTestId('kanban-desktop'))
    // Lead column should show count 2, Diseño should show 1
    const counts = desktop.getAllByText('2')
    expect(counts.length).toBeGreaterThanOrEqual(1)
    expect(desktop.getByText('1')).toBeInTheDocument()
  })
})

// ── Distribución de proyectos ──────────────────────────────────────────────

describe('KanbanBoard — distribución de proyectos', () => {
  it('coloca cada proyecto en la columna de su etapa', () => {
    const projects = [
      makeProject({ id: 1, nombre: 'Proyecto Alpha',  etapa: 'lead' }),
      makeProject({ id: 2, nombre: 'Proyecto Beta',   etapa: 'diseno' }),
      makeProject({ id: 3, nombre: 'Proyecto Gamma',  etapa: 'propuesta' }),
    ]

    render(
      <KanbanBoard projects={projects} onCardClick={vi.fn()} onStageChange={vi.fn()} />
    )

    const desktop = within(screen.getByTestId('kanban-desktop'))
    expect(desktop.getByText('Proyecto Alpha')).toBeInTheDocument()
    expect(desktop.getByText('Proyecto Beta')).toBeInTheDocument()
    expect(desktop.getByText('Proyecto Gamma')).toBeInTheDocument()
  })

  it('muestra "Sin proyectos" en columnas vacías', () => {
    render(
      <KanbanBoard projects={[]} onCardClick={vi.fn()} onStageChange={vi.fn()} />
    )

    const desktop = within(screen.getByTestId('kanban-desktop'))
    const emptyMessages = desktop.getAllByText('Sin proyectos')
    // All 6 columns should show the empty message
    expect(emptyMessages).toHaveLength(STAGES.length)
  })

  it('no muestra "Sin proyectos" en columnas con proyectos', () => {
    const projects = [
      makeProject({ id: 1, nombre: 'Proyecto A', etapa: 'lead' }),
    ]

    render(
      <KanbanBoard projects={projects} onCardClick={vi.fn()} onStageChange={vi.fn()} />
    )

    const desktop = within(screen.getByTestId('kanban-desktop'))
    // Only 5 empty columns remain (lead has a project)
    const emptyMessages = desktop.getAllByText('Sin proyectos')
    expect(emptyMessages).toHaveLength(STAGES.length - 1)
  })
})

// ── onCardClick ────────────────────────────────────────────────────────────

describe('KanbanBoard — onCardClick', () => {
  it('llama a onCardClick al hacer clic en una tarjeta', () => {
    const handleClick = vi.fn()
    const project = makeProject({ id: 1, nombre: 'Clickable Project', etapa: 'lead' })

    render(
      <KanbanBoard
        projects={[project]}
        onCardClick={handleClick}
        onStageChange={vi.fn()}
      />
    )

    const desktop = within(screen.getByTestId('kanban-desktop'))
    const card = desktop.getByText('Clickable Project')
    card.click()

    expect(handleClick).toHaveBeenCalledWith(project)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})

// ── Múltiples proyectos por columna ───────────────────────────────────────

describe('KanbanBoard — múltiples proyectos', () => {
  it('renderiza todos los proyectos de la misma etapa en la misma columna', () => {
    const projects = Array.from({ length: 5 }, (_, i) =>
      makeProject({ id: i + 1, nombre: `Proyecto ${i + 1}`, etapa: 'lead' })
    )

    render(
      <KanbanBoard projects={projects} onCardClick={vi.fn()} onStageChange={vi.fn()} />
    )

    const desktop = within(screen.getByTestId('kanban-desktop'))
    for (let i = 1; i <= 5; i++) {
      expect(desktop.getByText(`Proyecto ${i}`)).toBeInTheDocument()
    }
  })

  it('renderiza proyectos en múltiples columnas simultáneamente', () => {
    const projects: Project[] = STAGES.map((stage, i) =>
      makeProject({ id: i + 1, nombre: `Card-${stage.id}`, etapa: stage.id })
    )

    render(
      <KanbanBoard projects={projects} onCardClick={vi.fn()} onStageChange={vi.fn()} />
    )

    const desktop = within(screen.getByTestId('kanban-desktop'))
    for (const stage of STAGES) {
      expect(desktop.getByText(`Card-${stage.id}`)).toBeInTheDocument()
    }

    // No empty messages in desktop since every column has a project
    expect(desktop.queryByText('Sin proyectos')).not.toBeInTheDocument()
  })
})
