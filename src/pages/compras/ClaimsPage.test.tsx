import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ClaimsPage from './ClaimsPage'
import { comprasApi } from '@/api/comprasApi'
import type { PurchaseOrderClaimListResponse, PurchaseOrderClaimSummary } from '@/types/compras'

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
    claims: { list: vi.fn(), updateStatus: vi.fn() },
  },
}))

const mockedComprasApi = vi.mocked(comprasApi, true)

function makeSummary(overrides: Partial<PurchaseOrderClaimSummary> = {}): PurchaseOrderClaimSummary {
  return {
    id: 1, code: 'R-1001', purchase_order_id: 13, provider_name: 'LightCorp', provider_id: 1,
    product: 'Candelabro Cristal Imperial', expected_resolution: 'reposicion',
    status: 'en_revision', status_changed_at: '2026-08-01T00:00:00Z', needs_attention: false,
    total_amount: 90, created_at: '2026-08-01T00:00:00Z', service_ticket: null,
    ...overrides,
  }
}

function makeResponse(overrides: Partial<PurchaseOrderClaimListResponse> = {}): PurchaseOrderClaimListResponse {
  return {
    data: [makeSummary()],
    meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    kpis: { total: 1, reportados_en_revision: 1, resueltos_este_mes: 0, disputed_amount: 90 },
    filters: { providers: [{ id: 1, name: 'LightCorp' }] },
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClaimsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ClaimsPage (SCRUM-257/258)', () => {
  it('muestra los 4 KPIs nuevos (Total, Reportados/En revisión, Resueltos este mes, Monto en disputa en $)', async () => {
    mockedComprasApi.claims.list.mockResolvedValue(makeResponse({
      kpis: { total: 5, reportados_en_revision: 3, resueltos_este_mes: 2, disputed_amount: 1234.5 },
    }))
    renderPage()

    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument())
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('$1,234.50')).toBeInTheDocument()
  })

  it('los chips son exactamente Todos/⚠️ Atención/Reportado/En revisión/Resuelto', async () => {
    mockedComprasApi.claims.list.mockResolvedValue(makeResponse())
    renderPage()

    await waitFor(() => expect(mockedComprasApi.claims.list).toHaveBeenCalled())
    expect(screen.getByText('compras:claims.chips.todos')).toBeInTheDocument()
    expect(screen.getByText('compras:claims.chips.atencion')).toBeInTheDocument()
    expect(screen.getByText('compras:claims.chips.reportado')).toBeInTheDocument()
    expect(screen.getByText('compras:claims.chips.en_revision')).toBeInTheDocument()
    expect(screen.getByText('compras:claims.chips.resuelto')).toBeInTheDocument()
    expect(screen.queryByText('compras:claims.chips.all')).not.toBeInTheDocument()
  })

  it('clic en un chip filtra por el chip correspondiente', async () => {
    mockedComprasApi.claims.list.mockResolvedValue(makeResponse())
    renderPage()

    await waitFor(() => expect(mockedComprasApi.claims.list).toHaveBeenCalled())
    fireEvent.click(screen.getByText('compras:claims.chips.atencion'))

    await waitFor(() => expect(mockedComprasApi.claims.list).toHaveBeenCalledWith(
      expect.objectContaining({ chip: 'atencion' }),
    ))
  })

  it('el filtro de proveedor y de tipo de resolución se combinan con la búsqueda', async () => {
    mockedComprasApi.claims.list.mockResolvedValue(makeResponse())
    renderPage()

    // Esperar a que la lista de proveedores del filtro haya cargado (viene en la misma
    // respuesta que la primera página de reclamos), no solo a que se haya llamado el mock.
    await waitFor(() => expect(screen.getByText('LightCorp', { selector: 'option' })).toBeInTheDocument())

    fireEvent.change(screen.getByText('compras:claims.filters.allProviders').closest('select')!, { target: { value: '1' } })
    fireEvent.change(screen.getByText('compras:claims.filters.allResolutions').closest('select')!, { target: { value: 'negado' } })
    fireEvent.change(screen.getByPlaceholderText('compras:claims.filters.searchPlaceholder'), { target: { value: 'candelabro' } })
    fireEvent.click(screen.getByText('common:actions.search'))

    await waitFor(() => expect(mockedComprasApi.claims.list).toHaveBeenCalledWith({
      chip: undefined, search: 'candelabro', provider_id: 1, expected_resolution: 'negado',
      page: 1, per_page: 20,
    }))
  })

  it('"Limpiar filtros" resetea chip/búsqueda/proveedor/resolución a la vez', async () => {
    mockedComprasApi.claims.list.mockResolvedValue(makeResponse())
    renderPage()

    await waitFor(() => expect(mockedComprasApi.claims.list).toHaveBeenCalled())
    fireEvent.click(screen.getByText('compras:claims.chips.resuelto'))
    await waitFor(() => expect(screen.getByText('compras:claims.filters.clear')).toBeInTheDocument())

    fireEvent.click(screen.getByText('compras:claims.filters.clear'))

    await waitFor(() => expect(mockedComprasApi.claims.list).toHaveBeenCalledWith({
      chip: undefined, search: undefined, provider_id: undefined, expected_resolution: undefined,
      page: 1, per_page: 20,
    }))
    expect(screen.queryByText('compras:claims.filters.clear')).not.toBeInTheDocument()
  })

  it('la tabla muestra las 8 columnas del requerimiento, en orden, con Ticket Servicios de solo lectura', async () => {
    mockedComprasApi.claims.list.mockResolvedValue(makeResponse())
    renderPage()

    await waitFor(() => expect(screen.getByText('R-1001')).toBeInTheDocument())

    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual([
      'compras:claims.table.code',
      'compras:claims.table.order',
      'compras:claims.table.provider',
      'compras:claims.table.product',
      'compras:claims.table.resolutionType',
      'compras:claims.table.status',
      'compras:claims.table.reportedDate',
      'compras:claims.table.serviceTicket',
      'compras:orders.table.actions',
    ])

    expect(screen.getByText('Candelabro Cristal Imperial')).toBeInTheDocument()
    // Ticket Servicios vacío -- solo lectura, sin ningún control interactivo en esa celda.
    const ticketCell = screen.getByText('—', { selector: 'td.text-slate-400' })
    expect(ticketCell.querySelector('button, select, input')).toBeNull()

    // El selector de Estado es único por fila (no se duplica con ningún otro control de estado).
    expect(screen.getAllByRole('combobox').filter(el => el.closest('td'))).toHaveLength(1)
  })
})
