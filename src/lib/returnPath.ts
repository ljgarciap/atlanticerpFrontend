/**
 * SCRUM-1159 — destino al que volver tras iniciar sesión (el enlace de un correo o de una notificación llega a una ruta protegida, el guard
 * manda a /login y, sin esto, el usuario aterrizaba en su inicio y perdía el enlace). `RequireAuth` guarda la ruta pedida en
 * `location.state.from`; el login solo la usa si es una ruta INTERNA de la app, nunca una URL externa (open redirect) ni una pantalla de
 * acceso (bucle).
 */
const AUTH_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password']

export function safeReturnPath(from: unknown): string | null {
  if (typeof from !== 'string' || from.length === 0 || from.length > 2000) return null
  // Debe ser una ruta absoluta de la propia app: «/x», no «//host», «/\host» ni «https://…».
  if (!from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return null
  // Sin caracteres de control ni saltos de línea.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(from)) return null
  const pathname = from.split(/[?#]/)[0]
  if (AUTH_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))) return null
  return from
}

/**
 * Destino al que volver tras iniciar sesión, dado el estado de /login (`from` + `fromUserId`) y la persona que acaba de entrar.
 * SCRUM-1159 (Pre-QA N-1/N-2): `RequireAuth` guarda `fromUserId` = quien tenía la sesión que se cerró.
 *  - sin `fromUserId` (nadie tenía sesión: el enlace de un correo o una notificación) → cualquiera puede usar el destino;
 *  - con `fromUserId` → solo esa misma persona; si entra OTRA, va a su inicio (en un equipo compartido no hereda la ruta ni la búsqueda ajenas).
 */
export function returnPathFor(state: unknown, userId: number): string | null {
  const s = (typeof state === 'object' && state !== null ? state : {}) as { from?: unknown; fromUserId?: unknown }
  const from = safeReturnPath(s.from)
  if (from === null) return null
  if (s.fromUserId === undefined || s.fromUserId === null) return from
  return s.fromUserId === userId ? from : null
}
