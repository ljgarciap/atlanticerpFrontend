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
import { useCreateUser, useUpdateUser, useUsers } from '@/hooks/useUsers'
import { useAuthStore } from '@/store/authStore'
import type { UserListItem } from '@/api/usersApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose, IcoCheck } from '@/components/icons'

function buildSchema(t: TFunction) {
  return z.object({
    first_name:         z.string().min(1, t('auth:validation.required')).max(120, t('auth:validation.maxLength', { count: 120 })),
    last_name:          z.string().min(1, t('auth:validation.required')).max(120, t('auth:validation.maxLength', { count: 120 })),
    email:              z.string().email(t('auth:validation.invalidEmail')),
    phone:              z.string().max(30).nullable().optional(),
    // SCRUM-822 (REQ-548) — cargo/fecha de ingreso/jefe directo. manager_id null = "Ninguno —
    // Socio Director" (RN2). is_active solo se usa al crear (RN3) — al editar el estado se
    // maneja con el toggle existente (toggleStatus), no por este form.
    job_title:          z.string().max(120).nullable().optional(),
    hire_date:          z.string().nullable().optional(),
    manager_id:         z.number().nullable().optional(),
    is_active:          z.boolean().optional(),
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

  // SCRUM-1140 — los permisos adicionales salen del catálogo real (`GET /api/permission-catalog`, el mismo contra el que el backend
  // valida `extra_permissions.*`), no de una lista fija: antes solo se podían asignar 11 permisos y los angostos por persona
  // (p. ej. `admin_contab.edit.receptor_fiscal`) solo existían vía seeder.
  const { data: catalogData, isLoading: catalogLoading, isError: catalogError } = useQuery({
    queryKey: ['permission-catalog'],
    queryFn:  levelsApi.catalog,
    enabled:  isSuperadmin,
  })
  const actorLevel    = currentUser?.security_level ?? 0
  const isEdit        = user !== null
  const createUser    = useCreateUser()
  const updateUser    = useUpdateUser()
  const isBusy        = createUser.isPending || updateUser.isPending

  const qc                          = useQueryClient()
  const { data: departments = [] }  = useQuery({ queryKey: ['departments', 'all'],        queryFn: departmentsApi.listAll })
  const { data: levels = [] }       = useQuery({ queryKey: ['security-levels', 'all'],    queryFn: levelsApi.listAll })
  const { data: roles = [] }        = useQuery({ queryKey: ['roles'],                     queryFn: rolesApi.list })
  // SCRUM-822 — picker de jefe directo: candidatos activos, excluyendo al propio usuario en
  // edición (un usuario no puede ser su propio jefe, RN2/validación de backend).
  const { data: managerCandidates } = useUsers({ per_page: 100, is_active: true })
  const managerOptions              = (managerCandidates?.data ?? []).filter(u => u.id !== user?.id)
  const schema                      = useMemo(() => buildSchema(t), [t])
  const activeRoles                 = roles.filter(r => r.is_active)
  // Blocker de Senior Review 2026-07-13 — defensa en profundidad, el gate real vive en
  // UserService::assertRoleAssignable(). Sin esto un actor sin superadmin.all podía elegir
  // "Superadmin" como rol base para cualquier usuario.
  const baseRoleOptions             = isSuperadmin ? activeRoles : activeRoles.filter(r => !r.is_superadmin)

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      phone: null, job_title: null, hire_date: null, manager_id: null, is_active: true,
      department_id: null, security_level_id: undefined, notes: null,
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
        job_title:           user.job_title,
        hire_date:           user.hire_date,
        manager_id:          user.manager?.id ?? null,
        department_id:       user.department?.id ?? null,
        security_level_id:   user.security_level?.id,
        notes:               user.notes,
        role_id:             user.role_id ?? undefined,
        additional_role_ids: user.additional_role_ids ?? [],
        extra_permissions:   user.extra_permissions ?? [],
      })
    } else {
      reset({
        phone: null, job_title: null, hire_date: null, manager_id: null, is_active: true,
        department_id: null, security_level_id: level1Id, notes: null,
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
        // is_active no es parte de UpdateUserPayload — RN3 solo aplica al crear, el estado de
        // un usuario ya existente se maneja con el toggle dedicado (useToggleUserStatus).
        const { is_active: _isActive, ...editable } = data
        await updateUser.mutateAsync({
          id: user.id,
          data: {
            ...editable,
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
          job_title:            data.job_title ?? null,
          hire_date:            data.hire_date ?? null,
          manager_id:           data.manager_id ?? null,
          is_active:            data.is_active ?? true,
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

          {/* Cargo / Fecha de ingreso — SCRUM-822 (REQ-548) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('security:users.form.jobTitle')}
              </label>
              <input {...register('job_title')} className={inputCls(!!errors.job_title)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {t('security:users.form.hireDate')}
              </label>
              <input type="date" {...register('hire_date')} className={inputCls(!!errors.hire_date)} />
            </div>
          </div>

          {/* Jefe directo — null = "Ninguno — Socio Director" (RN2) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {t('security:users.form.manager')}
            </label>
            <Controller
              name="manager_id"
              control={control}
              render={({ field }) => (
                <select
                  className={inputCls(!!errors.manager_id)}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{t('security:users.form.noManager')}</option>
                  {managerOptions.map(m => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                  ))}
                </select>
              )}
            />
            {errors.manager_id && (
              <p className="text-red-500 text-xs mt-1">{errors.manager_id.message}</p>
            )}
          </div>

          {/* Estado al crear — RN3, no aplica al editar (usa el toggle dedicado) */}
          {!isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
              <input type="checkbox" {...register('is_active')} className="rounded border-slate-300" />
              {t('security:users.form.activeOnCreate')}
            </label>
          )}

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
              {catalogLoading && <p className="text-slate-400 text-xs">{t('common:labels.loading')}</p>}
              {catalogError && <p className="text-red-600 text-xs">{t('security:users.form.extraPermissionsError')}</p>}
              <Controller
                name="extra_permissions"
                control={control}
                render={({ field }) => (
                  <div className="space-y-2" data-testid="extra-permissions">
                    {catalogData && Object.entries(catalogData.catalog).map(([module, perms]) => (
                      <div key={module}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{module}</p>
                        <div className="flex flex-wrap gap-2">
                          {perms.map(perm => {
                            const active = (field.value ?? []).includes(perm.key)
                            return (
                              <Button
                                key={perm.key}
                                type="button"
                                variant="outline"
                                active={active}
                                activeVariant="accent"
                                onClick={() => {
                                  const curr = field.value ?? []
                                  field.onChange(active ? curr.filter(p => p !== perm.key) : [...curr, perm.key])
                                }}
                                className="!text-xs">
                                {t(`security:users.form.permLabels.${perm.key}`, { defaultValue: perm.label })}
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
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
