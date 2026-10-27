import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCatalog } from '@/hooks/useCatalog'
import { PIPELINE_STAGES } from '@/types/ventasDiseno'
import type { CatalogEntry } from '@/types/catalogs'
import type { KnownPipelineStage } from '@/types/ventasDiseno'

/** Categoría de una etapa (propiedad `categoria` del catálogo `pipeline_stage`, Fase 7c): abierta = en curso, ganada = Aprobado, perdida = Perdido. */
export type StageCategory = 'abierta' | 'ganada' | 'perdida'

export interface PipelineStageInfo {
  key:      string
  label:    string
  color:    string
  category: StageCategory
  isSystem: boolean
}

const DEFAULT_COLOR = '#6b7280'
const CATEGORY_OF: Record<KnownPipelineStage, StageCategory> = {
  lead: 'abierta', design: 'abierta', quote: 'abierta', proposal: 'abierta', approved: 'ganada', lost: 'perdida',
}
const FALLBACK_COLOR = Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, s.color])) as Record<string, string>

function fromEntry(e: CatalogEntry): PipelineStageInfo {
  const p = e.props ?? {}
  const category = p.categoria === 'ganada' || p.categoria === 'perdida' ? p.categoria : 'abierta'
  return {
    key:      e.key,
    label:    e.label,
    color:    typeof p.color === 'string' && p.color !== '' ? p.color : (FALLBACK_COLOR[e.key] ?? DEFAULT_COLOR),
    category,
    isSystem: e.is_system,
  }
}

/**
 * Fase 7c — etapas del pipeline de Ventas & Diseño desde el catálogo de la empresa. El código pregunta por la CATEGORÍA de una etapa
 * (`isWon`, `isLost`, `isOpen`) y por su posición en el flujo lineal (`next`, `isAtOrAfter`), no por su clave: una etapa propia (siempre
 * `abierta`, entre Lead y Aprobado) se comporta como cualquier etapa abierta. Mientras el catálogo carga o si falla, rigen las 6 de sistema.
 * Las claves de sistema (`lead`, `quote`, `proposal`, `approved`) siguen existiendo como ANCLAS de las compuertas.
 */
export function usePipelineStages() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const { data } = useCatalog('pipeline_stage')

  const stages = useMemo<PipelineStageInfo[]>(() => {
    // El flujo depende del orden: se ordena por `sort_order` aquí (la API ya lo entrega ordenado, pero no se asume).
    if (data && data.length > 0) return [...data].sort((a, b) => a.sort_order - b.sort_order).map(fromEntry)
    return PIPELINE_STAGES.map(s => ({ key: s.id, label: t(`ventasDiseno:stages.${s.id}`), color: s.color, category: CATEGORY_OF[s.id], isSystem: true }))
  }, [data, t])

  /** Flujo lineal: las etapas que no son «perdida», en orden. */
  const linear = useMemo(() => stages.filter(s => s.category !== 'perdida').map(s => s.key), [stages])

  const info = useCallback((stage: string | null | undefined): PipelineStageInfo => {
    const found = stages.find(s => s.key === stage)
    if (found) return found
    const known = stage ? CATEGORY_OF[stage as KnownPipelineStage] : undefined
    if (known) return { key: stage as string, label: t(`ventasDiseno:stages.${stage}`), color: FALLBACK_COLOR[stage as string] ?? DEFAULT_COLOR, category: known, isSystem: true }
    return { key: stage ?? '', label: stage ?? '', color: DEFAULT_COLOR, category: 'abierta', isSystem: false }
  }, [stages, t])

  const index = useCallback((stage: string | null | undefined) => {
    const i = linear.indexOf(stage ?? '')
    return i === -1 ? null : i
  }, [linear])

  return {
    stages,
    linear,
    keys:  useMemo(() => stages.map(s => s.key), [stages]),
    info,
    label: (stage: string | null | undefined) => info(stage).label,
    color: (stage: string | null | undefined) => info(stage).color,
    isWon:  (stage: string | null | undefined) => info(stage).category === 'ganada',
    isLost: (stage: string | null | undefined) => info(stage).category === 'perdida',
    isOpen: (stage: string | null | undefined) => info(stage).category === 'abierta',
    /** La etapa siguiente del flujo lineal; null si es la última (Aprobado) o la perdida. */
    next: (stage: string | null | undefined): string | null => {
      const i = index(stage)
      return i === null ? null : (linear[i + 1] ?? null)
    },
    /** ¿La etapa está en la posición de `anchor` o después en el flujo lineal? (p. ej. «ya llegó a Cotización») */
    isAtOrAfter: (stage: string | null | undefined, anchor: string) => {
      const i = index(stage); const a = index(anchor)
      return i !== null && a !== null && i >= a
    },
    /** ¿La etapa está antes de `anchor` en el flujo lineal? (p. ej. «todavía no se cotizó») */
    isBefore: (stage: string | null | undefined, anchor: string) => {
      const i = index(stage); const a = index(anchor)
      return i !== null && a !== null && i < a
    },
  }
}
