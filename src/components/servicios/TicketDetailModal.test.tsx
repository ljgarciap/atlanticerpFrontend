import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TicketDetailModal from './TicketDetailModal'
import { serviciosApi } from '@/api/serviciosApi'
import { useToastStore } from '@/store/toastStore'
import type { TicketDetail } from '@/types/servicios'

const LABELS: Record<string, string> = {
  'tickets.detail.title': 'Ticket {{numero}}',
  'tickets.detail.productQty': 'Cantidad: {{qty}}',
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let out = LABELS[key] ?? key
      if (options) for (const [k, v] of Object.entries(options)) out = out.replace(`{{${k}}}`, String(v))
      return out
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/serviciosApi', () => ({
  serviciosApi: {
    tickets: {
      get: vi.fn(), update: vi.fn(), cancel: vi.fn(), downloadPdf: vi.fn(), attachmentUrl: vi.fn(),
      addProduct: vi.fn(), updateProductQuantity: vi.fn(), removeProduct: vi.fn(), uploadAttachment: vi.fn(),
    },
    technicians: { internalOptions: vi.fn() },
    lookup: { products: vi.fn() },
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

function makeDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: 1, numero: 'INS-2026-0001', tipo: 'installation', subtipo: 'installation',
    tipo_instalacion: 'internal', cliente_master: 'Torre Business Park', subcliente: 'Torre Business Park',
    email: null, sales_project_id: null, proyecto: null, contacto: null, telefono: null, direccion: null,
    scheduled_at: null, scheduled_ends_at: null, requerimientos_especiales: { catalog: [], otros: [] },
    productos: [], inspection_report_status: 'not_applicable', quote_status: 'not_applicable',
    observaciones: null, adjuntos: [], estado: 'reported', cancellation_reason: null, internal_technician: null,
    reschedule_history: [],
    created_at: '2026-08-01T10:00:00Z',
    ...overrides,
  }
}

function renderModal(props: Partial<React.ComponentProps<typeof TicketDetailModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TicketDetailModal ticketId={1} canEdit={false} onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.technicians.internalOptions.mockResolvedValue([])
  mockedApi.tickets.downloadPdf.mockResolvedValue(undefined)
  mockToast()
})

// REQ-224 — modal de detalle.
describe('TicketDetailModal — vista', () => {
  it('colapsa Cliente Master/Subcliente a un solo campo "Cliente" cuando son iguales', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ cliente_master: 'Torre Azul', subcliente: 'Torre Azul' }))
    renderModal()

    await waitFor(() => expect(screen.getByText('Ticket INS-2026-0001')).toBeInTheDocument())
    expect(screen.getByText('tickets.detail.fields.cliente')).toBeInTheDocument()
    expect(screen.queryByText('tickets.detail.fields.clienteMaster')).not.toBeInTheDocument()
  })

  it('muestra Cliente Master y Subcliente por separado cuando difieren', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({
      cliente_master: 'Inmobiliaria Pacífico', subcliente: 'Inversiones Pacífico Norte SA',
    }))
    renderModal()

    await waitFor(() => expect(screen.getByText('Inmobiliaria Pacífico')).toBeInTheDocument())
    expect(screen.getByText('Inversiones Pacífico Norte SA')).toBeInTheDocument()
    expect(screen.queryByText('tickets.detail.fields.cliente')).not.toBeInTheDocument()
  })

  it('muestra "no aplica" cuando no hay productos asociados', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ productos: [] }))
    renderModal()

    await waitFor(() => expect(screen.getByText('tickets.detail.fields.productosNotApplicable')).toBeInTheDocument())
  })

  it('el botón Editar no aparece si canEdit=false (RN1 — solo lider_servicios/superadmin)', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail())
    renderModal({ canEdit: false })

    await waitFor(() => expect(screen.getByText('Ticket INS-2026-0001')).toBeInTheDocument())
    expect(screen.queryByText('tickets.detail.edit')).not.toBeInTheDocument()
  })

  // REQ-214 RN3/RN4 (Grupo C — modal "Ver ticket" desde Inicio) — `canSchedule` desacopla
  // Agendar/Reagendar de `canEdit`: el modal de solo lectura de Inicio pasa canEdit=false pero
  // puede seguir mostrando Agendar/Reagendar según el rol real del usuario.
  it('con canEdit=false y canSchedule=true muestra Agendar pero no Editar/Cancelar', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ estado: 'reported', scheduled_at: null }))
    renderModal({ canEdit: false, canSchedule: true })

    await waitFor(() => expect(screen.getByText('Ticket INS-2026-0001')).toBeInTheDocument())
    expect(screen.getByText('tickets.actions.schedule')).toBeInTheDocument()
    expect(screen.queryByText('tickets.detail.edit')).not.toBeInTheDocument()
    expect(screen.queryByText('tickets.actions.cancelTicket')).not.toBeInTheDocument()
  })

  it('sin canSchedule, Agendar sigue el comportamiento de canEdit (default = canEdit)', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ estado: 'reported', scheduled_at: null }))
    renderModal({ canEdit: false })

    await waitFor(() => expect(screen.getByText('Ticket INS-2026-0001')).toBeInTheDocument())
    expect(screen.queryByText('tickets.actions.schedule')).not.toBeInTheDocument()
  })

  it('muestra observaciones y el texto vacío cuando no hay adjuntos', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ observaciones: 'Llevar escalera', adjuntos: [] }))
    renderModal()

    await waitFor(() => expect(screen.getByText('Llevar escalera')).toBeInTheDocument())
    expect(screen.getByText('tickets.detail.fields.adjuntosEmpty')).toBeInTheDocument()
  })
})

