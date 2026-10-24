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
      searchClients: vi.fn(), projects: vi.fn(), generate: vi.fn(), downloadExcel: vi.fn(), downloadPdf: vi.fn(),
    },
    compensaciones: { downloadPdf: vi.fn() },
  },
}))

// SCRUM-930 (F3) — los 4 modales de detalle son componentes reales con sus propios hooks/API;
// para probar solo "la fila correcta abre el modal correcto con el id correcto" alcanza con un
// doble liviano que expone sus props recibidas.
vi.mock('@/components/admin-contab/InvoiceDetailModal', () => ({
  default: ({ orderId, invoiceId }: { orderId: number; invoiceId: number | null }) => (
    <div data-testid="invoice-modal">invoice:{orderId}:{invoiceId}</div>
  ),
}))
vi.mock('@/components/admin-contab/DetalleNotaCreditoModal', () => ({
  default: ({ notaId }: { notaId: number }) => <div data-testid="nota-modal">nota:{notaId}</div>,
}))
vi.mock('@/components/QuoteViewerModal', () => ({
  default: ({ quoteId }: { quoteId: number }) => <div data-testid="quote-modal">quote:{quoteId}</div>,
}))
vi.mock('@/components/GuiaEntregaModal', () => ({
  default: ({ orderId }: { orderId: number }) => <div data-testid="guia-modal">guia:{orderId}</div>,
}))
// SCRUM-955 §5 — mismo criterio: doble liviano para la columna "Cobro" (recibo de Cobro/Abono).
vi.mock('@/components/admin-contab/DetalleCobroModal', () => ({
  default: ({ paymentId }: { paymentId: number }) => <div data-testid="cobro-modal">cobro:{paymentId}</div>,
}))
vi.mock('@/components/admin-contab/RegistrarAbonoModal', () => ({
  default: ({ abonoId }: { abonoId: number }) => <div data-testid="abono-modal">abono:{abonoId}</div>,
}))

const mockedApi = vi.mocked(adminContabApi, true)

const CLIENT: AccountStatementClientOption = { id: 7, name: 'Torres Pacífico' }
const PROJECT: AccountStatementProjectOption = { id: 42, name: 'Torres Pacífico — Bodega Norte' }

function makeStatement(overrides: Partial<AccountStatement> = {}): AccountStatement {
  const movimientos = overrides.movimientos ?? []
  return {
    master_client_id: 7, cliente: 'Torres Pacífico', sales_project_id: null, proyecto: null,
    tarifa: 'public', regimen_fiscal: 'con_itbms', terminos_pago: 'Neto 30',
    saldo: 6200, saldo_a_favor: false,
    pago_a: 'Atlantic Diseño e Iluminación, S.A.',
    cuenta_pago: 'Banco General ****4521',
    banco: 'Banco General', tipo_cuenta: 'corriente', numero_cuenta: '****4521',
    responsable: 'Contabilidad López',
    nota_contexto: null, proyectos_count: 1,
    movimientos,
    // SCRUM-947 — paginación estándar.
    meta: { total: movimientos.length, per_page: 20, current_page: 1, last_page: 1 },
    ...overrides,
  }
}

