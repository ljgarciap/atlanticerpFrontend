import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ClientDetailModal from './ClientDetailModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import type { ClientDetail } from '@/types/ventasDiseno'
import type { UserInfo } from '@/types/auth'

// SCRUM-1182 — `usePermission(a) || usePermission(b)` no ejecutaba la segunda cuando la primera era true y cambiaba la cantidad de hooks entre
// renders: al cambiar los permisos EN SITIO (entrar o salir de «Ver como usuario») React lanzaba «Rendered more/fewer hooks». A diferencia de
// ClientDetailModal.taxData.test.tsx, acá se usa el `usePermission` REAL (con hooks), no un doble: solo así se ve el defecto.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
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
const EDITAR = 'ventasDiseno:clients.editTaxData.editar'
const HOOKS_ERROR = /order of Hooks|Rendered (more|fewer) hooks/i

const userWith = (permissions: string[]): UserInfo => ({
  id: 1, first_name: 'Test', last_name: 'User', email: 't@t.com', role: 'designer', permissions,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(ventasDisenoApi.clients.get).mockResolvedValue(DETAIL)
})

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><MemoryRouter><ClientDetailModal clientId={1} onClose={vi.fn()} /></MemoryRouter></QueryClientProvider>)
}

function hooksErrors(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(c => `${String(c[0])} ${String(c[1] ?? '')}`).filter(m => HOOKS_ERROR.test(m))
}

describe('ClientDetailModal — cambio de permisos en sitio sin romper las reglas de hooks (SCRUM-1182)', () => {
  it('de un permiso que acorta (ventas_diseno.edit) a ninguno: no lanza y el botón desaparece', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ user: userWith(['ventas_diseno.edit']) })
    renderModal()
    expect(await screen.findByText(EDITAR)).toBeInTheDocument()

    expect(() => act(() => { useAuthStore.setState({ user: userWith([]) }) })).not.toThrow()

    expect(hooksErrors(spy)).toEqual([])
    expect(screen.queryByText(EDITAR)).not.toBeInTheDocument()
    expect(screen.getByText('Delta Residencial')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('y de ningún permiso a uno que acorta: no lanza y el botón aparece', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ user: userWith([]) })
    renderModal()
    await screen.findByText('Delta Residencial')
    expect(screen.queryByText(EDITAR)).not.toBeInTheDocument()

    expect(() => act(() => { useAuthStore.setState({ user: userWith(['ventas_diseno.edit']) }) })).not.toThrow()

    expect(hooksErrors(spy)).toEqual([])
    expect(await screen.findByText(EDITAR)).toBeInTheDocument()
    spy.mockRestore()
  })

  it('el permiso angosto solo (ventas_diseno.edit.client_tax_data) sigue habilitando el botón, y varios cambios seguidos no rompen', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ user: userWith(['ventas_diseno.edit.client_tax_data']) })
    renderModal()
    expect(await screen.findByText(EDITAR)).toBeInTheDocument()

    expect(() => {
      act(() => { useAuthStore.setState({ user: userWith([]) }) })
      act(() => { useAuthStore.setState({ user: userWith(['ventas_diseno.edit']) }) })
      act(() => { useAuthStore.setState({ user: userWith(['superadmin.all']) }) })
    }).not.toThrow()

    expect(hooksErrors(spy)).toEqual([])
    expect(screen.getByText(EDITAR)).toBeInTheDocument()   // superadmin.all lo habilita
    spy.mockRestore()
  })
})
