import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ToolsAndSuppliesPage from './ToolsAndSuppliesPage'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import type { Tool, ToolPurchaseRequest, InternalTechnician, Insumo } from '@/types/servicios'
import type { UserInfo } from '@/types/auth'

const LABELS: Record<string, string> = {
  'tools.table.groupHeader':    '{{count}} unidad(es) ({{summary}})',
  'tools.table.groupHeaderEmpty': '0 unidad(es)',
  'tools.table.pendingBadge':   'Solicitado a Felix ({{cantidad}})',
  'tools.table.responsableIncidente': 'Responsable: {{nombre}}',
  'tools.purchaseModal.subtitle': '{{nombre}}',
  'insumos.requestModal.subtitle': '{{descripcion}}',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let out = LABELS[key] ?? key
      if (options) {
        for (const [k, v] of Object.entries(options)) out = out.replace(`{{${k}}}`, String(v))
      }
      return out
    },
    i18n: { changeLanguage: () => Promise.resolve(), language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    tools: {
      list: vi.fn(), purchaseRequests: vi.fn(), changeEstado: vi.fn(), reassign: vi.fn(),
      requestPurchase: vi.fn(), receivePurchase: vi.fn(),
    },
    internalTechnicians: { list: vi.fn() },
    insumos: {
      list: vi.fn(), requestPurchase: vi.fn(), create: vi.fn(),
    },
    lookup: {
      masterClients: vi.fn(), subClients: vi.fn(), projects: vi.fn(), products: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(serviciosApi, true)

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Aaron', last_name: 'Leis', email: 'servicio@illuminations.com.pa',
    role: 'lider_servicios', permissions: ['servicios.read'], modules: {},
    ...overrides,
  }
}

function makeTechnician(overrides: Partial<InternalTechnician> = {}): InternalTechnician {
  return {
    id: 3, user_id: null, nombre: 'Miguel Castillo', telefono: null, email: null, especialidad: 'general',
    color: '#5BA5A0', has_bonus_plan: false, estado: 'available', visitas_hoy: 0,
    herramientas_asignadas: 0, pct_resuelto_primera_visita: null, tiempo_promedio_minutos: null,
    ...overrides,
  }
}

// Contrato real de ToolController.php/ToolService.php (Backend Dev, commit 3fb46bb) — reconciliado
// 2026-08-12: `assigned_to` ya viene resuelto como string, `assigned_to_technician_id` es el FK
// crudo, `codigo_unico`/`assigned_since`/`pending_replacement_request` (no codigo/desde/pending_request).
function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: 1, nombre: 'Casco de seguridad', codigo_unico: 'HER-0001', estado: 'good',
    assigned_to_technician_id: null, assigned_to: 'En bodega de herramientas', assigned_since: '2026-08-01T10:00:00Z',
    responsable_incidente: null, pending_replacement_request: null,
    ...overrides,
  }
}

// source_tool_id (no tool_id) es el campo real de la RESPUESTA — el body del POST sí usa tool_id
// (asimetría confirmada por Backend Dev, ver CreateToolPurchaseRequestPayload).
function makeRequest(overrides: Partial<ToolPurchaseRequest> = {}): ToolPurchaseRequest {
  return {
    id: 1, source_tool_id: null, nombre: 'Escalera de tijera', cantidad: 3, estado: 'solicitado',
    requested_by: 'Aaron', received_at: null, created_at: '2026-08-12T10:00:00Z',
    ...overrides,
  }
}

// REQ-273 — contrato RECONCILIADO 2026-08-13 contra InsumoService::formatSetting() real (ver
// docblock de Insumo en types/servicios.ts): `referencia`/`nombre` en español, `estado_solicitud`
// con 2 valores ('pendiente'/null), no los 4 pasos de compras.ORDER_STATUSES asumidos original.
function makeInsumo(overrides: Partial<Insumo> = {}): Insumo {
  return {
    id: 1, catalog_product_id: 10, referencia: 'REF-100',
    nombre: 'Cinta aislante', disponible: 20, minimo: 5, estado: 'ok',
    estado_solicitud: null,
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToolsAndSuppliesPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: makeUser() })
  mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician()])
  mockedApi.tools.purchaseRequests.mockResolvedValue([])
})

