import api from './authApi'

export interface DepartmentItem {
  id:        number
  name:      string
  is_active: boolean
  user_count?: number
}

export interface DepartmentListResponse {
  data: DepartmentItem[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

export const departmentsApi = {
  /** `incluir`: id de un departamento que debe aparecer aunque esté desactivado (el propio del usuario en edición). */
  listAll: (incluir?: number | null): Promise<DepartmentItem[]> =>
    api.get('/departments', { params: incluir ? { all: 1, incluir } : { all: 1 } }).then(r => r.data as DepartmentItem[]),

  list: (params?: { page?: number; per_page?: number; search?: string }): Promise<DepartmentListResponse> =>
    api.get('/departments', { params }).then(r => r.data as DepartmentListResponse),

  create: (name: string): Promise<DepartmentItem> =>
    api.post('/departments', { name }).then(r => r.data as DepartmentItem),

  update: (id: number, name: string): Promise<DepartmentItem> =>
    api.put(`/departments/${id}`, { name }).then(r => r.data as DepartmentItem),

  toggleStatus: (id: number, is_active: boolean): Promise<DepartmentItem> =>
    api.patch(`/departments/${id}/status`, { is_active }).then(r => r.data as DepartmentItem),

  /** Fase 31b — mueve los usuarios de un departamento a otro activo (`null` = sin departamento). */
  reassign: (id: number, toDepartmentId: number | null): Promise<{ movidos: number }> =>
    api.post(`/departments/${id}/reassign`, { to_department_id: toDepartmentId }).then(r => r.data as { movidos: number }),
}
