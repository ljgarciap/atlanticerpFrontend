import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import EstadoCuentaPage from './EstadoCuentaPage'
import { adminContabApi } from '@/api/adminContabApi'
import type {
  AccountStatementClientOption, AccountStatementProjectOption, AccountStatement, AccountStatementMovement,
} from '@/types/adminContab'

// Batch 8/9 del cuerpo principal (SCRUM-529→538, REQ-452→461) — Estado de Cuenta.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      let out = key
      for (const [k, v] of Object.entries(opts)) out += `:${k}=${v}`
      return out
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    accountStatement: {
      searchClients: vi.fn(), projects: vi.fn(), generate: vi.fn(), downloadExcel: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

const CLIENT: AccountStatementClientOption = { id: 7, name: 'Torres Pacífico' }
const PROJECT: AccountStatementProjectOption = { id: 42, name: 'Torres Pacífico — Bodega Norte' }

function makeStatement(overrides: Partial<AccountStatement> = {}): AccountStatement {
  return {
    master_client_id: 7, cliente: 'Torres Pacífico', sales_project_id: null, proyecto: null,
    tarifa: 'public', regimen_fiscal: 'con_itbms', terminos_pago: 'Neto 30',
    saldo: 6200, saldo_a_favor: false,
    pago_a: 'Illuminations Diseño e Iluminación, S.A.',
    cuenta_pago: 'Banco General ****4521', responsable: 'Felix López',
    nota_contexto: null, proyectos_count: 1,
    movimientos: [],
    ...overrides,
  }
}

function makeMovement(overrides: Partial<AccountStatementMovement> = {}): AccountStatementMovement {
  return {
    fecha: '2026-05-15', tipo: 'factura', numero_factura: 'F-4410', cotizacion_folio: 'COT-1201',
    guia_entrega: false, sales_project_id: 42, proyecto: 'Torres Pacífico — Bodega Norte',
    debito: 6200, credito: 0, saldo: 6200,
    ...overrides,
  }
}

function renderPage(initialPath = '/admin-contab/facturacion/estado-cuenta') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <EstadoCuentaPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function selectClient() {
  const input = screen.getByPlaceholderText('estadoCuenta.busqueda.subclientePlaceholder')
  fireEvent.change(input, { target: { value: 'Torres' } })
  fireEvent.focus(input)
  fireEvent.mouseDown(await screen.findByText('Torres Pacífico'))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.accountStatement.searchClients.mockResolvedValue([CLIENT])
  mockedApi.accountStatement.projects.mockResolvedValue([PROJECT])
})

describe('EstadoCuentaPage — REQ-454 estado vacío', () => {
  it('Escenario 1 — muestra el mensaje invitando a elegir un cliente, sin tabla vacía', () => {
    renderPage()
    expect(screen.getByText('estadoCuenta.vacio.mensaje')).toBeInTheDocument()
  })
})

describe('EstadoCuentaPage — REQ-453 buscar', () => {
  it('Escenario 1 — buscar sin cliente pide seleccionar uno, sin window.alert', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    renderPage()

    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(screen.getByText('estadoCuenta.busqueda.clienteRequerido')).toBeInTheDocument()
    expect(alertSpy).not.toHaveBeenCalled()
    expect(mockedApi.accountStatement.generate).not.toHaveBeenCalled()
  })

  it('Escenario 2 — al elegir un subcliente, el selector de proyecto se llena con SUS proyectos', async () => {
    renderPage()
    await selectClient()

    await waitFor(() => expect(mockedApi.accountStatement.projects).toHaveBeenCalledWith(7))
    expect(await screen.findByText('Torres Pacífico — Bodega Norte')).toBeInTheDocument()
  })

  it('Escenario 3 — "Limpiar" resetea los campos y vuelve al estado vacío', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement())
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))
    await screen.findByText('Torres Pacífico', { selector: 'div' })

    fireEvent.click(screen.getByText('estadoCuenta.busqueda.limpiar'))

    expect(screen.getByText('estadoCuenta.vacio.mensaje')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('estadoCuenta.busqueda.subclientePlaceholder')).toHaveValue('')
  })

  it('busca con el cliente y el proyecto elegidos', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement())
    renderPage()
    await selectClient()

    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    await waitFor(() => expect(mockedApi.accountStatement.generate).toHaveBeenCalledWith({
      masterClientId: 7, salesProjectId: null, desde: undefined, hasta: undefined,
    }))
  })
})

