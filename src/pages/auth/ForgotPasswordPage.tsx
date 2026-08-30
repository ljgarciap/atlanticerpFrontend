import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { authApi } from '@/api/authApi'
import AppLogo from '@/components/AppLogo'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const schema = z.object({
  email: z.string().email(),
})
type FormData = z.infer<typeof schema>

const inputCls = (hasError: boolean) =>
  `w-full px-3 py-2 border rounded-lg text-sm transition focus:outline-none focus:ring-2
   ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

export default function ForgotPasswordPage() {
  const { t } = useTranslation(['common', 'auth'])
  const [sent, setSent]       = useState(false)
  const [apiError, setApiError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setApiError('')
    try {
      await authApi.forgotPassword(data.email)
    } catch {
      // Always show success — never reveal whether email exists
    }
    setSent(true)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5 bg-[#fafaf7] dark:bg-slate-900"
    >
      <Card variant="modal-auth" className="w-full max-w-md" style={{ padding: '44px 38px' }}>

        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <AppLogo size={64} />
          <h1
            className="font-medium mt-3 text-[#2a2520] dark:text-slate-100"
            style={{ fontSize: '22px', letterSpacing: '2.5px' }}
          >
            {t('common:brand')}
          </h1>
          <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 500 }}>
            {t('common:brandSubtitle')}
          </p>
        </div>

        {sent ? (
          /* ── Success state ─────────────────────────────────────────────── */
          <div className="text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: '#f0fdf4' }}>
              <svg className="w-7 h-7" fill="none" stroke="#5BA5A0" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              {t('auth:forgotPassword.success')}
            </p>
            <Link
              to="/login"
              className="text-sm font-semibold transition text-primary hover:text-primary-dark dark:text-primary-light"
            >
              {t('auth:forgotPassword.backToLogin')}
            </Link>
          </div>
        ) : (
          /* ── Form ──────────────────────────────────────────────────────── */
          <>
            <div className="text-center mb-6">
              <h2 className="text-lg font-bold text-slate-800">{t('auth:forgotPassword.title')}</h2>
              <p className="text-xs text-slate-500 mt-1">{t('auth:forgotPassword.subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t('common:labels.email')}
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="usuario@atlantic.com"
                  {...register('email')}
                  className={inputCls(!!errors.email)}
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{t('auth:validation.invalidEmail')}</p>
                )}
              </div>

              {apiError && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {apiError}
                </div>
              )}

              <Button type="submit" loading={isSubmitting} className="w-full">
                {isSubmitting ? t('auth:forgotPassword.submitting') : t('auth:forgotPassword.submit')}
              </Button>

              <div className="text-center mt-4">
                <Link
                  to="/login"
                  className="text-xs font-medium transition text-primary hover:text-primary-dark dark:text-primary-light"
                >
                  {t('auth:forgotPassword.backToLogin')}
                </Link>
              </div>
            </form>
          </>
        )}
      </Card>
    </div>
  )
}
