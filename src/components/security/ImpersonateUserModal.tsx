import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useStartImpersonation } from '@/hooks/useImpersonation'
import { useAuthStore } from '@/store/authStore'
import type { UserListItem } from '@/api/usersApi'
import { parseAuthError } from '@/lib/authErrors'
import { parseApiValidationError } from '@/lib/apiValidationError'
import { getHomeRoute } from '@/lib/homeRoute'
import { describeWait } from '@/hooks/useRetryCountdown'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

interface Props {
  user:    UserListItem
  onClose: () => void
}

/**
 * SCRUM-1158 — inicia «Ver como usuario». Pide un motivo (obligatorio, el largo mínimo lo valida el backend porque es un ajuste
 * paramétrico: la UI no lo conoce) y la contraseña del propio superadmin. La contraseña vive solo en el estado del componente: se
 * limpia en cada respuesta y al cerrar. Al éxito entra a la sesión observada y navega al inicio de esa persona.
 */
export default function ImpersonateUserModal({ user, onClose }: Props) {
  const { t }    = useTranslation(['common', 'security', 'auth'])
  const navigate = useNavigate()
  const start    = useStartImpersonation()

  const [reason, setReason]           = useState('')
  const [password, setPassword]       = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const reasonRef   = useRef<HTMLTextAreaElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const name = `${user.first_name} ${user.last_name}`.trim()

  const canConfirm = !start.isPending && reason.trim() !== '' && password !== ''

  useEffect(() => { reasonRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !start.isPending) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, start.isPending])

  const waitText = (seconds: number) => {
    const { unit, count } = describeWait(seconds)
    return t(`auth:errors.wait.${unit}`, { count })
  }

  const handleConfirm = () => {
    if (!canConfirm) return
    setError(null); setReasonError(null); setPasswordError(null)
    start.mutate({ userId: user.id, reason: reason.trim(), operatorPassword: password }, {
      onSuccess: result => {
        setPassword('')
        // Sin el bloque `impersonation` no habría banner: se entraría a otra cuenta sin ninguna señal. No se entra.
        if (!result.user.impersonation || !useAuthStore.getState().startImpersonation(result.user, result.accessToken)) {
          setError(t('security:impersonate.errors.generic'))
          return
        }
        onClose()
        navigate(getHomeRoute(result.user), { replace: true })
      },
      onError: (err: unknown) => {
        const parsed = parseAuthError(err)
        // La contraseña nunca se conserva tras una respuesta: si hay que reintentar, se vuelve a escribir.
        setPassword('')
        if (parsed.status === 422 && (parsed.rawCode === 'operator_reauth_failed' || parsed.rawCode === 'operator_password_required')) {
          setPasswordError(parsed.rawCode === 'operator_reauth_failed'
            ? t('security:impersonate.errors.reauthFailed')
            : t('security:impersonate.errors.passwordRequired'))
          passwordRef.current?.focus()
        } else if (parsed.status === 422) {
          const validation = parseApiValidationError(err)
          const reasonMsg  = validation?.fields.reason?.[0]
          if (reasonMsg) { setReasonError(reasonMsg); reasonRef.current?.focus() }
          else setError(validation?.message ?? parsed.message ?? t('security:impersonate.errors.invalid'))
        } else if (parsed.status === 429) {
          setError(parsed.retryAfter !== undefined
            ? t('security:impersonate.errors.throttledWait', { time: waitText(parsed.retryAfter) })
            : t('security:impersonate.errors.throttled'))
        } else if (parsed.status === 403) {
          setError(t('security:impersonate.errors.forbidden'))
        } else if (parsed.status === 404) {
          setError(t('security:impersonate.errors.notFound'))
        } else {
          setError(t('security:impersonate.errors.generic'))
        }
      },
    })
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[1000] flex items-center justify-center p-4">
      <Card variant="modal" className="w-full max-w-md p-0">
        <div role="dialog" aria-modal="true" aria-labelledby="impersonate-title">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 id="impersonate-title" className="font-bold text-slate-800 text-base">
              {t('security:impersonate.title', { name })}
            </h2>
            <Button type="button" variant="icon" onClick={onClose} disabled={start.isPending} aria-label={t('common:actions.close')}>
              <IcoClose size={16} />
            </Button>
          </div>

          <div className="px-6 py-5 space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {t('security:impersonate.message', { name, email: user.email })}
            </p>
            <div role="note" className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
              {t('security:impersonate.readOnlyNote')}
            </div>

            <div>
              <label htmlFor="impersonate-reason" className="block text-xs font-semibold text-slate-600 mb-1">
                {t('security:impersonate.reasonLabel')}
              </label>
              <textarea
                id="impersonate-reason"
                ref={reasonRef}
                rows={3}
                value={reason}
                disabled={start.isPending}
                aria-invalid={reasonError ? true : undefined}
                aria-describedby="impersonate-reason-help"
                onChange={e => { setReason(e.target.value); if (reasonError) setReasonError(null) }}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${reasonError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`}
              />
              <p id="impersonate-reason-help" className="mt-1 text-[11px] text-slate-500">{t('security:impersonate.reasonHelp')}</p>
              {reasonError && <p role="alert" className="mt-1 text-xs text-red-600">{reasonError}</p>}
            </div>

            <div>
              <label htmlFor="impersonate-password" className="block text-xs font-semibold text-slate-600 mb-1">
                {t('security:impersonate.passwordLabel')}
              </label>
              <input
                id="impersonate-password"
                ref={passwordRef}
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={start.isPending}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby="impersonate-password-help"
                onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${passwordError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`}
              />
              <p id="impersonate-password-help" className="mt-1 text-[11px] text-slate-500">{t('security:impersonate.passwordHelp')}</p>
              {passwordError && <p role="alert" className="mt-1 text-xs text-red-600">{passwordError}</p>}
            </div>

            {error && (
              <div role="alert" className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={start.isPending}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="button" variant="primary" loading={start.isPending} disabled={!canConfirm} onClick={handleConfirm}>
              {t('security:impersonate.confirm')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
