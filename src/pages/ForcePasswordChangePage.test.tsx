import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ForcePasswordChangePage from './ForcePasswordChangePage'
import { authApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: () => Promise.resolve(), language: 'es' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/api/authApi', () => ({
  authApi: { changePassword: vi.fn(), login: vi.fn(), logout: vi.fn() },
}))

vi.mock('@/lib/homeRoute', () => ({ getHomeRoute: () => '/home' }))
vi.mock('@/components/LanguageSelector', () => ({ default: () => <div /> }))
vi.mock('@/components/AppLogo', () => ({ default: () => <div /> }))

const mockedApi = vi.mocked(authApi, true)

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 7, first_name: 'Ana', last_name: 'Pérez', email: 'ana@atlantic.test', role: 'designer',
    permissions: [], must_change_password: true, ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/anywhere']}>
      <Routes>
        <Route path="/anywhere" element={<ForcePasswordChangePage />} />
        <Route path="/home" element={<div>inicio</div>} />
        <Route path="/login" element={<div>login</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function fill(current: string, next: string, confirm = next) {
  fireEvent.change(document.getElementById('fpc-current')!, { target: { value: current } })
  fireEvent.change(document.getElementById('fpc-new')!, { target: { value: next } })
  fireEvent.change(document.getElementById('fpc-confirm')!, { target: { value: confirm } })
  fireEvent.click(screen.getByText('auth:forceChange.submit'))
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: makeUser(), accessToken: 'at-old', refreshToken: 'rt-old' })
})

