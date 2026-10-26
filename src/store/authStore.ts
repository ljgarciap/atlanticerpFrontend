import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserInfo } from '@/types/auth'
import i18n from '@/i18n'
import { queryClient } from '@/lib/queryClient'
import { setRegion } from '@/lib/region'

// SCRUM-412 (REQ-342) — al cerrar sesión, resetea `atlanticerp_lang` al default del sistema ('es',
// ver APP_LOCALE en el CLAUDE.md) en vez de dejar el valor que haya quedado en localStorage.
// Sin esto, una cuenta sin `language` explícito en backend (ej. un usuario de Ventas & Diseño
// recién creado) heredaba el idioma de la sesión anterior en el mismo navegador -- si esa
// sesión anterior había cambiado a inglés en Configuración, la cuenta nueva arrancaba en
// inglés (bug real reportado por QA: tabla vacía de Status de pedidos en inglés para un
// vendedor/diseñador, en español para Bodega, mismo navegador).
function resetLanguageToDefault() {
  localStorage.setItem('atlanticerp_lang', 'es')
  void i18n.changeLanguage('es')
}

// SCRUM-1158 — «Ver como usuario». La sesión REAL del superadmin se guarda aparte, solo en sessionStorage (muere con la pestaña) para poder
// volver a ella al salir. Mientras dura la impersonación el store tiene `refreshToken = null` (C8 del threat model): la sesión observada
// no se renueva, y sin refresh token `silentTokenRefresh` queda inerte.
export const IMPERSONATION_ORIGIN_KEY = 'atlanticerp-impersonation-origin'

/** Clave de localStorage donde zustand persiste `user` y `refreshToken` (compartida entre pestañas). */
export const AUTH_PERSIST_KEY = 'atlanticerp-auth-v3'

interface ImpersonationOrigin {
  user:         UserInfo
  accessToken:  string | null
  refreshToken: string | null
}

function readImpersonationOrigin(): ImpersonationOrigin | null {
  try {
    const raw = sessionStorage.getItem(IMPERSONATION_ORIGIN_KEY)
    return raw ? JSON.parse(raw) as ImpersonationOrigin : null
  } catch {
    return null
  }
}

// SCRUM-1158 — al volver a la sesión real, las peticiones que seguían en vuelo con el token de la sesión observada responden 401 DESPUÉS de
// restaurar. Sin esta marca, la primera restaura bien y las demás cerrarían la sesión real del superadmin como si hubiera expirado.
let lastRestoreAt = 0
export function restoredFromImpersonationWithin(ms: number): boolean {
  return Date.now() - lastRestoreAt < ms
}

function clearImpersonationOrigin() {
  try { sessionStorage.removeItem(IMPERSONATION_ORIGIN_KEY) } catch { /* sin sessionStorage (ventana privada): nada que limpiar */ }
}

interface AuthState {
  user:                 UserInfo | null
  accessToken:          string | null
  refreshToken:         string | null
  sessionExpired:       boolean
  // Cierre de H2: la contraseña temporal de un reset administrativo venció (401 `password_reset_expired`).
  // Solo en memoria (no se persiste): LoginPage lo consume para explicar por qué se cerró la sesión.
  passwordResetExpired: boolean
  // SCRUM-1159 (Pre-QA N-1/N-2) — id de la persona cuya sesión se cerró (manual o por expiración). Solo en memoria: `RequireAuth` lo guarda junto
  // al destino pedido (`state.from`) para que, si entra OTRA persona en el mismo equipo, no herede la ruta ni la búsqueda de la anterior.
  lastUserId:           number | null

