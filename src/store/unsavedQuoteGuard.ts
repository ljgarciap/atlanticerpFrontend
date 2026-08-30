import { create } from 'zustand'

// SCRUM-723 — guarda si la cotización abierta en QuotePage tiene cambios sin
// confirmar (formulario tocado sin generar, o generada pero sin confirmar). Sidebar
// lo lee para interceptar la navegación in-app; QuotePage lo escribe y lo limpia.
// No usa <BrowserRouter> con data router (useBlocker no está disponible), así que
// este store es el mecanismo de bajo costo para comunicar el estado entre ambos
// componentes sin acoplarlos directamente.
interface UnsavedQuoteGuardState {
  isDirty:  boolean
  setDirty: (value: boolean) => void
}

export const useUnsavedQuoteGuard = create<UnsavedQuoteGuardState>()(set => ({
  isDirty: false,
  setDirty: value => set({ isDirty: value }),
}))
