import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import CobrosPage from './CobrosPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { PaymentSummary, OpenInvoicesResult, BankAccount, PaymentHistorialResult } from '@/types/adminContab'

// Batch 5 del cuerpo principal (SCRUM-539→544, REQ-462→467) — Cobros. Cubre: 4 tarjetas del mes
// (REQ-463), apertura automática desde query string con cliente preseleccionado (REQ-462 RN2),
// buscador+facturas abiertas+total en tiempo real (REQ-464), saldo a favor autocalculado (REQ-465),
// auto-selección de cuenta bancaria por método (REQ-466), y campos condicionales+validación (REQ-467).

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
    payments: {
      summary: vi.fn(), searchClients: vi.fn(), openInvoices: vi.fn(), defaultBankAccount: vi.fn(), register: vi.fn(),
      historial: vi.fn(), detail: vi.fn(),
    },
    bankAccounts: { list: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeSummary(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  return { total_cobrado: 8000, cantidad: 2, promedio: 4000, metodo_principal: { metodo: 'transferencia', porcentaje: 50 }, ...overrides }
}

function makeOpenInvoices(overrides: Partial<OpenInvoicesResult> = {}): OpenInvoicesResult {
  return {
    invoices: [{ id: 1, numero: 'F-0001', monto: 4000, saldo_pendiente: 4000 }, { id: 2, numero: 'F-0002', monto: 2200, saldo_pendiente: 2200 }],
    credit_balance: 0,
    master_client_name: null,
    ...overrides,
  }
}

function makeBankAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return { id: 1, banco: 'Banco General', tipo_cuenta: 'corriente', ultimos_4_digitos: '1111', moneda: 'USD', activa: true, movimientos_count: 0, ...overrides }
}

function renderPage(initialEntries: string[] = ['/admin-contab/cobros']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <CobrosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.payments.summary.mockResolvedValue(makeSummary())
  mockedApi.payments.searchClients.mockResolvedValue([])
  mockedApi.payments.openInvoices.mockResolvedValue(makeOpenInvoices())
  mockedApi.payments.defaultBankAccount.mockResolvedValue(null)
  mockedApi.bankAccounts.list.mockResolvedValue([makeBankAccount()])
  mockedApi.payments.historial.mockResolvedValue({ rows: [], total: 0 } as PaymentHistorialResult)
})

describe('CobrosPage — REQ-463 tarjetas del mes', () => {
  it('muestra total, cantidad, promedio y método principal', async () => {
    renderPage()
    await screen.findByText(/8,000\.00/)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/4,000\.00/)).toBeInTheDocument()
    expect(screen.getByText(/cobros.stats.metodoPrincipalValue/)).toBeInTheDocument()
  })

  it('sin cobros en el mes muestra el mensaje "sin datos"', async () => {
    mockedApi.payments.summary.mockResolvedValue(makeSummary({ cantidad: 0, total_cobrado: 0, promedio: 0, metodo_principal: null }))
    renderPage()
    expect(await screen.findByText('cobros.stats.sinDatos')).toBeInTheDocument()
  })
})

describe('CobrosPage — REQ-462 apertura del formulario', () => {
  it('el botón "+ Registrar cobro" abre el modal sin cliente preseleccionado', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('cobros.registrarButton'))
    expect(await screen.findByText('cobros.registrarModal.title')).toBeInTheDocument()
    expect(mockedApi.payments.openInvoices).not.toHaveBeenCalled()
  })

  it('RN2 — master_client_id+accion=nuevo-cobro en la query string abre el modal con el cliente preseleccionado', async () => {
    mockedApi.payments.openInvoices.mockResolvedValue(makeOpenInvoices({ master_client_name: 'Vitrio Retail, S.A.' }))
    renderPage(['/admin-contab/cobros?master_client_id=42&accion=nuevo-cobro'])

    expect(await screen.findByText('cobros.registrarModal.title')).toBeInTheDocument()
    await waitFor(() => expect(mockedApi.payments.openInvoices).toHaveBeenCalledWith(42))
  })
})
