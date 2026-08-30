/**
 * SCRUM-237/240 (rebote de Daniela Amaya 2026-08-12, decisión del Arquitecto 2026-08-15) —
 * `catalog_products` gana una columna `name` propia (antes `description` hacía doble función de
 * "nombre visible" y "descripción", causando que editar la Descripción cambiara el nombre del
 * producto en toda la app). Backfill server-side: `name = description` para productos existentes.
 *
 * `name` llega opcional en el tipo mientras el backend del batch (worktree en paralelo) no esté
 * desplegado acá — este helper centraliza el fallback para no repetir `p.name ?? p.description`
 * en cada punto de lectura (tablas, PDF, Excel, candidatos de Sustitutos, etc.).
 *
 * // TODO: backend batch4 — una vez el backend confirme que `name` siempre viene poblado (nunca
 * vacío/undefined), evaluar si este fallback sigue haciendo falta o puede simplificarse.
 */
export function productDisplayName(product: { name?: string | null; description: string }): string {
  return product.name && product.name.trim() !== '' ? product.name : product.description
}
