import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PipelineCardModal from './PipelineCardModal'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
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
    architects: { search: vi.fn().mockResolvedValue([]) },
    pipeline: {
      list: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      changeStage: vi.fn(),
      passToOrder: vi.fn(),
      uploadFile: vi.fn(),
      fileUrl: vi.fn(),
      deleteFile: vi.fn(),
      contacts: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
      associates: { add: vi.fn(), remove: vi.fn() },
      productDeliveryAssignments: { list: vi.fn(), save: vi.fn() },
    },
    masterClients: { list: vi.fn(), create: vi.fn() },
    subClients: { list: vi.fn(), create: vi.fn() },
    home: { vendors: vi.fn() },
    quotes: { duplicate: vi.fn() },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(ventasDisenoApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeDetail(overrides: Partial<PipelineCardDetail> = {}): PipelineCardDetail {
  return {
    id: 1,
    stage: 'lead',
    sales_project: { id: 1, name: 'Proyecto Alfa', tag: null },
    master_client: { id: 1, name: 'Grupo Delta' },
    sub_client: { id: 1, business_name: 'Delta Residencial' },
    owner: { id: 1, name: 'Ana Diaz' },
    // null por defecto (distinto de owner) — evita colisión de texto duplicado en los tests
    // existentes que no les importa el Creador; se override explícito donde sí hace falta.
    creator: null,
    assignees: [{ id: 1, name: 'Ana Diaz' }],
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
  await screen.findByText('Proyecto Alfa')
  fireEvent.click(screen.getByText('common:actions.edit'))
  await screen.findByDisplayValue('Proyecto Alfa')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.pipeline.get.mockResolvedValue(makeDetail())
  mockedApi.masterClients.list.mockResolvedValue([])
  mockedApi.subClients.list.mockResolvedValue([])
  mockedApi.home.vendors.mockResolvedValue([])
  mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([])
  mockedStore.mockReturnValue({ user: { id: 1, role: 'designer' } } as never)
})

describe('PipelineCardModal', () => {
  it('muestra los datos del detalle (modo vista, sin abrir edición)', async () => {
    renderModal()
    expect(await screen.findByText('Proyecto Alfa')).toBeInTheDocument()
    expect(screen.getByText('Ana Diaz')).toBeInTheDocument()
  })

  it('muestra el Creador diferenciado del Responsable, y no cambia en modo edición (SCRUM-884)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(
      makeDetail({ owner: { id: 1, name: 'Ana Diaz' }, creator: { id: 2, name: 'Beto Solis' } }),
    )
    renderModal()
    await screen.findByText('Proyecto Alfa')

    expect(screen.getByText('Beto Solis')).toBeInTheDocument()
    expect(screen.getByText('Ana Diaz')).toBeInTheDocument()

    await openEditMode()

    // El Creador sigue de solo lectura en modo edición — no hay ningún input/select para él,
    // a diferencia del Responsable (UserMultiSelect, solo visible para Gerencia).
    expect(screen.getByText('Beto Solis')).toBeInTheDocument()
  })

  // SCRUM-78 — hallazgo de Gerencia Test (2026-07-21): antes el formulario era editable apenas
  // se abría la tarjeta, sin ningún gate — riesgo de cambiar/borrar algo por accidente. Ahora
  // abre siempre en modo vista, con un botón "Editar" explícito.
  it('abre en modo vista — sin Editar, no hay ningún input de texto visible', async () => {
    renderModal()
    await screen.findByText('Proyecto Alfa')

    expect(document.querySelectorAll('input, select, textarea')).toHaveLength(0)
    expect(screen.getByText('common:actions.edit')).toBeInTheDocument()
    expect(screen.queryByText('common:actions.save')).not.toBeInTheDocument()
  })

  it('clic en Editar habilita el formulario, y Cancelar vuelve a modo vista sin guardar', async () => {
    renderModal()
    await openEditMode()

    expect(screen.getByText('common:actions.save')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('Proyecto Alfa'), { target: { value: 'Cambiado sin guardar' } })

    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(await screen.findByText('Proyecto Alfa')).toBeInTheDocument()
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
    await screen.findByText('Proyecto Alfa')
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
    await screen.findByText('Proyecto Alfa')

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

  it('cambiar de Parcial (3 fechas) a Entrega Única colapsa a exactamente 1 input (rebote SCRUM-817)', async () => {
    // Antes: la condición `deliveryDates.length < 1` solo limpiaba una lista vacía — al volver
    // de Parcial con 2, 3 o más fechas cargadas, los campos adicionales quedaban pegados en el
    // formulario aunque ya estuviera seleccionada "Única".
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      stage: 'proposal', can_edit: true,
      delivery_type: 'partial', delivery_dates: ['2026-09-01', '2026-09-15', '2026-10-01'],
    }))
    renderModal()
    await openEditMode()

    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(3)

    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[1], { target: { value: 'single' } })

    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(1)
  })

  // SCRUM-874 (Gerencia Test) — SCRUM-78 había restringido estos inputs a Propuesta/Aprobado;
  // ese criterio cambió a las 5 etapas por igual. SCRUM-909 (rebote 2026-09-14) lo volvió a
  // acotar — ver DELIVERY_DATE_STAGES — así que este test ahora cubre solo 'quote', que sigue
  // siendo una etapa válida (a diferencia de 'lead'/'design', ver test de abajo).
  it.each(['quote', 'proposal', 'approved'] as const)(
    'elegir Única siembra un input de fecha también en %s (SCRUM-874/909)',
    async stage => {
      mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage, can_edit: true }))
      renderModal()
      await openEditMode()

      const selects = document.querySelectorAll('select')
      fireEvent.change(selects[1], { target: { value: 'single' } })
      expect(document.querySelectorAll('input[type="date"]')).toHaveLength(1)

      fireEvent.change(selects[1], { target: { value: 'partial' } })
      expect(document.querySelectorAll('input[type="date"]')).toHaveLength(2)
    },
  )

  // SCRUM-909 (rebote 2026-09-14, RQ1) — el campo "Fecha estimada de entrega" y el botón
  // "Asignar productos a entrega" no deben renderizarse en absoluto en Lead/Diseño, ni en modo
  // vista ni en edición — antes (SCRUM-874) sí aparecían en las 5 etapas por igual.
  it.each(['lead', 'design'] as const)(
    'no muestra el campo de fecha de entrega en %s, ni en vista ni en edición (SCRUM-909)',
    async stage => {
      mockedApi.pipeline.get.mockResolvedValue(makeDetail({
        stage, can_edit: true, delivery_type: 'partial', delivery_dates: ['2026-09-01', '2026-09-15'],
      }))
      renderModal()
      await screen.findByText('Proyecto Alfa')
      expect(screen.queryByText('ventasDiseno:modal.deliveryType')).not.toBeInTheDocument()
      expect(screen.queryByText('ventasDiseno:modal.assignProductsToDelivery')).not.toBeInTheDocument()

      await openEditMode()
      expect(screen.queryByText('ventasDiseno:modal.deliveryType')).not.toBeInTheDocument()
      expect(screen.queryByText('ventasDiseno:modal.assignProductsToDelivery')).not.toBeInTheDocument()
    },
  )

  it('guarda sin error tras completar la fecha en Cotización con Entrega Única (SCRUM-874/909)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: true }))
    mockedApi.pipeline.update.mockResolvedValue(makeDetail({
      stage: 'quote', can_edit: true, delivery_type: 'single', delivery_dates: ['2026-10-01'],
    }))
    renderModal()
    await openEditMode()

    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[1], { target: { value: 'single' } })
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-10-01' } })

    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.pipeline.update).toHaveBeenCalledWith(1, expect.objectContaining({
      delivery_type: 'single', delivery_dates: ['2026-10-01'],
    })))
  })

  it('deja el campo vacío (sin elegir Única/Parcial) y guarda sin error (SCRUM-874)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: true }))
    mockedApi.pipeline.update.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: true }))
    renderModal()
    await openEditMode()

    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.pipeline.update).toHaveBeenCalledWith(1, expect.objectContaining({
      delivery_type: null, delivery_dates: [],
    })))
    expect(screen.queryByText('ventasDiseno:modal.saveError')).not.toBeInTheDocument()
  })

  it('revertir Única/Parcial a vacío limpia el error de validación pegado sin necesidad de Cancelar (SCRUM-874)', async () => {
    // Reproduce el bug reportado: se elige "Única" en una etapa donde el input de fecha no
    // aparecía (bug ya corregido arriba), así que delivery_dates queda con una entrada vacía;
    // Guardar falla 422 (delivery_dates.*: date). El usuario revierte el selector a "—" sin
    // pasar por Cancelar — el próximo Guardar debe mandar delivery_dates: [] y limpiar el error.
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: true }))
    mockedApi.pipeline.update.mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { message: 'El campo delivery dates.0 debe ser una fecha.' } },
    })
    renderModal()
    await openEditMode()

    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[1], { target: { value: 'single' } })
    fireEvent.click(screen.getByText('common:actions.save'))
    expect(await screen.findByText('El campo delivery dates.0 debe ser una fecha.')).toBeInTheDocument()

    mockedApi.pipeline.update.mockResolvedValueOnce(makeDetail({ stage: 'quote', can_edit: true }))
    fireEvent.change(selects[1], { target: { value: '' } })
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.pipeline.update).toHaveBeenLastCalledWith(1, expect.objectContaining({
      delivery_type: null, delivery_dates: [],
    })))
    await waitFor(() =>
      expect(screen.queryByText('El campo delivery dates.0 debe ser una fecha.')).not.toBeInTheDocument(),
    )
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
    await screen.findByText('Proyecto Alfa')

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
  // movimiento. can_edit:true simula un usuario con ventas_diseno.edit.approved (ej. Gerencia en
  // producción) — antes de este fix, "Marcar como Perdido" seguía visible y funcional para él.
  it('NO muestra "Marcar como Perdido" (ni ningún botón de movimiento) para una tarjeta Aprobada, aunque can_edit sea true', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'approved', can_edit: true }))
    renderModal()
    await screen.findByText('Proyecto Alfa')

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
    await screen.findByText('Proyecto Alfa')

    fireEvent.click(screen.getByText('ventasDiseno:modal.moveToNext'))

    expect(await screen.findByText('Falta la superficie trabajada (m²) antes de mover a Propuesta.')).toBeInTheDocument()
  })

  // SCRUM-677 — Gerencia Test reportó dos veces (2026-08-03/04, con video) que la alerta de
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
    await screen.findByText('Proyecto Alfa')

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
    // SCRUM-1140 — el DV es opcional: sin DV, Confirmar queda habilitado (la guarda de facturación lo exige solo si la DGI lo trae).
    expect(screen.getByText('common:actions.confirm')).not.toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.subClientTaxIdDv'), { target: { value: '81' } })
    fireEvent.click(screen.getByText('common:actions.confirm'))

    await waitFor(() => expect(mockedApi.subClients.create).toHaveBeenCalledWith(1, 'Nueva SA', '155-1234-1-2026', '81'))
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
    fireEvent.change(screen.getByPlaceholderText('ventasDiseno:modal.subClientTaxIdDv'), { target: { value: '81' } })
    fireEvent.click(screen.getByText('common:actions.confirm'))

    expect(await screen.findByText('El RUC ya existe.')).toBeInTheDocument()
    // El mini-form no debe cerrarse ni perder el dato tipeado tras el rechazo del backend.
    expect(screen.getByPlaceholderText('ventasDiseno:modal.subClientTaxId')).toHaveValue('155-1234-1-2026')
    expect(screen.getByPlaceholderText('ventasDiseno:modal.subClientTaxIdDv')).toHaveValue('81')
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

  // ── Quitar archivos del proyecto (PR #6, feature/delete-project-files) ─────────────────────────────

  const archivoDeDiseno = {
    id: 7, type: 'design' as const, file_name: 'plano.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-07-09T00:00:00Z',
  }

  function errorDelServidor(message: string) {
    return Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status: 422, data: { message } } })
  }

  it('el botón de quitar archivo solo aparece en modo edición', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'design', can_edit: true, files: [archivoDeDiseno] }))
    renderModal()
    await screen.findByText('plano.pdf')

    expect(screen.queryByTitle('ventasDiseno:modal.removeFile')).not.toBeInTheDocument()

    await openEditMode()
    expect(await screen.findByTitle('ventasDiseno:modal.removeFile')).toBeInTheDocument()
  })

  it('quita el archivo cuando el usuario confirma', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'design', can_edit: true, files: [archivoDeDiseno] }))
    mockedApi.pipeline.deleteFile.mockResolvedValue(undefined)
    renderModal()
    await openEditMode()

    fireEvent.click(await screen.findByTitle('ventasDiseno:modal.removeFile'))

    await waitFor(() => expect(mockedApi.pipeline.deleteFile).toHaveBeenCalledWith(1, 7))
    expect(confirmar).toHaveBeenCalledWith('ventasDiseno:modal.confirmRemoveFile')
    confirmar.mockRestore()
  })

  it('no quita nada si el usuario cancela la confirmación', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'design', can_edit: true, files: [archivoDeDiseno] }))
    renderModal()
    await openEditMode()

    fireEvent.click(await screen.findByTitle('ventasDiseno:modal.removeFile'))

    expect(mockedApi.pipeline.deleteFile).not.toHaveBeenCalled()
    confirmar.mockRestore()
  })

  it('muestra el motivo que da el servidor cuando no se puede quitar (proyecto Aprobado)', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'design', can_edit: true, files: [archivoDeDiseno] }))
    mockedApi.pipeline.deleteFile.mockRejectedValue(errorDelServidor('No se pueden quitar archivos de diseño de un proyecto Aprobado.'))
    renderModal()
    await openEditMode()

    fireEvent.click(await screen.findByTitle('ventasDiseno:modal.removeFile'))

    expect(await screen.findByText('No se pueden quitar archivos de diseño de un proyecto Aprobado.')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:modal.removeFileError')).not.toBeInTheDocument()
    confirmar.mockRestore()
  })

  it('muestra el mensaje genérico si el error no trae motivo del servidor', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'design', can_edit: true, files: [archivoDeDiseno] }))
    mockedApi.pipeline.deleteFile.mockRejectedValue(new Error('Network Error'))
    renderModal()
    await openEditMode()

    fireEvent.click(await screen.findByTitle('ventasDiseno:modal.removeFile'))

    expect(await screen.findByText('ventasDiseno:modal.removeFileError')).toBeInTheDocument()
    confirmar.mockRestore()
  })

  it('un error anterior de quitar archivo se limpia al reintentar con éxito', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'design', can_edit: true, files: [archivoDeDiseno] }))
    mockedApi.pipeline.deleteFile.mockRejectedValueOnce(errorDelServidor('Motivo del servidor')).mockResolvedValueOnce(undefined)
    renderModal()
    await openEditMode()

    fireEvent.click(await screen.findByTitle('ventasDiseno:modal.removeFile'))
    expect(await screen.findByText('Motivo del servidor')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('ventasDiseno:modal.removeFile'))
    await waitFor(() => expect(screen.queryByText('Motivo del servidor')).not.toBeInTheDocument())
    confirmar.mockRestore()
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

  // SCRUM-829 — uploadFile invalida la queryKey del detalle; el refetch resultante no debe pisar
  // campos editados y aún no guardados (el servidor sigue devolviendo el valor viejo porque nunca
  // se persistió la edición). Antes del fix, el useEffect de seed corría en cada refetch sin
  // chequear isEditing y revertía el campo.
  it('subir un archivo no revierte otros campos editados sin guardar', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'design', can_edit: true }))
    mockedApi.pipeline.uploadFile.mockResolvedValue({
      id: 1, type: 'design', file_name: 'plano.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-07-09T00:00:00Z',
    })
    renderModal()
    await openEditMode()

    fireEvent.change(screen.getByDisplayValue('Proyecto Alfa'), { target: { value: 'Nombre editado sin guardar' } })

    const file = new File(['contenido'], 'plano.pdf', { type: 'application/pdf' })
    const fileInputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(fileInputs[0], { target: { files: [file] } })

    await waitFor(() => expect(mockedApi.pipeline.uploadFile).toHaveBeenCalledWith(1, 'design', file))
    await waitFor(() => expect(mockedApi.pipeline.get).toHaveBeenCalledTimes(2))

    expect(screen.getByDisplayValue('Nombre editado sin guardar')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Proyecto Alfa')).not.toBeInTheDocument()
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

    await screen.findByText('Proyecto Alfa')
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

  // ── SCRUM-849.4 — asignación de Gerencia a uno o varios asignados ───────────

  it('un no-Gerencia ve la lista de TODOS los asignados de solo lectura, nunca el selector', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      assignees: [{ id: 1, name: 'Ana Diaz' }, { id: 2, name: 'Beto Solis' }],
    }))
    renderModal()

    expect(await screen.findByText('Ana Diaz, Beto Solis')).toBeInTheDocument()
    await openEditMode()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('Gerencia puede reasignar a varias personas y el resto queda como compartido_con', async () => {
    mockedStore.mockReturnValue({ user: { id: 9, role: 'management', permissions: ['platform.management'] } } as never)
    mockedApi.home.vendors.mockResolvedValue([
      { id: 1, name: 'Ana Diaz' }, { id: 2, name: 'Beto Solis' }, { id: 3, name: 'Carla Ruiz' },
    ] as never)
    mockedApi.pipeline.update.mockResolvedValue(makeDetail())
    renderModal()
    await openEditMode()

    fireEvent.click(screen.getByRole('button', { name: /userFilter\.count/ }))
    fireEvent.click(screen.getByText('Beto Solis'))
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.pipeline.update).toHaveBeenCalledWith(
      1, expect.objectContaining({ assignee_ids: [1, 2] }),
    ))
  })

  // SCRUM-884 (rebote 2026-09-16) — cuando Gerencia (Gerencia) crea el proyecto, queda como
  // Responsable (owner_id) pero `teamVendors` (lista de vendedores/diseñadores) nunca lo incluye
  // — antes del fix, `UserMultiSelect` solo renderiza como chip removible a quien esté en la
  // lista `users` que recibe, así que Gerencia no aparecía ahí y no había forma de quitarlo, aunque
  // sí se podía con cualquier creador vendedor/diseñador (esos sí están en `teamVendors`).
  it('Gerencia puede quitarse a sí misma del campo Responsable cuando ella creó el proyecto (SCRUM-884)', async () => {
    mockedStore.mockReturnValue({ user: { id: 9, role: 'management', permissions: ['platform.management'] } } as never)
    mockedApi.home.vendors.mockResolvedValue([
      { id: 1, name: 'Ana Diaz' }, { id: 2, name: 'Beto Solis' },
    ] as never)
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      owner: { id: 9, name: 'Gerencia' },
      assignees: [{ id: 9, name: 'Gerencia' }],
    }))
    mockedApi.pipeline.update.mockResolvedValue(makeDetail())
    renderModal()
    await openEditMode()

    // Gerencia aparece como chip removible pese a no estar en teamVendors.
    const markChip = screen.getByText('Gerencia').closest('span') as HTMLElement
    fireEvent.click(within(markChip).getByRole('button'))

    fireEvent.click(screen.getByRole('button', { name: /userFilter\.count|userFilter\.all/ }))
    fireEvent.click(screen.getByText('Beto Solis'))
    fireEvent.click(screen.getByText('common:actions.save'))

    await waitFor(() => expect(mockedApi.pipeline.update).toHaveBeenCalledWith(
      1, expect.objectContaining({ assignee_ids: [2] }),
    ))
  })

  // ── SCRUM-909 — asignar productos a cada fecha de entrega parcial ───────────

  it('no muestra "Asignar productos a entrega" sin Tipo de entrega elegido', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ delivery_type: null }))
    renderModal()
    await screen.findByText('Proyecto Alfa')

    expect(screen.queryByText('ventasDiseno:modal.assignProductsToDelivery')).not.toBeInTheDocument()
  })

  it('no muestra "Asignar productos a entrega" con Entrega Única', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ delivery_type: 'single', delivery_dates: ['2026-09-01'] }))
    renderModal()
    await screen.findByText('Proyecto Alfa')

    expect(screen.queryByText('ventasDiseno:modal.assignProductsToDelivery')).not.toBeInTheDocument()
  })

  it('muestra "Asignar productos a entrega" con Entrega Parcial y abre el modal de asignación al hacer clic', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      stage: 'proposal', delivery_type: 'partial', delivery_dates: ['2026-09-01', '2026-09-15'],
    }))
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      { quote_item_id: 1, catalog_product_id: 1, code: 'P-001', name: 'Producto colgante', quantity_ordered: 10, quantity_available: 10, assigned_delivery_date: null, suggested_delivery_date: null },
    ])
    renderModal()
    await screen.findByText('Proyecto Alfa')

    fireEvent.click(screen.getByText('ventasDiseno:modal.assignProductsToDelivery'))

    expect(await screen.findByText('ventasDiseno:modal.productAssignment.title')).toBeInTheDocument()
    expect(await screen.findByText('P-001')).toBeInTheDocument()
    expect(await screen.findByText('Producto colgante')).toBeInTheDocument()
  })

  it('precarga la fecha más lejana cuando falta inventario, y el usuario puede cambiarla (criterio 3)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      stage: 'proposal', delivery_type: 'partial', delivery_dates: ['2026-09-01', '2026-10-15'],
    }))
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      { quote_item_id: 1, catalog_product_id: 1, code: 'P-001', name: 'Sin stock suficiente', quantity_ordered: 10, quantity_available: 2, assigned_delivery_date: null, suggested_delivery_date: '2026-10-15' },
    ])
    renderModal()
    await screen.findByText('Proyecto Alfa')
    fireEvent.click(screen.getByText('ventasDiseno:modal.assignProductsToDelivery'))
    await screen.findByText('P-001')

    const select = document.querySelector('select') as HTMLSelectElement
    expect(select).toHaveValue('2026-10-15')

    fireEvent.change(select, { target: { value: '2026-09-01' } })
    expect(select).toHaveValue('2026-09-01')
  })

  it('bloquea "Mover a Aprobado" cuando algún producto no tiene fecha asignada (criterio 4, defensa en profundidad)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      stage: 'proposal', can_edit: true,
      delivery_type: 'partial', delivery_dates: ['2026-09-01', '2026-10-15'],
    }))
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      { quote_item_id: 1, catalog_product_id: 1, code: 'P-001', name: 'Producto', quantity_ordered: 5, quantity_available: 5, assigned_delivery_date: null, suggested_delivery_date: null },
    ])
    renderModal()
    await screen.findByText('Proyecto Alfa')

    const moveButton = await screen.findByText('ventasDiseno:modal.moveToNext')
    expect(moveButton.closest('button')).toBeDisabled()
    expect(await screen.findByText('ventasDiseno:modal.deliveryAssignmentIncomplete')).toBeInTheDocument()

    fireEvent.click(moveButton)
    expect(mockedApi.pipeline.changeStage).not.toHaveBeenCalled()
  })

  it('con todos los productos asignados, "Mover a Aprobado" funciona normalmente', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      stage: 'proposal', can_edit: true,
      delivery_type: 'partial', delivery_dates: ['2026-09-01', '2026-10-15'],
    }))
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      { quote_item_id: 1, catalog_product_id: 1, code: 'P-001', name: 'Producto', quantity_ordered: 5, quantity_available: 5, assigned_delivery_date: '2026-09-01', suggested_delivery_date: null },
    ])
    mockedApi.pipeline.changeStage.mockResolvedValue(makeDetail({ stage: 'approved' }))
    renderModal()
    await screen.findByText('Proyecto Alfa')

    const moveButton = await screen.findByText('ventasDiseno:modal.moveToNext')
    await waitFor(() => expect(moveButton.closest('button')).not.toBeDisabled())

    fireEvent.click(moveButton)
    await waitFor(() => expect(mockedApi.pipeline.changeStage).toHaveBeenCalledWith(1, 'approved'))
  })

  it('el auto-avance al subir el comprobante no se dispara si faltan productos por asignar', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      stage: 'proposal', can_edit: true,
      delivery_type: 'partial', delivery_dates: ['2026-09-01', '2026-10-15'],
    }))
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      { quote_item_id: 1, catalog_product_id: 1, code: 'P-001', name: 'Producto', quantity_ordered: 5, quantity_available: 5, assigned_delivery_date: null, suggested_delivery_date: null },
    ])
    mockedApi.pipeline.uploadFile.mockResolvedValue({
      id: 1, type: 'approval_proof', file_name: 'comprobante.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-07-09T00:00:00Z',
    })
    renderModal()
    await openEditMode()
    await screen.findByText('ventasDiseno:modal.deliveryAssignmentIncomplete')

    const file = new File(['contenido'], 'comprobante.pdf', { type: 'application/pdf' })
    const fileInputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(fileInputs[2], { target: { files: [file] } })

    await waitFor(() => expect(mockedApi.pipeline.uploadFile).toHaveBeenCalled())
    expect(mockedApi.pipeline.changeStage).not.toHaveBeenCalled()
    // Aparece 2 veces: el aviso proactivo (siempre visible con la asignación incompleta) y el
    // banner de stageError que este flujo setea al saltarse el auto-avance.
    await waitFor(() => expect(screen.getAllByText('ventasDiseno:modal.deliveryAssignmentIncomplete').length).toBeGreaterThanOrEqual(2))
  })

  // SCRUM-909 (rebote 2026-09-14, parte 2) — antes el modal recibía siempre `card.delivery_dates`
  // (el valor YA GUARDADO), nunca el borrador sin guardar del formulario. Definir las fechas
  // parciales en modo edición y abrir el modal sin guardar antes no mostraba ninguna fecha para
  // elegir — solo funcionaba después de Guardar y reabrir.
  it('el modal de asignación muestra las fechas recién definidas en edición, sin necesidad de guardar antes (SCRUM-909)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'proposal', can_edit: true }))
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      { quote_item_id: 1, catalog_product_id: 1, code: 'P-001', name: 'Producto', quantity_ordered: 5, quantity_available: 5, assigned_delivery_date: null, suggested_delivery_date: null },
    ])
    renderModal()
    await openEditMode()

    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[1], { target: { value: 'partial' } })
    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[0], { target: { value: '2026-09-01' } })
    fireEvent.change(dateInputs[1], { target: { value: '2026-09-15' } })

    // Sin Guardar todavía — abre el modal de asignación con el borrador sin persistir.
    fireEvent.click(screen.getByText('ventasDiseno:modal.assignProductsToDelivery'))
    await screen.findByText('P-001')

    const assignmentSelect = document.querySelectorAll('select')[document.querySelectorAll('select').length - 1] as HTMLSelectElement
    const optionValues = Array.from(assignmentSelect.options).map(o => o.value)
    expect(optionValues).toEqual(expect.arrayContaining(['2026-09-01', '2026-09-15']))
  })

  // SCRUM-1027 — dentro de la edición las fechas parciales aún no existen en BD, así que el modal
  // de asignación no puede llamar al endpoint propio (respondía "Solo se pueden asignar fechas por
  // producto en tarjetas con entrega Parcial."): devuelve la selección al formulario y viaja en
  // el mismo guardado del proyecto.
  it('en edición, asignar productos no llama a la API propia y se guarda junto con el proyecto (SCRUM-1027)', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'proposal', can_edit: true }))
    mockedApi.pipeline.update.mockResolvedValue(makeDetail({ stage: 'proposal', can_edit: true }))
    mockedApi.pipeline.productDeliveryAssignments.list.mockResolvedValue([
      { quote_item_id: 7, catalog_product_id: 1, code: 'P-007', name: 'Producto', quantity_ordered: 5, quantity_available: 5, assigned_delivery_date: null, suggested_delivery_date: null },
    ])
    renderModal()
    await openEditMode()

    fireEvent.change(document.querySelectorAll('select')[1], { target: { value: 'partial' } })
    const dateInputs = document.querySelectorAll('input[type="date"]')
    fireEvent.change(dateInputs[0], { target: { value: '2026-09-01' } })
    fireEvent.change(dateInputs[1], { target: { value: '2026-09-15' } })

    fireEvent.click(screen.getByText('ventasDiseno:modal.assignProductsToDelivery'))
    await screen.findByText('P-007')
    // Las fechas sin guardar viajan para calcular la sugerencia.
    expect(mockedApi.pipeline.productDeliveryAssignments.list).toHaveBeenCalledWith(1, ['2026-09-01', '2026-09-15'])

    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[selects.length - 1], { target: { value: '2026-09-15' } })
    // "Guardar" del modal (el último botón con ese texto) — no debe tocar la API de asignaciones.
    const saveButtons = screen.getAllByText('common:actions.save')
    fireEvent.click(saveButtons[saveButtons.length - 1])
    expect(mockedApi.pipeline.productDeliveryAssignments.save).not.toHaveBeenCalled()

    // Guardado del proyecto: lleva fechas + asignaciones en una sola llamada.
    fireEvent.click(screen.getByText('common:actions.save'))
    await waitFor(() => expect(mockedApi.pipeline.update).toHaveBeenCalledWith(1, expect.objectContaining({
      delivery_type: 'partial',
      delivery_dates: ['2026-09-01', '2026-09-15'],
      product_deliveries: [{ quote_item_id: 7, delivery_date: '2026-09-15' }],
    })))
  })
})