// REQ-248 — Observaciones/Adjuntos en el detalle.
describe('TicketDetailModal — adjuntos (REQ-248)', () => {
  it('lista cada adjunto por nombre y abre la URL firmada al hacer clic', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({
      adjuntos: [
        { id: 9, nombre_archivo: 'foto-referencia.jpg', size_bytes: 100, mime_type: 'image/jpeg', created_at: '2026-08-01T10:00:00Z' },
      ],
    }))
    mockedApi.tickets.attachmentUrl.mockResolvedValue({ url: 'https://s3-private.test/foto-referencia.jpg', filename: 'foto-referencia.jpg' })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderModal()

    const link = await screen.findByText('foto-referencia.jpg')
    fireEvent.click(link)

    await waitFor(() => expect(mockedApi.tickets.attachmentUrl).toHaveBeenCalledWith(9))
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://s3-private.test/foto-referencia.jpg', '_blank', 'noopener,noreferrer'))

    openSpy.mockRestore()
  })

  it('avisa por toast si no se puede abrir el adjunto', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({
      adjuntos: [{ id: 9, nombre_archivo: 'foto.jpg', size_bytes: 100, mime_type: 'image/jpeg', created_at: '' }],
    }))
    mockedApi.tickets.attachmentUrl.mockRejectedValue(new Error('network error'))
    const showSpy = mockToast()

    renderModal()

    fireEvent.click(await screen.findByText('foto.jpg'))

    await waitFor(() => expect(showSpy).toHaveBeenCalledWith('tickets.detail.attachmentUrlError', 'error'))
  })
})

