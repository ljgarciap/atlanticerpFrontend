import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useResetUserPassword } from '@/hooks/useUsers'
import { usePasswordResetEnabled } from '@/hooks/usePasswordResetSettings'
import { useAuthStore } from '@/store/authStore'
import { isMaxPrivilegeUser, type UserListItem } from '@/api/usersApi'
import { parseAuthError } from '@/lib/authErrors'
import { describeWait } from '@/hooks/useRetryCountdown'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

interface Props {
  user:    UserListItem
  onClose: () => void
  onDone:  (user: UserListItem) => void
}

/**
 * Confirmación del reset INDIVIDUAL de contraseña (solo superadmin). La contraseña pasa a ser el
 * correo de la persona y el backend marca el cambio obligatorio al ingresar.
 *
 * Cierre de H3: si el objetivo es de máximo privilegio (rol superadmin, nivel 10 o `superadmin.all`)
 * el backend exige la contraseña actual del OPERADOR. Se pide de antemano en ese caso y, si el backend
 * la reclama igual (`operator_password_required`), se revela el campo y se reintenta sin perder el
 * contexto. La contraseña vive solo en el estado del componente: se limpia en cada respuesta y al cerrar.
 */
export default function ResetPasswordModal({ user, onClose, onDone }: Props) {
  const { t }   = useTranslation(['common', 'security', 'auth'])
  const reset   = useResetUserPassword()
  const actorId = useAuthStore(s => s.user?.id)
  const isSelf  = actorId !== undefined && actorId === user.id
  const resetEnabled = usePasswordResetEnabled()

  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordNeeded, setPasswordNeeded] = useState(() => isMaxPrivilegeUser(user))
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [disabledByBackend, setDisabledByBackend] = useState(false)
  const cancelRef   = useRef<HTMLButtonElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const name = `${user.first_name} ${user.last_name}`.trim()

  const switchedOff = resetEnabled === false || disabledByBackend
  const canConfirm  = !switchedOff && !reset.isPending && (!passwordNeeded || password !== '')

  useEffect(() => { cancelRef.current?.focus() }, [])
  useEffect(() => { if (passwordNeeded && passwordError) passwordRef.current?.focus() }, [passwordNeeded, passwordError])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !reset.isPending) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, reset.isPending])

  const waitText = (seconds: number) => {
    const { unit, count } = describeWait(seconds)
    return t(`auth:errors.wait.${unit}`, { count })
  }

  const handleConfirm = () => {
    if (!canConfirm) return
    setError(null); setPasswordError(null)
    reset.mutate({ id: user.id, operatorPassword: passwordNeeded ? password : undefined }, {
      onSuccess: () => { setPassword(''); onDone(user) },
      onError: (err: unknown) => {
        const parsed = parseAuthError(err)
        // La contraseña nunca se conserva tras una respuesta: si hay que reintentar, se vuelve a escribir.
        setPassword('')
        if (parsed.status === 422 && parsed.rawCode === 'operator_password_required') {
          setPasswordNeeded(true)
          setPasswordError(t('security:users.resetPassword.errors.passwordRequired'))
        } else if (parsed.status === 422 && parsed.rawCode === 'operator_reauth_failed') {
          setPasswordError(t('security:users.resetPassword.errors.reauthFailed'))
        } else if (parsed.status === 429) {
          setError(parsed.retryAfter !== undefined
            ? t('security:users.resetPassword.errors.throttledWait', { time: waitText(parsed.retryAfter) })
            : t('security:users.resetPassword.errors.throttled'))
        } else if (parsed.status === 403 && parsed.rawCode === 'password_reset_disabled') {
          setDisabledByBackend(true)
          setError(t('security:users.resetPassword.errors.disabled'))
        } else if (parsed.status === 403) {
          setError(t('security:users.resetPassword.errors.forbidden'))
        } else if (parsed.status === 422) {
          setError(parsed.message ?? t('security:users.resetPassword.errors.inactive'))
        } else if (parsed.status === 404) {
          setError(t('security:users.resetPassword.errors.notFound'))
        } else {
          setError(t('security:users.resetPassword.errors.generic'))
        }
      },
    })
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[1000] flex items-center justify-center p-4">
      <Card variant="modal" className="w-full max-w-md p-0">
        <div role="dialog" aria-modal="true" aria-labelledby="reset-pw-title">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 id="reset-pw-title" className="font-bold text-slate-800 text-base">
              {t('security:users.resetPassword.title')}
            </h2>
            <Button type="button" variant="icon" onClick={onClose} disabled={reset.isPending}
              aria-label={t('common:actions.close')}>
              <IcoClose size={16} />
            </Button>
          </div>

          <div className="px-6 py-5 space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {t('security:users.resetPassword.message', { name, email: user.email })}
            </p>
            <p className="text-xs text-slate-500">{t('security:users.resetPassword.warning')}</p>
            {isSelf && (
              <div role="note" className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                {t('security:users.resetPassword.selfWarning')}
              </div>
            )}
            {switchedOff && (
              <div role="note" className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                {t('security:users.resetPassword.errors.disabled')}
              </div>
            )}
            {passwordNeeded && (
              <div>
                <label htmlFor="reset-pw-operator" className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('security:users.resetPassword.passwordLabel')}
                </label>
                <input
                  id="reset-pw-operator"
                  ref={passwordRef}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  disabled={reset.isPending || switchedOff}
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby="reset-pw-operator-help"
                  onChange={e => { setPassword(e.target.value); if (passwordError) setPasswordError(null) }}
                  onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${passwordError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`}
                />
                <p id="reset-pw-operator-help" className="mt-1 text-[11px] text-slate-500">
                  {t('security:users.resetPassword.passwordHelp')}
                </p>
                {passwordError && <p role="alert" className="mt-1 text-xs text-red-600">{passwordError}</p>}
              </div>
            )}
            {error && (
              <div role="alert" className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
            <Button ref={cancelRef} type="button" variant="secondary" onClick={onClose} disabled={reset.isPending}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="button" variant="danger" loading={reset.isPending} disabled={!canConfirm} onClick={handleConfirm}>
              {t('security:users.resetPassword.confirm')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
