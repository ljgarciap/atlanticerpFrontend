import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import SolicitudAjustePage from './SolicitudAjustePage'
import { bodegaApi } from '@/api/bodegaApi'
import type { AdjustmentRequestListResponse, PhysicalWarehouse } from '@/types/bodega'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => opts ? `${key}:${JSON.stringify(opts)}` : key }),
}))

vi.mock('@/api/bodegaApi', () => ({
  bodegaApi: {
    warehouses: { list: vi.fn(), show: vi.fn() },
    kardex: { list: vi.fn() },
    inventory: { porServir: vi.fn() },
    adjustmentRequests: {
      list: vi.fn(), searchProducts: vi.fn(), create: vi.fn(), approve: vi.fn(), reject: vi.fn(),
      productWarehouseStock: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(bodegaApi, true)

function renderPage(initialEntries: string[] = ['/bodega/solicitud-ajuste']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <SolicitudAjustePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const WAREHOUSES: PhysicalWarehouse[] = [
  { id: 1, name: 'Bodega Central', responsable: null, capacidad_pct: 68, modo_detalle: 'ubicacion_exacta' },
  { id: 2, name: 'Merma', responsable: null, capacidad_pct: 12, modo_detalle: 'ubicacion_exacta' },
]

const EMPTY: AdjustmentRequestListResponse = { data: [], meta: { total: 0, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true }

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.warehouses.list.mockResolvedValue({ data: WAREHOUSES })
  mockedApi.adjustmentRequests.productWarehouseStock.mockResolvedValue({
    por_servir: 0,
    warehouses: WAREHOUSES.map(w => ({ warehouse_id: w.id, name: w.name, quantity: 0 })),
  })
  // Fix Pre-QA 2026-07-28 (RN5) — `hasCommittedUnits` ya no lee `productWarehouseStock.por_servir`
  // (concepto de reserva de Ventas & Diseño, siempre 0 en Bodega para la mayoría de productos, ver
  // docblock en SolicitudAjustePage.tsx), sino el comprometido REAL de Bodega vía
  // `bodegaApi.inventory.porServir` (mismo endpoint que `PorServirModal`). Default vacío acá.
  mockedApi.inventory.porServir.mockResolvedValue({ data: [] })
})

describe('SolicitudAjustePage', () => {
  it('muestra el mensaje de vacío cuando no hay solicitudes', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    renderPage()
    expect(await screen.findByText('bodega:adjustments.empty')).toBeInTheDocument()
  })

  it('muestra los botones Aprobar/Rechazar solo en filas Pendientes', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue({
      data: [
        {
          id: 1, producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
          bodega: 'Bodega Central', tipo: 'Sumar', cantidad: 5, motivo: 'Conteo',
          descripcion: null, responsable: null,
          evidencia_url: null, solicitado_por: 'Jorge P.', fecha: '2026-07-21T10:00:00Z',
          estado: 'Pendiente', motivo_rechazo: null, resuelto_por: null,
        },
        {
          id: 2, producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
          bodega: 'Merma', tipo: 'Restar', cantidad: 2, motivo: 'Danado',
          descripcion: null, responsable: null,
          evidencia_url: null, solicitado_por: 'Jorge P.', fecha: '2026-07-21T10:00:00Z',
          estado: 'Aprobada', motivo_rechazo: null, resuelto_por: 'Mark',
        },
      ],
      meta: { total: 2, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()

    expect(await screen.findByText('bodega:adjustments.actions.approve')).toBeInTheDocument()
    expect(screen.getByText('bodega:adjustments.actions.reject')).toBeInTheDocument()
    // La fila Aprobada no tiene botones de acción
    expect(screen.getAllByText('bodega:adjustments.actions.approve')).toHaveLength(1)
  })

  /**
   * SCRUM-429 (rebote de Gerencia Test 2026-08-13) — Bodega solicita, Mark aprueba: antes
   * Aprobar/Rechazar quedaban visibles/clicables para CUALQUIER perfil de Bodega en una fila
   * Pendiente (el backend ya rechazaba con 403 a quien no fuera Mark, pero sin ninguna señal en
   * el botón). Ahora se ocultan por completo cuando `can_approve` es false.
   */
  it('oculta Aprobar/Rechazar por completo en filas Pendiente cuando can_approve es false', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue({
      data: [{
        id: 1, producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
        bodega: 'Bodega Central', tipo: 'Sumar', cantidad: 5, motivo: 'Conteo',
        descripcion: null, responsable: null,
        evidencia_url: null, solicitado_por: 'Jorge P.', fecha: '2026-07-21T10:00:00Z',
        estado: 'Pendiente', motivo_rechazo: null, resuelto_por: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: false,
    })

    renderPage()
    await screen.findByText('Candelabro')
    expect(screen.queryByText('bodega:adjustments.actions.approve')).not.toBeInTheDocument()
    expect(screen.queryByText('bodega:adjustments.actions.reject')).not.toBeInTheDocument()
  })

  it('SCRUM-369 (REQ-299, corrección 2026-08-11) — deep link "?line=<id>" desde Pendientes fuerza el chip Pendiente y resalta la fila', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue({
      data: [
        {
          id: 7, producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
          bodega: 'Bodega Central', tipo: 'Sumar', cantidad: 5, motivo: 'Conteo',
          descripcion: null, responsable: null,
          evidencia_url: null, solicitado_por: 'Jorge P.', fecha: '2026-07-21T10:00:00Z',
          estado: 'Pendiente', motivo_rechazo: null, resuelto_por: null,
        },
      ],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage(['/bodega/solicitud-ajuste?line=7'])

    await screen.findByTestId('adjustment-row-7')
    expect(screen.getByTestId('adjustment-row-7').className).toContain('ring-amber-300')

    // El chip queda forzado a "Pendiente" — confirmado por la llamada real al API.
    await waitFor(() => {
      const calls = mockedApi.adjustmentRequests.list.mock.calls
      const lastCall = calls[calls.length - 1]?.[0]
      expect(lastCall).toEqual(expect.objectContaining({ estado: 'Pendiente', per_page: 'all' }))
    })
  })

  // SCRUM-447 (rebote de Gerencia Test 2026-08-13) — "Producto" mostraba la referencia en vez del
  // nombre; ahora hay una columna "Ref. fábrica" nueva al inicio con la referencia, y "Producto"
  // muestra solo el nombre.
  it('rebote 2026-08-13 — columna "Ref. fábrica" nueva con la referencia, "Producto" muestra solo el nombre', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue({
      data: [{
        id: 1, producto: { id: 1, reference: 'NORDIC-40', description: 'Lámpara colgante Nordic 40cm' },
        bodega: 'Bodega Central', tipo: 'Sumar', cantidad: 5, motivo: 'Conteo',
        descripcion: null, responsable: null,
        evidencia_url: null, solicitado_por: 'Jorge P.', fecha: '2026-07-21T10:00:00Z',
        estado: 'Pendiente', motivo_rechazo: null, resuelto_por: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()

    const row = await screen.findByTestId('adjustment-row-1')
    expect(row).toHaveTextContent('NORDIC-40')
    expect(row).toHaveTextContent('Lámpara colgante Nordic 40cm')
    expect(screen.getByText('bodega:adjustments.table.factoryReference')).toBeInTheDocument()

    // "Ref. fábrica" es la PRIMERA columna, antes de "Producto".
    const headerLabels = screen.getAllByRole('columnheader').map(th => th.textContent)
    expect(headerLabels[0]).toBe('bodega:adjustments.table.factoryReference')
    expect(headerLabels[1]).toBe('bodega:adjustments.table.product')
  })

  it('rechazar sin motivo no permite confirmar', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue({
      data: [{
        id: 1, producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
        bodega: 'Bodega Central', tipo: 'Sumar', cantidad: 5, motivo: 'Conteo',
        descripcion: null, responsable: null,
        evidencia_url: null, solicitado_por: 'Jorge P.', fecha: '2026-07-21T10:00:00Z',
        estado: 'Pendiente', motivo_rechazo: null, resuelto_por: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: true,
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:adjustments.actions.reject'))
    fireEvent.click(await screen.findByText('bodega:adjustments.rejectModal.confirm'))

    expect(await screen.findByText('bodega:adjustments.rejectModal.required')).toBeInTheDocument()
    expect(mockedApi.adjustmentRequests.reject).not.toHaveBeenCalled()
  })

  it('el modal de nueva solicitud no envia sin producto ni lineas', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    renderPage()

    fireEvent.click(await screen.findByText('bodega:adjustments.actions.new'))
    fireEvent.click(await screen.findByText('bodega:adjustments.newModal.submit'))

    expect(await screen.findByText('bodega:adjustments.newModal.errors.product')).toBeInTheDocument()
    expect(mockedApi.adjustmentRequests.create).not.toHaveBeenCalled()
  })

  it('SCRUM-428 — entrando por "+ Nueva solicitud" (producto libre) sí puede cambiar el producto elegido', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    mockedApi.adjustmentRequests.searchProducts.mockResolvedValue({
      data: [{ id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' }],
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:adjustments.actions.new'))

    const search = await screen.findByPlaceholderText('bodega:adjustments.newModal.searchProduct')
    fireEvent.change(search, { target: { value: 'CRISTAL' } })
    fireEvent.click(await screen.findByText(/CRISTAL-IMPERIAL/))

    // A diferencia del entry point por fila de Ver Inventario (SCRUM-428, producto fijo), acá
    // el producto se eligió libremente (REQ-376) — "Cambiar" debe seguir disponible.
    expect(await screen.findByText('common:actions.change')).toBeInTheDocument()
  })

  it('agregar bodega deja de ofrecer bodegas ya usadas', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    mockedApi.adjustmentRequests.searchProducts.mockResolvedValue({
      data: [{ id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' }],
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:adjustments.actions.new'))

    const search = await screen.findByPlaceholderText('bodega:adjustments.newModal.searchProduct')
    fireEvent.change(search, { target: { value: 'CRISTAL' } })
    fireEvent.click(await screen.findByText(/CRISTAL-IMPERIAL/))

    const addButton = await screen.findByText('bodega:adjustments.newModal.addWarehouse')
    fireEvent.click(addButton)
    fireEvent.click(addButton)

    // Con 2 bodegas disponibles y 2 líneas agregadas, el botón debe deshabilitarse.
    await waitFor(() => expect(addButton.closest('button')).toBeDisabled())
  })

  it('SCRUM-428 (corrección de Gerencia Test 2026-08-13) — Motivo es un desplegable con exactamente 6 opciones fijas, ya no texto libre', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    mockedApi.adjustmentRequests.searchProducts.mockResolvedValue({
      data: [{ id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' }],
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:adjustments.actions.new'))

    const search = await screen.findByPlaceholderText('bodega:adjustments.newModal.searchProduct')
    fireEvent.change(search, { target: { value: 'CRISTAL' } })
    fireEvent.click(await screen.findByText(/CRISTAL-IMPERIAL/))
    fireEvent.click(await screen.findByText('bodega:adjustments.newModal.addWarehouse'))

    const motivoSelect = (await screen.findByText('bodega:adjustments.newModal.reasonPlaceholder')).closest('select') as HTMLSelectElement
    const optionValues = Array.from(motivoSelect.options).map(o => o.value).filter(v => v !== '')
    expect(optionValues).toEqual([
      'CONTEO_FISICO_NO_COINCIDE', 'PRODUCTO_DANADO_ROTO', 'PRODUCTO_VENCIDO_OBSOLETO',
      'ERROR_DE_REGISTRO', 'ROBO_O_PERDIDA', 'OTRO_ESPECIFICAR',
    ])
    // No hay ningún textarea/input de texto libre para Motivo — el único control es el <select>.
    expect(screen.queryByPlaceholderText('bodega:adjustments.newModal.reason')).not.toBeInTheDocument()
  })

  it('SCRUM-428 — envía Motivo (desplegable) + Descripción/Responsable (opcionales) por separado en la solicitud', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    mockedApi.adjustmentRequests.searchProducts.mockResolvedValue({
      data: [{ id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' }],
    })
    mockedApi.adjustmentRequests.create.mockResolvedValue({ id: 5 })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:adjustments.actions.new'))

    const search = await screen.findByPlaceholderText('bodega:adjustments.newModal.searchProduct')
    fireEvent.change(search, { target: { value: 'CRISTAL' } })
    fireEvent.click(await screen.findByText(/CRISTAL-IMPERIAL/))
    fireEvent.click(await screen.findByText('bodega:adjustments.newModal.addWarehouse'))

    fireEvent.change(screen.getByPlaceholderText('bodega:adjustments.newModal.quantity'), { target: { value: '3' } })
    const motivoSelect = (await screen.findByText('bodega:adjustments.newModal.reasonPlaceholder')).closest('select') as HTMLSelectElement
    fireEvent.change(motivoSelect, { target: { value: 'OTRO_ESPECIFICAR' } })
    fireEvent.change(screen.getByPlaceholderText('bodega:adjustments.newModal.descriptionPlaceholder'), {
      target: { value: 'Se encontraron 3 unidades sueltas fuera de su ubicación habitual' },
    })
    fireEvent.change(screen.getByPlaceholderText('bodega:adjustments.newModal.responsiblePlaceholder'), {
      target: { value: 'Esteban Jefe de Bodega' },
    })
    const file = new File(['foto'], 'evidencia.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByText('bodega:adjustments.newModal.submit'))

    await waitFor(() => expect(mockedApi.adjustmentRequests.create).toHaveBeenCalledWith(
      1,
      [expect.objectContaining({
        motivo: 'OTRO_ESPECIFICAR',
        descripcion: 'Se encontraron 3 unidades sueltas fuera de su ubicación habitual',
        responsable: 'Esteban Jefe de Bodega',
        cantidad: 3,
      })],
      false,
    ))
  })

  it('SCRUM-428 — sin elegir Motivo, no envía la solicitud (Descripción/Responsable nunca son obligatorios)', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    mockedApi.adjustmentRequests.searchProducts.mockResolvedValue({
      data: [{ id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' }],
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:adjustments.actions.new'))

    const search = await screen.findByPlaceholderText('bodega:adjustments.newModal.searchProduct')
    fireEvent.change(search, { target: { value: 'CRISTAL' } })
    fireEvent.click(await screen.findByText(/CRISTAL-IMPERIAL/))
    fireEvent.click(await screen.findByText('bodega:adjustments.newModal.addWarehouse'))

    fireEvent.change(screen.getByPlaceholderText('bodega:adjustments.newModal.quantity'), { target: { value: '3' } })
    const file = new File(['foto'], 'evidencia.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })
    // Motivo queda sin elegir a propósito — Descripción/Responsable tampoco se llenan (opcionales).

    fireEvent.click(screen.getByText('bodega:adjustments.newModal.submit'))

    await waitFor(() => expect(screen.getByText('bodega:adjustments.newModal.errors.incomplete')).toBeInTheDocument())
    expect(mockedApi.adjustmentRequests.create).not.toHaveBeenCalled()
  })

  it('muestra la advertencia de unidades comprometidas al elegir Restar (RN5, hallazgo Pre-QA)', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    mockedApi.adjustmentRequests.searchProducts.mockResolvedValue({
      data: [{ id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' }],
    })
    mockedApi.adjustmentRequests.productWarehouseStock.mockResolvedValue({
      por_servir: 0, // concepto de Ventas & Diseño, deliberadamente 0 — no es la fuente de RN5
      warehouses: WAREHOUSES.map(w => ({ warehouse_id: w.id, name: w.name, quantity: 10 })),
    })
    // Fix Pre-QA 2026-07-28 — comprometido REAL de Bodega (lo que RN5 pide), vía commitment-detail.
    mockedApi.inventory.porServir.mockResolvedValue({
      data: [{ order_id: 9, order_number: 'PED-009', customer_name: 'Cliente X', project_name: null, stage: 'por_despachar', quantity: 4 }],
    })

    renderPage()
    fireEvent.click(await screen.findByText('bodega:adjustments.actions.new'))

    const search = await screen.findByPlaceholderText('bodega:adjustments.newModal.searchProduct')
    fireEvent.change(search, { target: { value: 'CRISTAL' } })
    fireEvent.click(await screen.findByText(/CRISTAL-IMPERIAL/))

    fireEvent.click(await screen.findByText('bodega:adjustments.newModal.addWarehouse'))

    // Sin cambiar el tipo (default "Sumar") no debe verse la advertencia.
    expect(screen.queryByText(/committedWarning/)).not.toBeInTheDocument()

    const typeSelects = screen.getAllByRole('combobox').filter(el => el.querySelector('option[value="Restar"]'))
    fireEvent.change(typeSelects[0], { target: { value: 'Restar' } })

    expect(await screen.findByText(/committedWarning/)).toBeInTheDocument()
  })

  it('RN5 regresión — un valor alto en productWarehouseStock.por_servir (concepto V&D) por sí solo NO dispara la advertencia', async () => {
    // Bug real encontrado en Pre-QA 2026-07-28: dev.atlanticerp.ai devolvía por_servir=6 en
    // /bodega/inventory (comprometido real) pero por_servir=0 en /adjustment-requests/products/
    // {id}/warehouse-stock para el MISMO producto (LAMP-COL-001) — son conceptos distintos
    // (ver docblock en SolicitudAjustePage.tsx). Este test fija el caso inverso: si algún día
    // warehouse-stock volviera a traer un por_servir>0 "de casualidad", eso NO debe ser lo que
    // dispare RN5 — solo el comprometido real de Bodega (`inventory.porServir`) debe hacerlo.
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    mockedApi.adjustmentRequests.searchProducts.mockResolvedValue({
      data: [{ id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' }],
    })
    mockedApi.adjustmentRequests.productWarehouseStock.mockResolvedValue({
      por_servir: 99, // concepto V&D con valor alto — no debe influir en RN5
      warehouses: WAREHOUSES.map(w => ({ warehouse_id: w.id, name: w.name, quantity: 10 })),
    })
    mockedApi.inventory.porServir.mockResolvedValue({ data: [] }) // 0 comprometido REAL de Bodega

    renderPage()
    fireEvent.click(await screen.findByText('bodega:adjustments.actions.new'))

    const search = await screen.findByPlaceholderText('bodega:adjustments.newModal.searchProduct')
    fireEvent.change(search, { target: { value: 'CRISTAL' } })
    fireEvent.click(await screen.findByText(/CRISTAL-IMPERIAL/))

    fireEvent.click(await screen.findByText('bodega:adjustments.newModal.addWarehouse'))
    const typeSelects = screen.getAllByRole('combobox').filter(el => el.querySelector('option[value="Restar"]'))
    fireEvent.change(typeSelects[0], { target: { value: 'Restar' } })

    await waitFor(() => expect(mockedApi.inventory.porServir).toHaveBeenCalled())
    expect(screen.queryByText(/committedWarning/)).not.toBeInTheDocument()
  })

  // ── Ver detalle (SCRUM-797 CA5/CA8/CA9) ───────────────────────────────────────

  it('SCRUM-797 CA5 — "Ver detalle" abre el modal con descripción, responsable y evidencia (sin fetch adicional)', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue({
      data: [{
        id: 42, producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
        bodega: 'Bodega Central', tipo: 'Restar', cantidad: 3, motivo: 'PRODUCTO_DANADO_ROTO',
        descripcion: 'Se rompió durante el traslado.', responsable: 'Jorge Pérez',
        evidencia_url: 'https://s3.example.com/evidencia.jpg', solicitado_por: 'Jorge P.', fecha: '2026-07-21T10:00:00Z',
        estado: 'Pendiente', motivo_rechazo: null, resuelto_por: null,
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: false,
    })
    renderPage()

    fireEvent.click(await screen.findByText('bodega:adjustments.table.viewDetail'))

    expect(await screen.findByText('Se rompió durante el traslado.')).toBeInTheDocument()
    expect(screen.getByText('Jorge Pérez')).toBeInTheDocument()
    // La fila y el modal comparten la misma etiqueta de evidencia — 2 enlaces en total.
    expect(screen.getAllByText('bodega:adjustments.table.view')).toHaveLength(2)
    // Sin fetch propio — la fila ya vino completa del `index()` mockeado arriba.
    expect(mockedApi.adjustmentRequests.list).toHaveBeenCalledTimes(1)
  })

  it('SCRUM-797 CA8/CA9 — "Ver detalle" de una línea rechazada muestra el motivo de rechazo', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue({
      data: [{
        id: 43, producto: { id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' },
        bodega: 'Merma', tipo: 'Restar', cantidad: 1, motivo: 'ROBO_O_PERDIDA',
        descripcion: null, responsable: null,
        evidencia_url: null, solicitado_por: 'Jorge P.', fecha: '2026-07-21T10:00:00Z',
        estado: 'Rechazada', motivo_rechazo: 'Ya existe un ajuste aprobado para este producto.', resuelto_por: 'Mark',
      }],
      meta: { total: 1, per_page: 5, current_page: 1, last_page: 1 }, can_approve: false,
    })
    renderPage()

    fireEvent.click(await screen.findByText('bodega:adjustments.table.viewDetail'))

    expect(await screen.findByText('Ya existe un ajuste aprobado para este producto.')).toBeInTheDocument()
    expect(screen.getByText('bodega:adjustments.detailModal.descriptionEmpty')).toBeInTheDocument()
    expect(screen.getByText('bodega:adjustments.detailModal.responsibleEmpty')).toBeInTheDocument()
  })

  // ── SCRUM-797 RN5→RN7 — duplicados en Nueva solicitud ─────────────────────────

  async function fillAndSubmitNewRequest() {
    fireEvent.click(await screen.findByText('bodega:adjustments.actions.new'))
    const search = await screen.findByPlaceholderText('bodega:adjustments.newModal.searchProduct')
    fireEvent.change(search, { target: { value: 'CRISTAL' } })
    fireEvent.click(await screen.findByText(/CRISTAL-IMPERIAL/))
    fireEvent.click(await screen.findByText('bodega:adjustments.newModal.addWarehouse'))

    fireEvent.change(screen.getByPlaceholderText('bodega:adjustments.newModal.quantity'), { target: { value: '3' } })
    const motivoSelect = (await screen.findByText('bodega:adjustments.newModal.reasonPlaceholder')).closest('select') as HTMLSelectElement
    fireEvent.change(motivoSelect, { target: { value: 'CONTEO_FISICO_NO_COINCIDE' } })
    const file = new File(['foto'], 'evidencia.jpg', { type: 'image/jpeg' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })

    fireEvent.click(screen.getByText('bodega:adjustments.newModal.submit'))
  }

  it('SCRUM-797 RN6 — 409 al enviar la solicitud muestra el modal de duplicados', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    mockedApi.adjustmentRequests.searchProducts.mockResolvedValue({
      data: [{ id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' }],
    })
    mockedApi.adjustmentRequests.create.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { duplicates: [{ warehouse_id: 3, warehouse_name: 'Bodega Central', adjustment: { id: 9, fecha: '2026-08-20T10:00:00Z' }, general_count: null }] },
      },
    })

    renderPage()
    await fillAndSubmitNewRequest()

    expect(await screen.findByText('bodega:adjustments.duplicateModal.title')).toBeInTheDocument()
    expect(screen.getByText('Bodega Central')).toBeInTheDocument()
  })

  it('SCRUM-797 RN7 — confirmar el duplicado reintenta create() con confirmReplace y cierra el modal', async () => {
    mockedApi.adjustmentRequests.list.mockResolvedValue(EMPTY)
    mockedApi.adjustmentRequests.searchProducts.mockResolvedValue({
      data: [{ id: 1, reference: 'CRISTAL-IMPERIAL', description: 'Candelabro' }],
    })
    mockedApi.adjustmentRequests.create.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: { duplicates: [{ warehouse_id: 3, warehouse_name: 'Bodega Central', adjustment: { id: 9, fecha: '2026-08-20T10:00:00Z' }, general_count: null }] },
      },
    })
    mockedApi.adjustmentRequests.create.mockResolvedValueOnce({ id: 12 })

    renderPage()
    await fillAndSubmitNewRequest()
    await screen.findByText('bodega:adjustments.duplicateModal.title')

    fireEvent.click(screen.getByText('bodega:adjustments.duplicateModal.confirm'))

    await waitFor(() => expect(mockedApi.adjustmentRequests.create).toHaveBeenLastCalledWith(
      1, [expect.objectContaining({ motivo: 'CONTEO_FISICO_NO_COINCIDE' })], true,
    ))
    expect(screen.queryByText('bodega:adjustments.duplicateModal.title')).not.toBeInTheDocument()
  })
})
