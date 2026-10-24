import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ResetPasswordModal from './ResetPasswordModal'
import { usersApi, type UserListItem } from '@/api/usersApi'
import { globalSettingsApi } from '@/api/globalSettingsApi'
import { useAuthStore } from '@/store/authStore'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/usersApi', async () => {
  const actual = await vi.importActual<typeof import('@/api/usersApi')>('@/api/usersApi')
  return { ...actual, usersApi: { resetPassword: vi.fn() } }
})

vi.mock('@/api/globalSettingsApi', () => ({ globalSettingsApi: { list: vi.fn(), update: vi.fn() } }))

const mockedApi = vi.mocked(usersApi, true)
const mockedSettings = vi.mocked(globalSettingsApi, true) as unknown as { list: ReturnType<typeof vi.fn> }

const PASSWORD = 'Operador-123'
const OK = { data: { id: 42, email: 'juan@atlantic.test', must_change_password: true } }

function makeUser(overrides: Partial<UserListItem> = {}): UserListItem {
  return {
    id: 42, first_name: 'Juan', last_name: 'García', email: 'juan@atlantic.test', phone: null,
    job_title: null, hire_date: null, manager: null,
    is_active: true, mfa_enabled: false, notes: null, department: null, extra_permissions: [],
    security_level: { id: 3, level: 3, name: 'Nivel 3' }, roles: [],
    role_id: 1, additional_role_ids: [], approve_large_amounts: false, manage_users: false,
    ...overrides,
  }
}

function renderModal(props: Partial<{ onClose: ReturnType<typeof vi.fn>; onDone: ReturnType<typeof vi.fn>; user: UserListItem }> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onClose = props.onClose ?? vi.fn()
  const onDone  = props.onDone  ?? vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <ResetPasswordModal user={props.user ?? makeUser()} onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  )
  return { onClose, onDone }
}

beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ user: null }); mockedSettings.list.mockResolvedValue([]) })

