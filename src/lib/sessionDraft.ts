/**
 * SCRUM-1172 — borrador de una pantalla de captura (Nueva Orden de Compra) que sobrevive a una recarga de la página, en `sessionStorage` (por pestaña: se
 * pierde al cerrarla, que es lo esperable). La clave lleva el id del usuario para que dos personas en el mismo navegador no vean el borrador de la otra.
 * Cada lectura/escritura va en try/catch: sin almacenamiento (modo privado, cuota) la pantalla funciona igual, solo que sin recuperar el borrador.
 */
const PREFIX = 'atlanticerp:draft:'

export function sessionDraftKey(screen: string, userId: number | undefined): string | null {
  return userId === undefined ? null : `${PREFIX}${screen}:${userId}`
}

export function loadSessionDraft<T>(key: string | null, isValid: (value: unknown) => value is T): T | null {
  if (key === null) return null
  try {
    const raw = window.sessionStorage.getItem(key)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveSessionDraft(key: string | null, value: unknown): void {
  if (key === null) return
  try { window.sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* sin almacenamiento: se omite */ }
}

export function clearSessionDraft(key: string | null): void {
  if (key === null) return
  try { window.sessionStorage.removeItem(key) } catch { /* sin almacenamiento: se omite */ }
}
