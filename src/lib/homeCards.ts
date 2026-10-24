/** SCRUM-871 — máximo de elementos visibles antes de mostrar "Ver más", en toda tarjeta de Home. */
export const MAX_HOME_CARD_ITEMS = 5

/**
 * SCRUM-908 — un pendiente de aprobación, tal como lo devuelve cada
 * `GET /{modulo}/home/approvals-pending`. Ya viene ordenado por antigüedad (más viejo primero);
 * el filtro de "quién lo ve" se resuelve server-side por el permiso efectivo real de cada tipo.
 */
export interface ApprovalPendingItem {
  tipo:          string
  label:         string
  created_at:    string
  detail_route:  string
}