describe('TicketDetailModal — edición (REQ-225)', () => {
  it('Editar precarga el formulario con los valores actuales y Cancelar descarta sin guardar', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ tipo: 'installation', subtipo: 'installation' }))
    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.detail.edit'))

    const tipoSelect = await screen.findByDisplayValue('tickets.types.installation')
    expect(tipoSelect).toBeInTheDocument()

    fireEvent.click(screen.getByText('tickets.detail.cancel'))
    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    expect(mockedApi.tickets.update).not.toHaveBeenCalled()
  })

  it('Guardar cambios llama a update() y avisa si el técnico quedó desasignado (RN5)', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ tipo: 'installation', subtipo: 'installation' }))
    mockedApi.tickets.update.mockResolvedValue({
      ...makeDetail({ tipo: 'warranty', subtipo: 'warranty_generic', internal_technician: null }),
      technician_unassigned: true,
    })
    const showSpy = mockToast()

    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.detail.edit'))
    await screen.findByDisplayValue('tickets.types.installation')

    fireEvent.click(screen.getByText('tickets.detail.save'))

    await waitFor(() => expect(mockedApi.tickets.update).toHaveBeenCalledWith(1, expect.objectContaining({
      tipo: 'installation', tipo_instalacion: 'internal', requerimientos_especiales: { catalog: [], otros: [] },
    })))
    await waitFor(() => expect(showSpy).toHaveBeenCalledWith('tickets.detail.technicianUnassignedWarning', 'error'))
  })

  // SCRUM-781 (rebote Daniela 2026-08-20) — productos/adjuntos en modo edición son un borrador
  // local: ningún endpoint se llama hasta "Guardar cambios", y "Cancelar" nunca los llama.
  it('agrega un producto vía el buscador — queda en el borrador, no llama a addProduct() hasta Guardar', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail())
    mockedApi.lookup.products.mockResolvedValue([
      { id: 55, reference: 'PUB-55', name: 'Regleta eléctrica', description: '', brand: null, price_full: 12.5 },
    ])
    mockedApi.tickets.update.mockResolvedValue({ ...makeDetail(), technician_unassigned: false })
    mockedApi.tickets.addProduct.mockResolvedValue(makeDetail())
    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.detail.edit'))
    await screen.findByDisplayValue('tickets.types.installation')

    fireEvent.click(screen.getByText('tickets.detail.addProduct'))
    fireEvent.click(await screen.findByText('PUB-55 — Regleta eléctrica'))

    // Visible en el borrador ya mismo...
    await screen.findByText(/Regleta eléctrica/)
    // ...pero todavía no persistido.
    expect(mockedApi.tickets.addProduct).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('tickets.detail.save'))
    await waitFor(() => expect(mockedApi.tickets.addProduct).toHaveBeenCalledWith(1, { catalog_product_id: 55, cantidad_reclamo: 1 }))
  })

  // SCRUM-781 (punto 4.2, REQ-247) — el buscador de productos al editar filtra por el proyecto
  // real del ticket (solo entregados a ese proyecto, ver ProductLookupController::index()).
  it('el buscador de productos pasa sales_project_id del ticket al buscar', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ sales_project_id: 100 }))
    mockedApi.lookup.products.mockResolvedValue([])
    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.detail.edit'))
    await screen.findByDisplayValue('tickets.types.installation')

    fireEvent.click(screen.getByText('tickets.detail.addProduct'))

    await waitFor(() => expect(mockedApi.lookup.products).toHaveBeenCalledWith('', [], 100))
  })

  it('edita la cantidad de un producto — no llama a updateProductQuantity hasta Guardar', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({
      productos: [{ id: 9, catalog_product_id: 55, marca: null, referencia: 'PUB-55', descripcion: 'Regleta eléctrica', cantidad_reclamada: 2, cantidad_recibida: 0, cantidad_pendiente: 2 }],
    }))
    mockedApi.tickets.update.mockResolvedValue({ ...makeDetail(), technician_unassigned: false })
    mockedApi.tickets.updateProductQuantity.mockResolvedValue(makeDetail())
    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.detail.edit'))
    await screen.findByDisplayValue('tickets.types.installation')

    fireEvent.click(await screen.findByText('Cantidad: 2'))
    const qtyInput = screen.getByDisplayValue('2')
    fireEvent.change(qtyInput, { target: { value: '5' } })
    fireEvent.blur(qtyInput)

    await screen.findByText('Cantidad: 5')
    expect(mockedApi.tickets.updateProductQuantity).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('tickets.detail.save'))
    await waitFor(() => expect(mockedApi.tickets.updateProductQuantity).toHaveBeenCalledWith(1, 9, 5))
  })

  it('un producto con recepción registrada queda de solo lectura — sin cantidad clickeable ni botón de quitar', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({
      productos: [{ id: 9, catalog_product_id: 55, marca: null, referencia: 'PUB-55', descripcion: 'Regleta eléctrica', cantidad_reclamada: 5, cantidad_recibida: 2, cantidad_pendiente: 3 }],
    }))
    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.detail.edit'))
    await screen.findByDisplayValue('tickets.types.installation')

    const qty = await screen.findByText('Cantidad: 5')
    expect(qty.tagName).not.toBe('BUTTON')
    expect(screen.queryByLabelText('tickets.detail.removeProduct')).not.toBeInTheDocument()
  })

  it('quita un producto — no llama a removeProduct hasta Guardar', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({
      productos: [{ id: 9, catalog_product_id: 55, marca: null, referencia: 'PUB-55', descripcion: 'Regleta eléctrica', cantidad_reclamada: 2, cantidad_recibida: 0, cantidad_pendiente: 2 }],
    }))
    mockedApi.tickets.update.mockResolvedValue({ ...makeDetail(), technician_unassigned: false })
    mockedApi.tickets.removeProduct.mockResolvedValue(makeDetail())
    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.detail.edit'))
    await screen.findByDisplayValue('tickets.types.installation')

    fireEvent.click(await screen.findByLabelText('tickets.detail.removeProduct'))
    // La fila desaparece de inmediato del borrador visual...
    expect(screen.queryByText(/Regleta eléctrica/)).not.toBeInTheDocument()
    // ...pero el endpoint todavía no se llamó.
    expect(mockedApi.tickets.removeProduct).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('tickets.detail.save'))
    await waitFor(() => expect(mockedApi.tickets.removeProduct).toHaveBeenCalledWith(1, 9))
  })

  it('sube un adjunto nuevo desde edición — no llama a uploadAttachment hasta Guardar', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail())
    mockedApi.tickets.update.mockResolvedValue({ ...makeDetail(), technician_unassigned: false })
    mockedApi.tickets.uploadAttachment.mockResolvedValue({
      id: 1, nombre_archivo: 'foto.jpg', size_bytes: 100, mime_type: 'image/jpeg', created_at: '2026-08-01T10:00:00Z',
    })
    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.detail.edit'))
    await screen.findByDisplayValue('tickets.types.installation')

    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    await screen.findByText('foto.jpg')
    expect(mockedApi.tickets.uploadAttachment).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('tickets.detail.save'))
    await waitFor(() => expect(mockedApi.tickets.uploadAttachment).toHaveBeenCalledWith(1, file))
  })

  // Regresión directa del rebote de Daniela (2026-08-20): quitar un producto y presionar
  // "Cancelar" (no "Guardar") NO debe eliminarlo — el bug real era que la eliminación se
  // aplicaba de inmediato pese a que el resto del formulario sí se descartaba con Cancelar.
  it('Cancelar tras agregar/quitar productos y subir un adjunto descarta todo — ningún endpoint de productos/adjuntos se llama', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({
      productos: [{ id: 9, catalog_product_id: 55, marca: null, referencia: 'PUB-55', descripcion: 'Regleta eléctrica', cantidad_reclamada: 2, cantidad_recibida: 0, cantidad_pendiente: 2 }],
    }))
    mockedApi.lookup.products.mockResolvedValue([
      { id: 60, reference: 'PUB-60', name: 'Extensión', description: '', brand: null, price_full: 5 },
    ])
    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.detail.edit'))
    await screen.findByDisplayValue('tickets.types.installation')

    // Quitar el producto existente.
    fireEvent.click(await screen.findByLabelText('tickets.detail.removeProduct'))
    expect(screen.queryByText(/Regleta eléctrica/)).not.toBeInTheDocument()

    // Agregar uno nuevo.
    fireEvent.click(screen.getByText('tickets.detail.addProduct'))
    fireEvent.click(await screen.findByText('PUB-60 — Extensión'))
    await screen.findByText(/Extensión/)

    // Subir un adjunto.
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })
    await screen.findByText('foto.jpg')

    fireEvent.click(screen.getByText('tickets.detail.cancel'))

    await waitFor(() => expect(screen.getByText('tickets.detail.edit')).toBeInTheDocument())
    expect(mockedApi.tickets.update).not.toHaveBeenCalled()
    expect(mockedApi.tickets.removeProduct).not.toHaveBeenCalled()
    expect(mockedApi.tickets.addProduct).not.toHaveBeenCalled()
    expect(mockedApi.tickets.uploadAttachment).not.toHaveBeenCalled()

    // Y al volver a entrar a edición, el producto original sigue ahí — nada se perdió de verdad.
    fireEvent.click(screen.getByText('tickets.detail.edit'))
    await screen.findByText(/Regleta eléctrica/)
  })
})

