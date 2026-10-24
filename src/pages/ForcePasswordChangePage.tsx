import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { authApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'
import { getHomeRoute } from '@/lib/homeRoute'
import { isMfaRequiredResponse } from '@/types/auth'
import AppLogo from '@/components/AppLogo'
import LanguageSelector from '@/components/LanguageSelector'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

type ApiErrorShape = {
  response?: { status?: number; data?: { message?: string; errors?: Record<string, string[] | undefined> } }
}

function buildSchema(t: TFunction, email: string) {
  const sameAsEmail = (value: string) => value.trim().toLowerCase() === email.trim().toLowerCase()

  return z.object({
    current_password:          z.string().min(1, t('auth:validation.passwordRequired')),
    new_password:              z.string()
      .min(8, t('auth:changePassword.weakPassword'))
      .regex(/[A-Z]/, t('auth:changePassword.weakPassword'))
      .regex(/[a-z]/, t('auth:changePassword.weakPassword'))
      .regex(/[0-9]/, t('auth:changePassword.weakPassword'))
      .refine(v => !sameAsEmail(v), t('auth:forceChange.sameAsEmail')),
    new_password_confirmation: z.string().min(1, t('auth:validation.required')),
  })
    .refine(d => d.new_password === d.new_password_confirmation, {
      message: t('auth:changePassword.mismatch'),
      path:    ['new_password_confirmation'],
    })
    .refine(d => d.new_password !== d.current_password, {
      message: t('auth:forceChange.sameAsCurrent'),
      path:    ['new_password'],
    })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

/**
 * Pantalla obligatoria de cambio de contraseña. `RequireAuth` la muestra EN LUGAR de toda la app
 * autenticada mientras `user.must_change_password` sea true (cuenta restablecida por un
 * superadmin, o 403 `password_change_required` del backend). Sin sidebar ni navegación: solo el
 * formulario y "cerrar sesión".
 */
export default function ForcePasswordChangePage() {
  const { t }    = useTranslation(['common', 'auth'])
  const navigate = useNavigate()
  const user     = useAuthStore(s => s.user)
  const refreshToken = useAuthStore(s => s.refreshToken)
  const [apiError, setApiError] = useState('')

  const schema = useMemo(() => buildSchema(t, user?.email ?? ''), [t, user?.email])
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const goHome = () => {
    navigate(getHomeRoute(useAuthStore.getState().user), { replace: true })
  }

  const onSubmit = async (data: FormData) => {
    setApiError('')
    try {
      await authApi.changePassword(data.current_password, data.new_password, data.new_password_confirmation)
    } catch (err: unknown) {
      const { response } = err as ApiErrorShape
      const fieldErrors = response?.data?.errors
      const firstCurrent = fieldErrors?.current_password?.[0]
      const firstNew     = fieldErrors?.new_password?.[0]

      if (response?.status === 422 && (firstCurrent || firstNew)) {
        if (firstCurrent) setError('current_password', { message: firstCurrent })
        if (firstNew)     setError('new_password',     { message: firstNew })
        return
      }
      if (response?.status === 401) {
        setError('current_password', { message: t('auth:changePassword.wrongCurrent') })
        return
      }
      if (response?.status === 429) {
        setApiError(t('auth:forceChange.throttled'))
        return
      }
      setApiError(response?.data?.message ?? t('auth:forceChange.genericError'))
      return
    }

    // El backend revocó los refresh tokens al cambiar la contraseña: se vuelve a iniciar sesión
    // con la contraseña nueva para obtener tokens vigentes (si no, el refresh silencioso fallaría
    // más adelante y la persona vería "sesión expirada" recién después de cambiarla). Si no se
    // puede (MFA, error de red), se limpia el flag igual y se sigue con el access token actual.
    const { setAuth, clearPasswordChangeRequired } = useAuthStore.getState()
    try {
      const res = await authApi.login(user?.email ?? '', data.new_password)
      if (!isMfaRequiredResponse(res)) {
        setAuth({ ...res.user, must_change_password: false }, res.accessToken, res.refreshToken)
        goHome()
        return
      }
    } catch {
      // cae al flujo de respaldo de abajo
    }
    clearPasswordChangeRequired()
    goHome()
  }

  const handleLogout = async () => {
    if (refreshToken) await authApi.logout(refreshToken)
    localStorage.removeItem('atlanticerp_theme')
    useAuthStore.getState().clearAuth()
    navigate('/login', { replace: true })
  }

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2 border rounded-lg text-sm transition focus:outline-none focus:ring-2
     ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <AppLogo size={28} iconOnly />
          <span className="font-bold tracking-widest text-[#2a2520] text-sm">{t('common:brand')}</span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSelector />
          <Button type="button" variant="outline" onClick={() => void handleLogout()} className="!text-xs !px-2.5 !py-1">
            {t('common:actions.logout')}
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-5">
        <Card variant="modal" className="p-6 sm:p-8 w-full max-w-md">
          <h1 className="text-xl font-bold text-slate-900 mb-1">{t('auth:forceChange.title')}</h1>
          <p className="text-sm text-slate-500 mb-1">{t('auth:forceChange.subtitle')}</p>
          <p className="text-xs text-slate-400 mb-6">{t('auth:changePassword.weakPassword')}</p>

          <form onSubmit={handleSubmit(onSubmit)} onFocus={() => setApiError('')} noValidate className="space-y-4">
            <div>
              <label htmlFor="fpc-current" className="block text-xs font-semibold text-slate-600 mb-1">
                {t('auth:changePassword.currentPassword')}
              </label>
              <input
                id="fpc-current"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.current_password}
                {...register('current_password')}
                className={inputCls(!!errors.current_password)}
              />
              {errors.current_password && (
                <p role="alert" className="text-red-500 text-xs mt-1">{errors.current_password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="fpc-new" className="block text-xs font-semibold text-slate-600 mb-1">
                {t('auth:changePassword.newPassword')}
              </label>
              <input
                id="fpc-new"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.new_password}
                {...register('new_password')}
                className={inputCls(!!errors.new_password)}
              />
              {errors.new_password && (
                <p role="alert" className="text-red-500 text-xs mt-1">{errors.new_password.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="fpc-confirm" className="block text-xs font-semibold text-slate-600 mb-1">
                {t('auth:changePassword.confirmPassword')}
              </label>
              <input
                id="fpc-confirm"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.new_password_confirmation}
                {...register('new_password_confirmation')}
                className={inputCls(!!errors.new_password_confirmation)}
              />
              {errors.new_password_confirmation && (
                <p role="alert" className="text-red-500 text-xs mt-1">{errors.new_password_confirmation.message}</p>
              )}
            </div>

            {apiError && (
              <div role="alert" className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {apiError}
              </div>
            )}

            <Button type="submit" loading={isSubmitting} className="w-full mt-2">
              {t('auth:forceChange.submit')}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  )
}