function makeMovement(overrides: Partial<AccountStatementMovement> = {}): AccountStatementMovement {
  return {
    fecha: '2026-05-15', tipo: 'factura', numero_factura: 'F-4410', invoice_id: 4410, order_id: 4410,
    cotizacion_folio: 'COT-1201', quote_id: 1201,
    guia_entrega_numero: null, guia_entrega_order_id: null, nota_id: null, antiguedad_cartera: null,
    sales_project_id: 42, proyecto: 'Torres Pacífico — Bodega Norte',
    debito: 6200, credito: 0, saldo: 6200, recibo: null,
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
      page: 1, per_page: 20,
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
      page: 1, per_page: 20,
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
  // SCRUM-857 — "Descargar PDF" pasó de window.print() (decisión original de este batch) a
  // descargar el documento real generado en servidor, mismo criterio que "Descargar Excel".
  it('Escenario 1 — "Descargar PDF" descarga el documento real (ya no window.print())', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement())
    mockedApi.accountStatement.downloadPdf.mockResolvedValue(undefined)
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))
    await screen.findByText('Torres Pacífico')

    fireEvent.click(screen.getByText('estadoCuenta.resultado.descargarImprimir'))
    fireEvent.click(screen.getByText('estadoCuenta.resultado.descargarPdf'))

    await waitFor(() => expect(mockedApi.accountStatement.downloadPdf).toHaveBeenCalledWith({
      masterClientId: 7, salesProjectId: null, desde: undefined, hasta: undefined,
    }))
    expect(printSpy).not.toHaveBeenCalled()
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
  it('Escenario 1 — siempre presente, con los 5 datos (SCRUM-857 agrega tipo de cuenta y banco sueltos)', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement())
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    await screen.findByText('Torres Pacífico')
    expect(screen.getByText('Atlantic Diseño e Iluminación, S.A.')).toBeInTheDocument()
    expect(screen.getByText('****4521')).toBeInTheDocument()
    expect(screen.getByText('cuentasBancarias.tipos.corriente')).toBeInTheDocument()
    expect(screen.getByText('Banco General')).toBeInTheDocument()
    expect(screen.getByText('Contabilidad López')).toBeInTheDocument()
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

  it('SCRUM-877 p2 — el subtotal de la vista agrupada alinea Débito/Crédito/Saldo bajo sus columnas', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [
        makeMovement({ proyecto: 'Proyecto A', numero_factura: 'F-1', debito: 120, credito: 0, saldo: 120 }),
        makeMovement({ proyecto: 'Proyecto A', numero_factura: 'F-1', tipo: 'cobro', debito: 0, credito: 50, saldo: 70 }),
      ],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    const labelCell = (await screen.findByText('estadoCuenta.resultado.subtotalProyecto')).closest('td')!
    // SCRUM-955 §5 — 6 columnas líderes (Fecha, N° Factura, Cobro, Concepto, N° Cotización, Guía de entrega).
    expect(labelCell).toHaveAttribute('colspan', '6')

    // Los 3 valores del subtotal son las celdas 2-4 de esa fila, en orden Débito/Crédito/Saldo,
    // seguidas de la celda en blanco de Antigüedad de cartera (SCRUM-930, sin subtotal propio).
    const row = labelCell.closest('tr')!
    const cells = Array.from(row.querySelectorAll('td'))
    expect(cells).toHaveLength(5) // etiqueta (colspan 5) + 3 valores + antigüedad en blanco
    expect(cells[1]).toHaveTextContent('120.00')
    expect(cells[2]).toHaveTextContent('50.00')
    expect(cells[3]).toHaveTextContent('70.00')
    expect(cells[4]).toHaveTextContent('')
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

  it('SCRUM-877 p1 — muestra descuento, devolución y anulación como conceptos propios', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [
        makeMovement({ numero_factura: 'F-9', debito: 1000, credito: 0, saldo: 1000 }),
        makeMovement({ numero_factura: 'F-9', tipo: 'descuento', debito: 0, credito: 100, saldo: 900 }),
        makeMovement({ numero_factura: 'F-9', tipo: 'devolucion', debito: 0, credito: 50, saldo: 850 }),
        makeMovement({ numero_factura: 'F-9', tipo: 'anulacion', debito: 0, credito: 850, saldo: 0 }),
      ],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText('estadoCuenta.resultado.tipoDescuento')).toBeInTheDocument()
    expect(screen.getByText('estadoCuenta.resultado.tipoDevolucion')).toBeInTheDocument()
    expect(screen.getByText('estadoCuenta.resultado.tipoAnulacion')).toBeInTheDocument()
  })
})