// REQ-228 — Ver/Imprimir PDF.
describe('TicketDetailModal — Ver/Imprimir (REQ-228)', () => {
  it('aparece siempre (sin requerir canEdit) y descarga el PDF con id y numero', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ id: 7, numero: 'GAR-2026-0007' }))
    renderModal({ ticketId: 7, canEdit: false })

    await waitFor(() => expect(screen.getByText('Ticket GAR-2026-0007')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.actions.print'))

    await waitFor(() => expect(mockedApi.tickets.downloadPdf).toHaveBeenCalledWith(7, 'GAR-2026-0007'))
  })
})

// REQ-227 — Cancelar ticket.
describe('TicketDetailModal — Cancelar ticket (REQ-227)', () => {
  it('el botón no aparece si canEdit=false (RN1 — solo lider_servicios/superadmin)', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ estado: 'reported' }))
    renderModal({ canEdit: false })

    await waitFor(() => expect(screen.getByText('Ticket INS-2026-0001')).toBeInTheDocument())
    expect(screen.queryByText('tickets.actions.cancelTicket')).not.toBeInTheDocument()
  })

  it('el botón no aparece si el ticket ya está cancelado (RN4)', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ estado: 'cancelled', cancellation_reason: 'Ya cancelado antes' }))
    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('Ticket INS-2026-0001')).toBeInTheDocument())
    expect(screen.queryByText('tickets.actions.cancelTicket')).not.toBeInTheDocument()
  })

  it('muestra el motivo de cancelación cuando el ticket está cancelado', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ estado: 'cancelled', cancellation_reason: 'Cliente desistió' }))
    renderModal({ canEdit: false })

    await waitFor(() => expect(screen.getByText('Cliente desistió')).toBeInTheDocument())
  })

  it('abre el modal de confirmación, exige motivo y llama a cancel() al confirmar', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ estado: 'reported' }))
    mockedApi.tickets.cancel.mockResolvedValue(makeDetail({ estado: 'cancelled', cancellation_reason: 'No se necesita más' }))
    renderModal({ canEdit: true })

    await waitFor(() => expect(screen.getByText('tickets.actions.cancelTicket')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tickets.actions.cancelTicket'))

    const confirmBtn = await screen.findByText('tickets.cancelModal.confirm')
    expect(confirmBtn.closest('button')).toBeDisabled()

    const textarea = screen.getByPlaceholderText('tickets.cancelModal.motivoPlaceholder')
    fireEvent.change(textarea, { target: { value: 'No se necesita más' } })
    expect(confirmBtn.closest('button')).not.toBeDisabled()

    fireEvent.click(confirmBtn)
    await waitFor(() => expect(mockedApi.tickets.cancel).toHaveBeenCalledWith(1, 'No se necesita más'))
  })
})

