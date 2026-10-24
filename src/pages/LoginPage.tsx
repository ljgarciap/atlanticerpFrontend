import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { authApi } from '@/api/authApi'
import { parseAuthError, isTooManyAttempts } from '@/lib/authErrors'
import { useRetryCountdown, describeWait } from '@/hooks/useRetryCountdown'
import { useAuthStore } from '@/store/authStore'
import { getHomeRoute } from '@/lib/homeRoute'
import { returnPathFor } from '@/lib/returnPath'
import { isMfaRequiredResponse } from '@/types/auth'
import AppLogo from '@/components/AppLogo'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

// ── Login form ────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})
type LoginFormData = z.infer<typeof loginSchema>

// ── MFA form ──────────────────────────────────────────────────────────────────

const mfaSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
})
type MfaFormData = z.infer<typeof mfaSchema>

// ── Shared input class helper ─────────────────────────────────────────────────

const inputCls = (hasError: boolean) =>
  `w-full px-3 py-2 border rounded-lg text-sm transition focus:outline-none focus:ring-2
   ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { t }    = useTranslation(['common', 'auth'])
  const navigate = useNavigate()
  // SCRUM-1033: el cambio de contraseña cierra todas las sesiones; ChangePassword* navega aquí con este flag.
  const location = useLocation()
  const locationState = location.state as { passwordChanged?: boolean } | null
  const passwordChanged = locationState?.passwordChanged === true
  // SCRUM-1159: ruta protegida que se pidió sin sesión (enlace de un correo o notificación): solo si es una ruta interna y, si la pidió la
  // persona de una sesión que se cerró, solo para esa misma persona (ver `returnPathFor`). Se resuelve al entrar, cuando ya se sabe quién es.
  const destinationFor = (userId: number, home: string) => returnPathFor(location.state, userId) ?? home
  const { setAuth } = useAuthStore()
  // Cierre de H2: la contraseña temporal venció con la sesión viva (el interceptor cerró la sesión y
  // dejó este flag) o el propio login respondió 401 `password_reset_expired`.
  const passwordResetExpiredFlag = useAuthStore(s => s.passwordResetExpired)
  const setPasswordResetExpired  = useAuthStore(s => s.setPasswordResetExpired)
  const [loginExpired, setLoginExpired] = useState(false)

  // Cierre de H4: esperas por 429 `too_many_attempts`, una por cada formulario que puede recibirlo.
  const loginWait  = useRetryCountdown()
  const mfaWait    = useRetryCountdown()
  const resendWait = useRetryCountdown()
  const waitText = (seconds: number) => {
    const { unit, count } = describeWait(seconds)
    return t(`auth:errors.wait.${unit}`, { count })
  }

  // MFA step state
  const [mfaState, setMfaState]         = useState<{ challengeId: string } | null>(null)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  // Login form
  const {
    register: loginReg,
    handleSubmit: loginSubmit,
    formState: { errors: loginErrors, isSubmitting: loginPending },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) })

  const [loginError, setLoginError] = useState('')

  // MFA form
  const {
    register: mfaReg,
    handleSubmit: mfaSubmit,
    formState: { errors: mfaErrors, isSubmitting: mfaPending },
    reset: mfaReset,
  } = useForm<MfaFormData>({ resolver: zodResolver(mfaSchema) })

  const [mfaError, setMfaError] = useState('')

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleLogin = async (data: LoginFormData) => {
    if (loginWait.active) return
    setLoginError('')
    setLoginExpired(false)
    setPasswordResetExpired(false)
    try {
      const res = await authApi.login(data.email, data.password)
      if (isMfaRequiredResponse(res)) {
        setMfaState({ challengeId: res.mfa_challenge_id })
      } else {
        setAuth(res.user, res.accessToken, res.refreshToken)
        // SCRUM-175 — '/dashboard' ya no existe (SCRUM-711); navegar directo a la pantalla de
        // Inicio real del usuario evita el salto extra por el catch-all (y el loop infinito que
        // causaba pantalla en blanco para usuarios sin acceso a Ventas & Diseño, ver homeRoute.ts).
        navigate(destinationFor(res.user.id, getHomeRoute(res.user)), { replace: true })
      }
    } catch (err: unknown) {
      const parsed = parseAuthError(err)
      if (parsed.code === 'password_reset_expired') {
        // Mensaje propio (i18n) y enlace a "Olvidé mi contraseña": no se muestra el texto del backend.
        setLoginExpired(true)
      } else if (isTooManyAttempts(parsed)) {
        loginWait.start(parsed.retryAfter ?? 60)
      } else {
        setLoginError(parsed.message || t('auth:login.invalidCredentials'))
      }
    }
  }

  const handleMfaVerify = async (data: MfaFormData) => {
    if (!mfaState || mfaWait.active) return
    setMfaError('')
    try {
      const res = await authApi.mfaVerify(mfaState.challengeId, data.code)
      setAuth(res.user, res.accessToken, res.refreshToken)
      // SCRUM-175 — '/dashboard' ya no existe (SCRUM-711); navegar directo a la pantalla de
      // Inicio real del usuario evita el salto extra por el catch-all (y el loop infinito que
      // causaba pantalla en blanco para usuarios sin acceso a Ventas & Diseño, ver homeRoute.ts).
      navigate(destinationFor(res.user.id, getHomeRoute(res.user)), { replace: true })
    } catch (err: unknown) {
      const parsed = parseAuthError(err)
      if (isTooManyAttempts(parsed)) {
        mfaWait.start(parsed.retryAfter ?? 60)
      } else {
        setMfaError(parsed.message || t('auth:mfa.invalidCode'))
      }
      mfaReset()
    }
  }

  const handleResend = async () => {
    if (!mfaState || resendLoading || resendWait.active) return
    setResendLoading(true)
    setResendMessage('')
    try {
      const res = await authApi.mfaResend(mfaState.challengeId)
      setMfaState({ challengeId: res.mfa_challenge_id })
      setResendMessage(t('auth:mfa.resendSuccess'))
      mfaReset()
    } catch (err: unknown) {
      // El reenvío es "best-effort" salvo el límite de intentos: ahí se avisa y se bloquea el botón.
      const parsed = parseAuthError(err)
      if (isTooManyAttempts(parsed)) resendWait.start(parsed.retryAfter ?? 60)
    } finally {
      setResendLoading(false)
    }
  }

  const handleBackToLogin = () => {
    mfaWait.clear(); resendWait.clear()
    setMfaState(null)
    setMfaError('')
    setResendMessage('')
    mfaReset()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5 bg-[#fafaf7] dark:bg-slate-900"
    >
      <Card
        variant="modal-auth"
        className="w-full max-w-md"
        style={{ padding: '44px 38px' }}
      >

        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <AppLogo size={76} />
          <h1
            className="font-medium mt-3 text-[#2a2520] dark:text-slate-100"
            style={{ fontSize: '22px', letterSpacing: '2.5px' }}
          >
            {t('common:brand')}
          </h1>
          <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 500 }}>
            {t('common:brandSubtitle')}
          </p>
          {/* REQ-LOGO1 (SCRUM-173) — texto "Powered by AtlanticERP" debajo del logo, alineado a la derecha */}
          <p className="w-full text-right" style={{ fontSize: '10px', color: '#94a3b8', marginTop: '10px' }}>
            {t('common:poweredBy')}
          </p>
        </div>

        {mfaState ? (
          /* ── MFA step ──────────────────────────────────────────────────── */
          <>
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold text-slate-800">{t('auth:mfa.title')}</h2>
              <p className="text-xs text-slate-500 mt-1">{t('auth:mfa.subtitle')}</p>
            </div>

            <form onSubmit={mfaSubmit(handleMfaVerify)} noValidate>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t('auth:mfa.codeLabel')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder={t('auth:mfa.codePlaceholder')}
                  {...mfaReg('code')}
                  className={inputCls(!!mfaErrors.code) + ' text-center text-xl tracking-[0.5em] font-mono'}
                />
                {mfaErrors.code && (
                  <p className="text-red-500 text-xs mt-1 text-center">{t('auth:validation.mfaCode')}</p>
                )}
              </div>

              {mfaError && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {mfaError}
                </div>
              )}

              {mfaWait.active && (
                <div role="alert" className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  {t('auth:errors.tooManyAttempts', { time: waitText(mfaWait.remaining) })}
                </div>
              )}

              {resendWait.active && (
                <div role="alert" className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  {t('auth:errors.tooManyAttempts', { time: waitText(resendWait.remaining) })}
                </div>
              )}

              {resendMessage && (
                <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm text-center">
                  {resendMessage}
                </div>
              )}

              <Button type="submit" loading={mfaPending} disabled={mfaWait.active} className="w-full">
                {mfaPending ? t('auth:mfa.submitting') : t('auth:mfa.submit')}
              </Button>

              <div className="flex justify-between mt-4">
                <Button type="button" variant="ghost" onClick={handleBackToLogin} className="!text-xs">
                  {t('auth:mfa.backToLogin')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResend}
                  disabled={resendLoading || resendWait.active}
                  className="!text-xs"
                >
                  {resendLoading ? '...' : t('auth:mfa.resend')}
                </Button>
              </div>
            </form>
          </>
        ) : (
          /* ── Login step ────────────────────────────────────────────────── */
          <form onSubmit={loginSubmit(handleLogin)} noValidate>

            {/* Email */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t('common:labels.email')}
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="usuario@atlantic.com"
                {...loginReg('email')}
                className={inputCls(!!loginErrors.email)}
              />
              {loginErrors.email && (
                <p className="text-red-500 text-xs mt-1">{t('auth:validation.invalidEmail')}</p>
              )}
            </div>

            {/* Contraseña */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t('common:labels.password')}
              </label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...loginReg('password')}
                className={inputCls(!!loginErrors.password)}
              />
              {loginErrors.password && (
                <p className="text-red-500 text-xs mt-1">{t('auth:validation.passwordRequired')}</p>
              )}
            </div>

            {/* Contraseña cambiada: se cerraron las sesiones (SCRUM-1033) */}
            {passwordChanged && (
              <div role="status" className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
                {t('auth:changePassword.reloginNotice')}
              </div>
            )}

            {/* Contraseña temporal vencida (cierre de H2) */}
            {(loginExpired || passwordResetExpiredFlag) && (
              <div role="alert" className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                <p>{t('auth:errors.passwordResetExpired')}</p>
                <Link to="/forgot-password" className="mt-1 inline-block font-semibold underline">
                  {t('auth:login.forgotPassword')}
                </Link>
              </div>
            )}

            {/* Límite de intentos (cierre de H4) */}
            {loginWait.active && (
              <div role="alert" className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                {t('auth:errors.tooManyAttempts', { time: waitText(loginWait.remaining) })}
              </div>
            )}

            {/* Error de API */}
            {loginError && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {loginError}
              </div>
            )}

            {/* Botón */}
            <Button type="submit" loading={loginPending} disabled={loginWait.active} className="w-full">
              {loginPending ? t('common:actions.loggingIn') : t('common:actions.login')}
            </Button>

            {/* Links secundarios */}
            <div className="text-center mt-4 flex flex-col gap-2">
              <Link
                to="/forgot-password"
                className="text-xs font-medium transition text-primary hover:text-primary-dark dark:text-primary-light"
              >
                {t('auth:login.forgotPassword')}
              </Link>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
