import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ComisionesExternasPage from './ComisionesExternasPage'
import { adminContabApi } from '@/api/adminContabApi'
import { useAuthStore } from '@/store/authStore'
import type {
  CommissionExternalSummary, ArchitectCommissionRow, ArchitectCommissionProject, ArchitectOption,
} from '@/types/adminContab'
import type { UserInfo } from '@/types/auth'

// Batch 16 (SCRUM-585→590, REQ-508→513) — Comisiones Externas. Cubre: 5 tarjetas (REQ-508),
// aviso + montos ocultos cuando faltan datos fiscales (REQ-510/511), estados (REQ-512), gate de
// rol de "Subir cuenta de cobro" (REQ-513 — Felix/Yaneth sí, Mark no).

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
    commissionsExternal: {
      summary: vi.fn(),
      architectOptions: vi.fn(),
      updateFiscalProfile: vi.fn(),
      uploadCuentaCobro: vi.fn(),
      viewCuentaCobro: vi.fn(),
      uploadComprobanteRetencion: vi.fn(),
      viewComprobanteRetencion: vi.fn(),
      bankAccountOptions: vi.fn(),
      updateCuentaPago: vi.fn(),
      proposePercent: vi.fn(),
      decidePercent: vi.fn(),
      markPaid: vi.fn(),
      sendReminder: vi.fn(),
    },
  },
}))

vi.mock('@/store/authStore', () => ({ useAuthStore: vi.fn() }))

const mockedApi   = vi.mocked(adminContabApi, true)
const mockedStore = vi.mocked(useAuthStore)

function makeSummary(overrides: Partial<CommissionExternalSummary> = {}): CommissionExternalSummary {
  return {
    comision_generada: 4900, pagada_total: 3400, pagado_este_mes: 0, pendiente_factura: 1500,
    aun_no_generada: 200, meses_disponibles: ['2026-08'], arquitectos: [],
    puede_decidir_porcentaje: false,
    ...overrides,
  }
}

function makeProject(overrides: Partial<ArchitectCommissionProject> = {}): ArchitectCommissionProject {
  return {
    pipeline_card_id: 1, numero_pedido: 'PED-0001', cliente: 'Cliente Test', fecha_pedido: '2026-08-05',
    monto_proyecto: 34000, total_facturado: 34000, total_cobrado: 34000,
    porcentaje: 10, comision: 3400, impuesto: 238, total: 3638, estado: 'pendiente_factura_arquitecto',
    cuenta_cobro: null, comprobante_retencion: null, fecha_pago: null,
    porcentaje_pendiente: null, porcentaje_pendiente_motivo: null, bank_account: null,
    ...overrides,
  }
}

function makeArchitectRow(overrides: Partial<ArchitectCommissionRow> = {}): ArchitectCommissionRow {
  return {
    architect_id: 1, nombre: 'Arq. Juan Pérez', empresa: 'Estudio Pérez', ruc: '1-1-1',
    regimen_fiscal: 'con_itbms', datos_fiscales_completos: true,
    generada: 3638, pagada: 0, pendiente: 3638, proyectos: [makeProject()],
    ...overrides,
  }
}

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Contabilidad', last_name: 'Test', email: 'contabilidad@test.com',
    role: 'lider_admin_contab', permissions: [],
    modules: { admin_contab: { view: true, view_team: true, edit: false, approve: false } },
    ...overrides,
  } as UserInfo
}

async function clickArchitectRow(nombre: string) {
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
        <ComisionesExternasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.commissionsExternal.summary.mockResolvedValue(makeSummary())
  mockedApi.commissionsExternal.architectOptions.mockResolvedValue([{ id: 1, nombre: 'Arq. Juan Pérez' } as ArchitectOption])
  mockedStore.mockReturnValue({ user: makeUser() } as ReturnType<typeof useAuthStore>)
})