// SCRUM-1115 — un proyecto restaurado desde Perdido vuelve a Lead/Diseño con su historial de cotizaciones: "Crear cotización" ofrece
// partir de la última confirmada (nueva versión) o empezar en blanco. Sin historial, el flujo es el de siempre.
describe('PipelineCardModal — SCRUM-1115 crear cotización con historial', () => {
  const diseno = { id: 7, type: 'design' as const, file_name: 'plano.pdf', size_bytes: 100, mime_type: 'application/pdf', created_at: '2026-07-09T00:00:00Z' }
  const listaParaCotizar = { stage: 'design' as const, worked_area_m2: 120, files: [diseno] }

  it('A7 — sin cotización confirmada previa no hay diálogo: va directo al formulario en blanco', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ ...listaParaCotizar, latest_quote_id: null }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuote'))

    expect(screen.queryByTestId('quote-base-dialog')).not.toBeInTheDocument()
    expect(mockNavigate).toHaveBeenCalledWith('/ventas-diseno/quotes?fromPipelineCard=1')
  })

  it('A6 — con cotización confirmada previa muestra el diálogo con su folio y no navega todavía', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ ...listaParaCotizar, latest_quote_id: 9, latest_quote_folio: 'COT-2026-0003' }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuote'))

    const dialogo = await screen.findByTestId('quote-base-dialog')
    expect(dialogo).toHaveTextContent('createQuoteFromBase')
    expect(dialogo).toHaveTextContent('createQuoteBlank')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('A6 — "En blanco" abre el formulario de siempre', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ ...listaParaCotizar, latest_quote_id: 9, latest_quote_folio: 'COT-2026-0003' }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuote'))
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuoteBlank'))

    expect(mockNavigate).toHaveBeenCalledWith('/ventas-diseno/quotes?fromPipelineCard=1')
    expect(mockedApi.quotes.duplicate).not.toHaveBeenCalled()
  })

  it('A6 — "Partir de COT-xxxx" duplica la última confirmada y abre el borrador precargado', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ ...listaParaCotizar, latest_quote_id: 9, latest_quote_folio: 'COT-2026-0003' }))
    mockedApi.quotes.duplicate.mockResolvedValue({ id: 77 } as never)
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuote'))
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuoteFromBase'))

    await waitFor(() => expect(mockedApi.quotes.duplicate).toHaveBeenCalledWith(9))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/ventas-diseno/quotes/77'))
  })

  it('si el backend rechaza la nueva versión muestra su mensaje y deja el diálogo abierto', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ ...listaParaCotizar, latest_quote_id: 9, latest_quote_folio: 'COT-2026-0003' }))
    mockedApi.quotes.duplicate.mockRejectedValue(Object.assign(new Error('x'), {
      isAxiosError: true, response: { status: 422, data: { message: 'Este proyecto ya avanzó más allá de Cotización' } },
    }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuote'))
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuoteFromBase'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Este proyecto ya avanzó más allá de Cotización')
    expect(screen.getByTestId('quote-base-dialog')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('M-1 — si la cotización es de otro vendedor (403) explica por qué y deja "En blanco" disponible', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ ...listaParaCotizar, latest_quote_id: 9, latest_quote_folio: 'COT-2026-0003' }))
    mockedApi.quotes.duplicate.mockRejectedValue(Object.assign(new Error('x'), {
      isAxiosError: true, response: { status: 403, data: { message: 'Unauthorized' } },
    }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuote'))
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuoteFromBase'))

    expect(await screen.findByRole('alert')).toHaveTextContent('createQuoteBaseForbidden')
    fireEvent.click(screen.getByText('ventasDiseno:modal.createQuoteBlank'))
    expect(mockNavigate).toHaveBeenCalledWith('/ventas-diseno/quotes?fromPipelineCard=1')
  })

  it('A9 — las validaciones previas siguen aplicando: sin superficie no se abre el diálogo', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'design', worked_area_m2: null, files: [diseno], latest_quote_id: 9, latest_quote_folio: 'COT-2026-0003' }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuote'))

    expect(await screen.findByText('ventasDiseno:modal.createQuoteMissingArea')).toBeInTheDocument()
    expect(screen.queryByTestId('quote-base-dialog')).not.toBeInTheDocument()
  })

  it('A3 — en Lead con contacto y clientes también ofrece partir de la cotización existente', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      stage: 'lead', latest_quote_id: 9, latest_quote_folio: 'COT-2026-0003',
      contacts: [{ id: 9, name: 'Arq. Pérez', role: 'architect', phone: null, email: 'arq@test.com' }],
    }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.createQuote'))

    expect(await screen.findByTestId('quote-base-dialog')).toBeInTheDocument()
  })


  // SCRUM-1121 (corrección de Gerencia) — la sección «Asociados» se eliminó: los contactos de la cotización llegan al campo «Contacto».
  it('SCRUM-1121 — el detalle del proyecto no muestra la sección «Asociados» y conserva «Contacto»', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      contacts: [{ id: 5, name: 'Ana Cliente', role: 'client', phone: '6111-1111', email: 'ana@cliente.test' }],
    }))
    renderModal()
    await screen.findByText('Proyecto Alfa')

    expect(screen.queryByTestId('associates-search')).not.toBeInTheDocument()
    expect(screen.queryByTestId('associates-section')).not.toBeInTheDocument()
    expect(screen.getByText('Ana Cliente')).toBeInTheDocument()
  })
})


