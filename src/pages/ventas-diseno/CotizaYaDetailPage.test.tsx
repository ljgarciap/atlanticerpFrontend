import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VentasDisenoCotizaYaDetailPage from './CotizaYaDetailPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import type { QuoteDetail } from '@/types/ventasDiseno'
import * as pdf from './cotizaYaPdf'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/ventasDisenoApi', () => ({ ventasDisenoApi: { cotizaya: { get: vi.fn(), parts: {} } } }))
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))
vi.mock('./cotizaYaPdf', () => ({ downloadCotizaYaPdf: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/components/QuotePartCard', () => ({ default: ({ part, canEdit }: { part: { name: string }; canEdit: boolean }) => <div data-testid="part-card" data-can-edit={String(canEdit)}>{part.name}</div> }))

const api = vi.mocked(ventasDisenoApi, true)

const detail = {
  id: 50, origin: 'cotizaya', cotizaya: { customer_name: 'Zulema Quintero', customer_phone: '6000-1234' }, folio: 'CotizaYA-2026-0001',
  generated_at: '2026-10-08T14:00:00Z', description: 'Venta de mostrador', owner: { id: 9, name: 'Ana Pérez', phone: null },
  contacts: [], discount_mode: 'line', price_type: 'public', min_margin_percent: 30,
  parts: [{ id: 1, name: 'Sala', position: 1, subtotal: 200, items: [] }], subtotal: 200, itbms: 14, grand_total: 214,
  observations: 'Entrega en tienda', conditions_text: 'Condiciones congeladas',
} as unknown as QuoteDetail

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/ventas-diseno/cotizaya/50']}>
      <QueryClientProvider client={qc}>
        <Routes><Route path="/ventas-diseno/cotizaya/:id" element={<VentasDisenoCotizaYaDetailPage />} /></Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuthStore).mockImplementation(((selector?: (s: { user: unknown }) => unknown) => {
    const state = { user: { modules: { ventas_diseno: { view_team: false } } } }
    return selector ? selector(state) : state
  }) as never)
  api.cotizaya.get.mockResolvedValue(detail)
})

describe('CotizaYA — detalle (SCRUM-1120)', () => {
  it('muestra el cliente libre, teléfono, descripción, partidas en solo lectura, totales y condiciones', async () => {
    renderPage()
    expect(await screen.findByTestId('cotizaya-detail-customer')).toHaveTextContent('Zulema Quintero')
    expect(screen.getByText('6000-1234')).toBeInTheDocument()
    expect(screen.getByText('Venta de mostrador')).toBeInTheDocument()
    expect(screen.getByText('Entrega en tienda')).toBeInTheDocument()
    expect(screen.getByText('Condiciones congeladas')).toBeInTheDocument()
    expect(screen.getByTestId('cotizaya-detail-total')).toHaveTextContent('$214.00')
    expect(screen.getByTestId('part-card')).toHaveAttribute('data-can-edit', 'false')
  })

  it('descarga el PDF de la cotización', async () => {
    renderPage()
    fireEvent.click(await screen.findByTestId('cotizaya-detail-pdf'))
    await waitFor(() => expect(pdf.downloadCotizaYaPdf).toHaveBeenCalledWith(50, 'CotizaYA-2026-0001'))
  })

  it('si la descarga del PDF falla lo avisa', async () => {
    vi.mocked(pdf.downloadCotizaYaPdf).mockRejectedValueOnce(new Error('500'))
    renderPage()
    fireEvent.click(await screen.findByTestId('cotizaya-detail-pdf'))
    expect(await screen.findByTestId('cotizaya-pdf-error')).toBeInTheDocument()
  })

  it('si no se puede cargar muestra el error', async () => {
    api.cotizaya.get.mockRejectedValue(new Error('404'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('ventasDiseno:cotizaya.detail.loadError')
  })
})
