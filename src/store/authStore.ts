import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role, UserInfo } from '@/types/auth'
import i18n from '@/i18n'
import { queryClient } from '@/lib/queryClient'

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

interface PendingRoleSelection {
  selectionToken: string
  availableRoles: Role[]
}

interface AuthState {
  user:                 UserInfo | null
  accessToken:          string | null
  refreshToken:         string | null
  pendingRoleSelection: PendingRoleSelection | null
  sessionExpired:       boolean

  setAuth:                (user: UserInfo, accessToken: string, refreshToken: string) => void
  setPendingRoleSelection:(token: string, roles: Role[]) => void
  clearPendingSelection:  () => void
  updateToken:            (user: UserInfo, accessToken: string) => void
  updateUser:             (user: UserInfo) => void
  refreshTokens:          (accessToken: string, refreshToken: string) => void
  clearAuth:              () => void
  setSessionExpired:      (value: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      user:                 null,
      accessToken:          null,
      refreshToken:         null,
      pendingRoleSelection: null,
      sessionExpired:       false,

      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken)
        const lang = user.language ?? localStorage.getItem('atlanticerp_lang') ?? 'es'
        localStorage.setItem('atlanticerp_lang', lang)
        void i18n.changeLanguage(lang)
        // SCRUM-711 — el sidebar siempre debe arrancar colapsado al loguear, incluso si
        // quedó expandido en una sesión anterior. setAuth() solo se llama en login real
        // (LoginPage/RolePickerModal), nunca en el refresh silencioso de token
        // (ver updateToken), así que esto no interrumpe el toggle del usuario en la
        // misma sesión.
        localStorage.setItem('sidebar-collapsed', 'true')
        // Red de seguridad además de clearAuth() -- si algún camino futuro llega a
        // loguear sin pasar por clearAuth() antes, esto evita heredar el cache de
        // quien haya usado esta pestaña previamente (ver session-scoped-query-cache).
        queryClient.clear()
        set({ user, accessToken, refreshToken, pendingRoleSelection: null, sessionExpired: false })
      },

      setPendingRoleSelection: (selectionToken, availableRoles) => {
        set({ pendingRoleSelection: { selectionToken, availableRoles } })
      },

      clearPendingSelection: () => {
        set({ pendingRoleSelection: null })
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
      // user keeps working. Unlike setAuth(), this never touches `user`/pendingRoleSelection/
      // sidebar-collapsed and never clears the query cache — it's not a new session, just a
      // token rotation of the current one.
      refreshTokens: (accessToken, refreshToken) => {
        localStorage.setItem('accessToken', accessToken)
        set({ accessToken, refreshToken })
      },

      clearAuth: () => {
        localStorage.removeItem('accessToken')
        resetLanguageToDefault()
        // Sin esto, un logout→login en la misma pestaña (sin recarga de página)
        // dejaba el cache de queries de la sesión anterior intacto -- las query
        // keys no incluyen usuario, así que la nueva sesión heredaba datos de la
        // anterior hasta el próximo refetch. Cubre tanto el logout manual
        // (TopBar) como el interceptor de 401/sesión expirada (authApi).
        queryClient.clear()
        set({ user: null, accessToken: null, refreshToken: null, pendingRoleSelection: null })
      },

      setSessionExpired: (value) => {
        set({ sessionExpired: value })
      },
    }),
    {
      // ADR-006, Fase C (2026-07-10) — bump de v2 a v3: el `user` cacheado antes de este deploy
      // tiene la forma vieja (roles[] en vez de role_id/modules/flags). Sin este bump, una sesión
      // ya logueada al momento del deploy quedaba con `user.modules` undefined hasta un
      // logout/login manual, escondiendo Ventas & Diseño/Compras/Inventario del sidebar sin
      // explicación (hallazgo de Senior Review). El bump fuerza sessionExpired en vez de un
      // estado a medio actualizar.
      name:       'atlanticerp-auth-v3',
      partialize: s => ({ user: s.user, refreshToken: s.refreshToken }),
    }
  )
)
