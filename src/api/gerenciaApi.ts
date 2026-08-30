import api from './authApi'
import type { AprobacionItem, GerenciaFilters, GerenciaHomeResponse, ReglaAprobacion, SaveReglaAprobacionPayload } from '@/types/gerencia'
import type { OutlookCalendarEvent } from '@/types/calendar'

export const gerenciaApi = {
  home: (filters?: GerenciaFilters): Promise<GerenciaHomeResponse> =>
    api.get<GerenciaHomeResponse>('/gerencia/home', { params: filters }).then(r => r.data),

  // SCRUM-164 (REQ-102) — mismo endpoint compartido con Ventas & Diseño/Compras/Bodega/Servicios
  // (`OutlookCalendarController`, `module=gerencia`). RN1/PERMISOS: solo lectura del propio
  // calendario del actor logueado — sin `scope`/`owner_id` a propósito, mismo criterio que
  // Servicios (ver serviciosApi.ts).
  calendar: {
    list: (filters: { from?: string; to?: string } = {}): Promise<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }> =>
      api.get<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }>('/gerencia/calendar', { params: filters }).then(r => r.data),
  },

  // SCRUM-163 (REQ-101) — infraestructura configurable de "quién aprueba cada tipo de solicitud".
  // Exclusivo de superadmin hasta que el cliente defina si Mark/David/Whil pueden configurarlo
  // también (ver docblock del backend, ReglaAprobacionController).
  vendors: (): Promise<{ id: number; name: string }[]> =>
    api.get('/gerencia/vendors').then(r => r.data),

  clients: (search?: string): Promise<{ id: number; name: string }[]> =>
    api.get('/gerencia/clients', { params: { search } }).then(r => r.data),

  // SCRUM-162 — Aprobar / Rechazar directamente desde el panel de Gerencia.
  aprobaciones: {
    aprobar: (item: AprobacionItem): Promise<void> =>
      api.post(`/gerencia/aprobaciones/${item.type}/${item.id}/aprobar`).then(() => undefined),
    rechazar: (item: AprobacionItem, razon?: string): Promise<void> =>
      api.post(`/gerencia/aprobaciones/${item.type}/${item.id}/rechazar`, { razon }).then(() => undefined),
  },

  reglasAprobacion: {
    list: (): Promise<ReglaAprobacion[]> =>
      api.get<{ data: ReglaAprobacion[] }>('/gerencia/reglas-aprobacion').then(r => r.data.data),
    create: (payload: SaveReglaAprobacionPayload): Promise<ReglaAprobacion> =>
      api.post<ReglaAprobacion>('/gerencia/reglas-aprobacion', payload).then(r => r.data),
    update: (id: number, payload: SaveReglaAprobacionPayload): Promise<ReglaAprobacion> =>
      api.put<ReglaAprobacion>(`/gerencia/reglas-aprobacion/${id}`, payload).then(r => r.data),
    remove: (id: number): Promise<void> =>
      api.delete(`/gerencia/reglas-aprobacion/${id}`).then(() => undefined),
  },
}
