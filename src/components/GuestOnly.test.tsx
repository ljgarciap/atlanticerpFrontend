import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import GuestOnly from './GuestOnly'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

const user = (overrides: Partial<UserInfo> = {}): UserInfo => ({
  id: 1, first_name: 'Vendedor', last_name: 'Q', email: 'n@q.c', role: 'vendedor',
  permissions: ['ventas_diseno.read'], modules: { ventas_diseno: { view: true, view_team: false, edit: false, approve: false } }, ...overrides,
})

const Probe = () => { const l = useLocation(); return <span data-testid="destino">{l.pathname}{l.search}</span> }

function renderGuest(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<GuestOnly><div>pantalla-login</div></GuestOnly>} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { useAuthStore.setState({ user: null, accessToken: null, refreshToken: null }) })

// SCRUM-1159 — al iniciar sesión el store cambia y este guard redirige en cuanto re-renderiza: debe respetar el destino pedido antes del login.
describe('GuestOnly', () => {
  it('sin sesión muestra la pantalla', () => {
    renderGuest()
    expect(screen.getByText('pantalla-login')).toBeInTheDocument()
  })

  it('con sesión y destino guardado (state.from) redirige AL DESTINO, con su query', () => {
    useAuthStore.setState({ user: user() })
    renderGuest({ from: '/bodega/pedidos/status?search=PED-2026-0009' })
    expect(screen.getByTestId('destino')).toHaveTextContent('/bodega/pedidos/status?search=PED-2026-0009')
  })

  it('con destino ligado a la MISMA persona (sesión expirada) redirige al destino', () => {
    useAuthStore.setState({ user: user({ id: 35 }) })
    renderGuest({ from: '/bodega/pedidos/status?search=PED-2026-0009', fromUserId: 35 })
    expect(screen.getByTestId('destino')).toHaveTextContent('/bodega/pedidos/status?search=PED-2026-0009')
  })

  // Pre-QA N-1: Vendedor cierra sesión en Status con una búsqueda y entra otra persona en el mismo equipo.
  it('con destino ligado a OTRA persona va a su inicio: no hereda la ruta ni la búsqueda de la anterior', () => {
    useAuthStore.setState({ user: user({ id: 6 }) })
    renderGuest({ from: '/bodega/pedidos/status?search=PED-2026-0009', fromUserId: 35 })
    expect(screen.getByTestId('destino')).toHaveTextContent('/ventas-diseno/home')
    expect(screen.getByTestId('destino').textContent).not.toContain('search')
  })

  it('con sesión y sin destino guardado redirige al inicio del usuario, como siempre', () => {
    useAuthStore.setState({ user: user() })
    renderGuest()
    expect(screen.getByTestId('destino')).toHaveTextContent('/ventas-diseno/home')
  })

  it.each([['https://evil.example/x'], ['//evil.example/x'], ['javascript:alert(1)'], ['/login'], [42]])('un destino no seguro (%s) se ignora y va al inicio', (from) => {
    useAuthStore.setState({ user: user() })
    renderGuest({ from })
    const destino = screen.getByTestId('destino').textContent ?? ''
    expect(destino).toBe('/ventas-diseno/home')
  })
})