describe('ToolsAndSuppliesPage — sub-vista Herramientas/Insumos', () => {
  it('muestra Herramientas por defecto y cambia a Insumos (InsumosPanel, REQ-273)', async () => {
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.insumos.list.mockResolvedValue([])
    renderPage()

    await waitFor(() => expect(mockedApi.tools.list).toHaveBeenCalled())

    fireEvent.click(screen.getByText('toolsAndSupplies.views.supplies'))
    expect(await screen.findByText('insumos.table.empty')).toBeInTheDocument()
    expect(mockedApi.tools.list).toHaveBeenCalledTimes(1)
  })
})

describe('ToolsAndSuppliesPage — REQ-268 listado agrupado', () => {
  it('RN1 — agrupa por nombre y muestra el resumen por estado en el encabezado', async () => {
    const units = [
      ...Array.from({ length: 4 }, (_, i) => makeTool({ id: i + 1, codigo_unico: `HER-000${i + 1}`, estado: 'good' })),
      makeTool({ id: 5, codigo_unico: 'HER-0005', estado: 'worn' }),
    ]
    mockedApi.tools.list.mockResolvedValue(units)
    renderPage()

    expect(await screen.findByText('Casco de seguridad')).toBeInTheDocument()
    expect(
      screen.getByText('5 unidad(es) (4 tools.estados.good, 1 tools.estados.worn)'),
    ).toBeInTheDocument()
  })

  it('RN2 — cada unidad muestra código y, sin asignar, el select queda en "En bodega de herramientas"', async () => {
    mockedApi.tools.list.mockResolvedValue([makeTool({ assigned_to_technician_id: null, assigned_to: 'En bodega de herramientas' })])
    renderPage()

    expect(await screen.findByText('HER-0001')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'tools.table.columns.assignedTo' })).toHaveValue('bodega')
  })

  it('RN2 — modo lectura muestra el texto de asignación ya resuelto por el backend', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.tools.list.mockResolvedValue([makeTool({ assigned_to: 'En bodega de herramientas' })])
    renderPage()

    expect(await screen.findByText('HER-0001')).toBeInTheDocument()
    expect(screen.getByText('En bodega de herramientas')).toBeInTheDocument()
  })

  it('RN2 — muestra el nombre del técnico asignado', async () => {
    mockedApi.tools.list.mockResolvedValue([
      makeTool({ assigned_to_technician_id: 3, assigned_to: 'Miguel Castillo' }),
    ])
    renderPage()

    // El select tiene "Miguel Castillo" seleccionado — aparece dentro del <select>.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'tools.table.columns.assignedTo' })).toHaveValue('3')
    })
  })

  it('RN2 — muestra el responsable de incidente cuando el backend lo resuelve', async () => {
    mockedApi.tools.list.mockResolvedValue([makeTool({ estado: 'damaged', responsable_incidente: 'Carlos Vergara' })])
    renderPage()

    expect(await screen.findByText('Responsable: Carlos Vergara')).toBeInTheDocument()
  })

  it('RN4 — sin resultados muestra el mensaje, nunca una tabla vacía', async () => {
    mockedApi.tools.list.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('tools.table.empty')).toBeInTheDocument()
  })

  it('RN3 — el buscador dispara la API con el término de búsqueda', async () => {
    mockedApi.tools.list.mockResolvedValue([makeTool()])
    renderPage()
    await screen.findByText('Casco de seguridad')

    fireEvent.change(screen.getByPlaceholderText('tools.searchPlaceholder'), { target: { value: 'Miguel' } })

    await waitFor(() => {
      expect(mockedApi.tools.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Miguel' }))
    })
  })

  it('RN3 — el select de Estado filtra adicionalmente', async () => {
    mockedApi.tools.list.mockResolvedValue([makeTool()])
    renderPage()
    await screen.findByText('Casco de seguridad')

    fireEvent.change(screen.getByRole('combobox', { name: 'tools.filters.estadoLabel' }), { target: { value: 'worn' } })

    await waitFor(() => {
      expect(mockedApi.tools.list).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'worn' }))
    })
  })

  it('RN3 — el select de Asignado filtra por bodega o técnico', async () => {
    mockedApi.tools.list.mockResolvedValue([makeTool()])
    renderPage()
    await screen.findByText('Casco de seguridad')

    const assignedFilter = screen.getByRole('combobox', { name: 'tools.filters.assignedLabel' })
    fireEvent.change(assignedFilter, { target: { value: 'bodega' } })

    await waitFor(() => {
      expect(mockedApi.tools.list).toHaveBeenLastCalledWith(expect.objectContaining({ assigned_to: 'bodega' }))
    })
  })
})

