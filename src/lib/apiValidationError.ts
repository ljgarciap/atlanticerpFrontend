import { isAxiosError } from 'axios'

/**
 * SCRUM-944/945 (Pre-QA hallazgo B) — el backend rechaza con 422 `{ message, errors: { campo: [msg] } }`
 * (formato estándar de Laravel) y los paneles de la vista consolidada de superadmin no mostraban
 * nada. Mismo criterio que `apiErrorMessage`/`mutationErrorMessage` de Compras/Fiscal (leer
 * `response.data.message`), pero además expone los mensajes por campo para pintarlos junto al input.
 */
export interface ApiValidationError {
  /** Mensaje general del backend (`message`), o null si no vino. */
  message: string | null
  /** TODOS los mensajes por campo/ruta (`errors`), ej. `tiers.0.monto_maximo`. Vacío si no hay. */
  fields: Record<string, string[]>
}

interface LaravelErrorBody {
  message?: string
  errors?: Record<string, string[] | string>
}

export function parseApiValidationError(err: unknown): ApiValidationError | null {
  if (!isAxiosError<LaravelErrorBody>(err)) return null
  const data = err.response?.data
  if (!data || typeof data !== 'object') return null

  const fields: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(data.errors ?? {})) {
    const all = (Array.isArray(value) ? value : [value]).filter((m): m is string => typeof m === 'string' && m !== '')
    if (all.length > 0) fields[key] = all
  }

  const message = typeof data.message === 'string' && data.message !== '' ? data.message : null
  if (message === null && Object.keys(fields).length === 0) return null
  return { message, fields }
}

/** Mensaje único para mostrar arriba de un formulario: el general si existe, si no los del primer campo. */
export function summaryMessage(parsed: ApiValidationError | null, fallback: string): string {
  if (parsed?.message) return parsed.message
  const first = parsed ? Object.values(parsed.fields)[0] : undefined
  return first ? first.join(' ') : fallback
}
