import api from './authApi'
import type { Activity, CreatedShareLink, DashboardReminder, Document, DocumentVersion, KpiData, PaginatedProjects, Project, Reminder, ShareLink } from '@/types/project'

export interface ProjectFilters {
  search?:    string
  etapa?:     string
  urgency?:   string
  freshness?: string
  area?:      string
  tipo?:      string
  despacho?:  string
  ubicacion?: string
  user_id?:   number
  dialux?:    boolean
  per_page?:  number
  page?:      number
}

export const projectsApi = {
  // ── Projects ──────────────────────────────────────────────────────────────

  list: (filters: ProjectFilters = {}): Promise<PaginatedProjects> =>
    api.get<PaginatedProjects>('/crm/projects', { params: filters }).then(r => r.data),

  get: (id: number): Promise<Project> =>
    api.get<Project>(`/crm/projects/${id}`).then(r => r.data),

  create: (data: Record<string, unknown>): Promise<Project> =>
    api.post<Project>('/crm/projects', data).then(r => r.data),

  update: (id: number, data: Record<string, unknown>): Promise<Project> =>
    api.put<Project>(`/crm/projects/${id}`, data).then(r => r.data),

  changeStage: (id: number, etapa: string): Promise<Project> =>
    api.patch<Project>(`/crm/projects/${id}/stage`, { etapa }).then(r => r.data),

  delete: (id: number): Promise<void> =>
    api.delete(`/crm/projects/${id}`).then(() => undefined),

  // ── Activities ────────────────────────────────────────────────────────────

  listActivities: (projectId: number, perPage = 20): Promise<{ data: Activity[] }> =>
    api.get<{ data: Activity[] }>(`/crm/projects/${projectId}/activities`, { params: { per_page: perPage } }).then(r => r.data),

  addActivity: (projectId: number, data: Record<string, unknown>): Promise<Activity> =>
    api.post<Activity>(`/crm/projects/${projectId}/activities`, data).then(r => r.data),

  deleteActivity: (projectId: number, activityId: number): Promise<void> =>
    api.delete(`/crm/projects/${projectId}/activities/${activityId}`).then(() => undefined),

  // ── Reminders ─────────────────────────────────────────────────────────────

  listReminders: (projectId: number): Promise<Reminder[]> =>
    api.get<{ data: Reminder[] }>(`/crm/projects/${projectId}/reminders`).then(r => r.data.data),

  addReminder: (projectId: number, data: Record<string, unknown>): Promise<Reminder> =>
    api.post<Reminder>(`/crm/projects/${projectId}/reminders`, data).then(r => r.data),

  toggleReminder: (projectId: number, reminderId: number): Promise<Reminder> =>
    api.patch<Reminder>(`/crm/projects/${projectId}/reminders/${reminderId}/toggle`).then(r => r.data),

  deleteReminder: (projectId: number, reminderId: number): Promise<void> =>
    api.delete(`/crm/projects/${projectId}/reminders/${reminderId}`).then(() => undefined),

  // ── Documents ─────────────────────────────────────────────────────────────

  listDocuments: (projectId: number): Promise<Document[]> =>
    api.get<Document[]>(`/crm/projects/${projectId}/documents`).then(r => r.data),

  listDocumentHistory: (projectId: number): Promise<DocumentVersion[]> =>
    api.get<DocumentVersion[]>(`/crm/projects/${projectId}/documents/history`).then(r => r.data),

  uploadDocument: (
    projectId: number,
    file:      File,
    categoria: string,
    onProgress: (pct: number) => void,
  ): Promise<Document> =>
    new Promise<Document>((resolve, reject) => {
      // localStorage, no useAuthStore: el store persiste solo user/refreshToken
      // (ver authStore.ts partialize) — accessToken vuelve a null en cuanto la
      // pestaña se recarga sin pasar por login de nuevo, aunque la sesión siga
      // válida (authApi.ts sí sabe esto y por eso su interceptor lee de acá).
      const token = localStorage.getItem('accessToken') ?? ''
      const form  = new FormData()
      form.append('file', file)
      form.append('categoria', categoria)

      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText) as Document)
        } else {
          // El backend responde JSON ({"message": "..."}) — sin esto, el body
          // crudo (con \" escapados) se mostraba tal cual en la UI (SCRUM-55 QA).
          let message = 'Upload failed'
          try {
            const parsed = JSON.parse(xhr.responseText) as { message?: string }
            if (parsed.message) message = parsed.message
          } catch {
            // respuesta no-JSON (ej. error de gateway) — se queda con el mensaje genérico
          }
          reject(new Error(message))
        }
      })
      xhr.addEventListener('error',   () => reject(new Error('Upload failed')))
      xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')))
      xhr.timeout = 30 * 60 * 1000 // 30 min ceiling for large files
      xhr.open('POST', `/api/crm/projects/${projectId}/documents`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      // Sin esto, Laravel trata una falla de validación (mime no permitido, tamaño
      // excedido, etc.) como si viniera de un browser normal y responde con un
      // 302 redirect en vez de 422 JSON — el mismo comportamiento por el que
      // ci-backend.yml y el resto de axios (api instance) ya fijan este header.
      xhr.setRequestHeader('Accept', 'application/json')
      xhr.send(form)
    }),

  downloadDocument: async (_projectId: number, docId: number, _filename: string): Promise<void> => {
    const { url, filename } = await api
      .get<{ url: string; filename: string; zone: string }>(`/crm/documents/${docId}/url`)
      .then(r => r.data)
    const a = document.createElement('a')
    a.href     = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  },

  deleteDocument: (projectId: number, docId: number): Promise<void> =>
    api.delete(`/crm/projects/${projectId}/documents/${docId}`).then(() => undefined),

  // ── Share links ───────────────────────────────────────────────────────────

  listShareLinks: (projectId: number, docId: number): Promise<ShareLink[]> =>
    api.get<ShareLink[]>(`/crm/projects/${projectId}/documents/${docId}/share-links`).then(r => r.data),

  createShareLink: (projectId: number, docId: number): Promise<CreatedShareLink> =>
    api.post<CreatedShareLink>(`/crm/projects/${projectId}/documents/${docId}/share-links`).then(r => r.data),

  revokeShareLink: (id: number): Promise<void> =>
    api.delete(`/crm/share-links/${id}`).then(() => undefined),

  // ── Dashboard ─────────────────────────────────────────────────────────────

  kpis: (): Promise<KpiData> =>
    api.get<KpiData>('/crm/dashboard/kpis').then(r => r.data),

  dashboardReminders: (): Promise<DashboardReminder[]> =>
    api.get<{ data: DashboardReminder[] }>('/crm/dashboard/reminders').then(r => r.data.data),

  // ── Autocomplete ──────────────────────────────────────────────────────────

  autocompleteField: (field: string, q = ''): Promise<string[]> =>
    api.get<{ data: string[] }>('/crm/autocomplete/fields', { params: { field, q: q || undefined } })
       .then(r => r.data.data),

  autocompleteUsers: (q = ''): Promise<{ id: number; first_name: string; last_name: string }[]> =>
    api.get<{ data: { id: number; first_name: string; last_name: string }[] }>(
      '/crm/autocomplete/users', { params: { q: q || undefined } }
    ).then(r => r.data.data),
}
