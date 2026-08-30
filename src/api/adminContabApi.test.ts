import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as axiosModule from 'axios'
import type { CreatePaymentPayload, Payment } from '@/types/adminContab'

// Batch 6 del cuerpo principal (SCRUM-545, REQ-468) — cubre específicamente el bug real encontrado
// en Senior Review de este mismo batch: `register()` con `comprobante` arma un FormData a mano, y
// `String(true)`/`String(false)` da "true"/"false" — la regla `boolean` de Laravel solo acepta
// 1/0/"1"/"0", así que un registro con comprobante + saldo a favor aplicado fallaba 422 en
// silencio antes de este ajuste. Mismo patrón de mock de axios que authApi.test.ts (no hay
// axios-mock-adapter/msw en este repo).
vi.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    post: vi.fn(), get: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
  }
  return { default: { create: vi.fn(() => instance) }, __mockInstance: instance }
})

const mockInstance = (
  axiosModule as unknown as { __mockInstance: { post: ReturnType<typeof vi.fn> } }
).__mockInstance

const { adminContabApi } = await import('./adminContabApi')

function basePayload(overrides: Partial<CreatePaymentPayload> = {}): CreatePaymentPayload {
  return {
    master_client_id: 7,
    invoice_ids: [1, 2],
    aplicar_saldo_favor: true,
    metodo_pago: 'transferencia',
    monto_recibido_estimado: 5700,
    bank_account_id: 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInstance.post.mockResolvedValue({ data: { id: 1, estado: 'esperando_confirmacion' } as Payment })
})

describe('adminContabApi.payments.register', () => {
  it('sin comprobante manda JSON plano', async () => {
    await adminContabApi.payments.register(basePayload())

    const [, body, config] = mockInstance.post.mock.calls[0]
    expect(body).toEqual(basePayload())
    expect(config).toBeUndefined()
  })

  it('con comprobante manda multipart y aplicar_saldo_favor=true serializa como "1", no "true"', async () => {
    const file = new File(['x'], 'comprobante.pdf', { type: 'application/pdf' })
    await adminContabApi.payments.register(basePayload({ comprobante: file, aplicar_saldo_favor: true }))

    const [, body, config] = mockInstance.post.mock.calls[0]
    expect(body).toBeInstanceOf(FormData)
    expect((config as { headers: Record<string, string> }).headers['Content-Type']).toBe('multipart/form-data')
    expect((body as FormData).get('aplicar_saldo_favor')).toBe('1')
    expect((body as FormData).get('comprobante')).toBe(file)
  })

  it('con comprobante y aplicar_saldo_favor=false serializa como "0", no "false"', async () => {
    const file = new File(['x'], 'comprobante.pdf', { type: 'application/pdf' })
    await adminContabApi.payments.register(basePayload({ comprobante: file, aplicar_saldo_favor: false }))

    const body = mockInstance.post.mock.calls[0][1] as FormData
    expect(body.get('aplicar_saldo_favor')).toBe('0')
  })

  it('con comprobante manda cada invoice_id como invoice_ids[] repetido', async () => {
    const file = new File(['x'], 'comprobante.pdf', { type: 'application/pdf' })
    await adminContabApi.payments.register(basePayload({ comprobante: file, invoice_ids: [1, 2] }))

    const body = mockInstance.post.mock.calls[0][1] as FormData
    expect(body.getAll('invoice_ids[]')).toEqual(['1', '2'])
  })
})

// Batch 20 (SCRUM-612, REQ-535) — createExpenses siempre manda multipart (cada línea trae una
// foto obligatoria), con índices `lineas[i][campo]` para que Laravel arme el array de líneas.
describe('adminContabApi.pettyCash.createExpenses', () => {
  it('serializa múltiples líneas con índice y adjunta cada foto', async () => {
    const foto1 = new File(['a'], 'recibo1.jpg', { type: 'image/jpeg' })
    const foto2 = new File(['b'], 'recibo2.jpg', { type: 'image/jpeg' })

    await adminContabApi.pettyCash.createExpenses([
      { fecha: '2026-08-01', solicitante_id: 5, proveedor: 'Cafetería', descripcion: 'Café', monto_bruto: '18.50', itbms: '1.30', foto: foto1 },
      { fecha: '2026-08-02', solicitante_id: 7, proveedor: 'Farmacia', descripcion: 'Botiquín', monto_bruto: '32.00', itbms: '0', foto: foto2 },
    ])

    const [, body, config] = mockInstance.post.mock.calls[0]
    expect(body).toBeInstanceOf(FormData)
    expect((config as { headers: Record<string, string> }).headers['Content-Type']).toBe('multipart/form-data')
    const form = body as FormData
    expect(form.get('lineas[0][proveedor]')).toBe('Cafetería')
    expect(form.get('lineas[0][solicitante_id]')).toBe('5')
    expect(form.get('lineas[0][itbms]')).toBe('1.30')
    expect(form.get('lineas[0][foto]')).toBe(foto1)
    expect(form.get('lineas[1][proveedor]')).toBe('Farmacia')
    expect(form.get('lineas[1][itbms]')).toBe('0')
    expect(form.get('lineas[1][foto]')).toBe(foto2)
  })
})
