import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import NotasCreditoPage from './NotasCreditoPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { NotaCreditoResumenMes, NotaCreditoHistorialResult } from '@/types/adminContab'

// Batch 10 (SCRUM-553→558, REQ-476→481) — apertura de Notas Crédito y Devoluciones: 5 tarjetas del
// mes (REQ-477), botón "+ Nueva nota" abre el formulario en modo manual (REQ-476). Batch 12
// (SCRUM-565→570, REQ-491/492) reemplaza el placeholder de historial por la tabla real +
// entry point real desde la cola de devoluciones confirmadas por Bodega.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    payments: { searchClients: vi.fn() },
    bankAccounts: { list: vi.fn() },
    notasCredito: {
      resumenMes: vi.fn(), itbmsRates: vi.fn(), facturas: vi.fn(), register: vi.fn(),
      historial: vi.fn(), detail: vi.fn(), previewCorreccion: vi.fn(), registerCorreccion: vi.fn(),
      devolucionDetail: vi.fn(),
    },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeResumen(overrides: Partial<NotaCreditoResumenMes> = {}): NotaCreditoResumenMes {
  return {
    total_acreditado: 650,
    numero_notas: 4,
    pendientes_aprobacion_monto: 12250,
    pendientes_aprobacion_cantidad: 1,
    devoluciones_por_generar: 1,
    nota_promedio: 217,
    primary_approval_threshold: 5000,
    ...overrides,
  }
}

function makeHistorial(overrides: Partial<NotaCreditoHistorialResult> = {}): NotaCreditoHistorialResult {
  return {
    data: [],
    meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 },
    ...overrides,
  }
}

function renderPage(initialEntries: string[] = ['/admin-contab/notas-credito']) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <NotasCreditoPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.notasCredito.resumenMes.mockResolvedValue(makeResumen())
  mockedApi.notasCredito.itbmsRates.mockResolvedValue([])
  mockedApi.notasCredito.facturas.mockResolvedValue([])
  mockedApi.notasCredito.historial.mockResolvedValue(makeHistorial())
  mockedApi.payments.searchClients.mockResolvedValue([])
  mockedApi.bankAccounts.list.mockResolvedValue([])
})

describe('NotasCreditoPage — REQ-477 tarjetas del mes', () => {
  it('muestra las 5 tarjetas de indicadores', async () => {
    renderPage()
    await screen.findByText(/650\.00/)
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/12,250\.00/)).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText(/217\.00/)).toBeInTheDocument()
  })
})

describe('NotasCreditoPage — REQ-476 apertura del formulario', () => {
  it('el botón "+ Nueva nota" abre el formulario en modo manual', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('notasCredito.nuevaNotaButton'))
    expect(await screen.findByText('notasCredito.formulario.title')).toBeInTheDocument()
    // Modo manual: el campo Cliente es un input editable, no el bloque de solo lectura.
    expect(screen.getByPlaceholderText('notasCredito.formulario.clientePlaceholder')).toBeInTheDocument()
  })
})

