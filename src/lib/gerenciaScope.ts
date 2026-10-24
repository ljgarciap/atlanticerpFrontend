import { GERENCIA_SCOPE_PERMISSION, hasAnyPermission } from '@/lib/accessGuards'

export { GERENCIA_SCOPE_PERMISSION }

/**
 * true si el usuario tiene el alcance de Gerencia en CRM y Ventas & Diseño: tiene el permiso de rol completo
 * `platform.management` (Gerencia/superadmin) o el permiso por persona. Solo para gates de CRM y Ventas & Diseño.
 */
export function hasGerenciaScope(user: { permissions?: string[] } | null | undefined): boolean {
  if (!user) return false
  return hasAnyPermission(user.permissions, ['platform.management', GERENCIA_SCOPE_PERMISSION])
}
