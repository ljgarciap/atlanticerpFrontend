import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import SolicitudesReversoPanel from './SolicitudesReversoPanel'
import { adminContabApi } from '@/api/adminContabApi'
import { useAuthStore } from '@/store/authStore'
import type { ReversalRequest, ReversalRequestsResult } from '@/types/adminContab'

// SCRUM-1168 F4 — solicitudes de anulación de cobros: las ven todos los de Cobros, solo Gerencia decide.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      let out = key
      for (const [k, v] of Object.entries(opts)) out += `:${k}=${v}`
      return out
    },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({ adminContabApi: { reversals: { list: vi.fn(), decide: vi.fn() } } }))
vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi = vi.mocked(adminContabApi, true)
const mockedStore = vi.mocked(useAuthStore)

function solicitud(overrides: Partial<ReversalRequest> = {}): ReversalRequest {
  return {
    id: 5, tipo: 'anulacion', estado: 'solicitada', master_client_id: 7, payment_id: 11, source_type: null, source_id: null, monto: 500,
    motivo: 'Monto mal digitado', motivo_rechazo: null, created_at: '2026-10-19T10:00:00Z', decided_at: null,
    numero_recibo: 'REC-011', cliente: 'Vitrio Retail, S.A.', solicitada_por: 'Contabilidad Test', decidida_por: null, ...overrides,
  }
}

function lista(rows: ReversalRequest[]): ReversalRequestsResult {
  return { rows, total: rows.length, meta: { total: rows.length, per_page: 50, current_page: 1, last_page: 1 } }
}

function comoUsuario(role: string, markApprover?: boolean) {
  mockedStore.mockImplementation(((sel: (s: unknown) => unknown) => sel({ user: { role, permissions: role === 'superadmin' ? ['superadmin.all'] : [], flags: { primary_approver: markApprover } } })) as never)
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<MemoryRouter><QueryClientProvider client={qc}><SolicitudesReversoPanel /></QueryClientProvider></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.reversals.list.mockResolvedValue(lista([solicitud()]))
})

