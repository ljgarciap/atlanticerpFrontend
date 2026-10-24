import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import QuotePartCard from '@/components/QuotePartCard'
import { useQuotePartsApi } from '@/components/quote/QuotePartsApiContext'
import { QuoteDndContext } from '@/components/quote/QuoteDndContext'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/store/authStore'
import { loadSessionDraft, saveSessionDraft, clearSessionDraft, sessionDraftKey } from '@/lib/sessionDraft'
import { moveItem } from '@/lib/reorder'
import type { QuoteDiscountMode, QuotePartRef, QuotePriceType } from '@/types/ventasDiseno'

interface Props {
  quote: { id: number; parts: QuotePartRef[] }
  discountMode:     QuoteDiscountMode
  canEdit:          boolean
  canSeeCost:       boolean
  minMarginPercent: number
  quotePriceType:   QuotePriceType
}

const isNumberArray = (v: unknown): v is number[] => Array.isArray(v) && v.every(n => typeof n === 'number' && Number.isInteger(n))

/** Prefijo de los droppables de productos: `items-<id de la partida>`. */
export const ITEMS_DROPPABLE_PREFIX = 'items-'

/**
 * SCRUM-1161 — lista de partidas de Crear/Editar cotización : colapsar/expandir (solo visual, por pestaña),
 * y reordenar partidas y productos dentro de su partida por drag and drop. El orden de CREACIÓN no cambia: lo nuevo
 * entra al final y el arrastre solo reescribe la posición después.
 */
export default function QuotePartsList({ quote, discountMode, canEdit, canSeeCost, minMarginPercent, quotePriceType }: Props) {
  const { t } = useTranslation('ventasDiseno')
  const partsApi = useQuotePartsApi()
  const qc = useQueryClient()
  const userId = useAuthStore(s => s.user?.id)
  const queryKey = useMemo(() => ['ventas-diseno-quote', quote.id], [quote.id])
  const draftKey = sessionDraftKey(`quote-collapsed:${quote.id}`, userId)

  // Colapsado = solo visualización; sobrevive a una recarga de la pestaña, no se guarda en el servidor.
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set(loadSessionDraft(draftKey, isNumberArray) ?? []))
  useEffect(() => {
    if (collapsed.size === 0) clearSessionDraft(draftKey)
    else saveSessionDraft(draftKey, [...collapsed])
  }, [collapsed, draftKey])

  const [reorderError, setReorderError] = useState<string | null>(null)
  const onSettled = () => qc.invalidateQueries({ queryKey })
  const onError = () => setReorderError(t('quote.reorderError'))

  const reorderParts = useMutation({
    mutationFn: (ids: number[]) => partsApi.reorder(quote.id, ids),
    onSuccess: () => setReorderError(null), onError, onSettled,
  })
  const reorderItems = useMutation({
    mutationFn: ({ partId, ids }: { partId: number; ids: number[] }) => partsApi.items.reorder(quote.id, partId, ids),
    onSuccess: () => setReorderError(null), onError, onSettled,
  })
  const saving = reorderParts.isPending || reorderItems.isPending

  function setPartsInCache(parts: QuotePartRef[]) {
    qc.setQueryData(queryKey, (old: { parts: QuotePartRef[] } | undefined) => (old ? { ...old, parts } : old))
  }

  function onDragEnd(result: DropResult) {
    const { source, destination, type } = result
    if (!destination || !canEdit || saving) return
    if (type === 'PART') {
      if (source.index === destination.index) return
      const next = moveItem(quote.parts, source.index, destination.index)
      setPartsInCache(next)
      reorderParts.mutate(next.map(p => p.id))
      return
    }
    // Un producto solo se mueve dentro de su partida: soltarlo en otra no hace nada.
    if (source.droppableId !== destination.droppableId || source.index === destination.index) return
    const partId = Number(source.droppableId.slice(ITEMS_DROPPABLE_PREFIX.length))
    const part = quote.parts.find(p => p.id === partId)
    if (!part) return
    const items = moveItem(part.items, source.index, destination.index)
    setPartsInCache(quote.parts.map(p => (p.id === partId ? { ...p, items } : p)))
    reorderItems.mutate({ partId, ids: items.map(i => i.id) })
  }

  const toggle = (id: number) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const allCollapsed = quote.parts.length > 0 && quote.parts.every(p => collapsed.has(p.id))

  return (
    <QuoteDndContext.Provider value={{ enabled: canEdit, disabled: saving }}>
      {quote.parts.length > 1 && (
        <div className="flex justify-end mb-2">
          <Button
            variant="secondary" data-testid="quote-parts-toggle-all"
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(quote.parts.map(p => p.id)))}
          >
            {allCollapsed ? t('quote.expandAll') : t('quote.collapseAll')}
          </Button>
        </div>
      )}
      {reorderError && <p role="alert" className="text-xs text-red-500 mb-2" data-testid="quote-reorder-error">{reorderError}</p>}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="quote-parts" type="PART">
          {dropProvided => (
            <div ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
              {quote.parts.map((part, index) => (
                <Draggable key={part.id} draggableId={`part-${part.id}`} index={index} isDragDisabled={!canEdit || saving}>
                  {(dragProvided, snapshot) => (
                    <div
                      ref={dragProvided.innerRef} {...dragProvided.draggableProps}
                      className={snapshot.isDragging ? 'shadow-lg rounded-xl' : undefined}
                    >
                      <QuotePartCard
                        quoteId={quote.id} part={part}
                        discountMode={discountMode} canEdit={canEdit} canSeeCost={canSeeCost}
                        minMarginPercent={minMarginPercent} quotePriceType={quotePriceType}
                        collapsed={collapsed.has(part.id)} onToggleCollapsed={() => toggle(part.id)}
                        dragHandleProps={dragProvided.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </QuoteDndContext.Provider>
  )
}
