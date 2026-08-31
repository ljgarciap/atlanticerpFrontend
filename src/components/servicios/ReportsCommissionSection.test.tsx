import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReportsCommissionSection from './ReportsCommissionSection'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import type { InternalTechnician } from '@/types/servicios'

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'es' } }),
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    internalTechnicians: { list: vi.fn() },
    reportes:            { comisionCarlosVergara: vi.fn() },
  },
}))

const mockedApi = vi.mocked(serviciosApi, true)

const CARLOS_USER_ID = 18

function technician(overrides: Partial<InternalTechnician> = {}): InternalTechnician {
  return {
    id: 1, user_id: CARLOS_USER_ID, nombre: 'Tecnico Servicios Test', telefono: null,
    email: 'tecnicoservicios@test.com', especialidad: 'general', color: '#3B82F6',
    has_bonus_plan: true, estado: 'off', visitas_hoy: 0, herramientas_asignadas: 0,
    pct_resuelto_primera_visita: null, tiempo_promedio_minutos: null,
    ...overrides,
  } as InternalTechnician
}

function setUser(role: string, id: number) {
  useAuthStore.setState({ user: { id, role, email: 'x@y.z', first_name: 'X', last_name: 'Y' } as never })
}

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ReportsCommissionSection />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.internalTechnicians.list.mockResolvedValue([
    technician(),
    technician({ id: 2, user_id: 19, nombre: 'Tecnico Servicios Test 2', has_bonus_plan: false }),
  ])
  mockedApi.reportes.comisionCarlosVergara.mockResolvedValue({
    capture: { year: 2026, month: 8, licencia_medica: false },
    total: 258,
    desglose: [{ criterio: 'calidad', peso_pct: 25, pct_obtenido: 92, monto_max: 100, monto_obtenido: 92 }],
  } as never)
})

// REQ-285 RN2 — la sección es exclusiva de Gerencia y del propio técnico con plan de bonificación.
// El gate ya se rompió una vez (Pre-QA 2026-08-12: el frontend resolvía "quién es Carlos" por
// `nombre === 'Tecnico Servicios Test'`, así que renombrarlo en Técnicos Internos le ocultaba su propia
// comisión aunque el backend lo siguiera autorizando por `has_bonus_plan`) — por eso vive acá como
// test permanente, no como verificación manual.
describe('ReportsCommissionSection — gate de visibilidad (REQ-285 RN2)', () => {
  it('Gerencia ve la sección y dispara la llamada de comisión', async () => {
    setUser('management', 4)
    renderSection()

    await waitFor(() => expect(screen.getByText('reports.commission.title')).toBeInTheDocument())
    await waitFor(() => expect(mockedApi.reportes.comisionCarlosVergara).toHaveBeenCalled())
  })

  it('el técnico con plan de bonificación ve su propia sección aunque le hayan cambiado el nombre', async () => {
    mockedApi.internalTechnicians.list.mockResolvedValue([
      technician({ nombre: 'Carlos A. Vergara' }),
      technician({ id: 2, user_id: 19, nombre: 'Tecnico Servicios Test 2', has_bonus_plan: false }),
    ])
    setUser('tecnico_servicios', CARLOS_USER_ID)
    renderSection()

    await waitFor(() => expect(screen.getByText('reports.commission.title')).toBeInTheDocument())
  })

  it('otro técnico interno no ve la sección NI dispara la llamada de red', async () => {
    setUser('tecnico_servicios', 19)
    renderSection()

    await waitFor(() => expect(mockedApi.internalTechnicians.list).toHaveBeenCalled())
    expect(screen.queryByText('reports.commission.title')).not.toBeInTheDocument()
    expect(mockedApi.reportes.comisionCarlosVergara).not.toHaveBeenCalled()
  })

  it('lider_servicios (Aaron) no ve la sección NI dispara la llamada de red', async () => {
    setUser('lider_servicios', 17)
    renderSection()

    await waitFor(() => expect(mockedApi.internalTechnicians.list).toHaveBeenCalled())
    expect(screen.queryByText('reports.commission.title')).not.toBeInTheDocument()
    expect(mockedApi.reportes.comisionCarlosVergara).not.toHaveBeenCalled()
  })
})
