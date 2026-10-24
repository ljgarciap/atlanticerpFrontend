import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ImpersonationSessionsPage from './ImpersonationSessionsPage'
import { impersonationApi, type ImpersonationSession } from '@/api/impersonationApi'
import { useToastStore } from '@/store/toastStore'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/impersonationApi', () => ({ impersonationApi: { listSessions: vi.fn(), revoke: vi.fn() } }))

const list   = vi.mocked(impersonationApi.listSessions)
const revoke = vi.mocked(impersonationApi.revoke)

function makeSession(overrides: Partial<ImpersonationSession> = {}): ImpersonationSession {
  return {
    id: 'imp-1', actor: { id: 1, name: 'Super Admin' }, target: { id: 77, name: 'Vera Vendedora' },
    reason: 'SCRUM-1200 no le aparece el pipeline', started_at: '2026-10-19T15:00:00Z', expires_at: '2026-10-19T15:30:00Z',
    ended_at: null, ended_reason: null, status: 'active', ...overrides,
  }
}

const META = { total: 3, per_page: 20, current_page: 1, last_page: 1 }

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><ImpersonationSessionsPage /></QueryClientProvider>)
}

beforeEach(() => {
  list.mockReset(); revoke.mockReset()
  useToastStore.setState({ toasts: [] })
})

describe('ImpersonationSessionsPage', () => {
  it('lista quién observó a quién, el motivo y el estado', async () => {
    list.mockResolvedValue({ data: [makeSession(), makeSession({ id: 'imp-2', status: 'ended', ended_at: '2026-10-19T15:10:00Z', ended_reason: 'manual' })], meta: META })
    renderPage()

    expect(await screen.findAllByText('Super Admin')).toHaveLength(2)
    expect(screen.getAllByText('Vera Vendedora')).toHaveLength(2)
    expect(screen.getAllByText('SCRUM-1200 no le aparece el pipeline')).toHaveLength(2)
    expect(screen.getByText('security:impersonations.status.active')).toBeInTheDocument()
    expect(screen.getByText('security:impersonations.status.ended')).toBeInTheDocument()
    expect(screen.getByText('security:impersonations.endedReason.manual')).toBeInTheDocument()
  })

  it('una causa de cierre desconocida cae en «otra causa» en vez de mostrar la clave cruda', async () => {
    list.mockResolvedValue({ data: [makeSession({ status: 'ended', ended_at: '2026-10-19T15:10:00Z', ended_reason: 'algo_nuevo' })], meta: META })
    renderPage()

    expect(await screen.findByText('security:impersonations.endedReason.unknown')).toBeInTheDocument()
  })

  it('«Terminar» solo aparece en las activas', async () => {
    list.mockResolvedValue({ data: [makeSession(), makeSession({ id: 'imp-2', status: 'expired', ended_at: '2026-10-19T15:30:00Z', ended_reason: 'expired' })], meta: META })
    renderPage()

    await screen.findAllByText('Super Admin')
    expect(screen.getAllByRole('button', { name: 'security:impersonations.terminate' })).toHaveLength(1)
  })

  it('terminar pide confirmación, revoca esa sesión y avisa', async () => {
    list.mockResolvedValue({ data: [makeSession()], meta: META })
    revoke.mockResolvedValue(undefined)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'security:impersonations.terminate' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('security:impersonations.terminateMessage')
    expect(revoke).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'security:impersonations.terminateConfirm' }))

    await waitFor(() => expect(revoke).toHaveBeenCalledWith('imp-1'))
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.type).toBe('success'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancelar no revoca nada', async () => {
    list.mockResolvedValue({ data: [makeSession()], meta: META })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'security:impersonations.terminate' }))
    fireEvent.click(screen.getByRole('button', { name: 'common:actions.cancel' }))

    expect(revoke).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('si revocar falla avisa con un error', async () => {
    list.mockResolvedValue({ data: [makeSession()], meta: META })
    revoke.mockRejectedValue({ response: { status: 500 } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'security:impersonations.terminate' }))
    fireEvent.click(screen.getByRole('button', { name: 'security:impersonations.terminateConfirm' }))

    await waitFor(() => expect(useToastStore.getState().toasts[0]?.type).toBe('error'))
  })

  it('el filtro por estado pide al servidor ese estado y vuelve a la primera página', async () => {
    list.mockResolvedValue({ data: [makeSession()], meta: META })
    renderPage()
    await screen.findAllByText('Super Admin')

    fireEvent.click(screen.getByRole('button', { name: 'security:impersonations.filters.active' }))

    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ status: 'active', page: 1, per_page: 20 }))
  })

  it('sin resultados muestra el estado vacío; con error de carga, el aviso', async () => {
    list.mockResolvedValueOnce({ data: [], meta: { ...META, total: 0 } })
    const { unmount } = renderPage()
    expect(await screen.findByText('security:impersonations.empty')).toBeInTheDocument()
    unmount()

    list.mockRejectedValueOnce({ response: { status: 500 } })
    renderPage()
    expect(await screen.findByText('security:impersonations.loadError')).toBeInTheDocument()
  })
})
