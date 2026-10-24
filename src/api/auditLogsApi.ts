import api from './authApi'

// SCRUM-792 (Epic SCRUM-788 — Logs y Telemetría). Visor generalizado de audit_logs — a diferencia
// de ventasDisenoApi.auditLog (scoped a ventas_diseno.%, sigue intacto), este cubre todos los
// módulos. 'tipo' se deriva en el backend del sufijo de `action` (created/updated/deleted =
// cambio_dato, cualquier otro sufijo = accion) — ver docblock del controller.

export type AuditLogTipo = 'cambio_dato' | 'accion'

export interface AuditLogEntry {
  id:          number
  action:      string
  module:      string
  tipo:        AuditLogTipo
  entity_type: string | null
  entity_id:   string | null
  old_values:  Record<string, unknown> | null
  new_values:  Record<string, unknown> | null
  // SCRUM-814 — antes nunca llegaba desde el backend (ver AuditLogController::format()). Para
  // `ai.usage.requested` (ver AiUsageAuditor) trae { job, prompt_preview }; para otros eventos
  // no-CRUD (exports, descargas) puede traer otras claves — de propósito general, sin shape fijo.
  metadata:    Record<string, unknown> | null
  user:        { id: number; name: string } | null
  created_at:  string
}

export interface AuditLogsResult {
  data:         AuditLogEntry[]
  current_page: number
  last_page:    number
  total:        number
}

export interface AuditLogsFilters {
  module?:      string
  tipo?:        AuditLogTipo
  entity_type?: string
  entity_id?:   number
  user_id?:     number
  from?:        string
  to?:          string
  page?:        number
}

export const auditLogsApi = {
  list: (filters: AuditLogsFilters = {}): Promise<AuditLogsResult> =>
    api.get<AuditLogsResult>('/admin/audit/logs', { params: filters }).then(r => r.data),

  // SCRUM-813 — catálogo DISTINCT de entity_type ya vistos en audit_logs, para el <select> del
  // filtro (reemplaza el <input> de texto libre). Ver docblock de AuditLogController::entityTypes().
  entityTypes: (): Promise<string[]> =>
    api.get<{ data: string[] }>('/admin/audit/logs/entity-types').then(r => r.data.data),
}

// SCRUM-1020 — dashboard de actividad sobre audit_logs. Ver AuditActivitySummaryService (backend):
// "interacción" = fila de audit_logs (cambios de dato, login, exportaciones/descargas, accesos
// denegados); las lecturas normales no se registran. Rango máximo 90 días, hora de Panamá.
export const ACTIVITY_TYPES = [
  'created', 'updated', 'deleted', 'exported', 'downloaded', 'login', 'login_failed', 'access_denied', 'other',
] as const
export type ActivityType = typeof ACTIVITY_TYPES[number]

export const ACTIVITY_MAX_DAYS = 90

export interface AuditActivitySummary {
  from:   string
  to:     string
  totals: {
    interactions:     number
    active_users:     number
    data_changes:     number
    data_changes_pct: number
    access_denied:    number
  }
  by_user:   { user_id: number | null; name: string | null; count: number }[]
  by_type:   Record<ActivityType, number>
  by_module: { module: string; count: number }[]
  by_day:    { date: string; count: number }[]
}

export const auditActivityApi = {
  summary: (from: string, to: string): Promise<AuditActivitySummary> =>
    api.get<AuditActivitySummary>('/admin/audit/activity-summary', { params: { from, to } }).then(r => r.data),
}
