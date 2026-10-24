import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ChangePasswordModal from './ChangePasswordModal'
import { authApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'

// SCRUM-1033: el backend invalida todos los access tokens previos y revoca los refresh tokens al cambiar la
// contraseña, así que la sesión actual deja de valer: el modal la cierra y lleva al login con aviso.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/authApi', () => ({ authApi: { changePassword: vi.fn() } }))

const mockedApi = vi.mocked(authApi, true)

function renderModal() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<ChangePasswordModal onClose={() => {}} />} />
        <Route path="/login" element={<div>pantalla-login</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function fillAndSubmit() {
  const inputs = document.querySelectorAll('input[type="password"]')
  fireEvent.change(inputs[0], { target: { value: 'Password123!' } })
  fireEvent.change(inputs[1], { target: { value: 'NuevaClave2026' } })
  fireEvent.change(inputs[2], { target: { value: 'NuevaClave2026' } })
  fireEvent.submit(document.querySelector('form')!)
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ accessToken: 'at', refreshToken: 'rt' })
})

describe('ChangePasswordModal', () => {
  it('tras un cambio correcto cierra la sesión y navega al login', async () => {
    mockedApi.changePassword.mockResolvedValue({} as never)
    renderModal()
    fillAndSubmit()

    expect(await screen.findByText('pantalla-login')).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
  })

  it('si el cambio falla no cierra la sesión', async () => {
    mockedApi.changePassword.mockRejectedValue({ response: { status: 422 } })
    renderModal()
    fillAndSubmit()

    await waitFor(() => expect(mockedApi.changePassword).toHaveBeenCalled())
    expect(screen.queryByText('pantalla-login')).not.toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBe('at')
  })
})
