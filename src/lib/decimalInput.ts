/**
 * SCRUM-81/132/133/137 — <input type="number"> descarta silenciosamente la coma decimal
 * (tecleando "10,5" el navegador solo deja pasar los dígitos, dando "105") y no bloquea
 * signos negativos al pegar/autocompletar. Estos campos (Superficie trabajada, Descuento %,
 * Descuento de Totales) nunca aceptan valores negativos, así que el signo se descarta junto
 * con cualquier otro carácter no numérico en vez de reflejarlo y luego revertirlo.
 */
export function sanitizeUnsignedDecimalInput(raw: string): string {
  const normalized = raw.replace(/,/g, '.')
  const cleaned = normalized.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot === -1) return cleaned
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
}

/** Clampa un string ya saneado (ver sanitizeUnsignedDecimalInput) a [0, 100]. */
export function clampPercentInput(raw: string): string {
  if (raw === '' || raw === '.') return raw
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n > 100 ? '100' : raw
}
