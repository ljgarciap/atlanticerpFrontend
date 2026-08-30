import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NewProjectModal from './NewProjectModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { PipelineCardDetail } from '@/types/ventasDiseno'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    pipeline: { create: vi.fn(), uploadFile: vi.fn(), contacts: { create: vi.fn() } },
    masterClients: { list: vi.fn(), create: vi.fn() },
    subClients: { list: vi.fn(), create: vi.fn() },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function renderModal(onCreated = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <NewProjectModal onClose={vi.fn()} onCreated={onCreated} />
    </QueryClientProvider>,
  )
}

const fakeCard = { id: 42 } as PipelineCardDetail

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.pipeline.create.mockResolvedValue(fakeCard)
  mockedApi.pipeline.uploadFile.mockResolvedValue({} as never)
  mockedApi.pipeline.contacts.create.mockResolvedValue({} as never)
})

describe('NewProjectModal', () => {
  it('arranca en tipo Lead, sin campos de cliente', () => {
    renderModal()
    expect(screen.queryByText('ventasDiseno:modal.masterClient')).not.toBeInTheDocument()
  })

  it('el botón Guardar está deshabilitado sin nombre', () => {
    renderModal()
    expect(screen.getByText('ventasDiseno:modal.newProject.save')).toBeDisabled()
  })

  it('crea un Lead sin cliente vinculado', async () => {
    const onCreated = vi.fn()
    renderModal(onCreated)

    const [nameInput] = screen.getAllByRole('textbox')
    fireEvent.change(nameInput, { target: { value: 'Lead Manual' } })
    fireEvent.click(screen.getByText('ventasDiseno:modal.newProject.save'))

    await waitFor(() => expect(mockedApi.pipeline.create).toHaveBeenCalledWith({
      type: 'lead', name: 'Lead Manual', sub_client_id: null, tag: null, observations: null,
    }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(fakeCard))
  })

  it('tipo Diseño exige Subcliente antes de habilitar Guardar', () => {
    renderModal()
    fireEvent.click(screen.getByText('ventasDiseno:modal.newProject.typeDesign'))

    const [nameInput] = screen.getAllByRole('textbox')
    fireEvent.change(nameInput, { target: { value: 'Proyecto Diseño' } })

    expect(screen.getByText('ventasDiseno:modal.newProject.save')).toBeDisabled()
    expect(screen.getByText('ventasDiseno:modal.masterClient')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:modal.subClient')).toBeInTheDocument()
  })

  it('advierte antes de crear un proyecto en Diseño con un Subcliente sin contactos', async () => {
    mockedApi.masterClients.list.mockResolvedValue([{ id: 1, name: 'Grupo Delta' }])
    mockedApi.subClients.list.mockResolvedValue([{ id: 10, business_name: 'Delta Residencial', contacts_count: 0 }])

    renderModal()
    fireEvent.click(screen.getByText('ventasDiseno:modal.newProject.typeDesign'))

    const [nameField, masterField, subField] = screen.getAllByRole('textbox')
    fireEvent.change(nameField, { target: { value: 'Proyecto Diseño' } })

    fireEvent.focus(masterField)
    fireEvent.change(masterField, { target: { value: 'Delta' } })
    fireEvent.mouseDown(await screen.findByText('Grupo Delta'))

    fireEvent.focus(subField)
    fireEvent.change(subField, { target: { value: 'Residencial' } })
    fireEvent.mouseDown(await screen.findByText('Delta Residencial'))

    expect(await screen.findByText('ventasDiseno:modal.newProject.noContactsWarning')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:modal.newProject.save')).toBeInTheDocument()

    fireEvent.click(screen.getByText('ventasDiseno:modal.newProject.save'))
    expect(mockedApi.pipeline.create).not.toHaveBeenCalled()
    expect(await screen.findByText('ventasDiseno:modal.newProject.confirmSave')).toBeInTheDocument()

    fireEvent.click(screen.getByText('ventasDiseno:modal.newProject.confirmSave'))
    await waitFor(() => expect(mockedApi.pipeline.create).toHaveBeenCalledWith({
      type: 'design', name: 'Proyecto Diseño', sub_client_id: 10, tag: null, observations: null,
    }))
  })

  it('crea un Lead con Etiqueta y Observaciones (REQ-019)', async () => {
    const { container } = renderModal()

    const [nameInput] = screen.getAllByRole('textbox')
    fireEvent.change(nameInput, { target: { value: 'Lead con datos' } })

    const tagSelect = container.querySelector('select') as HTMLSelectElement
    fireEvent.change(tagSelect, { target: { value: 'quote' } })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Cliente pidió cotización urgente' } })

    fireEvent.click(screen.getByText('ventasDiseno:modal.newProject.save'))

    await waitFor(() => expect(mockedApi.pipeline.create).toHaveBeenCalledWith({
      type: 'lead', name: 'Lead con datos', sub_client_id: null,
      tag: 'quote', observations: 'Cliente pidió cotización urgente',
    }))
  })

  it('sube la Foto de un Lead después de crear la tarjeta (REQ-019)', async () => {
    const onCreated = vi.fn()
    const { container } = renderModal(onCreated)

    const [nameInput] = screen.getAllByRole('textbox')
    fireEvent.change(nameInput, { target: { value: 'Lead con foto' } })

    const photoInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const photoFile = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    fireEvent.change(photoInput, { target: { files: [photoFile] } })

    fireEvent.click(screen.getByText('ventasDiseno:modal.newProject.save'))

    await waitFor(() => expect(mockedApi.pipeline.uploadFile).toHaveBeenCalledWith(42, 'photo', photoFile))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(fakeCard))
  })

  it('sube los archivos de diseño de un proyecto tipo Diseño después de crear la tarjeta (REQ-020)', async () => {
    mockedApi.masterClients.list.mockResolvedValue([{ id: 1, name: 'Grupo Delta' }])
    mockedApi.subClients.list.mockResolvedValue([{ id: 10, business_name: 'Delta Residencial', contacts_count: 1 }])

    const onCreated = vi.fn()
    const { container } = renderModal(onCreated)
    fireEvent.click(screen.getByText('ventasDiseno:modal.newProject.typeDesign'))

    const [nameField, masterField, subField] = screen.getAllByRole('textbox')
    fireEvent.change(nameField, { target: { value: 'Proyecto con archivos' } })

    fireEvent.focus(masterField)
    fireEvent.change(masterField, { target: { value: 'Delta' } })
    fireEvent.mouseDown(await screen.findByText('Grupo Delta'))

    fireEvent.focus(subField)
    fireEvent.change(subField, { target: { value: 'Residencial' } })
    fireEvent.mouseDown(await screen.findByText('Delta Residencial'))

    const designInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file1 = new File(['1'], 'plano1.pdf', { type: 'application/pdf' })
    const file2 = new File(['2'], 'plano2.pdf', { type: 'application/pdf' })
    fireEvent.change(designInput, { target: { files: [file1] } })
    fireEvent.change(designInput, { target: { files: [file2] } })

    expect(await screen.findByText('plano1.pdf')).toBeInTheDocument()
    expect(screen.getByText('plano2.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByText('ventasDiseno:modal.newProject.save'))

    await waitFor(() => expect(mockedApi.pipeline.uploadFile).toHaveBeenCalledWith(42, 'design', file1))
    await waitFor(() => expect(mockedApi.pipeline.uploadFile).toHaveBeenCalledWith(42, 'design', file2))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(fakeCard))
  })

  it('crea el contacto opcional de un Lead después de crear la tarjeta (SCRUM-88)', async () => {
    const onCreated = vi.fn()
    renderModal(onCreated)

    const [nameInput] = screen.getAllByRole('textbox')
    fireEvent.change(nameInput, { target: { value: 'Lead con contacto' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Ana Pérez' } })
    fireEvent.change(screen.getByPlaceholderText('common:labels.phone'), { target: { value: '+507 6000-0000' } })

    fireEvent.click(screen.getByText('ventasDiseno:modal.newProject.save'))

    await waitFor(() => expect(mockedApi.pipeline.contacts.create).toHaveBeenCalledWith(42, {
      name: 'Ana Pérez', role: 'client', phone: '+507 6000-0000', email: null,
    }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(fakeCard))
  })

  it('deshabilita Guardar si el contacto tiene nombre pero ni teléfono ni correo (SCRUM-88)', () => {
    renderModal()

    const [nameInput] = screen.getAllByRole('textbox')
    fireEvent.change(nameInput, { target: { value: 'Lead con contacto incompleto' } })
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Ana Pérez' } })

    expect(screen.getByText('ventasDiseno:modal.newProject.save')).toBeDisabled()
  })
})
