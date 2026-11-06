import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/authApi'
import { Button } from '@/components/ui/Button'

/**
 * Desactivar el MFA propio (Fase 27a): clave vigente y después el código que llega al correo.
 * Una sesión robada ya no basta para quitar el segundo factor.
 * Fase 27c: con aplicación autenticadora no hay nada que enviar; el segundo paso pide el código de la aplicación o un respaldo.
 */
export function MfaDisableForm({ onDisabled }: { onDisabled: () => void }) {
  const { t } = useTranslation(['auth', 'common'])
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [totp, setTotp] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const reset = () => { setOpen(false); setPassword(''); setChallengeId(null); setTotp(false); setCode(''); setError('') }

  const request = useMutation({
    mutationFn: () => authApi.mfaDisable(password),
    onSuccess: (res) => {
      if (res.method === 'totp') { setTotp(true); setChallengeId(null) } else { setChallengeId(res.mfa_challenge_id ?? null) }
      setPassword(''); setError('')
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      setError(status === 422 || status === 401
        ? t('auth:changePassword.wrongCurrent')
        : (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('auth:changePassword.wrongCurrent'))
    },
  })

  const confirm = useMutation({
    mutationFn: () => authApi.mfaConfirmDisable(totp ? null : challengeId, code.trim()),
    onSuccess: () => { reset(); onDisabled() },
    onError: () => setError(t('auth:mfa.invalidCode')),
  })

  const resend = useMutation({
    mutationFn: () => authApi.mfaResend(challengeId ?? ''),
    onSuccess: (res) => { setChallengeId(res.mfa_challenge_id); setCode(''); setError('') },
  })

  if (!open) {
    return (
      <Button type="button" variant="danger-text" onClick={() => setOpen(true)}>
        {t('auth:mfa.disable')}
      </Button>
    )
  }

  const inputCls = 'flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-700'

  return (
    <div className="space-y-2" data-testid="mfa-disable-form">
      {challengeId || totp ? (
        <>
          <p className="text-xs text-slate-500">{totp ? t('auth:mfa.disableTotpHint') : t('auth:mfa.disableCodeSent')}</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode={totp ? 'text' : 'numeric'}
              maxLength={totp ? 11 : 6}
              value={code}
              onChange={e => { setCode(totp ? e.target.value : e.target.value.replace(/\D/g, '')); setError('') }}
              placeholder={totp ? t('auth:mfa.codeOrBackupPlaceholder') : t('auth:mfa.codePlaceholder')}
              className={`${inputCls} text-center tracking-[0.3em] font-mono`}
            />
            <Button
              type="button"
              variant="danger"
              disabled={(totp ? code.trim().length < 6 : code.length !== 6) || confirm.isPending}
              loading={confirm.isPending}
              onClick={() => confirm.mutate()}
              className="!px-4 !py-2 !text-xs"
            >
              {t('auth:mfa.disable')}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">
              {t('common:actions.cancel')}
            </button>
            {!totp && (
              <button type="button" disabled={resend.isPending} onClick={() => resend.mutate()} className="text-xs text-primary hover:text-primary-dark">
                {t('auth:mfa.resend')}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500">{t('auth:mfa.disablePasswordHint')}</p>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder={t('auth:labels.password')}
              className={inputCls}
            />
            <Button
              type="button"
              variant="danger"
              disabled={!password || request.isPending}
              loading={request.isPending}
              onClick={() => request.mutate()}
              className="!px-4 !py-2 !text-xs"
            >
              {t('auth:mfa.disable')}
            </Button>
          </div>
          <button type="button" onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">
            {t('common:actions.cancel')}
          </button>
        </>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
