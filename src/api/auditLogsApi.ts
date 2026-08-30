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
}
