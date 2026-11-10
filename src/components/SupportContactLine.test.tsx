import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import SupportContactLine from './SupportContactLine'
import { authApi } from '@/api/authApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${o.contact}` : k), i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/authApi', () => ({ authApi: { getSupportContact: vi.fn() } }))

const api = vi.mocked(authApi, true)

beforeEach(() => { vi.clearAllMocks() })

describe('SupportContactLine', () => {
  it('muestra el contacto configurado', async () => {
    api.getSupportContact.mockResolvedValue({ data: { support_contact: 'soporte@example.com' } })
    render(<SupportContactLine />)
    expect(await screen.findByTestId('support-contact')).toHaveTextContent('soporte@example.com')
  })

  it('sin contacto configurado no pinta nada', async () => {
    api.getSupportContact.mockResolvedValue({ data: { support_contact: '' } })
    render(<SupportContactLine />)
    await waitFor(() => expect(api.getSupportContact).toHaveBeenCalled())
    expect(screen.queryByTestId('support-contact')).toBeNull()
  })

  it('si la consulta falla no rompe la pantalla', async () => {
    api.getSupportContact.mockRejectedValue(new Error('red'))
    render(<SupportContactLine />)
    await waitFor(() => expect(api.getSupportContact).toHaveBeenCalled())
    expect(screen.queryByTestId('support-contact')).toBeNull()
  })
})
