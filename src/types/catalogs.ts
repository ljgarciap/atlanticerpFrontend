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
  /** `system_only`: valores que solo puede tener una entrada de sistema (p. ej. las categorías «ganada»/«perdida» de una etapa). */
  | { type: 'enum', values: string[], default: string, system_only?: string[] }
  | { type: 'string', max?: number, default: string | null }
  | { type: 'int', min?: number, max?: number, default: number }
  | { type: 'list', max?: number, default: string[] }

export interface CatalogDomain {
  domain: string
  label:  string
  props:  Record<string, CatalogPropDef>
  /** Propiedades (y `sort_order`) que una entrada de SISTEMA no puede cambiar: el código depende de ellas. */
  locked_when_system?: string[]
}
