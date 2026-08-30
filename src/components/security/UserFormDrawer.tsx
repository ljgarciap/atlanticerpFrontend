import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { departmentsApi } from '@/api/departmentsApi'
import { levelsApi } from '@/api/levelsApi'
import { rolesApi } from '@/api/rolesApi'
import { usersApi } from '@/api/usersApi'
import { useCreateUser, useUpdateUser } from '@/hooks/useUsers'
import { useAuthStore } from '@/store/authStore'
import type { UserListItem } from '@/api/usersApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose, IcoCheck } from '@/components/icons'

const PERMISSION_CATALOG = [
  'crm.read', 'crm.write', 'crm.edit', 'crm.delete',
  'reports.read', 'reports.export',
  'ai.use',
  'security.users', 'security.levels',
  'settings.global',
  'superadmin.all',
] as const

function buildSchema(t: TFunction) {
  return z.object({
    first_name:         z.string().min(1, t('auth:validation.required')).max(120, t('auth:validation.maxLength', { count: 120 })),
    last_name:          z.string().min(1, t('auth:validation.required')).max(120, t('auth:validation.maxLength', { count: 120 })),
    email:              z.string().email(t('auth:validation.invalidEmail')),
    phone:              z.string().max(30).nullable().optional(),
    department_id:      z.number().nullable().optional(),
    security_level_id:  z.number().int().positive(),
    notes:              z.string().nullable().optional(),
    role_id:             z.number().int().positive({ message: t('auth:validation.required') }),
    additional_role_ids: z.array(z.number()).optional(),
    extra_permissions:  z.array(z.string()).optional(),
  })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

interface Props {
  user:     UserListItem | null
  onClose:  () => void
  onSaved:  () => void
}

export default function UserFormDrawer({ user, onClose, onSaved }: Props) {
  const { t }         = useTranslation(['common', 'security'])
  const currentUser   = useAuthStore(s => s.user)
  const isSuperadmin  = currentUser?.permissions.includes('superadmin.all') ?? false
  const actorLevel    = currentUser?.security_level ?? 0
  const isEdit        = user !== null
  const createUser    = useCreateUser()
  const updateUser    = useUpdateUser()
  const isBusy        = createUser.isPending || updateUser.isPending

  const qc                          = useQueryClient()
  const { data: departments = [] }  = useQuery({ queryKey: ['departments', 'all'],        queryFn: departmentsApi.listAll })
  const { data: levels = [] }       = useQuery({ queryKey: ['security-levels', 'all'],    queryFn: levelsApi.listAll })
  const { data: roles = [] }        = useQuery({ queryKey: ['roles'],                     queryFn: rolesApi.list })
  const schema                      = useMemo(() => buildSchema(t), [t])
  const activeRoles                 = roles.filter(r => r.is_active)
  // Blocker de Senior Review 2026-07-13 — defensa en profundidad, el gate real vive en
  // UserService::assertRoleAssignable(). Sin esto un actor sin superadmin.all podía elegir
  // "Superadmin" como rol base para cualquier usuario.
  const baseRoleOptions             = isSuperadmin ? activeRoles : activeRoles.filter(r => !r.is_superadmin)

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      phone: null, department_id: null, security_level_id: undefined, notes: null,
      role_id: undefined, additional_role_ids: [], extra_permissions: [],
    },
  })

  // Espejo local de los flags — el mutation de flags es independiente del form principal y
  // `user` (prop) no se refresca solo al invalidar la query mientras el drawer sigue abierto.
  const [localFlags, setLocalFlags] = useState({ approve_large_amounts: false, manage_users: false })

  useEffect(() => {
    setLocalFlags({
      approve_large_amounts: user?.approve_large_amounts ?? false,
      manage_users:          user?.manage_users ?? false,
    })
  }, [user])

  const level1Id = levels.find(l => l.level === 1)?.id

  // Misma guardia jerárquica del backend (UserService.php): un actor sin
  // superadmin.all solo puede asignar niveles estrictamente menores al suyo.
  const assignableLevels = isSuperadmin ? levels : levels.filter(l => l.level < actorLevel)

  useEffect(() => {
    if (user) {
      reset({
        first_name:          user.first_name,
        last_name:           user.last_name,
        email:               user.email,
        phone:               user.phone,
        department_id:       user.department?.id ?? null,
        security_level_id:   user.security_level?.id,
        notes:               user.notes,
        role_id:             user.role_id ?? undefined,
        additional_role_ids: user.additional_role_ids ?? [],
        extra_permissions:   user.extra_permissions ?? [],
      })
    } else {
      reset({
        phone: null, department_id: null, security_level_id: level1Id, notes: null,
        role_id: undefined, additional_role_ids: [], extra_permissions: [],
      })
    }
  }, [user, reset, level1Id])

  const updateFlags = useMutation({
    mutationFn: (data: { approve_large_amounts?: boolean; manage_users?: boolean }) =>
      usersApi.updateFlags(user!.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit && user) {
        await updateUser.mutateAsync({
          id: user.id,
          data: {
            ...data,
            additional_role_ids: isSuperadmin ? (data.additional_role_ids ?? []) : undefined,
            extra_permissions:   isSuperadmin ? (data.extra_permissions ?? []) : undefined,
          },
        })
      } else {
        await createUser.mutateAsync({
          first_name:           data.first_name,
          last_name:            data.last_name,
          email:                data.email,
          phone:                data.phone ?? null,
          department_id:        data.department_id ?? null,
          security_level_id:    data.security_level_id,
          notes:                data.notes ?? null,
          role_id:              data.role_id,
          additional_role_ids:  isSuperadmin ? (data.additional_role_ids ?? []) : undefined,
          extra_permissions:    isSuperadmin ? (data.extra_permissions ?? []) : undefined,
        })
      }
      onSaved()
    } catch {
      // error displayed inline via mutation state
    }
  }

  const roleName = (id: number | null) => roles.find(r => r.id === id)?.name ?? '—'

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
     ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <Card variant="drawer" className="fixed right-0 top-0 h-[100dvh] w-full max-w-lg z-50 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-base">
            {isEdit ? t('security:users.form.titleEdit') : t('security:users.form.titleCreate')}
          </h2>
          <Button type="button" variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
        </div>

        {/* Body */}
        <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto flex flex-col px-6 py-5 space-y-4">

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('security:users.form.firstName')} *
              </label>
              <input {...register('first_name')} className={inputCls(!!errors.first_name)} />
              {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('security:users.form.lastName')} *
              </label>
              <input {...register('last_name')} className={inputCls(!!errors.last_name)} />
              {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name.message}</p>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('security:users.form.email')} *
            </label>
            <input type="email" inputMode="email" {...register('email')} className={inputCls(!!errors.email)} />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            {!isEdit && (
              <p className="text-slate-400 text-xs mt-1">{t('security:users.form.passwordHint')}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('security:users.form.phone')}
            </label>
            <input {...register('phone')} inputMode="tel" className={inputCls(!!errors.phone)} placeholder="+xxx xxxx-xxxx" />
          </div>

          {/* Resumen de solo lectura: rol base + excepciones (SCRUM-145) */}
          {isEdit && user && (
            <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg text-xs space-y-1">
              <p className="text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{t('security:users.form.summary.baseRole')}:</span>{' '}
                {roleName(user.role_id)}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{t('security:users.form.summary.additionalRoles')}:</span>{' '}
                {user.additional_role_ids.length > 0
                  ? user.additional_role_ids.map(roleName).join(', ')
                  : t('security:users.form.summary.none')}
              </p>
              <p className="text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{t('security:users.form.summary.flags')}:</span>
                <span className="inline-flex items-center gap-1">
                  {t('security:users.form.flags.approveLargeAmounts')}
                  {localFlags.approve_large_amounts
                    ? <IcoCheck size={11} className="text-emerald-600" />
                    : <IcoClose size={11} className="text-slate-400" />}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  {t('security:users.form.flags.manageUsers')}
                  {localFlags.manage_users
                    ? <IcoCheck size={11} className="text-emerald-600" />
                    : <IcoClose size={11} className="text-slate-400" />}
                </span>
              </p>
              {user.extra_permissions.length > 0 && (
                <p className="text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{t('security:users.form.extraPermissions')}:</span>{' '}
                  {user.extra_permissions.join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Rol base */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('security:users.form.baseRole')} *
            </label>
            <Controller
              name="role_id"
              control={control}
              render={({ field }) => (
                <select
                  className={inputCls(!!errors.role_id)}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}>
                  <option value="">{t('security:users.form.noRole')}</option>
                  {baseRoleOptions.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              )}
            />
            {errors.role_id && (
              <p className="text-red-500 text-xs mt-1">{errors.role_id.message}</p>
            )}
          </div>

          {/* Roles adicionales — superadmin only, mismo gate que extra_permissions */}
          {isSuperadmin && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-0.5">
                {t('security:users.form.additionalRoles')}
              </label>
              <p className="text-slate-400 text-xs mb-2">{t('security:users.form.additionalRolesHint')}</p>
              <Controller
                name="additional_role_ids"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {activeRoles.map(r => {
                      const active = (field.value ?? []).includes(r.id)
                      return (
                        <Button
                          key={r.id}
                          type="button"
                          variant="outline"
                          active={active}
                          activeVariant="accent"
                          onClick={() => {
                            const curr = field.value ?? []
                            field.onChange(active ? curr.filter(id => id !== r.id) : [...curr, r.id])
                          }}
                          className="!text-xs">
                          {r.name}
                        </Button>
                      )
                    })}
                  </div>
                )}
              />
            </div>
          )}

          {/* Department */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('security:users.form.department')}
            </label>
            <Controller
              name="department_id"
              control={control}
              render={({ field }) => (
                <select
                  className={inputCls(false)}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{t('security:users.form.noDepartment')}</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
            />
          </div>

          {/* Security Level */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('security:users.form.securityLevel')} *
            </label>
            <Controller
              name="security_level_id"
              control={control}
              render={({ field }) => (
                <select
                  className={inputCls(!!errors.security_level_id)}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}>
                  <option value="">{t('security:users.form.noLevel')}</option>
                  {assignableLevels.map(l => (
                    <option key={l.id} value={l.id}>[{l.level}] {l.name}</option>
                  ))}
                </select>
              )}
            />
            {errors.security_level_id && (
              <p className="text-red-500 text-xs mt-1">{t('auth:validation.securityLevelRequired')}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('security:users.form.notes')}
            </label>
            <textarea {...register('notes')} rows={3} className={`${inputCls(false)} resize-none`} />
          </div>

          {/* Flags transversales — por persona, no gateados a superadmin (ADR-006, Decisión 8/10) */}
          {isEdit && user && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">
                {t('security:users.form.flags.title')}
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  active={localFlags.approve_large_amounts}
                  activeVariant="accent"
                  disabled={updateFlags.isPending}
                  onClick={() => {
                    const next = !localFlags.approve_large_amounts
                    setLocalFlags(f => ({ ...f, approve_large_amounts: next }))
                    updateFlags.mutate({ approve_large_amounts: next })
                  }}
                  className="!text-xs">
                  {t('security:users.form.flags.approveLargeAmounts')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  active={localFlags.manage_users}
                  activeVariant="accent"
                  disabled={updateFlags.isPending}
                  onClick={() => {
                    const next = !localFlags.manage_users
                    setLocalFlags(f => ({ ...f, manage_users: next }))
                    updateFlags.mutate({ manage_users: next })
                  }}
                  className="!text-xs">
                  {t('security:users.form.flags.manageUsers')}
                </Button>
              </div>
              {updateFlags.isError && (
                <p className="text-red-500 text-xs mt-1">{t('common:messages.saveError')}</p>
              )}
            </div>
          )}

          {/* Extra permissions — superadmin only */}
          {isSuperadmin && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-0.5">
                {t('security:users.form.extraPermissions')}
              </label>
              <p className="text-slate-400 text-xs mb-2">{t('security:users.form.extraPermissionsHint')}</p>
              <Controller
                name="extra_permissions"
                control={control}
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {PERMISSION_CATALOG.map(perm => {
                      const active = (field.value ?? []).includes(perm)
                      return (
                        <Button
                          key={perm}
                          type="button"
                          variant="outline"
                          active={active}
                          activeVariant="accent"
                          onClick={() => {
                            const curr = field.value ?? []
                            field.onChange(active ? curr.filter(p => p !== perm) : [...curr, perm])
                          }}
                          className="!text-xs">
                          {t(`security:users.form.permLabels.${perm}`, { defaultValue: perm })}
                        </Button>
                      )
                    })}
                  </div>
                )}
              />
            </div>
          )}

          {/* Mutation error — usa el mutation que realmente está activo (create vs edit) */}
          {(createUser.isError || updateUser.isError) && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
              {((isEdit ? updateUser : createUser).error as { response?: { data?: { message?: string } } })?.response?.data?.message
                ?? t('common:messages.saveError')}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="shrink-0 px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            type="submit"
            form="user-form"
            disabled={isBusy}
            onClick={handleSubmit(onSubmit)}>
            {isBusy ? '…' : t('common:actions.save')}
          </Button>
        </div>
      </Card>
    </>
  )
}
