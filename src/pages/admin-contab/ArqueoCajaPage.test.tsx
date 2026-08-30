import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ArqueoCajaPage from './ArqueoCajaPage'
import { adminContabApi } from '@/api/adminContabApi'
import { useAuthStore } from '@/store/authStore'
import type {
  CashPositionHeader, CashPositionProjected, CashPositionReal, DailyCashCount,
} from '@/types/adminContab'
import type { UserInfo } from '@/types/auth'

// Batch 18 (SCRUM-597→601, REQ-520→524) — Arqueo / Flujo de Caja, parte 1. Cubre: 4 tarjetas
// (REQ-520), vista proyectada 2 columnas (REQ-521), toggle+chips y default por rol (REQ-522),
// vista real histórico (REQ-523), arqueo del día con observación editable (REQ-524), y la
// restricción de rol de Yaneth (sin Proyectado/Real 30-90d) y de Gerencia (sin Arqueo del día).

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

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    cashPosition: {
      header: vi.fn(),
      projected: vi.fn(),
      real: vi.fn(),
      dailyCount: vi.fn(),
      updateEntryObservation: vi.fn(),
      updateGeneralObservation: vi.fn(),
      export: vi.fn(),
      // Batch 19 (SCRUM-602→606, REQ-525→529).
      closeDailyCount: vi.fn(),
      history: vi.fn(),
      historyDetail: vi.fn(),
      approve: vi.fn(),
      exportDailyCount: vi.fn(),
      exportHistory: vi.fn(),
    },
    payments: {
      uploadRetentionAttachment: vi.fn(),
    },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(adminContabApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeHeader(overrides: Partial<CashPositionHeader> = {}): CashPositionHeader {
  return { saldo_disponible_hoy: 28740, saldo_bancos: 28400, saldo_caja_menuda: 340, ...overrides }
}

function makeProjected(overrides: Partial<CashPositionProjected> = {}): CashPositionProjected {
  return {
    window_days: 30,
    entradas: [{ nombre: 'Hotel Riu — Lobby y piscina', referencia: 'F-4421', monto: 9800, dias: 3, vencimiento: 'proximo' }],
    salidas: [{ nombre: 'Comisión externa — Arq. Elena Duarte', referencia: 'Casa Herrera', monto: 1500, dias: null, vencimiento: null, tipo: 'comision_externa' }],
    total_entradas: 9800, total_salidas: 1500, neto: 8300,
    ...overrides,
  }
}

function makeReal(overrides: Partial<CashPositionReal> = {}): CashPositionReal {
  return {
    window_days: 30, saldo_actual: 28740,
    movimientos: [{ fecha: '2026-08-10', concepto: 'Cobro REC-2098', origen: 'cobro', entrada: 7500, salida: 0, saldo_acumulado: 21240 }],
    ...overrides,
  }
}

function makeDailyCount(overrides: Partial<DailyCashCount> = {}): DailyCashCount {
  return {
    id: 7, numero: null, estado: 'abierto',
    fecha: '2026-08-25', es_atrasado: false, fecha_real_hoy: '2026-08-25',
    cobros: [{ movement_type: 'payment', movement_id: 55, concepto: 'Cobro — Grupo Sensei (REC-2214)', metodo_pago: 'transferencia', monto: 6600, observacion: null }],
    notas_credito: [{ movement_type: 'credit_note', movement_id: 12, concepto: 'Devolución de dinero — Fam. Herrera', monto: 500, observacion: '' }],
    retenciones: [],
    total_cobrado: 6600, total_notas_credito: 500, total_neto: 6100, observacion_general: null,
    cerrado_por: null, cerrado_at: null, aprobado_por: null, aprobado_at: null,
    ...overrides,
  }
}

function makeHistory(overrides: Partial<import('@/types/adminContab').DailyCashCountHistoryResult> = {}) {
  return {
    data: [] as import('@/types/adminContab').DailyCashCountHistoryRow[],
    meta: { current_page: 1, last_page: 1 },
    pendientes_aprobacion: 0,
    ...overrides,
  }
}

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Felix', last_name: 'Test', email: 'felix@atlantic.com.pa',
    role: 'lider_admin_contab', permissions: [],
    modules: { admin_contab: { view: true, view_team: true, edit: false, approve: false } },
    ...overrides,
  } as UserInfo
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ArqueoCajaPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.cashPosition.header.mockResolvedValue(makeHeader())
  mockedApi.cashPosition.projected.mockResolvedValue(makeProjected())
  mockedApi.cashPosition.real.mockResolvedValue(makeReal())
  mockedApi.cashPosition.dailyCount.mockResolvedValue(makeDailyCount())
  mockedApi.cashPosition.history.mockResolvedValue(makeHistory())
  mockedStore.mockReturnValue({ user: makeUser() } as ReturnType<typeof useAuthStore>)
})

