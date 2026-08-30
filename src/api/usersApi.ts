import api from './authApi'

export interface UserListItem {
  id:               number
  first_name:       string
  last_name:        string
  email:            string
  phone:            string | null
  is_active:        boolean
  mfa_enabled:      boolean
  notes:            string | null
  department:        { id: number; name: string } | null
  extra_permissions: string[]
  security_level:    { id: number; level: number; name: string } | null
  roles:            string[]
  // ADR-006, Fase D — rol base (SCRUM-144) + roles adicionales (exclusivo superadmin) +
  // flags transversales por persona (SCRUM-145).
  role_id:               number | null
  additional_role_ids:   number[]
  approve_large_amounts: boolean
  manage_users:           boolean
}

export interface UserListMeta {
  total:        number
  per_page:     number
  current_page: number
  last_page:    number
}

export interface UserListResponse {
  data: UserListItem[]
  meta: UserListMeta
}

export interface CreateUserPayload {
  first_name:           string
  last_name:            string
  email:                string
  phone?:               string | null
  department_id?:    number | null
  security_level_id?: number
  extra_permissions?: string[]
  notes?:               string | null
  // ADR-006, Fase D — `roles` (legado) dejó de ser obligatorio, `role_id` es el modelo real
  // desde la Fase C. Se mantiene el tipo por compatibilidad con `usersApi.approve()`, que sigue
  // usando el vocabulario viejo (registro público, fuera de alcance de esta fase).
  roles?:                string[]
  role_id?:              number | null
  additional_role_ids?:  number[]
}

export interface UpdateUserPayload {
  first_name?:          string
  last_name?:           string
  email?:               string
  phone?:               string | null
  department_id?:    number | null
  security_level_id?: number
  extra_permissions?: string[]
  notes?:               string | null
  roles?:               string[]
  role_id?:              number | null
  additional_role_ids?:  number[]
}

export interface PendingUsersResponse {
  data: UserListItem[]
}

// SCRUM-724 — override de visibilidad de módulos/ítems de menú por usuario puntual,
// por encima del visibility-por-rol ya existente (RoleVisibilityModal/rolesApi).
// Mismo shape de fila que RoleVisibilityRow (rolesApi.ts) para can_view — se
// redeclara acá en vez de reusar el tipo porque son contratos de endpoint
// distintos (module-visibility de usuario vs. visibility de rol), aunque hoy
// coincidan campo a campo.
export interface ModuleVisibilityRow {
  module:        string
  can_view:      0 | 1 | 2
  can_view_team: boolean
}

export interface MenuItemVisibilityRow {
  module:  string
  key:     string
  visible: boolean
}

export interface UserModuleVisibilityResponse {
  modules:   ModuleVisibilityRow[]
  menuItems: MenuItemVisibilityRow[]
}

export const usersApi = {
  list: (params?: { search?: string; page?: number; per_page?: number; is_active?: boolean; role_id?: number }): Promise<UserListResponse> =>
    api.get('/users', { params }).then(r => r.data as UserListResponse),

  get: (id: number): Promise<UserListItem> =>
    api.get(`/users/${id}`).then(r => r.data as UserListItem),

  create: (data: CreateUserPayload): Promise<UserListItem> =>
    api.post('/users', data).then(r => r.data as UserListItem),

  update: (id: number, data: UpdateUserPayload): Promise<UserListItem> =>
    api.put(`/users/${id}`, data).then(r => r.data as UserListItem),

  toggleStatus: (id: number, is_active: boolean): Promise<UserListItem> =>
    api.patch(`/users/${id}/status`, { is_active }).then(r => r.data as UserListItem),

  catalog: (): Promise<{ roles: string[] }> =>
    api.get('/users/catalog').then(r => r.data as { roles: string[] }),

  listPending: (): Promise<PendingUsersResponse> =>
    api.get('/users/pending').then(r => r.data as PendingUsersResponse),

  approve: (id: number, role: string, securityLevelId: number): Promise<UserListItem> =>
    api.post(`/users/${id}/approve`, { role, security_level_id: securityLevelId })
      .then(r => r.data as UserListItem),

  reject: (id: number): Promise<void> =>
    api.delete(`/users/${id}/reject`).then(() => undefined),

  updateFlags: (id: number, data: { approve_large_amounts?: boolean; manage_users?: boolean }): Promise<UserListItem> =>
    api.patch(`/admin/users/${id}/flags`, data).then(r => r.data as UserListItem),

  // SCRUM-724 — GET devuelve solo los overrides explícitos (arrays vacíos = el
  // usuario hereda todo de su rol); PUT reemplaza el set completo (replace-all,
  // mismo patrón que rolesApi.updateVisibility).
  moduleVisibility: {
    get: (id: number): Promise<UserModuleVisibilityResponse> =>
      api.get(`/admin/users/${id}/module-visibility`).then(r => r.data as UserModuleVisibilityResponse),

    update: (id: number, data: UserModuleVisibilityResponse): Promise<UserModuleVisibilityResponse> =>
      api.put(`/admin/users/${id}/module-visibility`, data).then(r => r.data as UserModuleVisibilityResponse),

    // SCRUM-739 (UAT-2) — máscara GLOBAL de rollout, independiente del override
    // individual de arriba (UatVisibilityService en el backend nunca escribe en
    // user_module_visibility/user_module_menu_visibility, para no poder pisar un
    // override individual preexistente — ver hallazgo de Pre-QA en el ticket).
    // 'configuracion'/'root' es un ítem sintético (Configuración no es parte del
    // catálogo de 7 módulos, se oculta vía menuItems).
    bulk: {
      get: (): Promise<UatVisibilityState> =>
        api.get('/admin/module-visibility/bulk').then(r => r.data as UatVisibilityState),

      set: (data: { modules: string[]; menuItems: { module: string; key: string }[]; action: 'hide' | 'restore' }): Promise<UatVisibilityState> =>
        api.post('/admin/module-visibility/bulk', data).then(r => r.data as UatVisibilityState),
    },
  },
}

export interface UatVisibilityState {
  hidden_modules:    string[]
  hidden_menu_items: { module: string; key: string }[]
}
