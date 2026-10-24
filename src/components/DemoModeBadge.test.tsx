import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DemoModeBadge from './DemoModeBadge'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockUseDemoModeActive = vi.fn()
vi.mock('@/hooks/useDemoMode', () => ({
  useDemoModeActive: () => mockUseDemoModeActive() as { isActive: boolean },
}))

// docs/specs/demo-mode.md (F3) — el badge es puro: solo depende de useDemoModeActive(), sin
// tocar react-query/authStore directo, así que alcanza con mockear el hook acá.
describe('DemoModeBadge', () => {
  it('no renderiza nada si el modo no está activo', () => {
    mockUseDemoModeActive.mockReturnValue({ isActive: false })
    const { container } = render(<DemoModeBadge />)
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el badge cuando ambos gates (global + personal) están activos', () => {
    mockUseDemoModeActive.mockReturnValue({ isActive: true })
    render(<DemoModeBadge />)
    expect(screen.getByText('common:demoMode.badge')).toBeInTheDocument()
  })
})
