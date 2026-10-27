// ADR-006, Decisión 11 — Fase C. `Role` ya no es un union cerrado: los 13 roles de negocio +
// superadmin vienen de datos (tabla `roles`), no de un enum hardcodeado. Se mantiene el alias
// para no tener que tocar cada sitio que hoy escribe `Role` en vez de `string`.
export type Role = string

export interface ModulePermissions {
  view:      boolean
  view_team: boolean
  edit:      boolean
  approve:   boolean
}

export interface UserFlags {
  approve_large_amounts: boolean
  manage_users:          boolean
  /**
   * SCRUM-1157 — identidad (no permiso): es el aprobador Gerencia. «Datos de la Empresa» y «Configuración Fiscal» responden 403 a cualquier otra
   * persona (superadmin aparte); el menú las oculta cuando viene en `false`. Opcional: una sesión abierta antes de este cambio no lo trae.
   */
  mark_approver?:        boolean
  /** SCRUM-1168 — este entorno tiene el concepto nuevo de cobros (cobro con o sin factura, compensaciones). Solo visual: el menú ofrece «Compensaciones». */
  cobros_v2?:            boolean
}

/**
 * SCRUM-1158 — «Ver como usuario». Solo viene en el `user` de una sesión de impersonación (el `user` es la persona observada,
 * `actor_*` el superadmin real). `expires_at` es ISO8601: la sesión no se renueva y vence ahí.
 */
export interface ImpersonationInfo {
  id:          string
  actor_id:    number
  actor_name:  string
  target_name: string
  expires_at:  string
}

export interface UserInfo {
  id:            number
  first_name:    string
  last_name:     string
  email:         string
  phone?:        string | null
  notes?:        string | null
  department_id?: number | null
  language?:     string
  security_level?: number | null
  role:          Role
  // Fase 3: nombre visible del rol (`roles.name`, editable por CRUD sin deploy); `role` es solo la clave.
  role_name?:    string | null
  role_id?:      number | null
  permissions:   string[]
  // ADR-006, Decisión 11 — contrato nuevo que consume Sidebar.tsx (modulesPayload() del backend,
  // siempre las 7 llaves del catálogo, en false por defecto).
  modules?:      Record<string, ModulePermissions>
  flags?:        UserFlags
  /** Fase 6d — nombre visible del impuesto del país (ITBMS / IVA / Sales tax). Ausente: «ITBMS». */
  tax_label?:    string
  /** Fase 6a — contexto regional de la empresa (viene del tenant). Ausente en sesiones anteriores: rige el de Panamá (`lib/region`). */
  region?:       { country: string; currency: string; timezone: string; locale: string }
  /** Fase 6c — cómo se llama y se captura la identificación fiscal del país (RUC+DV, NIT+DV, EIN). Ausente en sesiones anteriores: rige Panamá. */
  fiscal_id?:    { label: string; uses_dv: boolean; dv_max_length: number }
  // SCRUM-724 — override puntual por usuario de qué ítems de menú ve (por encima de
  // modules arriba, que sigue siendo el gate de MÓDULO por rol). module -> key ->
  // visible; una clave ausente significa visible=true (default) — solo un `false`
  // explícito oculta el ítem. Mismas claves que MENU_ITEM_CATALOG (src/config/
  // menuItemCatalog.ts), viene en el mismo objeto de claims del JWT que `modules`.
  menuVisibility?: Record<string, Record<string, boolean>>
  // Reset de contraseñas — un superadmin restableció la contraseña de esta cuenta (o el backend
  // respondió 403 `password_change_required`): mientras sea true, la app solo muestra la pantalla
  // obligatoria de cambio de contraseña (ver RequireAuth / ForcePasswordChangePage).
  must_change_password?: boolean
  // SCRUM-1158 — presente solo mientras un superadmin ve la app como esta persona (solo lectura, sin refresh token).
  impersonation?: ImpersonationInfo | null
}

export interface LoginResponse {
  accessToken:  string
  tokenType:    string
  expiresIn:    number
  refreshToken: string
  user:         UserInfo
}

export interface MfaRequiredResponse {
  requires_mfa:     true
  mfa_challenge_id: string
}

export type AnyLoginResponse = LoginResponse | MfaRequiredResponse

export function isMfaRequiredResponse(r: AnyLoginResponse): r is MfaRequiredResponse {
  return (r as MfaRequiredResponse).requires_mfa === true
}
