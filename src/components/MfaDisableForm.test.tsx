import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MfaDisableForm } from './MfaDisableForm'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mfaDisable = vi.fn()
const mfaConfirmDisable = vi.fn()
vi.mock('@/api/authApi', () => ({
  authApi: {
    mfaDisable: (...a: unknown[]) => mfaDisable(...a),
    mfaConfirmDisable: (...a: unknown[]) => mfaConfirmDisable(...a),
    mfaResend: vi.fn(),
  },
}))

function setup(onDisabled = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MfaDisableForm onDisabled={onDisabled} />
    </QueryClientProvider>,
  )
  return onDisabled
}

describe('MfaDisableForm (Fase 27a)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('no desactiva con un solo clic: primero pide la clave y luego el código', async () => {
    mfaDisable.mockResolvedValue({ mfa_challenge_id: 'reto-1' })
    mfaConfirmDisable.mockResolvedValue({ mfa_enabled: false })
    const onDisabled = setup()

    fireEvent.click(screen.getByText('auth:mfa.disable'))
    expect(mfaDisable).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText('auth:labels.password'), { target: { value: 'Clave123!' } })
    fireEvent.click(screen.getByText('auth:mfa.disable'))
    await waitFor(() => expect(mfaDisable).toHaveBeenCalledWith('Clave123!'))
    expect(onDisabled).not.toHaveBeenCalled()

    fireEvent.change(await screen.findByPlaceholderText('auth:mfa.codePlaceholder'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('auth:mfa.disable'))
    await waitFor(() => expect(mfaConfirmDisable).toHaveBeenCalledWith('reto-1', '123456'))
    await waitFor(() => expect(onDisabled).toHaveBeenCalledTimes(1))
  })

  it('con la clave incorrecta muestra el error y no pasa al paso del código', async () => {
    mfaDisable.mockRejectedValue({ response: { status: 422 } })
    setup()

    fireEvent.click(screen.getByText('auth:mfa.disable'))
    fireEvent.change(screen.getByPlaceholderText('auth:labels.password'), { target: { value: 'mala' } })
    fireEvent.click(screen.getByText('auth:mfa.disable'))

    expect(await screen.findByText('auth:changePassword.wrongCurrent')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('auth:mfa.codePlaceholder')).not.toBeInTheDocument()
  })

  it('con el código incorrecto no avisa que se desactivó', async () => {
    mfaDisable.mockResolvedValue({ mfa_challenge_id: 'reto-2' })
    mfaConfirmDisable.mockRejectedValue({ response: { status: 422 } })
    const onDisabled = setup()

    fireEvent.click(screen.getByText('auth:mfa.disable'))
    fireEvent.change(screen.getByPlaceholderText('auth:labels.password'), { target: { value: 'Clave123!' } })
    fireEvent.click(screen.getByText('auth:mfa.disable'))
    fireEvent.change(await screen.findByPlaceholderText('auth:mfa.codePlaceholder'), { target: { value: '000000' } })
    fireEvent.click(screen.getByText('auth:mfa.disable'))

    expect(await screen.findByText('auth:mfa.invalidCode')).toBeInTheDocument()
    expect(onDisabled).not.toHaveBeenCalled()
  })
})
