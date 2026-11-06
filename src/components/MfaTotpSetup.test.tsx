import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MfaTotpSetup } from './MfaTotpSetup'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mfaProof = vi.fn()
const mfaTotpSetup = vi.fn()
const mfaTotpConfirm = vi.fn()
vi.mock('@/api/authApi', () => ({
  authApi: {
    mfaProof: (...a: unknown[]) => mfaProof(...a),
    mfaTotpSetup: (...a: unknown[]) => mfaTotpSetup(...a),
    mfaTotpConfirm: (...a: unknown[]) => mfaTotpConfirm(...a),
  },
}))

const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD']

function setup(emailActive: boolean) {
  const onActivated = vi.fn()
  const onCancel = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MfaTotpSetup emailActive={emailActive} onActivated={onActivated} onCancel={onCancel} />
    </QueryClientProvider>,
  )
  return { onActivated, onCancel }
}

describe('MfaTotpSetup (Fase 27c)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sin MFA previo: clave → QR y secreto → código → respaldos, y solo al guardarlos avisa que terminó', async () => {
    mfaTotpSetup.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: 'otpauth://totp/x', qr: 'data:image/png;base64,AAA' })
    mfaTotpConfirm.mockResolvedValue({ mfa_enabled: true, mfa_method: 'totp', backup_codes: CODES })
    const { onActivated } = setup(false)

    fireEvent.change(screen.getByPlaceholderText('auth:labels.password'), { target: { value: 'Clave123!' } })
    fireEvent.click(screen.getByText('auth:mfa.totpStart'))
    await waitFor(() => expect(mfaTotpSetup).toHaveBeenCalledWith({ password: 'Clave123!' }))
    expect(mfaProof).not.toHaveBeenCalled()

    expect((await screen.findByTestId('mfa-totp-secret')).textContent).toBe('JBSWY3DPEHPK3PXP')
    expect(screen.getByAltText('auth:mfa.totpQrAlt').getAttribute('src')).toBe('data:image/png;base64,AAA')

    fireEvent.change(screen.getByPlaceholderText('auth:mfa.codePlaceholder'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('auth:mfa.totpConfirm'))
    await waitFor(() => expect(mfaTotpConfirm).toHaveBeenCalledWith('123456'))

    expect(await screen.findByText('AAAAA-BBBBB')).toBeTruthy()
    const done = screen.getByText('auth:mfa.backupDone') as HTMLButtonElement
    expect(done.disabled).toBe(true)
    expect(onActivated).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(done)
    expect(onActivated).toHaveBeenCalledTimes(1)
  })

  it('con el correo activo pide primero el código del correo y lo envía junto con el reto', async () => {
    mfaProof.mockResolvedValue({ method: 'email', mfa_challenge_id: 'reto-9' })
    mfaTotpSetup.mockResolvedValue({ secret: 'S', otpauth_uri: 'otpauth://totp/x', qr: null })
    setup(true)

    fireEvent.change(screen.getByPlaceholderText('auth:labels.password'), { target: { value: 'Clave123!' } })
    fireEvent.click(screen.getByText('auth:mfa.totpStart'))
    await waitFor(() => expect(mfaProof).toHaveBeenCalledWith('Clave123!'))
    expect(mfaTotpSetup).not.toHaveBeenCalled()

    expect(await screen.findByText('auth:mfa.totpProofHint')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('auth:mfa.codePlaceholder'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('auth:mfa.totpStart'))
    await waitFor(() => expect(mfaTotpSetup).toHaveBeenCalledWith({ password: 'Clave123!', mfa_challenge_id: 'reto-9', code: '654321' }))
    expect(await screen.findByTestId('mfa-totp-secret')).toBeTruthy()
    // Sin QR del servidor queda el secreto para teclearlo a mano.
    expect(screen.queryByAltText('auth:mfa.totpQrAlt')).toBeNull()
  })

  it('un código malo no activa nada y muestra el aviso', async () => {
    mfaTotpSetup.mockResolvedValue({ secret: 'S', otpauth_uri: 'otpauth://totp/x', qr: null })
    mfaTotpConfirm.mockRejectedValue({ response: { status: 422 } })
    setup(false)

    fireEvent.change(screen.getByPlaceholderText('auth:labels.password'), { target: { value: 'Clave123!' } })
    fireEvent.click(screen.getByText('auth:mfa.totpStart'))
    await screen.findByTestId('mfa-totp-secret')
    fireEvent.change(screen.getByPlaceholderText('auth:mfa.codePlaceholder'), { target: { value: '000000' } })
    fireEvent.click(screen.getByText('auth:mfa.totpConfirm'))

    expect(await screen.findByText('auth:mfa.totpInvalid')).toBeTruthy()
    expect(screen.queryByTestId('mfa-backup-codes')).toBeNull()
  })
})
