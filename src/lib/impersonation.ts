import { impersonationApi } from '@/api/impersonationApi'
import { useAuthStore } from '@/store/authStore'

/**
 * SCRUM-1158 — termina la sesión de «Ver como usuario» y vuelve a la del superadmin.
 *
 * Primero se avisa al backend (con el token de la sesión observada, que es el que está en localStorage) para cerrarla del lado servidor;
 * es de mejor esfuerzo: si falla (ya venció, red caída) igual se vuelve, porque la sesión observada vence sola y el token ya no sirve.
 * Devuelve `false` si la sesión real del superadmin ya no existe (pestaña cerrada y reabierta): en ese caso se cerró la sesión y hay
 * que ir al login.
 */
export async function endImpersonation(): Promise<boolean> {
  if (!useAuthStore.getState().user?.impersonation) return true
  try {
    await impersonationApi.stop()
  } catch {
    /* mejor esfuerzo, ver arriba */
  }
  return useAuthStore.getState().restoreOrigin()
}
