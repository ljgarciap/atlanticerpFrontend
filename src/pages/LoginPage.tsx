import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { authApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'
import { getHomeRoute } from '@/lib/homeRoute'
import { isMultiRoleResponse, isMfaRequiredResponse } from '@/types/auth'
import AppLogo from '@/components/AppLogo'
import RolePickerModal from '@/components/RolePickerModal'
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
  const { setAuth, setPendingRoleSelection, pendingRoleSelection } = useAuthStore()

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
    setLoginError('')
    try {
      const res = await authApi.login(data.email, data.password)
      if (isMultiRoleResponse(res)) {
        setPendingRoleSelection(res.selection_token, res.roles)
      } else if (isMfaRequiredResponse(res)) {
        setMfaState({ challengeId: res.mfa_challenge_id })
      } else {
        setAuth(res.user, res.accessToken, res.refreshToken)
        // SCRUM-175 — '/dashboard' ya no existe (SCRUM-711); navegar directo a la pantalla de
        // Inicio real del usuario evita el salto extra por el catch-all (y el loop infinito que
        // causaba pantalla en blanco para usuarios sin acceso a Ventas & Diseño, ver homeRoute.ts).
        navigate(getHomeRoute(res.user), { replace: true })
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setLoginError(msg || t('auth:login.invalidCredentials'))
    }
  }

  const handleMfaVerify = async (data: MfaFormData) => {
    if (!mfaState) return
    setMfaError('')
    try {
      const res = await authApi.mfaVerify(mfaState.challengeId, data.code)
      if (isMultiRoleResponse(res)) {
        setPendingRoleSelection(res.selection_token, res.roles)
      } else {
        setAuth(res.user, res.accessToken, res.refreshToken)
        // SCRUM-175 — '/dashboard' ya no existe (SCRUM-711); navegar directo a la pantalla de
        // Inicio real del usuario evita el salto extra por el catch-all (y el loop infinito que
        // causaba pantalla en blanco para usuarios sin acceso a Ventas & Diseño, ver homeRoute.ts).
        navigate(getHomeRoute(res.user), { replace: true })
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setMfaError(msg || t('auth:mfa.invalidCode'))
      mfaReset()
    }
  }

  const handleResend = async () => {
    if (!mfaState || resendLoading) return
    setResendLoading(true)
    setResendMessage('')
    try {
      const res = await authApi.mfaResend(mfaState.challengeId)
      setMfaState({ challengeId: res.mfa_challenge_id })
      setResendMessage(t('auth:mfa.resendSuccess'))
      mfaReset()
    } catch {
      // silently ignore — resend is best-effort
    } finally {
      setResendLoading(false)
    }
  }

  const handleBackToLogin = () => {
    setMfaState(null)
    setMfaError('')
    setResendMessage('')
    mfaReset()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (pendingRoleSelection) return <RolePickerModal />

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

              {resendMessage && (
                <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm text-center">
                  {resendMessage}
                </div>
              )}

              <Button type="submit" loading={mfaPending} className="w-full">
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
                  disabled={resendLoading}
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

            {/* Error de API */}
            {loginError && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {loginError}
              </div>
            )}

            {/* Botón */}
            <Button type="submit" loading={loginPending} className="w-full">
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
              <Link
                to="/register"
                className="text-xs font-medium transition text-primary hover:text-primary-dark dark:text-primary-light"
              >
                {t('auth:createAccount')}
              </Link>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
