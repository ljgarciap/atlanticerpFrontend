import api from './authApi'

export interface DepartmentItem {
  id:        number
  name:      string
  is_active: boolean
}

export interface DepartmentListResponse {
  data: DepartmentItem[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

export const departmentsApi = {
  listAll: (): Promise<DepartmentItem[]> =>
    api.get('/departments', { params: { all: 1 } }).then(r => r.data as DepartmentItem[]),

  list: (params?: { page?: number; per_page?: number; search?: string }): Promise<DepartmentListResponse> =>
    api.get('/departments', { params }).then(r => r.data as DepartmentListResponse),

  create: (name: string): Promise<DepartmentItem> =>
    api.post('/departments', { name }).then(r => r.data as DepartmentItem),

  update: (id: number, name: string): Promise<DepartmentItem> =>
    api.put(`/departments/${id}`, { name }).then(r => r.data as DepartmentItem),

  toggleStatus: (id: number, is_active: boolean): Promise<DepartmentItem> =>
    api.patch(`/departments/${id}/status`, { is_active }).then(r => r.data as DepartmentItem),
}
