import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import SessionExpiredModal from './SessionExpiredModal'
import { useAuthStore } from '@/store/authStore'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const Probe = () => {
  const l = useLocation()
  const state = l.state as { from?: string; fromUserId?: number | null } | null
  return <div data-testid="estado">{l.pathname}|{state?.from ?? '(sin from)'}|{state?.fromUserId ?? '(sin id)'}</div>
}

function renderModal(entry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SessionExpiredModal />
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { useAuthStore.setState({ user: null, sessionExpired: true, lastUserId: null }) })

// SCRUM-1159 (Pre-QA N-2) — al pulsar «Ir al login» el destino que RequireAuth guardó no debe perderse.
describe('SessionExpiredModal', () => {
  it('no se muestra si la sesión no expiró', () => {
    useAuthStore.setState({ sessionExpired: false })
    renderModal('/login')
    expect(screen.queryByText('messages.sessionExpiredCta')).not.toBeInTheDocument()
  })

  it('estando en /login conserva el estado (destino + persona) al pulsar el botón', () => {
    renderModal({ pathname: '/login', state: { from: '/bodega/pedidos/status?search=PED-2026-0009', fromUserId: 35 } })
    fireEvent.click(screen.getByText('messages.sessionExpiredCta'))
    expect(screen.getByTestId('estado')).toHaveTextContent('/login|/bodega/pedidos/status?search=PED-2026-0009|35')
    expect(useAuthStore.getState().sessionExpired).toBe(false)
  })

  it('fuera de /login guarda la ruta actual ligada a la persona de la sesión que expiró', () => {
    useAuthStore.setState({ lastUserId: 35 })
    renderModal('/bodega/pedidos/status?search=PED-2026-0009')
    fireEvent.click(screen.getByText('messages.sessionExpiredCta'))
    expect(screen.getByTestId('estado')).toHaveTextContent('/login|/bodega/pedidos/status?search=PED-2026-0009|35')
  })

  it('en /login sin estado no inventa un destino', () => {
    renderModal('/login')
    fireEvent.click(screen.getByText('messages.sessionExpiredCta'))
    expect(screen.getByTestId('estado')).toHaveTextContent('/login|(sin from)|(sin id)')
  })
})
