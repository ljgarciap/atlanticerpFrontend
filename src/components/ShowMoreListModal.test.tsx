import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ShowMoreListModal from './ShowMoreListModal'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('ShowMoreListModal', () => {
  it('renderiza todos los items vía renderItem', () => {
    render(
      <ShowMoreListModal
        title="Pendientes"
        items={['a', 'b', 'c']}
        renderItem={item => <div key={item}>{item}</div>}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('b')).toBeInTheDocument()
    expect(screen.getByText('c')).toBeInTheDocument()
  })

  it('llama onClose al cerrar', () => {
    const onClose = vi.fn()
    render(
      <ShowMoreListModal title="Pendientes" items={[]} renderItem={() => null} onClose={onClose} />,
    )
    fireEvent.click(screen.getByText('actions.close'))
    expect(onClose).toHaveBeenCalled()
  })
})