describe('ToolsAndSuppliesPage — REQ-269 cambio de estado', () => {
  it('cambiar a Buen estado no pide detalle, aplica de inmediato', async () => {
    const tool = makeTool({ estado: 'damaged' })
    mockedApi.tools.list.mockResolvedValue([tool])
    mockedApi.tools.changeEstado.mockResolvedValue({ ...tool, estado: 'good' })
    renderPage()
    await screen.findByText('Casco de seguridad')

    const estadoSelect = screen.getByRole('combobox', { name: 'tools.table.columns.estado' })
    fireEvent.change(estadoSelect, { target: { value: 'good' } })

    await waitFor(() => {
      expect(mockedApi.tools.changeEstado).toHaveBeenCalledWith(1, 'good', undefined)
    })
  })

  // SCRUM-779 (rebote Daniela 2026-08-20) — Dañada/Perdida/Desgaste piden el detalle del
  // incidente antes de confirmar; sin él, changeEstado() nunca se llama.
  it('lider_servicios: cambiar a Dañada pide detalle obligatorio antes de confirmar', async () => {
    const tool = makeTool()
    mockedApi.tools.list.mockResolvedValue([tool])
    mockedApi.tools.changeEstado.mockResolvedValue({ ...tool, estado: 'damaged' })
    renderPage()
    await screen.findByText('Casco de seguridad')

    const estadoSelect = screen.getByRole('combobox', { name: 'tools.table.columns.estado' })
    fireEvent.change(estadoSelect, { target: { value: 'damaged' } })

    // El modal apareció, pero todavía no se llamó a la API.
    await screen.findByText('tools.detalleModal.detalleLabel')
    expect(mockedApi.tools.changeEstado).not.toHaveBeenCalled()

    const confirmBtn = screen.getByText('tools.detalleModal.confirm')
    expect(confirmBtn).toBeDisabled()

    const textarea = screen.getByPlaceholderText('tools.detalleModal.detallePlaceholder')
    fireEvent.change(textarea, { target: { value: 'Cable pelado' } })
    expect(confirmBtn).not.toBeDisabled()
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockedApi.tools.changeEstado).toHaveBeenCalledWith(1, 'damaged', 'Cable pelado')
    })
  })

  it('cancelar el modal de detalle no llama a changeEstado y el select vuelve al estado original', async () => {
    const tool = makeTool()
    mockedApi.tools.list.mockResolvedValue([tool])
    renderPage()
    await screen.findByText('Casco de seguridad')

    const estadoSelect = screen.getByRole('combobox', { name: 'tools.table.columns.estado' }) as HTMLSelectElement
    fireEvent.change(estadoSelect, { target: { value: 'lost' } })
    await screen.findByText('tools.detalleModal.detalleLabel')

    fireEvent.click(screen.getByText('tools.detalleModal.cancel'))

    expect(screen.queryByText('tools.detalleModal.detalleLabel')).not.toBeInTheDocument()
    expect(mockedApi.tools.changeEstado).not.toHaveBeenCalled()
    expect(estadoSelect.value).toBe('good')
  })

  it('técnico interno ve el estado de solo lectura, sin select', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.tools.list.mockResolvedValue([makeTool()])
    renderPage()
    await screen.findByText('Casco de seguridad')

    expect(screen.queryByRole('combobox', { name: 'tools.table.columns.estado' })).not.toBeInTheDocument()
    expect(screen.getByText('tools.estados.good', { selector: 'span' })).toBeInTheDocument()
  })
})