describe('EstadoCuentaPage — REQ-461 apertura automática (Batch 9)', () => {
  it('Escenario 1 — con master_client_id en la URL, genera de inmediato sin presionar Buscar', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement())

    renderPage('/admin-contab/facturacion/estado-cuenta?master_client_id=7')

    await waitFor(() => expect(mockedApi.accountStatement.generate).toHaveBeenCalledWith({
      masterClientId: 7, salesProjectId: null, page: 1, per_page: 20,
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

describe('EstadoCuentaPage — SCRUM-930 columna "Antigüedad de cartera" (F2)', () => {
  it('muestra el rango cuando el backend lo manda, "—" cuando es null', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [
        makeMovement({ numero_factura: 'F-1', antiguedad_cartera: '31-60' }),
        makeMovement({ numero_factura: 'F-2', tipo: 'cobro', antiguedad_cartera: null }),
      ],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText('estadoCuenta.resultado.antiguedad.dias31a60')).toBeInTheDocument()
  })
})

describe('EstadoCuentaPage — SCRUM-930 documentos clickeables (F3)', () => {
  it('Factura clickeable abre InvoiceDetailModal con el order_id y el invoice_id de la fila', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement({ numero_factura: 'F-4410', invoice_id: 4410, order_id: 321 })],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    fireEvent.click(await screen.findByText('F-4410'))

    expect(await screen.findByTestId('invoice-modal')).toHaveTextContent('invoice:321:4410')
  })

  it('Cotización clickeable abre QuoteViewerModal con el quote_id de la fila', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement({ numero_factura: 'F-1', cotizacion_folio: 'COT-9', quote_id: 9 })],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    fireEvent.click(await screen.findByText('COT-9'))

    expect(await screen.findByTestId('quote-modal')).toHaveTextContent('quote:9')
  })

  it('Guía de Entrega clickeable abre GuiaEntregaModal con su order_id (no el de la factura)', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement({
        numero_factura: 'F-1', guia_entrega_numero: 'PED-2026-0075-G', guia_entrega_order_id: 555,
      })],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    fireEvent.click(await screen.findByText('PED-2026-0075-G'))

    expect(await screen.findByTestId('guia-modal')).toHaveTextContent('guia:555')
  })

  it('Nota Crédito clickeable (fila "descuento") abre DetalleNotaCreditoModal con su nota_id', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement({ numero_factura: 'F-9', tipo: 'descuento', nota_id: 77, credito: 100 })],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    fireEvent.click(await screen.findByText('estadoCuenta.resultado.tipoDescuento'))

    expect(await screen.findByTestId('nota-modal')).toHaveTextContent('nota:77')
  })

  it('Cobro clickeable (recibo tipo cobro) abre DetalleCobroModal con su id', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement({
        numero_factura: 'F-9', tipo: 'cobro', credito: 100,
        recibo: { tipo: 'cobro', id: 55, numero_recibo: 'REC-0055' },
      })],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    fireEvent.click(await screen.findByText('REC-0055'))

    expect(await screen.findByTestId('cobro-modal')).toHaveTextContent('cobro:55')
  })

  it('Cobro clickeable (recibo tipo abono) abre RegistrarAbonoModal con su id', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement({
        numero_factura: 'F-9', tipo: 'cobro', credito: 100,
        recibo: { tipo: 'abono', id: 12, numero_recibo: 'ABN-0012' },
      })],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    fireEvent.click(await screen.findByText('ABN-0012'))

    expect(await screen.findByTestId('abono-modal')).toHaveTextContent('abono:12')
  })

  // SCRUM-1168 F3 — un cruce desde un abono histórico o una nota de crédito figura como «Compensación» con su folio CMP; al hacer clic se
  // descarga su documento (no tiene modal propio).
  it('SCRUM-1168 — un cobro sin factura (saldo a favor) y una devolución de saldo se muestran con su recibo y sin enlace de factura', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [
        makeMovement({
          numero_factura: null, invoice_id: null, order_id: null, tipo: 'cobro', credito: 350, proyecto: null, sales_project_id: null,
          recibo: { tipo: 'cobro', id: 7, numero_recibo: 'REC-007' },
        }),
        makeMovement({
          numero_factura: null, invoice_id: null, order_id: null, tipo: 'devolucion_saldo', debito: 50, credito: 0, proyecto: null, sales_project_id: null,
          recibo: { tipo: 'cobro', id: 7, numero_recibo: 'REC-007' },
        }),
      ],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText('estadoCuenta.resultado.tipoCobro')).toBeInTheDocument()
    expect(screen.getByText('estadoCuenta.resultado.tipoDevolucionSaldo')).toBeInTheDocument()
    expect(screen.getAllByText('REC-007')).toHaveLength(2)
  })

  it('SCRUM-1168 — la compensación se muestra con su folio CMP y al hacer clic descarga su documento', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement({
        numero_factura: 'F-9', tipo: 'compensacion', credito: 150,
        recibo: { tipo: 'compensacion', id: 31, numero_recibo: 'CMP-031' },
      })],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText('estadoCuenta.resultado.tipoCompensacion')).toBeInTheDocument()
    fireEvent.click(screen.getByText('CMP-031'))

    expect(mockedApi.compensaciones.downloadPdf).toHaveBeenCalledWith(31, 'CMP-031')
  })

  it('sin recibo asociado, la columna Cobro se muestra como "—" (no un botón)', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement({ numero_factura: 'F-1', recibo: null })],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    await screen.findByText('F-1')
    expect(screen.queryByRole('button', { name: /REC-|ABN-/ })).not.toBeInTheDocument()
  })

  it('SCRUM-955 §4 — Débito se muestra en verde y Crédito en rojo (colores invertidos)', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement({ numero_factura: 'F-1', debito: 100, credito: 0, saldo: 100 })],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    const matches = await screen.findAllByText(/100\.00/)
    const debitoCell = matches.map(el => el.closest('td')!).find(td => td.className.includes('text-green-700'))
    expect(debitoCell).toBeDefined()
    expect(debitoCell!.className).not.toContain('text-red-700')
  })

  it('sin quote_id, la Cotización se muestra como texto plano (no un botón)', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement({ numero_factura: 'F-1', cotizacion_folio: null, quote_id: null })],
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    await screen.findByText('F-1')
    const cells = screen.getAllByText('—')
    expect(cells.some(el => el.tagName === 'BUTTON')).toBe(false)
  })
})

