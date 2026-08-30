import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TicketCreateModal from './TicketCreateModal'
import { serviciosApi } from '@/api/serviciosApi'
import { useToastStore } from '@/store/toastStore'
import type { TicketDetail } from '@/types/servicios'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    tickets: { create: vi.fn(), uploadAttachment: vi.fn() },
    lookup: {
      masterClients: vi.fn(),
      subClients:    vi.fn(),
      projects:      vi.fn(),
      products:      vi.fn(),
    },
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

function renderModal(props: Partial<React.ComponentProps<typeof TicketCreateModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TicketCreateModal onClose={vi.fn()} onCreated={vi.fn()} {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockToast()
  mockedApi.lookup.masterClients.mockResolvedValue([{ id: 1, name: 'Inmobiliaria Pacífico' }])
  mockedApi.lookup.subClients.mockResolvedValue([{ id: 10, business_name: 'Pacífico Norte SA' }])
  mockedApi.lookup.projects.mockResolvedValue([{ id: 100, name: 'Torre Pacífico' }])
  mockedApi.lookup.products.mockResolvedValue([{ id: 500, reference: 'LUM-COL-014', name: 'Colgante LED', description: 'Colgante LED', brand: 'Atlantic', price_full: 89.9 }])
})

// REQ-246 RN6 — Cliente Master/Subcliente/Proyecto obligatorios, RN3 — descripción obligatoria.
describe('TicketCreateModal — validación (REQ-245/246)', () => {
  it('Crear ticket queda deshabilitado hasta completar descripción y proyecto', async () => {
    renderModal()

    const submitBtn = await screen.findByText('tickets.create.submit')
    expect(submitBtn).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('tickets.create.descripcionPlaceholder'), {
      target: { value: 'Reclamo de producto' },
    })
    expect(submitBtn).toBeDisabled() // todavía falta el proyecto (Cliente Master → Subcliente → Proyecto)
  })
})

// REQ-246 — búsqueda en cascada Cliente Master → Subcliente → Proyecto.
describe('TicketCreateModal — selección de cliente en cascada', () => {
  it('elegir Master habilita el buscador de Subcliente, y elegir Subcliente carga los proyectos', async () => {
    renderModal()

    fireEvent.click(await screen.findByLabelText('tickets.create.clienteMaster'))
    fireEvent.click(await screen.findByText('Inmobiliaria Pacífico'))

    expect(mockedApi.lookup.subClients).not.toHaveBeenCalled() // recién se busca al abrir el picker
    fireEvent.click(await screen.findByLabelText('tickets.detail.fields.subcliente'))
    await waitFor(() => expect(mockedApi.lookup.subClients).toHaveBeenCalledWith(1, ''))

    fireEvent.click(await screen.findByText('Pacífico Norte SA'))
    await waitFor(() => expect(mockedApi.lookup.projects).toHaveBeenCalledWith(10))

    const projectSelect = await screen.findByDisplayValue('tickets.create.proyectoPlaceholder')
    fireEvent.change(projectSelect, { target: { value: '100' } })
  })
})

// REQ-245/246/247 — creación completa.
describe('TicketCreateModal — crear ticket', () => {
  async function fillRequiredFields() {
    fireEvent.change(screen.getByPlaceholderText('tickets.create.descripcionPlaceholder'), {
      target: { value: 'Reclamo de producto' },
    })
    fireEvent.click(screen.getByLabelText('tickets.create.clienteMaster'))
    fireEvent.click(await screen.findByText('Inmobiliaria Pacífico'))
    fireEvent.click(await screen.findByLabelText('tickets.detail.fields.subcliente'))
    fireEvent.click(await screen.findByText('Pacífico Norte SA'))
    const projectSelect = await screen.findByDisplayValue('tickets.create.proyectoPlaceholder')
    fireEvent.change(projectSelect, { target: { value: '100' } })
  }

  it('envía el payload completo: proyecto, requerimientos marcados y producto agregado', async () => {
    mockedApi.tickets.create.mockResolvedValue({ id: 42 } as TicketDetail)
    const onCreated = vi.fn()
    renderModal({ onCreated })

    await fillRequiredFields()

    // REQ-247 RN1 — marcar un requerimiento del catálogo fijo.
    fireEvent.click(screen.getByTestId('requirement-chip-casco'))

    // REQ-247 RN3 — buscar y agregar un producto.
    fireEvent.click(screen.getByText('tickets.create.buscarProducto'))
    fireEvent.click(await screen.findByText('LUM-COL-014 — Colgante LED'))

    const submitBtn = await screen.findByText('tickets.create.submit')
    await waitFor(() => expect(submitBtn).not.toBeDisabled())
    fireEvent.click(submitBtn)

    await waitFor(() => expect(mockedApi.tickets.create).toHaveBeenCalledWith(expect.objectContaining({
      descripcion: 'Reclamo de producto',
      sales_project_id: 100,
      requerimientos_especiales: { catalog: ['casco'], otros: [] },
      productos: [{ catalog_product_id: 500, cantidad_reclamo: 1 }],
    })))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(42))
  })

  it('RN4 — un producto ya agregado no vuelve a aparecer en el buscador', async () => {
    renderModal()
    await fillRequiredFields()

    fireEvent.click(screen.getByText('tickets.create.buscarProducto'))
    fireEvent.click(await screen.findByText('LUM-COL-014 — Colgante LED'))

    fireEvent.click(screen.getByText('tickets.create.buscarProducto'))
    // SCRUM-781 (punto 4.2) — fillRequiredFields() ya deja un proyecto elegido (sales_project_id
    // 100), así que el buscador debe pasarlo para filtrar por productos entregados a ese proyecto.
    await waitFor(() => expect(mockedApi.lookup.products).toHaveBeenLastCalledWith('', [500], 100))
  })

  it('muestra el error del backend cuando la creación falla', async () => {
    mockedApi.tickets.create.mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { message: 'Selecciona el Cliente Master y el Subcliente.' } },
    })
    const showSpy = mockToast()
    renderModal()

    await fillRequiredFields()
    fireEvent.click(await screen.findByText('tickets.create.submit'))

    await waitFor(() => expect(showSpy).toHaveBeenCalledWith('Selecciona el Cliente Master y el Subcliente.', 'error'))
  })
})

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

