import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ToolKardexPage from './ToolKardexPage'
import { serviciosApi } from '@/api/serviciosApi'
import type { ToolKardexEntry, Tool, InternalTechnician } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    toolMovements: { list: vi.fn() },
    tools: { list: vi.fn() },
    internalTechnicians: { list: vi.fn() },
  },
}))

const mockedApi = vi.mocked(serviciosApi, true)

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: 1, nombre: 'Escalera de tijera', codigo_unico: 'HER-001', estado: 'good',
    assigned_to_technician_id: null, assigned_to: 'En bodega de herramientas',
    assigned_since: '2026-08-01T00:00:00Z', responsable_incidente: null,
    pending_replacement_request: null,
    ...overrides,
  }
}

function makeTechnician(overrides: Partial<InternalTechnician> = {}): InternalTechnician {
  return {
    id: 1, user_id: 1, nombre: 'Tecnico Servicios Test', telefono: null, email: null,
    especialidad: 'general', color: '#000', has_bonus_plan: false, estado: 'available',
    visitas_hoy: 0, herramientas_asignadas: 0, pct_resuelto_primera_visita: null,
    tiempo_promedio_minutos: null,
    ...overrides,
  }
}

function makeEntry(overrides: Partial<ToolKardexEntry> = {}): ToolKardexEntry {
  return {
    id: 1, tool_id: 1, tool_nombre: 'Escalera de tijera', tool_codigo_unico: 'HER-001',
    tipo: 'ingreso', cantidad: 1, detalle: 'Compra OC-102', user_id: 2, user_nombre: 'Felix',
    saldo_inicial: 0, saldo_resultante: 1,
    created_at: '2026-08-13T10:00:00Z',
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ToolKardexPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.tools.list.mockResolvedValue([makeTool({ id: 1, nombre: 'Escalera de tijera' }), makeTool({ id: 2, nombre: 'Taladro', codigo_unico: 'HER-002' })])
  mockedApi.internalTechnicians.list.mockResolvedValue([makeTechnician({ id: 2, nombre: 'Felix' }), makeTechnician({ id: 3, nombre: 'Tecnico Servicios Test' })])
})

describe('ToolKardexPage — REQ-276 kardex de herramientas, solo lectura (con cantidad/saldo, SCRUM-779)', () => {
  it('muestra el mensaje de vacío cuando no hay movimientos', async () => {
    mockedApi.toolMovements.list.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('toolKardex.empty')).toBeInTheDocument()
  })

  it('muestra herramienta, código, detalle y responsable de cada movimiento', async () => {
    mockedApi.toolMovements.list.mockResolvedValue([
      makeEntry({ id: 1, tipo: 'ingreso', tool_nombre: 'Escalera de tijera', tool_codigo_unico: 'HER-001' }),
      makeEntry({ id: 2, tipo: 'damaged', tool_nombre: 'Taladro', tool_codigo_unico: 'HER-002', user_nombre: 'Tecnico Servicios Test' }),
    ])
    renderPage()

    const table = within(await screen.findByRole('table'))
    expect(await table.findByText('Escalera de tijera')).toBeInTheDocument()
    expect(table.getByText('HER-001')).toBeInTheDocument()
    expect(table.getByText('Taladro')).toBeInTheDocument()
    expect(table.getByText('HER-002')).toBeInTheDocument()
    expect(table.getByText('Tecnico Servicios Test')).toBeInTheDocument()
  })

  it('muestra cantidad, saldo inicial y saldo resultante de cada movimiento', async () => {
    mockedApi.toolMovements.list.mockResolvedValue([
      makeEntry({ id: 1, tipo: 'damaged', cantidad: 1, saldo_inicial: 5, saldo_resultante: 4 }),
    ])
    renderPage()

    const table = within(await screen.findByRole('table'))
    await table.findByText('Escalera de tijera')
    expect(table.getByText('5')).toBeInTheDocument() // saldo_inicial
    expect(table.getByText('4')).toBeInTheDocument() // saldo_resultante
    expect(table.getByText('1')).toBeInTheDocument() // cantidad
  })

  it('no ofrece ninguna acción de edición/borrado', async () => {
    mockedApi.toolMovements.list.mockResolvedValue([makeEntry()])
    renderPage()
    await within(await screen.findByRole('table')).findByText('Escalera de tijera')

    expect(screen.queryByRole('button', { name: /editar|borrar|eliminar/i })).not.toBeInTheDocument()
  })

  it('combina el select de herramienta, tipo (chip) y select de responsable en la misma consulta', async () => {
    mockedApi.toolMovements.list.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(mockedApi.tools.list).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText('toolKardex.filters.herramienta')).toHaveTextContent('Taladro'))

    fireEvent.change(screen.getByLabelText('toolKardex.filters.herramienta'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('toolKardex.filters.responsable'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('toolKardex.tipos.damaged'))

    await waitFor(() => expect(mockedApi.toolMovements.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool_id: 2, user_id: 3, tipo: 'damaged' }),
    ))
  })

  it('"Limpiar filtros" vuelve a la consulta sin filtros', async () => {
    mockedApi.toolMovements.list.mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(mockedApi.tools.list).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText('toolKardex.filters.herramienta')).toHaveTextContent('Taladro'))

    fireEvent.change(screen.getByLabelText('toolKardex.filters.herramienta'), { target: { value: '2' } })
    await waitFor(() => expect(mockedApi.toolMovements.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool_id: 2 }),
    ))

    fireEvent.click(screen.getByText('toolKardex.filters.clear'))
    await waitFor(() => expect(mockedApi.toolMovements.list).toHaveBeenLastCalledWith({
      tool_id: undefined, user_id: undefined, tipo: undefined,
    }))
  })
})
