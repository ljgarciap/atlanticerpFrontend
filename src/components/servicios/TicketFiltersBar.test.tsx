import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TicketFiltersBar, { EMPTY_TICKET_FILTERS } from './TicketFiltersBar'
import { catalogsApi } from '@/api/catalogsApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/catalogsApi', () => ({ catalogsApi: { list: vi.fn() } }))
const api = vi.mocked(catalogsApi, true)

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TicketFiltersBar value={EMPTY_TICKET_FILTERS} onChange={() => {}} technicians={[]} shown={0} total={0} />
    </QueryClientProvider>,
  )
}

// Fase 7b — el filtro de tipo sale del catálogo `ticket_type` de la empresa, no de una lista fija.
describe('TicketFiltersBar — tipos de ticket del catálogo', () => {
  it('ofrece los tipos del catálogo, incluido uno propio de la empresa', async () => {
    api.list.mockResolvedValue([
      { id: 1, domain: 'ticket_type', key: 'claim', label: 'Reclamo', sort_order: 0, is_active: true, is_system: true, props: { comportamiento: 'reclamo' } },
      { id: 2, domain: 'ticket_type', key: 'mantenimiento', label: 'Mantenimiento', sort_order: 1, is_active: true, is_system: false, props: { comportamiento: 'reclamo' } },
    ])
    renderBar()

    const select = screen.getByLabelText('tickets.table.columns.type')
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Mantenimiento' })).toBeInTheDocument())
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['tickets.filters.allTypes', 'Reclamo', 'Mantenimiento'])
  })

  it('si el catálogo no responde, ofrece los 4 tipos de siempre', async () => {
    api.list.mockRejectedValue(new Error('500'))
    renderBar()

    await waitFor(() => expect(api.list).toHaveBeenCalled())
    const select = screen.getByLabelText('tickets.table.columns.type')
    expect(within(select).getAllByRole('option').map(o => o.getAttribute('value'))).toEqual(['', 'installation', 'warranty', 'claim', 'retrofit'])
  })
})
