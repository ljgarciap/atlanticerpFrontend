import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { usersApi, type UserListItem } from '@/api/usersApi'
import { levelsApi } from '@/api/levelsApi'
import { useApproveUser } from '@/hooks/useUsers'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'

interface Props {
  user:       UserListItem
  onClose:    () => void
  onApproved: () => void
}

const selectCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50'

export default function ApproveUserModal({ user, onClose, onApproved }: Props) {
  const { t } = useTranslation(['common', 'security'])

  const [role,            setRole]            = useState('')
  const [securityLevelId, setSecurityLevelId] = useState<number>(0)
  const [apiError,        setApiError]        = useState('')

  const { data: catalogData } = useQuery({
    queryKey: ['users/catalog'],
    queryFn:  usersApi.catalog,
    staleTime: Infinity,
  })

  const { data: levels } = useQuery({
    queryKey: ['security-levels/all'],
    queryFn:  levelsApi.listAll,
    staleTime: Infinity,
  })

  const approve = useApproveUser()

  const availableRoles = (catalogData?.roles ?? []).filter(r => r !== 'guest')
  const activeLevels   = (levels ?? []).filter(l => l.is_active)

  const canSubmit = role !== '' && securityLevelId > 0 && !approve.isPending

  const handleSubmit = () => {
    if (!canSubmit) return
    setApiError('')
    approve.mutate(
      { id: user.id, role, securityLevelId },
      {
        onSuccess: () => { onApproved() },
        onError:   (err) => {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          setApiError(msg ?? t('common:messages.saveError'))
        },
      },
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <Card variant="modal" className="p-8 w-full max-w-md pointer-events-auto">

          {/* Close */}
          <Button
            type="button"
            variant="icon"
            onClick={onClose}
            className="absolute top-4 right-4 leading-none">
            <IcoClose size={16} />
          </Button>

          {/* Header */}
          <div className="mb-5">
            <h2 className="text-base font-bold text-slate-900">{t('security:users.pending.approveTitle')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('security:users.pending.approveSubtitle')}</p>
          </div>

          {/* User info */}
          <div className="mb-5 px-3 py-3 bg-slate-50 rounded-lg">
            <p className="text-sm font-semibold text-slate-800">{user.first_name} {user.last_name}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
            {user.department && (
              <p className="text-xs text-slate-400 mt-0.5">{user.department.name}</p>
            )}
          </div>

          {/* Role */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('security:users.pending.role')} *
            </label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className={selectCls}
            >
              <option value="">{t('security:users.pending.selectRole')}</option>
              {availableRoles.map(r => (
                <option key={r} value={r}>
                  {t(`common:roles.${r}`, { defaultValue: r })}
                </option>
              ))}
            </select>
          </div>

          {/* Security level */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('security:users.pending.securityLevel')} *
            </label>
            <select
              value={securityLevelId || ''}
              onChange={e => setSecurityLevelId(Number(e.target.value))}
              className={selectCls}
            >
              <option value="">{t('security:users.pending.selectLevel')}</option>
              {activeLevels.map(l => (
                <option key={l.id} value={l.id}>
                  {l.level} — {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {apiError && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {apiError}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="button" variant="accent" disabled={!canSubmit} onClick={handleSubmit}>
              {approve.isPending
                ? t('security:users.pending.approving')
                : t('security:users.pending.confirmApprove')}
            </Button>
          </div>
        </Card>
      </div>
    </>
  )
}