describe('NotasCreditoPage — REQ-491 cola de devoluciones confirmadas por Bodega', () => {
  it('clic en una fila de la cola pide el detalle real y abre el formulario con cliente bloqueado y datos precargados', async () => {
    mockedApi.notasCredito.historial.mockResolvedValue(makeHistorial({
      data: [{
        id: null,
        tipo: null,
        subtipo_anulacion: null,
        numero: null,
        cliente: 'Grupo Sensei',
        master_client_id: 1,
        estado: 'pendiente_generar_nota',
        monto: null,
        fecha: '2026-08-20',
        factura_origen_numero: 'HS-3402',
        registrado_por: null,
        devolucion_bodega_id: null,
        customer_return_id: 42,
      }],
    }))
    // Shape real de `GET /notas-credito/devoluciones/{customerReturnId}` — más angosto que lo que
    // el formulario necesita, ver docblock de `NotaCreditoDevolucionDetail`.
    mockedApi.notasCredito.devolucionDetail.mockResolvedValue({
      customer_return_id: 42,
      return_number: 'DEV-2026-0042',
      master_client_id: 1,
      cliente: 'Grupo Sensei',
      factura_origen_id: 5,
      factura_origen_numero: 'HS-3402',
      project: 'Proyecto Paso a Bodega 1',
      contact_name: 'PERSONA QUE DEVUELVE DANIELA',
      contact_phone: '54345434',
      has_signed_document: true,
      productos: [{ reference: 'LED-100', description: 'Luminaria LED', unit_price: null, qty_received: 2, reason: null, reason_detail: null }],
    })
    mockedApi.notasCredito.facturas.mockResolvedValue([
      { id: 5, numero: 'HS-3402', monto: 500, saldo_pendiente: 500, itbms_percentage: 7, itbms_rate_id: null, sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null },
    ])
    renderPage()
    fireEvent.click(await screen.findByText('HS-3402'))
    expect(await screen.findByText('notasCredito.formulario.tipoDevolucionReadonly')).toBeInTheDocument()
    // SCRUM-865 punto 2 — el backend ya trae proyecto/persona que devuelve/conformidad cuando
    // Bodega los capturó; el formulario debe mostrar el dato real, no el placeholder.
    expect(screen.getByText('Proyecto Paso a Bodega 1')).toBeInTheDocument()
    expect(screen.getByText('PERSONA QUE DEVUELVE DANIELA — 54345434')).toBeInTheDocument()
    expect(screen.getByText('notasCredito.formulario.conformidadVerDocumento')).toBeInTheDocument()
    expect(screen.queryByText('notasCredito.formulario.precargaDatoNoDisponible')).not.toBeInTheDocument()
    expect(screen.getByText(/Luminaria LED/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('notasCredito.formulario.clientePlaceholder')).not.toBeInTheDocument()
  })

  it('SCRUM-865 punto 2 — si Bodega NO capturó persona/proyecto/documento para una devolución vieja, mantiene el placeholder explícito', async () => {
    mockedApi.notasCredito.historial.mockResolvedValue(makeHistorial({
      data: [{
        id: null, tipo: null, subtipo_anulacion: null, numero: null,
        cliente: 'Grupo Sensei', master_client_id: 1, estado: 'pendiente_generar_nota',
        monto: null, fecha: '2026-08-20', factura_origen_numero: 'HS-3402',
        registrado_por: null, devolucion_bodega_id: null, customer_return_id: 43,
      }],
    }))
    mockedApi.notasCredito.devolucionDetail.mockResolvedValue({
      customer_return_id: 43,
      return_number: 'DEV-2026-0043',
      master_client_id: 1,
      cliente: 'Grupo Sensei',
      factura_origen_id: 5,
      factura_origen_numero: 'HS-3402',
      project: null,
      contact_name: '',
      contact_phone: '',
      has_signed_document: false,
      productos: [{ reference: 'LED-100', description: 'Luminaria LED', unit_price: null, qty_received: 2, reason: null, reason_detail: null }],
    })
    mockedApi.notasCredito.facturas.mockResolvedValue([
      { id: 5, numero: 'HS-3402', monto: 500, saldo_pendiente: 500, itbms_percentage: 7, itbms_rate_id: null, sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null },
    ])
    renderPage()
    fireEvent.click(await screen.findByText('HS-3402'))
    expect(await screen.findByText('notasCredito.formulario.tipoDevolucionReadonly')).toBeInTheDocument()
    expect(screen.getAllByText('notasCredito.formulario.precargaDatoNoDisponible').length).toBeGreaterThan(0)
    expect(screen.queryByText('notasCredito.formulario.conformidadVerDocumento')).not.toBeInTheDocument()
  })

  /** SCRUM-1116 (Pre-QA obs. 3) — el modal abierto desde una devolución no mostraba el aviso "ya acreditado" porque la
   *  precarga no pasaba `notas_previas_total` (ni `monto_acreditable`). Ahora los toma del detalle o, si no vienen, de la factura. */
  it('SCRUM-1116 — la precarga desde una devolución muestra el aviso de notas previas con los valores de la factura', async () => {
    mockedApi.notasCredito.historial.mockResolvedValue(makeHistorial({
      data: [{
        id: null, tipo: null, subtipo_anulacion: null, numero: null,
        cliente: 'Grupo Sensei', master_client_id: 1, estado: 'pendiente_generar_nota',
        monto: null, fecha: '2026-08-20', factura_origen_numero: 'HS-3402',
        registrado_por: null, devolucion_bodega_id: null, customer_return_id: 44,
      }],
    }))
    mockedApi.notasCredito.devolucionDetail.mockResolvedValue({
      customer_return_id: 44, return_number: 'DEV-2026-0044', master_client_id: 1, cliente: 'Grupo Sensei',
      factura_origen_id: 5, factura_origen_numero: 'HS-3402', project: null, contact_name: '', contact_phone: '',
      has_signed_document: false,
      productos: [{ reference: 'LED-100', description: 'Luminaria LED', unit_price: 100, qty_received: 2, reason: null, reason_detail: null }],
    })
    mockedApi.notasCredito.facturas.mockResolvedValue([
      { id: 5, numero: 'HS-3402', monto: 500, saldo_pendiente: 500, monto_acreditable: 350, notas_previas_total: 150, itbms_percentage: 7, itbms_rate_id: null, sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null },
    ])
    renderPage()
    fireEvent.click(await screen.findByText('HS-3402'))
    expect(await screen.findByText('notasCredito.formulario.tipoDevolucionReadonly')).toBeInTheDocument()
    expect(screen.getByTestId('nota-credito-acreditable')).toBeInTheDocument()
  })

  /** SCRUM-786 — antes `unit_price` no existía en el backend y el monto sugerido siempre
   *  arrancaba en $0.00; ahora se precarga con el valor real cuando el backend lo trae. */
  it('precarga el monto sugerido con el unit_price real del producto devuelto (SCRUM-786)', async () => {
    mockedApi.notasCredito.historial.mockResolvedValue(makeHistorial({
      data: [{
        id: null, tipo: null, subtipo_anulacion: null, numero: null,
        cliente: 'Grupo Sensei', master_client_id: 1, estado: 'pendiente_generar_nota',
        monto: null, fecha: '2026-08-20', factura_origen_numero: 'HS-3402',
        registrado_por: null, devolucion_bodega_id: null, customer_return_id: 42,
      }],
    }))
    mockedApi.notasCredito.devolucionDetail.mockResolvedValue({
      customer_return_id: 42,
      return_number: 'DEV-2026-0042',
      master_client_id: 1,
      cliente: 'Grupo Sensei',
      factura_origen_id: 5,
      factura_origen_numero: 'HS-3402',
      project: null,
      contact_name: '',
      contact_phone: '',
      has_signed_document: false,
      productos: [{ reference: 'LED-100', description: 'Luminaria LED', unit_price: 45.5, qty_received: 2, reason: null, reason_detail: null }],
    })
    mockedApi.notasCredito.facturas.mockResolvedValue([
      { id: 5, numero: 'HS-3402', monto: 500, saldo_pendiente: 500, itbms_percentage: 7, itbms_rate_id: null, sales_project_id: null, proyecto: null, quote_id: null, cotizacion_folio: null },
    ])
    renderPage()
    fireEvent.click(await screen.findByText('HS-3402'))
    await screen.findByText(/Luminaria LED/)
    // 2 unidades × $45.50 = $91.00 neto (línea del producto, sin ITBMS) — antes de SCRUM-786 habría sido $0.00 siempre.
    expect(screen.getAllByText(/91\.00/).length).toBeGreaterThan(0)
    // El monto sugerido es el total CON ITBMS 7 %: 91.00 × 1.07 = 97.37 (NC-0001, 2026-10-06 — antes quedaba en 91.00 y la NC acreditaba solo el neto).
    expect(screen.getByDisplayValue('97.37')).toBeInTheDocument()
  })

  it('si falla el detalle de la devolución, muestra un error en vez de abrir el formulario', async () => {
    mockedApi.notasCredito.historial.mockResolvedValue(makeHistorial({
      data: [{
        id: null, tipo: null, subtipo_anulacion: null, numero: null,
        cliente: 'Grupo Sensei', master_client_id: 1, estado: 'pendiente_generar_nota',
        monto: null, fecha: '2026-08-20', factura_origen_numero: 'HS-3402',
        registrado_por: null, devolucion_bodega_id: null, customer_return_id: 42,
      }],
    }))
    mockedApi.notasCredito.devolucionDetail.mockRejectedValue(new Error('network error'))
    renderPage()
    fireEvent.click(await screen.findByText('HS-3402'))
    expect(await screen.findByText('notasCredito.historial.precargaError')).toBeInTheDocument()
    expect(screen.queryByText('notasCredito.formulario.tipoDevolucionReadonly')).not.toBeInTheDocument()
  })
})
