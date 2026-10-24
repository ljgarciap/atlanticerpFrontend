import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Clases extra para el contenedor raíz (ej. `print-target` + variantes `print:` de la hoja de picking). */
  className?: string
  testId?: string
}

/**
 * SCRUM-1129 — ventana de pantalla completa (overlay `fixed inset-0`, sin cambiar de ruta, así que
 * los filtros/búsqueda de la pantalla de origen se conservan al cerrar). Reemplaza los modales de
 * Bodega → Pedidos. `children` son las secciones (cuerpo con scroll + pie) en una columna flex.
 * Escape cierra solo la ventana superior (pila a nivel de módulo) y el scroll del body se bloquea
 * con un contador global, así que abrir un overlay encima de otro (detalle -> hoja de picking) no
 * deja el body atascado en `overflow:hidden` al cerrarlos en cualquier orden.
 *
 * Apilado: todas usan `z-50` y el orden visual depende del orden en el DOM (la que se monta después
 * queda arriba); los modales internos que deben quedar encima usan `z-[60]` o portal al body.
 */

let scrollLocks = 0
let savedOverflow = ''
function lockBodyScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
}
function unlockBodyScroll() {
  if (--scrollLocks === 0) document.body.style.overflow = savedOverflow
}

const overlayStack: symbol[] = []

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function FullScreenWindow({ title, subtitle, onClose, children, className = '', testId }: Props) {
  const { t } = useTranslation('common')
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    lockBodyScroll()
    return unlockBodyScroll
  }, [])

  useEffect(() => {
    const id = Symbol('fullscreen-window')
    overlayStack.push(id)
    const previouslyFocused = document.activeElement as HTMLElement | null
    rootRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (overlayStack[overlayStack.length - 1] !== id) return
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab' && rootRef.current) {
        const items = Array.from(rootRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (items.length === 0) {
          e.preventDefault()
          rootRef.current.focus()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === rootRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const idx = overlayStack.indexOf(id)
      if (idx >= 0) overlayStack.splice(idx, 1)
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
    }
  }, [])

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid={testId}
      className={`fixed inset-0 z-50 flex flex-col bg-slate-50 dark:bg-slate-900 outline-none ${className}`}
    >
      <div className="flex items-start justify-between gap-4 px-5 py-4 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 shrink-0 print:border-0">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle}
        </div>
        <Button
          variant="outline"
          onClick={onClose}
          className="print:!hidden !flex !items-center !gap-1.5 shrink-0"
          data-testid="fullscreen-close"
        >
          <IcoClose size={14} /> {t('actions.closeWindow')}
        </Button>
      </div>
      <div className="flex flex-col flex-1 min-h-0 w-full max-w-6xl mx-auto bg-white dark:bg-slate-800 print:max-w-none">
        {children}
      </div>
    </div>
  )
}
