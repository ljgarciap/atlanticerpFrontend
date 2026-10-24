import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { usersApi, type BulkResetPasswordPreview } from '@/api/usersApi'
import { parseAuthError } from '@/lib/authErrors'
import { describeWait } from '@/hooks/useRetryCountdown'
import { usePasswordResetEnabled } from '@/hooks/usePasswordResetSettings'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

interface Props {
  onClose: () => void
}

type Step = 'select' | 'confirm' | 'done'
type Preview = BulkResetPasswordPreview['data']
type ApiError = { response?: { status?: number; data?: { message?: string; code?: string } } }

/**
 * Reset MASIVO de contraseñas (solo superadmin), en 2 pasos con simulación previa:
 *   1) Calcular quiénes se verían afectados (todos los usuarios activos, sin incluir al propio
 *      superadmin ni a las cuentas de superadmin salvo que se pida de forma explícita), excluir a quien se quiera y volver a calcular el conjunto final.
 *   2) Escribir exactamente `RESETEAR <N>` Y la contraseña actual del operador (cierre de H3) para habilitar
 *      "Aplicar". La contraseña vive solo en el estado del componente: nunca viaja en la simulación y se limpia
 *      en cada respuesta, al volver atrás y al terminar.
 * El backend vuelve a validar `confirm` contra el conteo real: si cambió algo en el medio responde
 * 422 `confirmation_mismatch` y hay que volver a calcular.
 */
