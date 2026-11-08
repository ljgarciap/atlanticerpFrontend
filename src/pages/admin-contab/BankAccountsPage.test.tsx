import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BankAccountsPage from './BankAccountsPage'
import { adminContabApi } from '@/api/adminContabApi'
import type { BankAccount, BankMovement } from '@/types/adminContab'

// Batch 1 del cuerpo principal de Admin&Cont (SCRUM-607→611, REQ-530→534). Cubre: alta con
// validación de 4 dígitos (RN1 REQ-530), cambio automático a la tab nueva tras crear (RN3
// REQ-530), tab "Eliminadas" no aparece sin cuentas inactivas (RN2 REQ-531), eliminar pide
// confirmación (RN2 REQ-532), movimientos filtrados por tab de cuenta (REQ-533), "Sin cuenta
// asignada" en Todas (RN3 REQ-533), selector de cuenta de REQ-534 solo ofrece activas y solo
// aparece para comisiones sin cuenta (RN1/RN2 REQ-534).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    bankAccounts: { list: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn(), reactivate: vi.fn() },
    bankMovements: { list: vi.fn(), assignAccount: vi.fn(), reassignAccount: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeAccounts(): BankAccount[] {
  return [
    { id: 1, banco: 'Banco Demo B', tipo_cuenta: 'corriente', ultimos_4_digitos: '9034', numero_cuenta_completo: null, moneda: 'USD', activa: true, movimientos_count: 3 },
    { id: 2, banco: 'Banco Demo A', tipo_cuenta: 'ahorro', ultimos_4_digitos: '1122', numero_cuenta_completo: null, moneda: 'USD', activa: true, movimientos_count: 0 },
  ]
}

function makeMovements(): BankMovement[] {
  return [
    { id: 10, fecha: '2026-08-01', tipo: 'cobro', concepto: 'Cobro factura F-100', monto: 500, direccion: 'entrada', bank_account_id: 1, bank_account_label: 'Banco Demo B — Cuenta Corriente ****9034' },
    { id: 11, fecha: '2026-08-02', tipo: 'comision', concepto: 'Comisión Vendedor', monto: 80, direccion: 'salida', bank_account_id: null, bank_account_label: null },
    { id: 12, fecha: '2026-08-03', tipo: 'devolucion', concepto: 'Devolución NC-5', monto: 40, direccion: 'salida', bank_account_id: null, bank_account_label: null },
  ]
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BankAccountsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedApi.bankAccounts.list.mockResolvedValue(makeAccounts())
  mockedApi.bankMovements.list.mockImplementation((bankAccountId?: number) => {
    const all = makeMovements()
    const data = bankAccountId === undefined ? all : all.filter(m => m.bank_account_id === bankAccountId)
    return Promise.resolve({ data, meta: { total: data.length, per_page: 20, current_page: 1, last_page: 1 } })
  })
})

