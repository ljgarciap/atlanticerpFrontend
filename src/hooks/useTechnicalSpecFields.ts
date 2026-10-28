import { useCatalogOptions } from '@/hooks/useCatalog'

/** Campos genéricos de sistema: siempre existen (respaldo mientras el catálogo carga o si falla). */
const FALLBACK = [
  { key: 'dimensions', label: 'Dimensiones' }, { key: 'weight', label: 'Peso' }, { key: 'material_finish', label: 'Material / acabado' },
  { key: 'warranty', label: 'Garantía' }, { key: 'certifications', label: 'Certificaciones' },
]

function humanize(key: string): string {
  const text = key.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Fase 9c — filas de la ficha técnica estructurada de un producto: los campos ACTIVOS del catálogo `technical_spec_field` en su orden, con la
 * etiqueta de la empresa, y después cualquier clave con valor que el catálogo no conozca (con su clave legible) para no ocultar datos.
 * Solo devuelve campos con valor.
 */
export function useTechnicalSpecRows(spec: Record<string, string> | null | undefined): { key: string, label: string, value: string }[] {
  const fields = useCatalogOptions('technical_spec_field', FALLBACK)
  if (!spec) return []
  const known = new Set(fields.map(f => f.key))
  const ordered = [...fields, ...Object.keys(spec).filter(k => !known.has(k)).map(k => ({ key: k, label: humanize(k) }))]
  return ordered.filter(f => spec[f.key] !== undefined && spec[f.key] !== null && spec[f.key] !== '').map(f => ({ ...f, value: spec[f.key] }))
}