// REQ-248 — Observaciones y Adjuntos de "Nuevo ticket".
describe('TicketCreateModal — observaciones y adjuntos (REQ-248)', () => {
  async function fillRequiredFields() {
    fireEvent.change(screen.getByPlaceholderText('tickets.create.descripcionPlaceholder'), {
      target: { value: 'Reclamo de producto' },
    })
    fireEvent.click(screen.getByLabelText('tickets.create.clienteMaster'))
    fireEvent.click(await screen.findByText('Inmobiliaria Pacífico'))
    fireEvent.click(await screen.findByLabelText('tickets.detail.fields.subcliente'))
    fireEvent.click(await screen.findByText('Pacífico Norte SA'))
    const projectSelect = await screen.findByDisplayValue('tickets.create.proyectoPlaceholder')
    fireEvent.change(projectSelect, { target: { value: '100' } })
  }

  it('Escenario 1 — 2 fotos adjuntadas al crear se suben con el id real del ticket', async () => {
    mockedApi.tickets.create.mockResolvedValue({ id: 42 } as TicketDetail)
    mockedApi.tickets.uploadAttachment.mockResolvedValue({
      id: 1, nombre_archivo: 'foto.jpg', size_bytes: 100, mime_type: 'image/jpeg', created_at: '',
    })
    const onCreated = vi.fn()
    renderModal({ onCreated })

    await fillRequiredFields()
    fireEvent.change(screen.getByLabelText('tickets.detail.fields.observaciones'), {
      target: { value: 'Confirmar acceso antes de la visita.' },
    })

    const fotoUno = new File(['x'], 'foto-1.jpg', { type: 'image/jpeg' })
    const fotoDos = new File(['x'], 'foto-2.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput(), { target: { files: [fotoUno, fotoDos] } })
    expect(await screen.findByText('foto-1.jpg')).toBeInTheDocument()
    expect(screen.getByText('foto-2.jpg')).toBeInTheDocument()

    fireEvent.click(await screen.findByText('tickets.create.submit'))

    await waitFor(() => expect(mockedApi.tickets.create).toHaveBeenCalledWith(expect.objectContaining({
      observaciones: 'Confirmar acceso antes de la visita.',
    })))
    await waitFor(() => expect(mockedApi.tickets.uploadAttachment).toHaveBeenCalledTimes(2))
    expect(mockedApi.tickets.uploadAttachment).toHaveBeenCalledWith(42, fotoUno)
    expect(mockedApi.tickets.uploadAttachment).toHaveBeenCalledWith(42, fotoDos)
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(42))
  })

  it('observaciones vacío se manda como null, no como string vacío', async () => {
    mockedApi.tickets.create.mockResolvedValue({ id: 42 } as TicketDetail)
    renderModal()
    await fillRequiredFields()

    fireEvent.click(await screen.findByText('tickets.create.submit'))

    await waitFor(() => expect(mockedApi.tickets.create).toHaveBeenCalledWith(expect.objectContaining({
      observaciones: null,
    })))
  })

  it('RN2 — rechaza una extensión no permitida sin llegar a subirla', async () => {
    renderModal()
    const file = new File(['x'], 'virus.exe', { type: 'application/octet-stream' })
    fireEvent.change(fileInput(), { target: { files: [file] } })

    expect(screen.getByText('tickets.create.attachments.extensionError')).toBeInTheDocument()
    expect(screen.queryByText('virus.exe')).not.toBeInTheDocument()
  })

  it('un adjunto se puede quitar antes de crear el ticket', async () => {
    renderModal()
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput(), { target: { files: [file] } })
    expect(await screen.findByText('foto.jpg')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('tickets.create.attachments.remove'))
    expect(screen.queryByText('foto.jpg')).not.toBeInTheDocument()
  })
})