describe('EstadoCuentaPage — REQ-455 encabezado de resultado', () => {
  it('Escenario 1 — sin proyecto, muestra solo el nombre del cliente + tarifa/régimen/términos', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement())
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText('Torres Pacífico')).toBeInTheDocument()
    expect(screen.getByText(/estadoCuenta\.resultado\.metaLine/)).toBeInTheDocument()
  })

  it('Escenario 2 — filtrado por proyecto, muestra "Cliente · Proyecto"', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(
      makeStatement({ sales_project_id: 42, proyecto: 'Torres Pacífico — Bodega Norte' }),
    )
    renderPage()
    await selectClient()
    await screen.findByText('Torres Pacífico — Bodega Norte')
    fireEvent.change(screen.getByLabelText(/proyectoLabel/i), { target: { value: '42' } })
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    await waitFor(() => expect(mockedApi.accountStatement.generate).toHaveBeenCalledWith({
      masterClientId: 7, salesProjectId: 42, desde: undefined, hasta: undefined,
    }))
    expect(await screen.findByText('Torres Pacífico · Torres Pacífico — Bodega Norte')).toBeInTheDocument()
  })
})

describe('EstadoCuentaPage — REQ-452 cierre de ventana', () => {
  it('"Cerrar ventana" llama a window.close()', () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
    renderPage()

    fireEvent.click(screen.getByText('estadoCuenta.close'))

    expect(closeSpy).toHaveBeenCalled()
  })
})

describe('EstadoCuentaPage — REQ-456 descargar/imprimir', () => {
  it('Escenario 1 — "Descargar como PDF" abre el diálogo de impresión del navegador', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement())
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))
    await screen.findByText('Torres Pacífico')

    fireEvent.click(screen.getByText('estadoCuenta.resultado.descargarImprimir'))
    fireEvent.click(screen.getByText('estadoCuenta.resultado.descargarPdf'))

    expect(printSpy).toHaveBeenCalled()
  })

  it('"Descargar como Excel" descarga el estado de cuenta actual', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement())
    mockedApi.accountStatement.downloadExcel.mockResolvedValue(undefined)
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))
    await screen.findByText('Torres Pacífico')

    fireEvent.click(screen.getByText('estadoCuenta.resultado.descargarImprimir'))
    fireEvent.click(screen.getByText('estadoCuenta.resultado.descargarExcel'))

    await waitFor(() => expect(mockedApi.accountStatement.downloadExcel).toHaveBeenCalledWith({
      masterClientId: 7, salesProjectId: null, desde: undefined, hasta: undefined,
    }))
  })
})

describe('EstadoCuentaPage — REQ-457 tarjeta de saldo (Batch 9)', () => {
  it('Escenario 1 — cliente debe dinero, muestra "Saldo actual"', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({ saldo: 5200, saldo_a_favor: false }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText('estadoCuenta.resultado.saldoActual')).toBeInTheDocument()
    expect(screen.getByText(/5,200\.00/)).toBeInTheDocument()
  })

  it('Escenario 2 — saldo a favor, muestra el mensaje distinto (monto siempre positivo)', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({ saldo: -300, saldo_a_favor: true }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText('estadoCuenta.resultado.saldoAFavor')).toBeInTheDocument()
    expect(screen.getByText(/300\.00/)).toBeInTheDocument()
    expect(screen.queryByText(/-.*300\.00/)).not.toBeInTheDocument()
  })
})

describe('EstadoCuentaPage — REQ-458 bloque de datos de pago (Batch 9)', () => {
  it('Escenario 1 — siempre presente, con los 3 datos', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement())
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    await screen.findByText('Torres Pacífico')
    expect(screen.getByText('Illuminations Diseño e Iluminación, S.A.')).toBeInTheDocument()
    expect(screen.getByText('Banco General ****4521')).toBeInTheDocument()
    expect(screen.getByText('Felix López')).toBeInTheDocument()
  })
})

