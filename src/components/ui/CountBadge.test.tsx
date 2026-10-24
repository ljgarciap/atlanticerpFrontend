import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CountBadge from './CountBadge'

describe('CountBadge', () => {
  it('muestra el conteo', () => {
    render(<CountBadge count={7} />)
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('usa la píldora pastel (rounded-full) para el tono neutro por defecto', () => {
    render(<CountBadge count={3} />)
    expect(screen.getByText('3')).toHaveClass('rounded-full', 'bg-slate-100')
  })

  it('aplica el tono crítico', () => {
    render(<CountBadge count={2} tone="critical" />)
    expect(screen.getByText('2')).toHaveClass('bg-red-50', 'text-red-600')
  })
})