describe('EstadoCuentaPage — SCRUM-947 paginación', () => {
  it('avanzar de página pide la página siguiente manteniendo el resto de los filtros activos', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement()],
      meta: { total: 25, per_page: 20, current_page: 1, last_page: 2 },
    }))
    renderPage()
    await selectClient()
    fireEvent.change(screen.getByLabelText(/desde/i), { target: { value: '2026-01-01' } })
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))
    await screen.findByText('F-4410')

    fireEvent.click(screen.getByRole('button', { name: '2' }))

    await waitFor(() => expect(mockedApi.accountStatement.generate).toHaveBeenLastCalledWith({
      masterClientId: 7, salesProjectId: null, desde: '2026-01-01', hasta: undefined,
      page: 2, per_page: 20,
    }))
  })

  it('cambiar la cantidad por página resetea a la página 1', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      movimientos: [makeMovement()],
      meta: { total: 55, per_page: 20, current_page: 1, last_page: 3 },
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))
    await screen.findByText('F-4410')

    fireEvent.change(screen.getByDisplayValue('20 pagination.perPage'), { target: { value: '50' } })

    await waitFor(() => expect(mockedApi.accountStatement.generate).toHaveBeenLastCalledWith({
      masterClientId: 7, salesProjectId: null, page: 1, per_page: 50,
    }))
  })

  it('la tarjeta de saldo sigue mostrando el saldo del resultado COMPLETO, no solo lo que trae la página', async () => {
    mockedApi.accountStatement.generate.mockResolvedValue(makeStatement({
      saldo: 12345, movimientos: [makeMovement()],
      meta: { total: 25, per_page: 20, current_page: 1, last_page: 2 },
    }))
    renderPage()
    await selectClient()
    fireEvent.click(screen.getByText('estadoCuenta.busqueda.buscar'))

    expect(await screen.findByText(/12,345\.00/)).toBeInTheDocument()
  })
})
