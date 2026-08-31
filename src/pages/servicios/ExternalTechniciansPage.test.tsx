import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, AxiosHeaders } from 'axios'
import ExternalTechniciansPage from './ExternalTechniciansPage'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import type { ExternalTechnician, ExternalTechnicianDetail, ExternalTechnicianListResponse } from '@/types/servicios'
import type { UserInfo } from '@/types/auth'

const LABELS: Record<string, string> = {
  'technicians.external.detail.assignedProjectsCount': '{{count}} proyecto(s) asignado(s)',
  'technicians.external.detail.deactivateWarning':
    'Este técnico tiene {{count}} proyecto(s) activo(s) — ¿de todas formas quieres inactivarlo?',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let out = LABELS[key] ?? key
      if (options) {
        for (const [k, v] of Object.entries(options)) out = out.replace(`{{${k}}}`, String(v))
      }
      return out
    },
    i18n: { changeLanguage: () => Promise.resolve(), language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    externalTechnicians: {
      list: vi.fn(), get: vi.fn(), create: vi.fn(), updateTarifa: vi.fn(), updateEstado: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(serviciosApi, true)

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Lider Servicios', last_name: 'Test', email: 'liderservicios@test.com',
    role: 'lider_servicios', permissions: ['servicios.read'], modules: {},
    ...overrides,
  }
}

function makeTechnician(overrides: Partial<ExternalTechnician> = {}): ExternalTechnician {
  return {
    id: 1, nombre: 'Pedro Gómez', empresa: 'Gómez Instalaciones', especialidad: 'Cableado',
    telefono: '6000-0000', tarifa_dia: 28, tarifa_visible: true, estado: 'active', proyectos_activos: 0,
    ...overrides,
  }
}

function makeListResponse(data: ExternalTechnician[]): ExternalTechnicianListResponse {
  return {
    data,
    meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length },
    counts: { active: data.filter(d => d.estado === 'active').length, inactive: data.filter(d => d.estado === 'inactive').length, total: data.length },
  }
}

function makeDetail(overrides: Partial<ExternalTechnicianDetail> = {}): ExternalTechnicianDetail {
  return {
    ...makeTechnician(),
    email: 'pedro@gomez.com',
    rate_history: [{ tarifa_dia: 28, changed_by: 'Lider Servicios Test', created_at: '2026-08-09T10:00:00Z' }],
    puede_ver_costos: true,
    proyectos_asignados: [],
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ExternalTechniciansPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: makeUser() })
})

describe('ExternalTechniciansPage — REQ-263 listado', () => {
  it('renderiza nombre, empresa, tarifa y estado de cada técnico', async () => {
    mockedApi.externalTechnicians.list.mockResolvedValue(makeListResponse([makeTechnician()]))
    renderPage()

    expect(await screen.findByText('Pedro Gómez')).toBeInTheDocument()
    expect(screen.getByText('Gómez Instalaciones')).toBeInTheDocument()
    expect(screen.getByText('$28.00')).toBeInTheDocument()
  })

  it('muestra "Sin tarifa asignada" en la tabla cuando tarifa_visible=false', async () => {
    mockedApi.externalTechnicians.list.mockResolvedValue(
      makeListResponse([makeTechnician({ tarifa_visible: false, tarifa_dia: null })]),
    )
    renderPage()
    expect(await screen.findByText('—')).toBeInTheDocument()
  })

  it('el buscador dispara la API con el término de búsqueda', async () => {
    mockedApi.externalTechnicians.list.mockResolvedValue(makeListResponse([makeTechnician()]))
    renderPage()
    await screen.findByText('Pedro Gómez')

    fireEvent.change(screen.getByPlaceholderText('technicians.external.searchPlaceholder'), { target: { value: 'roberto' } })

    await waitFor(() => {
      expect(mockedApi.externalTechnicians.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'roberto' }),
      )
    })
  })

  it('el chip "Activos" filtra por estado', async () => {
    mockedApi.externalTechnicians.list.mockResolvedValue(makeListResponse([makeTechnician()]))
    renderPage()
    await screen.findByText('Pedro Gómez')

    fireEvent.click(screen.getByText(/technicians.external.chips.active/))

    await waitFor(() => {
      expect(mockedApi.externalTechnicians.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ estado: 'active' }),
      )
    })
  })
})

describe('ExternalTechniciansPage — RN5 permisos de solo lectura', () => {
  it('técnico interno no ve el botón de agregar', async () => {
    useAuthStore.setState({ user: makeUser({ role: 'tecnico_servicios' }) })
    mockedApi.externalTechnicians.list.mockResolvedValue(makeListResponse([]))
    renderPage()

    await waitFor(() => expect(mockedApi.externalTechnicians.list).toHaveBeenCalled())
    expect(screen.queryByText('technicians.external.addButton')).not.toBeInTheDocument()
  })

  it('Aaron (lider_servicios) sí ve el botón de agregar', async () => {
    mockedApi.externalTechnicians.list.mockResolvedValue(makeListResponse([]))
    renderPage()

    expect(await screen.findByText('technicians.external.addButton')).toBeInTheDocument()
  })
})

