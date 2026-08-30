import { useAuthStore } from '@/store/authStore'

/**
 * Returns true if the authenticated user has the given permission.
 *
 * Rules (in order):
 *  1. No authenticated user → false
 *  2. User has 'superadmin.all' → true (bypasses all checks)
 *  3. User has the specific permission → true
 *  4. Otherwise → false
 */
export function usePermission(permission: string): boolean {
  const permissions = useAuthStore(s => s.user?.permissions ?? null)

  if (permissions === null) return false
  if (permissions.includes('superadmin.all')) return true
  return permissions.includes(permission)
}
