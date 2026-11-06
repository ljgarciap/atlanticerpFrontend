import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi, type MfaTotpSetupResponse } from '@/api/authApi'
import { Button } from '@/components/ui/Button'
import { MfaBackupCodes } from '@/components/MfaBackupCodes'

type Step = 'password' | 'proof' | 'scan' | 'backup'

const inputCls = 'flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-700'

/**
 * Fase 27c — alta de la aplicación autenticadora: clave → (con el correo ya activo, el código que llega al correo) →
 * QR y primer código → los 10 códigos de respaldo. Nada queda activo hasta confirmar con un código válido de la aplicación.
 */
export function MfaTotpSetup({ emailActive, onActivated, onCancel }: { emailActive: boolean; onActivated: () => void; onCancel: () => void }) {
  const { t } = useTranslation(['auth', 'common'])
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [emailCode, setEmailCode] = useState('')
  const [setup, setSetup] = useState<MfaTotpSetupResponse | null>(null)
  const [code, setCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [error, setError] = useState('')

  const serverMessage = (err: unknown, fallback: string) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback

  const start = useMutation({
    mutationFn: async () => {
      if (emailActive && challengeId === null) {
        // Con el correo activo, cambiar de método exige probar el método vigente: se envía el código y se pide en el paso siguiente.
        const proof = await authApi.mfaProof(password)
        return { proof: proof.mfa_challenge_id ?? null, setup: null }
      }
      const res = await authApi.mfaTotpSetup({
        password,
        ...(challengeId ? { mfa_challenge_id: challengeId, code: emailCode } : {}),
      })
      return { proof: null, setup: res }
    },
    onSuccess: (r) => {
      setError('')
      if (r.setup) { setSetup(r.setup); setStep('scan') }
      else { setChallengeId(r.proof); setStep('proof') }
    },
    onError: (err: unknown) => setError(serverMessage(err, t('auth:changePassword.wrongCurrent'))),
  })

  const confirm = useMutation({
    mutationFn: () => authApi.mfaTotpConfirm(code),
    onSuccess: (r) => { setBackupCodes(r.backup_codes); setPassword(''); setStep('backup'); setError('') },
    onError: () => setError(t('auth:mfa.totpInvalid')),
  })

  return (
    <div className="space-y-3" data-testid="mfa-totp-setup">
      {step === 'password' && (
        <>
          <p className="text-xs text-slate-500">{t('auth:mfa.totpIntro')}</p>
          <p className="text-xs text-slate-500">{t('auth:mfa.totpPasswordHint')}</p>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder={t('auth:labels.password')}
              className={inputCls}
            />
            <Button type="button" disabled={!password || start.isPending} loading={start.isPending} onClick={() => start.mutate()} className="!px-4 !py-2 !text-xs">
              {t('auth:mfa.totpStart')}
            </Button>
          </div>
        </>
      )}

      {step === 'proof' && (
        <>
          <p className="text-xs text-slate-500">{t('auth:mfa.totpProofHint')}</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={emailCode}
              onChange={e => { setEmailCode(e.target.value.replace(/\D/g, '')); setError('') }}
              placeholder={t('auth:mfa.codePlaceholder')}
              className={`${inputCls} text-center tracking-[0.3em] font-mono`}
            />
            <Button type="button" disabled={emailCode.length !== 6 || start.isPending} loading={start.isPending} onClick={() => start.mutate()} className="!px-4 !py-2 !text-xs">
              {t('auth:mfa.totpStart')}
            </Button>
          </div>
        </>
      )}

      {step === 'scan' && setup && (
        <>
          <p className="text-xs text-slate-500">{t('auth:mfa.totpScan')}</p>
          {setup.qr && <img src={setup.qr} alt={t('auth:mfa.totpQrAlt')} width={176} height={176} className="rounded-lg border border-slate-200 bg-white p-1" />}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{t('auth:mfa.totpSecretLabel')}</p>
            <code className="block break-all text-sm font-mono text-slate-700 dark:text-slate-200 select-all" data-testid="mfa-totp-secret">{setup.secret}</code>
          </div>
          <p className="text-xs text-slate-500">{t('auth:mfa.totpEnterCode')}</p>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
              placeholder={t('auth:mfa.codePlaceholder')}
              className={`${inputCls} text-center tracking-[0.3em] font-mono`}
            />
            <Button type="button" disabled={code.length !== 6 || confirm.isPending} loading={confirm.isPending} onClick={() => confirm.mutate()} className="!px-4 !py-2 !text-xs">
              {t('auth:mfa.totpConfirm')}
            </Button>
          </div>
        </>
      )}

      {step === 'backup' && <MfaBackupCodes codes={backupCodes} onDone={onActivated} />}

      {step !== 'backup' && (
        <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">
          {t('common:actions.cancel')}
        </button>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
