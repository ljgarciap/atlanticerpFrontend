import api from './authApi'

export interface RoleItem {
  id:                         number
  key:                        string
  name:                       string
  is_superadmin:              boolean
  is_system:                  boolean
  is_active:                  boolean
  default_security_level_id:  number | null
}

export const VIEW_NONE = 0
export const VIEW_READONLY = 1
export const VIEW_FULL = 2

export interface RoleVisibilityRow {
  module:        string
  can_view:      0 | 1 | 2
  can_view_team: boolean
}

export interface CreateRolePayload {
  key:                        string
  name:                       string
  default_security_level_id?: number | null
}

export interface UpdateRolePayload {
  name?:                       string
  default_security_level_id?: number | null
}

export const rolesApi = {
  list: (): Promise<RoleItem[]> =>
    api.get('/roles').then(r => r.data as RoleItem[]),

  create: (data: CreateRolePayload): Promise<RoleItem> =>
    api.post('/admin/roles', data).then(r => r.data as RoleItem),

  update: (id: number, data: UpdateRolePayload): Promise<RoleItem> =>
    api.put(`/admin/roles/${id}`, data).then(r => r.data as RoleItem),

  remove: (id: number): Promise<void> =>
    api.delete(`/admin/roles/${id}`).then(() => undefined),

  visibility: (id: number): Promise<RoleVisibilityRow[]> =>
    api.get(`/admin/roles/${id}/visibility`).then(r => r.data as RoleVisibilityRow[]),

  updateVisibility: (id: number, rows: RoleVisibilityRow[]): Promise<RoleVisibilityRow[]> =>
    api.put(`/admin/roles/${id}/visibility`, { rows }).then(r => r.data as RoleVisibilityRow[]),
}
