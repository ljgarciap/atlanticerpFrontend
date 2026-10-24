import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useResetUserPassword } from './useUsers'
import { usersApi } from '@/api/usersApi'

vi.mock('@/api/usersApi', async () => {
  const actual = await vi.importActual<typeof import('@/api/usersApi')>('@/api/usersApi')
  return { ...actual, usersApi: { resetPassword: vi.fn() } }
})

// B4 — la contraseña del operador viaja en las variables de la mutación; no debe quedar en el MutationCache.
describe('useResetUserPassword — la contraseña del operador no se cachea (B4)', () => {
  it.each([['éxito', true], ['error', false]])('al terminar con %s la mutación se descarta del MutationCache', async (_n, ok) => {
    const mocked = vi.mocked(usersApi.resetPassword)
    if (ok) mocked.mockResolvedValue({ data: { id: 1, email: 'a@b.c', must_change_password: true } } as never)
    else mocked.mockRejectedValue({ response: { status: 422 } })
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const { result, unmount } = renderHook(() => useResetUserPassword(), { wrapper })

    await act(async () => { await result.current.mutateAsync({ id: 1, operatorPassword: 'Secreta-123' }).catch(() => {}) })

    unmount() // sin observador, gcTime 0 la descarta; con el default de 5 min seguiría ahí
    await waitFor(() => expect(qc.getMutationCache().getAll().some(m => JSON.stringify(m.state.variables).includes('Secreta-123'))).toBe(false))
  })
})
