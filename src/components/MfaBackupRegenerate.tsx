import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/authApi'
import { Button } from '@/components/ui/Button'
import { MfaBackupCodes } from '@/components/MfaBackupCodes'

const inputCls = 'text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-700'

/** Fase 27c — códigos de respaldo nuevos (los anteriores dejan de servir): clave y código de la aplicación (o un respaldo). */
export function MfaBackupRegenerate({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation(['auth', 'common'])
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState('')

  const reset = () => { setOpen(false); setPassword(''); setCode(''); setCodes(null); setError('') }

  const regenerate = useMutation({
    mutationFn: () => authApi.mfaRegenerateBackupCodes(password, code),
    onSuccess: (r) => { setCodes(r.backup_codes); setPassword(''); setCode(''); setError(''); onChanged() },
    onError: (err: unknown) => setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? t('auth:mfa.invalidCode')),
  })

  if (codes) return <MfaBackupCodes codes={codes} onDone={reset} />

  if (!open) {
    return (
      <Button type="button" variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={() => setOpen(true)}>
        {t('auth:mfa.backupRegenerate')}
      </Button>
    )
  }

  return (
    <div className="space-y-2" data-testid="mfa-backup-regenerate">
      <p className="text-xs text-slate-500">{t('auth:mfa.backupRegenerateHint')}</p>
      <div className="flex flex-wrap gap-2">
        <input type="password" autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setError('') }} placeholder={t('auth:labels.password')} className={`${inputCls} flex-1 min-w-[10rem]`} />
        <input type="text" maxLength={11} value={code} onChange={e => { setCode(e.target.value); setError('') }} placeholder={t('auth:mfa.codeOrBackupPlaceholder')} className={`${inputCls} w-44 text-center font-mono`} />
        <Button type="button" disabled={!password || code.trim().length < 6 || regenerate.isPending} loading={regenerate.isPending} onClick={() => regenerate.mutate()} className="!px-4 !py-2 !text-xs">
          {t('auth:mfa.backupRegenerateSubmit')}
        </Button>
      </div>
      <button type="button" onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">{t('common:actions.cancel')}</button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
