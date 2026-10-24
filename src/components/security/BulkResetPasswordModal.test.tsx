import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BulkResetPasswordModal from './BulkResetPasswordModal'
import { usersApi } from '@/api/usersApi'
import { globalSettingsApi } from '@/api/globalSettingsApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/usersApi', async () => {
  const actual = await vi.importActual<typeof import('@/api/usersApi')>('@/api/usersApi')
  return { ...actual, usersApi: { resetPasswords: vi.fn() } }
})

vi.mock('@/api/globalSettingsApi', () => ({ globalSettingsApi: { list: vi.fn(), update: vi.fn() } }))

const mockedApi = vi.mocked(usersApi, true) as unknown as { resetPasswords: ReturnType<typeof vi.fn> }
const mockedSettings = vi.mocked(globalSettingsApi, true) as unknown as { list: ReturnType<typeof vi.fn> }

const PASSWORD = 'Operador-123'

const USERS = [
  { id: 1, email: 'ana@atlantic.test',  name: 'Ana Pérez' },
  { id: 2, email: 'beto@atlantic.test', name: 'Beto Ruiz' },
  { id: 3, email: 'carla@atlantic.test', name: 'Carla Gil' },
]

function preview(users = USERS) {
  return { data: { count: users.length, users } }
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <BulkResetPasswordModal onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose }
}

async function calculate() {
  fireEvent.click(screen.getByText('security:users.bulkResetPassword.calculate'))
  await screen.findByText(/security:users.bulkResetPassword.affected/)
}

beforeEach(() => { vi.clearAllMocks(); mockedSettings.list.mockResolvedValue([]) })

