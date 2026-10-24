import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BankAccountDetailModal from './BankAccountDetailModal'
import { adminContabApi } from '@/api/adminContabApi'
import type { BankAccount } from '@/types/adminContab'

// SCRUM-857 (REQ-458) — antes no existía ningún endpoint/UI para editar una cuenta ya creada
// (solo activar/desactivar); este modal es donde se completa `numero_cuenta_completo`.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/adminContabApi', () => ({
  adminContabApi: {
    bankAccounts: { update: vi.fn(), deactivate: vi.fn(), reactivate: vi.fn() },
  },
}))

const mockedApi = vi.mocked(adminContabApi, true)

function makeAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 1, banco: 'Banco General', tipo_cuenta: 'corriente', ultimos_4_digitos: '4455',
    numero_cuenta_completo: null, moneda: 'USD', activa: true, movimientos_count: 0,
    ...overrides,
  }
}

function renderModal(account: BankAccount, onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <BankAccountDetailModal account={account} onClose={onClose} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BankAccountDetailModal — numero_cuenta_completo (SCRUM-857)', () => {
  it('sin número cargado, muestra el estado vacío y el botón Editar', () => {
    renderModal(makeAccount())

    expect(screen.getByText('adminContab:cuentasBancarias.numeroCuentaCompleto.empty')).toBeInTheDocument()
    expect(screen.getByText('adminContab:cuentasBancarias.numeroCuentaCompleto.editButton')).toBeInTheDocument()
  })

  it('con número ya cargado, lo muestra tal cual (nunca enmascarado acá)', () => {
    renderModal(makeAccount({ numero_cuenta_completo: '03-01-01-074455-4' }))

    expect(screen.getByText('03-01-01-074455-4')).toBeInTheDocument()
  })

  it('click en Editar abre un input precargado con el valor actual; Guardar llama a update con el valor nuevo', async () => {
    mockedApi.bankAccounts.update.mockResolvedValue(makeAccount({ numero_cuenta_completo: '03-01-01-074455-4' }))
    renderModal(makeAccount())

    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.numeroCuentaCompleto.editButton'))
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('')

    fireEvent.change(input, { target: { value: '03-01-01-074455-4' } })
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.numeroCuentaCompleto.saveButton'))

    await waitFor(() => expect(mockedApi.bankAccounts.update).toHaveBeenCalledWith(
      1, { numero_cuenta_completo: '03-01-01-074455-4' },
    ))
    // Vuelve a modo lectura tras guardar con éxito.
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
  })

  it('un valor de solo espacios se guarda como null, no como string vacío', async () => {
    mockedApi.bankAccounts.update.mockResolvedValue(makeAccount())
    renderModal(makeAccount({ numero_cuenta_completo: '03-01-01-074455-4' }))

    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.numeroCuentaCompleto.editButton'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.numeroCuentaCompleto.saveButton'))

    await waitFor(() => expect(mockedApi.bankAccounts.update).toHaveBeenCalledWith(
      1, { numero_cuenta_completo: null },
    ))
  })

  it('un error al guardar se muestra y no cierra el modo edición', async () => {
    mockedApi.bankAccounts.update.mockRejectedValue(new Error('fail'))
    renderModal(makeAccount())

    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.numeroCuentaCompleto.editButton'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '123' } })
    fireEvent.click(screen.getByText('adminContab:cuentasBancarias.numeroCuentaCompleto.saveButton'))

    expect(await screen.findByText('adminContab:cuentasBancarias.numeroCuentaCompleto.saveError')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })
})
