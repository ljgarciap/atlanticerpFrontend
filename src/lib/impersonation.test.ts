import { describe, expect, it, vi, beforeEach } from 'vitest'
import { endImpersonation } from './impersonation'
import { impersonationApi } from '@/api/impersonationApi'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

vi.mock('@/api/impersonationApi', () => ({ impersonationApi: { stop: vi.fn() } }))
const stop = vi.mocked(impersonationApi.stop)

const base: UserInfo = {
  id: 1, first_name: 'Super', last_name: 'Admin', email: 's@x.test', role: 'superadmin', permissions: [],
}
const observed: UserInfo = {
  ...base, id: 77, role: 'vendedor',
  impersonation: { id: 'imp-1', actor_id: 1, actor_name: 'Super Admin', target_name: 'Vera', expires_at: '2099-01-01T00:00:00Z' },
}

beforeEach(() => {
  stop.mockReset()
  useAuthStore.getState().clearAuth()
  sessionStorage.clear(); localStorage.clear()
})

describe('endImpersonation', () => {
  it('avisa al backend y vuelve a la sesión real', async () => {
    useAuthStore.getState().setAuth(base, 'actor-access', 'actor-refresh')
    useAuthStore.getState().startImpersonation(observed, 'imp-access')
    stop.mockResolvedValueOnce(undefined)

    expect(await endImpersonation()).toBe(true)

    expect(stop).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user?.id).toBe(1)
    expect(useAuthStore.getState().refreshToken).toBe('actor-refresh')
  })

  it('si el backend falla (ya venció, red caída) igual vuelve a la sesión real', async () => {
    useAuthStore.getState().setAuth(base, 'actor-access', 'actor-refresh')
    useAuthStore.getState().startImpersonation(observed, 'imp-access')
    stop.mockRejectedValueOnce({ response: { status: 401 } })

    expect(await endImpersonation()).toBe(true)
    expect(useAuthStore.getState().user?.id).toBe(1)
  })

  it('devuelve false y cierra la sesión si la real ya no existe', async () => {
    useAuthStore.setState({ user: observed, accessToken: 'imp-access', refreshToken: null })
    stop.mockResolvedValueOnce(undefined)

    expect(await endImpersonation()).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('sin sesión observada no hace nada ni llama al backend', async () => {
    useAuthStore.getState().setAuth(base, 'actor-access', 'actor-refresh')

    expect(await endImpersonation()).toBe(true)
    expect(stop).not.toHaveBeenCalled()
    expect(useAuthStore.getState().user?.id).toBe(1)
  })
})
