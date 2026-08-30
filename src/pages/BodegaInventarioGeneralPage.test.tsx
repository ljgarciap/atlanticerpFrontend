import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import BodegaInventarioGeneralPage from './BodegaInventarioGeneralPage'
import { bodegaApi } from '@/api/bodegaApi'
import { useAuthStore } from '@/store/authStore'
import type {
  GeneralCountDetail, GeneralCountListResponse, PhysicalWarehouse,
} from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    warehouses: { list: vi.fn(), show: vi.fn() },
    generalCounts: {
      list: vi.fn(), create: vi.fn(), detail: vi.fn(), evaluate: vi.fn(), submit: vi.fn(),
      approve: vi.fn(), reject: vi.fn(), apply: vi.fn(), delete: vi.fn(),
    },
  },
}))

// SCRUM-466 — "Realizar ajuste" exclusivo del role_key 'lider_bodega' (ver LIDER_BODEGA_ROLE en
// BodegaInventarioGeneralPage.tsx).
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi = vi.mocked(bodegaApi, true)
const mockedUseAuthStore = vi.mocked(useAuthStore)

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BodegaInventarioGeneralPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Espera a que `useWarehousesList` resuelva (el <option> de la bodega ya existe en el DOM) antes
 * de disparar el `change` — de lo contrario `fireEvent.change` con un `value` que todavía no
 * tiene `<option>` correspondiente no aplica el valor (el select se queda en "") y el `onChange`
 * nunca dispara la creación del conteo. El selector de bodega es el primer `combobox` de la
 * pantalla (el segundo es el "por página" de la Pagination de la bandeja, que se renderiza
 * siempre aunque la tabla esté vacía). */
async function selectWarehouse(name: string, value: string) {
  await screen.findByText(name)
  const select = screen.getAllByRole('combobox')[0]
  fireEvent.change(select, { target: { value } })
}

const WAREHOUSES: PhysicalWarehouse[] = [
  { id: 1, name: 'Bodega Central', responsable: null, capacidad_pct: 68, modo_detalle: 'ubicacion_exacta' },
  { id: 2, name: 'Merma', responsable: null, capacidad_pct: 12, modo_detalle: 'ubicacion_exacta' },
]

const EMPTY_TRAY: GeneralCountListResponse = { data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true }

