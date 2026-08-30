import api from './authApi'

export interface SecurityLevelItem {
  id:          number
  level:       number
  name:        string
  description: string | null
  permissions: string[]
  is_active:   boolean
}

export interface PermissionCatalogEntry {
  key:         string
  label:       string
  description: string | null
}

export interface PermissionCatalogResponse {
  catalog: Record<string, PermissionCatalogEntry[]>
}

export interface LevelListResponse {
  data: SecurityLevelItem[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

// ADR-006, Decisión 10 — matriz Crear-Editar/Aprobar por módulo de un security level.
export interface LevelModulePermissionRow {
  module:      string
  can_edit:    boolean
  can_approve: boolean
}

export const levelsApi = {
  listAll: (): Promise<SecurityLevelItem[]> =>
    api.get('/security-levels', { params: { all: 1 } }).then(r => r.data as SecurityLevelItem[]),

  list: (params?: { page?: number; per_page?: number; search?: string }): Promise<LevelListResponse> =>
    api.get('/security-levels', { params }).then(r => r.data as LevelListResponse),

  catalog: (): Promise<PermissionCatalogResponse> =>
    api.get('/permission-catalog').then(r => r.data as PermissionCatalogResponse),

  update: (id: number, data: { name?: string; description?: string | null; permissions?: string[] }): Promise<SecurityLevelItem> =>
    api.put(`/security-levels/${id}`, data).then(r => r.data as SecurityLevelItem),

  toggleStatus: (id: number, is_active: boolean): Promise<SecurityLevelItem> =>
    api.patch(`/security-levels/${id}/status`, { is_active }).then(r => r.data as SecurityLevelItem),

  permissions: (id: number): Promise<LevelModulePermissionRow[]> =>
    api.get(`/security-levels/${id}/permissions`).then(r => r.data as LevelModulePermissionRow[]),

  updatePermissions: (id: number, rows: LevelModulePermissionRow[]): Promise<LevelModulePermissionRow[]> =>
    api.put(`/security-levels/${id}/permissions`, { rows }).then(r => r.data as LevelModulePermissionRow[]),
}
