import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import HistorialCobrosPanel from './HistorialCobrosPanel'
import { adminContabApi } from '@/api/adminContabApi'
import type { PaymentHistorialResult } from '@/types/adminContab'

// Batch 6 del cuerpo principal (SCRUM-547, REQ-470) — historial de cobros: filtros + búsqueda.

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
    payments: { historial: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeResult(overrides: Partial<PaymentHistorialResult> = {}): PaymentHistorialResult {
  return {
    total: 6,
    rows: [
      {
        id: 1, numero_recibo: 'REC-006', fecha: '2026-06-28T00:00:00Z', cliente: 'Hotel Riu',
        facturas: ['F-0010'], monto_recibido: 500, metodo_pago: 'link_pago', estado: 'esperando_confirmacion',
        referencia: 'LINK-88213', registrado_por: 'Felix Campos', tiene_comprobante: true,
      },
      {
        id: 2, numero_recibo: 'REC-005', fecha: '2026-06-18T00:00:00Z', cliente: 'Grupo Sensei',
        facturas: ['F-0009'], monto_recibido: 4000, metodo_pago: 'transferencia', estado: 'confirmado',
        referencia: 'TRF-77410', registrado_por: 'Felix Campos', tiene_comprobante: false,
      },
    ],
    ...overrides,
  }
}

function renderPanel(onSelectPayment = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <HistorialCobrosPanel onSelectPayment={onSelectPayment} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.payments.historial.mockResolvedValue(makeResult())
})

describe('HistorialCobrosPanel — REQ-470', () => {
  it('muestra las filas del historial con el contador Mostrando X de Y', async () => {
    renderPanel()

    expect(await screen.findByRole('cell', { name: 'Hotel Riu' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Grupo Sensei' })).toBeInTheDocument()
    expect(screen.getByText('cobros.historial.resultCount:mostrados=2:total=6')).toBeInTheDocument()
  })

  it('clic en una fila llama a onSelectPayment con el id del cobro', async () => {
    const onSelectPayment = vi.fn()
    renderPanel(onSelectPayment)

    fireEvent.click(await screen.findByRole('cell', { name: 'Hotel Riu' }))
    expect(onSelectPayment).toHaveBeenCalledWith(1)
  })

  it('Escenario 1 — filtrar por método y cliente combina ambos filtros (AND)', async () => {
    renderPanel()
    await screen.findByRole('cell', { name: 'Hotel Riu' })

    fireEvent.change(screen.getByDisplayValue('cobros.historial.filtroCliente'), { target: { value: 'Hotel Riu' } })
    fireEvent.change(screen.getByDisplayValue('cobros.historial.filtroMetodo'), { target: { value: 'link_pago' } })

    await waitFor(() => expect(mockedApi.payments.historial).toHaveBeenLastCalledWith(
      expect.objectContaining({ cliente: 'Hotel Riu', metodo: 'link_pago' }),
    ))
  })

  it('Escenario 2 — buscar texto libre lo manda como filtro search', async () => {
    renderPanel()
    await screen.findByRole('cell', { name: 'Hotel Riu' })

    fireEvent.change(screen.getByPlaceholderText('cobros.historial.searchPlaceholder'), { target: { value: 'REC-004' } })

    await waitFor(() => expect(mockedApi.payments.historial).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'REC-004' }),
    ))
  })

  it('RN4 — "Limpiar filtros" resetea todos los campos', async () => {
    renderPanel()
    await screen.findByRole('cell', { name: 'Hotel Riu' })

    fireEvent.change(screen.getByPlaceholderText('cobros.historial.searchPlaceholder'), { target: { value: 'REC-004' } })
    fireEvent.click(await screen.findByText('cobros.historial.limpiarFiltros'))

    await waitFor(() => expect(mockedApi.payments.historial).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: undefined, cliente: undefined, metodo: undefined, estado: undefined, desde: undefined, hasta: undefined }),
    ))
  })

  it('sin resultados muestra el mensaje vacío', async () => {
    mockedApi.payments.historial.mockResolvedValue(makeResult({ rows: [], total: 0 }))
    renderPanel()

    expect(await screen.findByText('cobros.historial.vacio')).toBeInTheDocument()
  })
})