describe('ToolsAndSuppliesPage — REQ-270 reasignación', () => {
  it('lider_servicios puede reasignar una unidad a un técnico interno', async () => {
    const tool = makeTool()
    mockedApi.tools.list.mockResolvedValue([tool])
    mockedApi.tools.reassign.mockResolvedValue({
      ...tool, assigned_to_technician_id: 3, assigned_to: 'Miguel Castillo', assigned_since: '2026-08-12T09:00:00Z',
    })
    renderPage()
    await screen.findByText('Casco de seguridad')

    const assignedSelect = screen.getByRole('combobox', { name: 'tools.table.columns.assignedTo' })
    fireEvent.change(assignedSelect, { target: { value: '3' } })

    await waitFor(() => {
      expect(mockedApi.tools.reassign).toHaveBeenCalledWith(1, 3)
    })
  })

  it('reasignar a "En bodega de herramientas" manda null', async () => {
    const tool = makeTool({ assigned_to_technician_id: 3, assigned_to: 'Miguel Castillo' })
    mockedApi.tools.list.mockResolvedValue([tool])
    mockedApi.tools.reassign.mockResolvedValue({ ...tool, assigned_to_technician_id: null, assigned_to: 'En bodega de herramientas' })
    renderPage()
    await screen.findByText('Casco de seguridad')

    const assignedSelect = screen.getByRole('combobox', { name: 'tools.table.columns.assignedTo' })
    fireEvent.change(assignedSelect, { target: { value: 'bodega' } })

    await waitFor(() => {
      expect(mockedApi.tools.reassign).toHaveBeenCalledWith(1, null)
    })
  })

  it('técnico interno no ve el select de reasignación', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.tools.list.mockResolvedValue([makeTool()])
    renderPage()
    await screen.findByText('Casco de seguridad')

    expect(screen.queryByRole('combobox', { name: 'tools.table.columns.assignedTo' })).not.toBeInTheDocument()
  })
})

