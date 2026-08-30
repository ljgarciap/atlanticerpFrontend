/**
 * SCRUM-137 — Number.prototype.toLocaleString() sin opciones recorta ceros de cola
 * ("25.4" en vez de "25.40"), lo que en un monto monetario se lee como un valor
 * distinto. Todo monto en Cotización usa esto en vez de .toLocaleString() directo.
 *
 * SCRUM-232 — locale fijado explícitamente a 'en-US' (','=miles, '.'=decimales), en vez de
 * `undefined` (locale del navegador/runtime, no garantiza ese formato — un navegador
 * configurado en es-ES, por ejemplo, invierte separador de miles/decimales). El estándar
 * pedido por el cliente es fijo, no debe depender de la configuración regional del usuario.
 */
export function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** SCRUM-232 — mismo estándar ('en-US', separador de miles con ',') para valores enteros (KPIs). */
export function formatInt(amount: number): string {
  return Math.round(amount).toLocaleString('en-US')
}
