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
      productos: [{ reference: 'LED-100', description: 'Luminaria LED', unit_price: null, qty_received: 2, reason: null, reason_detail: null }],
    })
    mockedApi.notasCredito.facturas.mockResolvedValue([
      { id: 5, numero: 'HS-3402', monto: 500, saldo_pendiente: 500, itbms_percentage: 7, itbms_rate_id: null },
    ])
    renderPage()
    fireEvent.click(await screen.findByText('HS-3402'))
    expect(await screen.findByText('notasCredito.formulario.tipoDevolucionReadonly')).toBeInTheDocument()
    // persona_devuelve/conformidad no existen en el backend (CustomerReturnLine no los trackea) —
    // el formulario muestra el placeholder explícito, nunca un dato inventado.
    expect(screen.getAllByText('notasCredito.formulario.precargaDatoNoDisponible').length).toBeGreaterThan(0)
    expect(screen.getByText(/Luminaria LED/)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('notasCredito.formulario.clientePlaceholder')).not.toBeInTheDocument()
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
      productos: [{ reference: 'LED-100', description: 'Luminaria LED', unit_price: 45.5, qty_received: 2, reason: null, reason_detail: null }],
    })
    mockedApi.notasCredito.facturas.mockResolvedValue([
      { id: 5, numero: 'HS-3402', monto: 500, saldo_pendiente: 500, itbms_percentage: 7, itbms_rate_id: null },
    ])
    renderPage()
    fireEvent.click(await screen.findByText('HS-3402'))
    await screen.findByText(/Luminaria LED/)
    // 2 unidades × $45.50 = $91.00 — antes de este fix habría sido $0.00 siempre.
    expect(screen.getByText(/91\.00/)).toBeInTheDocument()
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
