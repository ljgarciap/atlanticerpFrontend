import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PipelineCardModal from './PipelineCardModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { PipelineCardDetail } from '@/types/ventasDiseno'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { query?: string; days?: number }) =>
      opts?.query ? `${key}:${opts.query}` : key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/ventasDisenoApi', () => ({
  ventasDisenoApi: {
    pipeline: {
      list: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      changeStage: vi.fn(),
      uploadFile: vi.fn(),
      fileUrl: vi.fn(),
      contacts: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
    },
    masterClients: { list: vi.fn(), create: vi.fn() },
    subClients: { list: vi.fn(), create: vi.fn() },
  },
}))

const mockedApi = vi.mocked(ventasDisenoApi, true)

function makeDetail(overrides: Partial<PipelineCardDetail> = {}): PipelineCardDetail {
  return {
    id: 1,
    stage: 'lead',
    sales_project: { id: 1, name: 'Torre Delta', tag: null },
    master_client: { id: 1, name: 'Grupo Delta' },
    sub_client: { id: 1, business_name: 'Delta Residencial' },
    owner: { id: 1, name: 'Ana Diaz' },
    amount: null,
    worked_area_m2: null,
    days_in_stage: 2,
    is_stagnant: false,
    stage_changed_at: '2026-07-01T00:00:00Z',
    delivery_type: null,
    observations: null,
    delivery_dates: [],
    contacts: [],
    has_architect_contact: false,
    can_edit: true,
    files: [],
    latest_quote_id: null,
    ...overrides,
  }
}

function renderModal(cardId = 1) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <PipelineCardModal cardId={cardId} onClose={vi.fn()} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

// SCRUM-78 — la tarjeta abre siempre en modo vista (campos de solo lectura); hay que entrar a
// modo edición explícitamente antes de poder interactuar con cualquier input/select del
// formulario, igual que un usuario real haría clic en "Editar" primero.
async function openEditMode() {
  await screen.findByText('Torre Delta')
  fireEvent.click(screen.getByText('common:actions.edit'))
  await screen.findByDisplayValue('Torre Delta')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.pipeline.get.mockResolvedValue(makeDetail())
  mockedApi.masterClients.list.mockResolvedValue([])
  mockedApi.subClients.list.mockResolvedValue([])
})

