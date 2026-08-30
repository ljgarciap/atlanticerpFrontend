import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ClaimDetailModal from './ClaimDetailModal'
import { comprasApi } from '@/api/comprasApi'
import type { PurchaseOrderClaimDetail } from '@/types/compras'

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) => {
      if (typeof opts === 'object' && opts) {
        const parts = Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(',')
        return `${key} ${parts}`
      }
      return key
    },
  }),
}))

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    claims: {
      get: vi.fn(), updateStatus: vi.fn(), updateResolution: vi.fn(), uploadPhoto: vi.fn(), pdf: vi.fn(),
    },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeClaim(overrides: Partial<PurchaseOrderClaimDetail> = {}): PurchaseOrderClaimDetail {
  return {
    id: 1, code: 'R-1001', purchase_order_id: 13, provider_name: 'LightCorp', provider_id: 1,
    product: 'Candelabro Cristal Imperial', service_ticket: null,
    status: 'en_revision', status_changed_at: '2026-08-01T00:00:00Z', needs_attention: false,
    total_amount: 90, created_at: '2026-08-01T00:00:00Z',
    description: '3 unidades llegaron con el vidrio roto.', expected_resolution: 'reposicion',
    resolved_at: null, service_tickets: [], status_history: [],
    lines: [{ id: 1, purchase_order_line_id: 501, description: 'Candelabro Cristal Imperial', affected_quantity: 2, unit_cost: 45, subtotal: 90 }],
    photos: [],
    ...overrides,
  }
}

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClaimDetailModal claimId={1} onClose={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ClaimDetailModal (SCRUM-259 real — REQ-196)', () => {
  it('muestra el producto afectado + cantidad en el encabezado, y Unidades afectadas/Monto en disputa', async () => {
    mockedComprasApi.claims.get.mockResolvedValue(makeClaim())
    renderModal()

    await waitFor(() => expect(screen.getByText(/Candelabro Cristal Imperial/)).toBeInTheDocument())
    expect(screen.getByText('compras:claims.detail.unitsCount qty=2')).toBeInTheDocument()
    expect(screen.getByText('$90.00')).toBeInTheDocument()
  })

  it('el historial de 3 etapas fijas muestra Resuelto atenuado como Pendiente cuando el reclamo sigue En revisión', async () => {
    mockedComprasApi.claims.get.mockResolvedValue(makeClaim({ status: 'en_revision', resolved_at: null }))
    renderModal()

    await waitFor(() => expect(screen.getByText('compras:claims.detail.stages.reportado')).toBeInTheDocument())
    expect(screen.getByText('compras:claims.detail.stages.en_revision')).toBeInTheDocument()
    expect(screen.getByText('compras:claims.detail.stages.resuelto')).toBeInTheDocument()

    // Resuelto pendiente -- solo UNA aparición de "Pendiente" (Reportado/En revisión tienen fecha real).
    expect(screen.getAllByText('compras:claims.detail.pending')).toHaveLength(1)
  })

  it('el historial marca Resuelto activo con fecha cuando el reclamo ya fue resuelto', async () => {
    mockedComprasApi.claims.get.mockResolvedValue(makeClaim({ status: 'resuelto', resolved_at: '2026-08-05T00:00:00Z' }))
    renderModal()

    await waitFor(() => expect(screen.getByText('compras:claims.detail.stages.resuelto')).toBeInTheDocument())
    expect(screen.queryByText('compras:claims.detail.pending')).not.toBeInTheDocument()
  })

  it('cambiar el desplegable de "Tipo de resolución" llama al endpoint de actualización', async () => {
    mockedComprasApi.claims.get.mockResolvedValue(makeClaim())
    mockedComprasApi.claims.updateResolution.mockResolvedValue(makeClaim({ expected_resolution: 'negado' }))
    renderModal()

    await waitFor(() => expect(screen.getByText(/Candelabro Cristal Imperial/)).toBeInTheDocument())

    const selects = screen.getAllByRole('combobox')
    // El primer <select> es "Tipo de resolución" (antes que "Estado" en la fila 2).
    fireEvent.change(selects[0], { target: { value: 'negado' } })

    await waitFor(() => expect(mockedComprasApi.claims.updateResolution).toHaveBeenCalledWith(1, 'negado'))
  })

  it('"Ver Orden asociada" navega a /compras/ordenes/:id', async () => {
    mockedComprasApi.claims.get.mockResolvedValue(makeClaim())
    renderModal()

    await waitFor(() => expect(screen.getByText(/Candelabro Cristal Imperial/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:claims.detail.viewOrder'))
    expect(navigateMock).toHaveBeenCalledWith('/compras/ordenes/13')
  })

  it('"Descargar PDF del reclamo" pide el PDF real', async () => {
    mockedComprasApi.claims.get.mockResolvedValue(makeClaim())
    mockedComprasApi.claims.pdf.mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
    renderModal()

    await waitFor(() => expect(screen.getByText(/Candelabro Cristal Imperial/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('compras:claims.detail.downloadPdf'))

    await waitFor(() => expect(mockedComprasApi.claims.pdf).toHaveBeenCalledWith(1))
  })
})