describe('BankAccountsPage', () => {
  it('exige exactamente 4 dígitos numéricos al crear una cuenta', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.addButton'))

    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.fields.banco'), { target: { value: 'Banco Demo B' } })
    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.fields.ultimos4'), { target: { value: '90' } })
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.saveButton'))

    expect(await screen.findByText('adminContab:cuentasBancarias.validation.digits4')).toBeInTheDocument()
    expect(mockedApi.bankAccounts.create).not.toHaveBeenCalled()
  })

  it('al crear una cuenta, la pantalla cambia automáticamente a su tab (RN3 REQ-530)', async () => {
    mockedApi.bankAccounts.create.mockResolvedValue(
      { id: 3, banco: 'Banco Demo C', tipo_cuenta: 'corriente', ultimos_4_digitos: '4455', numero_cuenta_completo: null, moneda: 'USD', activa: true, movimientos_count: 0 },
    )
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.addButton'))

    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.fields.banco'), { target: { value: 'Banco Demo C' } })
    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.fields.ultimos4'), { target: { value: '4455' } })
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.saveButton'))

    await waitFor(() => expect(mockedApi.bankAccounts.create).toHaveBeenCalledWith({
      banco: 'Banco Demo C', ultimos_4_digitos: '4455', tipo_cuenta: 'corriente', moneda: 'USD',
    }))
    // Tras crear, la nueva cuenta (id=3) queda seleccionada como tab activa — dispara el fetch de
    // movimientos filtrado a esa cuenta.
    await waitFor(() => expect(mockedApi.bankMovements.list).toHaveBeenCalledWith(3, 1, 20))
  })

  it('banco vacío y banco de solo espacios dan el mismo mensaje de obligatorio (rebote QA SCRUM-607)', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.addButton'))

    // referencia tomada una sola vez: tras el primer submit fallido, el <p> de error queda dentro
    // del mismo <label>, así que el texto accesible del label deja de matchear la key exacta
    const bancoInput = screen.getByLabelText('adminContab:cuentasBancarias.fields.banco')
    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.fields.ultimos4'), { target: { value: '9034' } })
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.saveButton'))
    expect(await screen.findByText('adminContab:cuentasBancarias.validation.bancoRequired')).toBeInTheDocument()

    fireEvent.change(bancoInput, { target: { value: '   ' } })
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.saveButton'))
    expect(await screen.findByText('adminContab:cuentasBancarias.validation.bancoRequired')).toBeInTheDocument()
    expect(mockedApi.bankAccounts.create).not.toHaveBeenCalled()
  })

  it('moneda es un selector con catálogo cerrado (USD/PAB/EUR), no texto libre (rebote QA SCRUM-607)', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.addButton'))

    const select = screen.getByLabelText('adminContab:cuentasBancarias.fields.moneda') as HTMLSelectElement
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('USD') // default RN1 REQ-530
    expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['USD', 'PAB', 'EUR'])
  })

  it('la tab "Eliminadas" no aparece si no hay cuentas inactivas', async () => {
    renderPage()
    await screen.findByText('Banco Demo B — adminContab:cuentasBancarias.tipos.corriente ****9034 · USD')
    expect(screen.queryByText(/adminContab:cuentasBancarias.tabs.deleted/)).not.toBeInTheDocument()
  })

  it('la tab "Eliminadas" aparece con el conteo cuando hay cuentas inactivas', async () => {
    mockedApi.bankAccounts.list.mockResolvedValue([
      ...makeAccounts(),
      { id: 9, banco: 'Banco Demo D', tipo_cuenta: 'ahorro', ultimos_4_digitos: '7777', numero_cuenta_completo: null, moneda: 'USD', activa: false, movimientos_count: 2 },
    ])
    renderPage()
    expect(await screen.findByText('adminContab:cuentasBancarias.tabs.deleted (1)')).toBeInTheDocument()
  })

  it('la tab de una cuenta activa muestra la moneda, además de banco/tipo/dígitos (RN3 REQ-531)', async () => {
    renderPage()
    await screen.findByText('Banco Demo B — adminContab:cuentasBancarias.tipos.corriente ****9034 · USD')
  })

  it('eliminar una cuenta exige confirmación explícita antes de aplicar (RN2 REQ-532)', async () => {
    renderPage()
    fireEvent.click((await screen.findAllByLabelText('adminContab:cuentasBancarias.detail'))[0])

    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.deleteAccount'))
    expect(screen.getByText('adminContab:cuentasBancarias.confirmDelete')).toBeInTheDocument()
    expect(mockedApi.bankAccounts.deactivate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.confirmDeleteButton'))
    await waitFor(() => expect(mockedApi.bankAccounts.deactivate).toHaveBeenCalledWith(1))
  })

  it('los movimientos se filtran al seleccionar la tab de una cuenta específica', async () => {
    renderPage()
    await screen.findByText('adminContab:cuentasBancarias.movimientos.fecha')
    expect(mockedApi.bankMovements.list).toHaveBeenCalledWith(undefined, 1, 20)

    fireEvent.click(screen.getByText('Banco Demo B — adminContab:cuentasBancarias.tipos.corriente ****9034 · USD'))
    await waitFor(() => expect(mockedApi.bankMovements.list).toHaveBeenCalledWith(1, 1, 20))
  })

  it('en la tab "Todas", un movimiento sin cuenta muestra "Sin cuenta asignada" (RN3 REQ-533)', async () => {
    renderPage()
    const rows = await screen.findAllByText('adminContab:cuentasBancarias.sinCuentaAsignada')
    expect(rows).toHaveLength(2) // comisión + devolución, ambas sin cuenta en el fixture
  })

  it('el botón "Seleccionar cuenta" solo aparece en comisiones sin cuenta, nunca en cobros/devoluciones (RN1 REQ-534)', async () => {
    renderPage()
    await screen.findByText('Comisión Vendedor')

    const rows = screen.getAllByRole('row').slice(1) // sin el header
    const cobroRow       = rows.find(r => within(r).queryByText('Cobro factura F-100'))!
    const comisionRow    = rows.find(r => within(r).queryByText('Comisión Vendedor'))!
    const devolucionRow  = rows.find(r => within(r).queryByText('Devolución NC-5'))!

    expect(within(cobroRow).queryByText('adminContab:cuentasBancarias.seleccionarCuenta')).not.toBeInTheDocument()
    expect(within(devolucionRow).queryByText('adminContab:cuentasBancarias.seleccionarCuenta')).not.toBeInTheDocument()
    expect(within(comisionRow).getByText('adminContab:cuentasBancarias.seleccionarCuenta')).toBeInTheDocument()
  })

  it('el selector de "Seleccionar cuenta" solo ofrece cuentas activas (RN2 REQ-534)', async () => {
    mockedApi.bankAccounts.list.mockResolvedValue([
      ...makeAccounts(),
      { id: 9, banco: 'Banco Demo D', tipo_cuenta: 'ahorro', ultimos_4_digitos: '7777', numero_cuenta_completo: null, moneda: 'USD', activa: false, movimientos_count: 0 },
    ])
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.seleccionarCuenta'))

    const select = await screen.findByText('adminContab:cuentasBancarias.selectAccountPlaceholder')
    const options = within(select.closest('select')!).getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual([
      'adminContab:cuentasBancarias.selectAccountPlaceholder',
      'Banco Demo B — adminContab:cuentasBancarias.tipos.corriente ****9034',
      'Banco Demo A — adminContab:cuentasBancarias.tipos.ahorro ****1122',
    ])

    fireEvent.change(select.closest('select')!, { target: { value: '2' } })
    await waitFor(() => expect(mockedApi.bankMovements.assignAccount).toHaveBeenCalledWith(11, 2))
  })

  // SCRUM-947 — paginación estándar.
  it('con más de una página de movimientos, cambiar de tab reinicia a la página 1', async () => {
    mockedApi.bankMovements.list.mockResolvedValue({
      data: makeMovements(),
      meta: { total: 45, per_page: 20, current_page: 1, last_page: 3 },
    })
    renderPage()
    await screen.findByText('adminContab:cuentasBancarias.movimientos.fecha')

    fireEvent.click(screen.getByText('2')) // página 2
    await waitFor(() => expect(mockedApi.bankMovements.list).toHaveBeenLastCalledWith(undefined, 2, 20))

    fireEvent.click(screen.getByText('Banco Demo B — adminContab:cuentasBancarias.tipos.corriente ****9034 · USD'))
    await waitFor(() => expect(mockedApi.bankMovements.list).toHaveBeenLastCalledWith(1, 1, 20))
  })
  // ── Fase 28 (grupo 4) — tesorería ───────────────────────────────────────────────────────

  it('Fase 28 — muestra el pendiente de salidas sin cuenta y «Ver pendientes» aplica el filtro', async () => {
    mockedApi.bankMovements.list.mockImplementation(() => Promise.resolve({
      data: makeMovements(), meta: { total: 3, per_page: 20, current_page: 1, last_page: 1 },
      pendientes_sin_cuenta: { cantidad: 2, monto: 120 },
    }))
    renderPage()

    expect(await screen.findByTestId('pendientes-sin-cuenta')).toBeInTheDocument()
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.verPendientes'))
    await waitFor(() => expect(mockedApi.bankMovements.list).toHaveBeenLastCalledWith(undefined, 1, 20, { sinCuenta: true }))
  })

  it('Fase 28 — filtrar por tipo reenvía la consulta con el filtro y reinicia la página', async () => {
    renderPage()
    await screen.findByText('Comisión Vendedor')

    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.movimientos.tipo'), { target: { value: 'devolucion' } })
    await waitFor(() => expect(mockedApi.bankMovements.list).toHaveBeenLastCalledWith(undefined, 1, 20, { tipo: 'devolucion' }))
  })

  it('Fase 28 — «Corregir cuenta» solo aparece en movimientos no-cobro con cuenta y exige motivo', async () => {
    mockedApi.bankMovements.list.mockImplementation(() => Promise.resolve({
      data: [
        { id: 20, fecha: '2026-08-04', tipo: 'comision', concepto: 'Comisión con cuenta', monto: 90, direccion: 'salida', bank_account_id: 1, bank_account_label: 'Banco Demo B' },
        { id: 10, fecha: '2026-08-01', tipo: 'cobro', concepto: 'Cobro factura F-100', monto: 500, direccion: 'entrada', bank_account_id: 1, bank_account_label: 'Banco Demo B' },
      ],
      meta: { total: 2, per_page: 20, current_page: 1, last_page: 1 },
    }))
    mockedApi.bankMovements.reassignAccount.mockResolvedValue({} as BankMovement)
    renderPage()
    await screen.findByText('Comisión con cuenta')

    expect(screen.getAllByText('adminContab:cuentasBancarias.corregir.boton')).toHaveLength(1)
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.corregir.boton'))

    const guardar = screen.getByText('common:actions.save').closest('button')!
    expect(guardar).toBeDisabled()
    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.corregir.cuentaNueva'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.corregir.motivo'), { target: { value: 'Salió por la otra cuenta' } })
    expect(guardar).not.toBeDisabled()
    fireEvent.click(guardar)

    await waitFor(() => expect(mockedApi.bankMovements.reassignAccount).toHaveBeenCalledWith(20, 2, 'Salió por la otra cuenta'))
  })
  it('Fase 28 — al desactivar una cuenta con movimientos muestra el aviso del backend antes de cerrar', async () => {
    mockedApi.bankAccounts.deactivate.mockResolvedValue({ ...makeAccounts()[0], activa: false, avisos: ['La cuenta tiene 3 movimiento(s) registrados.'] })
    renderPage()
    fireEvent.click((await screen.findAllByLabelText('adminContab:cuentasBancarias.detail'))[0])
    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.deleteAccount'))
    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.confirmDeleteButton'))

    expect(await screen.findByTestId('avisos-desactivar')).toHaveTextContent('3 movimiento')
  })
})