export default function BulkResetPasswordModal({ onClose }: Props) {
  const { t } = useTranslation(['common', 'security', 'auth'])
  const resetEnabled = usePasswordResetEnabled()

  const [step,         setStep]         = useState<Step>('select')
  const [includeSelf,  setIncludeSelf]  = useState(false)
  const [includeSuperadmins, setIncludeSuperadmins] = useState(false)
  const [preview,      setPreview]      = useState<Preview | null>(null)
  const [excluded,     setExcluded]     = useState<Set<number>>(new Set())
  const [filter,       setFilter]       = useState('')
  const [finalSet,     setFinalSet]     = useState<Preview | null>(null)
  const [confirmText,  setConfirmText]  = useState('')
  const [resetCount,   setResetCount]   = useState<number | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [mismatch,     setMismatch]     = useState(false)
  const [operatorPassword, setOperatorPassword] = useState('')
  const [passwordError,   setPasswordError]   = useState<string | null>(null)
  const [disabledByBackend, setDisabledByBackend] = useState(false)
  const firstFocusRef = useRef<HTMLInputElement>(null)

  const waitText = (seconds: number) => {
    const { unit, count } = describeWait(seconds)
    return t(`auth:errors.wait.${unit}`, { count })
  }

  const describeError = (err: unknown): string => {
    const parsed = parseAuthError(err)
    const { response } = err as ApiError
    if (parsed.status === 403 && parsed.rawCode === 'password_reset_disabled') return t('security:users.bulkResetPassword.errors.disabled')
    switch (response?.status) {
      case 403: return t('security:users.bulkResetPassword.errors.forbidden')
      case 429: return parsed.retryAfter !== undefined
        ? t('security:users.bulkResetPassword.errors.throttledWait', { time: waitText(parsed.retryAfter) })
        : t('security:users.bulkResetPassword.errors.throttled')
      default:  return response?.data?.message ?? t('security:users.bulkResetPassword.errors.generic')
    }
  }

  const previewMutation = useMutation({
    mutationFn: (exceptIds: number[]) =>
      usersApi.resetPasswords({ dry_run: true, except_ids: exceptIds, include_self: includeSelf, include_superadmins: includeSuperadmins }),
  })

  const applyMutation = useMutation({
    gcTime: 0, // la contraseña del operador viaja en las variables: no se conserva en el MutationCache
    mutationFn: (vars: { exceptIds: number[]; confirm: string; operatorPassword: string }) =>
      usersApi.resetPasswords({
        dry_run: false, except_ids: vars.exceptIds, include_self: includeSelf, include_superadmins: includeSuperadmins,
        confirm: vars.confirm, operator_password: vars.operatorPassword,
      }),
  })

  const busy = previewMutation.isPending || applyMutation.isPending

  useEffect(() => { firstFocusRef.current?.focus() }, [step])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const exceptIds = useMemo(() => Array.from(excluded), [excluded])
  const remaining = preview ? preview.users.filter(u => !excluded.has(u.id)).length : 0
  const visibleUsers = useMemo(() => {
    if (!preview) return []
    const q = filter.trim().toLowerCase()
    return q === ''
      ? preview.users
      : preview.users.filter(u => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
  }, [preview, filter])

  const phrase = finalSet ? `RESETEAR ${finalSet.count}` : ''
  const switchedOff = resetEnabled === false || disabledByBackend
  const canApply = finalSet !== null && finalSet.count > 0 && confirmText === phrase && operatorPassword !== '' && !busy && !switchedOff

  const handleCalculate = () => {
    setError(null); setMismatch(false)
    previewMutation.mutate([], {
      onSuccess: res => { setPreview(res.data); setExcluded(new Set()); setFilter('') },
      onError: err => setError(describeError(err)),
    })
  }

  const toggleExcluded = (id: number) => {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleIncludeSelf = (value: boolean) => {
    // El conjunto calculado depende de esta opción: hay que volver a calcular.
    setIncludeSelf(value)
    setPreview(null); setExcluded(new Set()); setFinalSet(null); setConfirmText(''); setOperatorPassword(''); setPasswordError(null); setError(null)
  }

  const handleIncludeSuperadmins = (value: boolean) => {
    // Igual que "incluir mi cuenta": el conjunto afectado cambia, hay que recalcular y reiniciar la frase.
    setIncludeSuperadmins(value)
    setPreview(null); setExcluded(new Set()); setFinalSet(null); setConfirmText(''); setOperatorPassword(''); setPasswordError(null); setError(null)
  }

  const handleContinue = () => {
    setError(null); setMismatch(false)
    // Se vuelve a calcular con las exclusiones: el N de la frase de confirmación lo da el backend.
    previewMutation.mutate(exceptIds, {
      onSuccess: res => { setFinalSet(res.data); setConfirmText(''); setOperatorPassword(''); setPasswordError(null); setStep('confirm') },
      onError: err => setError(describeError(err)),
    })
  }

  const handleApply = () => {
    if (!canApply) return
    setError(null); setPasswordError(null); setMismatch(false)
    applyMutation.mutate({ exceptIds, confirm: confirmText, operatorPassword }, {
      onSuccess: res => { setOperatorPassword(''); setResetCount(res.data.reset_count); setStep('done') },
      onError: err => {
        // La contraseña nunca se conserva tras una respuesta: si hay que reintentar, se vuelve a escribir.
        setOperatorPassword('')
        const parsed = parseAuthError(err)
        const { response } = err as ApiError
        if (response?.status === 422 && response.data?.code === 'confirmation_mismatch') {
          setMismatch(true)
          setError(t('security:users.bulkResetPassword.errors.mismatch'))
        } else if (parsed.status === 422 && (parsed.rawCode === 'operator_reauth_failed' || parsed.rawCode === 'operator_password_required')) {
          setPasswordError(t('security:users.bulkResetPassword.errors.reauthFailed'))
        } else if (parsed.status === 403 && parsed.rawCode === 'password_reset_disabled') {
          setDisabledByBackend(true)
          setError(describeError(err))
        } else {
          setError(describeError(err))
        }
      },
    })
  }

  const handleRecalculate = () => {
    setStep('select'); setFinalSet(null); setPreview(null); setExcluded(new Set()); setConfirmText(''); setOperatorPassword(''); setPasswordError(null); setError(null); setMismatch(false)
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[1000] flex items-center justify-center p-4">
      <Card variant="modal" className="w-full max-w-lg p-0 flex flex-col max-h-[90vh]">
        <div role="dialog" aria-modal="true" aria-labelledby="bulk-reset-title" className="flex flex-col min-h-0">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
            <h2 id="bulk-reset-title" className="font-bold text-slate-800 text-base">
              {t('security:users.bulkResetPassword.title')}
            </h2>
            <Button type="button" variant="icon" onClick={onClose} disabled={busy} aria-label={t('common:actions.close')}>
              <IcoClose size={16} />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
            {step === 'select' && (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {t('security:users.bulkResetPassword.subtitle')}
                </p>

                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    ref={firstFocusRef}
                    type="checkbox"
                    checked={includeSelf}
                    disabled={busy}
                    onChange={e => handleIncludeSelf(e.target.checked)}
                  />
                  {t('security:users.bulkResetPassword.includeSelf')}
                </label>

                <div>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={includeSuperadmins}
                      disabled={busy}
                      onChange={e => handleIncludeSuperadmins(e.target.checked)}
                    />
                    {t('security:users.bulkResetPassword.includeSuperadmins')}
                  </label>
                  <p className="mt-1 ml-6 text-[11px] text-amber-700 dark:text-amber-400">
                    {t('security:users.bulkResetPassword.includeSuperadminsWarning')}
                  </p>
                </div>

                {preview === null ? (
                  <Button type="button" loading={previewMutation.isPending} onClick={handleCalculate}>
                    {t('security:users.bulkResetPassword.calculate')}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {t('security:users.bulkResetPassword.affected', { count: remaining })}
                      {excluded.size > 0 && (
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          {t('security:users.bulkResetPassword.excludedCount', { count: excluded.size })}
                        </span>
                      )}
                    </p>

                    {preview.users.length === 0 ? (
                      <p className="text-sm text-slate-500">{t('security:users.bulkResetPassword.emptyPreview')}</p>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={filter}
                          onChange={e => setFilter(e.target.value)}
                          placeholder={t('security:users.bulkResetPassword.filterPlaceholder')}
                          aria-label={t('security:users.bulkResetPassword.filterPlaceholder')}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                        <p className="text-[11px] text-slate-400">{t('security:users.bulkResetPassword.excludeHelper')}</p>
                        <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
                          {visibleUsers.map(u => (
                            <li key={u.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                              <input
                                id={`bulk-reset-exclude-${u.id}`}
                                type="checkbox"
                                checked={excluded.has(u.id)}
                                onChange={() => toggleExcluded(u.id)}
                                aria-label={t('security:users.bulkResetPassword.excludeUser', { email: u.email })}
                              />
                              <label htmlFor={`bulk-reset-exclude-${u.id}`} className="min-w-0 flex-1 cursor-pointer">
                                <span className="block truncate text-slate-800 dark:text-slate-100">{u.email}</span>
                                <span className="block truncate text-xs text-slate-500">{u.name}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {step === 'confirm' && finalSet && (
              <>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {t('security:users.bulkResetPassword.affected', { count: finalSet.count })}
                </p>
                <p className="text-xs text-slate-500">{t('security:users.bulkResetPassword.confirmWarning')}</p>
                <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {finalSet.users.map(u => (
                    <li key={u.id} className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 truncate">{u.email}</li>
                  ))}
                </ul>
                <div>
                  <label htmlFor="bulk-reset-confirm" className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('security:users.bulkResetPassword.confirmInstruction', { phrase })}
                  </label>
                  <input
                    id="bulk-reset-confirm"
                    ref={firstFocusRef}
                    type="text"
                    autoComplete="off"
                    value={confirmText}
                    disabled={busy}
                    onChange={e => setConfirmText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleApply() }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="bulk-reset-operator-password" className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('security:users.bulkResetPassword.passwordLabel')}
                  </label>
                  <input
                    id="bulk-reset-operator-password"
                    type="password"
                    autoComplete="current-password"
                    value={operatorPassword}
                    disabled={busy || switchedOff}
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby="bulk-reset-operator-password-help"
                    onChange={e => { setOperatorPassword(e.target.value); if (passwordError) setPasswordError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') handleApply() }}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${passwordError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`}
                  />
                  <p id="bulk-reset-operator-password-help" className="mt-1 text-[11px] text-slate-500">
                    {t('security:users.bulkResetPassword.passwordHelp')}
                  </p>
                  {passwordError && <p role="alert" className="mt-1 text-xs text-red-600">{passwordError}</p>}
                </div>
                {switchedOff && (
                  <div role="note" className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                    {t('security:users.bulkResetPassword.disabledNotice')}
                  </div>
                )}
              </>
            )}

            {step === 'done' && (
              <div role="status" className="text-center py-4">
                <p className="font-semibold text-emerald-700">
                  {t('security:users.bulkResetPassword.resultCount', { count: resetCount ?? 0 })}
                </p>
                <p className="text-xs text-slate-500 mt-2">{t('security:users.bulkResetPassword.resultNote')}</p>
              </div>
            )}

            {error && (
              <div role="alert" className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap justify-end gap-2 shrink-0">
            {step === 'select' && (
              <>
                <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
                  {t('common:actions.cancel')}
                </Button>
                {preview !== null && (
                  <Button type="button" disabled={remaining === 0 || busy} loading={previewMutation.isPending} onClick={handleContinue}>
                    {t('security:users.bulkResetPassword.continue')}
                  </Button>
                )}
              </>
            )}
            {step === 'confirm' && (
              <>
                {mismatch ? (
                  <Button type="button" variant="secondary" onClick={handleRecalculate}>
                    {t('security:users.bulkResetPassword.recalculate')}
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" onClick={() => { setStep('select'); setError(null); setOperatorPassword(''); setPasswordError(null) }} disabled={busy}>
                    {t('security:users.bulkResetPassword.back')}
                  </Button>
                )}
                <Button type="button" variant="danger" disabled={!canApply} loading={applyMutation.isPending} onClick={handleApply}>
                  {t('security:users.bulkResetPassword.apply')}
                </Button>
              </>
            )}
            {step === 'done' && (
              <Button type="button" onClick={onClose}>{t('common:actions.close')}</Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
