/** Fase 7a — una entrada de un catálogo de vocabulario de la empresa (`/api/catalogs/{domain}`). */
export interface CatalogEntry {
  id:         number
  domain:     string
  key:        string
  label:      string
  sort_order: number
  is_active:  boolean
  /** El código todavía usa esta clave: se puede renombrar y reordenar, no borrar ni desactivar. */
  is_system:  boolean
  props:      Record<string, CatalogPropValue>
}

/** Valor de una propiedad de comportamiento (Fase 7b sumó texto, entero y lista de textos). */
export type CatalogPropValue = string | boolean | number | string[]

export type CatalogPropDef =
  | { type: 'bool', default: boolean }
  | { type: 'enum', values: string[], default: string }
  | { type: 'string', max?: number, default: string | null }
  | { type: 'int', min?: number, max?: number, default: number }
  | { type: 'list', max?: number, default: string[] }

export interface CatalogDomain {
  domain: string
  label:  string
  props:  Record<string, CatalogPropDef>
}
