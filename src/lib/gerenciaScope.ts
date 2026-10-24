import type { Role } from '@/types/auth'

/** SCRUM-1150 — permiso por persona que da el alcance de Gerencia dentro de CRM y Ventas & Diseño (ver ApplyGerenciaScope en el backend). */
export const GERENCIA_SCOPE_PERMISSION = 'ventas_diseno.gerencia_scope'

/**
 * true si el usuario tiene el alcance de Gerencia en CRM y Ventas & Diseño: es `management`/`superadmin`, o tiene el
 * permiso por persona. Solo para gates de CRM y Ventas & Diseño; Seguridad, Servicios y Admin&Cont siguen por rol.
 */
export function hasGerenciaScope(user: { role?: Role; permissions?: string[] } | null | undefined): boolean {
  if (!user) return false
  return user.role === 'management' || user.role === 'superadmin' || (user.permissions?.includes(GERENCIA_SCOPE_PERMISSION) ?? false)
}