describe('ToolsAndSuppliesPage — REQ-271 alta de herramienta nueva', () => {
  it('lider_servicios ve el botón "+ Agregar herramienta"', async () => {
    mockedApi.tools.list.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(mockedApi.tools.list).toHaveBeenCalled())
    expect(screen.getByText('tools.addButton')).toBeInTheDocument()
  })

  it('técnico interno no ve el botón "+ Agregar herramienta"', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.tools.list.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(mockedApi.tools.list).toHaveBeenCalled())
    expect(screen.queryByText('tools.addButton')).not.toBeInTheDocument()
  })

  it('escenario: solicitar 3 unidades nuevas crea una fila pendiente con 0 unidades reales', async () => {
    const created = makeRequest({ id: 9, nombre: 'Escalera de tijera', cantidad: 3, estado: 'solicitado', source_tool_id: null })
    mockedApi.tools.list.mockResolvedValue([])
    // Primera carga: sin solicitudes. Tras invalidar (post-creación), el mock ya refleja la
    // solicitud pendiente — determinístico sin importar cuántas veces refetchee la query.
    mockedApi.tools.purchaseRequests.mockResolvedValueOnce([])
    mockedApi.tools.purchaseRequests.mockResolvedValue([created])
    mockedApi.tools.requestPurchase.mockResolvedValue(created)
    renderPage()
    await waitFor(() => expect(mockedApi.tools.list).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByText('tools.addButton'))
    const modal = within(await screen.findByTestId('tool-create-modal'))

    fireEvent.change(modal.getByRole('textbox'), { target: { value: 'Escalera de tijera' } })
    fireEvent.change(modal.getByRole('spinbutton'), { target: { value: '3' } })
    fireEvent.click(modal.getByText('tools.createModal.save'))

    await waitFor(() => {
      expect(mockedApi.tools.requestPurchase).toHaveBeenCalledWith({ nombre: 'Escalera de tijera', cantidad: 3 })
    })

    expect(await screen.findByText('Escalera de tijera')).toBeInTheDocument()
    expect(screen.getByText('0 unidad(es)')).toBeInTheDocument()
    expect(screen.getByText('Solicitado a Felix (3)')).toBeInTheDocument()
  })

  it('marcar "Recibida" en la fila pendiente confirma la recepción', async () => {
    const pending = makeRequest({ id: 9, nombre: 'Escalera de tijera', cantidad: 3, estado: 'solicitado', source_tool_id: null })
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.tools.purchaseRequests.mockResolvedValue([pending])
    mockedApi.tools.receivePurchase.mockResolvedValue([
      makeTool({ id: 10, codigo_unico: 'HER-0010', nombre: 'Escalera de tijera' }),
      makeTool({ id: 11, codigo_unico: 'HER-0011', nombre: 'Escalera de tijera' }),
      makeTool({ id: 12, codigo_unico: 'HER-0012', nombre: 'Escalera de tijera' }),
    ])
    renderPage()

    fireEvent.click(await screen.findByText('tools.table.receiveButton'))

    await waitFor(() => {
      expect(mockedApi.tools.receivePurchase).toHaveBeenCalledWith(9)
    })
  })

  it('una solicitud ya recibida no vuelve a aparecer como fila pendiente', async () => {
    const received = makeRequest({
      id: 9, nombre: 'Escalera de tijera', cantidad: 3, estado: 'recibida', source_tool_id: null,
      received_at: '2026-08-12T11:00:00Z',
    })
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.tools.purchaseRequests.mockResolvedValue([received])
    renderPage()

    await waitFor(() => expect(mockedApi.tools.purchaseRequests).toHaveBeenCalled())
    expect(screen.queryByText('Escalera de tijera')).not.toBeInTheDocument()
    expect(await screen.findByText('tools.table.empty')).toBeInTheDocument()
  })
})

describe('ToolsAndSuppliesPage — REQ-272 solicitar reposición', () => {
  it('el botón "Solicitar" está disponible en cualquier unidad existente, no solo dañada/perdida', async () => {
    mockedApi.tools.list.mockResolvedValue([makeTool({ estado: 'good' })])
    renderPage()

    expect(await screen.findByText('tools.table.requestButton')).toBeInTheDocument()
  })

  it('solicitar reposición dispara el mismo flujo de compra referenciando la herramienta existente', async () => {
    mockedApi.tools.list.mockResolvedValue([makeTool()])
    mockedApi.tools.requestPurchase.mockResolvedValue(
      makeRequest({ id: 2, source_tool_id: 1, nombre: 'Casco de seguridad', cantidad: 2 }),
    )
    renderPage()

    fireEvent.click(await screen.findByText('tools.table.requestButton'))
    const modal = within(await screen.findByTestId('tool-purchase-request-modal'))
    expect(modal.getByText('Casco de seguridad')).toBeInTheDocument()

    fireEvent.change(modal.getByRole('spinbutton'), { target: { value: '2' } })
    fireEvent.click(modal.getByText('tools.purchaseModal.save'))

    await waitFor(() => {
      expect(mockedApi.tools.requestPurchase).toHaveBeenCalledWith({ tool_id: 1, cantidad: 2 })
    })
  })

  it('técnico interno no ve el botón "Solicitar"', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.tools.list.mockResolvedValue([makeTool()])
    renderPage()
    await screen.findByText('Casco de seguridad')

    expect(screen.queryByText('tools.table.requestButton')).not.toBeInTheDocument()
  })

  it('una unidad con solicitud de reposición pendiente muestra el badge en lugar del botón Solicitar', async () => {
    mockedApi.tools.list.mockResolvedValue([
      makeTool({ pending_replacement_request: { id: 5, cantidad: 2, created_at: '2026-08-12T10:00:00Z' } }),
    ])
    renderPage()

    expect(await screen.findByText('Solicitado a Felix (2)')).toBeInTheDocument()
    expect(screen.queryByText('tools.table.requestButton')).not.toBeInTheDocument()
    expect(screen.getByText('tools.table.receiveButton')).toBeInTheDocument()
  })
})

