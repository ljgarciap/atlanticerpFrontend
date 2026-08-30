import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/authApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose, IcoCheck } from '@/components/icons'

const schema = z.object({
  current_password:          z.string().min(1),
  new_password:              z.string()
    .min(8)
    .regex(/[A-Z]/, 'uppercase')
    .regex(/[a-z]/, 'lowercase')
    .regex(/[0-9]/, 'digit'),
  new_password_confirmation: z.string().min(1),
}).refine(d => d.new_password === d.new_password_confirmation, {
  message: 'mismatch',
  path:    ['new_password_confirmation'],
})
type FormData = z.infer<typeof schema>

interface Props { onClose: () => void }

export default function ChangePasswordModal({ onClose }: Props) {
  const { t }      = useTranslation(['common', 'auth'])
  const [success,  setSuccess]  = useState(false)
  const [apiError, setApiError] = useState('')

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setApiError('')
    try {
      await authApi.changePassword(
        data.current_password,
        data.new_password,
        data.new_password_confirmation,
      )
      setSuccess(true)
      reset()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 422) {
        setApiError(t('auth:changePassword.wrongCurrent'))
      } else {
        setApiError(
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? t('auth:changePassword.wrongCurrent'),
        )
      }
    }
  }

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2 border rounded-lg text-sm transition focus:outline-none focus:ring-2
     ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <Card variant="modal" className="p-8 w-full max-w-md relative pointer-events-auto">
          {/* Close button */}
          <Button variant="icon" onClick={onClose} className="absolute top-4 right-4 leading-none">
            <IcoClose size={16} />
          </Button>

          <h2 className="text-xl font-bold text-slate-900 mb-1">
            {t('auth:changePassword.title')}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {t('auth:changePassword.weakPassword')}
          </p>

          {success ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center text-emerald-600"
                style={{ background: '#d1f5e0' }}>
                <IcoCheck size={22} />
              </div>
              <p className="font-semibold text-emerald-700 mb-4">{t('auth:changePassword.success')}</p>
              <Button variant="ghost" onClick={onClose}>
                {t('common:actions.close')}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} onFocus={() => setApiError('')} noValidate className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('auth:changePassword.currentPassword')}
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  {...register('current_password')}
                  className={inputCls(!!errors.current_password)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('auth:changePassword.newPassword')}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  {...register('new_password')}
                  className={inputCls(!!errors.new_password)}
                />
                {errors.new_password && (
                  <p className="text-red-500 text-xs mt-1">{t('auth:changePassword.weakPassword')}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('auth:changePassword.confirmPassword')}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  {...register('new_password_confirmation')}
                  className={inputCls(!!errors.new_password_confirmation)}
                />
                {errors.new_password_confirmation && (
                  <p className="text-red-500 text-xs mt-1">{t('auth:changePassword.mismatch')}</p>
                )}
              </div>

              {apiError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {apiError}
                </div>
              )}

              <Button
                type="submit"
                loading={isSubmitting}
                className="w-full mt-2"
              >
                {t('auth:changePassword.submit')}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </>
  )
}
