import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ArchitectDetailModal from './ArchitectDetailModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { ArchitectDetail } from '@/types/ventasDiseno'

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

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    architects: { get: vi.fn(), update: vi.fn() },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeDetail(overrides: Partial<ArchitectDetail> = {}): ArchitectDetail {
  return {
    id: 1, name: 'Arq. Fernando Solís', phone: '6000-0000', email: 'fernando@example.com',
    projects: [{ id: 10, sub_client: { id: 1, business_name: 'Sub Test' }, project: { id: 1, name: 'Torre Delta' }, stage: 'quote', amount: 5000 }],
    ...overrides,
  }
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return { onClose, ...render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ArchitectDetailModal architectId={1} onClose={onClose} />
      </QueryClientProvider>
    </MemoryRouter>,
  ) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.architects.get.mockResolvedValue(makeDetail())
})

describe('ArchitectDetailModal', () => {
  it('muestra nombre, teléfono, correo y los proyectos asociados (modo vista)', async () => {
    renderModal()
    expect(await screen.findByText('Arq. Fernando Solís')).toBeInTheDocument()
    expect(screen.getByText('6000-0000')).toBeInTheDocument()
    expect(screen.getByText('fernando@example.com')).toBeInTheDocument()
    expect(screen.getByText('Torre Delta')).toBeInTheDocument()
  })

  it('sin proyectos asociados muestra el estado vacío', async () => {
    mockedApi.architects.get.mockResolvedValue(makeDetail({ projects: [] }))
    renderModal()
    await screen.findByText('Arq. Fernando Solís')
    expect(screen.getByText('ventasDiseno:architects.detail.projectsEmpty')).toBeInTheDocument()
  })

  it('clic en Editar habilita Teléfono/Correo pero el Nombre sigue de solo lectura', async () => {
    renderModal()
    await screen.findByText('Arq. Fernando Solís')

    fireEvent.click(screen.getByText('ventasDiseno:architects.detail.edit'))

    expect(screen.getByDisplayValue('6000-0000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('fernando@example.com')).toBeInTheDocument()
    // Nombre nunca se vuelve un input, ni en modo edición.
    expect(document.querySelectorAll('input')).toHaveLength(2)
    expect(screen.getByText('Arq. Fernando Solís')).toBeInTheDocument()
  })

  it('guardar manda el name sin cambios junto con el teléfono/correo editados', async () => {
    mockedApi.architects.update.mockResolvedValue({ id: 1, name: 'Arq. Fernando Solís', phone: '6000-9999', email: 'nuevo@example.com' })
    renderModal()
    await screen.findByText('Arq. Fernando Solís')
    fireEvent.click(screen.getByText('ventasDiseno:architects.detail.edit'))

    fireEvent.change(screen.getByDisplayValue('6000-0000'), { target: { value: '6000-9999' } })
    fireEvent.change(screen.getByDisplayValue('fernando@example.com'), { target: { value: 'nuevo@example.com' } })
    fireEvent.click(screen.getByText('ventasDiseno:architects.detail.save'))

    await waitFor(() => expect(mockedApi.architects.update).toHaveBeenCalledWith(1, {
      name: 'Arq. Fernando Solís', phone: '6000-9999', email: 'nuevo@example.com',
    }))
  })

  it('si falla el guardado sin mensaje de campo, muestra el error genérico y no sale de modo edición', async () => {
    mockedApi.architects.update.mockRejectedValue(new Error('fail'))
    renderModal()
    await screen.findByText('Arq. Fernando Solís')
    fireEvent.click(screen.getByText('ventasDiseno:architects.detail.edit'))
    fireEvent.click(screen.getByText('ventasDiseno:architects.detail.save'))

    expect(await screen.findByText('ventasDiseno:architects.detail.saveError')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:architects.detail.save')).toBeInTheDocument()
  })

  it('Pre-QA (SCRUM-907) — borrar Teléfono Y Correo muestra el mensaje específico del backend, no el genérico', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 422'), {
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          message: 'The given data was invalid.',
          errors: { phone: ['The phone field is required when email is not present.'] },
        },
      },
    })
    mockedApi.architects.update.mockRejectedValue(axiosError)
    renderModal()
    await screen.findByText('Arq. Fernando Solís')
    fireEvent.click(screen.getByText('ventasDiseno:architects.detail.edit'))

    fireEvent.change(screen.getByDisplayValue('6000-0000'), { target: { value: '' } })
    fireEvent.change(screen.getByDisplayValue('fernando@example.com'), { target: { value: '' } })
    fireEvent.click(screen.getByText('ventasDiseno:architects.detail.save'))

    expect(await screen.findByText('The phone field is required when email is not present.')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:architects.detail.saveError')).not.toBeInTheDocument()
  })

  it('Cancelar vuelve a modo vista sin guardar', async () => {
    renderModal()
    await screen.findByText('Arq. Fernando Solís')
    fireEvent.click(screen.getByText('ventasDiseno:architects.detail.edit'))
    fireEvent.change(screen.getByDisplayValue('6000-0000'), { target: { value: '6000-9999' } })

    fireEvent.click(screen.getByText('ventasDiseno:architects.detail.cancel'))

    expect(screen.getByText('6000-0000')).toBeInTheDocument()
    expect(mockedApi.architects.update).not.toHaveBeenCalled()
  })
})
