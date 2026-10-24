import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ClientesFiscalPage from './ClientesFiscalPage'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import type { FiscalDirectoryResult } from '@/types/ventasDiseno'
import type { UserInfo } from '@/types/auth'

// SCRUM-1182 — mismo defecto que SCRUM-1181 (`usePermission(a) || usePermission(b)`): con el `usePermission` REAL, cambiar los permisos en
// sitio entre renders rompía las reglas de hooks. ClientesFiscalPage.test.tsx usa un doble sin hooks y no puede verlo.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },   // el store real importa i18n
}))
vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: { clients: { fiscalDirectory: vi.fn(), validateTaxId: vi.fn(), updateSubClientTaxData: vi.fn() } },
}))
vi.mock('@/api/adminContabApi', () => ({ adminContabApi: { clientesFiscal: { setItbmsExemption: vi.fn() } } }))

const K = 'adminContab:clientesFiscal'
const HOOKS_ERROR = /order of Hooks|Rendered (more|fewer) hooks/i
const RESULTADO: FiscalDirectoryResult = {
  data: [{ id: 1, master_client_id: 10, master_client_name: 'Grupo Delta', business_name: 'Delta Libre S.A.', receptor_tipo: '01', tax_id: '155-1', tax_id_dv: '81', bloqueado: false, itbms_exento: false, itbms_exencion_documento: null }],
  meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
}

const userWith = (permissions: string[]): UserInfo => ({
  id: 1, first_name: 'Test', last_name: 'User', email: 't@t.com', role: 'designer', permissions,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(ventasDisenoApi.clients.fiscalDirectory).mockResolvedValue(RESULTADO)
})

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><ClientesFiscalPage /></QueryClientProvider>)
}

function hooksErrors(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.map(c => `${String(c[0])} ${String(c[1] ?? '')}`).filter(m => HOOKS_ERROR.test(m))
}

describe('ClientesFiscalPage — cambio de permisos en sitio sin romper las reglas de hooks (SCRUM-1182)', () => {
  it('de un permiso que acorta (client_tax_data) a ninguno: no lanza y la pantalla pasa a «sin acceso»', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ user: userWith(['ventas_diseno.edit.client_tax_data']) })
    renderPage()
    expect(await screen.findByText('Delta Libre S.A.')).toBeInTheDocument()

    expect(() => act(() => { useAuthStore.setState({ user: userWith([]) }) })).not.toThrow()

    expect(hooksErrors(spy)).toEqual([])
    expect(screen.queryByText('Delta Libre S.A.')).not.toBeInTheDocument()
    spy.mockRestore()
  })

  it('y de ningún permiso a uno que acorta: no lanza y aparece el listado con su botón', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ user: userWith([]) })
    renderPage()
    expect(screen.queryByText('Delta Libre S.A.')).not.toBeInTheDocument()

    expect(() => act(() => { useAuthStore.setState({ user: userWith(['ventas_diseno.edit.client_tax_data']) }) })).not.toThrow()

    expect(hooksErrors(spy)).toEqual([])
    expect(await screen.findByText('Delta Libre S.A.')).toBeInTheDocument()
    expect(screen.getByText(`${K}.editar`)).toBeInTheDocument()
    spy.mockRestore()
  })

  it('con solo ventas_diseno.edit también edita, y varios cambios seguidos no rompen', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ user: userWith(['ventas_diseno.edit.client_tax_data']) })
    renderPage()
    await screen.findByText('Delta Libre S.A.')

    expect(() => {
      act(() => { useAuthStore.setState({ user: userWith([]) }) })
      act(() => { useAuthStore.setState({ user: userWith(['ventas_diseno.edit']) }) })
    }).not.toThrow()

    expect(hooksErrors(spy)).toEqual([])
    expect(await screen.findByText(`${K}.editar`)).toBeInTheDocument()
    spy.mockRestore()
  })
})
