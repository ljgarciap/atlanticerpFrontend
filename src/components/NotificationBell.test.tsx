import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import NotificationBell from './NotificationBell'
import { notificationsApi } from '@/api/notificationsApi'

// ── Mock react-i18next ────────────────────────────────────────────────────
const LABELS: Record<string, string> = {
  'common:notifications.title':       'Notifications',
  'common:notifications.empty':       'You have no notifications.',
  'common:notifications.markAllRead': 'Mark all as read',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => LABELS[key] ?? key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// ── Mock notificationsApi ────────────────────────────────────────────────
vi.mock('@/api/notificationsApi', () => ({
  notificationsApi: {
    unreadCount: vi.fn(),
    list:        vi.fn(),
    markRead:    vi.fn(),
    markAllRead: vi.fn(),
  },
}))

const mockedApi = vi.mocked(notificationsApi)

function renderBell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.unreadCount.mockResolvedValue(0)
  mockedApi.list.mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } })
  mockedApi.markRead.mockResolvedValue({
    id: 1, content: { subject: 'x', body: 'x' }, link_url: null, is_read: true, read_at: '2026-01-01', created_at: '2026-01-01',
  })
  mockedApi.markAllRead.mockResolvedValue(undefined)
})

describe('NotificationBell', () => {
  it('no muestra badge cuando no hay no-leídas', async () => {
    renderBell()
    await waitFor(() => expect(mockedApi.unreadCount).toHaveBeenCalled())
    expect(screen.queryByTestId('notification-badge')).not.toBeInTheDocument()
  })

  it('muestra el conteo de no-leídas en el badge', async () => {
    mockedApi.unreadCount.mockResolvedValue(3)
    renderBell()
    expect(await screen.findByTestId('notification-badge')).toHaveTextContent('3')
  })

  it('muestra 99+ cuando el conteo supera 99', async () => {
    mockedApi.unreadCount.mockResolvedValue(150)
    renderBell()
    expect(await screen.findByTestId('notification-badge')).toHaveTextContent('99+')
  })

  it('muestra el estado vacío cuando no hay notificaciones', async () => {
    renderBell()
    fireEvent.click(screen.getByTitle('Notifications'))
    expect(await screen.findByText('You have no notifications.')).toBeInTheDocument()
  })

  it('lista las notificaciones al abrir el dropdown', async () => {
    mockedApi.list.mockResolvedValue({
      data: [
        { id: 1, content: { subject: 'Proyecto cerrado', body: 'x' }, link_url: null, is_read: false, read_at: null, created_at: '2026-07-01T00:00:00Z' },
        { id: 2, content: { subject: 'Documento subido', body: 'x' }, link_url: null, is_read: true, read_at: '2026-07-02', created_at: '2026-07-02T00:00:00Z' },
      ],
      meta: { total: 2, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderBell()

    fireEvent.click(screen.getByTitle('Notifications'))

    expect(await screen.findByText('Proyecto cerrado')).toBeInTheDocument()
    expect(screen.getByText('Documento subido')).toBeInTheDocument()
  })

  it('marca como leída al hacer click en una notificación no leída', async () => {
    mockedApi.list.mockResolvedValue({
      data: [
        { id: 1, content: { subject: 'Proyecto cerrado', body: 'x' }, link_url: null, is_read: false, read_at: null, created_at: '2026-07-01T00:00:00Z' },
      ],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderBell()

    fireEvent.click(screen.getByTitle('Notifications'))
    fireEvent.click(await screen.findByText('Proyecto cerrado'))

    await waitFor(() => expect(mockedApi.markRead).toHaveBeenCalledWith(1))
  })

  it('marca todas como leídas al hacer click en el botón', async () => {
    mockedApi.unreadCount.mockResolvedValue(2)
    mockedApi.list.mockResolvedValue({
      data: [
        { id: 1, content: { subject: 'A', body: 'x' }, link_url: null, is_read: false, read_at: null, created_at: '2026-07-01T00:00:00Z' },
      ],
      meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 },
    })
    renderBell()

    fireEvent.click(screen.getByTitle('Notifications'))
    fireEvent.click(await screen.findByText('Mark all as read'))

    await waitFor(() => expect(mockedApi.markAllRead).toHaveBeenCalled())
  })
})
