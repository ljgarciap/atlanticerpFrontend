import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import LoginPage from './LoginPage'
import GuestOnly from '@/components/GuestOnly'
import { authApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'

// Cierre de H2/H4 — mensajes de login por contraseña temporal vencida (401 password_reset_expired) y por
// límite de intentos (429 too_many_attempts) con cuenta atrás, también en MFA y reenvío de código.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/authApi', () => ({
  authApi: { login: vi.fn(), mfaVerify: vi.fn(), mfaResend: vi.fn() },
}))

const mockedApi = vi.mocked(authApi, true)

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<div>pantalla-olvide</div>} />
        <Route path="*" element={<div>destino</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const emailInput    = () => document.querySelector('input[type="email"]') as HTMLInputElement
const passwordInput = () => document.querySelector('input[type="password"]') as HTMLInputElement
// Por selector (no por texto): mientras el envío está en curso el botón muestra 'loggingIn'.
const submitBtn     = () => document.querySelector('form button[type="submit"]') as HTMLButtonElement

async function submitLogin(email = 'ana@atlantic.test', password = 'secreta') {
  fireEvent.change(emailInput(), { target: { value: email } })
  fireEvent.change(passwordInput(), { target: { value: password } })
  fireEvent.click(submitBtn())
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, passwordResetExpired: false, sessionExpired: false })
})

describe('LoginPage — acceso (SCRUM-1177)', () => {
  it('ofrece recuperar la contraseña y no enlaza a un registro público', () => {
    renderLogin()
    expect(screen.getAllByText('auth:login.forgotPassword')[0].closest('a')).toHaveAttribute('href', '/forgot-password')
    expect(document.querySelector('a[href="/register"]')).toBeNull()
  })
})

describe('LoginPage — errores normales', () => {
  it('con credenciales inválidas muestra el mensaje del backend, sin aviso de vencimiento ni de espera', async () => {
    mockedApi.login.mockRejectedValue({ response: { status: 401, data: { message: 'Credenciales inválidas' } } })
    renderLogin()
    await submitLogin()

    expect(await screen.findByText('Credenciales inválidas')).toBeInTheDocument()
    expect(screen.queryByText('auth:errors.passwordResetExpired')).not.toBeInTheDocument()
    expect(screen.queryByText(/auth:errors.tooManyAttempts/)).not.toBeInTheDocument()
    expect(submitBtn()).toBeEnabled()
  })

  it('sin mensaje del backend usa el texto genérico de credenciales (no revela si el correo existe)', async () => {
    mockedApi.login.mockRejectedValue(new Error('Network Error'))
    renderLogin()
    await submitLogin('nadie@atlantic.test')

    expect(await screen.findByText('auth:login.invalidCredentials')).toBeInTheDocument()
    expect(screen.queryByText(/nadie@atlantic.test/)).not.toBeInTheDocument()
  })
})

describe('LoginPage — contraseña temporal vencida (H2)', () => {
  it('un 401 password_reset_expired muestra el mensaje propio con el enlace a "Olvidé mi contraseña", no el texto del backend', async () => {
    mockedApi.login.mockRejectedValue({ response: { status: 401, data: { code: 'password_reset_expired', message: 'TEXTO-DEL-BACKEND' } } })
    renderLogin()
    await submitLogin()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('auth:errors.passwordResetExpired')
    expect(screen.queryByText('TEXTO-DEL-BACKEND')).not.toBeInTheDocument()
    const link = screen.getAllByText('auth:login.forgotPassword').find(el => el.closest('[role="alert"]'))!
    expect(link.closest('a')).toHaveAttribute('href', '/forgot-password')
    // Sin bloqueo: la persona puede volver a intentarlo o ir al enlace.
    expect(submitBtn()).toBeEnabled()
  })

  it('el enlace lleva a la pantalla de "Olvidé mi contraseña"', async () => {
    mockedApi.login.mockRejectedValue({ response: { status: 401, data: { code: 'password_reset_expired' } } })
    renderLogin()
    await submitLogin()
    const alert = await screen.findByRole('alert')

    fireEvent.click(alert.querySelector('a')!)

    expect(await screen.findByText('pantalla-olvide')).toBeInTheDocument()
  })

  it('si el interceptor cerró una sesión viva por vencimiento (flag del store), el aviso aparece al abrir el login', () => {
    useAuthStore.setState({ passwordResetExpired: true })
    renderLogin()
    expect(screen.getByRole('alert')).toHaveTextContent('auth:errors.passwordResetExpired')
  })

  it('al enviar de nuevo el aviso del store se limpia', async () => {
    useAuthStore.setState({ passwordResetExpired: true })
    mockedApi.login.mockRejectedValue({ response: { status: 401, data: { message: 'Credenciales inválidas' } } })
    renderLogin()

    await submitLogin()

    expect(await screen.findByText('Credenciales inválidas')).toBeInTheDocument()
    expect(useAuthStore.getState().passwordResetExpired).toBe(false)
    expect(screen.queryByText('auth:errors.passwordResetExpired')).not.toBeInTheDocument()
  })
})

