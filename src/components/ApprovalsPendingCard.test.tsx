import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import ApprovalsPendingCard from './ApprovalsPendingCard'
import type { ApprovalPendingItem } from '@/lib/homeCards'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function makeItems(n: number): ApprovalPendingItem[] {
  return Array.from({ length: n }, (_, i) => ({
    tipo: `tipo_${i}`,
    label: `Pendiente ${i}`,
    created_at: new Date(2026, 0, i + 1).toISOString(),
    detail_route: `/modulo/detalle/${i}`,
  }))
}

function renderCard(items: ApprovalPendingItem[]) {
  return render(
    <MemoryRouter>
      <ApprovalsPendingCard items={items} />
    </MemoryRouter>,
  )
}

describe('ApprovalsPendingCard', () => {
  it('no renderiza nada (ni el título) cuando no hay pendientes', () => {
    const { container } = renderCard([])
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Aprobaciones Pendientes')).not.toBeInTheDocument()
  })

  it('con 5 o menos no muestra "Ver más"', () => {
    renderCard(makeItems(5))
    expect(screen.getByText('Aprobaciones Pendientes')).toBeInTheDocument()
    expect(screen.getAllByText('actions.view')).toHaveLength(5)
    expect(screen.queryByText('actions.viewMore')).not.toBeInTheDocument()
  })

  it('con más de 5 muestra "Ver más" y el modal lista todos', () => {
    renderCard(makeItems(8))
    expect(screen.getAllByText('actions.view')).toHaveLength(5)
    fireEvent.click(screen.getByText('actions.viewMore'))
    expect(screen.getAllByText('actions.view')).toHaveLength(8 + 5) // 5 de la tarjeta + 8 del modal
    expect(screen.getByText('Pendiente 7')).toBeInTheDocument()
  })

  it('el botón "Ver" navega a detail_route del ítem', () => {
    renderCard(makeItems(2))
    fireEvent.click(screen.getAllByText('actions.view')[1])
    expect(mockNavigate).toHaveBeenCalledWith('/modulo/detalle/1')
  })
})
