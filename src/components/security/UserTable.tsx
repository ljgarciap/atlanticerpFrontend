import { useTranslation } from 'react-i18next'
import type { UserListItem } from '@/api/usersApi'
import type { RoleItem } from '@/api/rolesApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const ROLE_COLORS: Record<string, string> = {
  superadmin:  '#7c3aed',
  management:  '#5BA5A0',
  designer:    '#0ea5e9',
  supervisor:  '#d97706',
  electrician: '#64748b',
}

interface Props {
  users:              UserListItem[]
  roles:              RoleItem[]
  loading:            boolean
  canManage:          boolean
  actorLevel:         number
  actorHasSuperadmin: boolean
  onEdit:             (user: UserListItem) => void
  onToggleStatus:     (user: UserListItem) => void
  onResetMfa:         (user: UserListItem) => void
  onVisibility:       (user: UserListItem) => void
}

export default function UserTable({ users, roles, loading, canManage, actorLevel, actorHasSuperadmin, onEdit, onToggleStatus, onResetMfa, onVisibility }: Props) {
  const { t } = useTranslation(['common', 'security'])
  const roleName = (id: number | null) => roles.find(r => r.id === id)?.name

  // Refleja la guardia jerárquica del backend (UserService.php): un actor
  // sin superadmin.all solo gestiona usuarios de nivel estrictamente menor
  // al suyo. superadmin.all bypassa la restricción, igual que en el backend.
  const canManageTarget = (target: UserListItem) => {
    if (actorHasSuperadmin) return true
    const targetLevel = target.security_level?.level ?? 0
    return targetLevel < actorLevel
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center text-slate-400 text-sm">
        {t('common:labels.loading')}
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center text-slate-400 text-sm">
        {t('security:users.messages.noResults', 'No se encontraron usuarios')}
      </div>
    )
  }

  return (
    <Card variant="panel" className="overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <th className="px-4 py-3.5">{t('security:users.table.columns.fullName')}</th>
            <th className="px-4 py-3.5">{t('security:users.table.columns.email')}</th>
            <th className="px-4 py-3.5">{t('security:users.table.columns.phone')}</th>
            <th className="px-4 py-3.5">{t('security:users.table.columns.role')}</th>
            <th className="px-4 py-3.5">{t('security:users.table.columns.department')}</th>
            <th className="px-4 py-3.5">{t('security:users.table.columns.status')}</th>
            {canManage && <th className="px-4 py-3.5">{t('security:users.table.columns.actions')}</th>}
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}
              className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3.5">
                <span className="font-semibold text-slate-800">
                  {user.first_name} {user.last_name}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">{user.email}</td>
              <td className="px-4 py-3 text-slate-500">{user.phone ?? '—'}</td>
              <td className="px-4 py-3.5">
                {roleName(user.role_id) ? (
                  <div className="flex flex-wrap gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-primary">
                      {roleName(user.role_id)}
                    </span>
                    {user.additional_role_ids.map(id => (
                      <span key={id} className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-accent">
                        {roleName(id)}
                      </span>
                    ))}
                  </div>
                ) : (
                  // Sin role_id (ADR-006 sin backfillear todavía) — fallback al rol legado.
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map(role => (
                      <span key={role}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                        style={{ background: ROLE_COLORS[role] ?? '#64748b' }}>
                        {t(`common:roles.${role}`, { defaultValue: role })}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {user.department?.name ?? '—'}
              </td>
              <td className="px-4 py-3.5">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  user.is_active
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {user.is_active
                    ? t('common:labels.active',   'Activo')
                    : t('common:labels.inactive', 'Inactivo')}
                </span>
              </td>
              {canManage && (() => {
                const manageable = canManageTarget(user)
                const guardTitle = manageable ? undefined : t('security:users.hierarchyGuardTooltip')
                return (
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onEdit(user)}
                        disabled={!manageable}
                        title={guardTitle}
                        className="!text-xs !px-2.5 !py-1">
                        {t('security:users.actions.edit')}
                      </Button>
                      {/* SCRUM-724 — override puntual de visibilidad de módulos/ítems de
                          menú por usuario, por encima del rol. Mismo gate jerárquico que
                          Editar/Desactivar (nunca sobre alguien que el actor no gestiona). */}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onVisibility(user)}
                        disabled={!manageable}
                        title={guardTitle}
                        className="!text-xs !px-2.5 !py-1">
                        {t('security:users.actions.visibility')}
                      </Button>
                      {user.is_active ? (
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => onToggleStatus(user)}
                          disabled={!manageable}
                          title={guardTitle}
                          className="!text-xs !px-2.5 !py-1">
                          {t('security:users.actions.deactivate')}
                        </Button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onToggleStatus(user)}
                          disabled={!manageable}
                          title={guardTitle}
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                          {t('security:users.actions.activate')}
                        </button>
                      )}
                      {/* Reset MFA — solo superadmin.all, único procedimiento de soporte
                          soportado para rescatar a un usuario que perdió acceso a su
                          correo/dispositivo (ver SCRUM-2, QA 2026-07-05) */}
                      {actorHasSuperadmin && user.mfa_enabled && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onResetMfa(user)}
                          className="!text-xs !px-2.5 !py-1">
                          {t('security:users.actions.resetMfa')}
                        </Button>
                      )}
                    </div>
                  </td>
                )
              })()}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
