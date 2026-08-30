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
  role_id?:      number | null
  permissions:   string[]
  // ADR-006, Decisión 11 — contrato nuevo que consume Sidebar.tsx (modulesPayload() del backend,
  // siempre las 7 llaves del catálogo, en false por defecto).
  modules?:      Record<string, ModulePermissions>
  flags?:        UserFlags
  // SCRUM-724 — override puntual por usuario de qué ítems de menú ve (por encima de
  // modules arriba, que sigue siendo el gate de MÓDULO por rol). module -> key ->
  // visible; una clave ausente significa visible=true (default) — solo un `false`
  // explícito oculta el ítem. Mismas claves que MENU_ITEM_CATALOG (src/config/
  // menuItemCatalog.ts), viene en el mismo objeto de claims del JWT que `modules`.
  menuVisibility?: Record<string, Record<string, boolean>>
}

export interface LoginResponse {
  accessToken:  string
  tokenType:    string
  expiresIn:    number
  refreshToken: string
  user:         UserInfo
}

/**
 * ADR-006, Fase C — daily 2026-07-10. login()/mfaVerify() en el backend ya NO devuelven esta
 * forma (v2 une role_id + user_additional_roles automáticamente, sin pantalla de selección) —
 * decisión explícita de Luis: "nunca requiere selección". Se mantiene el tipo (y select-role/
 * switch-role en el backend) sin borrar, pero sin llamador real desde login/mfaVerify.
 */
export interface MultiRoleLoginResponse {
  requires_role_selection: true
  roles:                   Role[]
  selection_token:         string
}

export interface MfaRequiredResponse {
  requires_mfa:     true
  mfa_challenge_id: string
}

export type AnyLoginResponse = LoginResponse | MultiRoleLoginResponse | MfaRequiredResponse

export function isMultiRoleResponse(r: AnyLoginResponse): r is MultiRoleLoginResponse {
  return (r as MultiRoleLoginResponse).requires_role_selection === true
}

export function isMfaRequiredResponse(r: AnyLoginResponse): r is MfaRequiredResponse {
  return (r as MfaRequiredResponse).requires_mfa === true
}
