import { render, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import ResetPasswordPage from './ResetPasswordPage'
import { authApi } from '@/api/authApi'

// SCRUM-1178 — el token del enlace viaja en el fragmento (#token=…) para no quedar en el access.log de nginx;
// los correos anteriores (?token=…) siguen funcionando.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/authApi', () => ({ authApi: { resetPassword: vi.fn() } }))

const mockedApi = vi.mocked(authApi, true)

function renderAt(url: string) {
  window.history.replaceState(null, '', url)
  return render(<MemoryRouter initialEntries={[url]}><ResetPasswordPage /></MemoryRouter>)
}

async function submit() {
  const inputs = document.querySelectorAll('input[type="password"]')
  fireEvent.change(inputs[0], { target: { value: 'NuevaClave99x' } })
  fireEvent.change(inputs[1], { target: { value: 'NuevaClave99x' } })
  fireEvent.click(document.querySelector('form button[type="submit"]')!)
}

beforeEach(() => { vi.clearAllMocks(); mockedApi.resetPassword.mockResolvedValue({ message: 'ok' }) })

describe('ResetPasswordPage — token del enlace', () => {
  it('lee el token del fragmento y lo quita de la barra de direcciones', async () => {
    renderAt('/reset-password#token=abc123')
    await submit()
    await waitFor(() => expect(mockedApi.resetPassword).toHaveBeenCalledWith('abc123', 'NuevaClave99x', 'NuevaClave99x'))
    expect(window.location.hash).toBe('')
  })

  it('un enlace antiguo con ?token= sigue funcionando', async () => {
    renderAt('/reset-password?token=viejo456')
    await submit()
    await waitFor(() => expect(mockedApi.resetPassword).toHaveBeenCalledWith('viejo456', 'NuevaClave99x', 'NuevaClave99x'))
  })
})
