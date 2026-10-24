import { createContext, useContext } from 'react'

/**
 * SCRUM-1161 — `QuotePartsList` envuelve las partidas en un único `DragDropContext` y publica acá si el arrastre está
 * disponible. `QuotePartCard`/`QuoteItemRow` solo montan `Droppable`/`Draggable` cuando lo está: fuera de la lista
 * (o sin permiso de edición) se renderizan como siempre, sin exigir el contexto de `@hello-pangea/dnd`.
 */
export interface QuoteDnd {
  /** Hay arrastre disponible (la cotización es editable). */
  enabled:  boolean
  /** Mientras se guarda un reordenamiento no se acepta otro (evita carreras entre dos PUT). */
  disabled: boolean
}

export const QuoteDndContext = createContext<QuoteDnd>({ enabled: false, disabled: false })

export function useQuoteDnd(): QuoteDnd {
  return useContext(QuoteDndContext)
}
