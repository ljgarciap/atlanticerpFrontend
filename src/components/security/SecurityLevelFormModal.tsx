import { useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { levelsApi, type SecurityLevelItem, type PermissionCatalogEntry } from '@/api/levelsApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

function buildSchema(t: TFunction) {
  return z.object({
    name:        z.string().min(1, t('auth:validation.required')).max(100, t('auth:validation.maxLength', { count: 100 })),
    description: z.string().max(500).nullable().optional(),
    permissions: z.array(z.string()),
  })
}
type FormData = z.infer<ReturnType<typeof buildSchema>>

interface Props {
  level:   SecurityLevelItem
  onClose: () => void
}

export default function SecurityLevelFormModal({ level, onClose }: Props) {
  const { t }  = useTranslation(['common', 'security'])
  const qc     = useQueryClient()
  const isSuperAdmin = level.level === 10

  const { data: catalogData, isLoading: catalogLoading, isError: catalogError } = useQuery({
    queryKey: ['permission-catalog'],
    queryFn:  levelsApi.catalog,
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) => levelsApi.update(level.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-levels'] })
      onClose()
    },
  })

  const schema = useMemo(() => buildSchema(t), [t])
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: level.name, description: level.description, permissions: level.permissions },
  })

  useEffect(() => {
    reset({ name: level.name, description: level.description, permissions: level.permissions })
  }, [level, reset])

  const inputCls = (hasError: boolean) =>
    `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
     ${hasError ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`

  const renderPermButton = (
    perm: PermissionCatalogEntry,
    field: { value: string[]; onChange: (v: string[]) => void }
  ) => {
    const active          = field.value.includes(perm.key)
    const isSuperadminAll = perm.key === 'superadmin.all'
    const isDisabled      = isSuperAdmin || (isSuperadminAll && level.level < 10)

    return (
      <Button
        key={perm.key}
        type="button"
        variant="outline"
        active={active}
        disabled={isDisabled}
        onClick={() => {
          if (isSuperAdmin) return
          field.onChange(
            active
              ? field.value.filter(p => p !== perm.key)
              : [...field.value, perm.key]
          )
        }}
        className="flex flex-col items-start text-left !text-xs">
        <span className="font-semibold">{perm.label}</span>
        {perm.description && (
          <span className={active ? 'text-[10px] mt-0.5 text-white/70' : 'text-[10px] mt-0.5 text-slate-400'}>
            {perm.description}
          </span>
        )}
      </Button>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
        <Card variant="modal" className="w-full max-w-lg z-50 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white text-sm font-extrabold"
                style={{ background: level.level === 10 ? '#2a2520' : level.level >= 7 ? '#9fc54d' : '#5BA5A0' }}>
                {level.level}
              </span>
              <h2 className="font-bold text-slate-800 text-base">{t('security:levels.editTitle')}</h2>
            </div>
            <Button type="button" variant="icon" onClick={onClose}><IcoClose size={16} /></Button>
          </div>

          {/* Body */}
          <form id="level-form" onSubmit={handleSubmit(d => mutation.mutate(d))} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('security:levels.form.name')}</label>
              <input {...register('name')} disabled={isSuperAdmin} className={inputCls(!!errors.name)} />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('security:levels.form.description')}</label>
              <textarea {...register('description')} rows={2} disabled={isSuperAdmin}
                className={`${inputCls(false)} resize-none`} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-2">{t('security:levels.form.permissions')}</label>
              {isSuperAdmin && (
                <p className="text-amber-600 text-xs mb-2">{t('security:levels.form.superadminWarning')}</p>
              )}

              {catalogError && (
                <p className="text-red-500 text-xs mb-2">{t('common:messages.loadError')}</p>
              )}
              {catalogLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <Controller
                  name="permissions"
                  control={control}
                  render={({ field }) => (
                    <div className="space-y-3">
                      {catalogData && Object.entries(catalogData.catalog).map(([module, perms]) => (
                        <div key={module}>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 mt-2">
                            {module}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {perms.map(perm => renderPermButton(perm, field))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                />
              )}
            </div>

            {mutation.isError && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
                {t('common:messages.saveError')}
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3 shrink-0">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            {!isSuperAdmin && (
              <Button type="submit" form="level-form" disabled={mutation.isPending}>
                {mutation.isPending ? '…' : t('common:actions.save')}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
