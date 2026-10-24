import { isMaxPrivilegeUser, type UserListItem } from '@/api/usersApi'

export type ImpersonationBlock = 'self' | 'inactive' | 'superadmin' | 'guest'

/**
 * SCRUM-1158 (RN3) — espeja en la UI quién NO se puede observar con «Ver como usuario». Solo es una ayuda para no ofrecer un botón que
 * terminaría en error: el backend es quien decide (también rechaza a una persona bloqueada por seguridad, dato que el listado no trae).
 * Devuelve la causa del bloqueo o `null` si se puede intentar.
 */
export function impersonationBlock(user: UserListItem, actorId: number | undefined): ImpersonationBlock | null {
  if (actorId !== undefined && user.id === actorId) return 'self'
  if (isMaxPrivilegeUser(user)) return 'superadmin'
  if (!user.is_active) return 'inactive'
  if ((user.roles ?? []).includes('guest')) return 'guest'
  return null
}
