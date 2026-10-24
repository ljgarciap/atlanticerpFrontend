import { AUTH_PERSIST_KEY, useAuthStore } from '@/store/authStore'

/**
 * SCRUM-1158 (Pre-QA UI-C) — varias pestañas del mismo navegador COMPARTEN localStorage (`accessToken` y la sesión persistida) pero cada una
 * tiene su propio estado en memoria. Si en una pestaña se entra o se sale de «Ver como usuario», las demás seguirían mostrando la identidad
 * anterior (UI del superadmin, sin franja) mientras su API ya usa el token de la otra identidad. Mitigación del diseño §4: la pestaña que NO
 * originó el cambio se recarga y se rehidrata con la identidad vigente.
 *
 * Qué dispara la recarga: SOLO un cambio del id de la sesión observada (`user.impersonation.id`) dentro de la sesión persistida:
 *   ninguna → una · una → ninguna · una → otra.
 * Qué NO la dispara (para que nada cambie sin impersonación): el refresh silencioso (reescribe `accessToken` y `refreshToken`, el id de
 * impersonación es el mismo), login/logout normales (ninguna → ninguna) y cualquier otra clave. Por eso se mira la sesión persistida y no
 * `accessToken`, que se reescribe en cada refresh.
 *
 * El evento `storage` solo llega a las OTRAS pestañas, nunca a la que escribió: no hay bucle ni recarga propia.
 */
export function impersonationIdFromStored(raw: string | null): string | null {
  if (raw === null) return null
  try {
    const id = (JSON.parse(raw) as { state?: { user?: { impersonation?: { id?: unknown } | null } | null } })?.state?.user?.impersonation?.id
    return typeof id === 'string' && id !== '' ? id : null
  } catch {
    return null   // valor ilegible: no es una señal de impersonación
  }
}

type StorageEventLike = Pick<StorageEvent, 'key' | 'oldValue' | 'newValue' | 'storageArea'>

export function impersonationChangedByOtherTab(e: StorageEventLike, hasSession: boolean): boolean {
  if (e.key !== AUTH_PERSIST_KEY) return false
  if (e.storageArea !== null && e.storageArea !== localStorage) return false
  // Una pestaña sin sesión (en el login) no muestra ninguna identidad que pueda quedar desactualizada.
  if (!hasSession) return false
  return impersonationIdFromStored(e.oldValue) !== impersonationIdFromStored(e.newValue)
}

/** Instala el listener; devuelve la función que lo quita. `reload` es inyectable para pruebas. */
export function installImpersonationTabSync(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  reload: () => void = () => window.location.reload(),
): () => void {
  const onStorage = (e: Event) => {
    if (impersonationChangedByOtherTab(e as StorageEvent, useAuthStore.getState().user !== null)) reload()
  }
  target.addEventListener('storage', onStorage)
  return () => target.removeEventListener('storage', onStorage)
}