describe('ToolsAndSuppliesPage — REQ-273 listado de Insumos', () => {
  it('muestra ambos estados (OK / Bajo mínimo) con sus datos', async () => {
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.insumos.list.mockResolvedValue([
      makeInsumo({ id: 1, nombre: 'Cinta aislante', disponible: 20, minimo: 5, estado: 'ok' }),
      makeInsumo({ id: 2, nombre: 'Terminal de cobre', disponible: 1, minimo: 10, estado: 'bajo_minimo' }),
    ])
    renderPage()

    fireEvent.click(screen.getByText('toolsAndSupplies.views.supplies'))

    expect(await screen.findByText('Cinta aislante')).toBeInTheDocument()
    expect(screen.getByText('Terminal de cobre')).toBeInTheDocument()
    expect(screen.getByText('insumos.estados.ok')).toBeInTheDocument()
    expect(screen.getByText('insumos.estados.bajo_minimo')).toBeInTheDocument()
  })

  it('sin insumos muestra el mensaje vacío, nunca una tabla vacía', async () => {
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.insumos.list.mockResolvedValue([])
    renderPage()

    fireEvent.click(screen.getByText('toolsAndSupplies.views.supplies'))
    expect(await screen.findByText('insumos.table.empty')).toBeInTheDocument()
  })

  it('lider_servicios ve "+ Agregar insumo" y "Solicitar"; técnico interno no ve ninguno', async () => {
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.insumos.list.mockResolvedValue([makeInsumo()])
    renderPage()
    fireEvent.click(screen.getByText('toolsAndSupplies.views.supplies'))

    expect(await screen.findByText('Cinta aislante')).toBeInTheDocument()
    expect(screen.getByText('insumos.addButton')).toBeInTheDocument()
    expect(screen.getByText('insumos.table.requestButton')).toBeInTheDocument()
  })

  it('técnico interno no ve "+ Agregar insumo" ni "Solicitar"', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.insumos.list.mockResolvedValue([makeInsumo()])
    renderPage()
    fireEvent.click(screen.getByText('toolsAndSupplies.views.supplies'))

    expect(await screen.findByText('Cinta aislante')).toBeInTheDocument()
    expect(screen.queryByText('insumos.addButton')).not.toBeInTheDocument()
    expect(screen.queryByText('insumos.table.requestButton')).not.toBeInTheDocument()
  })
})

describe('ToolsAndSuppliesPage — REQ-274 solicitar compra de insumo', () => {
  it('solicitar cantidad dispara requestPurchase con el id del insumo', async () => {
    const insumo = makeInsumo()
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.insumos.list.mockResolvedValue([insumo])
    mockedApi.insumos.requestPurchase.mockResolvedValue({
      id: 1, catalog_product_id: insumo.catalog_product_id, cantidad_solicitada: 15,
      estado: 'pendiente', purchase_order_id: 99, received_at: null, created_at: '2026-08-13T10:00:00Z',
    })
    renderPage()
    fireEvent.click(screen.getByText('toolsAndSupplies.views.supplies'))
    await screen.findByText('Cinta aislante')

    fireEvent.click(screen.getByText('insumos.table.requestButton'))
    const modal = within(await screen.findByTestId('insumo-request-modal'))
    fireEvent.change(modal.getByRole('spinbutton'), { target: { value: '15' } })
    fireEvent.click(modal.getByText('insumos.requestModal.save'))

    await waitFor(() => {
      expect(mockedApi.insumos.requestPurchase).toHaveBeenCalledWith(1, { cantidad: 15 })
    })
  })

  it('un insumo con solicitud pendiente muestra el badge, sin ocultar "Solicitar"', async () => {
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.insumos.list.mockResolvedValue([makeInsumo({ estado_solicitud: 'pendiente' })])
    renderPage()
    fireEvent.click(screen.getByText('toolsAndSupplies.views.supplies'))

    expect(await screen.findByText('insumos.solicitudPendiente')).toBeInTheDocument()
    // REQ-274 — "Solicitar" queda siempre habilitado, no se oculta por tener una solicitud activa.
    expect(screen.getByText('insumos.table.requestButton')).toBeInTheDocument()
  })
})