describe('LoginPage — límite de intentos (H4)', () => {
  it('un 429 muestra la espera legible a partir de retry_after y deshabilita el envío', async () => {
    mockedApi.login.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', message: 'x', retry_after: 120 } } })
    renderLogin()
    await submitLogin()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('auth:errors.tooManyAttempts')
    expect(alert).toHaveTextContent('auth:errors.wait.minutes')
    expect(alert.textContent).toContain('\\"count\\":2')
    expect(submitBtn()).toBeDisabled()
  })

  it('durante la espera no se llama otra vez al backend aunque se fuerce el envío', async () => {
    mockedApi.login.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 60 } } })
    renderLogin()
    await submitLogin()
    await screen.findByRole('alert')
    expect(mockedApi.login).toHaveBeenCalledTimes(1)

    fireEvent.submit(submitBtn().closest('form')!)
    fireEvent.click(submitBtn())

    await new Promise(r => setTimeout(r, 50))
    expect(mockedApi.login).toHaveBeenCalledTimes(1)
  })

  it('un 429 sin retry_after asume un minuto', async () => {
    mockedApi.login.mockRejectedValue({ response: { status: 429, data: {} } })
    renderLogin()
    await submitLogin()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('auth:errors.wait.minutes')
    expect(alert.textContent).toContain('\\"count\\":1')
  })

  it('la cuenta atrás termina y el botón vuelve a habilitarse', async () => {
    mockedApi.login.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 1 } } })
    renderLogin()
    await submitLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent('auth:errors.wait.seconds')
    expect(submitBtn()).toBeDisabled()

    await waitFor(() => expect(submitBtn()).toBeEnabled(), { timeout: 3500 })
    expect(screen.queryByText(/auth:errors.tooManyAttempts/)).not.toBeInTheDocument()
  })

  it('el mensaje de espera no menciona el correo ni dice si existe (mismo texto exista o no la cuenta)', async () => {
    mockedApi.login.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 90 } } })
    renderLogin()
    await submitLogin('inexistente@atlantic.test')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toContain('inexistente@atlantic.test')
    expect(alert.textContent).not.toMatch(/no existe|exist/i)
  })
})

describe('LoginPage — MFA (H4)', () => {
  async function toMfaStep() {
    mockedApi.login.mockResolvedValue({ requires_mfa: true, mfa_challenge_id: 'ch-1' } as never)
    renderLogin()
    await submitLogin()
    return screen.findByPlaceholderText('auth:mfa.codePlaceholder')
  }
  const verifyBtn = () => screen.getByText('auth:mfa.submit').closest('button') as HTMLButtonElement
  const resendBtn = () => screen.getByText('auth:mfa.resend').closest('button') as HTMLButtonElement

  it('un 429 al verificar el código muestra la espera y bloquea el envío del código', async () => {
    const code = await toMfaStep()
    mockedApi.mfaVerify.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 300 } } })
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(verifyBtn())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('auth:errors.tooManyAttempts')
    expect(alert.textContent).toContain('\\"count\\":5')
    expect(verifyBtn()).toBeDisabled()
    // un código incorrecto normal NO bloquea
  })

  it('un 429 sin code (solo status + retry_after) al verificar también arranca la cuenta atrás', async () => {
    const code = await toMfaStep()
    mockedApi.mfaVerify.mockRejectedValue({ response: { status: 429, data: { message: 'x', retry_after: 30 } } })
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(verifyBtn())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('auth:errors.tooManyAttempts')
    expect(alert.textContent).toContain('\\"count\\":30')
    expect(verifyBtn()).toBeDisabled()
  })

  it('un código incorrecto normal muestra su error y no bloquea', async () => {
    const code = await toMfaStep()
    mockedApi.mfaVerify.mockRejectedValue({ response: { status: 422, data: { message: 'Código incorrecto o expirado' } } })
    fireEvent.change(code, { target: { value: '000000' } })
    fireEvent.click(verifyBtn())

    expect(await screen.findByText('Código incorrecto o expirado')).toBeInTheDocument()
    expect(verifyBtn()).toBeEnabled()
  })

  it('un 429 al reenviar el código bloquea el botón de reenviar y avisa la espera', async () => {
    await toMfaStep()
    mockedApi.mfaResend.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 180 } } })

    fireEvent.click(resendBtn())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('auth:errors.tooManyAttempts')
    expect(alert.textContent).toContain('\\"count\\":3')
    expect(resendBtn()).toBeDisabled()
    expect(mockedApi.mfaResend).toHaveBeenCalledTimes(1)
    fireEvent.click(resendBtn())
    expect(mockedApi.mfaResend).toHaveBeenCalledTimes(1)
  })

  it('el reenvío normal sigue funcionando y un error no-429 se ignora como antes', async () => {
    await toMfaStep()
    mockedApi.mfaResend.mockResolvedValueOnce({ mfa_challenge_id: 'ch-2' })
    fireEvent.click(resendBtn())
    expect(await screen.findByText('auth:mfa.resendSuccess')).toBeInTheDocument()

    mockedApi.mfaResend.mockRejectedValueOnce({ response: { status: 500 } })
    fireEvent.click(resendBtn())
    await waitFor(() => expect(mockedApi.mfaResend).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/auth:errors.tooManyAttempts/)).not.toBeInTheDocument()
    expect(resendBtn()).toBeEnabled()
  })

  it('"Volver al inicio de sesión" cancela las esperas del paso MFA', async () => {
    const code = await toMfaStep()
    mockedApi.mfaVerify.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 300 } } })
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(verifyBtn())
    await screen.findByRole('alert')

    fireEvent.click(screen.getByText('auth:mfa.backToLogin'))

    expect(screen.queryByText(/auth:errors.tooManyAttempts/)).not.toBeInTheDocument()
    expect(submitBtn()).toBeEnabled()
  })
})