describe('ArqueoCajaPage — REQ-520 encabezado y tarjetas', () => {
  it('muestra el saldo disponible hoy con el desglose de bancos + caja menuda (Escenario 1 del REQ)', async () => {
    renderPage()
    await screen.findByText(/28,740\.00/)
    expect(screen.getByText(/28,400\.00.*340\.00|340\.00.*28,400\.00/)).toBeInTheDocument()
  })

  it('default Felix/Mark/Gerencia: Proyectado + 30 días (RN1 REQ-522), con las 4 tarjetas', async () => {
    renderPage()
    await screen.findByText(/28,740\.00/)
    expect(mockedApi.cashPosition.projected).toHaveBeenCalledWith(30)
    await screen.findByText('Hotel Riu — Lobby y piscina') // confirma que la vista proyectada renderizó
  })

  it('oculta el menú de exportar cuando la vista activa es Real + Hoy (RN3 REQ-520)', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'superadmin' }) } as ReturnType<typeof useAuthStore>)
    renderPage()
    await screen.findByText(/28,740\.00/)
    expect(screen.getByText('adminContab:arqueoCaja.exportButton')).toBeInTheDocument()

    fireEvent.click(screen.getByText('adminContab:arqueoCaja.toggle.real'))
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.chips.hoy'))
    await screen.findByText('adminContab:arqueoCaja.arqueoDelDia.title')
    expect(screen.queryByText('adminContab:arqueoCaja.exportButton')).not.toBeInTheDocument()
  })
})

describe('ArqueoCajaPage — REQ-521 vista proyectada', () => {
  it('muestra entradas y salidas en 2 columnas con el flujo neto', async () => {
    renderPage()
    await screen.findByText('Hotel Riu — Lobby y piscina')
    expect(screen.getByText('Comisión externa — Arq. Elena Duarte')).toBeInTheDocument()
    expect(screen.getByText(/\+.*8,300\.00/)).toBeInTheDocument()
  })
})

describe('ArqueoCajaPage — REQ-522/523 toggle, chips y vista real', () => {
  it('cambiar a Real + 30 días llama al endpoint real con la ventana activa', async () => {
    renderPage()
    await screen.findByText(/28,740\.00/)
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.toggle.real'))
    await waitFor(() => expect(mockedApi.cashPosition.real).toHaveBeenCalledWith(30))
    await screen.findByText('Cobro REC-2098')
  })
})

describe('ArqueoCajaPage — REQ-524 arqueo del día', () => {
  it('arma la tabla con los cobros y notas de crédito de hoy, con totales', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'superadmin' }) } as ReturnType<typeof useAuthStore>)
    renderPage()
    await screen.findByText(/28,740\.00/)
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.toggle.real'))
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.chips.hoy'))
    await screen.findByText('Cobro — Grupo Sensei (REC-2214)')
    expect(screen.getByText('Devolución de dinero — Fam. Herrera')).toBeInTheDocument()
    expect(screen.getByText(/6,100\.00/)).toBeInTheDocument() // total neto
  })

  it('editar la observación de una fila dispara el PUT al perder el foco', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'superadmin' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.updateEntryObservation.mockResolvedValue(undefined)
    renderPage()
    await screen.findByText(/28,740\.00/)
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.toggle.real'))
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.chips.hoy'))
    const inputs = await screen.findAllByPlaceholderText('adminContab:arqueoCaja.arqueoDelDia.observacionPlaceholder')
    const input = inputs[0] // fila del cobro (movement_id 55) — la primera fila renderizada
    fireEvent.change(input, { target: { value: 'Cheque verificado' } })
    fireEvent.blur(input)
    await waitFor(() => expect(mockedApi.cashPosition.updateEntryObservation).toHaveBeenCalledWith({
      movement_type: 'payment', movement_id: 55, observacion: 'Cheque verificado',
    }))
  })
})