describe('BulkResetPasswordModal — paso 1 (simulación)', () => {
  it('al abrir no llama al backend y "incluir mi cuenta" está desmarcado', () => {
    renderModal()
    expect(mockedApi.resetPasswords).not.toHaveBeenCalled()
    expect(screen.getByLabelText('security:users.bulkResetPassword.includeSelf')).not.toBeChecked()
  })

  it('el cálculo usa dry_run, muestra la cantidad y la lista de correos', async () => {
    mockedApi.resetPasswords.mockResolvedValue(preview())
    renderModal()

    await calculate()

    expect(mockedApi.resetPasswords).toHaveBeenCalledWith({ dry_run: true, except_ids: [], include_self: false, include_superadmins: false })
    expect(screen.getByText(/security:users.bulkResetPassword.affected.*"count":3/)).toBeInTheDocument()
    expect(screen.getByText('ana@atlantic.test')).toBeInTheDocument()
    expect(screen.getByText('carla@atlantic.test')).toBeInTheDocument()
  })

  it('marcar "incluir mi cuenta" viaja en el payload y obliga a recalcular', async () => {
    mockedApi.resetPasswords.mockResolvedValue(preview())
    renderModal()
    await calculate()

    fireEvent.click(screen.getByLabelText('security:users.bulkResetPassword.includeSelf'))
    expect(screen.getByText('security:users.bulkResetPassword.calculate')).toBeInTheDocument() // preview descartado

    mockedApi.resetPasswords.mockResolvedValue(preview([...USERS, { id: 9, email: 'yo@atlantic.test', name: 'Yo' }]))
    await calculate()
    expect(mockedApi.resetPasswords).toHaveBeenLastCalledWith({ dry_run: true, except_ids: [], include_self: true, include_superadmins: false })
  })

  it('H5: "incluir superadministradores" arranca desmarcado y el cálculo viaja con include_superadmins:false', async () => {
    mockedApi.resetPasswords.mockResolvedValue(preview())
    renderModal()
    expect(screen.getByLabelText('security:users.bulkResetPassword.includeSuperadmins')).not.toBeChecked()
    expect(screen.getByText('security:users.bulkResetPassword.includeSuperadminsWarning')).toBeInTheDocument()

    await calculate()
    expect(mockedApi.resetPasswords).toHaveBeenLastCalledWith(expect.objectContaining({ dry_run: true, include_superadmins: false }))
  })

  it('H5: marcar "incluir superadministradores" descarta el cálculo, recalcula con include_superadmins:true y la frase usa el N nuevo', async () => {
    mockedApi.resetPasswords.mockResolvedValue(preview())
    renderModal()
    await calculate()

    fireEvent.click(screen.getByLabelText('security:users.bulkResetPassword.includeSuperadmins'))
    expect(screen.getByText('security:users.bulkResetPassword.calculate')).toBeInTheDocument() // preview descartado

    const conSuper = [...USERS, { id: 8, email: 'root@atlantic.test', name: 'Root' }]
    mockedApi.resetPasswords.mockResolvedValueOnce(preview(conSuper)) // recálculo
    await calculate()
    expect(mockedApi.resetPasswords).toHaveBeenLastCalledWith({ dry_run: true, except_ids: [], include_self: false, include_superadmins: true })

    mockedApi.resetPasswords.mockResolvedValueOnce(preview(conSuper)) // "continuar" recalcula con las exclusiones
    fireEvent.click(screen.getByText('security:users.bulkResetPassword.continue'))
    const input = await screen.findByLabelText(/security:users.bulkResetPassword.confirmInstruction.*RESETEAR 4/)
    const apply = screen.getByText('security:users.bulkResetPassword.apply').closest('button')!

    fireEvent.change(input, { target: { value: 'RESETEAR 3' } }) // el N viejo ya no sirve
    expect(apply).toBeDisabled()
    fireEvent.change(input, { target: { value: 'RESETEAR 4' } })
    expect(apply).toBeDisabled() // falta la contraseña del operador
    fireEvent.change(screen.getByLabelText('security:users.bulkResetPassword.passwordLabel'), { target: { value: PASSWORD } })
    expect(apply).toBeEnabled()

    mockedApi.resetPasswords.mockResolvedValueOnce({ data: { reset_count: 4 } })
    fireEvent.click(apply)
    await screen.findByText(/security:users.bulkResetPassword.resultCount.*"count":4/)
    expect(mockedApi.resetPasswords).toHaveBeenLastCalledWith({
      dry_run: false, except_ids: [], include_self: false, include_superadmins: true, confirm: 'RESETEAR 4', operator_password: PASSWORD,
    })
  })

  it('excluir usuarios actualiza la cantidad y viaja como except_ids al continuar', async () => {
    mockedApi.resetPasswords.mockResolvedValueOnce(preview())
    renderModal()
    await calculate()

    fireEvent.click(screen.getByLabelText('security:users.bulkResetPassword.excludeUser {"email":"beto@atlantic.test"}'))
    expect(screen.getByText(/security:users.bulkResetPassword.affected.*"count":2/)).toBeInTheDocument()

    mockedApi.resetPasswords.mockResolvedValueOnce(preview([USERS[0], USERS[2]]))
    fireEvent.click(screen.getByText('security:users.bulkResetPassword.continue'))

    await screen.findByLabelText(/security:users.bulkResetPassword.confirmInstruction/)
    expect(mockedApi.resetPasswords).toHaveBeenLastCalledWith({ dry_run: true, except_ids: [2], include_self: false, include_superadmins: false })
  })

  it('el filtro acota la lista visible sin cambiar los afectados', async () => {
    mockedApi.resetPasswords.mockResolvedValue(preview())
    renderModal()
    await calculate()

    fireEvent.change(screen.getByLabelText('security:users.bulkResetPassword.filterPlaceholder'), { target: { value: 'carla' } })

    expect(screen.queryByText('ana@atlantic.test')).not.toBeInTheDocument()
    expect(screen.getByText('carla@atlantic.test')).toBeInTheDocument()
    expect(screen.getByText(/security:users.bulkResetPassword.affected.*"count":3/)).toBeInTheDocument()
  })

  it('no se puede continuar si se excluye a todos', async () => {
    mockedApi.resetPasswords.mockResolvedValue(preview([USERS[0]]))
    renderModal()
    await calculate()
    fireEvent.click(screen.getByLabelText('security:users.bulkResetPassword.excludeUser {"email":"ana@atlantic.test"}'))
    expect(screen.getByText('security:users.bulkResetPassword.continue').closest('button')).toBeDisabled()
  })

  it('un conjunto vacío muestra el estado vacío', async () => {
    mockedApi.resetPasswords.mockResolvedValue(preview([]))
    renderModal()
    await calculate()
    expect(screen.getByText('security:users.bulkResetPassword.emptyPreview')).toBeInTheDocument()
  })

  it.each([
    [403, 'security:users.bulkResetPassword.errors.forbidden'],
    [429, 'security:users.bulkResetPassword.errors.throttled'],
    [500, 'security:users.bulkResetPassword.errors.generic'],
  ])('un %i al calcular muestra su mensaje', async (status, key) => {
    mockedApi.resetPasswords.mockRejectedValue({ response: { status } })
    renderModal()
    fireEvent.click(screen.getByText('security:users.bulkResetPassword.calculate'))
    expect(await screen.findByRole('alert')).toHaveTextContent(key)
  })
})

