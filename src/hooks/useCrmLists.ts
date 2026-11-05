import { useTranslation } from 'react-i18next'
import { useCatalog } from '@/hooks/useCatalog'

/**
 * Fase 25 — listas del CRM que son catálogo de la empresa (Ajustes → Catálogos): tipos de proyecto, de actividad y de recordatorio y
 * categorías de documento. Mientras el catálogo no ha cargado (o falla) se usan los valores de siempre, con su traducción, para que la
 * pantalla no quede vacía. `labelOf` resuelve cualquier clave —incluso una desactivada que aún tiene datos— sin romper.
 */
export type CrmListDomain = 'crm_project_type' | 'crm_activity_type' | 'crm_reminder_type' | 'crm_document_category'

const HISTORICAL: Record<CrmListDomain, { prefix: string, keys: string[] }> = {
  crm_project_type:      { prefix: 'crm:project.tipoRadio',   keys: ['diseno', 'cotizacion', 'ambos'] },
  crm_activity_type:     { prefix: 'crm:activityTypes',       keys: ['llamada', 'email', 'reunion', 'whatsapp', 'visita', 'otro'] },
  crm_reminder_type:     { prefix: 'crm:reminder.types',      keys: ['llamada', 'email', 'whatsapp', 'reunion', 'visita', 'cotizacion', 'diseno', 'otro'] },
  crm_document_category: { prefix: 'crm:document.categorias', keys: ['cotizacion', 'diseno', 'presentacion', 'plano', 'render', 'ficha', 'modelo_3d', 'otro'] },
}

const humanize = (key: string) => key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

export function useCrmList(domain: CrmListDomain) {
  const { t } = useTranslation('crm')
  const { data } = useCatalog(domain)
  const { prefix, keys } = HISTORICAL[domain]
  const translate = (key: string) => t(`${prefix}.${key}`, { defaultValue: humanize(key) })

  const options = data && data.length > 0
    ? data.map(e => ({ key: e.key, label: e.label }))
    : keys.map(key => ({ key, label: translate(key) }))

  const labelOf = (key: string) => options.find(o => o.key === key)?.label ?? translate(key)

  return { options, labelOf }
}
