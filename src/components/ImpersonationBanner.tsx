import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { endImpersonation } from '@/lib/impersonation'
import { Button } from '@/components/ui/Button'
import { IcoEye } from '@/components/icons'

/** mm:ss — la sesión dura minutos, nunca horas. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * SCRUM-1158 — franja fija, no cerrable, mientras un superadmin ve la app como otra persona. Es la única señal visual de que lo que se
 * ve NO es su propia cuenta (la pantalla es idéntica a la de la persona observada a propósito). Cuenta regresiva hasta `expires_at`;
 * al llegar a cero sale sola: el backend ya habría cerrado la sesión y toda petición respondería 401.
 */
export default function ImpersonationBanner() {
  const { t }         = useTranslation('common')
  const navigate      = useNavigate()
  const impersonation = useAuthStore(s => s.user?.impersonation ?? null)
  const sessionId     = impersonation?.id ?? null
  const [now, setNow]         = useState(() => Date.now())
  const [exiting, setExiting] = useState(false)
  const exitingRef            = useRef(false)

  const expiresAtMs = impersonation ? Date.parse(impersonation.expires_at) : NaN
  const remainingMs = Number.isFinite(expiresAtMs) ? Math.max(0, expiresAtMs - now) : null

  const exit = useCallback(async () => {
    if (exitingRef.current) return
    exitingRef.current = true
    setExiting(true)
    const restored = await endImpersonation()
    if (restored) {
      navigate('/security/users', { replace: true })
    } else {
      useToastStore.getState().show(t('impersonation.originLostToast'), 'error')
      navigate('/login', { replace: true })
    }
  }, [navigate, t])

  // Una sesión nueva (otro id) vuelve a poder salir.
  useEffect(() => { exitingRef.current = false; setExiting(false) }, [sessionId])

  useEffect(() => {
    if (sessionId === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [sessionId])

  useEffect(() => {
    if (remainingMs === 0) void exit()
  }, [remainingMs, exit])

  if (impersonation === null) return null

  return (
    <div
      role="alert"
      aria-label={t('impersonation.bannerAria')}
      className="shrink-0 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-amber-100 dark:bg-amber-900/40 border-b border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 print:hidden"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
        <IcoEye size={16} aria-hidden="true" className="shrink-0" />
        <span className="text-sm font-bold">{t('impersonation.viewingAs', { name: impersonation.target_name })}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800/60">
          {t('impersonation.readOnly')}
        </span>
        <span className="text-xs opacity-80">{t('impersonation.startedBy', { actor: impersonation.actor_name })}</span>
      </div>
      <div className="flex items-center gap-3">
        {remainingMs !== null && (
          <span role="timer" aria-live="off" className="text-xs font-semibold tabular-nums">
            {t('impersonation.remaining', { time: formatRemaining(remainingMs) })}
          </span>
        )}
        <Button type="button" variant="outline" loading={exiting} onClick={() => void exit()} className="!text-xs !px-3 !py-1">
          {t('impersonation.exit')}
        </Button>
      </div>
    </div>
  )
}
