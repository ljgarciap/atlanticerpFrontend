import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FullScreenWindow from './FullScreenWindow'

describe('FullScreenWindow (SCRUM-1129)', () => {
  it('renderiza título, contenido y el botón "Cerrar ventana" que invoca onClose', () => {
    const onClose = vi.fn()
    render(
      <FullScreenWindow title="Detalle del pedido" onClose={onClose} testId="fsw">
        <p>contenido</p>
      </FullScreenWindow>,
    )
    expect(screen.getByRole('dialog')).toHaveClass('fixed', 'inset-0')
    expect(screen.getByText('Detalle del pedido')).toBeInTheDocument()
    expect(screen.getByText('contenido')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('fullscreen-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('bloquea el scroll del body mientras está abierta y lo restaura al cerrarse', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = render(
      <FullScreenWindow title="x" onClose={() => {}}>
        <span />
      </FullScreenWindow>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })
})

describe('FullScreenWindow apilada (SCRUM-1129, Senior Review)', () => {
  const win = (name: string, onClose = () => {}) => (
    <FullScreenWindow key={name} title={name} onClose={onClose} testId={name}>
      <button>{name}-btn</button>
    </FullScreenWindow>
  )

  it.each([
    ['en orden de montaje', 'A'],
    ['en orden inverso', 'B'],
  ])('el body queda restaurado con dos ventanas cerradas %s', (_n, closesFirst) => {
    document.body.style.overflow = 'auto'
    const { rerender } = render(<>{win('A')}{win('B')}</>)
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<>{closesFirst === 'A' ? win('B') : win('A')}</>)
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<></>)
    expect(document.body.style.overflow).toBe('auto')
  })

  it('Escape solo cierra la ventana superior', () => {
    const onA = vi.fn()
    const onB = vi.fn()
    render(<>{win('A', onA)}{win('B', onB)}</>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onB).toHaveBeenCalledTimes(1)
    expect(onA).not.toHaveBeenCalled()
  })

  it('tiene nombre accesible, toma el foco al abrir y lo devuelve al cerrar', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = render(win('Detalle X'))
    const dialog = screen.getByRole('dialog', { name: 'Detalle X' })
    expect(document.activeElement).toBe(dialog)
    unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('la trampa de foco cicla con Tab y Shift+Tab dentro del overlay', () => {
    render(win('T'))
    const close = screen.getByTestId('fullscreen-close')
    const last = screen.getByText('T-btn')
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })
})

describe('FullScreenWindow impresión (SCRUM-1129, Pre-QA)', () => {
  it('el botón "Cerrar ventana" se oculta al imprimir con print:!hidden (print:hidden perdía contra !flex)', () => {
    render(<FullScreenWindow title="Hoja" onClose={vi.fn()}><p>contenido</p></FullScreenWindow>)
    const cls = screen.getByTestId('fullscreen-close').className
    expect(cls).toContain('print:!hidden')
    expect(cls).not.toMatch(/(^|\s)print:hidden/)
  })
})
