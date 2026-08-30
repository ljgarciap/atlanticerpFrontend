import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AntiguedadCarteraPanel from './AntiguedadCarteraPanel'
import { adminContabApi } from '@/api/adminContabApi'
import type { InvoiceAgingResult } from '@/types/adminContab'

// Batch Home (SCRUM-503→512), Grupo 4 (SCRUM-512, REQ-435) — "Antigüedad de cuentas por cobrar".
// Reusa `useInvoiceAging()` (mismo hook que Facturación) — cubre los 4 rangos renderizados y que
// el último (+90 días) queda visualmente destacado (RN4).

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
    invoices: { aging: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <AntiguedadCarteraPanel />
    </QueryClientProvider>,
  )
}

describe('AntiguedadCarteraPanel', () => {
  it('renderiza los 4 rangos y destaca el último (+90 días)', async () => {
    const data: InvoiceAgingResult = {
      ranges: [
        { desde_dias: 0, hasta_dias: 30, cantidad: 14, monto: 22100 },
        { desde_dias: 31, hasta_dias: 60, cantidad: 6, monto: 11300 },
        { desde_dias: 61, hasta_dias: 90, cantidad: 3, monto: 5600 },
        { desde_dias: 91, hasta_dias: null, cantidad: 2, monto: 2800 },
      ],
    }
    mockedApi.invoices.aging.mockResolvedValue(data)
    renderPanel()

    expect(await screen.findByText('adminContab:facturacion.aging.rango:desde=0:hasta=30')).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.aging.rango:desde=31:hasta=60')).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.aging.rango:desde=61:hasta=90')).toBeInTheDocument()
    expect(screen.getByText('adminContab:facturacion.aging.masDe:desde=91')).toBeInTheDocument()

    const cards = document.querySelectorAll('.grid > div')
    expect(cards).toHaveLength(4)
    // Los primeros 3 rangos usan el borde neutro; el último (+90 días) usa el destacado en rojo.
    expect(cards[0]?.className).not.toContain('border-red-200')
    expect(cards[3]?.className).toContain('border-red-200')
  })
})