describe('ComisionesExternasPage — REQ-508 tarjetas', () => {
  it('muestra las 5 tarjetas con los valores del resumen (Escenario 1 del REQ)', async () => {
    renderPage()
    await screen.findByText(/4,900\.00/) // comisión generada
    expect(screen.getByText(/3,400\.00/)).toBeInTheDocument() // pagada total
    expect(screen.getByText(/1,500\.00/)).toBeInTheDocument() // pendiente de factura
    expect(screen.getByText(/200\.00/)).toBeInTheDocument() // aún no generada
  })
})

describe('ComisionesExternasPage — REQ-509 filtros', () => {
  it('cambiar el filtro de arquitecto dispara un refetch con el architect_id activo', async () => {
    renderPage()
    await screen.findByText(/4,900\.00/)
    const select = screen.getByText('adminContab:comisionesExternas.filtros.todosArquitectos').closest('select')
    expect(select).not.toBeNull()
    fireEvent.change(select as HTMLSelectElement, { target: { value: '1' } })
    await screen.findByText(/architect_id.*1/, { exact: false }).catch(() => null) // no-op if not rendered as text
    expect(mockedApi.commissionsExternal.summary).toHaveBeenLastCalledWith(
      expect.objectContaining({ architect_id: 1 }),
    )
  })

  // Visual Review — mockup del ticket (4F__Admin_Contabilidad_ComisionesExt.html) tiene un botón
  // "Limpiar filtros" que solo aparece con algún filtro activo.
  it('"Limpiar filtros" solo aparece con un filtro activo, y lo resetea todo al hacer clic', async () => {
    renderPage()
    await screen.findByText(/4,900\.00/)
    expect(screen.queryByText('adminContab:comisionesExternas.filtros.limpiar')).not.toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText('adminContab:comisionesExternas.filtros.buscarPlaceholder')
    fireEvent.change(searchInput, { target: { value: 'Vélez' } })

    const clearBtn = await screen.findByText('adminContab:comisionesExternas.filtros.limpiar')
    fireEvent.click(clearBtn)

    expect((searchInput as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('adminContab:comisionesExternas.filtros.limpiar')).not.toBeInTheDocument()
  })
})

describe('ComisionesExternasPage — REQ-508/509 desglose por arquitecto (mockup)', () => {
  it('la fila de un arquitecto muestra Generada/Pagada/Pendiente por separado, y el conteo + régimen en el subtítulo', async () => {
    const architect = makeArchitectRow({
      regimen_fiscal: 'retencion_50', generada: 1234, pagada: 987, pendiente: 247,
      proyectos: [makeProject(), makeProject({ pipeline_card_id: 2, numero_pedido: 'PED-0002' })],
    })
    mockedApi.commissionsExternal.summary.mockResolvedValue(makeSummary({ arquitectos: [architect] }))
    renderPage()

    await screen.findAllByText('Arq. Juan Pérez')
    expect(screen.getByText('adminContab:comisionesExternas.proyectosReferidos:count=2', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/1,234\.00/)).toBeInTheDocument() // generada
    expect(screen.getByText(/987\.00/)).toBeInTheDocument()   // pagada
    expect(screen.getByText(/247\.00/)).toBeInTheDocument()   // pendiente
  })
})

describe('ComisionesExternasPage — REQ-510 datos fiscales incompletos', () => {
  it('un arquitecto sin datos fiscales muestra el aviso y "—" en vez de un total', async () => {
    const architect = makeArchitectRow({
      datos_fiscales_completos: false, regimen_fiscal: null, empresa: null, ruc: null,
      proyectos: [makeProject({ estado: 'aun_no_generada', impuesto: null, total: null })],
    })
    mockedApi.commissionsExternal.summary.mockResolvedValue(makeSummary({ arquitectos: [architect] }))
    renderPage()
    await screen.findByText('adminContab:comisionesExternas.datosFiscalesFaltantes')

    await clickArchitectRow('Arq. Juan Pérez')
    await screen.findByText('PED-0001')
    // Empresa (nivel arquitecto) usa un "—" literal (no pasa por t()); impuesto/total (nivel
    // proyecto) usan la key `detalle.sinDato` — el mock de t() de este archivo devuelve la key
    // sin resolver, así que se compara contra la key literal, no contra el "—" real.
    expect(screen.getByText('—')).toBeInTheDocument() // Empresa
    expect(screen.getAllByText('adminContab:comisionesExternas.detalle.sinDato').length).toBe(2) // impuesto + total
  })

  it('el botón "Datos fiscales" abre el modal para completar empresa/RUC/régimen', async () => {
    const architect = makeArchitectRow({ datos_fiscales_completos: false, regimen_fiscal: null, empresa: null, ruc: null })
    mockedApi.commissionsExternal.summary.mockResolvedValue(makeSummary({ arquitectos: [architect] }))
    renderPage()
    await screen.findByText('adminContab:comisionesExternas.datosFiscalesFaltantes')
    fireEvent.click(screen.getByText('adminContab:comisionesExternas.editarDatosFiscales'))
    // ArchitectFiscalProfileModal usa useTranslation('adminContab') con namespace ya vinculado
    // (mismo criterio que RegistrarCobroModal) — sin el prefijo "adminContab:" que sí lleva la
    // página (useTranslation(['common','adminContab'])).
    expect(await screen.findByText('comisionesExternas.datosFiscales.title')).toBeInTheDocument()
  })
})

describe('ComisionesExternasPage — REQ-511 cálculo por régimen', () => {
  it('Escenario 1 (Con ITBMS) — muestra comisión, impuesto y total del proyecto', async () => {
    const architect = makeArchitectRow({
      proyectos: [makeProject({ comision: 3400, impuesto: 238, total: 3638 })],
    })
    mockedApi.commissionsExternal.summary.mockResolvedValue(makeSummary({ arquitectos: [architect] }))
    renderPage()
    await clickArchitectRow('Arq. Juan Pérez')
    await screen.findByText('PED-0001')
    expect(screen.getByText(/238\.00/)).toBeInTheDocument()
    // El total del proyecto (3,638.00) aparece 2 veces a propósito: en el detalle del proyecto Y
    // en el total agregado de la fila colapsada del arquitecto (un solo proyecto = mismo monto).
    expect(screen.getAllByText(/3,638\.00/).length).toBeGreaterThanOrEqual(1)
  })
})

describe('ComisionesExternasPage — REQ-512 estado derivado del cobro', () => {
  it('un proyecto con cobro parcial muestra el estado "Aún no generada"', async () => {
    const architect = makeArchitectRow({
      proyectos: [makeProject({ estado: 'aun_no_generada', total_cobrado: 17000 })],
    })
    mockedApi.commissionsExternal.summary.mockResolvedValue(makeSummary({ arquitectos: [architect] }))
    renderPage()
    await clickArchitectRow('Arq. Juan Pérez')
    await screen.findByText('PED-0001')
    // El mismo texto también existe como <option> del filtro de estado — se espera al menos 1
    // match adicional dentro de la fila expandida (el badge del proyecto).
    expect(screen.getAllByText('adminContab:comisionesExternas.estados.aun_no_generada').length).toBeGreaterThanOrEqual(2)
  })
})

describe('ComisionesExternasPage — REQ-513 cuenta de cobro, gate de rol', () => {
  it('Felix (lider_admin_contab) ve el botón "Subir" cuenta de cobro', async () => {
    const architect = makeArchitectRow({ proyectos: [makeProject({ cuenta_cobro: null })] })
    mockedApi.commissionsExternal.summary.mockResolvedValue(makeSummary({ arquitectos: [architect] }))
    renderPage()
    await clickArchitectRow('Arq. Juan Pérez')
    expect(await screen.findByText('adminContab:comisionesExternas.detalle.subir')).toBeInTheDocument()
  })

  it('Mark (management) NO ve ningún botón de subir/reemplazar cuenta de cobro', async () => {
    mockedStore.mockReturnValue({ user: makeUser({ role: 'management' }) } as ReturnType<typeof useAuthStore>)
    const architect = makeArchitectRow({ proyectos: [makeProject({ cuenta_cobro: null })] })
    mockedApi.commissionsExternal.summary.mockResolvedValue(makeSummary({ arquitectos: [architect] }))
    renderPage()
    await clickArchitectRow('Arq. Juan Pérez')
    await screen.findByText('PED-0001')
    expect(screen.queryByText('adminContab:comisionesExternas.detalle.subir')).not.toBeInTheDocument()
  })

  it('un proyecto con cuenta de cobro ya subida muestra el nombre del archivo y "Reemplazar" para Felix', async () => {
    const architect = makeArchitectRow({
      proyectos: [makeProject({ cuenta_cobro: { nombre_archivo: 'cuenta1.pdf', uploaded_at: '2026-08-25T10:00:00Z' } })],
    })
    mockedApi.commissionsExternal.summary.mockResolvedValue(makeSummary({ arquitectos: [architect] }))
    renderPage()
    await clickArchitectRow('Arq. Juan Pérez')
    expect(await screen.findByText('cuenta1.pdf')).toBeInTheDocument()
    expect(screen.getByText('adminContab:comisionesExternas.detalle.reemplazar')).toBeInTheDocument()
  })
})

describe('ComisionesExternasPage — REQ-519 modal de detalle refleja mutaciones sin cerrar/reabrir', () => {
  // Hallazgo real de Pre-QA en vivo (2026-08-25, dev.atlanticerp.ai): el modal guardaba una copia
  // congelada del proyecto/arquitecto al abrirse (`detailTarget` con el objeto completo) — una
  // mutación exitosa DENTRO del modal (proponer %, subir archivos, marcar pagado) invalidaba la
  // query y `summary` se refrescaba, pero el modal seguía renderizando los props viejos porque
  // nunca se re-derivaban de la data fresca. Fix: el modal ahora guarda solo los IDs
  // (`detailTargetId`) y busca `architect`/`project` en `summary` en cada render.
  it('tras proponer un %, el modal muestra el banner de "pendiente de aprobación" sin cerrarse', async () => {
    const architect = makeArchitectRow({ proyectos: [makeProject({ porcentaje_pendiente: null })] })
    mockedApi.commissionsExternal.summary
      .mockResolvedValueOnce(makeSummary({ arquitectos: [architect] }))
      .mockResolvedValue(makeSummary({
        arquitectos: [makeArchitectRow({
          proyectos: [makeProject({ porcentaje_pendiente: 12.5, porcentaje_pendiente_motivo: 'Ajuste' })],
        })],
      }))
    mockedApi.commissionsExternal.proposePercent.mockResolvedValue({ porcentaje_pendiente: 12.5 })
    mockedApi.commissionsExternal.bankAccountOptions.mockResolvedValue([])

    renderPage()
    await clickArchitectRow('Arq. Juan Pérez')
    fireEvent.click(await screen.findByText('adminContab:comisionesExternas.detalle.verDetalle'))

    fireEvent.click(await screen.findByText('comisionesExternas.detalleModal.editarPorcentaje'))
    fireEvent.change(screen.getByPlaceholderText('comisionesExternas.detalleModal.motivoPlaceholder'), { target: { value: 'Ajuste' } })
    fireEvent.click(screen.getByText('comisionesExternas.detalleModal.proponer'))

    // El banner debe aparecer en el MISMO modal, sin ningún cierre/reapertura de por medio.
    expect(await screen.findByText(/comisionesExternas.detalleModal.propuestaPendiente/)).toBeInTheDocument()
  })
})
