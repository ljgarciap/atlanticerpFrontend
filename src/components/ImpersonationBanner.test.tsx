import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import ImpersonationBanner, { formatRemaining } from './ImpersonationBanner'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import * as impersonationLib from '@/lib/impersonation'
import type { UserInfo } from '@/types/auth'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/lib/impersonation', () => ({ endImpersonation: vi.fn() }))

const endImpersonation = vi.mocked(impersonationLib.endImpersonation)

const NOW = new Date('2026-10-19T15:00:00Z').getTime()

function observed(expiresInMs: number): UserInfo {
  return {
    id: 77, first_name: 'Vera', last_name: 'Vendedora', email: 'v@x.test', role: 'vendedor', permissions: [],
    impersonation: {
      id: 'imp-1', actor_id: 1, actor_name: 'Super Admin', target_name: 'Vera Vendedora',
      expires_at: new Date(NOW + expiresInMs).toISOString(),
    },
  }
}

function renderBanner() {
  return render(
    <MemoryRouter initialEntries={['/ventas-diseno/home']}>
      <ImpersonationBanner />
      <Routes>
        <Route path="/security/users" element={<div>pantalla-usuarios</div>} />
        <Route path="/login" element={<div>pantalla-login</div>} />
        <Route path="*" element={<div>otra</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  vi.setSystemTime(NOW)
  endImpersonation.mockReset()
  useToastStore.setState({ toasts: [] })
  useAuthStore.setState({ user: null })
})
afterEach(() => { vi.useRealTimers() })

describe('formatRemaining', () => {
  it('formatea mm:ss y no baja de cero', () => {
    expect(formatRemaining(30 * 60_000)).toBe('30:00')
    expect(formatRemaining(61_500)).toBe('01:02')
    expect(formatRemaining(-5)).toBe('00:00')
  })
})

describe('ImpersonationBanner', () => {
  it('no renderiza nada en una sesión normal', () => {
    useAuthStore.setState({ user: { id: 1, first_name: 'A', last_name: 'B', email: 'a@x.test', role: 'superadmin', permissions: [] } })
    renderBanner()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('muestra a quién se observa, que es solo lectura, quién la inició y la cuenta regresiva', () => {
    useAuthStore.setState({ user: observed(30 * 60_000) })
    renderBanner()

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/impersonation.viewingAs.*Vera Vendedora/)).toBeInTheDocument()
    expect(screen.getByText('impersonation.readOnly')).toBeInTheDocument()
    expect(screen.getByText(/impersonation.startedBy.*Super Admin/)).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('30:00')
  })

  it('la cuenta regresiva avanza cada segundo', () => {
    useAuthStore.setState({ user: observed(90_000) })
    renderBanner()

    act(() => { vi.advanceTimersByTime(31_000) })

    expect(screen.getByRole('timer')).toHaveTextContent('00:59')
  })

  it('«Salir» termina la sesión y lleva a Seguridad > Usuarios', async () => {
    vi.useRealTimers()
    useAuthStore.setState({ user: observed(10 * 60_000) })
    endImpersonation.mockResolvedValueOnce(true)
    renderBanner()

    fireEvent.click(screen.getByRole('button', { name: /impersonation.exit/ }))

    await waitFor(() => expect(screen.getByText('pantalla-usuarios')).toBeInTheDocument())
    expect(endImpersonation).toHaveBeenCalledTimes(1)
  })

  it('si la sesión real ya no existe avisa y lleva al login', async () => {
    vi.useRealTimers()
    useAuthStore.setState({ user: observed(10 * 60_000) })
    endImpersonation.mockResolvedValueOnce(false)
    renderBanner()

    fireEvent.click(screen.getByRole('button', { name: /impersonation.exit/ }))

    await waitFor(() => expect(screen.getByText('pantalla-login')).toBeInTheDocument())
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('al llegar la cuenta a cero sale sola, una sola vez', async () => {
    useAuthStore.setState({ user: observed(2_000) })
    endImpersonation.mockResolvedValue(true)
    renderBanner()

    await act(async () => { vi.advanceTimersByTime(5_000) })

    expect(endImpersonation).toHaveBeenCalledTimes(1)
  })

  it('un doble clic en «Salir» no dispara dos salidas', async () => {
    vi.useRealTimers()
    useAuthStore.setState({ user: observed(10 * 60_000) })
    endImpersonation.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(true), 20)))
    renderBanner()

    const btn = screen.getByRole('button', { name: /impersonation.exit/ })
    fireEvent.click(btn); fireEvent.click(btn)

    await waitFor(() => expect(screen.getByText('pantalla-usuarios')).toBeInTheDocument())
    expect(endImpersonation).toHaveBeenCalledTimes(1)
  })
})
