import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InicioHeader from './InicioHeader'
import { adminContabApi } from '@/api/adminContabApi'
import { useAuthStore } from '@/store/authStore'

// Batch Home (SCRUM-503→512), Grupo 5 (SCRUM-503, REQ-426) — encabezado. Cubre RN1 (nombre
// completo), RN3/RN4 (conteos reusados de Mi calendario/Pendientes, texto plural exacto de
// Escenario 2 del ticket: "1 reunión" / "8 pendientes") y RN5 (saludo genérico sin usuario).

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        // Resuelve las claves reales usadas por el componente para poder verificar el texto
        // final compuesto (RN3/RN4), no solo que se llamó a t().
        const dict: Record<string, string> = {
          'adminContab:home.header.saludo':          `Bienvenido, ${opts?.nombre}`,
          'adminContab:home.header.saludoGenerico':  'Bienvenido',
          'adminContab:home.header.subtitulo':       `${opts?.fecha} · tienes ${opts?.reunionesTexto} y ${opts?.pendientesTexto} hoy`,
          'adminContab:home.header.reunionesCount':  (opts?.count as number) === 1 ? `${opts?.count} reunión` : `${opts?.count} reuniones`,
          'adminContab:home.header.pendientesCount': (opts?.count as number) === 1 ? `${opts?.count} pendiente` : `${opts?.count} pendientes`,
        }
        return dict[key] ?? key
      },
    }),
  }
})

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    home: {
      calendar: { list: vi.fn() },
      pendientes: vi.fn(),
    },
  },
}))

vi.mock('@/store/authStore')

const mockedApi = vi.mocked(adminContabApi, true)
const mockedAuth = vi.mocked(useAuthStore, true)

function renderHeader() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <InicioHeader />
    </QueryClientProvider>,
  )
}

describe('InicioHeader', () => {
  it('muestra el saludo con nombre completo y el resumen del día (RN1/RN3/RN4)', async () => {
    mockedAuth.mockReturnValue({ user: { first_name: 'Felix', last_name: 'López' } } as ReturnType<typeof useAuthStore>)
    mockedApi.home.calendar.list.mockResolvedValue({ data: [{ id: '1' }], source_unavailable: false } as never)
    mockedApi.home.pendientes.mockResolvedValue({ count: 8, items: [] })

    renderHeader()

    expect(await screen.findByText('Bienvenido, Felix López')).toBeInTheDocument()
    expect(await screen.findByText(/1 reunión y 8 pendientes hoy/)).toBeInTheDocument()
  })

  it('muestra saludo genérico cuando no hay usuario resuelto (RN5)', async () => {
    mockedAuth.mockReturnValue({ user: null } as ReturnType<typeof useAuthStore>)
    mockedApi.home.calendar.list.mockResolvedValue({ data: [], source_unavailable: false } as never)
    mockedApi.home.pendientes.mockResolvedValue({ count: 0, items: [] })

    renderHeader()

    expect(await screen.findByText('Bienvenido')).toBeInTheDocument()
  })
})