describe('ArqueoCajaPage — restricción de rol Yaneth (§8 del ADR, ajustado 2026-08-25 Pre-QA Batch 18)', () => {
  it('Yaneth aterriza directo en Arqueo del día, sin toggle ni chips, y nunca pide Real (histórico)', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'asistente_administrativa' }) } as ReturnType<typeof useAuthStore>)
    renderPage()
    await screen.findByText('adminContab:arqueoCaja.arqueoDelDia.title')
    expect(screen.queryByText('adminContab:arqueoCaja.toggle.proyectado')).not.toBeInTheDocument()
    expect(screen.queryByText('adminContab:arqueoCaja.chips.dias30')).not.toBeInTheDocument()
    expect(mockedApi.cashPosition.real).not.toHaveBeenCalled()
    expect(mockedApi.cashPosition.dailyCount).toHaveBeenCalled()
  })

  it('Yaneth SÍ ve los 3 totales proyectados del encabezado — REQ-520 se los da, solo el panel de detalle es de REQ-521', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'asistente_administrativa' }) } as ReturnType<typeof useAuthStore>)
    renderPage()
    await screen.findByText('adminContab:arqueoCaja.arqueoDelDia.title')
    expect(mockedApi.cashPosition.projected).toHaveBeenCalled()
  })
})

describe('ArqueoCajaPage — restricción de rol Gerencia (management, sin REQ-524)', () => {
  it('Gerencia en Real + Hoy ve la nota restringida en vez de pedir el arqueo del día', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'management' }) } as ReturnType<typeof useAuthStore>)
    renderPage()
    await screen.findByText(/28,740\.00/)
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.toggle.real'))
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.chips.hoy'))
    await screen.findByText('adminContab:arqueoCaja.restricted.dailyCount')
    expect(mockedApi.cashPosition.dailyCount).not.toHaveBeenCalled()
  })

  it('REQ-528: Gerencia SÍ ve el panel de Historial, aunque no vea el Arqueo del día', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'management' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.history.mockResolvedValue(makeHistory({
      data: [{ id: 5, numero: 2, fecha: '2026-07-02', total_neto: 18420, estado: 'aprobado', aprobado_por: 'Mark', aprobado_at: '2026-07-03', realizado_por: 'Yaneth Ríos', cerrado_at: '2026-07-02T14:05:00-05:00' }],
    }))
    renderPage()
    await screen.findByText('adminContab:arqueoCaja.historial.title')
    expect(mockedApi.cashPosition.history).toHaveBeenCalled()
    await screen.findByText('Yaneth Ríos')
  })
})