describe('TicketDetailModal — historial de reagendamientos (SCRUM-804)', () => {
  it('no muestra el bloque "Cita reagendada" si el ticket nunca se reagendó', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({ reschedule_history: [] }))
    renderModal({ canEdit: false })

    await waitFor(() => expect(screen.getByText('Ticket INS-2026-0001')).toBeInTheDocument())
    expect(screen.queryByText('tickets.detail.reschedule.title')).not.toBeInTheDocument()
  })

  it('muestra fecha/hora anterior, nueva fecha/hora y motivo de cada reagendamiento', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({
      reschedule_history: [
        {
          id: 1,
          previous_scheduled_at: '2026-08-10T14:00:00Z', previous_scheduled_ends_at: null,
          new_scheduled_at: '2026-08-15T09:00:00Z', new_scheduled_ends_at: null,
          motivo: 'Cliente pidió mover la visita.',
          rescheduled_by: { id: 9, first_name: 'Aaron', last_name: 'Leis' },
          created_at: '2026-08-10T16:00:00Z',
        },
      ],
    }))
    renderModal({ canEdit: false })

    await waitFor(() => expect(screen.getByText('tickets.detail.reschedule.title')).toBeInTheDocument())
    expect(screen.getByText('Cliente pidió mover la visita.')).toBeInTheDocument()
  })

  it('muestra múltiples reagendamientos, uno por fila', async () => {
    mockedApi.tickets.get.mockResolvedValue(makeDetail({
      reschedule_history: [
        {
          id: 2, previous_scheduled_at: '2026-08-15T09:00:00Z', previous_scheduled_ends_at: null,
          new_scheduled_at: '2026-08-20T09:00:00Z', new_scheduled_ends_at: null,
          motivo: 'Segundo motivo.', rescheduled_by: null, created_at: '2026-08-15T10:00:00Z',
        },
        {
          id: 1, previous_scheduled_at: '2026-08-10T14:00:00Z', previous_scheduled_ends_at: null,
          new_scheduled_at: '2026-08-15T09:00:00Z', new_scheduled_ends_at: null,
          motivo: 'Primer motivo.', rescheduled_by: null, created_at: '2026-08-10T16:00:00Z',
        },
      ],
    }))
    renderModal({ canEdit: false })

    await waitFor(() => expect(screen.getByText('Segundo motivo.')).toBeInTheDocument())
    expect(screen.getByText('Primer motivo.')).toBeInTheDocument()
  })
})