// SCRUM-1128 — aprobación previa "Pasar a Pedido".
describe('PipelineCardModal — Pasar a Pedido (SCRUM-1128)', () => {
  const approved = (o: Partial<PipelineCardDetail> = {}) =>
    makeDetail({ stage: 'approved', can_edit: false, order_status: 'pending', can_pass_to_order: true, latest_quote_id: 7, latest_quote_folio: 'COT-0007', ...o })
  const asUser = (permissions: string[]) =>
    mockedStore.mockReturnValue({ user: { id: 5, role: 'gerencia', permissions } } as never)

  it('muestra el botón con el permiso y proyecto aprobado pendiente, a la izquierda de Cerrar', async () => {
    asUser(['ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved())
    renderModal()
    const btn = await screen.findByText('ventasDiseno:modal.passToOrder.button')
    const close = screen.getByText('common:actions.close')
    expect(btn.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('no muestra el botón sin el permiso (Vendedor/Diseñador)', async () => {
    asUser([])
    mockedApi.pipeline.get.mockResolvedValue(approved())
    renderModal()
    await screen.findByText('Proyecto Alfa')
    expect(screen.queryByText('ventasDiseno:modal.passToOrder.button')).not.toBeInTheDocument()
  })

  it('no muestra el botón si el paso a pedido ya se hizo, y muestra quién y cuándo', async () => {
    asUser(['ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved({
      order_status: 'approved', order_approved_by: { id: 3, name: 'Contabilidad Test' }, order_approved_at: '2026-10-08T15:30:00Z',
    }))
    renderModal()
    expect(await screen.findByText('Contabilidad Test')).toBeInTheDocument()
    expect(screen.getByTestId('pass-to-order-info')).toHaveTextContent('ventasDiseno:modal.passToOrder.approvedAt')
    expect(screen.queryByText('ventasDiseno:modal.passToOrder.button')).not.toBeInTheDocument()
  })

  it('Cancelar cierra el diálogo sin llamar al backend', async () => {
    asUser(['ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved())
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.passToOrder.button'))
    const dialog = await screen.findByTestId('pass-to-order-dialog')
    expect(dialog).toHaveTextContent('ventasDiseno:modal.passToOrder.confirmMessage')
    fireEvent.click(within(dialog).getByText('common:actions.cancel'))
    expect(screen.queryByTestId('pass-to-order-dialog')).not.toBeInTheDocument()
    expect(mockedApi.pipeline.passToOrder).not.toHaveBeenCalled()
  })

  it('Aprobar llama una sola vez aunque se haga clic repetido, y luego pregunta por el abono', async () => {
    asUser(['ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved())
    let resolve!: (v: PipelineCardDetail) => void
    mockedApi.pipeline.passToOrder.mockReturnValue(new Promise<PipelineCardDetail>(r => { resolve = r }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.passToOrder.button'))
    const dialog = await screen.findByTestId('pass-to-order-dialog')
    const approve = within(dialog).getByText('ventasDiseno:modal.passToOrder.approve')
    fireEvent.click(approve)
    fireEvent.click(approve)
    await waitFor(() => expect(mockedApi.pipeline.passToOrder).toHaveBeenCalled())
    expect(mockedApi.pipeline.passToOrder).toHaveBeenCalledTimes(1)
    resolve(approved({ order_status: 'approved' }))
    expect(await screen.findByTestId('abono-ask-dialog')).toHaveTextContent('ventasDiseno:modal.passToOrder.abonoQuestion')
  })

  it('"No registrar aún" cierra sin navegar; "Registrar abono" navega con el proyecto precargado', async () => {
    asUser(['ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved())
    mockedApi.pipeline.passToOrder.mockResolvedValue(approved({ order_status: 'approved' }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.passToOrder.button'))
    fireEvent.click(within(await screen.findByTestId('pass-to-order-dialog')).getByText('ventasDiseno:modal.passToOrder.approve'))
    const ask = await screen.findByTestId('abono-ask-dialog')
    fireEvent.click(within(ask).getByText('ventasDiseno:modal.passToOrder.abonoLater'))
    expect(screen.queryByTestId('abono-ask-dialog')).not.toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('Registrar abono redirige a Abonos con Cliente Master, Subcliente, Proyecto y Cotización', async () => {
    asUser(['ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved())
    mockedApi.pipeline.passToOrder.mockResolvedValue(approved({ order_status: 'approved' }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.passToOrder.button'))
    fireEvent.click(within(await screen.findByTestId('pass-to-order-dialog')).getByText('ventasDiseno:modal.passToOrder.approve'))
    fireEvent.click(within(await screen.findByTestId('abono-ask-dialog')).getByText('ventasDiseno:modal.passToOrder.abonoRegister'))
    expect(mockNavigate).toHaveBeenCalledWith('/admin-contab/abonos', {
      state: { abonoPrefill: {
        masterClientId: 1, masterClientName: 'Grupo Delta', subClientId: 1,
        salesProjectId: 1, projectName: 'Proyecto Alfa', quoteId: 7, quoteFolio: 'COT-0007',
      } },
    })
  })

  it('muestra el error del backend en el diálogo y no pregunta por el abono', async () => {
    asUser(['ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved())
    mockedApi.pipeline.passToOrder.mockRejectedValue(new Error('boom'))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.passToOrder.button'))
    fireEvent.click(within(await screen.findByTestId('pass-to-order-dialog')).getByText('ventasDiseno:modal.passToOrder.approve'))
    expect(await screen.findByRole('alert')).toHaveTextContent('ventasDiseno:modal.passToOrder.error')
    expect(screen.queryByTestId('abono-ask-dialog')).not.toBeInTheDocument()
  })
  it('no muestra el botón si el backend dice can_pass_to_order=false aunque haya permiso (Contabilidad sin permiso efectivo)', async () => {
    asUser(['ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved({ can_pass_to_order: false }))
    renderModal()
    await screen.findByText('Proyecto Alfa')
    expect(screen.queryByText('ventasDiseno:modal.passToOrder.button')).not.toBeInTheDocument()
  })

  it('Contabilidad (read_all + pass_to_order, can_edit=false): ve el botón y ningún control de edición', async () => {
    asUser(['ventas_diseno.pipeline.read_all', 'ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved())
    renderModal()
    expect(await screen.findByText('ventasDiseno:modal.passToOrder.button')).toBeInTheDocument()
    expect(screen.queryByText('common:actions.edit')).not.toBeInTheDocument()
  })

  it('409 (ya pasó a pedido): no muestra error, cierra el diálogo, refresca y no pregunta por el abono', async () => {
    asUser(['ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved())
    mockedApi.pipeline.passToOrder.mockRejectedValue(Object.assign(new Error('conflict'), {
      isAxiosError: true,
      response: { status: 409, data: { message: 'Ya pasó a pedido', data: approved({
        order_status: 'approved', can_pass_to_order: false,
        order_approved_by: { id: 3, name: 'Contabilidad Test' }, order_approved_at: '2026-10-08T15:30:00Z',
      }) } },
    }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.passToOrder.button'))
    fireEvent.click(within(await screen.findByTestId('pass-to-order-dialog')).getByText('ventasDiseno:modal.passToOrder.approve'))
    expect(await screen.findByTestId('pass-to-order-info')).toHaveTextContent('Contabilidad Test')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pass-to-order-dialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('abono-ask-dialog')).not.toBeInTheDocument()
  })

  it('403 y 422 sin mensaje del backend muestran un texto claro', async () => {
    asUser(['ventas_diseno.pass_to_order'])
    mockedApi.pipeline.get.mockResolvedValue(approved())
    mockedApi.pipeline.passToOrder.mockRejectedValue(Object.assign(new Error('forbidden'), {
      isAxiosError: true, response: { status: 403, data: {} },
    }))
    renderModal()
    fireEvent.click(await screen.findByText('ventasDiseno:modal.passToOrder.button'))
    fireEvent.click(within(await screen.findByTestId('pass-to-order-dialog')).getByText('ventasDiseno:modal.passToOrder.approve'))
    expect(await screen.findByRole('alert')).toHaveTextContent('ventasDiseno:modal.passToOrder.errorForbidden')
  })
})

// SCRUM-1128 (Pre-QA) — Contabilidad: solo lectura del Pipeline, aunque el payload diga can_edit=true.
describe('PipelineCardModal — solo lectura de Contabilidad (SCRUM-1128)', () => {
  const asFelix = () =>
    mockedStore.mockReturnValue({
      user: { id: 9, role: 'contabilidad', permissions: ['ventas_diseno.pipeline.read_all', 'ventas_diseno.pass_to_order'] },
    } as never)

  it('no muestra controles de escritura ni "Ver cotizaciones" aunque can_edit sea true', async () => {
    asFelix()
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'proposal', can_edit: true, latest_quote_id: 7 }))
    renderModal()
    await screen.findByText('Proyecto Alfa')
    expect(screen.queryByText('common:actions.edit')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:modal.markAsLost')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:modal.viewProjectQuotes')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:modal.createQuote')).not.toBeInTheDocument()
  })

  it('no muestra Reactivar en una tarjeta Perdida (can_edit es false en Perdido para todos, no sirve de gate)', async () => {
    asFelix()
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'lost', can_edit: false }))
    renderModal()
    await screen.findByText('Proyecto Alfa')
    expect(screen.queryByText('ventasDiseno:modal.reactivate')).not.toBeInTheDocument()
  })

  it('no muestra "Asignar productos a entrega" con entrega parcial ni pide las asignaciones', async () => {
    asFelix()
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'proposal', can_edit: false, delivery_type: 'partial' }))
    renderModal()
    await screen.findByText('Proyecto Alfa')
    expect(screen.queryByText('ventasDiseno:modal.assignProductsToDelivery')).not.toBeInTheDocument()
    expect(mockedApi.pipeline.productDeliveryAssignments.list).not.toHaveBeenCalled()
  })

  it('no muestra el banner "no editable (Aprobado)" en etapas activas: no es la causa de que no pueda editar', async () => {
    asFelix()
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: false }))
    renderModal()
    await screen.findByText('Proyecto Alfa')
    expect(screen.queryByText('ventasDiseno:modal.notEditableApproved')).not.toBeInTheDocument()
  })

  it('el resto de roles sí conserva Reactivar y "Asignar productos a entrega"', async () => {
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'lost', can_edit: false }))
    const { unmount } = renderModal()
    expect(await screen.findByText('ventasDiseno:modal.reactivate')).toBeInTheDocument()
    unmount()
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'quote', can_edit: true, delivery_type: 'partial' }))
    renderModal()
    expect(await screen.findByText('ventasDiseno:modal.assignProductsToDelivery')).toBeInTheDocument()
  })

  it('conserva Pasar a Pedido en una tarjeta aprobada pendiente', async () => {
    asFelix()
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      stage: 'approved', can_edit: false, order_status: 'pending', can_pass_to_order: true, latest_quote_id: 7,
    }))
    renderModal()
    expect(await screen.findByText('ventasDiseno:modal.passToOrder.button')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:modal.viewProjectQuotes')).not.toBeInTheDocument()
  })

  it('Escape sobre la confirmación de Pasar a Pedido la cierra sin cerrar el modal ni llamar al backend', async () => {
    asFelix()
    const onClose = vi.fn()
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({
      stage: 'approved', can_edit: false, order_status: 'pending', can_pass_to_order: true,
    }))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <PipelineCardModal cardId={1} onClose={onClose} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByText('ventasDiseno:modal.passToOrder.button'))
    await screen.findByTestId('pass-to-order-dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('pass-to-order-dialog')).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    expect(mockedApi.pipeline.passToOrder).not.toHaveBeenCalled()
  })
})

// SCRUM-1139 — Contabilidad con `pipeline.edit`: edita el Pipeline, pero sigue sin ventas_diseno.read (no abre cotizaciones).
describe('PipelineCardModal — Contabilidad con edición del Pipeline (SCRUM-1139)', () => {
  const asFelixEditor = () =>
    mockedStore.mockReturnValue({
      user: { id: 9, role: 'lider_admin_contab', permissions: ['ventas_diseno.pipeline.read_all', 'ventas_diseno.pipeline.edit', 'ventas_diseno.pass_to_order'] },
    } as never)

  it('con can_edit=true ve Editar y Marcar como Perdido, pero no Crear cotización ni Ver cotizaciones', async () => {
    asFelixEditor()
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'lead', can_edit: true, latest_quote_id: 7 }))
    renderModal()
    await screen.findByText('Proyecto Alfa')
    expect(screen.getByText('common:actions.edit')).toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:modal.markAsLost')).toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:modal.createQuote')).not.toBeInTheDocument()
    expect(screen.queryByText('ventasDiseno:modal.viewProjectQuotes')).not.toBeInTheDocument()
  })

  it('respeta can_edit=false del backend (Aprobado): sin Editar y con el aviso de no editable', async () => {
    asFelixEditor()
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'approved', can_edit: false }))
    renderModal()
    await screen.findByText('Proyecto Alfa')
    expect(screen.queryByText('common:actions.edit')).not.toBeInTheDocument()
    expect(screen.getByText('ventasDiseno:modal.notEditableApproved')).toBeInTheDocument()
  })

  it('en una tarjeta Perdida ofrece Reactivar (es un cambio de etapa del propio Pipeline)', async () => {
    asFelixEditor()
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'lost', can_edit: false }))
    renderModal()
    await screen.findByText('Proyecto Alfa')
    expect(screen.getByText('ventasDiseno:modal.reactivate')).toBeInTheDocument()
  })

  it('solo con read_all (sin pipeline.edit) sigue en solo lectura aunque can_edit sea true', async () => {
    mockedStore.mockReturnValue({ user: { id: 9, role: 'lider_admin_contab', permissions: ['ventas_diseno.pipeline.read_all'] } } as never)
    mockedApi.pipeline.get.mockResolvedValue(makeDetail({ stage: 'proposal', can_edit: true }))
    renderModal()
    await screen.findByText('Proyecto Alfa')
    expect(screen.queryByText('common:actions.edit')).not.toBeInTheDocument()
  })
})