describe('ArqueoCajaPage — Batch 19 (SCRUM-602→606, REQ-525→529)', () => {
  function goToDailyCount() {
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.toggle.real'))
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.chips.hoy'))
  }

  it('REQ-527: muestra el aviso de atrasado cuando el arqueo activo no es literalmente hoy', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'lider_admin_contab' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.dailyCount.mockResolvedValue(makeDailyCount({
      fecha: '2026-08-24', es_atrasado: true, fecha_real_hoy: '2026-08-26',
    }))
    renderPage()
    await screen.findByText(/28,740\.00/)
    goToDailyCount()
    await screen.findByText(/atrasadoAviso.*fecha=.*fechaHoy=/)
  })

  it('REQ-525: la sección Ajustes/Retención solo aparece cuando hay al menos una retención, y muestra "Pendiente" sin constancia', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'lider_admin_contab' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.dailyCount.mockResolvedValue(makeDailyCount({
      retenciones: [{ payment_id: 88, cliente: 'Constructora del Istmo', referencia: 'F-4392', motivo: 'Retención 2% ISR', monto: 3450, constancia: null }],
    }))
    renderPage()
    await screen.findByText(/28,740\.00/)
    goToDailyCount()
    await screen.findByText('adminContab:arqueoCaja.retenciones.title')
    expect(screen.getByText('Constructora del Istmo')).toBeInTheDocument()
    expect(screen.getByText('adminContab:arqueoCaja.retenciones.pendiente')).toBeInTheDocument()
  })

  it('REQ-525: sin retenciones del día, la sección no se renderiza', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'lider_admin_contab' }) } as ReturnType<typeof useAuthStore>)
    renderPage()
    await screen.findByText(/28,740\.00/)
    goToDailyCount()
    await screen.findByText('adminContab:arqueoCaja.arqueoDelDia.title')
    expect(screen.queryByText('adminContab:arqueoCaja.retenciones.title')).not.toBeInTheDocument()
  })

  it('REQ-526: confirmar el cierre en el modal llama a closeDailyCount', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'lider_admin_contab' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.closeDailyCount.mockResolvedValue(makeDailyCount({ estado: 'pendiente_aprobacion', numero: 3 }))
    renderPage()
    await screen.findByText(/28,740\.00/)
    goToDailyCount()
    fireEvent.click(await screen.findByText('adminContab:arqueoCaja.arqueoDelDia.cerrar.boton'))
    await screen.findByText('adminContab:arqueoCaja.arqueoDelDia.cerrar.modalTitle')
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.arqueoDelDia.cerrar.confirmar'))
    await waitFor(() => expect(mockedApi.cashPosition.closeDailyCount).toHaveBeenCalled())
  })

  it('REQ-526 (QA SCRUM-603, 2026-08-29 RN1): el modal de confirmación muestra numero_preview', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'lider_admin_contab' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.dailyCount.mockResolvedValue(makeDailyCount({ numero_preview: 5 }))
    renderPage()
    await screen.findByText(/28,740\.00/)
    goToDailyCount()
    fireEvent.click(await screen.findByText('adminContab:arqueoCaja.arqueoDelDia.cerrar.boton'))
    await screen.findByText('adminContab:arqueoCaja.arqueoDelDia.cerrar.modalTitle')
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('REQ-526: un arqueo ya cerrado no ofrece el botón de cerrar ni de editar observaciones', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'lider_admin_contab' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.dailyCount.mockResolvedValue(makeDailyCount({ estado: 'pendiente_aprobacion' }))
    renderPage()
    await screen.findByText(/28,740\.00/)
    goToDailyCount()
    await screen.findByText('adminContab:arqueoCaja.arqueoDelDia.title')
    expect(screen.queryByText('adminContab:arqueoCaja.arqueoDelDia.cerrar.boton')).not.toBeInTheDocument()
    const inputs = screen.getAllByPlaceholderText('adminContab:arqueoCaja.arqueoDelDia.observacionPlaceholder')
    expect(inputs[0]).toBeDisabled()
  })

  it('REQ-528: "Ver" abre el detalle del historial y "Aprobar" solo se muestra cuando puede_aprobar es true', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'management' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.history.mockResolvedValue(makeHistory({
      data: [{ id: 5, numero: 2, fecha: '2026-07-02', total_neto: 18420, estado: 'pendiente_aprobacion', aprobado_por: null, aprobado_at: null, realizado_por: 'Yaneth Ríos', cerrado_at: '2026-07-02T14:05:00-05:00' }],
      pendientes_aprobacion: 1,
    }))
    mockedApi.cashPosition.historyDetail.mockResolvedValue(makeDailyCount({
      id: 5, numero: 2, estado: 'pendiente_aprobacion', fecha: '2026-07-02', puede_aprobar: true,
    }))
    renderPage()
    await screen.findByText('adminContab:arqueoCaja.historial.pendientesAviso:count=1')
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.historial.ver'))
    await screen.findByText('adminContab:arqueoCaja.historial.aprobar')

    mockedApi.cashPosition.approve.mockResolvedValue(makeDailyCount({ id: 5, estado: 'aprobado', aprobado_por: 'Mark' }))
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.historial.aprobar'))
    await waitFor(() => expect(mockedApi.cashPosition.approve).toHaveBeenCalledWith(5))
  })

  it('REQ-528: sin puede_aprobar, el detalle del historial no ofrece el botón "Aprobar"', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'lider_admin_contab' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.history.mockResolvedValue(makeHistory({
      data: [{ id: 5, numero: 2, fecha: '2026-07-02', total_neto: 18420, estado: 'pendiente_aprobacion', aprobado_por: null, aprobado_at: null, realizado_por: 'Yaneth Ríos', cerrado_at: '2026-07-02T14:05:00-05:00' }],
    }))
    mockedApi.cashPosition.historyDetail.mockResolvedValue(makeDailyCount({
      id: 5, numero: 2, estado: 'pendiente_aprobacion', fecha: '2026-07-02', puede_aprobar: false,
    }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:arqueoCaja.historial.ver'))
    await screen.findByText('adminContab:arqueoCaja.historial.pendiente')
    expect(screen.queryByText('adminContab:arqueoCaja.historial.aprobar')).not.toBeInTheDocument()
  })

  it('QA SCRUM-603 (2026-08-29 RN4): el historial muestra la hora de cierre junto a quién lo cerró', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'lider_admin_contab' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.history.mockResolvedValue(makeHistory({
      data: [{ id: 5, numero: 2, fecha: '2026-07-02', total_neto: 18420, estado: 'aprobado', aprobado_por: 'Mark', aprobado_at: '2026-07-03', realizado_por: 'Yaneth Ríos', cerrado_at: '2026-07-02T14:05:00-05:00' }],
    }))
    renderPage()
    await screen.findByText('adminContab:arqueoCaja.historial.title')
    await screen.findByText('Yaneth Ríos')
    expect(screen.getByText(/2:05 p\. ?m\./)).toBeInTheDocument()
  })

  it('QA SCRUM-601 (2026-08-29): la observación general se resincroniza al avanzar al arqueo siguiente, sin arrastrar la del anterior', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'lider_admin_contab' }) } as ReturnType<typeof useAuthStore>)
    mockedApi.cashPosition.dailyCount.mockResolvedValue(makeDailyCount({
      id: 7, fecha: '2026-08-25', observacion_general: 'Observación del arqueo del 25',
    }))
    renderPage()
    await screen.findByText(/28,740\.00/)
    goToDailyCount()
    const textarea = await screen.findByPlaceholderText('adminContab:arqueoCaja.arqueoDelDia.observacionGeneralPlaceholder')
    expect(textarea).toHaveValue('Observación del arqueo del 25')

    // Al cerrar, `useCloseDailyCashCount` invalida DAILY_CASH_COUNT_KEY — el refetch subsiguiente
    // ya resuelve con el arqueo SIGUIENTE (id distinto, observación propia), simulando REQ-527
    // (avance automático al arqueo activo). El componente no se desmonta entre uno y otro.
    mockedApi.cashPosition.closeDailyCount.mockResolvedValue(makeDailyCount({ estado: 'pendiente_aprobacion' }))
    mockedApi.cashPosition.dailyCount.mockResolvedValue(makeDailyCount({
      id: 8, fecha: '2026-08-26', observacion_general: null,
    }))
    fireEvent.click(screen.getByText('adminContab:arqueoCaja.arqueoDelDia.cerrar.boton'))
    fireEvent.click(await screen.findByText('adminContab:arqueoCaja.arqueoDelDia.cerrar.confirmar'))

    await waitFor(() => expect(screen.getByPlaceholderText('adminContab:arqueoCaja.arqueoDelDia.observacionGeneralPlaceholder')).toHaveValue(''))
  })
})
