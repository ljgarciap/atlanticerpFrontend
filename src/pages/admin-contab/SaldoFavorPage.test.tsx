import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SaldoFavorPage from './SaldoFavorPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { SaldoFavorResult } from '@/types/adminContab'

// SCRUM-903 — "Saldo a favor de clientes" (4N), 100% solo lectura.

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
    saldoFavor: { list: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeResult(overrides: Partial<SaldoFavorResult> = {}): SaldoFavorResult {
  return {
    indicadores: { saldo_disponible_total: 620, clientes_con_saldo: 2 },
    rows: [
      {
        origen_tipo: 'abono', origen: 'Abono de más', master_client_id: 1, cliente: 'Vitrio Construcciones, S.A.',
        sales_project_id: null, proyecto: null, invoice_id: null, factura: null, asociado_a: 'Cliente master',
        referencia: 'Cobro REC-041', fecha: '2026-06-18',
        monto_original: 500, monto_usado: 0, monto_disponible: 500, estado: 'disponible',
      },
      {
        // §2.1 — una Nota de Crédito SIEMPRE entra a nivel Cliente master, nunca Proyecto/Factura.
        origen_tipo: 'descuento', origen: 'Descuento comercial', master_client_id: 3, cliente: 'Panamá Green Foods',
        sales_project_id: null, proyecto: null, invoice_id: null, factura: null, asociado_a: 'Cliente master',
        referencia: 'NC-0071', fecha: '2026-05-02',
        monto_original: 200, monto_usado: 200, monto_disponible: 0, estado: 'agotado',
      },
      {
        origen_tipo: 'abono', origen: 'Abono de más', master_client_id: 2, cliente: 'Restaurante Sensei',
        sales_project_id: 7, proyecto: 'Costa del Este', invoice_id: null, factura: null, asociado_a: 'Proyecto: Costa del Este',
        referencia: 'Cobro REC-055', fecha: '2026-07-01',
        monto_original: 120, monto_usado: 0, monto_disponible: 120, estado: 'disponible',
      },
    ],
    meta: { total: 3, per_page: 20, current_page: 1, last_page: 1 },
    ...overrides,
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <SaldoFavorPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.saldoFavor.list.mockResolvedValue(makeResult())
})

describe('SaldoFavorPage', () => {
  it('muestra los indicadores y las filas de saldo con su origen', async () => {
    renderPage()
    expect(await screen.findByText('Vitrio Construcciones, S.A.')).toBeInTheDocument()
    expect(screen.getAllByText('Abono de más').length).toBe(2)
    expect(screen.getByText('Descuento comercial')).toBeInTheDocument()
    // "agotado" aparece 2 veces: la pill de la fila y la opción del <select> de filtro.
    expect(screen.getAllByText('saldoFavor.estados.agotado').length).toBeGreaterThan(0)
  })

  it('no ofrece ninguna acción sobre las filas (solo consulta, Escenario 9)', async () => {
    renderPage()
    await screen.findByText('Vitrio Construcciones, S.A.')
    expect(screen.queryByRole('button', { name: /editar|eliminar|aplicar/i })).not.toBeInTheDocument()
  })

  // SCRUM-947 — antes filtraba localmente sobre lo ya traído (comentario propio en el código lo
  // confirmaba); con paginación real eso deja de tener sentido, ahora viaja al backend.
  it('el filtro de proyecto/factura se manda al backend, no filtra localmente', async () => {
    renderPage()
    await screen.findByText('Vitrio Construcciones, S.A.')

    fireEvent.change(screen.getByPlaceholderText('saldoFavor.filtroProyecto'), { target: { value: 'Costa del Este' } })

    await waitFor(() => expect(mockedApi.saldoFavor.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ proyecto: 'Costa del Este', page: 1 }),
    ))
  })
})

// SCRUM-947 — paginación estándar.
describe('SaldoFavorPage — SCRUM-947 paginación', () => {
  it('pide la página 1 con 20 por página por defecto', async () => {
    renderPage()
    await screen.findByText('Vitrio Construcciones, S.A.')
    expect(mockedApi.saldoFavor.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, per_page: 20 }))
  })

  it('los indicadores muestran el total real, no la cantidad de la página', async () => {
    mockedApi.saldoFavor.list.mockResolvedValue(makeResult({
      indicadores: { saldo_disponible_total: 9999, clientes_con_saldo: 50 },
      meta: { total: 45, per_page: 20, current_page: 1, last_page: 3 },
    }))
    renderPage()
    await screen.findByText('Vitrio Construcciones, S.A.')
    expect(screen.getByText('USD 9,999.00')).toBeInTheDocument()
  })

  it('con más de una página, avanzar pide la página siguiente', async () => {
    mockedApi.saldoFavor.list.mockResolvedValue(makeResult({
      meta: { total: 45, per_page: 20, current_page: 1, last_page: 3 },
    }))
    renderPage()
    await screen.findByText('Vitrio Construcciones, S.A.')

    fireEvent.click(screen.getByRole('button', { name: '2' }))

    await waitFor(() => expect(mockedApi.saldoFavor.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, per_page: 20 }),
    ))
  })
})