describe('SolicitudesReversoPanel', () => {
  it('sin solicitudes pendientes no muestra nada', async () => {
    comoUsuario('lider_admin_contab')
    mockedApi.reversals.list.mockResolvedValue(lista([]))
    const { container } = renderPanel()
    await waitFor(() => expect(mockedApi.reversals.list).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('Contabilidad ve las solicitudes pero no puede aprobar ni rechazar', async () => {
    comoUsuario('lider_admin_contab', false)
    renderPanel()

    expect(await screen.findByTestId('solicitud-5')).toHaveTextContent('REC-011')
    expect(screen.getByTestId('solicitud-5')).toHaveTextContent('Monto mal digitado')
    expect(screen.queryByText('solicitudesReverso.aprobar')).not.toBeInTheDocument()
    expect(screen.queryByText('solicitudesReverso.rechazar')).not.toBeInTheDocument()
  })

  it('Gerencia aprueba en dos pasos y se le avisa del descuento de comisión que quedó registrado', async () => {
    comoUsuario('management', true)
    mockedApi.reversals.decide.mockResolvedValue({ ...solicitud({ estado: 'ejecutada' }), ajustes_comision: [{ vendedor_id: 3, pedido_id: 9, monto: 225 }] })
    renderPanel()

    fireEvent.click(await screen.findByText('solicitudesReverso.aprobar'))
    expect(mockedApi.reversals.decide).not.toHaveBeenCalled()   // pide confirmar antes de ejecutar
    fireEvent.click(screen.getByText('solicitudesReverso.confirmarSi'))

    await waitFor(() => expect(mockedApi.reversals.decide).toHaveBeenCalledWith(5, true, undefined))
    expect(await screen.findByTestId('solicitud-resultado')).toHaveTextContent('solicitudesReverso.descuentoComision')
  })

  // Fase 13 (2.4) — tras anular un cobro, si hay saldo a favor para cubrir las facturas reabiertas se sugiere compensar (solo informa).
  it('Fase 13 — al aprobar una anulación con saldo a favor disponible sugiere compensar y enlaza a Compensaciones; sin sugerencia no muestra nada', async () => {
    comoUsuario('management', true)
    mockedApi.reversals.decide.mockResolvedValue({
      ...solicitud({ estado: 'ejecutada' }),
      sugerencia_compensacion: { master_client_id: 7, saldo_a_favor: 120, pendiente_total: 300, compensable: 120, facturas: [{ invoice_id: 9, numero: 'F-9', pendiente: 300 }] },
    })
    renderPanel()

    fireEvent.click(await screen.findByText('solicitudesReverso.aprobar'))
    fireEvent.click(screen.getByText('solicitudesReverso.confirmarSi'))

    const caja = await screen.findByTestId('sugerencia-compensacion')
    expect(caja).toHaveTextContent('solicitudesReverso.sugerenciaCompensacion')
    expect(caja).toHaveTextContent('120.00')
    expect(screen.getByText('solicitudesReverso.irACompensaciones').closest('a')).toHaveAttribute('href', '/admin-contab/compensaciones')
  })

  it('Fase 13 — una aprobación sin sugerencia no muestra el aviso de compensación', async () => {
    comoUsuario('management', true)
    mockedApi.reversals.decide.mockResolvedValue({ ...solicitud({ estado: 'ejecutada' }), sugerencia_compensacion: null })
    renderPanel()

    fireEvent.click(await screen.findByText('solicitudesReverso.aprobar'))
    fireEvent.click(screen.getByText('solicitudesReverso.confirmarSi'))
    await screen.findByTestId('solicitud-resultado')
    expect(screen.queryByTestId('sugerencia-compensacion')).not.toBeInTheDocument()
  })

  // Fase 13 (2.3) — reversar una compensación se solicita y lo decide el aprobador (o un suplente, que carga la misma bandera).
  it('Fase 13 — muestra la solicitud de reverso de una compensación y el aprobador (o suplente) la aprueba', async () => {
    comoUsuario('management', true)
    mockedApi.reversals.list.mockResolvedValue(lista([solicitud({ id: 8, tipo: 'reverso_compensacion', payment_id: null, source_type: 'compensacion' as never, source_id: 3, monto: 250, motivo: 'Cruce con el cliente equivocado', numero_recibo: null })]))
    mockedApi.reversals.decide.mockResolvedValue(solicitud({ id: 8, tipo: 'reverso_compensacion', estado: 'ejecutada' }))
    renderPanel()

    expect(await screen.findByTestId('solicitud-8')).toHaveTextContent('solicitudesReverso.reversarCruce')
    expect(screen.getByTestId('solicitud-8')).toHaveTextContent('Cruce con el cliente equivocado')

    fireEvent.click(screen.getByText('solicitudesReverso.aprobar'))
    fireEvent.click(screen.getByText('solicitudesReverso.confirmarSi'))
    await waitFor(() => expect(mockedApi.reversals.decide).toHaveBeenCalledWith(8, true, undefined))
    expect(await screen.findByTestId('solicitud-resultado')).toHaveTextContent('solicitudesReverso.aprobadaReverso')
  })

  it('Gerencia rechaza solo con motivo', async () => {
    comoUsuario('management', true)
    mockedApi.reversals.decide.mockResolvedValue(solicitud({ estado: 'rechazada' }))
    renderPanel()

    fireEvent.click(await screen.findByText('solicitudesReverso.rechazar'))
    const confirmar = within(screen.getByTestId('solicitud-confirmar')).getByText('solicitudesReverso.rechazar')
    expect(confirmar).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('solicitudesReverso.motivoRechazo'), { target: { value: 'El cobro está bien' } })
    expect(confirmar).not.toBeDisabled()
    fireEvent.click(confirmar)

    await waitFor(() => expect(mockedApi.reversals.decide).toHaveBeenCalledWith(5, false, 'El cobro está bien'))
  })

  it('una devolución muestra referencia y comprobante, y Gerencia la aprueba con su propio mensaje', async () => {
    comoUsuario('management', true)
    mockedApi.reversals.list.mockResolvedValue(lista([solicitud({ id: 8, tipo: 'devolucion', payment_id: null, source_type: 'cobro', source_id: 11, referencia: 'TRF-77', tiene_comprobante: true, comprobante_url: 'https://s3/x.pdf', numero_recibo: null })]))
    mockedApi.reversals.decide.mockResolvedValue(solicitud({ id: 8, tipo: 'devolucion', estado: 'ejecutada' }))
    renderPanel()

    expect(await screen.findByText('solicitudesReverso.devolver')).toBeInTheDocument()
    expect(screen.getByTestId('solicitud-8')).toHaveTextContent('TRF-77')
    expect(screen.getByText('solicitudesReverso.verComprobante')).toHaveAttribute('href', 'https://s3/x.pdf')

    fireEvent.click(screen.getByText('solicitudesReverso.aprobar'))
    expect(screen.getByText('solicitudesReverso.confirmarAprobarDevolucion')).toBeInTheDocument()
    fireEvent.click(screen.getByText('solicitudesReverso.confirmarSi'))
    expect(await screen.findByTestId('solicitud-resultado')).toHaveTextContent('solicitudesReverso.aprobadaDevolucion')
  })

  it('superadmin también puede decidir', async () => {
    comoUsuario('superadmin')
    renderPanel()
    expect(await screen.findByText('solicitudesReverso.aprobar')).toBeInTheDocument()
  })

  it('muestra el mensaje del servidor si la decisión falla', async () => {
    comoUsuario('management', true)
    mockedApi.reversals.decide.mockRejectedValue(Object.assign(new Error('x'), { isAxiosError: true, response: { data: { message: 'Esta solicitud ya fue resuelta.' } } }))
    renderPanel()

    fireEvent.click(await screen.findByText('solicitudesReverso.aprobar'))
    fireEvent.click(screen.getByText('solicitudesReverso.confirmarSi'))

    expect(await screen.findByRole('alert')).toHaveTextContent('ya fue resuelta')
  })
})
