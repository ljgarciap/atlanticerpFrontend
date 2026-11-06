import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MfaBackupRegenerate } from './MfaBackupRegenerate'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const regenerate = vi.fn()
vi.mock('@/api/authApi', () => ({
  authApi: { mfaRegenerateBackupCodes: (...a: unknown[]) => regenerate(...a) },
}))

describe('MfaBackupRegenerate (Fase 27c)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('pide clave y código, muestra los códigos nuevos y avisa del cambio', async () => {
    regenerate.mockResolvedValue({ backup_codes: ['NNNNN-MMMMM'] })
    const onChanged = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <MfaBackupRegenerate onChanged={onChanged} />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByText('auth:mfa.backupRegenerate'))
    expect(regenerate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByPlaceholderText('auth:labels.password'), { target: { value: 'Clave123!' } })
    fireEvent.change(screen.getByPlaceholderText('auth:mfa.codeOrBackupPlaceholder'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('auth:mfa.backupRegenerateSubmit'))

    await waitFor(() => expect(regenerate).toHaveBeenCalledWith('Clave123!', '123456'))
    expect(await screen.findByText('NNNNN-MMMMM')).toBeTruthy()
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('con un código malo muestra el error y no enseña códigos', async () => {
    regenerate.mockRejectedValue({ response: { data: { message: 'Código incorrecto.' } } })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <MfaBackupRegenerate onChanged={vi.fn()} />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByText('auth:mfa.backupRegenerate'))
    fireEvent.change(screen.getByPlaceholderText('auth:labels.password'), { target: { value: 'Clave123!' } })
    fireEvent.change(screen.getByPlaceholderText('auth:mfa.codeOrBackupPlaceholder'), { target: { value: '000000' } })
    fireEvent.click(screen.getByText('auth:mfa.backupRegenerateSubmit'))

    expect(await screen.findByText('Código incorrecto.')).toBeTruthy()
    expect(screen.queryByTestId('mfa-backup-codes')).toBeNull()
  })
})
