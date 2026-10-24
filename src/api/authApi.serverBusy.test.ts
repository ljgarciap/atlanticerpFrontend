import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as axiosModule from 'axios'

// Reintento ante el 503 `server_busy` de nginx en el interceptor de respuesta de authApi.ts (mismo arnés que authApi.test.ts).
vi.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    post: vi.fn(), get: vi.fn(), patch: vi.fn(), put: vi.fn(), request: vi.fn(),
  }
  return { default: { create: vi.fn(() => instance) }, __mockInstance: instance }
})

const mockInstance = (axiosModule as unknown as {
  __mockInstance: { interceptors: { response: { use: ReturnType<typeof vi.fn> } }; request: ReturnType<typeof vi.fn> }
}).__mockInstance

await import('./authApi')

const onError = () => (mockInstance.interceptors.response.use.mock.calls[0] as [unknown, (e: unknown) => Promise<unknown>])[1]
const busyError = (config: Record<string, unknown>) => ({ config, response: { status: 503, data: { code: 'server_busy' } } })

describe('authApi — 503 server_busy', () => {
  beforeEach(() => { vi.useFakeTimers(); mockInstance.request.mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('reintenta una lectura tras una espera y devuelve la respuesta del reintento', async () => {
    mockInstance.request.mockResolvedValue({ data: 'ok' })
    const cfg = { method: 'get', url: '/admin-contab/payments' }
    const promise = onError()(busyError(cfg))
    expect(mockInstance.request).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    await expect(promise).resolves.toEqual({ data: 'ok' })
    expect(mockInstance.request).toHaveBeenCalledWith(expect.objectContaining({ url: '/admin-contab/payments', __busyRetries: 1 }))
  })

  it('tras 3 reintentos fallidos propaga el error original', async () => {
    const err = busyError({ method: 'get', url: '/x', __busyRetries: 3 })
    await expect(onError()(err)).rejects.toBe(err)
    expect(mockInstance.request).not.toHaveBeenCalled()
  })

  it('no reintenta escrituras ni 503 que no son server_busy', async () => {
    const post = busyError({ method: 'post', url: '/x' })
    await expect(onError()(post)).rejects.toBe(post)
    const other = { config: { method: 'get', url: '/x' }, response: { status: 503, data: { code: 'pac_unavailable' } } }
    await expect(onError()(other)).rejects.toBe(other)
    expect(mockInstance.request).not.toHaveBeenCalled()
  })

  it('no reintenta si la persona navegó a otra pantalla mientras esperaba (Pre-QA B5)', async () => {
    window.history.pushState({}, '', '/pantalla-a')
    const err = busyError({ method: 'get', url: '/x' })
    const promise = onError()(err)
    const settled = expect(promise).rejects.toBe(err)
    window.history.pushState({}, '', '/pantalla-b')
    await vi.advanceTimersByTimeAsync(1000)
    await settled
    expect(mockInstance.request).not.toHaveBeenCalled()
    window.history.pushState({}, '', '/')
  })

  it('no reintenta una petición cancelada', async () => {
    const ctrl = new AbortController(); ctrl.abort()
    const err = busyError({ method: 'get', url: '/x', signal: ctrl.signal })
    await expect(onError()(err)).rejects.toBe(err)
    expect(mockInstance.request).not.toHaveBeenCalled()
  })
})
