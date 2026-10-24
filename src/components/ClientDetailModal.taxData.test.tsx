import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ClientDetailModal from './ClientDetailModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { ClientDetail } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

let permisos: string[] = []
vi.mock('@/hooks/usePermission', () => ({ usePermission: (p: string) => permisos.includes(p) }))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    clients: { get: vi.fn(), projects: vi.fn(), updateSubClientCategory: vi.fn(), validateTaxId: vi.fn(), updateSubClientTaxData: vi.fn() },
    subClients: { contacts: { create: vi.fn(), update: vi.fn(), remove: vi.fn() }, history: vi.fn() },
  },
}))

const DETAIL: ClientDetail = {
  id: 1, name: 'Grupo Delta', default_price_type: 'project',
  sub_clients: [{ id: 10, master_client_id: 1, business_name: 'Delta Residencial', tax_id: '155-0-1', tax_id_dv: '81', delivery_address: null, category: null, contacts: [] }],
}

function renderModal() {
  vi.mocked(ventasDisenoApi.clients.get).mockResolvedValue(DETAIL)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter><ClientDetailModal clientId={1} onClose={vi.fn()} /></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => { vi.clearAllMocks(); permisos = [] })

describe('ClientDetailModal — botón "Editar datos fiscales" (SCRUM-1002)', () => {
  it.each([['ventas_diseno.edit'], ['ventas_diseno.edit.client_tax_data']])('se muestra con el permiso %s', async permiso => {
    permisos = [permiso]
    renderModal()
    expect(await screen.findByText('ventasDiseno:clients.editTaxData.editar')).toBeInTheDocument()
  })

  it('no se muestra sin ninguno de los dos permisos', async () => {
    permisos = ['ventas_diseno.read', 'ventas_diseno.write']
    renderModal()
    await screen.findByText('Delta Residencial')
    expect(screen.queryByText('ventasDiseno:clients.editTaxData.editar')).not.toBeInTheDocument()
  })

  // SCRUM-1003
  it('un Consumidor Final se muestra como tal en vez de "RUC: ..."', async () => {
    permisos = []
    vi.mocked(ventasDisenoApi.clients.get).mockResolvedValue({
      ...DETAIL,
      sub_clients: [{ ...DETAIL.sub_clients[0], receptor_tipo: '02', tax_id: '', tax_id_dv: null }],
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={qc}><MemoryRouter><ClientDetailModal clientId={1} onClose={vi.fn()} /></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('ventasDiseno:clients.receptorTipo.consumidorFinal')).toBeInTheDocument()
    expect(screen.queryByText(/clients.detail.taxId/)).not.toBeInTheDocument()
  })
})