describe('EstadoCuentaPage — REQ-459 nota automática de contexto (Batch 9)', () => {
  it('muestra la nota que manda el backend', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(
      makeStatement({ nota_contexto: 'Factura vencida hace 95 días, sin ningún abono aplicado todavía.' }),
    )
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText(/Factura vencida hace 95 días/)).toBeInTheDocument()
  })

  it('RN3 — agrega el aviso de múltiples proyectos cuando proyectos_count > 1', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({ proyectos_count: 2 }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText('estadoCuenta.resultado.multiplesProyectos:count=2')).toBeInTheDocument()
  })

  it('sin nota ni aviso de proyectos cuando no aplica ninguno', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({ nota_contexto: null, proyectos_count: 1 }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    await screen.findByText('Torres Pacífico')
    expect(screen.queryByText(/multiplesProyectos/)).not.toBeInTheDocument()
  })
})

describe('EstadoCuentaPage — REQ-460 tabla de movimientos (Batch 9)', () => {
  it('Escenario 1 — vista agrupada muestra un bloque por proyecto con subtotal', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [
        makeMovement({ proyecto: 'Proyecto A', numero_factura: 'F-1', debito: 100, saldo: 100 }),
        makeMovement({ proyecto: 'Proyecto B', numero_factura: 'F-2', debito: 200, saldo: 200 }),
      ],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText('Proyecto A')).toBeInTheDocument()
    expect(screen.getByText('Proyecto B')).toBeInTheDocument()
    expect(screen.getAllByText('estadoCuenta.resultado.subtotalProyecto')).toHaveLength(2)
  })

  it('Escenario 2 — vista plana muestra una sola tabla con columna de proyecto', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [
        makeMovement({ proyecto: 'Proyecto A', numero_factura: 'F-1' }),
        makeMovement({ proyecto: 'Proyecto B', numero_factura: 'F-2' }),
      ],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))
    await screen.findByText('F-1')

    fireEvent.click(screen.getByText('estadoCuenta.busqueda.vistaPlana'))

    expect(screen.queryByText('estadoCuenta.resultado.subtotalProyecto')).not.toBeInTheDocument()
    expect(screen.getByText('F-1')).toBeInTheDocument()
    expect(screen.getByText('F-2')).toBeInTheDocument()
  })

  it('Escenario 3 — muestra el saldo corrido de cada fila', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [
        makeMovement({ numero_factura: 'F-1', debito: 8400, credito: 0, saldo: 8400 }),
        makeMovement({ numero_factura: 'F-1', tipo: 'cobro', debito: 0, credito: 8400, saldo: 0 }),
      ],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    await waitFor(() => expect(screen.getAllByText(/8,400\.00/).length).toBeGreaterThan(0))
    expect(screen.getAllByText(/0\.00/).length).toBeGreaterThan(0)
  })
})

describe('EstadoCuentaPage — REQ-461 apertura automática (Batch 9)', () => {
  it('Escenario 1 — con master_client_id en la URL, genera de inmediato sin presionar Buscar', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement())

    renderPage('/admin-contab/facturacion/estado-cuenta?master_client_id=7')

    await waitFor(() => expect(mockedApi.accountStatement.generate).toHaveBeenCalledWith({
      masterClientId: 7, salesProjectId: null, desde: undefined, hasta: undefined,
    }))
    expect(await screen.findByText('Torres Pacífico')).toBeInTheDocument()
    expect(screen.queryByText('estadoCuenta.vacio.mensaje')).not.toBeInTheDocument()
  })

  it('Escenario 2 — id inválido cae al estado vacío, sin ningún error visible', async () => {
    mockedApi.accountStatement.generate.mockRejectedValue(new Error('Cliente no encontrado.'))

    renderPage('/admin-contab/facturacion/estado-cuenta?master_client_id=999999')

    await waitFor(() => expect(mockedApi.accountStatement.generate).toHaveBeenCalled())
    expect(await screen.findByText('estadoCuenta.vacio.mensaje')).toBeInTheDocument()
    expect(screen.queryByText('estadoCuenta.resultado.error')).not.toBeInTheDocument()
  })
})
