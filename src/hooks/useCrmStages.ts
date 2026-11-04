import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCatalog } from '@/hooks/useCatalog'
import { STAGES } from '@/types/project'
import type { StageCategory } from '@/hooks/usePipelineStages'

export interface CrmStageInfo {
  id:       string
  label:    string
  color:    string
  category: StageCategory
}

const DEFAULT_COLOR = '#6b7280'
const CATEGORY_OF: Record<string, StageCategory> = { cerrado: 'ganada', perdido: 'perdida' }

/**
 * Fase 22 (B5) — etapas del CRM desde el catálogo de la empresa (`crm_stage`). El código pregunta por la CATEGORÍA (`isLost`, `isWon`), no
 * por la clave: una etapa propia (siempre `abierta`) se comporta como cualquier etapa abierta. Mientras el catálogo carga o si falla,
 * rigen las 6 de siempre.
 */
export function useCrmStages() {
  const { t } = useTranslation(['crm'])
  const { data } = useCatalog('crm_stage')

  const stages = useMemo<CrmStageInfo[]>(() => {
    if (data && data.length > 0) {
      return [...data].sort((a, b) => a.sort_order - b.sort_order).map(e => {
        const p = e.props ?? {}
        const category: StageCategory = p.categoria === 'ganada' || p.categoria === 'perdida' ? p.categoria : 'abierta'
        const fallback = STAGES.find(s => s.id === e.key)?.color
        return { id: e.key, label: e.label, color: typeof p.color === 'string' && p.color !== '' ? p.color : (fallback ?? DEFAULT_COLOR), category }
      })
    }
    return STAGES.map(s => ({ id: s.id, label: t(`crm:stages.${s.id}`), color: s.color, category: CATEGORY_OF[s.id] ?? 'abierta' }))
  }, [data, t])

  const info = useCallback((id: string | null | undefined): CrmStageInfo => {
    return stages.find(s => s.id === id) ?? { id: id ?? '', label: id ?? '', color: DEFAULT_COLOR, category: CATEGORY_OF[id ?? ''] ?? 'abierta' }
  }, [stages])

  return {
    stages,
    info,
    label:  (id: string | null | undefined) => info(id).label,
    isLost: (id: string | null | undefined) => info(id).category === 'perdida',
    isWon:  (id: string | null | undefined) => info(id).category === 'ganada',
  }
}
