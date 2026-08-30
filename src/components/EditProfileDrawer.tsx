import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose, IcoCheck } from '@/components/icons'

const PHONE_REGEX = /^\+?[0-9\s-]{7,20}$/

function buildSchema(t: TFunction) {
  return z.object({
    first_name:    z.string().min(1, t('auth:validation.required')).max(120, t('auth:validation.maxLength', { count: 120 })),
    last_name:     z.string().min(1, t('auth:validation.required')).max(120, t('auth:validation.maxLength', { count: 120 })),
    phone:         z.string().max(30, t('auth:validation.maxLength', { count: 30 })).nullable().optional()
      .refine(v => !v || PHONE_REGEX.test(v), { message: t('auth:validation.phoneFormat') }),
    notes:         z.string().max(1000).nullable().optional(),
    department_id: z.number().nullable().optional(),
  })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

interface Props { onClose: () => void }

export default function EditProfileDrawer({ onClose }: Props) {
  const { t }    = useTranslation(['common', 'auth', 'security'])
  const queryClient = useQueryClient()
  const { user, updateUser } = useAuthStore()
  const [saved, setSaved] = useState(false)

  // ── Departments ──────────────────────────────────────────────────────────────
  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn:  authApi.getDepartments,
  })
  const departments = deptsData?.data ?? []

  // ── Profile form ────────────────────────────────────────────────────────────
  const schema = useMemo(() => buildSchema(t), [t])
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name:    user?.first_name ?? '',
      last_name:     user?.last_name  ?? '',
      phone:         user?.phone      ?? null,
      notes:         user?.notes      ?? null,
      department_id: user?.department_id ?? null,
    },
  })

  useEffect(() => {
    if (user) {
      reset({
        first_name:    user.first_name,
        last_name:     user.last_name,
        phone:         user.phone         ?? null,
        notes:         user.notes         ?? null,
        department_id: user.department_id ?? null,
      })
    }
  }, [user, reset])

  const profileMutation = useMutation({
    mutationFn: authApi.updateProfile,
    onSuccess: (data) => {
      if (user) {
        updateUser({
          ...user,
          first_name:    data.first_name,
          last_name:     data.last_name,
          phone:         data.phone,
          notes:         data.notes,
          department_id: data.department_id,
          language:      data.language,
        })
      }
      setSaved(true)
    },
  })

  // ── MFA section ─────────────────────────────────────────────────────────────
  const { data: mfaStatus, refetch: refetchMfa } = useQuery({
    queryKey: ['mfa/status'],
    queryFn:  authApi.mfaStatus,
  })

  const mfaEnabled = mfaStatus?.mfa_enabled ?? false
  const mfaMode    = mfaStatus?.mfa_mode    ?? 'optional'

  const [enablePassword, setEnablePassword] = useState('')
  const [mfaError,       setMfaError]       = useState('')
  const [mfaSuccess,     setMfaSuccess]     = useState('')
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null)
  const [mfaCode,        setMfaCode]        = useState('')

  const enableMutation = useMutation({
    mutationFn: (password: string) => authApi.mfaEnable(password),
    onSuccess: (res) => {
      setMfaChallengeId(res.mfa_challenge_id)
      setEnablePassword('')
      setMfaError('')
      setMfaSuccess('')
    },
    onError: (err: unknown) => {
      // 401/422 = contraseña realmente incorrecta; cualquier otro código (ej. 503 si
      // falla el envío del email del código) no tiene nada que ver con la contraseña —
      // mostrar el message real del backend, no asumir siempre el mismo error (SCRUM-2 QA).
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 401 || status === 422) {
        setMfaError(t('auth:changePassword.wrongCurrent'))
      } else {
        setMfaError(
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? t('auth:changePassword.wrongCurrent'),
        )
      }
      setMfaSuccess('')
    },
  })

  const confirmEnableMutation = useMutation({
    mutationFn: (code: string) => authApi.mfaConfirmEnable(mfaChallengeId ?? '', code),
    onSuccess: () => {
      void refetchMfa()
      void queryClient.invalidateQueries({ queryKey: ['mfa/status'] })
      setMfaChallengeId(null)
      setMfaCode('')
      setMfaError('')
      setMfaSuccess(t('auth:mfa.enableSuccess'))
    },
    onError: () => {
      setMfaError(t('auth:mfa.invalidCode'))
    },
  })

  const resendMutation = useMutation({
    mutationFn: () => authApi.mfaResend(mfaChallengeId ?? ''),
    onSuccess: (res) => {
      setMfaChallengeId(res.mfa_challenge_id)
      setMfaCode('')
      setMfaError('')
    },
  })

  const disableMutation = useMutation({
    mutationFn: authApi.mfaDisable,
    onSuccess: () => {
      void refetchMfa()
      void queryClient.invalidateQueries({ queryKey: ['mfa/status'] })
      setMfaSuccess(t('auth:mfa.disableSuccess'))
    },
  })

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
     ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <Card variant="drawer" className="fixed right-0 top-0 h-[100dvh] w-full max-w-md z-50 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-base">{t('auth:profile.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
        </div>

        {/* Body */}
        <form id="profile-form" onSubmit={handleSubmit(d => profileMutation.mutate(d))} onFocus={() => setSaved(false)} className="flex-1 overflow-y-auto flex flex-col px-6 py-5 space-y-4">

          {/* ── Profile fields ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('security:users.form.firstName')} *</label>
              <input {...register('first_name')} className={inputCls(!!errors.first_name)} />
              {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('security:users.form.lastName')} *</label>
              <input {...register('last_name')} className={inputCls(!!errors.last_name)} />
              {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name.message}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('common:labels.email')}</label>
            <input
              type="email"
              value={user?.email ?? ''}
              readOnly
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400 cursor-not-allowed" />
            <p className="text-slate-400 text-xs mt-1">{t('auth:profile.emailReadOnly')}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('security:users.form.phone')}</label>
            <input {...register('phone')} inputMode="tel" className={inputCls(!!errors.phone)} placeholder="+xxx xxxx-xxxx" />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
          </div>

          {/* Department */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('security:users.form.department')}</label>
            <Controller
              name="department_id"
              control={control}
              render={({ field }) => (
                <select
                  className={inputCls(false)}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t('common:labels.selectOption')}</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('security:users.form.notes')}</label>
            <textarea {...register('notes')} rows={3} className={`${inputCls(false)} resize-none`} />
          </div>

          {profileMutation.isError && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
              {t('common:messages.saveError')}
            </div>
          )}

          {/* ── MFA section ── */}
          <div className="border-t border-slate-200 pt-4">
            {/* Title row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6
                       1.526 1.526 0 003 7.5v.75c0 5.523 3.954 10.19 9 11.393
                       5.046-1.203 9-5.87 9-11.393V7.5c0-.54-.22-1.056-.598-1.44
                       A11.959 11.959 0 0112 2.714z" />
                </svg>
                <span className="text-xs font-semibold text-slate-700">{t('auth:mfa.sectionTitle')}</span>
              </div>
              {mfaMode !== 'disabled' && (
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-bold"
                  style={mfaEnabled
                    ? { background: '#d1ede9', color: '#1f6b66' }
                    : { background: '#f1f5f9', color: '#94a3b8' }}
                >
                  {mfaEnabled ? t('auth:mfa.statusEnabled') : t('auth:mfa.statusDisabled')}
                </span>
              )}
            </div>

            {mfaMode === 'disabled' ? (
              <p className="text-xs text-slate-400">{t('auth:mfa.disabledByAdmin')}</p>
            ) : (
              <>
                {/* Feedback banner */}
                {mfaSuccess && (
                  <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-xs">
                    {mfaSuccess}
                  </div>
                )}

                {mfaEnabled ? (
                  /* ── Disable ── */
                  <div>
                    {mfaMode === 'required' && (
                      <p className="text-xs text-slate-400 mb-2">{t('auth:mfa.requiredByAdmin')}</p>
                    )}
                    <Button
                      type="button"
                      variant="danger-text"
                      disabled={mfaMode === 'required' || disableMutation.isPending}
                      onClick={() => { setMfaSuccess(''); disableMutation.mutate() }}
                    >
                      {disableMutation.isPending ? t('auth:mfa.disabling') : t('auth:mfa.disable')}
                    </Button>
                  </div>
                ) : mfaChallengeId ? (
                  /* ── Confirm enrollment code ── */
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">{t('auth:mfa.enrollCodeSent')}</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={mfaCode}
                        onChange={e => { setMfaCode(e.target.value.replace(/\D/g, '')); setMfaError('') }}
                        placeholder={t('auth:mfa.codePlaceholder')}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <Button
                        type="button"
                        loading={confirmEnableMutation.isPending}
                        disabled={mfaCode.length !== 6}
                        onClick={() => confirmEnableMutation.mutate(mfaCode)}
                        className="!text-xs shrink-0"
                      >
                        {t('auth:mfa.submit')}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => { setMfaChallengeId(null); setMfaCode(''); setMfaError('') }}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        {t('common:actions.cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={resendMutation.isPending}
                        onClick={() => resendMutation.mutate()}
                        className="text-xs text-primary hover:text-primary-dark"
                      >
                        {t('auth:mfa.resend')}
                      </button>
                    </div>
                    {mfaError && <p className="text-red-500 text-xs">{mfaError}</p>}
                  </div>
                ) : (
                  /* ── Enable ── */
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">{t('auth:mfa.passwordHint')}</p>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={enablePassword}
                        onChange={e => { setEnablePassword(e.target.value); setMfaError(''); setMfaSuccess('') }}
                        placeholder="••••••••"
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <Button
                        type="button"
                        loading={enableMutation.isPending}
                        disabled={!enablePassword}
                        onClick={() => enableMutation.mutate(enablePassword)}
                        className="!text-xs shrink-0"
                      >
                        {t('auth:mfa.enable')}
                      </Button>
                    </div>
                    {mfaError && <p className="text-red-500 text-xs">{mfaError}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="shrink-0 px-6 pt-3 pb-4 border-t border-slate-200 flex flex-col gap-3">
          {saved && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: '#5BA5A0' }}
            >
              <IcoCheck size={14} />
              {t('common:messages.saved')}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saved}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" form="profile-form" loading={profileMutation.isPending} disabled={saved}>
              {t('common:actions.save')}
            </Button>
          </div>
        </div>
      </Card>
    </>
  )
}
