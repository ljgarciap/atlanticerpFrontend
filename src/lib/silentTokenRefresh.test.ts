import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createSilentRefreshHandler,
  decodeJwtExpiryMs,
  REFRESH_BUFFER_MS,
  type SilentRefreshDeps,
} from './silentTokenRefresh'

// Construye un JWT sintáctico válido (header.payload.signature, base64url) con el `exp` (segundos
// epoch) que se quiera probar -- la firma es un stub, decodeJwtExpiryMs nunca la valida.
function makeJwt(expSeconds: number | undefined): string {
  const toBase64Url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const header = toBase64Url({ alg: 'HS256', typ: 'JWT' })
  const payload = toBase64Url(expSeconds === undefined ? { sub: 1 } : { sub: 1, exp: expSeconds })
  return `${header}.${payload}.stub-signature`
}

describe('decodeJwtExpiryMs', () => {
  it('decodes the exp claim (seconds) into epoch ms', () => {
    const expSeconds = 1_700_000_000
    expect(decodeJwtExpiryMs(makeJwt(expSeconds))).toBe(expSeconds * 1000)
  })

  it('returns null for a token without an exp claim', () => {
    expect(decodeJwtExpiryMs(makeJwt(undefined))).toBeNull()
  })

  it('returns null for a malformed token instead of throwing', () => {
    expect(decodeJwtExpiryMs('not-a-jwt')).toBeNull()
    expect(decodeJwtExpiryMs('')).toBeNull()
    expect(decodeJwtExpiryMs('a.b')).toBeNull()
  })
})

describe('createSilentRefreshHandler', () => {
  let deps: SilentRefreshDeps & {
    refresh: ReturnType<typeof vi.fn>
    applyTokens: ReturnType<typeof vi.fn>
    onRefreshFailed: ReturnType<typeof vi.fn>
  }
  let accessToken: string | null
  let refreshToken: string | null

  function tokenExpiringInMs(msFromNow: number): string {
    return makeJwt(Math.floor((Date.now() + msFromNow) / 1000))
  }

  beforeEach(() => {
    accessToken = tokenExpiringInMs(REFRESH_BUFFER_MS - 1000) // dentro del margen -- por vencer
    refreshToken = 'refresh-token-123'

    deps = {
      isExcludedPath: (url: string) => url.includes('/auth/refresh'),
      getTokens: () => ({ accessToken, refreshToken }),
      applyTokens: vi.fn(),
      onRefreshFailed: vi.fn(),
      refresh: vi.fn().mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
    }
  })

  it('triggers a refresh when the access token is close to expiring and there is real activity (a successful authenticated response)', async () => {
    const handle = createSilentRefreshHandler(deps)

    handle('/crm/projects')
    // El refresh corre en background -- esperar a que la promesa interna resuelva.
    await vi.waitFor(() => expect(deps.refresh).toHaveBeenCalledTimes(1))

    expect(deps.refresh).toHaveBeenCalledWith('refresh-token-123')
    await vi.waitFor(() => expect(deps.applyTokens).toHaveBeenCalledWith('new-access', 'new-refresh'))
    expect(deps.onRefreshFailed).not.toHaveBeenCalled()
  })

  it('does not trigger when the access token is not close to expiring yet', async () => {
    accessToken = tokenExpiringInMs(REFRESH_BUFFER_MS + 60_000) // bien lejos del margen
    const handle = createSilentRefreshHandler(deps)

    handle('/crm/projects')
    await new Promise(r => setTimeout(r, 0))

    expect(deps.refresh).not.toHaveBeenCalled()
  })

  it('does not trigger when there is no session (missing access or refresh token)', async () => {
    accessToken = null
    const handle = createSilentRefreshHandler(deps)

    handle('/crm/projects')
    await new Promise(r => setTimeout(r, 0))

    expect(deps.refresh).not.toHaveBeenCalled()
  })

  it('does not trigger for excluded auth paths (e.g. the refresh call itself)', async () => {
    const handle = createSilentRefreshHandler(deps)

    handle('/auth/refresh')
    await new Promise(r => setTimeout(r, 0))

    expect(deps.refresh).not.toHaveBeenCalled()
  })

  it('never fires two concurrent refresh calls if multiple authenticated requests complete near expiry at once', async () => {
    let resolveRefresh: (v: { accessToken: string; refreshToken: string }) => void = () => {}
    deps.refresh = vi.fn().mockImplementation(
      () => new Promise(resolve => { resolveRefresh = resolve })
    )
    const handle = createSilentRefreshHandler(deps)

    // 3 responses "llegan" casi al mismo tiempo, todas cerca del vencimiento.
    handle('/crm/projects')
    handle('/ventas-diseno/pipeline')
    handle('/bodega/inventario')

    expect(deps.refresh).toHaveBeenCalledTimes(1)

    resolveRefresh({ accessToken: 'new-access', refreshToken: 'new-refresh' })
    await vi.waitFor(() => expect(deps.applyTokens).toHaveBeenCalledTimes(1))

    // Una vez resuelto el refresh en curso, una nueva señal de actividad sí puede disparar otro.
    handle('/crm/projects')
    await vi.waitFor(() => expect(deps.refresh).toHaveBeenCalledTimes(2))
  })

  it('falls back to the existing logout flow when the silent refresh itself fails (e.g. inactivity/30-day ceiling already hit server-side)', async () => {
    deps.refresh = vi.fn().mockRejectedValue({ response: { status: 401 } })
    const handle = createSilentRefreshHandler(deps)

    handle('/crm/projects')

    await vi.waitFor(() => expect(deps.onRefreshFailed).toHaveBeenCalledTimes(1))
    expect(deps.applyTokens).not.toHaveBeenCalled()
  })
})