describe('BulkResetPasswordModal — paso 2 (confirmación escrita)', () => {
  async function toConfirmStep(users = USERS) {
    mockedApi.resetPasswords.mockResolvedValueOnce(preview(users))
    renderModal()
    await calculate()
    mockedApi.resetPasswords.mockResolvedValueOnce(preview(users))
    fireEvent.click(screen.getByText('security:users.bulkResetPassword.continue'))
    return screen.findByLabelText(/security:users.bulkResetPassword.confirmInstruction/)
  }

  const passwordInput = () => screen.getByLabelText('security:users.bulkResetPassword.passwordLabel') as HTMLInputElement
  const typePassword  = (value = PASSWORD) => fireEvent.change(passwordInput(), { target: { value } })

  it('"Aplicar" está deshabilitado hasta escribir EXACTAMENTE `RESETEAR <N>`', async () => {
    const input = await toConfirmStep()
    const apply = screen.getByText('security:users.bulkResetPassword.apply').closest('button')!
    expect(apply).toBeDisabled()

    for (const wrong of ['resetear 3', 'RESETEAR 2', 'RESETEAR 3 ', 'RESETEAR', ' RESETEAR 3', 'RESETEAR  3']) {
      fireEvent.change(input, { target: { value: wrong } })
      expect(apply, `no debe habilitarse con "${wrong}"`).toBeDisabled()
    }

    // Con la frase exacta pero SIN contraseña del operador, sigue deshabilitado (cierre de H3).
    fireEvent.change(input, { target: { value: 'RESETEAR 3' } })
    expect(apply).toBeDisabled()

    typePassword()
    expect(apply).toBeEnabled()

    typePassword('')
    expect(apply).toBeDisabled()
  })

  it('el campo de contraseña es type=password con autocomplete current-password', async () => {
    await toConfirmStep()
    expect(passwordInput()).toHaveAttribute('type', 'password')
    expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password')
  })

  it('aplicar manda dry_run=false con el confirm, operator_password y las exclusiones, y muestra reset_count', async () => {
    const input = await toConfirmStep()
    fireEvent.change(input, { target: { value: 'RESETEAR 3' } })
    typePassword()
    mockedApi.resetPasswords.mockResolvedValueOnce({ data: { reset_count: 3 } })

    fireEvent.click(screen.getByText('security:users.bulkResetPassword.apply'))

    expect(await screen.findByText(/security:users.bulkResetPassword.resultCount.*"count":3/)).toBeInTheDocument()
    expect(mockedApi.resetPasswords).toHaveBeenLastCalledWith({
      dry_run: false, except_ids: [], include_self: false, include_superadmins: false, confirm: 'RESETEAR 3', operator_password: PASSWORD,
    })
  })

  it('la simulación NUNCA manda operator_password', async () => {
    await toConfirmStep()
    for (const call of mockedApi.resetPasswords.mock.calls) {
      expect(call[0]).toMatchObject({ dry_run: true })
      expect(call[0]).not.toHaveProperty('operator_password')
    }
  })

  it('un 422 confirmation_mismatch muestra el aviso y ofrece volver a calcular', async () => {
    const input = await toConfirmStep()
    fireEvent.change(input, { target: { value: 'RESETEAR 3' } })
    typePassword()
    mockedApi.resetPasswords.mockRejectedValueOnce({ response: { status: 422, data: { code: 'confirmation_mismatch', message: 'x' } } })

    fireEvent.click(screen.getByText('security:users.bulkResetPassword.apply'))

    expect(await screen.findByRole('alert')).toHaveTextContent('security:users.bulkResetPassword.errors.mismatch')
    fireEvent.click(screen.getByText('security:users.bulkResetPassword.recalculate'))
    expect(screen.getByText('security:users.bulkResetPassword.calculate')).toBeInTheDocument()
  })

  it.each([
    [403, 'security:users.bulkResetPassword.errors.forbidden'],
    [429, 'security:users.bulkResetPassword.errors.throttled'],
  ])('un %i al aplicar muestra su mensaje y no muestra resultado', async (status, key) => {
    const input = await toConfirmStep()
    fireEvent.change(input, { target: { value: 'RESETEAR 3' } })
    typePassword()
    mockedApi.resetPasswords.mockRejectedValueOnce({ response: { status } })

    fireEvent.click(screen.getByText('security:users.bulkResetPassword.apply'))

    expect(await screen.findByRole('alert')).toHaveTextContent(key)
    expect(screen.queryByText(/resultCount/)).not.toBeInTheDocument()
  })

  it('un 422 operator_reauth_failed marca el campo de contraseña, la limpia y no muestra resultado', async () => {
    const input = await toConfirmStep()
    fireEvent.change(input, { target: { value: 'RESETEAR 3' } })
    typePassword('mala')
    mockedApi.resetPasswords.mockRejectedValueOnce({ response: { status: 422, data: { code: 'operator_reauth_failed', message: 'x' } } })

    fireEvent.click(screen.getByText('security:users.bulkResetPassword.apply'))

    expect(await screen.findByText('security:users.bulkResetPassword.errors.reauthFailed')).toBeInTheDocument()
    expect(passwordInput()).toHaveValue('')
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/resultCount/)).not.toBeInTheDocument()
    // Escribir de nuevo limpia el error del campo
    typePassword('otra')
    expect(screen.queryByText('security:users.bulkResetPassword.errors.reauthFailed')).not.toBeInTheDocument()
  })

  it('un 429 too_many_attempts con retry_after muestra la espera legible y limpia la contraseña', async () => {
    const input = await toConfirmStep()
    fireEvent.change(input, { target: { value: 'RESETEAR 3' } })
    typePassword()
    mockedApi.resetPasswords.mockRejectedValueOnce({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 120 } } })

    fireEvent.click(screen.getByText('security:users.bulkResetPassword.apply'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/errors\.throttledWait.*"time":"auth:errors\.wait\.minutes \{\\"count\\":2\}"/)
    expect(passwordInput()).toHaveValue('')
  })

  it('un 403 password_reset_disabled avisa que está deshabilitado y bloquea Aplicar', async () => {
    const input = await toConfirmStep()
    fireEvent.change(input, { target: { value: 'RESETEAR 3' } })
    typePassword()
    mockedApi.resetPasswords.mockRejectedValueOnce({ response: { status: 403, data: { code: 'password_reset_disabled', message: 'x' } } })

    fireEvent.click(screen.getByText('security:users.bulkResetPassword.apply'))

    expect(await screen.findByRole('alert')).toHaveTextContent('security:users.bulkResetPassword.errors.disabled')
    expect(screen.getByText('security:users.bulkResetPassword.disabledNotice')).toBeInTheDocument()
    expect(screen.getByText('security:users.bulkResetPassword.apply').closest('button')).toBeDisabled()
  })

  it('con el interruptor global apagado muestra el aviso y Aplicar queda deshabilitado aunque todo esté escrito', async () => {
    mockedSettings.list.mockResolvedValue([{ key: 'password_reset_enabled', value: false, type: 'boolean', group: 'security', label_key: 'x' }])
    const input = await toConfirmStep()
    expect(await screen.findByText('security:users.bulkResetPassword.disabledNotice')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'RESETEAR 3' } })
    expect(passwordInput()).toBeDisabled()
    expect(screen.getByText('security:users.bulkResetPassword.apply').closest('button')).toBeDisabled()
  })

  it('Volver limpia la contraseña escrita', async () => {
    await toConfirmStep()
    typePassword()
    fireEvent.click(screen.getByText('security:users.bulkResetPassword.back'))
    await waitFor(() => expect(screen.getByText('ana@atlantic.test')).toBeInTheDocument())
    mockedApi.resetPasswords.mockResolvedValueOnce(preview())
    fireEvent.click(screen.getByText('security:users.bulkResetPassword.continue'))
    expect(await screen.findByLabelText('security:users.bulkResetPassword.passwordLabel')).toHaveValue('')
  })

  it('Volver regresa al paso 1 conservando la lista', async () => {
    await toConfirmStep()
    fireEvent.click(screen.getByText('security:users.bulkResetPassword.back'))
    await waitFor(() => expect(screen.getByText('ana@atlantic.test')).toBeInTheDocument())
  })

  it('Escape cierra el modal; con una petición en curso no', async () => {
    const onClose = vi.fn()
    mockedApi.resetPasswords.mockReturnValue(new Promise(() => {}))
    const queryClient = new QueryClient()
    render(<QueryClientProvider client={queryClient}><BulkResetPasswordModal onClose={onClose} /></QueryClientProvider>)

    fireEvent.click(screen.getByText('security:users.bulkResetPassword.calculate'))
    await waitFor(() => expect(screen.getByText('common:actions.cancel').closest('button')).toBeDisabled())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape cierra el modal cuando no hay nada en curso', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