  setAuth:                (user: UserInfo, accessToken: string, refreshToken: string) => void
  updateToken:            (user: UserInfo, accessToken: string) => void
  updateUser:             (user: UserInfo) => void
  refreshTokens:          (accessToken: string, refreshToken: string) => void
  clearAuth:              () => void
  /** SCRUM-1158 — entra a la sesión observada (la respuesta de `POST /users/{id}/impersonate`). No encadena: ignorado si ya hay una. */
  startImpersonation:     (user: UserInfo, accessToken: string) => boolean
  /** SCRUM-1158 — vuelve a la sesión real del superadmin. Si ya no existe (pestaña cerrada y reabierta) cierra la sesión y devuelve false. */
  restoreOrigin:          () => boolean
  setSessionExpired:      (value: boolean) => void
  setPasswordResetExpired:(value: boolean) => void
  // Idempotentes: solo escriben el estado si el flag realmente cambia (el interceptor de Axios
  // puede recibir varios 403 `password_change_required` en paralelo y no debe re-renderizar en bucle).
  markPasswordChangeRequired:  () => void
  clearPasswordChangeRequired: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:                 null,
      accessToken:          null,
      refreshToken:         null,
      sessionExpired:       false,
      passwordResetExpired: false,
      lastUserId:           null,

      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken)
        const lang = user.language ?? localStorage.getItem('atlanticerp_lang') ?? 'es'
        localStorage.setItem('atlanticerp_lang', lang)
        void i18n.changeLanguage(lang)
        // SCRUM-711 — el sidebar siempre debe arrancar colapsado al loguear, incluso si
        // quedó expandido en una sesión anterior. setAuth() solo se llama en login real
        // (LoginPage), nunca en el refresh silencioso de token
        // (ver updateToken), así que esto no interrumpe el toggle del usuario en la
        // misma sesión.
        localStorage.setItem('sidebar-collapsed', 'true')
        // Red de seguridad además de clearAuth() -- si algún camino futuro llega a
        // loguear sin pasar por clearAuth() antes, esto evita heredar el cache de
        // quien haya usado esta pestaña previamente (ver session-scoped-query-cache).
        queryClient.clear()
        set({ user, accessToken, refreshToken, sessionExpired: false, passwordResetExpired: false, lastUserId: null })
      },

      // Used after role switch — refreshToken stays the same
      updateToken: (user, accessToken) => {
        localStorage.setItem('accessToken', accessToken)
        set({ user, accessToken })
      },

      // Used after profile save — no new token issued
      updateUser: (user) => set({ user }),

      // SCRUM-746 — used by the silent token refresh mechanism (src/lib/silentTokenRefresh.ts):
      // POST /auth/refresh rotates both tokens in the background, transparently, while the same
      // user keeps working. Unlike setAuth(), this never touches `user`/
      // sidebar-collapsed and never clears the query cache — it's not a new session, just a
      // token rotation of the current one.
      refreshTokens: (accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken)
        set({ accessToken, refreshToken })
      },

      startImpersonation: (user, accessToken) => {
        const current = get().user
        // Sin encadenar (RN7): el backend también lo rechaza, acá ni se intenta.
        if (current === null || current.impersonation) return false
        try {
          sessionStorage.setItem(IMPERSONATION_ORIGIN_KEY, JSON.stringify({
            user:         current,
            accessToken:  localStorage.getItem('accessToken') ?? get().accessToken,
            refreshToken: get().refreshToken,
          } satisfies ImpersonationOrigin))
        } catch {
          return false   // sin dónde guardar la sesión real no hay forma de volver: no se entra
        }
        localStorage.setItem('accessToken', accessToken)
        // Otra persona, pero NO se toca el idioma ni el sidebar de quien observa; el cache sí se vacía para no mezclar datos.
        queryClient.clear()
        set({ user, accessToken, refreshToken: null, sessionExpired: false })
        return true
      },

      restoreOrigin: () => {
        const origin = readImpersonationOrigin()
        clearImpersonationOrigin()
        if (origin === null) {
          get().clearAuth()
          return false
        }
        if (origin.accessToken) localStorage.setItem('accessToken', origin.accessToken)
        else localStorage.removeItem('accessToken')
        queryClient.clear()
        lastRestoreAt = Date.now()
        set({ user: origin.user, accessToken: origin.accessToken, refreshToken: origin.refreshToken })
        return true
      },

      clearAuth: () => {
        clearImpersonationOrigin()
        localStorage.removeItem('accessToken')
        resetLanguageToDefault()
        // Sin esto, un logout→login en la misma pestaña (sin recarga de página)
        // dejaba el cache de queries de la sesión anterior intacto -- las query
        // keys no incluyen usuario, así que la nueva sesión heredaba datos de la
        // anterior hasta el próximo refetch. Cubre tanto el logout manual
        // (TopBar) como el interceptor de 401/sesión expirada (authApi).
        queryClient.clear()
        // Idempotente: al expirar la sesión varias peticiones fallan con 401 a la vez y cada una llama a clearAuth(); la primera guarda a quien tenía la sesión
        // y las siguientes (ya sin usuario) NO deben pisar ese id con null — según el orden, RequireAuth leía el id o un null que deja el destino a cualquiera.
        set({ user: null, accessToken: null, refreshToken: null, lastUserId: get().user?.id ?? get().lastUserId })
      },

      setSessionExpired: (value) => {
        set({ sessionExpired: value })
      },

      // Idempotente: varios 401 en paralelo no re-renderizan en bucle.
      setPasswordResetExpired: (value) => {
        if (get().passwordResetExpired === value) return
        set({ passwordResetExpired: value })
      },

      markPasswordChangeRequired: () => {
        const user = get().user
        // SCRUM-1158 — en una sesión observada nunca se fuerza el cambio de contraseña: no es del superadmin que mira (ver RequireAuth).
        if (user === null || user.must_change_password === true || user.impersonation) return
        set({ user: { ...user, must_change_password: true } })
      },

      clearPasswordChangeRequired: () => {
        const user = get().user
        if (user === null || user.must_change_password !== true) return
        set({ user: { ...user, must_change_password: false } })
      },
    }),
    {
      // ADR-006, Fase C (2026-07-10) — bump de v2 a v3: el `user` cacheado antes de este deploy
      // tiene la forma vieja (roles[] en vez de role_id/modules/flags). Sin este bump, una sesión
      // ya logueada al momento del deploy quedaba con `user.modules` undefined hasta un
      // logout/login manual, escondiendo Ventas & Diseño/Compras/Inventario del sidebar sin
      // explicación (hallazgo de Senior Review). El bump fuerza sessionExpired en vez de un
      // estado a medio actualizar.
      name:       AUTH_PERSIST_KEY,
      partialize: s => ({ user: s.user, refreshToken: s.refreshToken }),
    }
  )
)

// Fase 6a — el contexto regional de la empresa (`user.region`) alimenta los formateadores de moneda, fecha y hora (`lib/region`).
// Se publica al hidratar la sesión persistida y cada vez que cambia el usuario (login, `/auth/me`, perfil); sin sesión vuelve a Panamá.
setRegion(useAuthStore.getState().user?.region)
useAuthStore.subscribe((state, prev) => {
  if (state.user?.region !== prev.user?.region) setRegion(state.user?.region)
})
