import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RequirementsChecklist from './RequirementsChecklist'
import type { RequirementsPayload } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const EMPTY: RequirementsPayload = { catalog: [], otros: [] }

// REQ-247 RN1/RN6 — checklist fijo de 18 ítems + "otros" de texto libre repetible.
describe('RequirementsChecklist', () => {
  it('marcar un ítem del catálogo lo agrega, volver a marcarlo lo quita', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RequirementsChecklist value={EMPTY} onChange={onChange} />)

    fireEvent.click(screen.getByTestId('requirement-chip-casco'))
    expect(onChange).toHaveBeenCalledWith({ catalog: ['casco'], otros: [] })

    rerender(<RequirementsChecklist value={{ catalog: ['casco'], otros: [] }} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('requirement-chip-casco'))
    expect(onChange).toHaveBeenCalledWith({ catalog: [], otros: [] })
  })

  it('RN6 — "+ Agregar otro" agrega texto libre y se puede quitar', () => {
    const onChange = vi.fn()
    const { rerender } = render(<RequirementsChecklist value={EMPTY} onChange={onChange} />)

    fireEvent.click(screen.getByTestId('requirement-add-other'))
    const input = screen.getByPlaceholderText('tickets.requirements.otherPlaceholder')
    fireEvent.change(input, { target: { value: 'Requiere grúa' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith({ catalog: [], otros: ['Requiere grúa'] })

    rerender(<RequirementsChecklist value={{ catalog: [], otros: ['Requiere grúa'] }} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('requirement-other-0').querySelector('button')!)
    expect(onChange).toHaveBeenCalledWith({ catalog: [], otros: [] })
  })
})
