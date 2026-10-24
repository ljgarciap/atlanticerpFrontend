import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ForgotPasswordPage from './ForgotPasswordPage'
import { authApi } from '@/api/authApi'

// Cierre de H4 — "olvidé mi contraseña" con límite de intentos. El resto de errores siguen mostrando éxito
// (nunca se revela si el correo existe).

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/authApi', () => ({ authApi: { forgotPassword: vi.fn() } }))

const mockedApi = vi.mocked(authApi, true)

const renderPage = () => render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>)
const submitBtn  = () => document.querySelector('form button[type="submit"]') as HTMLButtonElement

function send(email = 'ana@atlantic.test') {
  fireEvent.change(document.querySelector('input[type="email"]')!, { target: { value: email } })
  fireEvent.click(submitBtn())
}

beforeEach(() => { vi.clearAllMocks() })

describe('ForgotPasswordPage', () => {
  it('un envío correcto muestra el estado de éxito', async () => {
    mockedApi.forgotPassword.mockResolvedValue({ message: 'ok' })
    renderPage()
    send()
    expect(await screen.findByText('auth:forgotPassword.success')).toBeInTheDocument()
    expect(mockedApi.forgotPassword).toHaveBeenCalledWith('ana@atlantic.test')
  })

  it.each([404, 422, 500])('un %i también muestra éxito: nunca revela si el correo existe', async (status) => {
    mockedApi.forgotPassword.mockRejectedValue({ response: { status, data: { message: 'No existe esa cuenta' } } })
    renderPage()
    send('nadie@atlantic.test')

    expect(await screen.findByText('auth:forgotPassword.success')).toBeInTheDocument()
    expect(screen.queryByText('No existe esa cuenta')).not.toBeInTheDocument()
  })

  it('un 429 NO muestra éxito: avisa la espera, bloquea el envío y no llama otra vez al backend', async () => {
    mockedApi.forgotPassword.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 900 } } })
    renderPage()
    send()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('auth:errors.tooManyAttempts')
    expect(alert.textContent).toContain('\\"count\\":15')
    expect(screen.queryByText('auth:forgotPassword.success')).not.toBeInTheDocument()
    expect(submitBtn()).toBeDisabled()

    fireEvent.submit(submitBtn().closest('form')!)
    await new Promise(r => setTimeout(r, 50))
    expect(mockedApi.forgotPassword).toHaveBeenCalledTimes(1)
  })

  it('el mensaje de espera es el mismo exista o no el correo y no lo menciona', async () => {
    mockedApi.forgotPassword.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 60 } } })
    renderPage()
    send('secreto@atlantic.test')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toContain('secreto@atlantic.test')
  })

  it('la espera termina y el envío vuelve a habilitarse', async () => {
    mockedApi.forgotPassword.mockRejectedValue({ response: { status: 429, data: { code: 'too_many_attempts', retry_after: 1 } } })
    renderPage()
    send()
    expect(await screen.findByRole('alert')).toHaveTextContent('auth:errors.wait.seconds')

    await waitFor(() => expect(submitBtn()).toBeEnabled(), { timeout: 3500 })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