describe('ExternalTechniciansPage — REQ-264 alta', () => {
  it('registra un técnico y abre su ficha', async () => {
    mockedApi.externalTechnicians.list.mockResolvedValue(makeListResponse([]))
    const created = makeTechnician({ id: 9, nombre: 'Roberto Alvarado' })
    mockedApi.externalTechnicians.create.mockResolvedValue(created)
    mockedApi.externalTechnicians.get.mockResolvedValue(makeDetail({ id: 9, nombre: 'Roberto Alvarado' }))
    renderPage()

    fireEvent.click(await screen.findByText('technicians.external.addButton'))

    // Escopeado al modal: el buscador de la página de fondo también tiene role="textbox".
    const modal = within(await screen.findByTestId('external-technician-create-modal'))

    // Los inputs de alta no tienen label asociado por `htmlFor`; se llenan por orden de aparición.
    const [nombreInput, empresaInput] = modal.getAllByRole('textbox')
    fireEvent.change(nombreInput, { target: { value: 'Roberto Alvarado' } })
    fireEvent.change(empresaInput, { target: { value: 'RA Instalaciones' } })
    fireEvent.change(modal.getByRole('spinbutton'), { target: { value: '30' } })

    fireEvent.click(modal.getByText('technicians.external.createModal.save'))

    await waitFor(() => {
      expect(mockedApi.externalTechnicians.create).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Roberto Alvarado', empresa: 'RA Instalaciones', tarifa_dia: 30 }),
      )
    })
    await screen.findByText('technicians.external.detail.tarifaSection')
  })
})

describe('ExternalTechniciansPage — REQ-265/266/267 ficha', () => {
  it('abre la ficha con historial de tarifa y estado vacío de proyectos asignados', async () => {
    mockedApi.externalTechnicians.list.mockResolvedValue(makeListResponse([makeTechnician()]))
    mockedApi.externalTechnicians.get.mockResolvedValue(makeDetail())
    renderPage()

    fireEvent.click(await screen.findByLabelText('technicians.external.table.columns.detail'))

    // Escopeado al modal: la tabla de fondo sigue en el DOM y también muestra "$28.00".
    const modal = within(await screen.findByTestId('external-technician-detail-modal'))
    expect(await modal.findByText('$28.00')).toBeInTheDocument()
    expect(modal.getByText('technicians.external.detail.noAssignedProjects')).toBeInTheDocument()
  })

  // SCRUM-337 (Pre-QA 2026-08-19) — el backend omite la key rate_history (no []) cuando
  // puede_ver_costos es false; el modal leía technician.rate_history.length sin guardar contra
  // undefined y crasheaba la pantalla completa para cualquier técnico interno. Fixture sin
  // rate_history reproduce exactamente el payload real que rompía esto.
  it('no crashea cuando el backend omite rate_history (sin puede_ver_costos)', async () => {
    const { rate_history: _omitted, ...detailSinCostos } = makeDetail({ puede_ver_costos: false, tarifa_dia: null })
    mockedApi.externalTechnicians.list.mockResolvedValue(makeListResponse([makeTechnician()]))
    mockedApi.externalTechnicians.get.mockResolvedValue(detailSinCostos as ExternalTechnicianDetail)
    renderPage()

    fireEvent.click(await screen.findByLabelText('technicians.external.table.columns.detail'))

    const modal = within(await screen.findByTestId('external-technician-detail-modal'))
    expect(await modal.findByText('Pedro Gómez')).toBeInTheDocument()
  })

  it('REQ-265 RN2 — inactivar con proyectos activos muestra advertencia antes de aplicar', async () => {
    mockedApi.externalTechnicians.list.mockResolvedValue(makeListResponse([makeTechnician()]))
    mockedApi.externalTechnicians.get.mockResolvedValue(makeDetail())
    const conflict = new AxiosError('Conflict', '409', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { message: 'x', requires_confirmation: true, active_projects_count: 2 },
    })
    mockedApi.externalTechnicians.updateEstado.mockRejectedValueOnce(conflict)
    renderPage()

    fireEvent.click(await screen.findByLabelText('technicians.external.table.columns.detail'))
    const modal = within(await screen.findByTestId('external-technician-detail-modal'))
    await modal.findByText('$28.00')

    fireEvent.click(modal.getByText('technicians.external.detail.deactivate'))

    expect(await modal.findByText(/2 proyecto\(s\) activo\(s\)/)).toBeInTheDocument()

    mockedApi.externalTechnicians.updateEstado.mockResolvedValueOnce(makeTechnician({ estado: 'inactive' }))
    fireEvent.click(modal.getByText('technicians.external.detail.deactivateConfirm'))

    await waitFor(() => {
      expect(mockedApi.externalTechnicians.updateEstado).toHaveBeenLastCalledWith(1, 'inactive', true)
    })
  })

  it('REQ-266 RN3 — ocultar tarifa no exige historial, solo cambia la visibilidad', async () => {
    mockedApi.externalTechnicians.list.mockResolvedValue(makeListResponse([makeTechnician()]))
    mockedApi.externalTechnicians.get.mockResolvedValue(makeDetail())
    mockedApi.externalTechnicians.updateTarifa.mockResolvedValue(makeTechnician({ tarifa_visible: false, tarifa_dia: null }))
    renderPage()

    fireEvent.click(await screen.findByLabelText('technicians.external.table.columns.detail'))
    const modal = within(await screen.findByTestId('external-technician-detail-modal'))
    await modal.findByText('$28.00')

    fireEvent.click(modal.getByRole('switch'))

    await waitFor(() => {
      expect(mockedApi.externalTechnicians.updateTarifa).toHaveBeenCalledWith(1, { tarifa_visible: false })
    })
  })
})
