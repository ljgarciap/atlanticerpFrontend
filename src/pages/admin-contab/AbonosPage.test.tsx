import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import AbonosPage from './AbonosPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { Abono } from '@/types/adminContab'

// SCRUM-902 — "Registrar abono" (4O).

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
    payments: { searchClients: vi.fn(), defaultBankAccount: vi.fn() },
    bankAccounts: { list: vi.fn() },
    abonos: {
      list: vi.fn(), detail: vi.fn(), subClientes: vi.fn(), proyectos: vi.fn(), facturas: vi.fn(),
      register: vi.fn(), update: vi.fn(), confirm: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeAbono(overrides: Partial<Abono> = {}): Abono {
  return {
    id: 1, fecha_registro: '2026-07-05', master_client_id: 7, cliente: 'Restaurante Sensei',
    sub_client_id: null, sub_cliente: null, sales_project_id: null, proyecto: null,
    invoice_id: null, factura: null, nivel_asociacion: 'cliente',
    monto_original: 500, monto_usado: 0, monto_disponible: 500, estado_saldo: 'disponible',
    metodo_pago: 'transferencia', cuenta_bancaria_id: 1,
    referencia: 'TRF-88213', comprobante_url: null, estado: 'por_confirmar',
    registrado_por: 'Felix', confirmado_por: null, fecha_confirmacion: null, abono_origen_id: null,
    numero_recibo: null,
    ...overrides,
  }
}

function renderPage(state?: unknown) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/admin-contab/abonos', state }]}>
      <QueryClientProvider client={qc}>
        <AbonosPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

// SCRUM-948 — desde que el buscador tiene un select de Cliente, el nombre del cliente aparece
// 2 veces en pantalla (la fila de la tabla y la <option> del select) — hay que apuntar a la
// celda de la tabla específicamente, no a screen.getByText/findByText a secas.
async function findClientCell(text: string) {
  const table = await screen.findByRole('table')
  return within(table).findByText(text)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.abonos.list.mockResolvedValue({
    data: [makeAbono()],
    meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
  })
  mockedApi.abonos.detail.mockResolvedValue(makeAbono())
  mockedApi.abonos.subClientes.mockResolvedValue([])
  mockedApi.abonos.proyectos.mockResolvedValue([])
  mockedApi.abonos.facturas.mockResolvedValue([])
  mockedApi.payments.searchClients.mockResolvedValue([])
  mockedApi.payments.defaultBankAccount.mockResolvedValue(null)
  mockedApi.bankAccounts.list.mockResolvedValue([])
})

describe('AbonosPage — listado', () => {
  it('muestra los abonos registrados con su nivel de asociación', async () => {
    renderPage()
    expect(await findClientCell('Restaurante Sensei')).toBeInTheDocument()
    expect(screen.getByText('abonos.nivel.cliente')).toBeInTheDocument()
    // SCRUM-948 — 'abonos.estados.por_confirmar' ahora también es la <option> del filtro Estado.
    expect(within(await screen.findByRole('table')).getByText('abonos.estados.por_confirmar')).toBeInTheDocument()
  })

  it('abre el detalle bloqueado al hacer click en una fila', async () => {
    renderPage()
    fireEvent.click(await findClientCell('Restaurante Sensei'))
    expect(await screen.findByText('abonos.form.tituloDetalle:referencia=TRF-88213')).toBeInTheDocument()
    // Detalle SIEMPRE abre bloqueado — sin importar el estado, el botón Editar debe aparecer
    // (estado por_confirmar) pero los campos no.
    expect(screen.getByText('abonos.form.editar')).toBeInTheDocument()
  })

  it('el botón "+ Registrar abono" abre el formulario vacío', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('abonos.registrarButton'))
    expect(await screen.findByText('abonos.form.tituloRegistrar')).toBeInTheDocument()
    expect(screen.getByText('abonos.form.guardarAbono')).toBeInTheDocument()
  })
})

// SCRUM-947 — paginación estándar.
describe('AbonosPage — SCRUM-947 paginación', () => {
  it('pide la página 1 con 20 por página por defecto', async () => {
    renderPage()
    await findClientCell('Restaurante Sensei')
    expect(mockedApi.abonos.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, per_page: 20 }))
  })

  it('con más de una página, avanzar pide la página siguiente', async () => {
    mockedApi.abonos.list.mockResolvedValue({
      data: [makeAbono()],
      meta: { total: 40, per_page: 20, current_page: 1, last_page: 2 },
    })
    renderPage()
    await findClientCell('Restaurante Sensei')

    fireEvent.click(screen.getByText('2'))

    expect(mockedApi.abonos.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, per_page: 20 }))
  })
})

// SCRUM-948 — buscadores/filtros replicando Historial de cobros.
describe('AbonosPage — SCRUM-948 buscador', () => {
  it('escribir en el buscador dispara el fetch con el param search y resetea a página 1', async () => {
    renderPage()
    await findClientCell('Restaurante Sensei')

    fireEvent.change(screen.getByPlaceholderText('abonos.buscador.searchPlaceholder'), { target: { value: 'Sensei' } })

    // SCRUM-1176 — la consulta sale tras 250 ms sin teclear.
    await waitFor(() => expect(mockedApi.abonos.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'Sensei', page: 1 }),
    ))
  })

  it('el botón "Limpiar filtros" solo aparece cuando hay algún filtro activo', async () => {
    renderPage()
    await findClientCell('Restaurante Sensei')

    expect(screen.queryByText('abonos.buscador.limpiarFiltros')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('abonos.buscador.searchPlaceholder'), { target: { value: 'Sensei' } })

    expect(await screen.findByText('abonos.buscador.limpiarFiltros')).toBeInTheDocument()

    fireEvent.click(screen.getByText('abonos.buscador.limpiarFiltros'))
    expect(screen.queryByText('abonos.buscador.limpiarFiltros')).not.toBeInTheDocument()
  })
})


describe('AbonosPage — SCRUM-1128 precarga desde Pasar a Pedido', () => {
  it('abre el formulario de abono nuevo con Cliente, Proyecto y Cotización precargados', async () => {
    renderPage({
      abonoPrefill: {
        masterClientId: 1, masterClientName: 'Grupo Delta', subClientId: 4,
        salesProjectId: 9, projectName: 'Torre Delta', quoteId: 7, quoteFolio: 'COT-0007',
      },
    })
    expect(await screen.findByDisplayValue('Grupo Delta')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Torre Delta')).toBeInTheDocument()
    expect(screen.getByDisplayValue('COT-0007')).toBeInTheDocument()
  })
})