describe('PipelineCardModal', () => {
  it('muestra los datos del detalle (modo vista, sin abrir edición)', async () => {
    renderModal()
    expect(await screen.findByText('Torre Delta')).toBeInTheDocument()
    expect(screen.getByText('Ana Diaz')).toBeInTheDocument()
  })

  // SCRUM-78 — hallazgo de Daniela Amaya (2026-07-21): antes el formulario era editable apenas
  // se abría la tarjeta, sin ningún gate — riesgo de cambiar/borrar algo por accidente. Ahora
  // abre siempre en modo vista, con un botón "Editar" explícito.
  it('abre en modo vista — sin Editar, no hay ningún input de texto visible', async () => {
    renderModal()
    await screen.findByText('Torre Delta')

    expect(document.querySelectorAll('input, select, textarea')).toHaveLength(0)
    expect(screen.getByText('common:actions.edit')).toBeInTheDocument()
    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()
  })

  it('clic en Editar habilita el formulario, y Cancelar vuelve a modo vista sin guardar', async () => {
    renderModal()
    await openEditMode()

    expect(screen.getByText('common:actions.save')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('Torre Delta'), { target: { value: 'Cambiado sin guardar' } })

    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(await screen.findByText('Torre Delta')).toBeInTheDocument()
    expect(screen.queryByText('Cambiado sin guardar')).not.toBeInTheDocument()
    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()
    expect(mockedApi.pipeline.update).not.toHaveBeenCalled()
  })

  it('Superficie trabajada acepta coma decimal y descarta el signo negativo (SCRUM-81)', async () => {
    renderModal()
    await openEditMode()

    const areaInput = screen.getByPlaceholderText('ventasDiseno:modal.undefined')
    fireEvent.change(areaInput, { target: { value: '12,5' } })
    expect(screen.getByDisplayValue('12.5')).toBeInTheDocument()

    fireEvent.change(areaInput, { target: { value: '-8' } })
    expect(screen.getByDisplayValue('8')).toBeInTheDocument()
  })

  it('muestra el aviso de falta de contacto Arquitecto', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ has_architect_contact: false }))
    renderModal()
    expect(await screen.findByText('ventasDiseno:modal.missingArchitect')).toBeInTheDocument()
  })

  it('no muestra el aviso cuando ya hay contacto Arquitecto', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ has_architect_contact: true }))
    renderModal()
    await screen.findByText('Torre Delta')
    expect(screen.queryByText('ventasDiseno:modal.missingArchitect')).not.toBeInTheDocument()
  })

  it('muestra banner de no editable y oculta Guardar cuando can_edit es false (etapa lost)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'lost', can_edit: false }))
    renderModal()
    expect(await screen.findByText('ventasDiseno:modal.notEditableLost')).toBeInTheDocument()
    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()
  })

  it('Escape cierra el modal (SCRUM-76)', async () => {
    const onClose = vi.fn()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <PipelineCardModal cardId={1} onClose={onClose} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Torre Delta')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })

  it('el botón Editar aparece cuando can_edit es true; Guardar recién tras hacer clic en Editar', async () => {
    renderModal()
    expect(await screen.findByText('common:actions.edit')).toBeInTheDocument()
    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('common:actions.edit'))

    expect(await screen.findByText('common:actions.save')).toBeInTheDocument()
  })

  it('elegir Entrega Única siembra un input de fecha (QA formal 2026-07-11)', async () => {
    // SCRUM-78: los inputs de fecha solo se muestran en Propuesta/Aprobado.
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'proposal', can_edit: true }))
    renderModal()
    await openEditMode()

    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[1], { target: { value: 'single' } })

    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(1)
  })

  it('los inputs de fecha de entrega no se muestran en Lead/Diseño aunque haya Tipo de entrega elegido (SCRUM-78)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'design', can_edit: true }))
    renderModal()
    await openEditMode()

    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[1], { target: { value: 'partial' } })

    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(0)
  })

  it('crea un contacto y refresca el detalle', async () => {
    mockedApi.pipeline.contacts.create.mockResolvedValue({
      id: 5, name: 'Arq. Pérez', role: 'architect', phone: null, email: 'arq@test.com',
    })
    renderModal()
    await openEditMode()

    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.contactName'), { target: { value: 'Arq. Pérez' } })
    fireEvent.change(screen.getByPlaceholderText('common:labels.email'), { target: { value: 'arq@test.com' } })
    // "common:actions.add" también lo usan los 4 botones de carga de archivos —
    // el de agregar contacto es el último en el orden del DOM.
    const addButtons = screen.getAllByText('common:actions.add')
    fireEvent.click(addButtons[addButtons.length - 1])

    await waitFor(() => expect(mockedApi.pipeline.contacts.create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: 'Arq. Pérez', email: 'arq@test.com' }),
    ))
  })

  it('edita un contacto existente (SCRUM-90)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      contacts: [{ id: 9, name: 'Arq. Pérez', role: 'architect', phone: null, email: 'arq@test.com' }],
    }))
    mockedApi.pipeline.contacts.update.mockResolvedValue({
      id: 9, name: 'Arq. Pérez Actualizado', role: 'architect', phone: '6000-0000', email: 'arq@test.com',
    })
    renderModal()
    await openEditMode()

    fireEvent.click(screen.getByText('ventasDiseno:clients.detail.editContact'))

    const nameInput = screen.getByDisplayValue('Arq. Pérez') as HTMLInputElement
    const editRow = nameInput.closest('li') as HTMLElement
    fireEvent.change(nameInput, { target: { value: 'Arq. Pérez Actualizado' } })
    fireEvent.click(within(editRow).getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.pipeline.contacts.update).toHaveBeenCalledWith(
      1, 9,
      expect.objectContaining({ name: 'Arq. Pérez Actualizado', email: 'arq@test.com' }),
    ))
  })

  it('mueve la tarjeta a la siguiente etapa del flujo', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'lead', can_edit: true }))
    mockedApi.pipeline.changeStage.mockResolvedValue(makeDetail({ stage: 'design' }))
    renderModal()
    await screen.findByText('Torre Delta')

    fireEvent.click(screen.getByText('ventasDiseno:modal.moveToNext'))

    await waitFor(() => expect(mockedApi.pipeline.changeStage).toHaveBeenCalledWith(1, 'design'))
  })

  it('muestra Reactivar para una tarjeta Perdida y la mueve a Lead', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'lost', can_edit: false }))
    mockedApi.pipeline.changeStage.mockResolvedValue(makeDetail({ stage: 'lead' }))
    renderModal()
    await screen.findByText('ventasDiseno:modal.reactivate')

    fireEvent.click(screen.getByText('ventasDiseno:modal.reactivate'))

    await waitFor(() => expect(mockedApi.pipeline.changeStage).toHaveBeenCalledWith(1, 'lead'))
  })

  // REQ-597 RN3 / REQ-603 RN2 (Epic CRM Batch B) — Aprobado es terminal, sin ningún botón de
  // movimiento. can_edit:true simula un usuario con ventas_diseno.edit.approved (ej. Mark en
  // producción) — antes de este fix, "Marcar como Perdido" seguía visible y funcional para él.
  it('NO muestra "Marcar como Perdido" (ni ningún botón de movimiento) para una tarjeta Aprobada, aunque can_edit sea true', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'approved', can_edit: true }))
    renderModal()
    await screen.findByText('Torre Delta')

    expect(screen.queryByText('ventasDiseno:modal.markAsLost')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:modal.moveToNext')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:modal.createQuote')).not.toBeInTheDocument()
  })

  it('muestra el error del gate cuando el cambio de etapa falla con 422', async () => {
    // RN5 (SCRUM-677/680) — 'design' ya no tiene botón genérico de movimiento (solo "Crear
    // cotización"), así que este escenario usa 'quote', cuyo "Mover a Siguiente" (a Propuesta)
    // sigue existiendo.
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: true }))
    mockedApi.pipeline.changeStage.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Falta la superficie trabajada (m²) antes de mover a Propuesta.' } },
    })
    renderModal()
    await screen.findByText('Torre Delta')

    fireEvent.click(screen.getByText('ventasDiseno:modal.moveToNext'))

    expect(await screen.findByText('Falta la superficie trabajada (m²) antes de mover a Propuesta.')).toBeInTheDocument()
  })

  // SCRUM-677 — Daniela Amaya reportó dos veces (2026-08-03/04, con video) que la alerta de
  // "dato faltante" quedaba visible para siempre incluso después de completar el dato y
  // guardar/mover la tarjeta con éxito. Causa real: stageError/quoteGateError solo se
  // limpiaban en el onSuccess de SU PROPIA mutación (changeStage / handleCreateQuoteClick),
  // nunca cuando el dato faltante se completaba por otra vía (Guardar, subir archivo,
  // agregar contacto). Este test reproduce el flujo real: falla "Mover a Siguiente" por un
  // dato faltante, el usuario lo completa vía Editar → Guardar, y el banner debe desaparecer.
  it('limpiar el dato faltante vía Guardar borra el aviso de gate de etapa que había quedado pegado (SCRUM-677)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: true }))
    mockedApi.pipeline.changeStage.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Falta la superficie trabajada (m²) antes de mover a Propuesta.' } },
    })
    renderModal()
    await screen.findByText('Torre Delta')

    fireEvent.click(screen.getByText('ventasDiseno:modal.moveToNext'))
    expect(await screen.findByText('Falta la superficie trabajada (m²) antes de mover a Propuesta.')).toBeInTheDocument()

    mockedApi.pipeline.update.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: true, worked_area_m2: 120 }))
    await openEditMode()
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.pipeline.update).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.queryByText('Falta la superficie trabajada (m²) antes de mover a Propuesta.')).not.toBeInTheDocument(),
    )
  })

  it('muestra el error del backend cuando Guardar falla con 422 (SCRUM-81)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail())
    mockedApi.pipeline.update.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'El campo superficie trabajada m2 no debe ser mayor que 99999999.99.' } },
    })
    renderModal()
    await openEditMode()

    fireEvent.click(screen.getByText('common:actions.save'))

    expect(await screen.findByText('El campo superficie trabajada m2 no debe ser mayor que 99999999.99.')).toBeInTheDocument()
  })

  it('crea un subcliente nuevo pidiendo el RUC antes de confirmar', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ sub_client: null }))
    mockedApi.subClients.create.mockResolvedValue({ id: 9, business_name: 'Nueva SA', tax_id: '155-0000-1-2026' })
    renderModal()
    await openEditMode()

    // input[type=text]: [0] nombre, [1] Cliente Master (ya tiene valor), [2] Subcliente (vacío)
    const textInputs = document.querySelectorAll('input[type="text"]')
    const subClientInput = textInputs[2] as HTMLInputElement
    fireEvent.change(subClientInput, { target: { value: 'Nueva SA' } })

    const createOption = await screen.findByText('ventasDiseno:modal.createNew:Nueva SA')
    fireEvent.mouseDown(createOption)

    // Con extraFieldLabel (RUC), no debe crear todavía — se abre el mini-form.
    const ruc = await screen.findByPlaceholderText('ventasDiseno:modal.subClientTaxId')
    expect(mockedApi.subClients.create).not.toHaveBeenCalled()

    fireEvent.change(ruc, { target: { value: '155-1234-1-2026' } })
    fireEvent.click(screen.getByText('common:actions.confirm'))

    await waitFor(() => expect(mockedApi.subClients.create).toHaveBeenCalledWith(1, 'Nueva SA', '155-1234-1-2026'))
  })

  it('si falla la creación del subcliente (422), el mini-form del RUC queda abierto con el dato tipeado (SCRUM-122 Pre-QA)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ sub_client: null }))
    mockedApi.subClients.create.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'El RUC ya existe.' } },
    })
    renderModal()
    await openEditMode()

    const textInputs = document.querySelectorAll('input[type="text"]')
    const subClientInput = textInputs[2] as HTMLInputElement
    fireEvent.change(subClientInput, { target: { value: 'Nueva SA' } })
    fireEvent.mouseDown(await screen.findByText('ventasDiseno:modal.createNew:Nueva SA'))

    const ruc = await screen.findByPlaceholderText('ventasDiseno:modal.subClientTaxId')
    fireEvent.change(ruc, { target: { value: '155-1234-1-2026' } })
    fireEvent.click(screen.getByText('common:actions.confirm'))

    expect(await screen.findByText('El RUC ya existe.')).toBeInTheDocument()
    // El mini-form no debe cerrarse ni perder el dato tipeado tras el rechazo del backend.
    expect(screen.getByPlaceholderText('ventasDiseno:modal.subClientTaxId')).toHaveValue('155-1234-1-2026')
  })

  it('muestra el error cuando falla la creación de un Cliente Master', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ master_client: null, sub_client: null }))
    mockedApi.masterClients.create.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'El nombre ya existe.' } },
    })
    renderModal()
    await openEditMode()

    const textInputs = document.querySelectorAll('input[type="text"]')
    const masterClientInput = textInputs[1] as HTMLInputElement
    fireEvent.change(masterClientInput, { target: { value: 'Repetido' } })

    // Cliente Master no tiene extraFieldLabel — crea directo con un solo click.
    const createOption = await screen.findByText('ventasDiseno:modal.createNew:Repetido')
    fireEvent.mouseDown(createOption)

    expect(await screen.findByText('El nombre ya existe.')).toBeInTheDocument()
  })

  it('sube un archivo de diseño', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'design', can_edit: true }))
    mockedApi.pipeline.uploadFile.mockResolvedValue({
      id: 1, type: 'design', file_name: 'plano.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-07-09T00:00:00Z',
    })
    renderModal()
    await openEditMode()

    const file = new File(['contenido'], 'plano.pdf', { type: 'application/pdf' })
    const fileInputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(fileInputs[0], { target: { files: [file] } })

    await waitFor(() => expect(mockedApi.pipeline.uploadFile).toHaveBeenCalledWith(1, 'design', file))
  })

  it('subir la cotización firmada en Cotización avanza la tarjeta a Propuesta automáticamente (SCRUM-85)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: true }))
    mockedApi.pipeline.uploadFile.mockResolvedValue({
      id: 1, type: 'signed_quote', file_name: 'cotizacion.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-07-09T00:00:00Z',
    })
    mockedApi.pipeline.changeStage.mockResolvedValue(makeDetail({ stage: 'proposal' }))
    renderModal()
    await openEditMode()

    const file = new File(['contenido'], 'cotizacion.pdf', { type: 'application/pdf' })
    const fileInputs = document.querySelectorAll('input[type="file"]')
    // FILE_TYPES: [0] design, [1] signed_quote, [2] approval_proof, [3] proposal
    fireEvent.change(fileInputs[1], { target: { files: [file] } })

    await waitFor(() => expect(mockedApi.pipeline.changeStage).toHaveBeenCalledWith(1, 'proposal'))
  })

  it('subir el comprobante en Propuesta avanza la tarjeta a Aprobado automáticamente (SCRUM-86)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'proposal', can_edit: true }))
    mockedApi.pipeline.uploadFile.mockResolvedValue({
      id: 1, type: 'approval_proof', file_name: 'comprobante.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-07-09T00:00:00Z',
    })
    mockedApi.pipeline.changeStage.mockResolvedValue(makeDetail({ stage: 'approved' }))
    renderModal()
    await openEditMode()

    const file = new File(['contenido'], 'comprobante.pdf', { type: 'application/pdf' })
    const fileInputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(fileInputs[2], { target: { files: [file] } })

    await waitFor(() => expect(mockedApi.pipeline.changeStage).toHaveBeenCalledWith(1, 'approved'))
  })

  it('si falta el otro requisito del gate, el auto-avance falla y muestra el mismo error que un clic manual', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: true }))
    mockedApi.pipeline.uploadFile.mockResolvedValue({
      id: 1, type: 'signed_quote', file_name: 'cotizacion.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-07-09T00:00:00Z',
    })
    mockedApi.pipeline.changeStage.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Falta la superficie trabajada (m²) antes de mover a Propuesta.' } },
    })
    renderModal()
    await openEditMode()

    const file = new File(['contenido'], 'cotizacion.pdf', { type: 'application/pdf' })
    const fileInputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(fileInputs[1], { target: { files: [file] } })

    expect(await screen.findByText('Falta la superficie trabajada (m²) antes de mover a Propuesta.')).toBeInTheDocument()
  })

  // ── SCRUM-734 (sección 3): "Ver cotizaciones de este proyecto" ──────────────

  it('sin cotización confirmada, no muestra el botón de ver cotizaciones', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ latest_quote_id: null }))
    renderModal()

    await screen.findByText('Torre Delta')
    expect(screen.queryByText('ventasDiseno:modal.viewProjectQuotes')).not.toBeInTheDocument()
  })

  it('con cotización confirmada, muestra el botón y navega a Cotizaciones con ?viewQuote=', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ latest_quote_id: 42 }))
    renderModal()

    fireEvent.click(await screen.findByText('ventasDiseno:modal.viewProjectQuotes'))

    expect(mockNavigate).toHaveBeenCalledWith('/ventas-diseno/quotes-list?viewQuote=42')
  })

  it('el botón de ver cotizaciones aparece incluso en tarjetas Perdidas (solo lectura)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'lost', latest_quote_id: 42, can_edit: false }))
    renderModal()

    expect(await screen.findByText('ventasDiseno:modal.viewProjectQuotes')).toBeInTheDocument()
  })

  // ── SCRUM-767: Ver/Descargar archivos ya cargados ────────────────────────────

  it('el nombre del archivo es clickeable y abre el visor con la URL presignada', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      files: [{ id: 5, type: 'design', file_name: 'plano.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-08-15T00:00:00Z' }],
    }))
    mockedApi.pipeline.fileUrl.mockResolvedValue({ url: 'https://s3.example/plano.pdf?sig=abc', filename: 'plano.pdf', mime_type: 'application/pdf' })
    renderModal()

    fireEvent.click(await screen.findByText('plano.pdf'))

    await waitFor(() => expect(mockedApi.pipeline.fileUrl).toHaveBeenCalledWith(1, 5, 'inline'))
    await waitFor(() => expect(screen.getAllByText('plano.pdf')).toHaveLength(2)) // fila + título del visor
    const iframe = document.querySelector('iframe')
    expect(iframe).toHaveAttribute('src', 'https://s3.example/plano.pdf?sig=abc')
  })

  it('archivo de imagen se previsualiza con <img>, no <iframe>', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      files: [{ id: 6, type: 'photo', file_name: 'foto.jpg', size_bytes: 100, mime_type: 'image/jpeg', created_at: '2026-08-15T00:00:00Z' }],
    }))
    mockedApi.pipeline.fileUrl.mockResolvedValue({ url: 'https://s3.example/foto.jpg?sig=abc', filename: 'foto.jpg', mime_type: 'image/jpeg' })
    renderModal()

    fireEvent.click(await screen.findByText('foto.jpg'))

    await waitFor(() => expect(document.querySelector('img[src="https://s3.example/foto.jpg?sig=abc"]')).toBeInTheDocument())
    expect(document.querySelector('iframe')).not.toBeInTheDocument()
  })

  it('el botón de descargar pide la URL y dispara la descarga sin abrir el visor', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      files: [{ id: 7, type: 'design', file_name: 'plano.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-08-15T00:00:00Z' }],
    }))
    mockedApi.pipeline.fileUrl.mockResolvedValue({ url: 'https://s3.example/plano.pdf?sig=abc', filename: 'plano.pdf', mime_type: 'application/pdf' })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderModal()

    await screen.findByText('plano.pdf')
    fireEvent.click(screen.getByTitle('ventasDiseno:modal.fileDownload'))

    // 'attachment' explícito — la descarga necesita su propia URL con Content-Disposition
    // distinto al de la previsualización 'inline' (ver docblock de PipelineFileService::getPresignedUrl()).
    await waitFor(() => expect(mockedApi.pipeline.fileUrl).toHaveBeenCalledWith(1, 7, 'attachment'))
    expect(clickSpy).toHaveBeenCalled()
    // La descarga no abre el visor inline (son acciones independientes).
    expect(document.querySelector('iframe')).not.toBeInTheDocument()
    clickSpy.mockRestore()
  })

  it('si falla la obtención de la URL, muestra un error visible', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      files: [{ id: 8, type: 'design', file_name: 'plano.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-08-15T00:00:00Z' }],
    }))
    mockedApi.pipeline.fileUrl.mockRejectedValue(new Error('network error'))
    renderModal()

    fireEvent.click(await screen.findByText('plano.pdf'))

    expect(await screen.findByText('ventasDiseno:modal.fileUrlError')).toBeInTheDocument()
  })

  it('archivo cargado sigue Ver/Descargar-able tras salir y volver a entrar a la tarjeta (persistencia)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      files: [{ id: 9, type: 'design', file_name: 'plano.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-08-15T00:00:00Z' }],
    }))
    mockedApi.pipeline.fileUrl.mockResolvedValue({ url: 'https://s3.example/plano.pdf?sig=xyz', filename: 'plano.pdf', mime_type: 'application/pdf' })
    const { unmount } = renderModal()
    await screen.findByText('plano.pdf')
    unmount()

    renderModal() // vuelve a abrir la tarjeta — no hace falta volver a cargar el archivo
    fireEvent.click(await screen.findByText('plano.pdf'))
    await waitFor(() => expect(document.querySelector('iframe')).toHaveAttribute('src', 'https://s3.example/plano.pdf?sig=xyz'))
  })
})