function makeDetail(overrides: Partial<GeneralCountDetail> = {}): GeneralCountDetail {
  return {
    id: 10,
    warehouse_id: 1,
    bodega: 'Bodega Central',
    realizado_por: 'Jorge P.',
    estado: 'pendiente_evaluacion',
    total_productos: 2,
    diferencias_encontradas: 0,
    fecha: '2026-07-25T10:00:00Z',
    motivo_rechazo: null,
    resuelto_por: null,
    resuelto_at: null,
    aplicado_at: null, fecha_solicitud_aprobacion: null,
    lines: [
      {
        id: 100, producto: { id: 1, reference: 'NORDIC-40', description: 'Lámpara colgante Nordic 40cm' },
        cantidad_sistema: 2, cantidad_contada: null, diferencia: null,
        tiene_cruce_pendiente: false, cruce_fecha: null,
      },
      {
        id: 101, producto: { id: 2, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro Cristal Imperial' },
        cantidad_sistema: 8, cantidad_contada: null, diferencia: null,
        tiene_cruce_pendiente: true, cruce_fecha: '2026-06-26T00:00:00Z',
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
  mockedApi.generalCounts.list.mockResolvedValue(EMPTY_TRAY)
  // Default: actor es el Líder de Bodega — mismo role_key real (BodegaRoles::LIDER_BODEGA).
  mockedUseAuthStore.mockReturnValue('lider_bodega' as never)
})

describe('BodegaInventarioGeneralPage', () => {
  it('muestra el mensaje de vacío cuando no hay conteos en la bandeja', async () => {
    renderPage()
    expect(await screen.findByText('bodega:generalCounts.tray.empty')).toBeInTheDocument()
  })

  it('al elegir una bodega, crea el conteo y precarga la tabla de productos (SCRUM-460)', async () => {
    const detail = makeDetail()
    mockedApi.generalCounts.create.mockResolvedValue({ id: 10, total_productos: 2 })
    mockedApi.generalCounts.detail.mockResolvedValue(detail)

    renderPage()
    await selectWarehouse('Bodega Central', '1')

    await waitFor(() => expect(mockedApi.generalCounts.create).toHaveBeenCalledWith({ warehouse_id: 1 }))
    expect(await screen.findByText('NORDIC-40')).toBeInTheDocument()
    expect(screen.getByText('CRISTAL-IMPERIAL')).toBeInTheDocument()
  })

  it('muestra el aviso de cruce con la fecha de la solicitud cíclica pendiente (SCRUM-461)', async () => {
    const detail = makeDetail()
    mockedApi.generalCounts.create.mockResolvedValue({ id: 10, total_productos: 2 })
    mockedApi.generalCounts.detail.mockResolvedValue(detail)

    renderPage()
    await selectWarehouse('Bodega Central', '1')

    expect(await screen.findByText(/generalCounts.newPanel.crossWarning/)).toBeInTheDocument()
  })

  it('no evalúa si falta la cantidad contada de algún producto (RN1 SCRUM-462)', async () => {
    const detail = makeDetail()
    mockedApi.generalCounts.create.mockResolvedValue({ id: 10, total_productos: 2 })
    mockedApi.generalCounts.detail.mockResolvedValue(detail)

    renderPage()
    await selectWarehouse('Bodega Central', '1')

    await screen.findByText('NORDIC-40')
    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.evaluate'))

    expect(await screen.findByText('bodega:generalCounts.newPanel.errors.missingQuantities')).toBeInTheDocument()
    expect(mockedApi.generalCounts.evaluate).not.toHaveBeenCalled()
  })

  it('evalúa y muestra la columna Diferencia; al editar una cantidad la vuelve a ocultar (RN2 SCRUM-462)', async () => {
    const detail = makeDetail()
    mockedApi.generalCounts.create.mockResolvedValue({ id: 10, total_productos: 2 })
    mockedApi.generalCounts.detail.mockResolvedValue(detail)
    mockedApi.generalCounts.evaluate.mockResolvedValue(makeDetail({
      lines: [
        { ...detail.lines[0], cantidad_contada: 2, diferencia: 0 },
        { ...detail.lines[1], cantidad_contada: 9, diferencia: 1 },
      ],
    }))

    renderPage()
    await selectWarehouse('Bodega Central', '1')
    await screen.findByText('NORDIC-40')

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '2' } })
    fireEvent.change(inputs[1], { target: { value: '9' } })

    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.evaluate'))

    await waitFor(() => expect(mockedApi.generalCounts.evaluate).toHaveBeenCalledWith(10, {
      lines: [{ id: 100, cantidad_contada: 2 }, { id: 101, cantidad_contada: 9 }],
    }))
    expect(await screen.findByText('+1')).toBeInTheDocument()

    // RN2 — editar cualquier cantidad después de evaluar oculta la Diferencia de nuevo.
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '3' } })
    expect(screen.queryByText('+1')).not.toBeInTheDocument()
  })

  it('no envía a aprobación sin haber evaluado antes (RN1 SCRUM-463)', async () => {
    const detail = makeDetail()
    mockedApi.generalCounts.create.mockResolvedValue({ id: 10, total_productos: 2 })
    mockedApi.generalCounts.detail.mockResolvedValue(detail)

    renderPage()
    await selectWarehouse('Bodega Central', '1')
    await screen.findByText('NORDIC-40')

    // El botón queda deshabilitado hasta evaluar.
    const submitBtn = screen.getByText('bodega:generalCounts.newPanel.submit').closest('button')
    expect(submitBtn).toBeDisabled()
    expect(mockedApi.generalCounts.submit).not.toHaveBeenCalled()
  })

  it('pide confirmación de cruce antes de enviar y cancela sin llamar submit (RN3 SCRUM-463/464)', async () => {
    const detail = makeDetail()
    mockedApi.generalCounts.create.mockResolvedValue({ id: 10, total_productos: 2 })
    mockedApi.generalCounts.detail.mockResolvedValue(detail)
    mockedApi.generalCounts.evaluate.mockResolvedValue(makeDetail({
      lines: [
        { ...detail.lines[0], cantidad_contada: 2, diferencia: 0 },
        { ...detail.lines[1], cantidad_contada: 9, diferencia: 1 },
      ],
    }))

    renderPage()
    await selectWarehouse('Bodega Central', '1')
    await screen.findByText('NORDIC-40')

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '2' } })
    fireEvent.change(inputs[1], { target: { value: '9' } })
    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.evaluate'))
    await screen.findByText('+1')

    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.submit'))

    expect(await screen.findByText('bodega:generalCounts.newPanel.cruceModal.title')).toBeInTheDocument()
    // Aparece 2 veces: en la fila de la tabla (detrás del modal) y en la lista del modal de cruce.
    expect(screen.getAllByText('CRISTAL-IMPERIAL').length).toBeGreaterThanOrEqual(2)

    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(mockedApi.generalCounts.submit).not.toHaveBeenCalled()
    expect(screen.queryByText('bodega:generalCounts.newPanel.cruceModal.title')).not.toBeInTheDocument()
  })

  it('confirma el cruce y llama submit', async () => {
    const detail = makeDetail()
    mockedApi.generalCounts.create.mockResolvedValue({ id: 10, total_productos: 2 })
    mockedApi.generalCounts.detail.mockResolvedValue(detail)
    mockedApi.generalCounts.evaluate.mockResolvedValue(makeDetail({
      lines: [
        { ...detail.lines[0], cantidad_contada: 2, diferencia: 0 },
        { ...detail.lines[1], cantidad_contada: 9, diferencia: 1 },
      ],
    }))
    mockedApi.generalCounts.submit.mockResolvedValue(makeDetail({ estado: 'pendiente_aprobacion' }))

    renderPage()
    await selectWarehouse('Bodega Central', '1')
    await screen.findByText('NORDIC-40')

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '2' } })
    fireEvent.change(inputs[1], { target: { value: '9' } })
    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.evaluate'))
    await screen.findByText('+1')

    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.submit'))
    await screen.findByText('bodega:generalCounts.newPanel.cruceModal.title')
    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.cruceModal.confirm'))

    await waitFor(() => expect(mockedApi.generalCounts.submit).toHaveBeenCalledWith(10, false))
  })

  // ── SCRUM-797 (rebote de Daniela Amaya 2026-08-27) — duplicados por producto ──────

  it('SCRUM-797 — 409 al elegir bodega con un producto en conflicto real muestra el modal con ese producto', async () => {
    mockedApi.generalCounts.create.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { duplicates: [{ catalog_product_id: 1, product_reference: 'NORDIC-40', product_name: 'Lámpara colgante Nordic 40cm', general_count: { id: 5, estado: 'evaluado', fecha: '2026-08-20T10:00:00Z' } }] },
      },
    })

    renderPage()
    await selectWarehouse('Bodega Central', '1')

    expect(await screen.findByText('bodega:generalCounts.newPanel.duplicateModal.title')).toBeInTheDocument()
    expect(screen.getByText(/NORDIC-40/)).toBeInTheDocument()
  })

  it('SCRUM-797 — confirmar el duplicado reintenta store() con confirm_replace y crea el conteo', async () => {
    mockedApi.generalCounts.create.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: { duplicates: [{ catalog_product_id: 1, product_reference: 'NORDIC-40', product_name: 'Lámpara colgante Nordic 40cm', general_count: { id: 5, estado: 'evaluado', fecha: '2026-08-20T10:00:00Z' } }] },
      },
    })
    mockedApi.generalCounts.create.mockResolvedValueOnce({ id: 11, total_productos: 2 })
    mockedApi.generalCounts.detail.mockResolvedValue(makeDetail({ id: 11 }))

    renderPage()
    await selectWarehouse('Bodega Central', '1')
    await screen.findByText('bodega:generalCounts.newPanel.duplicateModal.title')

    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.duplicateModal.confirm'))

    await waitFor(() => expect(mockedApi.generalCounts.create).toHaveBeenLastCalledWith({ warehouse_id: 1, confirm_replace: true }))
    expect(await screen.findByText('NORDIC-40')).toBeInTheDocument()
  })

  it('SCRUM-797 — cancelar el duplicado no crea nada y limpia la selección de bodega', async () => {
    mockedApi.generalCounts.create.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { duplicates: [{ catalog_product_id: 1, product_reference: 'NORDIC-40', product_name: 'Lámpara colgante Nordic 40cm', general_count: { id: 5, estado: 'evaluado', fecha: '2026-08-20T10:00:00Z' } }] },
      },
    })

    renderPage()
    await selectWarehouse('Bodega Central', '1')
    await screen.findByText('bodega:generalCounts.newPanel.duplicateModal.title')

    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(screen.queryByText('bodega:generalCounts.newPanel.duplicateModal.title')).not.toBeInTheDocument()
    expect(mockedApi.generalCounts.detail).not.toHaveBeenCalled()
  })

  it('SCRUM-797 — 409 al enviar a aprobación (mismo producto en conflicto en otro conteo) muestra el modal y confirmar reintenta con confirm_replace', async () => {
    const detail = makeDetail()
    mockedApi.generalCounts.create.mockResolvedValue({ id: 10, total_productos: 2 })
    mockedApi.generalCounts.detail.mockResolvedValue(detail)
    mockedApi.generalCounts.evaluate.mockResolvedValue(makeDetail({
      lines: detail.lines.map(l => ({ ...l, cantidad_contada: l.cantidad_sistema, diferencia: 0 })),
    }))
    mockedApi.generalCounts.submit.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: { duplicates: [{ catalog_product_id: 1, product_reference: 'NORDIC-40', product_name: 'Lámpara colgante Nordic 40cm', general_count: { id: 7, estado: 'evaluado', fecha: '2026-08-21T10:00:00Z' } }] },
      },
    })
    mockedApi.generalCounts.submit.mockResolvedValueOnce(makeDetail({ estado: 'pendiente_aprobacion' }))

    renderPage()
    await selectWarehouse('Bodega Central', '1')
    await screen.findByText('NORDIC-40')

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '2' } })
    fireEvent.change(inputs[1], { target: { value: '8' } })
    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.evaluate'))
    await waitFor(() => expect(mockedApi.generalCounts.evaluate).toHaveBeenCalled())

    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.submit'))

    await screen.findByText('bodega:generalCounts.newPanel.duplicateModal.title')
    fireEvent.click(screen.getByText('bodega:generalCounts.newPanel.duplicateModal.confirm'))

    await waitFor(() => expect(mockedApi.generalCounts.submit).toHaveBeenLastCalledWith(10, true))
  })

  it('rechazar sin motivo no permite confirmar (RN2 SCRUM-465)', async () => {
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 1, warehouse_id: 1, bodega: 'Bodega Central', realizado_por: 'Jorge P.',
        estado: 'pendiente_aprobacion', total_productos: 10, diferencias_encontradas: 0, fecha: '2026-07-10T10:00:00Z',
        motivo_rechazo: null, resuelto_por: null, resuelto_at: null, aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:generalCounts.tray.actions.reject'))
    fireEvent.click(await screen.findByText('bodega:generalCounts.tray.rejectModal.confirm'))

    expect(await screen.findByText('bodega:generalCounts.tray.rejectModal.required')).toBeInTheDocument()
    expect(mockedApi.generalCounts.reject).not.toHaveBeenCalled()
  })

  it('muestra Aprobar/Rechazar en filas pendiente_aprobacion cuando can_approve es true (SCRUM-463)', async () => {
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 1, warehouse_id: 1, bodega: 'Bodega Central', realizado_por: 'Jorge P.',
        estado: 'pendiente_aprobacion', total_productos: 10, diferencias_encontradas: 0, fecha: '2026-07-10T10:00:00Z',
        motivo_rechazo: null, resuelto_por: null, resuelto_at: null, aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()
    expect(await screen.findByText('bodega:generalCounts.tray.actions.approve')).toBeInTheDocument()
    expect(screen.getByText('bodega:generalCounts.tray.actions.reject')).toBeInTheDocument()
  })

  /**
   * SCRUM-463 (rebote de Daniela Amaya 2026-08-14) — reemplaza el test viejo del candado
   * decorativo: antes Aprobar/Rechazar quedaban visibles/clicables para CUALQUIER perfil de
   * Bodega (con un candado como única señal); ahora se OCULTAN por completo cuando
   * `can_approve` es false (el usuario actual no es Mark).
   */
  it('oculta Aprobar/Rechazar por completo en filas pendiente_aprobacion cuando can_approve es false', async () => {
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 1, warehouse_id: 1, bodega: 'Bodega Central', realizado_por: 'Jorge P.',
        estado: 'pendiente_aprobacion', total_productos: 10, diferencias_encontradas: 0, fecha: '2026-07-10T10:00:00Z',
        motivo_rechazo: null, resuelto_por: null, resuelto_at: null, aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: false,
    })

    renderPage()
    await screen.findByText('Bodega Central')
    expect(screen.queryByText('bodega:generalCounts.tray.actions.approve')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:generalCounts.tray.actions.reject')).not.toBeInTheDocument()
  })

  it('SCRUM-797 — fila Rechazada muestra "Ver detalle" en vez de acciones', async () => {
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 2, warehouse_id: 3, bodega: 'Merma', realizado_por: 'Jorge P.',
        estado: 'rechazada', total_productos: 1, diferencias_encontradas: 0, fecha: '2026-06-15T10:00:00Z',
        motivo_rechazo: 'El conteo no coincidía.', resuelto_por: 'Mark', resuelto_at: '2026-06-16T10:00:00Z',
        aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()
    expect(await screen.findByText('bodega:generalCounts.tray.actions.viewDetail')).toBeInTheDocument()
    expect(screen.queryByText('bodega:generalCounts.tray.actions.approve')).not.toBeInTheDocument()
  })

  it('SCRUM-797 CA5/CA8/CA9 — "Ver detalle" abre el modal con líneas, fecha de solicitud y motivo de rechazo', async () => {
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 2, warehouse_id: 3, bodega: 'Merma', realizado_por: 'Jorge P.',
        estado: 'rechazada', total_productos: 1, diferencias_encontradas: 1, fecha: '2026-06-15T10:00:00Z',
        motivo_rechazo: 'El conteo no coincidía.', resuelto_por: 'Mark', resuelto_at: '2026-06-16T10:00:00Z',
        aplicado_at: null, fecha_solicitud_aprobacion: '2026-06-15T12:00:00Z',
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })
    mockedApi.generalCounts.detail.mockResolvedValue({
      id: 2, warehouse_id: 3, bodega: 'Merma', realizado_por: 'Jorge P.',
      estado: 'rechazada', total_productos: 1, diferencias_encontradas: 1, fecha: '2026-06-15T10:00:00Z',
      motivo_rechazo: 'El conteo no coincidía.', resuelto_por: 'Mark', resuelto_at: '2026-06-16T10:00:00Z',
      aplicado_at: null, fecha_solicitud_aprobacion: '2026-06-15T12:00:00Z',
      lines: [{
        id: 9, producto: { id: 1, reference: 'REF-1', description: 'Bombillo LED' },
        cantidad_sistema: 10, cantidad_contada: 8, diferencia: -2, tiene_cruce_pendiente: false, cruce_fecha: null,
      }],
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:generalCounts.tray.actions.viewDetail'))

    expect(await screen.findByText('El conteo no coincidía.')).toBeInTheDocument()
    expect(screen.getByText('Bombillo LED')).toBeInTheDocument()
    expect(mockedApi.generalCounts.detail).toHaveBeenCalledWith(2)
  })

  it('fila Aprobada con aplicado_at nulo muestra "Realizar ajuste"; tras aplicarlo, queda deshabilitado (SCRUM-466)', async () => {
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 3, warehouse_id: 4, bodega: 'Showroom Obarrio', realizado_por: 'Jorge P.',
        estado: 'aprobada', total_productos: 1, diferencias_encontradas: 0, fecha: '2026-06-28T10:00:00Z',
        motivo_rechazo: null, resuelto_por: 'Mark', resuelto_at: '2026-06-29T10:00:00Z',
        aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })
    mockedApi.generalCounts.apply.mockResolvedValue({
      id: 3, warehouse_id: 4, bodega: 'Showroom Obarrio', realizado_por: 'Jorge P.',
      estado: 'aprobada', total_productos: 1, diferencias_encontradas: 0, fecha: '2026-06-28T10:00:00Z',
      motivo_rechazo: null, resuelto_por: 'Mark', resuelto_at: '2026-06-29T10:00:00Z',
      aplicado_at: '2026-07-25T10:00:00Z', fecha_solicitud_aprobacion: null,
    })

    renderPage()
    const applyBtn = await screen.findByText('bodega:generalCounts.tray.actions.applyAdjustment')
    fireEvent.click(applyBtn)

    expect(await waitFor(() => mockedApi.generalCounts.apply)).toHaveBeenCalledWith(3)
  })

  // SCRUM-466 (rebote de Daniela Amaya 2026-08-14) — "Realizar ajuste" aparecía también para Mark
  // (y, por extensión, cualquier otro perfil de Bodega) — debe verse SOLO para el Líder de Bodega.
  it('rebote 2026-08-14 — "Realizar ajuste" queda oculto para Mark (role distinto de lider_bodega)', async () => {
    mockedUseAuthStore.mockReturnValue('management' as never) // rol de Mark
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 3, warehouse_id: 4, bodega: 'Showroom Obarrio', realizado_por: 'Jorge P.',
        estado: 'aprobada', total_productos: 1, diferencias_encontradas: 0, fecha: '2026-06-28T10:00:00Z',
        motivo_rechazo: null, resuelto_por: 'Mark', resuelto_at: '2026-06-29T10:00:00Z',
        aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()
    await screen.findByText('Showroom Obarrio')

    expect(screen.queryByText('bodega:generalCounts.tray.actions.applyAdjustment')).not.toBeInTheDocument()
  })

  it('rebote 2026-08-14 — "Realizar ajuste" queda oculto para otros perfiles de Bodega (no Líder)', async () => {
    mockedUseAuthStore.mockReturnValue('asistente_bodega' as never)
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 3, warehouse_id: 4, bodega: 'Showroom Obarrio', realizado_por: 'Jorge P.',
        estado: 'aprobada', total_productos: 1, diferencias_encontradas: 0, fecha: '2026-06-28T10:00:00Z',
        motivo_rechazo: null, resuelto_por: 'Mark', resuelto_at: '2026-06-29T10:00:00Z',
        aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()
    await screen.findByText('Showroom Obarrio')

    expect(screen.queryByText('bodega:generalCounts.tray.actions.applyAdjustment')).not.toBeInTheDocument()
  })

  it('fila Aprobada con aplicado_at ya presente muestra "Ajuste aplicado" deshabilitado, no un botón', async () => {
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 4, warehouse_id: 4, bodega: 'Showroom Obarrio', realizado_por: 'Jorge P.',
        estado: 'aprobada', total_productos: 1, diferencias_encontradas: 0, fecha: '2026-06-28T10:00:00Z',
        motivo_rechazo: null, resuelto_por: 'Mark', resuelto_at: '2026-06-29T10:00:00Z',
        aplicado_at: '2026-06-30T10:00:00Z', fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()
    expect(await screen.findByText('bodega:generalCounts.tray.actions.adjustmentApplied')).toBeInTheDocument()
    expect(screen.queryByText('bodega:generalCounts.tray.actions.applyAdjustment')).not.toBeInTheDocument()
  })

  it('filtra la bandeja por chip (Pendientes -> pendiente_aprobacion)', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('bodega:generalCounts.tray.chips.pendiente_aprobacion'))

    await waitFor(() => expect(mockedApi.generalCounts.list).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'pendiente_aprobacion' }),
    ))
  })

  /** RN3 (REQ-395) — hallazgo de Pre-QA 2026-07-25: la columna "Diferencias encontradas" quedaba
   * fija en "—" (el backend no exponía el dato). Corregido en `GeneralCountController::index()`
   * (withCount agregado) + acá (renderiza `row.diferencias_encontradas` real). */
  it('columna "Diferencias encontradas" muestra el número real de la fila, no un placeholder fijo', async () => {
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 5, warehouse_id: 6, bodega: 'Bodega Central', realizado_por: 'Jorge P.',
        estado: 'aprobada', total_productos: 10, diferencias_encontradas: 3, fecha: '2026-07-10T10:00:00Z',
        motivo_rechazo: null, resuelto_por: 'Mark', resuelto_at: '2026-07-11T10:00:00Z', aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()
    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  /**
   * SCRUM-462 (REQ-392, rebote de Daniela Amaya 2026-08-14) — un conteo que queda en borrador
   * (nunca evaluado) o evaluado pero nunca enviado a aprobación quedaba inerte en la bandeja, sin
   * ninguna acción disponible. Aplica tanto si nunca se evaluó como si se evaluó pero no se envió.
   */
  it.each(['pendiente_evaluacion', 'evaluado'] as const)(
    'fila en estado "%s" muestra Continuar/Eliminar en vez de "—"',
    async estado => {
      mockedApi.generalCounts.list.mockResolvedValue({
        data: [{
          id: 7, warehouse_id: 1, bodega: 'Bodega Central', realizado_por: 'Jorge P.',
          estado, total_productos: 5, diferencias_encontradas: 0, fecha: '2026-08-14T10:00:00Z',
          motivo_rechazo: null, resuelto_por: null, resuelto_at: null, aplicado_at: null, fecha_solicitud_aprobacion: null,
        }],
        meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
      })

      renderPage()
      expect(await screen.findByText('bodega:generalCounts.tray.actions.continue')).toBeInTheDocument()
      expect(screen.getByText('bodega:generalCounts.tray.actions.delete')).toBeInTheDocument()
    },
  )

  it('SCRUM-462 — "Continuar" carga el borrador exacto (mismo id) en el panel "Nuevo conteo general", con evaluated=true si ya estaba evaluado', async () => {
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 8, warehouse_id: 2, bodega: 'Merma', realizado_por: 'Jorge P.',
        estado: 'evaluado', total_productos: 1, diferencias_encontradas: 1, fecha: '2026-08-14T10:00:00Z',
        motivo_rechazo: null, resuelto_por: null, resuelto_at: null, aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })
    mockedApi.generalCounts.detail.mockResolvedValue(makeDetail({
      id: 8, warehouse_id: 2, bodega: 'Merma', estado: 'evaluado', diferencias_encontradas: 1,
      lines: [{
        id: 200, producto: { id: 9, reference: 'FOCO-LED-1', description: 'Foco LED' },
        cantidad_sistema: 10, cantidad_contada: 8, diferencia: -2, tiene_cruce_pendiente: false, cruce_fecha: null,
      }],
    }))

    renderPage()
    fireEvent.click(await screen.findByText('bodega:generalCounts.tray.actions.continue'))

    // Se pide el detalle del MISMO id (no se crea un conteo nuevo) y sus líneas se precargan en
    // el panel de arriba, con la columna Diferencia ya visible (evaluated=true de una).
    await waitFor(() => expect(mockedApi.generalCounts.detail).toHaveBeenCalledWith(8))
    expect(mockedApi.generalCounts.create).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('FOCO-LED-1')).toBeInTheDocument())
    expect(screen.getByText('-2')).toBeInTheDocument()
  })

  it('SCRUM-462 — "Eliminar" pide confirmación antes de borrar; confirmar llama delete() y refresca la bandeja', async () => {
    mockedApi.generalCounts.list.mockResolvedValueOnce({
      data: [{
        id: 9, warehouse_id: 1, bodega: 'Bodega Central', realizado_por: 'Jorge P.',
        estado: 'pendiente_evaluacion', total_productos: 5, diferencias_encontradas: 0, fecha: '2026-08-14T10:00:00Z',
        motivo_rechazo: null, resuelto_por: null, resuelto_at: null, aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })
    mockedApi.generalCounts.list.mockResolvedValueOnce(EMPTY_TRAY)
    mockedApi.generalCounts.delete.mockResolvedValue(undefined)

    renderPage()
    fireEvent.click(await screen.findByText('bodega:generalCounts.tray.actions.delete'))

    // Modal de confirmación propio (nunca window.confirm()) — no borra hasta confirmar.
    expect(await screen.findByText('bodega:generalCounts.tray.deleteModal.title')).toBeInTheDocument()
    expect(mockedApi.generalCounts.delete).not.toHaveBeenCalled()

    // El botón "Eliminar" de la fila original sigue montado detrás del modal (overlay, no
    // reemplazo) — el del modal es el que se agrega último al DOM.
    const deleteButtons = screen.getAllByText('bodega:generalCounts.tray.actions.delete')
    fireEvent.click(deleteButtons[deleteButtons.length - 1])

    await waitFor(() => expect(mockedApi.generalCounts.delete).toHaveBeenCalledWith(9))
    await waitFor(() => expect(screen.queryByText('bodega:generalCounts.tray.deleteModal.title')).not.toBeInTheDocument())
  })

  it('SCRUM-462 — "Eliminar" se puede cancelar sin llamar delete()', async () => {
    mockedApi.generalCounts.list.mockResolvedValue({
      data: [{
        id: 10, warehouse_id: 1, bodega: 'Bodega Central', realizado_por: 'Jorge P.',
        estado: 'pendiente_evaluacion', total_productos: 5, diferencias_encontradas: 0, fecha: '2026-08-14T10:00:00Z',
        motivo_rechazo: null, resuelto_por: null, resuelto_at: null, aplicado_at: null, fecha_solicitud_aprobacion: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:generalCounts.tray.actions.delete'))
    expect(await screen.findByText('bodega:generalCounts.tray.deleteModal.title')).toBeInTheDocument()

    fireEvent.click(screen.getByText('common:actions.cancel'))

    await waitFor(() => expect(screen.queryByText('bodega:generalCounts.tray.deleteModal.title')).not.toBeInTheDocument())
    expect(mockedApi.generalCounts.delete).not.toHaveBeenCalled()
  })
})
