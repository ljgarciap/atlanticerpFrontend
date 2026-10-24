/** SCRUM-1150 — permiso por persona que da el alcance de Gerencia dentro de CRM y Ventas & Diseño (ver ApplyGerenciaScope en el backend). */
export const GERENCIA_SCOPE_PERMISSION = 'ventas_diseno.gerencia_scope'

/**
 * Fase 1b — el frontend decide el acceso por PERMISO, nunca por nombre de rol (el backend ya no tiene ningún `role:`).
 * Los permisos de rol completo llegan solo por el nivel de seguridad del rol (migraciones 2026_08_30_*, 2026_10_24_*).
 */
export function hasAnyPermission(permissions: readonly string[] | null | undefined, required: string | readonly string[]): boolean {
  if (!permissions) return false
  if (permissions.includes('superadmin.all')) return true
  const list = typeof required === 'string' ? [required] : required
  return list.some(p => permissions.includes(p))
}

/**
 * Guardas de ruta compartidas. `ApplyGerenciaScope` solo añade `platform.management`/`ventas_diseno.orders.access` a la
 * petición en el servidor, no al `user.permissions` del frontend: por eso las rutas con alcance por persona listan
 * también `ventas_diseno.gerencia_scope`.
 */
export const GUARD = {
  ADMIN_CONTAB:      ['admin_contab.records.manage'],
  GERENCIA:          ['platform.management'],
  GERENCIA_O_ALCANCE: ['platform.management', GERENCIA_SCOPE_PERMISSION],
  PEDIDOS:           ['ventas_diseno.orders.access', GERENCIA_SCOPE_PERMISSION],
  SUPERADMIN:        ['superadmin.all'],
  TOOL_KARDEX:       ['servicios.tools.kardex.view'],
} as const satisfies Record<string, readonly string[]>
