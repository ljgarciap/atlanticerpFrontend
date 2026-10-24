import api from './authApi'
import type { AprobacionItem, GerenciaFilters, GerenciaHomeResponse, ReglaAprobacion, SaveReglaAprobacionPayload } from '@/types/gerencia'
import type { OutlookCalendarEvent } from '@/types/calendar'
import type { ApprovalPendingItem } from '@/lib/homeCards'

export const gerenciaApi = {
  home: (filters?: GerenciaFilters): Promise<GerenciaHomeResponse> =>
    api.get<GerenciaHomeResponse>('/gerencia/home', { params: filters }).then(r => r.data),

  // SCRUM-862 — "Exportar reporte" era un botón `disabled` placeholder. Mismo patrón blob que
  // `adminContabApi.cashPosition.export()`: el backend responde el archivo binario o, si no hay
  // datos para los filtros aplicados, un JSON `{ no_data: true }` — se pide siempre como blob y se
  // intenta leer como JSON solo si el content-type no es binario, para no descargar un archivo
  // vacío sin explicación (RN del ticket).
  exportHome: async (filters: GerenciaFilters, format: 'pdf' | 'xlsx'): Promise<{ noData: true } | { noData: false }> => {
    const res = await api.get('/gerencia/home/export', {
      params: { ...filters, format },
      responseType: 'blob',
    })

    const contentType = (res.headers['content-type'] as string | undefined) ?? ''
    if (contentType.includes('application/json')) {
      const text = await (res.data as Blob).text()
      const parsed = JSON.parse(text) as { no_data?: boolean }
      if (parsed.no_data) return { noData: true }
    }

    const url = URL.createObjectURL(res.data as Blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = `reporte-gerencia-${new Date().toISOString().slice(0, 10)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
    a.click()
    URL.revokeObjectURL(url)
    return { noData: false }
  },

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

  // SCRUM-908 — card cross-módulo aparte del panel de aprobaciones ya existente arriba
  // (`aprobaciones`), a pedido explícito de Luis (2026-09-21): no se fusionan. No anidado bajo
  // `home` porque esa key ya es la función `home()` de arriba (GET /gerencia/home), no un
  // namespace — a diferencia del resto de los módulos (comprasApi.home.summary/approvalsPending).
  homeApprovalsPendingAll: (): Promise<{ data: ApprovalPendingItem[] }> =>
    api.get<{ data: ApprovalPendingItem[] }>('/gerencia/home/approvals-pending-all').then(r => r.data),

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
