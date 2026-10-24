import { useState } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import RequireAuth from './RequireAuth'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

vi.mock('@/pages/ForcePasswordChangePage', () => ({
  default: () => <div>pantalla-obligatoria</div>,
}))

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Ana', last_name: 'Pérez', email: 'ana@atlantic.test', role: 'designer',
    permissions: [], ...overrides,
  }
}

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/login" element={<div>login</div>} />
        <Route path="/app" element={<RequireAuth><div>contenido-de-la-app</div></RequireAuth>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, lastUserId: null }) })

describe('RequireAuth — cambio obligatorio de contraseña', () => {
  it('sin sesión redirige a /login', () => {
    renderGuard()
    expect(screen.getByText('login')).toBeInTheDocument()
  })

  it('con sesión normal muestra la app', () => {
    useAuthStore.setState({ user: makeUser() })
    renderGuard()
    expect(screen.getByText('contenido-de-la-app')).toBeInTheDocument()
    expect(screen.queryByText('pantalla-obligatoria')).not.toBeInTheDocument()
  })

  it('con must_change_password=false muestra la app', () => {
    useAuthStore.setState({ user: makeUser({ must_change_password: false }) })
    renderGuard()
    expect(screen.getByText('contenido-de-la-app')).toBeInTheDocument()
  })

  it('con must_change_password=true muestra SOLO la pantalla obligatoria, en lugar de la app', () => {
    useAuthStore.setState({ user: makeUser({ must_change_password: true }) })
    renderGuard()
    expect(screen.getByText('pantalla-obligatoria')).toBeInTheDocument()
    expect(screen.queryByText('contenido-de-la-app')).not.toBeInTheDocument()
  })

  it('al limpiarse el flag (sin recargar) la app reaparece', () => {
    useAuthStore.setState({ user: makeUser({ must_change_password: true }) })
    renderGuard()
    expect(screen.getByText('pantalla-obligatoria')).toBeInTheDocument()

    act(() => useAuthStore.getState().clearPasswordChangeRequired())
    expect(screen.getByText('contenido-de-la-app')).toBeInTheDocument()
  })
})

// SCRUM-1159 — sin sesión recuerda la ruta pedida (con su query) para que el login vuelva ahí.
const FromUserProbe = () => {
  const state = useLocation().state as { fromUserId?: number | null } | null
  return <div data-testid="from-user">{state?.fromUserId == null ? '(ninguno)' : String(state.fromUserId)}</div>
}

describe('RequireAuth — recuerda la ruta pedida sin sesión (SCRUM-1159)', () => {
  const LoginProbe = () => {
    const state = useLocation().state as { from?: string } | null
    return <div data-testid="from">{state?.from ?? '(sin from)'}</div>
  }

  it('manda a /login con state.from = ruta + query + hash', () => {
    render(
      <MemoryRouter initialEntries={['/bodega/pedidos/status?search=PED-2026-0009#fila']}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route path="/bodega/pedidos/status" element={<RequireAuth><div>contenido</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('from')).toHaveTextContent('/bodega/pedidos/status?search=PED-2026-0009#fila')
  })

  it('tras cerrar la sesión de una persona, state.fromUserId es SU id (para que otra persona no herede el destino)', () => {
    useAuthStore.getState().setAuth(makeUser({ id: 35 }), 'a', 'r')
    useAuthStore.getState().clearAuth()
    render(
      <MemoryRouter initialEntries={['/bodega/pedidos/status?search=X']}>
        <Routes>
          <Route path="/login" element={<FromUserProbe />} />
          <Route path="/bodega/pedidos/status" element={<RequireAuth><div>contenido</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('from-user')).toHaveTextContent('35')
  })

  it('sin sesión previa (enlace de un correo) state.fromUserId es null', () => {
    render(
      <MemoryRouter initialEntries={['/bodega/pedidos/status?search=X']}>
        <Routes>
          <Route path="/login" element={<FromUserProbe />} />
          <Route path="/bodega/pedidos/status" element={<RequireAuth><div>contenido</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('from-user')).toHaveTextContent('(ninguno)')
  })

  it('con sesión no redirige ni guarda nada', () => {
    useAuthStore.setState({ user: makeUser() })
    renderGuard()
    expect(screen.getByText('contenido-de-la-app')).toBeInTheDocument()
  })
})

// SCRUM-1158 — entrar o salir de «Ver como usuario» cambia la identidad EN SITIO: el árbol autenticado se vuelve a montar.
describe('RequireAuth — cambio de identidad en sitio (SCRUM-1158)', () => {
  function Counter() {
    const [n, setN] = useState(0)
    return <button onClick={() => setN(v => v + 1)}>clics:{n}</button>
  }

  function renderCounter() {
    return render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/login" element={<div>login</div>} />
          <Route path="/app" element={<RequireAuth><Counter /></RequireAuth>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('el estado local sobrevive mientras la identidad no cambia (p. ej. guardar el perfil)', () => {
    useAuthStore.setState({ user: makeUser() })
    renderCounter()
    fireEvent.click(screen.getByText('clics:0'))
    act(() => { useAuthStore.setState({ user: makeUser({ first_name: 'Ana María' }) }) })
    expect(screen.getByText('clics:1')).toBeInTheDocument()
  })

  it('al entrar a una sesión observada el estado de la pantalla anterior NO se hereda', () => {
    useAuthStore.setState({ user: makeUser() })
    renderCounter()
    fireEvent.click(screen.getByText('clics:0'))
    act(() => {
      useAuthStore.setState({
        user: makeUser({ id: 77, impersonation: { id: 'imp-1', actor_id: 1, actor_name: 'A', target_name: 'B', expires_at: '2099-01-01T00:00:00Z' } }),
      })
    })
    expect(screen.getByText('clics:0')).toBeInTheDocument()
  })

  it('al salir (vuelve la identidad real) tampoco se hereda el estado de la sesión observada', () => {
    useAuthStore.setState({
      user: makeUser({ id: 77, impersonation: { id: 'imp-1', actor_id: 1, actor_name: 'A', target_name: 'B', expires_at: '2099-01-01T00:00:00Z' } }),
    })
    renderCounter()
    fireEvent.click(screen.getByText('clics:0'))
    act(() => { useAuthStore.setState({ user: makeUser() }) })
    expect(screen.getByText('clics:0')).toBeInTheDocument()
  })
})

