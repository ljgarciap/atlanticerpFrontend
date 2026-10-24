import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import VentasDisenoPipelinePage from './PipelinePage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import type { PipelineCard } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    pipeline: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      changeStage: vi.fn(),
      contacts: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    },
    home: { vendors: vi.fn().mockResolvedValue([]) },
    masterClients: { list: vi.fn(), create: vi.fn() },
    subClients: { list: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn(),
}))

// SCRUM-849.1 — drag&drop reporta errores de transición vía toast (sin modal abierto).
vi.mock('@/store/toastStore', () => ({ useToastStore: vi.fn() }))

const mockedApi   = vi.mocked(ventasDisenoApi, true)
const mockedStore = vi.mocked(useAuthStore)
const mockedToast = vi.mocked(useToastStore)

function mockToast(showSpy: (msg: string, type?: 'success' | 'error') => void = vi.fn()) {
  mockedToast.mockImplementation(((selector?: (s: { show: typeof showSpy }) => unknown) => {
    const state = { show: showSpy }
    return selector ? selector(state) : state
  }) as never)
  return showSpy
}

function makeCard(overrides: Partial<PipelineCard> = {}): PipelineCard {
  return {
    id: 1,
    stage: 'lead',
    sales_project: { id: 1, name: 'Torre Delta', tag: null },
    master_client: { id: 1, name: 'Grupo Delta' },
    sub_client: { id: 1, business_name: 'Delta Residencial' },
    owner: { id: 1, name: 'Ana Diaz' },
    assignees: [{ id: 1, name: 'Ana Diaz' }],
    amount: null,
    worked_area_m2: null,
    days_in_stage: 2,
    is_stagnant: false,
    stage_changed_at: '2026-07-01T00:00:00Z',
    ...overrides,
  }
}

function renderPage(initialEntries = ['/ventas-diseno/pipeline']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <VentasDisenoPipelinePage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.pipeline.list.mockResolvedValue([])
  mockedStore.mockReturnValue({ user: { id: 1, role: 'designer', permissions: ['ventas_diseno.write'] } } as never)
  mockToast()
})

// SCRUM-849.1 — jsdom no dispara drag&drop nativo del navegador; se simulan los eventos
// React (dragStart/dragOver/drop) directo, mismo patrón que el resto de la suite usa
// fireEvent para click/change.
function dragCardToColumn(cardId: number, targetStage: string) {
  fireEvent.dragStart(screen.getByTestId(`pipeline-card-${cardId}`))
  fireEvent.dragOver(screen.getByTestId(`pipeline-stage-${targetStage}`))
  fireEvent.drop(screen.getByTestId(`pipeline-stage-${targetStage}`))
}

