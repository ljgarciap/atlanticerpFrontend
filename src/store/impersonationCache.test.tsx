import { render, screen, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import RequireAuth from '@/components/RequireAuth'
import { useAuthStore } from './authStore'
import { queryClient } from '@/lib/queryClient'
import type { UserInfo } from '@/types/auth'

// SCRUM-1158 (Pre-QA UI-C, "no verificado") — la caché de consultas se limpia al ENTRAR y al SALIR de «Ver como»: las query keys no llevan el
// usuario, así que sin la limpieza una identidad heredaría los datos de la otra hasta el próximo refetch. Se prueba de punta a punta con la
// instancia real de queryClient, una consulta viva y el RequireAuth real (que remonta la pantalla al cambiar de identidad).

vi.mock('@/pages/ForcePasswordChangePage', () => ({ default: () => null }))

const actor: UserInfo = { id: 1, first_name: 'Super', last_name: 'Admin', email: 's@x.test', role: 'superadmin', permissions: ['superadmin.all'] }
const observed: UserInfo = {
  id: 77, first_name: 'Vera', last_name: 'V', email: 'v@x.test', role: 'vendedor', permissions: [],
  impersonation: { id: 'imp-1', actor_id: 1, actor_name: 'Super Admin', target_name: 'Vera', expires_at: '2099-01-01T00:00:00Z' },
}

const fetchCount = { n: 0 }

// La misma query key para cualquier identidad, como en la app (las keys reales no incluyen el usuario). El servidor responde según quién pregunta.
function Probe() {
  const { data } = useQuery({
    queryKey: ['pipeline', 'own'],
    queryFn: async () => { fetchCount.n++; return `datos de ${useAuthStore.getState().user?.id}` },
    staleTime: Infinity,   // si la caché NO se limpiara, nunca se volvería a pedir
  })
  return <div data-testid="probe">{data ?? 'cargando'}</div>
}

function renderApp() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/login" element={<div>login</div>} />
          <Route path="/app" element={<RequireAuth><Probe /></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const cachedValues = () => queryClient.getQueryCache().getAll().map(q => q.state.data)

beforeEach(() => {
  fetchCount.n = 0
  queryClient.clear()
  useAuthStore.getState().clearAuth()
  sessionStorage.clear(); localStorage.clear()
  useAuthStore.getState().setAuth(actor, 'actor-access', 'actor-refresh')
})

describe('caché de consultas y «Ver como usuario»', () => {
  it('al ENTRAR, la persona observada NO hereda lo que estaba en caché del superadmin', async () => {
    renderApp()
    expect(await screen.findByText('datos de 1')).toBeInTheDocument()
    expect(cachedValues()).toContain('datos de 1')

    act(() => { expect(useAuthStore.getState().startImpersonation(observed, 'imp-access')).toBe(true) })

    expect(await screen.findByText('datos de 77')).toBeInTheDocument()
    expect(cachedValues()).not.toContain('datos de 1')
    expect(fetchCount.n).toBe(2)   // se volvió a pedir con la identidad nueva, aunque staleTime sea infinito
  })

  it('al SALIR, el superadmin NO hereda nada de lo que vio la persona observada', async () => {
    renderApp()
    await screen.findByText('datos de 1')
    act(() => { useAuthStore.getState().startImpersonation(observed, 'imp-access') })
    await screen.findByText('datos de 77')
    expect(cachedValues()).toContain('datos de 77')

    act(() => { expect(useAuthStore.getState().restoreOrigin()).toBe(true) })

    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('datos de 1'))
    expect(screen.queryByText('datos de 77')).not.toBeInTheDocument()
    expect(cachedValues()).not.toContain('datos de 77')
    expect(fetchCount.n).toBe(3)
  })

  it('si la sesión real ya no existe y se cierra la sesión, tampoco queda nada del observado', async () => {
    useAuthStore.setState({ user: observed, accessToken: 'imp-access', refreshToken: null })   // sin origen guardado
    renderApp()
    await screen.findByText('datos de 77')

    act(() => { expect(useAuthStore.getState().restoreOrigin()).toBe(false) })

    expect(cachedValues()).not.toContain('datos de 77')
  })

  it('una entrada rechazada (ya hay una sesión observada) NO vacía la caché de la sesión en curso', async () => {
    renderApp()
    await screen.findByText('datos de 1')
    act(() => { useAuthStore.getState().startImpersonation(observed, 'imp-access') })
    await screen.findByText('datos de 77')

    act(() => { expect(useAuthStore.getState().startImpersonation({ ...observed, id: 88 }, 'otro')).toBe(false) })

    expect(cachedValues()).toContain('datos de 77')
    expect(screen.getByTestId('probe')).toHaveTextContent('datos de 77')
  })
})
