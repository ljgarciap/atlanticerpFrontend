/**
 * SCRUM-787 — helper compartido para el bug real encontrado en Pre-QA de Batch 12 (Notas Crédito):
 * `new Date("2026-08-24")` (string "date-only", sin componente de hora) se interpreta como
 * medianoche UTC — en cualquier timezone con offset negativo (América/Panamá, UTC-5, sin horario
 * de verano) esto renderiza como el día ANTERIOR al real. El mismo patrón `formatDate()` estaba
 * duplicado módulo por módulo (Notas Crédito, Cobros) en vez de vivir acá una sola vez.
 *
 * Si el string SÍ trae hora/timezone (ej. `Carbon::toIso8601String()`, formato con "T" y offset),
 * `new Date()` ya lo resuelve bien — este helper solo intercepta el caso "date-only" puro y deja
 * pasar cualquier otro formato sin tocar, así que es seguro reemplazar cualquier `formatDate()`
 * existente por `formatDateShort()` sin importar si esa instancia puntual ya era correcta.
 */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function parseDateOnly(iso: string): Date {
  if (DATE_ONLY_PATTERN.test(iso)) {
    const [year, month, day] = iso.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  return new Date(iso)
}

/** Formato corto es-PA (`"24 ago 2026"`) usado en todo Admin&Cont — reemplaza los `formatDate()`
 *  duplicados de Notas Crédito y Cobros. */
export function formatDateShort(iso: string): string {
  return parseDateOnly(iso).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Hora corta es-PA (`"2:34 p. m."`) para timestamps con hora real (`toIso8601String()`), a
 *  diferencia de `formatDateShort()`/`parseDateOnly()`, que son para fechas "date-only". */
export function formatTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PA', { hour: 'numeric', minute: '2-digit' })
}
