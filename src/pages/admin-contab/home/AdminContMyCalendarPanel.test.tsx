import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminContMyCalendarPanel from './AdminContMyCalendarPanel'
import { adminContabApi } from '@/api/adminContabApi'
import { toDateKey } from '@/lib/dateGrid'

// Batch Home (SCRUM-503→512), Grupo 2 (SCRUM-509, REQ-432) — "Mi calendario". Cubre: render del
// panel con eventos del día, cambio de pill (Día/Semana/Mes) disparando un query nuevo, y apertura
// del calendario completo ("Ver calendario completo").

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    home: { calendar: { list: vi.fn() } },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <AdminContMyCalendarPanel />
    </QueryClientProvider>,
  )
  return qc
}

describe('AdminContMyCalendarPanel', () => {
  it('renderiza el panel y lista los eventos del día en la vista Día', async () => {
    // start_at con `toDateKey` (componentes locales), no `toISOString()` — esa conversión a UTC
    // antes de recortar la fecha es el mismo bug de huso horario ya documentado en
    // `dateGrid.ts`/CalendarModal (SCRUM-66): de noche en Panamá el evento cae en "mañana".
    const todayKey = toDateKey(new Date())
    mockedApi.home.calendar.list.mockResolvedValue({
      data: [{
        id: '1', title: 'Reunión con proveedor', start_at: `${todayKey}T10:00:00`, end_at: null,
        all_day: false, location: null, organizer: null, owner_email: 'a@b.com', owner_name: null,
      }],
      source_unavailable: false,
    })
    renderPanel()

    expect(screen.getByText('adminContab:home.calendar.title')).toBeInTheDocument()
    expect(await screen.findByText('Reunión con proveedor')).toBeInTheDocument()
  })

  it('cambiar el pill a Semana dispara un nuevo query de calendario con el rango de semana', async () => {
    mockedApi.home.calendar.list.mockResolvedValue({ data: [], source_unavailable: false })
    renderPanel()

    await waitFor(() => expect(mockedApi.home.calendar.list).toHaveBeenCalled())
    const callsBeforeClick = mockedApi.home.calendar.list.mock.calls.length

    const weekButton = screen.getByText('ventasDiseno:home.calendar.view.week')
    fireEvent.click(weekButton)

    await waitFor(() => expect(mockedApi.home.calendar.list.mock.calls.length).toBeGreaterThan(callsBeforeClick))
    const calls = mockedApi.home.calendar.list.mock.calls
    const lastCallArgs = calls[calls.length - 1]?.[0]
    expect(lastCallArgs?.from).not.toBe(lastCallArgs?.to) // rango de semana, no un solo día
  })

  it('abre el calendario completo al hacer click en "Ver calendario completo"', async () => {
    mockedApi.home.calendar.list.mockResolvedValue({ data: [], source_unavailable: false })
    renderPanel()
    await waitFor(() => expect(mockedApi.home.calendar.list).toHaveBeenCalled())

    const viewFullButton = await screen.findByText('adminContab:home.calendar.viewFull')
    fireEvent.click(viewFullButton)

    // CalendarModal (el overlay fijo `fixed inset-0`) monta al hacer click — no existía antes.
    await waitFor(() => expect(document.querySelector('.fixed.inset-0')).not.toBeNull())
  })
})
