import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReportsCommissionSection from './ReportsCommissionSection'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import { permissionsForOrEmpty } from '@/test/identities'
import type { InternalTechnician, ReportsPeriodParams } from '@/types/servicios'

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }),
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    internalTechnicians: { list: vi.fn() },
    reportes:            { comisionTecnico: vi.fn() },
  },
}))

const mockedApi = vi.mocked(serviciosApi, true)

const TECNICO_USER_ID = 18

function technician(overrides: Partial<InternalTechnician> = {}): InternalTechnician {
  return {
    id: 1, user_id: TECNICO_USER_ID, nombre: 'Tecnico Test', telefono: null,
    email: 'tecnico@test.com', especialidad: 'general', color: '#3B82F6',
    has_bonus_plan: true, estado: 'off', visitas_hoy: 0, herramientas_asignadas: 0,
    pct_resuelto_primera_visita: null, tiempo_promedio_minutos: null,
    ...overrides,
  } as InternalTechnician
}

function setUser(role: string, id: number) {
  useAuthStore.setState({ user: { id, role, permissions: permissionsForOrEmpty(role), email: 'x@y.z', first_name: 'X', last_name: 'Y' } as never })
}

const DEFAULT_GLOBAL_PERIOD: ReportsPeriodParams = { year: 2026, month: 8 }

function renderSection(globalPeriod: ReportsPeriodParams = DEFAULT_GLOBAL_PERIOD) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ReportsCommissionSection globalPeriod={globalPeriod} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.internalTechnicians.list.mockResolvedValue([
    technician(),
    technician({ id: 2, user_id: 19, nombre: 'Tecnico Test 2', has_bonus_plan: false }),
  ])
  mockedApi.reportes.comisionTecnico.mockResolvedValue({
    capture: { year: 2026, month: 8, licencia_medica: false },
    total: 258,
    desglose: [{ criterio: 'calidad', peso_pct: 25, pct_obtenido: 92, monto_max: 100, monto_obtenido: 92 }],
  } as never)
})

// REQ-285 RN2 — la sección es exclusiva de Gerencia y del propio técnico con plan de bonificación.
// El gate ya se rompió una vez (Pre-QA 2026-08-12: el frontend resolvía "quién es Tecnico" por
// `nombre === 'Tecnico Test'`, así que renombrarlo en Técnicos Internos le ocultaba su propia
// comisión aunque el backend lo siguiera autorizando por `has_bonus_plan`) — por eso vive acá como
// test permanente, no como verificación manual.
describe('ReportsCommissionSection — gate de visibilidad (REQ-285 RN2)', () => {
  it('Gerencia ve la sección y dispara la llamada de comisión', async () => {
    setUser('management', 4)
    renderSection()

    await waitFor(() => expect(screen.getByText('reports.commission.title')).toBeInTheDocument())
    await waitFor(() => expect(mockedApi.reportes.comisionTecnico).toHaveBeenCalled())
  })

  it('el técnico con plan de bonificación ve su propia sección aunque le hayan cambiado el nombre', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([
      technician({ nombre: 'Tecnico A. Tecnico' }),
      technician({ id: 2, user_id: 19, nombre: 'Tecnico Test 2', has_bonus_plan: false }),
    ])
    setUser('tecnico', TECNICO_USER_ID)
    renderSection()

    await waitFor(() => expect(screen.getByText('reports.commission.title')).toBeInTheDocument())
  })

  it('otro técnico interno no ve la sección NI dispara la llamada de red', async () => {
    setUser('tecnico', 19)
    renderSection()

    await waitFor(() => expect(mockedApi.internalTechnicians.list).toHaveBeenCalled())
    expect(screen.queryByText('reports.commission.title')).not.toBeInTheDocument()
    expect(mockedApi.reportes.comisionTecnico).not.toHaveBeenCalled()
  })

  it('lider_servicios (Lider Servicios) no ve la sección NI dispara la llamada de red', async () => {
    setUser('lider_servicios', 17)
    renderSection()

    await waitFor(() => expect(mockedApi.internalTechnicians.list).toHaveBeenCalled())
    expect(screen.queryByText('reports.commission.title')).not.toBeInTheDocument()
    expect(mockedApi.reportes.comisionTecnico).not.toHaveBeenCalled()
  })
})

// SCRUM-911 — UAT-046 RECHAZADO: el panel quedaba anclado en su propio mes inicial y nunca
// reflejaba el filtro general de la página. El filtro general (`globalPeriod`) manda: cada cambio
// debe resincronizar el mes de la tarjeta, incluso después de haber navegado localmente con las
// flechas.
describe('ReportsCommissionSection — sincronía con el filtro general (SCRUM-911)', () => {
  it('consulta con el mes de globalPeriod recibido, no con el mes actual', async () => {
    setUser('management', 4)
    renderSection({ year: 2025, month: 3 })

    await waitFor(() => expect(mockedApi.reportes.comisionTecnico).toHaveBeenCalledWith({ year: 2025, month: 3 }))
    await waitFor(() => expect(screen.getByText('Marzo de 2025')).toBeInTheDocument())
  })

  it('un cambio de globalPeriod resincroniza el panel aunque no se haya navegado localmente', async () => {
    setUser('management', 4)
    const { rerender } = renderSection({ year: 2026, month: 8 })

    await waitFor(() => expect(mockedApi.reportes.comisionTecnico).toHaveBeenCalledWith({ year: 2026, month: 8 }))

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    rerender(
      <QueryClientProvider client={qc}>
        <ReportsCommissionSection globalPeriod={{ year: 2026, month: 5 }} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(mockedApi.reportes.comisionTecnico).toHaveBeenCalledWith({ year: 2026, month: 5 }))
    await waitFor(() => expect(screen.getByText('Mayo de 2026')).toBeInTheDocument())
  })

  it('la navegación local (flechas) no sobrevive a un cambio posterior de globalPeriod', async () => {
    setUser('management', 4)
    const { rerender } = renderSection({ year: 2026, month: 6 })
    await waitFor(() => expect(screen.getByText('Junio de 2026')).toBeInTheDocument())

    fireEvent.click(screen.getByLabelText('technicians.internal.commissionModal.previousMonth'))
    await waitFor(() => expect(screen.getByText('Mayo de 2026')).toBeInTheDocument())

    // El filtro general cambia a un mes DISTINTO del que tenía antes de la navegación local —
    // debe pisar la navegación local y resincronizar la tarjeta.
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ReportsCommissionSection globalPeriod={{ year: 2026, month: 8 }} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByText('Agosto de 2026')).toBeInTheDocument())
  })
})
