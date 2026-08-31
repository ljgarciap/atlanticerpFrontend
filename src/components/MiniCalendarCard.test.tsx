import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MiniCalendarCard from './MiniCalendarCard'
import type { OutlookCalendarEvent } from '@/types/calendar'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

function makeEvent(startAt: string, overrides: Partial<OutlookCalendarEvent> = {}): OutlookCalendarEvent {
  return {
    id: '1', title: 'Reunión', start_at: startAt, end_at: null,
    all_day: false, location: null, organizer: null, owner_email: 'a@atlantic.com.pa', owner_name: null,
    ...overrides,
  }
}

// SCRUM-66/177 — hallazgo de Luis en validación (2026-07-21): el mockup no muestra una lista para
// Semana/Mes, muestra una miniatura real (tira de 7 días / grilla de mes con puntos).
describe('MiniCalendarCard', () => {
  it('vista Día — lista con hora y título', () => {
    const today = new Date(2026, 6, 21) // martes 21 de julio
    render(<MiniCalendarCard view="day" today={today} events={[makeEvent('2026-07-21T14:30:00')]} />)
    expect(screen.getByText('Reunión')).toBeInTheDocument()
  })

  // SCRUM-368 — Visual Review CRÍTICO (2026-07-28): scope "team" combinaba eventos de varias
  // personas sin indicar de quién era cada uno. Regresión permanente, no descartable.
  it('vista Día con showOwner — muestra el nombre (o email) del dueño del evento', () => {
    const today = new Date(2026, 6, 21)
    render(
      <MiniCalendarCard
        view="day" today={today} showOwner
        events={[makeEvent('2026-07-21T14:30:00', { owner_name: 'Vendedor Disenador Test 10' })]}
      />,
    )
    expect(screen.getByText(/Vendedor Disenador Test 10/)).toBeInTheDocument()
  })

  it('vista Día con showOwner y sin owner_name resuelto — cae al email', () => {
    const today = new Date(2026, 6, 21)
    render(
      <MiniCalendarCard
        view="day" today={today} showOwner
        events={[makeEvent('2026-07-21T14:30:00', { owner_email: 'vendedordisenador10@test.com', owner_name: null })]}
      />,
    )
    expect(screen.getByText(/vendedordisenador10@test\.com/)).toBeInTheDocument()
  })

  it('vista Día sin showOwner (scope own) — no muestra el owner', () => {
    const today = new Date(2026, 6, 21)
    render(
      <MiniCalendarCard
        view="day" today={today}
        events={[makeEvent('2026-07-21T14:30:00', { owner_name: 'Vendedor Disenador Test 10' })]}
      />,
    )
    expect(screen.queryByText(/Vendedor Disenador Test 10/)).not.toBeInTheDocument()
  })

  it('vista Día vacía muestra el mensaje de sin eventos, no una grilla', () => {
    const today = new Date(2026, 6, 21)
    render(<MiniCalendarCard view="day" today={today} events={[]} />)
    expect(screen.getByText('ventasDiseno:home.calendar.noEvents')).toBeInTheDocument()
  })

  it('vista Semana — 7 celdas, sin lista de eventos', () => {
    const today = new Date(2026, 6, 21) // martes
    const { container } = render(
      <MiniCalendarCard view="week" today={today} events={[makeEvent('2026-07-23T10:00:00')]} />,
    )
    // 7 celdas de día (una por cada día de la semana), clickeables
    const cells = container.querySelectorAll('button')
    expect(cells).toHaveLength(7)
    // No debe renderizar el título del evento como texto de lista (eso es la vista Día)
    expect(screen.queryByText('Reunión')).not.toBeInTheDocument()
  })

  it('vista Semana marca con punto solo el día que tiene evento', () => {
    const today = new Date(2026, 6, 21) // martes 21
    const { container } = render(
      <MiniCalendarCard view="week" today={today} events={[makeEvent('2026-07-23T10:00:00')]} />, // jueves 23
    )
    const dots = container.querySelectorAll('.rounded-full.bg-\\[\\#5BA5A0\\]')
    expect(dots).toHaveLength(1)
  })

  it('vista Mes — grilla de 42 celdas con encabezado de días', () => {
    const today = new Date(2026, 6, 21)
    const { container } = render(
      <MiniCalendarCard view="month" today={today} events={[makeEvent('2026-07-05T10:00:00')]} />,
    )
    expect(container.querySelectorAll('.aspect-square')).toHaveLength(42)
    expect(screen.queryByText('Reunión')).not.toBeInTheDocument()
  })

  it('vista Mes marca con punto el día 5 cuando hay un evento ese día', () => {
    const today = new Date(2026, 6, 21)
    const { container } = render(
      <MiniCalendarCard view="month" today={today} events={[makeEvent('2026-07-05T10:00:00')]} />,
    )
    const dayCell = Array.from(container.querySelectorAll('.aspect-square')).find(el => el.textContent?.startsWith('5'))
    expect(dayCell?.querySelector('.rounded-full')).toBeInTheDocument()
  })

  // SCRUM-66/177 — hallazgo de Luis (2026-07-21): un click en un día de la miniatura debe poder
  // abrir el calendario completo en esa fecha (via onSelectDay, que el padre usa para eso).
  it('vista Mes — click en un día llama a onSelectDay con esa fecha', () => {
    const today = new Date(2026, 6, 21)
    const onSelectDay = vi.fn()
    const { container } = render(
      <MiniCalendarCard view="month" today={today} events={[]} onSelectDay={onSelectDay} />,
    )
    const dayCell = Array.from(container.querySelectorAll('.aspect-square')).find(el => el.textContent?.startsWith('5'))
    fireEvent.click(dayCell as Element)
    expect(onSelectDay).toHaveBeenCalledTimes(1)
    expect(onSelectDay.mock.calls[0][0].getDate()).toBe(5)
  })

  it('vista Semana — click en un día llama a onSelectDay con esa fecha', () => {
    const today = new Date(2026, 6, 21) // martes
    const onSelectDay = vi.fn()
    const { container } = render(
      <MiniCalendarCard view="week" today={today} events={[]} onSelectDay={onSelectDay} />,
    )
    const buttons = container.querySelectorAll('button')
    fireEvent.click(buttons[0])
    expect(onSelectDay).toHaveBeenCalledTimes(1)
  })
})