describe('LoginPage — aviso tras cambiar la contraseña (SCRUM-1033)', () => {
  it('con el flag passwordChanged del router muestra el aviso de que se cerraron las sesiones', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { passwordChanged: true } }]}>
        <Routes><Route path="/login" element={<LoginPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('auth:changePassword.reloginNotice')).toBeInTheDocument()
  })

  it('sin el flag no muestra el aviso', () => {
    renderLogin()

    expect(screen.queryByText('auth:changePassword.reloginNotice')).not.toBeInTheDocument()
  })
})

// SCRUM-1159 — el enlace de un correo/notificación a una ruta protegida pasa por /login y debe volver ahí tras entrar.
describe('LoginPage — vuelve a la ruta que se pidió sin sesión (SCRUM-1159)', () => {
  const Probe = () => { const l = useLocation(); return <span data-testid="destino">{l.pathname}{l.search}</span> }
  const loginOk = () => mockedApi.login.mockResolvedValue({
    user: { id: 1, first_name: 'A', last_name: 'B', email: 'a@b.c', role: 'lider_compras', permissions: [], modules: {} },
    accessToken: 'a', tokenType: 'Bearer', expiresIn: 1, refreshToken: 'r',
  } as unknown as Awaited<ReturnType<typeof authApi.login>>)

  function renderConDestino(from?: unknown) {
    return render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: from === undefined ? undefined : { from } }]}>
        <Routes>
          {/* Igual que App.tsx: el login vive dentro de GuestOnly, que redirige en cuanto el store tiene usuario (ahí se perdía el destino). */}
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('tras iniciar sesión navega a la ruta interna guardada, con su query', async () => {
    loginOk()
    renderConDestino('/bodega/pedidos/status?search=PED-2026-0009')
    await submitLogin()
    await waitFor(() => expect(screen.getByTestId('destino')).toHaveTextContent('/bodega/pedidos/status?search=PED-2026-0009'))
  })

  it('si el destino lo pidió OTRA persona (fromUserId distinto) no lo hereda y va a su inicio (Pre-QA N-1)', async () => {
    loginOk()   // entra el usuario id 1
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/bodega/pedidos/status?search=PED-2026-0009', fromUserId: 99 } }]}>
        <Routes>
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )
    await submitLogin()
    const destino = await screen.findByTestId('destino')
    expect(destino.textContent).not.toContain('status')
    expect(destino.textContent).not.toContain('PED-2026')
  })

  it('si el destino lo pidió la MISMA persona lo usa', async () => {
    loginOk()   // entra el usuario id 1
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/bodega/pedidos/status?search=PED-2026-0009', fromUserId: 1 } }]}>
        <Routes>
          <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )
    await submitLogin()
    await waitFor(() => expect(screen.getByTestId('destino')).toHaveTextContent('/bodega/pedidos/status?search=PED-2026-0009'))
  })

  it.each([['https://evil.example/x'], ['//evil.example/x'], ['javascript:alert(1)'], ['/login']])('ignora un destino no seguro (%s) y va al inicio del usuario', async (from) => {
    loginOk()
    renderConDestino(from)
    await submitLogin()
    const destino = await screen.findByTestId('destino')
    expect(destino.textContent).not.toContain('evil.example')
    expect(destino.textContent).not.toContain('javascript')
    expect(destino.textContent).not.toBe('/login')
  })

  it('sin destino guardado va al inicio del usuario, como siempre', async () => {
    loginOk()
    renderConDestino()
    await submitLogin()
    const destino = await screen.findByTestId('destino')
    expect(destino.textContent).toMatch(/^\//)
    expect(destino.textContent).not.toContain('status')
  })
})
