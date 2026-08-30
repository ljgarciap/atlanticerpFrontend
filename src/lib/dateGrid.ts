// SCRUM-66/177 — helpers de fecha compartidos entre CalendarModal (calendario completo) y
// MiniCalendarCard (miniatura de la tarjeta de Inicio). Extraídos para no duplicar la misma
// lógica de grilla en dos componentes.
export function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
export function endOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
export function startOfWeek(d: Date): Date { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x }
export function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// SCRUM-66 — toISOString() convierte a UTC antes de recortar la fecha: con un Date que trae hora
// real (ej. "ahora" de noche en un huso negativo como Panama, UTC-5), el dia calculado se
// adelanta un dia respecto al calendario local. Componentes locales evitan ese desfase.
export function toDateKey(d: Date): string {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function isSameDay(a: Date, b: Date): boolean { return toDateKey(a) === toDateKey(b) }

export type CalendarPill = 'day' | 'week' | 'month'

/**
 * Rango `from`/`to` para la tarjeta "Mi calendario" según el pill Día/Semana/Mes. Usa `toDateKey`
 * (componentes locales) en vez de `toISOString().slice(0,10)` — esa conversión a UTC antes de
 * recortar la fecha es exactamente el bug de huso horario que ya se corrigió una vez en
 * CalendarModal (SCRUM-66, 2026-07-15): de noche en Panamá (UTC-5) puede devolver el día
 * siguiente.
 */
export function rangeForPill(pill: CalendarPill, today: Date = new Date()): { from: string; to: string } {
  if (pill === 'day') {
    const d = toDateKey(today)
    return { from: d, to: d }
  }
  if (pill === 'week') {
    const start = startOfWeek(today)
    return { from: toDateKey(start), to: toDateKey(addDays(start, 6)) }
  }
  return { from: toDateKey(startOfMonth(today)), to: toDateKey(endOfMonth(today)) }
}
