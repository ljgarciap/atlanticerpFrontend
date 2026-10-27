import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCatalog } from '@/hooks/useCatalog'
import type { CatalogEntry } from '@/types/catalogs'
import type { KnownTicketType } from '@/types/servicios'

/** Qué flujo hereda un tipo de ticket (propiedad `comportamiento` del catálogo `ticket_type`, Fase 7b). */
export type TicketBehavior = 'instalacion' | 'garantia' | 'reclamo' | 'retrofit' | 'generico'

export interface TicketTypeInfo {
  key:      string
  label:    string
  behavior: TicketBehavior
  prefix:   string
  slaDays:  number
  color:    string
  subtypes: string[]
}

const DEFAULT_COLOR = '#6b7280'

/** Respaldo = lo que antes eran constantes del código; rige mientras el catálogo carga o si falla. */
const FALLBACK: Record<KnownTicketType, Omit<TicketTypeInfo, 'key' | 'label'>> = {
  installation: { behavior: 'instalacion', prefix: 'INS', slaDays: 7,  color: '#5BA5A0', subtypes: ['installation', 'inspection'] },
  warranty:     { behavior: 'garantia',    prefix: 'GAR', slaDays: 3,  color: '#9fc54d', subtypes: ['warranty_generic', 'replacement_inspection'] },
  claim:        { behavior: 'reclamo',     prefix: 'REC', slaDays: 2,  color: '#ef4444', subtypes: [] },
  retrofit:     { behavior: 'retrofit',    prefix: 'RET', slaDays: 10, color: '#8b5cf6', subtypes: [] },
}
const FALLBACK_ORDER: KnownTicketType[] = ['installation', 'warranty', 'claim', 'retrofit']

function fromEntry(e: CatalogEntry): TicketTypeInfo {
  const p = e.props ?? {}
  return {
    key:      e.key,
    label:    e.label,
    behavior: (typeof p.comportamiento === 'string' ? p.comportamiento : 'generico') as TicketBehavior,
    prefix:   typeof p.prefijo === 'string' ? p.prefijo : 'TCK',
    slaDays:  typeof p.sla_dias === 'number' ? p.sla_dias : 7,
    color:    typeof p.color === 'string' && p.color !== '' ? p.color : DEFAULT_COLOR,
    subtypes: Array.isArray(p.subtipos) ? p.subtipos : [],
  }
}

/**
 * Fase 7b — tipos de ticket de Servicios desde el catálogo de la empresa. El código pregunta por el COMPORTAMIENTO de un tipo
 * (`is(tipo, 'reclamo')`), no por su clave: un tipo nuevo hereda el flujo del comportamiento que elija. Un tipo desactivado (tickets
 * viejos) cae al respaldo de sistema si es de los 4 originales, y si no, se muestra con su propia clave y comportamiento genérico.
 */
export function useTicketTypes() {
  const { t } = useTranslation('servicios')
  const { data } = useCatalog('ticket_type')

  const types = useMemo<TicketTypeInfo[]>(() => {
    if (data && data.length > 0) return data.map(fromEntry)
    return FALLBACK_ORDER.map(key => ({ key, label: t(`tickets.types.${key}`), ...FALLBACK[key] }))
  }, [data, t])

  const info = useCallback((tipo: string | null | undefined): TicketTypeInfo => {
    const found = types.find(x => x.key === tipo)
    if (found) return found
    const known = tipo ? FALLBACK[tipo as KnownTicketType] : undefined
    if (known) return { key: tipo as string, label: t(`tickets.types.${tipo}`), ...known }
    return { key: tipo ?? '', label: tipo ?? '', behavior: 'generico', prefix: 'TCK', slaDays: 7, color: DEFAULT_COLOR, subtypes: [] }
  }, [types, t])

  return {
    types,
    keys:  useMemo(() => types.map(x => x.key), [types]),
    info,
    label: (tipo: string | null | undefined) => info(tipo).label,
    color: (tipo: string | null | undefined) => info(tipo).color,
    subtypes: (tipo: string | null | undefined) => info(tipo).subtypes,
    /** ¿El tipo hereda este comportamiento? (p. ej. `is(ticket.tipo, 'reclamo')`) */
    is: (tipo: string | null | undefined, behavior: TicketBehavior) => info(tipo).behavior === behavior,
  }
}
