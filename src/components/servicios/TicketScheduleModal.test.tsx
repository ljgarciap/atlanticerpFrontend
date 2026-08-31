import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TicketScheduleModal from './TicketScheduleModal'
import { serviciosApi } from '@/api/serviciosApi'
import { useToastStore } from '@/store/toastStore'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    tickets:      { schedule: vi.fn() },
    technicians:  { internalOptions: vi.fn() },
  },
}))

vi.mock('@/store/toastStore', () => ({ useToastStore: vi.fn() }))

const mockedApi   = vi.mocked(serviciosApi, true)
const mockedToast = vi.mocked(useToastStore)

function mockToast(showSpy: (msg: string, type?: 'success' | 'error') => void = vi.fn()) {
  mockedToast.mockImplementation(((selector?: (s: { show: typeof showSpy }) => unknown) => {
    const state = { show: showSpy }
    return selector ? selector(state) : state
  }) as never)
  return showSpy
}

function renderModal(props: Partial<React.ComponentProps<typeof TicketScheduleModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TicketScheduleModal
        ticketId={1} tipo="installation" isReschedule={false}
        onClose={vi.fn()} onScheduled={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockToast()
  mockedApi.technicians.internalOptions.mockResolvedValue([
    { id: 5, first_name: 'Tecnico Servicios', last_name: 'Test' },
    { id: 7, first_name: 'Tecnico Servicios', last_name: 'Test 2' },
  ])
})

// REQ-226 — Agendar/Reagendar.
describe('TicketScheduleModal', () => {
  it('pide la lista de técnicos filtrada por el tipo del ticket (RN2)', async () => {
    renderModal({ tipo: 'warranty' })
    await waitFor(() => expect(mockedApi.technicians.internalOptions).toHaveBeenCalledWith('warranty'))
  })

  it('Guardar queda deshabilitado hasta llenar técnico, fecha y hora (RN6)', async () => {
    renderModal()

    const saveBtn = await screen.findByText('tickets.schedule.save')
    expect(saveBtn).toBeDisabled()

    await screen.findByText('Tecnico Servicios Test')
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '5' } })
    expect(saveBtn).toBeDisabled()

    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-08-10' } })
    fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: '09:00' } })

    await waitFor(() => expect(saveBtn).not.toBeDisabled())
  })

  it('combina fecha+hora en un único scheduled_at ISO y envía el técnico elegido', async () => {
    mockedApi.tickets.schedule.mockResolvedValue({} as never)
    const onScheduled = vi.fn()
    renderModal({ onScheduled })

    await screen.findByText('tickets.schedule.save')
    // El select de técnico se popula async (useQuery) — esperar a que la opción real exista
    // antes de disparar el change, o el value="5" no matchea ninguna <option> todavía.
    await screen.findByText('Tecnico Servicios Test')
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '5' } })
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-08-10' } })
    fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: '09:00' } })

    fireEvent.click(screen.getByText('tickets.schedule.save'))

    await waitFor(() => expect(mockedApi.tickets.schedule).toHaveBeenCalledWith(1, expect.objectContaining({
      internal_technician_id: 5,
    })))
    const [, payload] = mockedApi.tickets.schedule.mock.calls[0]
    expect(new Date(payload.scheduled_at).toISOString()).toBe(new Date('2026-08-10T09:00').toISOString())
    await waitFor(() => expect(onScheduled).toHaveBeenCalled())
  })

  it('muestra el mensaje específico del backend cuando el técnico no atiende ese tipo (RN2, 422)', async () => {
    mockedApi.tickets.schedule.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'El técnico seleccionado no atiende este tipo de ticket.' } },
    })
    const showSpy = mockToast()
    renderModal()

    await screen.findByText('tickets.schedule.save')
    // El select de técnico se popula async (useQuery) — esperar a que la opción real exista
    // antes de disparar el change, o el value="5" no matchea ninguna <option> todavía.
    await screen.findByText('Tecnico Servicios Test')
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '5' } })
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-08-10' } })
    fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: '09:00' } })
    fireEvent.click(screen.getByText('tickets.schedule.save'))

    await waitFor(() => expect(showSpy).toHaveBeenCalledWith('El técnico seleccionado no atiende este tipo de ticket.', 'error'))
  })

  // SCRUM-804 — motivo obligatorio al reagendar, no al agendar por primera vez.
  describe('SCRUM-804 — motivo obligatorio al reagendar', () => {
    it('no muestra el campo Motivo al agendar por primera vez (isReschedule=false)', async () => {
      renderModal({ isReschedule: false })
      await screen.findByText('tickets.schedule.save')
      expect(screen.queryByText('tickets.schedule.motivo')).not.toBeInTheDocument()
    })

    it('Guardar queda deshabilitado sin motivo al reagendar, aunque técnico/fecha/hora estén completos', async () => {
      renderModal({ isReschedule: true })

      const saveBtn = await screen.findByText('tickets.schedule.save')
      await screen.findByText('Tecnico Servicios Test')
      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '5' } })
      fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-08-10' } })
      fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: '09:00' } })

      expect(saveBtn).toBeDisabled()

      fireEvent.change(screen.getByPlaceholderText('tickets.schedule.motivoPlaceholder'), { target: { value: 'Cliente pidió mover la visita.' } })
      await waitFor(() => expect(saveBtn).not.toBeDisabled())
    })

    it('envía motivo_reagendamiento al reagendar', async () => {
      mockedApi.tickets.schedule.mockResolvedValue({} as never)
      renderModal({ isReschedule: true })

      await screen.findByText('Tecnico Servicios Test')
      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '5' } })
      fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-08-10' } })
      fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: '09:00' } })
      fireEvent.change(screen.getByPlaceholderText('tickets.schedule.motivoPlaceholder'), { target: { value: 'Cliente pidió mover la visita.' } })
      fireEvent.click(screen.getByText('tickets.schedule.save'))

      await waitFor(() => expect(mockedApi.tickets.schedule).toHaveBeenCalledWith(1, expect.objectContaining({
        motivo_reagendamiento: 'Cliente pidió mover la visita.',
      })))
    })

    it('NO envía motivo_reagendamiento al agendar por primera vez', async () => {
      mockedApi.tickets.schedule.mockResolvedValue({} as never)
      renderModal({ isReschedule: false })

      await screen.findByText('Tecnico Servicios Test')
      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '5' } })
      fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-08-10' } })
      fireEvent.change(document.querySelector('input[type="time"]')!, { target: { value: '09:00' } })
      fireEvent.click(screen.getByText('tickets.schedule.save'))

      await waitFor(() => expect(mockedApi.tickets.schedule).toHaveBeenCalled())
      const [, payload] = mockedApi.tickets.schedule.mock.calls[0]
      expect(payload.motivo_reagendamiento).toBeUndefined()
    })
  })
})
