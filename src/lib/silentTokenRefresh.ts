// SCRUM-746 — "Sesión expira por inactividad consecutiva". El threat model
// (atlanticerp-backend/docs/security/THREAT-MODEL-scrum746-session-inactivity.md, Hallazgo previo)
// confirmó que sin esta pieza el ticket no tiene ningún efecto observable: el access token sigue
// muriendo solo por su propio `exp` (`session_timeout_min`, 15-240 min) sin importar qué haga el
// backend con `last_activity_at` — porque `POST /auth/refresh` (ya existente) nunca tenía caller
// en el frontend. Este módulo agrega ese caller: mientras el usuario tenga actividad real
// (cualquier request autenticado exitoso ya sirve como señal, enganchado en el interceptor de
// respuesta de `src/api/authApi.ts`), refresca el access token en silencio ANTES de que expire.
//
// Es la llamada a /auth/refresh la que, del lado del backend, hace el "touch" de
// `last_activity_at` y valida el gate combinado (10h de inactividad configurable O 30 días
// absolutos desde el login, lo que ocurra primero) — si cualquiera de los dos se cumplió, el
// endpoint devuelve error y este módulo dispara el mismo flujo de logout que ya existe hoy para
// cualquier 401 (ver Hallazgo 1/6 del threat model: nunca resucita una sesión ya revocada/vencida).
//
// Extraído a un módulo propio (en vez de vivir inline en el interceptor de authApi.ts) para poder
// testear la lógica de decisión/dedupe con dependencias inyectadas, sin tener que mockear axios.

// Margen antes del `exp` real del access token para disparar el refresh -- suficientemente chico
// para no disparar refresh de más (el session_timeout_min mínimo configurable es 15 min, ver
// PreferencesService en atlanticerp-backend), suficientemente grande para cubrir la latencia de red del
// propio refresh antes de que el token en curso venza.
export const REFRESH_BUFFER_MS = 3 * 60 * 1000

export interface SilentRefreshDeps {
  /** Llama a POST /auth/refresh y devuelve el par de tokens rotado. */
  refresh: (refreshToken: string) => Promise<{ accessToken: string; refreshToken: string }>
  /** Tokens vigentes en el store, al momento de decidir si hace falta refrescar. */
  getTokens: () => { accessToken: string | null; refreshToken: string | null }
  /** Aplica el par de tokens nuevo tras un refresh exitoso (authStore.refreshTokens). */
  applyTokens: (accessToken: string, refreshToken: string) => void
  /** El refresh falló (401 -- gate de inactividad/techo de 30 días ya cumplido, u otro error). */
  onRefreshFailed: () => void
  /** true para rutas públicas de auth (login/refresh/etc.) -- nunca disparan ni cuentan como señal. */
  isExcludedPath: (url: string) => boolean
}

/**
 * Decodifica el claim `exp` (segundos epoch, estándar JWT) de un access token, sin librería
 * externa -- el payload es la 2da parte del JWT, base64url. Nunca lanza: un token no decodificable
 * simplemente no dispara el mecanismo (mismo criterio conservador que el resto del módulo, ver
 * `shouldRefresh` abajo).
 */
export function decodeJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const json = JSON.parse(atob(padded)) as { exp?: unknown }

    return typeof json.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * Fábrica de un handler para enganchar en el interceptor de respuesta exitosa de axios
 * (`src/api/authApi.ts`). Cada handler creado mantiene su propio flag de "refresh en curso" --
 * en la app real hay una sola instancia (un solo interceptor), así que hay como máximo un refresh
 * en vuelo genuinamente global; en tests, cada `createSilentRefreshHandler(...)` arranca aislado.
 */
export function createSilentRefreshHandler(
  deps: SilentRefreshDeps,
  bufferMs: number = REFRESH_BUFFER_MS
) {
  let inFlight: Promise<void> | null = null

  return function handleAuthenticatedResponse(requestUrl: string): void {
    if (deps.isExcludedPath(requestUrl)) return

    const { accessToken, refreshToken } = deps.getTokens()
    if (!accessToken || !refreshToken) return

    const expiryMs = decodeJwtExpiryMs(accessToken)
    if (expiryMs === null) return
    if (expiryMs - Date.now() > bufferMs) return

    // Ya hay un refresh en vuelo -- no duplicar llamadas concurrentes (varios requests pueden
    // completar casi al mismo tiempo cerca del vencimiento). El refresh en curso ya va a dejar
    // el token actualizado; no hace falta encolar ni esperar acá.
    if (inFlight) return

    inFlight = deps
      .refresh(refreshToken)
      .then(tokens => {
        deps.applyTokens(tokens.accessToken, tokens.refreshToken)
      })
      .catch(() => {
        deps.onRefreshFailed()
      })
      .finally(() => {
        inFlight = null
      })
  }
}