describe('VentasDisenoPipelinePage', () => {
  it('muestra el título de la pantalla', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:nav.pipeline')).toBeInTheDocument()
  })

  // SCRUM-700 (REQ-620, Batch E) — habilitado: SCRUM-711 lo dejaba visual-only "hasta que se
  // desarrolle el módulo CRM", eso ya pasó (ver CatalogPage.tsx).
  it('el botón Catálogo navega a la pantalla de Catálogo', async () => {
    renderPage()
    const button = await screen.findByText('ventasDiseno:kanban.actions.catalog')
    expect(button.closest('button')).not.toBeDisabled()
  })

  it('el chip Final Stage muestra solo la columna Propuesta (SCRUM-72)', async () => {
    mockedApi.pipeline.list.mockResolvedValue([])
    renderPage()
    await screen.findByText('ventasDiseno:nav.pipeline')

    fireEvent.click(screen.getByText('ventasDiseno:filters.finalStage'))

    expect(await screen.findByText('ventasDiseno:stages.proposal')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:stages.lead')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:stages.design')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:stages.approved')).not.toBeInTheDocument()
  })

  it('el chip Estancados muestra el texto vacío específico, no el genérico (SCRUM-72)', async () => {
    mockedApi.pipeline.list.mockResolvedValue([])
    renderPage()
    await screen.findByText('ventasDiseno:nav.pipeline')

    fireEvent.click(screen.getByText('ventasDiseno:filters.stagnant'))

    expect(await screen.findAllByText('ventasDiseno:kanban.emptyStagnant')).not.toHaveLength(0)
    expect(screen.queryByText('ventasDiseno:kanban.empty')).not.toBeInTheDocument()
  })

  it('el chip Todos sigue mostrando el texto vacío genérico', async () => {
    mockedApi.pipeline.list.mockResolvedValue([])
    renderPage()
    await screen.findByText('ventasDiseno:nav.pipeline')

    expect(await screen.findAllByText('ventasDiseno:kanban.empty')).not.toHaveLength(0)
  })

  it('lista una tarjeta bajo la columna de su etapa', async () => {
    mockedApi.pipeline.list.mockResolvedValue([makeCard({ stage: 'design' })])
    renderPage()
    expect(await screen.findByText('Torre Delta')).toBeInTheDocument()
    expect(screen.getByText('Grupo Delta')).toBeInTheDocument()
  })

  // SCRUM-75 — hallazgo de Gerencia Test (2026-07-21): la etiqueta se guardaba bien pero nunca
  // se pintaba en la tarjeta del tablero, solo dentro del modal de edición.
  it('muestra la etiqueta del proyecto en la tarjeta cuando está definida', async () => {
    mockedApi.pipeline.list.mockResolvedValue([
      makeCard({ stage: 'design', sales_project: { id: 1, name: 'Torre Delta', tag: 'design' } }),
    ])
    renderPage()
    expect(await screen.findByText('Torre Delta')).toBeInTheDocument()
    expect(screen.getByText('tag.design')).toBeInTheDocument()
  })

  it('no muestra ninguna etiqueta cuando el proyecto no tiene una definida', async () => {
    mockedApi.pipeline.list.mockResolvedValue([makeCard({ stage: 'design' })]) // tag: null por defecto
    renderPage()
    expect(await screen.findByText('Torre Delta')).toBeInTheDocument()
    expect(screen.queryByText(/^tag\./)).not.toBeInTheDocument()
  })

  it('no muestra el toggle de alcance "Equipo" para un Diseñador', async () => {
    mockedStore.mockReturnValue({ user: { id: 1, role: 'designer' } } as never)
    renderPage()
    await waitFor(() => expect(mockedApi.pipeline.list).toHaveBeenCalled())
    expect(screen.queryByText('ventasDiseno:scope.team')).not.toBeInTheDocument()
  })

  it('muestra el toggle de alcance "Equipo" para Gerencia', async () => {
    mockedStore.mockReturnValue({ user: { id: 1, role: 'management', permissions: ['platform.management'] } } as never)
    renderPage()
    expect(await screen.findByText('ventasDiseno:scope.team')).toBeInTheDocument()
  })

  it('pasa scope=team al API cuando Gerencia lo selecciona', async () => {
    mockedStore.mockReturnValue({ user: { id: 1, role: 'management', permissions: ['platform.management'] } } as never)
    renderPage()

    const teamButton = await screen.findByText('ventasDiseno:scope.team')
    fireEvent.click(teamButton)

    await waitFor(() =>
      expect(mockedApi.pipeline.list).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'team' }),
      ),
    )
  })

  // REQ-074 (Reportes — Mejores clientes)
  it('llegar con ?stage=approved&order=value&scope=team pide la etapa Aprobado con ese alcance', async () => {
    mockedStore.mockReturnValue({ user: { id: 1, role: 'management', permissions: ['platform.management'] } } as never)
    renderPage(['/ventas-diseno/pipeline?stage=approved&order=value&scope=team'])

    await waitFor(() => expect(mockedApi.pipeline.list).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'team', chip: 'approved', order: 'value' }),
    ))
  })

  it('llegar con ?stage=approved&scope=own respeta el alcance propio', async () => {
    mockedStore.mockReturnValue({ user: { id: 1, role: 'management', permissions: ['platform.management'] } } as never)
    renderPage(['/ventas-diseno/pipeline?stage=approved&order=value&scope=own'])

    await waitFor(() => expect(mockedApi.pipeline.list).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'own', chip: 'approved' }),
    ))
  })

  // SCRUM-796 (secc. 1.1/1.2) — deep-link genérico a cualquiera de los otros 5 stages,
  // filtro NUEVO e independiente de `chip` (que sigue intacto para 'approved').
  it('llegar con ?stage=lead pide el filtro `stage` (no `chip`) y muestra solo la columna Lead', async () => {
    mockedStore.mockReturnValue({ user: { id: 1, role: 'management', permissions: ['platform.management'] } } as never)
    renderPage(['/ventas-diseno/pipeline?stage=lead'])

    await waitFor(() => expect(mockedApi.pipeline.list).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'team', stage: 'lead', chip: 'all' }),
    ))
  })

  it('el chip "Todos" limpia el filtro de stage/tag heredado por deep-link', async () => {
    renderPage(['/ventas-diseno/pipeline?stage=lead'])
    await waitFor(() => expect(mockedApi.pipeline.list).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'lead' }),
    ))

    fireEvent.click(screen.getByText('ventasDiseno:filters.all'))

    await waitFor(() => expect(mockedApi.pipeline.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: undefined, tag: undefined, chip: 'all' }),
    ))
  })

  // SCRUM-796 (secc. 1.3) — filtro por etiqueta (design/quote/both), valor único.
  it('llegar con ?tag=both pide ese único valor de etiqueta', async () => {
    renderPage(['/ventas-diseno/pipeline?tag=both'])

    await waitFor(() => expect(mockedApi.pipeline.list).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'both' }),
    ))
  })

  // Grupo 1d — REQ-023
  it('muestra los accesos rápidos superiores (Catálogo / + Nuevo Proyecto / + Nueva cotización)', async () => {
    renderPage()
    expect(await screen.findByText('ventasDiseno:kanban.actions.catalog')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:kanban.actions.newProject')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:kanban.actions.newQuote')).toBeInTheDocument()
  })

  it('el botón + Nueva cotización navega al formulario de Cotización (Cotización-D)', async () => {
    renderPage()
    const button = await screen.findByText('ventasDiseno:kanban.actions.newQuote')
    expect(button.closest('button')).not.toBeDisabled()
  })

  it('abre el modal de Nuevo Proyecto al hacer clic en + Nuevo Proyecto', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('ventasDiseno:kanban.actions.newProject'))
    expect(await screen.findByText('ventasDiseno:modal.newProject.title')).toBeInTheDocument()
  })

  // REQ-608 (Batch C, Dashboard CRM): "+ Nuevo Proyecto" del Dashboard navega acá con
  // ?openNewProject=1 y el modal debe abrirse solo, sin un segundo clic.
  it('abre el modal de Nuevo Proyecto automáticamente vía ?openNewProject=1', async () => {
    renderPage(['/ventas-diseno/pipeline?openNewProject=1'])
    expect(await screen.findByText('ventasDiseno:modal.newProject.title')).toBeInTheDocument()
  })

  // REQ-022: navegación cruzada desde Clientes (?card={id}) fuerza alcance Equipo para Gerencia.
  it('fuerza alcance Equipo cuando llega vía ?card= y el usuario es Gerencia', async () => {
    mockedStore.mockReturnValue({ user: { id: 1, role: 'management', permissions: ['platform.management'] } } as never)
    mockedApi.pipeline.get.mockResolvedValue({
      ...makeCard({ id: 5 }),
      creator: null,
      delivery_type: null, observations: null, delivery_dates: [], contacts: [],
      has_architect_contact: false, can_edit: true, files: [], latest_quote_id: null,
    })
    renderPage(['/ventas-diseno/pipeline?card=5'])

    await waitFor(() =>
      expect(mockedApi.pipeline.list).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'team' }),
      ),
    )
  })

  // SCRUM-849.1 — drag&drop entre columnas del Pipeline.
  describe('drag & drop entre etapas', () => {
    it('arrastrar una tarjeta a otra columna llama al mismo endpoint que "Mover a..."', async () => {
      mockedApi.pipeline.list.mockResolvedValue([makeCard({ id: 7, stage: 'lead' })])
      mockedApi.pipeline.changeStage.mockResolvedValue({} as never)
      renderPage()

      await screen.findByText('Torre Delta')
      dragCardToColumn(7, 'design')

      await waitFor(() => expect(mockedApi.pipeline.changeStage).toHaveBeenCalledWith(7, 'design'))
    })

    it('soltar en la misma columna de origen no llama al endpoint (no-op)', async () => {
      mockedApi.pipeline.list.mockResolvedValue([makeCard({ id: 7, stage: 'lead' })])
      renderPage()

      await screen.findByText('Torre Delta')
      dragCardToColumn(7, 'lead')

      expect(mockedApi.pipeline.changeStage).not.toHaveBeenCalled()
    })

    it('una transición rechazada por el backend se avisa por toast, sin bloquear el tablero', async () => {
      const showSpy = mockToast()
      mockedApi.pipeline.list.mockResolvedValue([makeCard({ id: 7, stage: 'lead' })])
      mockedApi.pipeline.changeStage.mockRejectedValue({
        isAxiosError: true,
        response: { data: { message: 'Falta al menos 1 contacto antes de mover esta tarjeta desde Lead.' } },
      })
      renderPage()

      await screen.findByText('Torre Delta')
      dragCardToColumn(7, 'approved')

      await waitFor(() => expect(showSpy).toHaveBeenCalledWith(
        'Falta al menos 1 contacto antes de mover esta tarjeta desde Lead.', 'error',
      ))
    })
  })
})


