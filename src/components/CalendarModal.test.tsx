import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CalendarModal, { toDateKey } from './CalendarModal'
import { startOfWeek, addDays } from '@/lib/dateGrid'
import type { OutlookCalendarEvent } from '@/types/calendar'
import type { ComponentProps } from 'react'

// El proyecto no depende de @types/node — declaracion minima solo para el
// test de zona horaria de abajo (SCRUM-66).
declare const process: { env: Record<string, string | undefined> }

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      const vals = Object.values(opts).filter(v => typeof v === 'string' || typeof v === 'number')
      return vals.length ? `${key}:${vals.join(',')}` : key
    },
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// SCRUM-66 (regresión de test descubierta al arreglar toDateKey): "hoy" acá NO puede
// construirse con `new Date().toISOString()` — esa conversión pasa a UTC, y toDateKey()
// (ya corregido a componentes locales) puede leer "hoy" como un día distinto en un huso
// negativo cerca de medianoche UTC (ej. Bogotá/Panamá, UTC-5). Antes ambos lados
// compartían el mismo bug UTC y "coincidían" sin querer; ahora hay que construir el
// fixture con la misma semántica local que usa el componente.
function todayStartAt(hour = 12): string {
  return `${toDateKey(new Date())}T${String(hour).padStart(2, '0')}:00:00`
}

function makeEvent(overrides: Partial<OutlookCalendarEvent> = {}): OutlookCalendarEvent {
  return {
    id: '1', title: 'Visita técnica', start_at: todayStartAt(), end_at: null,
    all_day: false, location: null, organizer: null, owner_email: 'designer@illuminations.test', owner_name: null,
    ...overrides,
  }
}

function renderModal(
  fetchEvents = vi.fn().mockResolvedValue({ data: [], source_unavailable: false }),
  extraProps: Partial<ComponentProps<typeof CalendarModal>> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <CalendarModal queryKeyPrefix="test-calendar" fetchEvents={fetchEvents} onClose={vi.fn()} {...extraProps} />
    </QueryClientProvider>,
  )
  return fetchEvents
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('toDateKey (SCRUM-66)', () => {
  it('usa componentes locales, no UTC — 23:30 en Panama sigue siendo el mismo día', () => {
    const originalTZ = process.env.TZ
    process.env.TZ = 'America/Panama'
    try {
      // 23:30 hora local del 14/07 — en UTC (Panama = UTC-5) ya son las 04:30
      // del 15/07. toISOString().slice(0,10) (versión vieja, buggy) daría "2026-07-15".
      const late = new Date(2026, 6, 14, 23, 30)
      expect(toDateKey(late)).toBe('2026-07-14')
    } finally {
      process.env.TZ = originalTZ
    }
  })

  it('mismo día, misma clave, sin importar la hora', () => {
    expect(toDateKey(new Date(2026, 6, 14, 0, 0))).toBe(toDateKey(new Date(2026, 6, 14, 23, 59)))
  })
})

describe('CalendarModal (SCRUM-66/177 — solo lectura de Outlook)', () => {
  it('muestra el título y la vista de mes por defecto', async () => {
    renderModal()
    expect(await screen.findByText('ventasDiseno:home.calendar.fullTitle')).toBeInTheDocument()
  })

  it('el mes se muestra con "de" en minúscula, no "De" (SCRUM-66)', async () => {
    const fetchEvents = renderModal()
    await waitFor(() => expect(fetchEvents).toHaveBeenCalled())

    const monthText = (await screen.findAllByText(/\d{4}/))
      .map(el => el.textContent ?? '')
      .find(t => / de \d{4}/.test(t))

    expect(monthText).toBeDefined()
    expect(monthText).not.toMatch(/ De \d{4}/)
  })

  it('muestra el conteo de eventos en el día correspondiente de la grilla', async () => {
    const fetchEvents = vi.fn().mockResolvedValue({ data: [makeEvent()], source_unavailable: false })
    renderModal(fetchEvents)

    await waitFor(() => expect(fetchEvents).toHaveBeenCalled())
    expect(await screen.findByText('Visita técnica')).toBeInTheDocument()
  })

  it('no ofrece crear ni borrar eventos — solo lectura', async () => {
    const fetchEvents = vi.fn().mockResolvedValue({ data: [makeEvent()], source_unavailable: false })
    renderModal(fetchEvents)

    await waitFor(() => expect(fetchEvents).toHaveBeenCalled())
    await screen.findByText('Visita técnica')

    expect(screen.queryByText('ventasDiseno:home.calendar.addEvent')).not.toBeInTheDocument()
    expect(screen.queryByText('common:actions.delete')).not.toBeInTheDocument()
  })

  it('muestra el aviso de fuente no disponible cuando Outlook falla', async () => {
    const fetchEvents = vi.fn().mockResolvedValue({ data: [], source_unavailable: true })
    renderModal(fetchEvents)

    expect(await screen.findByText('ventasDiseno:home.calendar.sourceUnavailable')).toBeInTheDocument()
  })

  // SCRUM-66/177 — hallazgo de Pre-QA 5ta pasada (2026-07-22): "click en un día de la miniatura
  // abre el modal centrado en ese día" solo se había verificado leyendo código, no con un test.
  // Estos 2 tests cierran ese gap.
  it('con initialDate, abre centrado en esa fecha — no en "hoy" (hallazgo Pre-QA 2026-07-22)', async () => {
    const now = new Date()
    // Primer día del mes siguiente — garantiza que difiere del mes/día "de hoy" sin importar
    // cuándo corra el test, evitando un fixture hardcodeado que se vuelva falso positivo con el tiempo.
    const initialDate = new Date(now.getFullYear(), now.getMonth() + 1, 15)
    const fetchEvents = renderModal(undefined, { initialDate })
    await waitFor(() => expect(fetchEvents).toHaveBeenCalled())

    const monthLabelRaw = initialDate.toLocaleDateString('es', { month: 'long', year: 'numeric' })
    const expectedMonthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1)
    expect(screen.getByText(expectedMonthLabel)).toBeInTheDocument()

    const expectedDayLabel = initialDate.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
    expect(screen.getByText(expectedDayLabel)).toBeInTheDocument()
  })

  it('con initialView "week", pide el rango de esa semana en vez del mes por defecto', async () => {
    const initialDate = new Date(2026, 6, 15) // miércoles, cualquier fecha fija sirve acá
    const fetchEvents = renderModal(undefined, { initialDate, initialView: 'week' })
    await waitFor(() => expect(fetchEvents).toHaveBeenCalled())

    const expectedFrom = toDateKey(startOfWeek(initialDate))
    const expectedTo = toDateKey(addDays(addDays(startOfWeek(initialDate), 6), 1))
    expect(fetchEvents).toHaveBeenCalledWith({ from: expectedFrom, to: expectedTo })
  })
})
