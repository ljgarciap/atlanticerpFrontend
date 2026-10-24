import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import HomePendingPanel from './HomePendingPanel'
import type { HomePendientes } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function makeData(count: number): HomePendientes {
  return {
    count,
    items: Array.from({ length: count }, (_, i) => ({
      type: 'ticket_sin_agendar' as const, ticket_id: i + 1, numero: `T-${i + 1}`, message: `Pendiente ${i + 1}`,
    })),
  }
}

function renderPanel(data: HomePendientes | undefined) {
  return render(
    <MemoryRouter>
      <HomePendingPanel data={data} />
    </MemoryRouter>,
  )
}

// SCRUM-871 — cap de MAX_HOME_CARD_ITEMS (5) + "Ver más" (antes sin límite en este panel).
describe('HomePendingPanel', () => {
  it('con 5 o menos no muestra "Ver más"', () => {
    renderPanel(makeData(5))
    expect(screen.getAllByText(/Pendiente \d/)).toHaveLength(5)
    expect(screen.queryByText('common:actions.viewMore')).not.toBeInTheDocument()
  })

  it('con más de 5 acota a 5 visibles y el modal lista todos', () => {
    renderPanel(makeData(8))
    expect(screen.getAllByText(/Pendiente \d/)).toHaveLength(5)

    fireEvent.click(screen.getByText('common:actions.viewMore'))
    expect(screen.getAllByText(/Pendiente \d/)).toHaveLength(5 + 8)
  })
})
