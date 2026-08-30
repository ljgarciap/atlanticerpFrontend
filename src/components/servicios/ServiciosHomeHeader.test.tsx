import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ServiciosHomeHeader from './ServiciosHomeHeader'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'
import type { InternalTechnicianTeamStats, TicketStats } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      const vals = Object.values(opts).filter(v => typeof v === 'string' || typeof v === 'number')
      return vals.length ? `${key}:${vals.join(',')}` : key
    },
  }),
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    internalTechnicians: { stats: vi.fn() },
    tickets:             { stats: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(serviciosApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Aaron', last_name: 'Araúz', email: 'servicio@illuminations.com.pa',
    role: 'lider_servicios', role_id: 1, permissions: [], modules: {}, flags: {},
    security_level: 6, language: 'es',
    ...overrides,
  } as UserInfo
}

function makeTicketStats(overrides: Partial<TicketStats> = {}): TicketStats {
  return {
    tickets_abiertos: 0, total_tickets: 0, cotizaciones_por_generar: 0,
    informes_por_generar: 0, sin_agendar: 0, sin_agendar_umbral_dias: 3,
    ...overrides,
  }
}

function makeTeamStats(overrides: Partial<InternalTechnicianTeamStats> = {}): InternalTechnicianTeamStats {
  return {
    activos_hoy: 0, total_tecnicos: 0, visitas_hoy_total: 0, promedio_primera_visita: null,
    ...overrides,
  }
}

function renderHeader() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ServiciosHomeHeader />
    </QueryClientProvider>,
  )
}

describe('ServiciosHomeHeader (REQ-206 / SCRUM-269)', () => {
  // Escenario 1 — saludo correcto: nombre de pila únicamente, sin apellido.
  it('muestra "Bienvenido, {nombre de pila}" sin apellido (RN1)', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ first_name: 'Aaron', last_name: 'Araúz' }) } as never)
    mockedApi.internalTechnicians.stats.mockResolvedValue(makeTeamStats())
    mockedApi.tickets.stats.mockResolvedValue(makeTicketStats())

    renderHeader()

    await waitFor(() => {
      expect(screen.getByText('home.greeting:Aaron')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Araúz/)).not.toBeInTheDocument()
  })

  // Escenario 2 — resumen del día: visitas del equipo + pendientes de equipo, sin importar el rol.
  // La fecha (pedida en la descripción del ticket y en el mockup, sin RN/Escenario propio, ver
  // Visual Review 2026-08-12) es dinámica -- se matchea con regex en vez de un string fijo.
  it('muestra "tienes N visitas y M pendientes hoy" con los totales de equipo (RN2/RN3)', async () => {
    mockedStore.mockReturnValue({ user: makeUser() } as never)
    mockedApi.internalTechnicians.stats.mockResolvedValue(makeTeamStats({ visitas_hoy_total: 6 }))
    mockedApi.tickets.stats.mockResolvedValue(makeTicketStats({ sin_agendar: 4 }))

    renderHeader()

    await waitFor(() => {
      expect(screen.getByText(/^home\.subtitle:.+,home\.subtitleVisitas:6,home\.subtitlePendientes:4$/)).toBeInTheDocument()
    })
  })

  // SCRUM-269 (rebote QA 2026-08-13) — "1 visitas"/"1 pendientes" no concordaban en número. El
  // fix resuelve visitas/pendientes con sus propias keys `_one`/`_other` en vez de un solo
  // `count` compartido — esto verifica que cada cantidad se resuelve con SU PROPIO `count` (1
  // visita, 4 pendientes), no que ambas compartan el mismo valor.
  it('resuelve visitas y pendientes con su propio count, cada una por separado (pluralización)', async () => {
    mockedStore.mockReturnValue({ user: makeUser() } as never)
    mockedApi.internalTechnicians.stats.mockResolvedValue(makeTeamStats({ visitas_hoy_total: 1 }))
    mockedApi.tickets.stats.mockResolvedValue(makeTicketStats({ sin_agendar: 4 }))

    renderHeader()

    await waitFor(() => {
      expect(screen.getByText(/^home\.subtitle:.+,home\.subtitleVisitas:1,home\.subtitlePendientes:4$/)).toBeInTheDocument()
    })
  })

  // Escenario 3 — sesión sin nombre resuelto: saludo genérico, sin romper la pantalla.
  it('cae a saludo genérico "Bienvenido" si no se puede determinar el nombre (RN4)', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ first_name: '' }) } as never)
    mockedApi.internalTechnicians.stats.mockResolvedValue(makeTeamStats())
    mockedApi.tickets.stats.mockResolvedValue(makeTicketStats())

    renderHeader()

    await waitFor(() => {
      expect(screen.getByText('home.greetingFallback')).toBeInTheDocument()
    })
  })

  it('cae a saludo genérico "Bienvenido" si no hay usuario en sesión (RN4, camino de ruptura)', () => {
    mockedStore.mockReturnValue({ user: null } as never)
    mockedApi.internalTechnicians.stats.mockResolvedValue(makeTeamStats())
    mockedApi.tickets.stats.mockResolvedValue(makeTicketStats())

    renderHeader()

    expect(screen.getByText('home.greetingFallback')).toBeInTheDocument()
  })

  it('no muestra el subtítulo mientras las estadísticas todavía están cargando (evita mostrar 0 engañoso)', () => {
    mockedStore.mockReturnValue({ user: makeUser() } as never)
    mockedApi.internalTechnicians.stats.mockReturnValue(new Promise(() => {}))
    mockedApi.tickets.stats.mockReturnValue(new Promise(() => {}))

    renderHeader()

    expect(screen.queryByText(/home.subtitle/)).not.toBeInTheDocument()
  })
})