describe('ToolsAndSuppliesPage — REQ-275 agregar insumo nuevo', () => {
  it('busca en el catálogo, elige un resultado, completa mínimo/cantidad y crea el insumo', async () => {
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.insumos.list.mockResolvedValue([])
    // RECONCILIADO 2026-08-13 — no existe /servicios/insumos/catalog-search, REQ-275 reusa
    // serviciosApi.lookup.products() (ProductOption, no factory_reference).
    // SCRUM-779 (rebote QA 2026-08-19) — el buscador debe mostrar `name` (nombre real del
    // catálogo), no `description` (vacío en datos post-migración ICG). Fixture con ambos campos
    // distintos a propósito para que el test falle si el componente vuelve a leer description.
    mockedApi.lookup.products.mockResolvedValue([
      { id: 55, reference: 'PUB-55', name: 'Regleta eléctrica', description: '', brand: null, price_full: 12.5 },
    ])
    mockedApi.insumos.create.mockResolvedValue(makeInsumo({ id: 3, nombre: 'Regleta eléctrica', disponible: 0 }))
    renderPage()
    fireEvent.click(screen.getByText('toolsAndSupplies.views.supplies'))
    await waitFor(() => expect(mockedApi.insumos.list).toHaveBeenCalled())

    fireEvent.click(screen.getByText('insumos.addButton'))
    fireEvent.click(await screen.findByText('PUB-55 — Regleta eléctrica'))

    const modal = within(await screen.findByTestId('insumo-create-modal'))
    const [minimoInput, cantidadInput] = modal.getAllByRole('spinbutton')
    fireEvent.change(minimoInput, { target: { value: '4' } })
    fireEvent.change(cantidadInput, { target: { value: '10' } })
    fireEvent.click(modal.getByText('insumos.createModal.save'))

    await waitFor(() => {
      expect(mockedApi.insumos.create).toHaveBeenCalledWith({
        catalog_product_id: 55, minimo: 4, cantidad_inicial: 10,
      })
    })
  })

  it('sin resultados en el catálogo muestra el mensaje de "no existe", nunca un formulario libre', async () => {
    mockedApi.tools.list.mockResolvedValue([])
    mockedApi.insumos.list.mockResolvedValue([])
    mockedApi.lookup.products.mockResolvedValue([])
    renderPage()
    fireEvent.click(screen.getByText('toolsAndSupplies.views.supplies'))
    await waitFor(() => expect(mockedApi.insumos.list).toHaveBeenCalled())

    fireEvent.click(screen.getByText('insumos.addButton'))
    expect(await screen.findByText('insumos.createModal.searchEmpty')).toBeInTheDocument()
  })
})

describe('ToolsAndSuppliesPage — REQ-276 botón "Movimiento de herramientas"', () => {
  it('lider_servicios/management/superadmin ven el botón y abre el Kardex en pestaña nueva', async () => {
    mockedApi.tools.list.mockResolvedValue([])
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPage()
    await waitFor(() => expect(mockedApi.tools.list).toHaveBeenCalled())

    fireEvent.click(screen.getByText('toolsAndSupplies.kardexButton'))
    expect(openSpy).toHaveBeenCalledWith('/servicios/tools/kardex', '_blank', 'noopener,noreferrer')
    openSpy.mockRestore()
  })

  it('un rol sin acceso (técnico interno) no ve el botón', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.tools.list.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(mockedApi.tools.list).toHaveBeenCalled())

    expect(screen.queryByText('toolsAndSupplies.kardexButton')).not.toBeInTheDocument()
  })

  it('management (Gerencia) también ve el botón', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'management' }) })
    mockedApi.tools.list.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(mockedApi.tools.list).toHaveBeenCalled())

    expect(screen.getByText('toolsAndSupplies.kardexButton')).toBeInTheDocument()
  })
})
