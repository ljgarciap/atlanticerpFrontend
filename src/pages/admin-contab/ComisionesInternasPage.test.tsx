import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ComisionesInternasPage from './ComisionesInternasPage'
import { adminContabApi } from '@/api/adminContabApi'
import { useAuthStore } from '@/store/authStore'
import type {
  CommissionInternalSummary, CommissionTier, CommissionVendorOption, CommissionVendorSummary,
  CommissionOrder, CommissionAccountStatement,
} from '@/types/adminContab'
import type { UserInfo } from '@/types/auth'

// Batch 14 del cuerpo principal (SCRUM-575→579, REQ-498→502) — Comisiones Internas. Cubre: 4
// tarjetas + banner de pago automático (REQ-499), tabla de tramos solo lectura (REQ-498 RN1),
// scoping view/view_team (REQ-575/577 permisos — vendedor sin exportar/filtrar por otros).

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
    commissionsInternal: {
      tiers: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
      summary: vi.fn(),
      vendorOptions: vi.fn(),
      export: vi.fn(),
      accountStatement: vi.fn(),
      downloadAccountStatementPdf: vi.fn(),
    },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(adminContabApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeSummary(overrides: Partial<CommissionInternalSummary> = {}): CommissionInternalSummary {
  return {
    mes: '2026-08', mes_cerrado: false, total_pedidos_mes: 88650, vendedores_con_pedidos_mes: 2,
    ya_pagada: 450, por_pagar: 0, pendiente_cobro: 2209.5,
    banner_comisiones_count: 0, banner_comisiones_total: 0,
    vendedores: [],
    puede_editar_tramos: false,
    ...overrides,
  }
}

// Batch 15 (SCRUM-580→584, REQ-503/504/505/506/507) — NC restando base, arrastre agrupado por
// mes, proyectos compartidos, estado de cuenta.
function makeOrder(overrides: Partial<CommissionOrder> = {}): CommissionOrder {
  return {
    id: 1, cliente: 'Cliente Test', numero_pedido: 'PED-0001', fecha_pedido: '2026-08-05',
    numero_factura: 'F-0001', fecha_factura: '2026-08-06', fecha_cobro_completo: '2026-08-10',
    total_pedido: 6600, total_facturado: 6600, total_cobrado: 6600, es_abono_parcial: false,
    estado: 'pagado', monto_comision: 132, es_estimado: false,
    total_nota_credito: 0, nota_credito_ref: null, compartido_con: [], total_pedido_completo: null,
    ...overrides,
  }
}

function makeVendorSummary(overrides: Partial<CommissionVendorSummary> = {}): CommissionVendorSummary {
  return {
    vendedor_id: 1, vendedor_nombre: 'Kayra Estrada', total_pedidos_mes: 6600,
    porcentaje: 1.5, porcentaje_fijo: true, pagada: 132, por_pagar: 0, pendiente_cobro: 0,
    total_nota_credito: 0, groups: [],
    ...overrides,
  }
}

function makeTiers(): CommissionTier[] {
  return [
    { id: 1, monto_minimo: 0, monto_maximo: 20000, porcentaje: 1.5, orden: 1 },
    { id: 2, monto_minimo: 20001, monto_maximo: 35000, porcentaje: 2, orden: 2 },
    { id: 6, monto_minimo: 120001, monto_maximo: null, porcentaje: 5, orden: 6 },
  ]
}

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Contabilidad', last_name: 'Test', email: 'contabilidad@test.com',
    role: 'lider_admin_contab', permissions: [],
    modules: { admin_contab: { view: true, view_team: true, edit: false, approve: false } },
    ...overrides,
  } as UserInfo
}

// "Kayra Estrada" aparece tanto en el <option> del selector de vendedor como en la fila de la
// tabla — acá se apunta siempre a la celda de la tabla (el <option> no dispara onToggle).
async function clickVendorRow(nombre: string) {
  const matches = await screen.findAllByText(nombre)
  const cell = matches.find(el => el.tagName === 'TD')
  if (!cell) throw new Error(`No se encontró la celda de tabla para "${nombre}"`)
  fireEvent.click(cell)
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ComisionesInternasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.commissionsInternal.summary.mockResolvedValue(makeSummary())
  mockedApi.commissionsInternal.vendorOptions.mockResolvedValue([{ id: 1, nombre: 'Kayra Estrada' } as CommissionVendorOption])
  mockedApi.commissionsInternal.tiers.list.mockResolvedValue(makeTiers())
  mockedStore.mockReturnValue({ user: makeUser() } as ReturnType<typeof useAuthStore>)
})

describe('ComisionesInternasPage — REQ-499 tarjetas e indicadores', () => {
  it('muestra las 4 tarjetas con los valores del resumen', async () => {
    renderPage()
    await screen.findByText(/88,650/)
    expect(screen.getByText(/450\.00/)).toBeInTheDocument()
    expect(screen.getByText(/2,209\.50/)).toBeInTheDocument()
  })

  it('RN3 — el banner de pago automático solo aparece cuando hay comisiones "Por pagar"', async () => {
    renderPage()
    await screen.findByText(/88,650/)
    expect(screen.queryByText(/comisionesInternas.banner/)).not.toBeInTheDocument()

    mockedApi.commissionsInternal.summary.mockResolvedValue(makeSummary({ banner_comisiones_count: 3, banner_comisiones_total: 500 }))
    renderPage()
    expect(await screen.findByText(/comisionesInternas.banner.*count=3/)).toBeInTheDocument()
  })
})

