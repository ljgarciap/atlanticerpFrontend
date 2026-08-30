import { useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { rolesApi, type RoleItem } from '@/api/rolesApi'
import type { SecurityLevelItem } from '@/api/levelsApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

function buildSchema(t: TFunction, isEdit: boolean) {
  return z.object({
    key: isEdit
      ? z.string().optional()
      : z.string().min(1, t('auth:validation.required')).max(40).regex(/^[a-z][a-z0-9_]*$/, t('security:roles.form.keyFormat')),
    name:                       z.string().min(1, t('auth:validation.required')).max(80),
    default_security_level_id: z.number().nullable().optional(),
  })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

interface Props {
  role:    RoleItem | null
  levels:  SecurityLevelItem[]
  onClose: () => void
}

export default function RoleFormModal({ role, levels, onClose }: Props) {
  const { t }    = useTranslation(['common', 'security', 'auth'])
  const qc       = useQueryClient()
  const isEdit   = role !== null
  const schema   = useMemo(() => buildSchema(t, isEdit), [t, isEdit])

  const { register, handleSubmit, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      key:                        role?.key ?? '',
      name:                       role?.name ?? '',
      default_security_level_id: role?.default_security_level_id ?? null,
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: FormData) => rolesApi.create({
      key:                        data.key ?? '',
      name:                       data.name,
      default_security_level_id: data.default_security_level_id,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); onClose() },
  })

  const updateMutation = useMutation({
    mutationFn: (data: FormData) => rolesApi.update(role!.id, {
      name:                       data.name,
      default_security_level_id: data.default_security_level_id,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); onClose() },
  })

  const mutation = isEdit ? updateMutation : createMutation

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
     ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <Card variant="modal" className="w-full max-w-md z-50 flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-slate-800 text-base">
            {isEdit ? t('security:roles.form.titleEdit') : t('security:roles.form.titleCreate')}
          </h2>
          <Button type="button" variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
        </div>

        <form id="role-form" onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('security:roles.form.key')}</label>
            <input {...register('key')} disabled={isEdit} className={inputCls(!!errors.key)} placeholder="vendedor_disenador" />
            {errors.key && <p className="text-red-500 text-xs mt-1">{errors.key.message}</p>}
            {isEdit && <p className="text-slate-400 text-xs mt-1">{t('security:roles.form.keyImmutable')}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('security:roles.form.name')}</label>
            <input {...register('name')} className={inputCls(!!errors.name)} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">{t('security:roles.form.defaultLevel')}</label>
            <Controller
              name="default_security_level_id"
              control={control}
              render={({ field }) => (
                <select
                  className={inputCls(false)}
                  value={field.value ?? ''}
                  onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{t('security:roles.form.noDefaultLevel')}</option>
                  {levels.map(l => (
                    <option key={l.id} value={l.id}>[{l.level}] {l.name}</option>
                  ))}
                </select>
              )}
            />
          </div>

          {mutation.isError && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
              {t('common:messages.saveError')}
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="submit" form="role-form" disabled={mutation.isPending}>
            {mutation.isPending ? '…' : t('common:actions.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