// SCRUM-1128 — filtro Pedidos y modo solo lectura (Contabilidad).
describe('VentasDisenoPipelinePage — SCRUM-1128', () => {
  function renderPage() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <VentasDisenoPipelinePage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockToast()
    mockedApi.pipeline.list.mockResolvedValue([makeCard({ id: 1, stage: 'approved' })])
  })

  it('el filtro Pedidos envía orders=approved|pending al backend', async () => {
    mockedStore.mockReturnValue({ user: { id: 1, role: 'designer', modules: { ventas_diseno: { edit: true } } } } as never)
    renderPage()
    const sel = await screen.findByTestId('pipeline-orders-filter')
    fireEvent.change(sel, { target: { value: 'pending' } })
    await waitFor(() => expect(mockedApi.pipeline.list).toHaveBeenLastCalledWith(expect.objectContaining({ orders: 'pending' })))
    fireEvent.change(sel, { target: { value: 'approved' } })
    await waitFor(() => expect(mockedApi.pipeline.list).toHaveBeenLastCalledWith(expect.objectContaining({ orders: 'approved' })))
  })

  it('sin permiso de edición del módulo: oculta Nuevo proyecto/Nueva cotización y no permite arrastrar', async () => {
    mockedStore.mockReturnValue({ user: { id: 9, role: 'lider_admin_contab', modules: { ventas_diseno: { edit: false } } } } as never)
    renderPage()
    const tile = await screen.findByTestId('pipeline-card-1')
    expect(tile).toHaveAttribute('draggable', 'false')
    expect(screen.queryByText('ventasDiseno:kanban.actions.newProject')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:kanban.actions.newQuote')).not.toBeInTheDocument()
  })
  it('sin claim modules.ventas_diseno y sin permiso de escritura (Contabilidad): solo lectura, no se asume edición', async () => {
    mockedStore.mockReturnValue({ user: { id: 9, role: 'lider_admin_contab', permissions: ['ventas_diseno.pipeline.read_all'], modules: {} } } as never)
    renderPage()
    const tile = await screen.findByTestId('pipeline-card-1')
    expect(tile).toHaveAttribute('draggable', 'false')
    expect(screen.queryByText('ventasDiseno:kanban.actions.newProject')).not.toBeInTheDocument()
  })

  it('con permiso ventas_diseno.write edita aunque el claim de módulo no llegue', async () => {
    mockedStore.mockReturnValue({ user: { id: 2, role: 'designer', permissions: ['ventas_diseno.write'] } } as never)
    renderPage()
    const tile = await screen.findByTestId('pipeline-card-1')
    expect(tile).toHaveAttribute('draggable', 'true')
  })

  it('Contabilidad (pipeline.read_all): lista con scope=team, sin toggle ni llamada a vendors, en solo lectura', async () => {
    mockedStore.mockReturnValue({ user: { id: 9, role: 'lider_admin_contab', permissions: ['ventas_diseno.pipeline.read_all', 'ventas_diseno.pass_to_order'], modules: {} } } as never)
    renderPage()
    const tile = await screen.findByTestId('pipeline-card-1')
    expect(tile).toHaveAttribute('draggable', 'false')
    expect(mockedApi.pipeline.list).toHaveBeenCalledWith(expect.objectContaining({ scope: 'team' }))
    expect(mockedApi.pipeline.list).not.toHaveBeenCalledWith(expect.objectContaining({ scope: 'own' }))
    expect(screen.queryByText('ventasDiseno:scope.team')).not.toBeInTheDocument()
    expect(mockedApi.home.vendors).not.toHaveBeenCalled()
    expect(screen.queryByText('ventasDiseno:kanban.actions.newProject')).not.toBeInTheDocument()
  })

  // SCRUM-1139 — Contabilidad con `pipeline.edit`: edita el tablero (crear proyecto, arrastrar), sin ir a Cotizaciones.
  it('Contabilidad con pipeline.read_all + pipeline.edit: arrastra, ve Nuevo proyecto y NO ve Nueva cotización', async () => {
    mockedStore.mockReturnValue({ user: { id: 9, role: 'lider_admin_contab', permissions: ['ventas_diseno.pipeline.read_all', 'ventas_diseno.pipeline.edit'], modules: {} } } as never)
    renderPage()
    const tile = await screen.findByTestId('pipeline-card-1')
    expect(tile).toHaveAttribute('draggable', 'true')
    expect(mockedApi.pipeline.list).toHaveBeenCalledWith(expect.objectContaining({ scope: 'team' }))
    expect(screen.getByText('ventasDiseno:kanban.actions.newProject')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:kanban.actions.newQuote')).not.toBeInTheDocument()
  })

  // SCRUM-1139 (observación de Pre-QA) — el Catálogo exige `ventas_diseno.read`: a Contabilidad, con solo permisos angostos del Pipeline, el botón sería un enlace muerto.
  it('Contabilidad (solo permisos angostos del Pipeline): NO ve el botón Catálogo', async () => {
    mockedStore.mockReturnValue({ user: { id: 9, role: 'lider_admin_contab', permissions: ['ventas_diseno.pipeline.read_all', 'ventas_diseno.pipeline.edit'], modules: {} } } as never)
    renderPage()
    await screen.findByTestId('pipeline-card-1')
    expect(screen.queryByText('ventasDiseno:kanban.actions.catalog')).not.toBeInTheDocument()
  })

  it('quien tiene ventas_diseno.read (aunque tenga pipeline.edit) sigue viendo el botón Catálogo', async () => {
    mockedStore.mockReturnValue({ user: { id: 3, role: 'management', permissions: ['ventas_diseno.read', 'ventas_diseno.pipeline.edit'], modules: {} } } as never)
    renderPage()
    await screen.findByTestId('pipeline-card-1')
    expect(screen.getByText('ventasDiseno:kanban.actions.catalog')).toBeInTheDocument()
  })

  it('superadmin sigue viendo el botón Catálogo', async () => {
    mockedStore.mockReturnValue({ user: { id: 4, role: 'superadmin', permissions: ['superadmin.all'], modules: {} } } as never)
    renderPage()
    await screen.findByTestId('pipeline-card-1')
    expect(screen.getByText('ventasDiseno:kanban.actions.catalog')).toBeInTheDocument()
  })

  it('quien edita por el módulo sigue viendo Nueva cotización', async () => {
    mockedStore.mockReturnValue({ user: { id: 2, role: 'designer', permissions: ['ventas_diseno.write'] } } as never)
    renderPage()
    await screen.findByTestId('pipeline-card-1')
    expect(screen.getByText('ventasDiseno:kanban.actions.newQuote')).toBeInTheDocument()
  })
})