describe('ResetPasswordModal', () => {
  it('muestra el nombre y el correo y advierte del cambio obligatorio', () => {
    renderModal()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/security:users.resetPassword.message/).textContent).toContain('juan@atlantic.test')
    expect(screen.getByText(/security:users.resetPassword.message/).textContent).toContain('Juan García')
  })

  it('avisa que la sesión actual se invalida SOLO cuando el usuario objetivo es la propia cuenta del operador', () => {
    useAuthStore.setState({ user: { id: 42 } as never })
    renderModal({ user: makeUser({ id: 42 }) })
    expect(screen.getByRole('note')).toHaveTextContent('security:users.resetPassword.selfWarning')
  })

  it('no muestra el aviso de cuenta propia al restablecer a otra persona', () => {
    useAuthStore.setState({ user: { id: 1 } as never })
    renderModal({ user: makeUser({ id: 42 }) })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('confirmar llama al endpoint con el id correcto y avisa al padre', async () => {
    mockedApi.resetPassword.mockResolvedValue({ data: { id: 42, email: 'juan@atlantic.test', must_change_password: true } })
    const { onDone } = renderModal()

    fireEvent.click(screen.getByText('security:users.resetPassword.confirm'))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    // Persona normal: no se pide ni se manda la contraseña del operador.
    expect(mockedApi.resetPassword).toHaveBeenCalledWith(42, undefined)
    expect(onDone.mock.calls[0][0].id).toBe(42)
  })

  it('un 422 (usuario inactivo) muestra el mensaje del backend y no cierra', async () => {
    mockedApi.resetPassword.mockRejectedValue({ response: { status: 422, data: { message: 'El usuario está inactivo' } } })
    const { onDone } = renderModal()

    fireEvent.click(screen.getByText('security:users.resetPassword.confirm'))

    expect(await screen.findByRole('alert')).toHaveTextContent('El usuario está inactivo')
    expect(onDone).not.toHaveBeenCalled()
  })

  it.each([
    [403, 'security:users.resetPassword.errors.forbidden'],
    [404, 'security:users.resetPassword.errors.notFound'],
    [429, 'security:users.resetPassword.errors.throttled'],
    [500, 'security:users.resetPassword.errors.generic'],
  ])('un %i muestra su mensaje propio', async (status, key) => {
    mockedApi.resetPassword.mockRejectedValue({ response: { status } })
    renderModal()
    fireEvent.click(screen.getByText('security:users.resetPassword.confirm'))
    expect(await screen.findByRole('alert')).toHaveTextContent(key)
  })

  describe('re-autenticación del operador (cierre de H3)', () => {
    const passwordInput = () => screen.getByLabelText('security:users.resetPassword.passwordLabel') as HTMLInputElement
    const typePassword  = (value = PASSWORD) => fireEvent.change(passwordInput(), { target: { value } })
    const confirmBtn    = () => screen.getByText('security:users.resetPassword.confirm').closest('button')!

    it('una persona normal NO ve el campo de contraseña', () => {
      renderModal()
      expect(screen.queryByLabelText('security:users.resetPassword.passwordLabel')).not.toBeInTheDocument()
    })

    it.each([
      ['rol superadmin',        { roles: ['superadmin'] }],
      ['nivel 10',              { security_level: { id: 10, level: 10, name: 'Nivel 10' } }],
      ['permiso superadmin.all', { extra_permissions: ['superadmin.all'] }],
    ])('un objetivo de máximo privilegio (%s) pide la contraseña de antemano y no permite confirmar sin ella', async (_n, overrides) => {
      mockedApi.resetPassword.mockResolvedValue(OK)
      const { onDone } = renderModal({ user: makeUser(overrides as Partial<UserListItem>) })

      expect(passwordInput()).toHaveAttribute('type', 'password')
      expect(passwordInput()).toHaveAttribute('autocomplete', 'current-password')
      expect(confirmBtn()).toBeDisabled()

      typePassword()
      expect(confirmBtn()).toBeEnabled()
      fireEvent.click(confirmBtn())

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
      expect(mockedApi.resetPassword).toHaveBeenCalledWith(42, PASSWORD)
    })

    it('persona normal pasado el tope por hora: la primera confirmación va sin contraseña, el backend la pide y el reintento la envía (R3-1)', async () => {
      mockedApi.resetPassword.mockRejectedValueOnce({ response: { status: 422, data: { code: 'operator_password_required', message: 'tope' } } })
      renderModal()
      expect(screen.queryByLabelText('security:users.resetPassword.passwordLabel')).not.toBeInTheDocument()
      fireEvent.click(confirmBtn())
      await screen.findByLabelText('security:users.resetPassword.passwordLabel')
      expect(mockedApi.resetPassword).toHaveBeenNthCalledWith(1, 42, undefined)

      mockedApi.resetPassword.mockResolvedValueOnce(OK)
      typePassword()
      fireEvent.click(confirmBtn())
      await waitFor(() => expect(mockedApi.resetPassword).toHaveBeenNthCalledWith(2, 42, PASSWORD))
    })

    it('si el backend responde 422 operator_password_required revela el campo, no cierra y permite reintentar', async () => {
      mockedApi.resetPassword.mockRejectedValueOnce({ response: { status: 422, data: { code: 'operator_password_required', message: 'x' } } })
      const { onDone } = renderModal() // persona "normal" para el frontend, pero el backend la considera privilegiada
      fireEvent.click(confirmBtn())

      expect(await screen.findByText('security:users.resetPassword.errors.passwordRequired')).toBeInTheDocument()
      expect(passwordInput()).toBeInTheDocument()
      expect(onDone).not.toHaveBeenCalled()
      expect(confirmBtn()).toBeDisabled() // ahora exige la contraseña

      mockedApi.resetPassword.mockResolvedValueOnce(OK)
      typePassword()
      fireEvent.click(confirmBtn())
      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
      expect(mockedApi.resetPassword).toHaveBeenLastCalledWith(42, PASSWORD)
    })

    it('un 422 operator_reauth_failed marca el campo, limpia la contraseña y no cierra', async () => {
      mockedApi.resetPassword.mockRejectedValueOnce({ response: { status: 422, data: { code: 'operator_reauth_failed', message: 'x' } } })
      const { onDone } = renderModal({ user: makeUser({ roles: ['superadmin'] }) })
      typePassword('mala')
      fireEvent.click(confirmBtn())

      expect(await screen.findByText('security:users.resetPassword.errors.reauthFailed')).toBeInTheDocument()
      expect(passwordInput()).toHaveValue('')
      expect(passwordInput()).toHaveAttribute('aria-invalid', 'true')
      expect(onDone).not.toHaveBeenCalled()
    })

    it('un 429 too_many_attempts muestra la espera legible a partir de retry_after y limpia la contraseña', async () => {
      mockedApi.resetPassword.mockRejectedValueOnce({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 300 } } })
      renderModal({ user: makeUser({ roles: ['superadmin'] }) })
      typePassword()
      fireEvent.click(confirmBtn())

      expect(await screen.findByRole('alert')).toHaveTextContent(/errors\.throttledWait.*"time":"auth:errors\.wait\.minutes \{\\"count\\":5\}"/)
      expect(passwordInput()).toHaveValue('')
    })

    it('un 403 password_reset_disabled avisa que está deshabilitado en este entorno y bloquea el botón', async () => {
      mockedApi.resetPassword.mockRejectedValueOnce({ response: { status: 403, data: { code: 'password_reset_disabled', message: 'x' } } })
      renderModal()
      fireEvent.click(confirmBtn())

      expect(await screen.findByRole('alert')).toHaveTextContent('security:users.resetPassword.errors.disabled')
      expect(confirmBtn()).toBeDisabled()
    })

    it('con el interruptor global apagado muestra el aviso y deshabilita la confirmación desde el inicio', async () => {
      mockedSettings.list.mockResolvedValue([{ key: 'password_reset_enabled', value: false, type: 'boolean', group: 'security', label_key: 'x' }])
      renderModal()
      expect(await screen.findByRole('note')).toHaveTextContent('security:users.resetPassword.errors.disabled')
      expect(confirmBtn()).toBeDisabled()
    })

    it('con el interruptor global encendido confirma normal', async () => {
      mockedSettings.list.mockResolvedValue([{ key: 'password_reset_enabled', value: true, type: 'boolean', group: 'security', label_key: 'x' }])
      mockedApi.resetPassword.mockResolvedValue(OK)
      const { onDone } = renderModal()
      await waitFor(() => expect(mockedSettings.list).toHaveBeenCalled())
      fireEvent.click(confirmBtn())
      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    })
  })

  it('Cancelar y Escape cierran sin llamar al backend', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByText('common:actions.cancel'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(mockedApi.resetPassword).not.toHaveBeenCalled()
  })

  it('enfoca el botón Cancelar al abrir (la acción destructiva no queda enfocada)', () => {
    renderModal()
    expect(screen.getByText('common:actions.cancel')).toHaveFocus()
  })
})