describe('ForcePasswordChangePage', () => {
  it('muestra el aviso y no ofrece navegación de la app', () => {
    renderPage()
    expect(screen.getByText('auth:forceChange.title')).toBeInTheDocument()
    expect(screen.getByText('auth:forceChange.subtitle')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('valida campos vacíos sin llamar al backend', async () => {
    renderPage()
    fireEvent.click(screen.getByText('auth:forceChange.submit'))
    expect(await screen.findByText('auth:validation.passwordRequired')).toBeInTheDocument()
    expect(mockedApi.changePassword).not.toHaveBeenCalled()
  })

  it('rechaza una contraseña débil', async () => {
    renderPage()
    fill('ana@atlantic.test', 'abc')
    expect((await screen.findAllByText('auth:changePassword.weakPassword')).length).toBeGreaterThan(0)
    expect(mockedApi.changePassword).not.toHaveBeenCalled()
  })

  it('rechaza una confirmación que no coincide', async () => {
    renderPage()
    fill('ana@atlantic.test', 'Nueva-clave1', 'Otra-clave1')
    expect(await screen.findByText('auth:changePassword.mismatch')).toBeInTheDocument()
    expect(mockedApi.changePassword).not.toHaveBeenCalled()
  })

  it('rechaza una contraseña nueva igual al correo (sin importar mayúsculas)', async () => {
    // Correo que sí cumple las reglas de fortaleza (mayúscula, minúscula, número): así la única
    // regla que falla es la de "no puede ser tu correo".
    useAuthStore.setState({ user: makeUser({ email: 'Ana1.Perez@Atlantic.test' }) })
    renderPage()
    fill('Temporal1', 'ana1.perez@ATLANTIC.test')
    expect(await screen.findByText('auth:forceChange.sameAsEmail')).toBeInTheDocument()
    expect(mockedApi.changePassword).not.toHaveBeenCalled()
  })

  it('rechaza una contraseña nueva igual a la actual', async () => {
    renderPage()
    fill('Misma-clave1', 'Misma-clave1')
    expect(await screen.findByText('auth:forceChange.sameAsCurrent')).toBeInTheDocument()
    expect(mockedApi.changePassword).not.toHaveBeenCalled()
  })

  it('muestra los errores 422 del backend por campo', async () => {
    mockedApi.changePassword.mockRejectedValue({
      response: { status: 422, data: { message: 'x', errors: {
        current_password: ['La contraseña actual no es correcta'],
        new_password:     ['La contraseña es demasiado común'],
      } } },
    })
    renderPage()
    fill('Temporal1', 'Nueva-clave1')

    expect(await screen.findByText('La contraseña actual no es correcta')).toBeInTheDocument()
    expect(screen.getByText('La contraseña es demasiado común')).toBeInTheDocument()
    expect(useAuthStore.getState().user?.must_change_password).toBe(true)
  })

  it('un 401 se muestra como contraseña actual incorrecta', async () => {
    mockedApi.changePassword.mockRejectedValue({ response: { status: 401 } })
    renderPage()
    fill('Temporal1', 'Nueva-clave1')
    expect(await screen.findByText('auth:changePassword.wrongCurrent')).toBeInTheDocument()
  })

  it('un 429 muestra el mensaje de demasiados intentos y no limpia el flag', async () => {
    mockedApi.changePassword.mockRejectedValue({ response: { status: 429 } })
    renderPage()
    fill('Temporal1', 'Nueva-clave1')
    expect(await screen.findByText('auth:forceChange.throttled')).toBeInTheDocument()
    expect(useAuthStore.getState().user?.must_change_password).toBe(true)
  })

  it('un error sin detalle muestra el mensaje genérico', async () => {
    mockedApi.changePassword.mockRejectedValue(new Error('network'))
    renderPage()
    fill('Temporal1', 'Nueva-clave1')
    expect(await screen.findByText('auth:forceChange.genericError')).toBeInTheDocument()
  })

  it('éxito: cambia la contraseña, vuelve a iniciar sesión con la nueva (tokens frescos), limpia el flag y va al inicio', async () => {
    mockedApi.changePassword.mockResolvedValue({} as never)
    mockedApi.login.mockResolvedValue({
      accessToken: 'at-new', refreshToken: 'rt-new', tokenType: 'Bearer', expiresIn: 1000,
      user: makeUser({ must_change_password: false }),
    })
    renderPage()
    fill('ana@atlantic.test', 'Nueva-clave1')

    expect(await screen.findByText('inicio')).toBeInTheDocument()
    expect(mockedApi.changePassword).toHaveBeenCalledWith('ana@atlantic.test', 'Nueva-clave1', 'Nueva-clave1')
    expect(mockedApi.login).toHaveBeenCalledWith('ana@atlantic.test', 'Nueva-clave1')
    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('at-new')
    expect(state.refreshToken).toBe('rt-new')
    expect(state.user?.must_change_password).toBe(false)
  })

  it('éxito pero el re-login exige MFA: limpia el flag igual, conserva la sesión actual y va al inicio', async () => {
    mockedApi.changePassword.mockResolvedValue({} as never)
    mockedApi.login.mockResolvedValue({ requires_mfa: true, mfa_challenge_id: 'c1' })
    renderPage()
    fill('ana@atlantic.test', 'Nueva-clave1')

    expect(await screen.findByText('inicio')).toBeInTheDocument()
    const state = useAuthStore.getState()
    expect(state.user?.must_change_password).toBe(false)
    expect(state.accessToken).toBe('at-old')
  })

  it('éxito pero el re-login falla por red: limpia el flag igual y va al inicio', async () => {
    mockedApi.changePassword.mockResolvedValue({} as never)
    mockedApi.login.mockRejectedValue(new Error('network'))
    renderPage()
    fill('ana@atlantic.test', 'Nueva-clave1')

    expect(await screen.findByText('inicio')).toBeInTheDocument()
    expect(useAuthStore.getState().user?.must_change_password).toBe(false)
  })

  it('éxito pero el re-login responde 401 (tokens ya revocados): limpia el flag, no cierra la sesión por su cuenta y va al inicio', async () => {
    mockedApi.changePassword.mockResolvedValue({} as never)
    mockedApi.login.mockRejectedValue({ response: { status: 401, data: { message: 'auth.failed' } } })
    renderPage()
    fill('ana@atlantic.test', 'Nueva-clave1')

    expect(await screen.findByText('inicio')).toBeInTheDocument()
    const state = useAuthStore.getState()
    expect(state.user?.must_change_password).toBe(false)
    // No hay bucle ni limpieza de sesión desde esta pantalla: si el token realmente ya no sirve, el
    // interceptor de 401 de authApi lleva a login en la siguiente petición.
    expect(state.accessToken).toBe('at-old')
    expect(mockedApi.login).toHaveBeenCalledTimes(1)
  })

  it('"Cerrar sesión" revoca el refresh token, limpia la sesión y lleva a /login', async () => {
    mockedApi.logout.mockResolvedValue(undefined as never)
    renderPage()
    fireEvent.click(screen.getByText('common:actions.logout'))

    expect(await screen.findByText('login')).toBeInTheDocument()
    expect(mockedApi.logout).toHaveBeenCalledWith('rt-old')
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('no permite doble envío mientras la petición está en curso', async () => {
    let resolve!: () => void
    mockedApi.changePassword.mockReturnValue(new Promise(r => { resolve = () => r({} as never) }) as never)
    mockedApi.login.mockRejectedValue(new Error('x'))
    renderPage()
    fill('ana@atlantic.test', 'Nueva-clave1')
    await waitFor(() => expect(mockedApi.changePassword).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('auth:forceChange.submit'))
    expect(mockedApi.changePassword).toHaveBeenCalledTimes(1)
    resolve()
    await screen.findByText('inicio')
  })
})
