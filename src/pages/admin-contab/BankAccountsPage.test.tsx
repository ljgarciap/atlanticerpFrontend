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
    bankAccounts: { list: vi.fn(), create: vi.fn(), deactivate: vi.fn(), reactivate: vi.fn() },
    bankMovements: { list: vi.fn(), assignAccount: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeAccounts(): BankAccount[] {
  return [
    { id: 1, banco: 'Banistmo', tipo_cuenta: 'corriente', ultimos_4_digitos: '9034', moneda: 'USD', activa: true, movimientos_count: 3 },
    { id: 2, banco: 'Banco General', tipo_cuenta: 'ahorro', ultimos_4_digitos: '1122', moneda: 'USD', activa: true, movimientos_count: 0 },
  ]
}

function makeMovements(): BankMovement[] {
  return [
    { id: 10, fecha: '2026-08-01', tipo: 'cobro', concepto: 'Cobro factura F-100', monto: 500, direccion: 'entrada', bank_account_id: 1, bank_account_label: 'Banistmo — Cuenta Corriente ****9034' },
    { id: 11, fecha: '2026-08-02', tipo: 'comision', concepto: 'Comisión Neil', monto: 80, direccion: 'salida', bank_account_id: null, bank_account_label: null },
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
    return Promise.resolve(bankAccountId === undefined ? all : all.filter(m => m.bank_account_id === bankAccountId))
  })
})

describe('BankAccountsPage', () => {
  it('exige exactamente 4 dígitos numéricos al crear una cuenta', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.addButton'))

    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.fields.banco'), { target: { value: 'Banistmo' } })
    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.fields.ultimos4'), { target: { value: '90' } })
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.saveButton'))

    expect(await screen.findByText('adminContab:cuentasBancarias.validation.digits4')).toBeInTheDocument()
    expect(mockedApi.bankAccounts.create).not.toHaveBeenCalled()
  })

  it('al crear una cuenta, la pantalla cambia automáticamente a su tab (RN3 REQ-530)', async () => {
    mockedApi.bankAccounts.create.mockResolvedValue(
      { id: 3, banco: 'Global Bank', tipo_cuenta: 'corriente', ultimos_4_digitos: '4455', moneda: 'USD', activa: true, movimientos_count: 0 },
    )
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.addButton'))

    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.fields.banco'), { target: { value: 'Global Bank' } })
    fireEvent.change(screen.getByLabelText('adminContab:cuentasBancarias.fields.ultimos4'), { target: { value: '4455' } })
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.saveButton'))

    await waitFor(() => expect(mockedApi.bankAccounts.create).toHaveBeenCalledWith({
      banco: 'Global Bank', ultimos_4_digitos: '4455', tipo_cuenta: 'corriente', moneda: 'USD',
    }))
    // Tras crear, la nueva cuenta (id=3) queda seleccionada como tab activa — dispara el fetch de
    // movimientos filtrado a esa cuenta.
    await waitFor(() => expect(mockedApi.bankMovements.list).toHaveBeenCalledWith(3))
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
    await screen.findByText('Banistmo — adminContab:cuentasBancarias.tipos.corriente ****9034 · USD')
    expect(screen.queryByText(/adminContab:cuentasBancarias.tabs.deleted/)).not.toBeInTheDocument()
  })

  it('la tab "Eliminadas" aparece con el conteo cuando hay cuentas inactivas', async () => {
    mockedApi.bankAccounts.list.mockResolvedValue([
      ...makeAccounts(),
      { id: 9, banco: 'Multibank', tipo_cuenta: 'ahorro', ultimos_4_digitos: '7777', moneda: 'USD', activa: false, movimientos_count: 2 },
    ])
    renderPage()
    expect(await screen.findByText('adminContab:cuentasBancarias.tabs.deleted (1)')).toBeInTheDocument()
  })

  it('la tab de una cuenta activa muestra la moneda, además de banco/tipo/dígitos (RN3 REQ-531)', async () => {
    renderPage()
    await screen.findByText('Banistmo — adminContab:cuentasBancarias.tipos.corriente ****9034 · USD')
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
    expect(mockedApi.bankMovements.list).toHaveBeenCalledWith(undefined)

    fireEvent.click(screen.getByText('Banistmo — adminContab:cuentasBancarias.tipos.corriente ****9034 · USD'))
    await waitFor(() => expect(mockedApi.bankMovements.list).toHaveBeenCalledWith(1))
  })

  it('en la tab "Todas", un movimiento sin cuenta muestra "Sin cuenta asignada" (RN3 REQ-533)', async () => {
    renderPage()
    const rows = await screen.findAllByText('adminContab:cuentasBancarias.sinCuentaAsignada')
    expect(rows).toHaveLength(2) // comisión + devolución, ambas sin cuenta en el fixture
  })

  it('el botón "Seleccionar cuenta" solo aparece en comisiones sin cuenta, nunca en cobros/devoluciones (RN1 REQ-534)', async () => {
    renderPage()
    await screen.findByText('Comisión Neil')

    const rows = screen.getAllByRole('row').slice(1) // sin el header
    const cobroRow       = rows.find(r => within(r).queryByText('Cobro factura F-100'))!
    const comisionRow    = rows.find(r => within(r).queryByText('Comisión Neil'))!
    const devolucionRow  = rows.find(r => within(r).queryByText('Devolución NC-5'))!

    expect(within(cobroRow).queryByText('adminContab:cuentasBancarias.seleccionarCuenta')).not.toBeInTheDocument()
    expect(within(devolucionRow).queryByText('adminContab:cuentasBancarias.seleccionarCuenta')).not.toBeInTheDocument()
    expect(within(comisionRow).getByText('adminContab:cuentasBancarias.seleccionarCuenta')).toBeInTheDocument()
  })

  it('el selector de "Seleccionar cuenta" solo ofrece cuentas activas (RN2 REQ-534)', async () => {
    mockedApi.bankAccounts.list.mockResolvedValue([
      ...makeAccounts(),
      { id: 9, banco: 'Multibank', tipo_cuenta: 'ahorro', ultimos_4_digitos: '7777', moneda: 'USD', activa: false, movimientos_count: 0 },
    ])
    renderPage()
    fireEvent.click(await screen.findByText('adminContab:cuentasBancarias.seleccionarCuenta'))

    const select = await screen.findByText('adminContab:cuentasBancarias.selectAccountPlaceholder')
    const options = within(select.closest('select')!).getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual([
      'adminContab:cuentasBancarias.selectAccountPlaceholder',
      'Banistmo — adminContab:cuentasBancarias.tipos.corriente ****9034',
      'Banco General — adminContab:cuentasBancarias.tipos.ahorro ****1122',
    ])

    fireEvent.change(select.closest('select')!, { target: { value: '2' } })
    await waitFor(() => expect(mockedApi.bankMovements.assignAccount).toHaveBeenCalledWith(11, 2))
  })
})