describe('ComisionesInternasPage — REQ-498 tabla de tramos', () => {
  it('el botón "Tabla de comisión escalonada" abre el modal de solo lectura para view_team sin edit', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:comisionesInternas.verTramos'))
    await screen.findByText('adminContab:comisionesInternas.tramos.title')
    // Sin `admin_contab.edit`, no debe ofrecer "Agregar tramo".
    expect(screen.queryByText('adminContab:comisionesInternas.tramos.agregar')).not.toBeInTheDocument()
  })

  // Regresión de Pre-QA/Visual Review (2026-08-25): antes se gateaba con `admin_contab.edit`,
  // que Felix también tiene sin ser Mark — veía "Agregar tramo" y el guardado le devolvía 403
  // (`primary_approver_only` en el backend). `puede_editar_tramos` es el cómputo server-side dependiente del
  // actor (`current_user_id === primary_approver_user_id`, mismo criterio que
  // `puede_decidir_incobrable` en Facturación) — el frontend nunca debe volver a decidir esto
  // por su cuenta vía un flag de módulo genérico.
  it('Felix (admin_contab.edit=true pero no es Mark) NO ve "Agregar tramo"', async () => {
    mockedStore.mockReturnValue({
      user: makeUser({ modules: { admin_contab: { view: true, view_team: true, edit: true, approve: false } } }),
    } as ReturnType<typeof useAuthStore>)
    mockedApi.commissionsInternal.summary.mockResolvedValue(makeSummary({ puede_editar_tramos: false }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:comisionesInternas.verTramos'))
    await screen.findByText('adminContab:comisionesInternas.tramos.title')
    expect(screen.queryByText('adminContab:comisionesInternas.tramos.agregar')).not.toBeInTheDocument()
  })

  it('Mark (puede_editar_tramos=true) SÍ ve "Agregar tramo"', async () => {
    mockedApi.commissionsInternal.summary.mockResolvedValue(makeSummary({ puede_editar_tramos: true }))
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:comisionesInternas.verTramos'))
    await screen.findByText('adminContab:comisionesInternas.tramos.title')
    expect(await screen.findByText('adminContab:comisionesInternas.tramos.agregar')).toBeInTheDocument()
  })
})

describe('ComisionesInternasPage — scoping view vs view_team (REQ-575/577)', () => {
  it('un vendedor (view sin view_team) no ve el filtro de vendedor ni el botón de exportar', async () => {
    mockedStore.mockReturnValue({
      user: makeUser({ modules: { admin_contab: { view: true, view_team: false, edit: false, approve: false } } }),
    } as ReturnType<typeof useAuthStore>)
    renderPage()
    await screen.findByText(/88,650/)
    expect(screen.queryByText('adminContab:comisionesInternas.exportar.label')).not.toBeInTheDocument()
    expect(mockedApi.commissionsInternal.vendorOptions).not.toHaveBeenCalled()
  })

  it('Felix/Mark/Gerencia (view_team) sí ven el botón de exportar', async () => {
    renderPage()
    expect(await screen.findByText('adminContab:comisionesInternas.exportar.label')).toBeInTheDocument()
  })
})

describe('ComisionesInternasPage — Batch 15: REQ-503 notas de crédito', () => {
  it('muestra el monto y la referencia de la nota de crédito aplicada a un pedido', async () => {
    const vendor = makeVendorSummary({
      groups: [{
        mes: '2026-08', porcentaje: 1.5, porcentaje_fijo: true, arrastrado: false,
        pedidos: [makeOrder({ total_nota_credito: 200, nota_credito_ref: 'NC-0071' })],
      }],
    })
    mockedApi.commissionsInternal.summary.mockResolvedValue(makeSummary({ vendedores: [vendor] }))
    renderPage()
    await clickVendorRow('Kayra Estrada')
    expect(await screen.findByText(/-.*200\.00 \(NC-0071\)/)).toBeInTheDocument()
  })

  it('un pedido sin notas de crédito muestra el placeholder de "sin dato"', async () => {
    const vendor = makeVendorSummary({
      groups: [{ mes: '2026-08', porcentaje: 1.5, porcentaje_fijo: true, arrastrado: false, pedidos: [makeOrder()] }],
    })
    mockedApi.commissionsInternal.summary.mockResolvedValue(makeSummary({ vendedores: [vendor] }))
    renderPage()
    await clickVendorRow('Kayra Estrada')
    await screen.findByText('PED-0001')
    // La columna "sin dato" (—) aparece más de una vez en la fila (factura/fecha ya usan el
    // mismo placeholder) — solo confirmamos que la referencia de NC nunca se renderiza.
    expect(screen.queryByText(/NC-/)).not.toBeInTheDocument()
  })
})

describe('ComisionesInternasPage — Batch 15: REQ-504/505 arrastre agrupado por mes', () => {
  it('un vendedor con arrastre de un mes anterior muestra 2 grupos, uno marcado como arrastrado', async () => {
    const vendor = makeVendorSummary({
      groups: [
        { mes: '2026-08', porcentaje: 1.5, porcentaje_fijo: false, arrastrado: false, pedidos: [makeOrder({ id: 1, estado: 'por_pagar' })] },
        { mes: '2026-06', porcentaje: 2, porcentaje_fijo: true, arrastrado: true, pedidos: [makeOrder({ id: 2, numero_pedido: 'PED-0002', estado: 'pendiente_cobro' })] },
      ],
    })
    mockedApi.commissionsInternal.summary.mockResolvedValue(makeSummary({ vendedores: [vendor] }))
    renderPage()
    await clickVendorRow('Kayra Estrada')
    await screen.findByText('PED-0001')
    await screen.findByText('PED-0002')
    // Solo el grupo arrastrado lleva la nota "arrastrado de un mes ya cerrado...".
    expect(screen.getAllByText('adminContab:comisionesInternas.arrastrado')).toHaveLength(1)
  })
})

describe('ComisionesInternasPage — Batch 15: REQ-506 proyectos compartidos', () => {
  it('un pedido compartido muestra con quién se comparte y el total del proyecto completo', async () => {
    const vendor = makeVendorSummary({
      groups: [{
        mes: '2026-08', porcentaje: 1.5, porcentaje_fijo: true, arrastrado: false,
        pedidos: [makeOrder({
          total_pedido: 10000, compartido_con: ['Vendedor Disenador Test 2'], total_pedido_completo: 20000,
        })],
      }],
    })
    mockedApi.commissionsInternal.summary.mockResolvedValue(makeSummary({ vendedores: [vendor] }))
    renderPage()
    await clickVendorRow('Kayra Estrada')
    expect(await screen.findByText(/Vendedor Disenador Test 2/)).toBeInTheDocument()
    expect(screen.getByText(/20,000\.00/)).toBeInTheDocument()
  })
})

describe('ComisionesInternasPage — Batch 15: REQ-507 estado de cuenta', () => {
  function makeStatement(overrides: Partial<CommissionAccountStatement> = {}): CommissionAccountStatement {
    return {
      vendedor_id: 1, vendedor_nombre: 'Kayra Estrada', mes: '2026-08', mes_cerrado: false,
      porcentaje: 1.5, porcentaje_fijo: false, total_pedidos_mes: 6600,
      descuento_nota_credito: 0, pagada: 132, por_pagar: 0, pendiente_cobro: 0,
      groups: [{ mes: '2026-08', porcentaje: 1.5, porcentaje_fijo: false, pedidos: [makeOrder()] }],
      emitido: '2026-08-25',
      ...overrides,
    }
  }

  it('el botón "Ver estado de cuenta" abre el documento del vendedor', async () => {
    const vendor = makeVendorSummary({
      groups: [{ mes: '2026-08', porcentaje: 1.5, porcentaje_fijo: true, arrastrado: false, pedidos: [makeOrder()] }],
    })
    mockedApi.commissionsInternal.summary.mockResolvedValue(makeSummary({ vendedores: [vendor] }))
    mockedApi.commissionsInternal.accountStatement.mockResolvedValue(makeStatement())
    renderPage()
    await clickVendorRow('Kayra Estrada')
    fireEvent.click(await screen.findByText('adminContab:comisionesInternas.verEstadoCuenta'))
    await screen.findByText('adminContab:comisionesInternas.estadoCuenta.title')
    expect(mockedApi.commissionsInternal.accountStatement).toHaveBeenCalledWith(1, '2026-08')
  })

  it('RN1 — mes cerrado no muestra Por pagar / Pendiente de cobro', async () => {
    const vendor = makeVendorSummary({
      groups: [{ mes: '2026-08', porcentaje: 1.5, porcentaje_fijo: true, arrastrado: false, pedidos: [makeOrder()] }],
    })
    mockedApi.commissionsInternal.summary.mockResolvedValue(makeSummary({ vendedores: [vendor] }))
    mockedApi.commissionsInternal.accountStatement.mockResolvedValue(makeStatement({ mes_cerrado: true }))
    renderPage()
    await clickVendorRow('Kayra Estrada')
    fireEvent.click(await screen.findByText('adminContab:comisionesInternas.verEstadoCuenta'))
    await screen.findByText('adminContab:comisionesInternas.estadoCuenta.title')
    const modal = within(screen.getByTestId('account-statement-modal'))
    expect(await modal.findByText('adminContab:comisionesInternas.estadoCuenta.totalPagadoMes')).toBeInTheDocument()
    // "Por pagar" sí aparece en las 4 tarjetas de la página de fondo — se busca solo DENTRO del
    // modal, donde RN1 dice que un mes cerrado no debe mostrar Por pagar/Pendiente de cobro.
    expect(modal.queryByText('adminContab:comisionesInternas.stats.porPagar')).not.toBeInTheDocument()
  })
})
