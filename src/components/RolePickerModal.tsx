import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/authApi'
import { getHomeRoute } from '@/lib/homeRoute'
import type { Role } from '@/types/auth'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { IcoChevronLeft } from '@/components/icons'

const ROLE_DESCRIPTIONS: Record<Role, { es: string; en: string }> = {
  superadmin:   { es: 'Control total del sistema',                      en: 'Full system control' },
  management:   { es: 'Gestión comercial y supervisión de proyectos',   en: 'Commercial management and project oversight' },
  designer:     { es: 'Flujo de trabajo de diseño y proyectos CRM',     en: 'Design workflow and CRM projects' },
  supervisor:   { es: 'Supervisión de campo y coordinación de equipo',  en: 'Field supervision and team coordination' },
  electrician:  { es: 'Asignaciones de instalación y casos de trabajo', en: 'Installation assignments and work cases' },
}

export default function RolePickerModal() {
  const { t, i18n } = useTranslation(['auth', 'common'])
  const navigate    = useNavigate()
  const { pendingRoleSelection, setAuth, clearPendingSelection } = useAuthStore()
  const [loading, setLoading] = useState<Role | null>(null)
  const [error, setError]     = useState('')

  if (!pendingRoleSelection) return null

  const { selectionToken, availableRoles } = pendingRoleSelection
  const lang = i18n.language.startsWith('en') ? 'en' : 'es'

  const handleSelect = async (role: Role) => {
    setLoading(role)
    setError('')
    try {
      const res = await authApi.selectRole(selectionToken, role)
      setAuth(res.user, res.accessToken, res.refreshToken)
      // SCRUM-175 — mismo criterio que LoginPage: '/dashboard' ya no existe (SCRUM-711).
      navigate(getHomeRoute(res.user), { replace: true })
    } catch {
      setError(t('auth:rolePicker.error', { defaultValue: 'Could not complete login. Try again.' }))
      setLoading(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#fafaf7] dark:bg-slate-900">
      <Card variant="modal-auth" className="w-full max-w-md p-8">
        <h2 className="text-xl font-bold text-center mb-1 text-[#2a2520] dark:text-slate-100">
          {t('auth:rolePicker.title')}
        </h2>
        <p className="text-sm text-slate-400 text-center mb-6">
          {t('auth:rolePicker.subtitle')}
        </p>

        <div className="flex flex-col gap-3">
          {availableRoles.map(role => {
            const isLoading = loading === role
            return (
              <button
                key={role}
                onClick={() => handleSelect(role)}
                disabled={loading !== null}
                className={cn(
                  'flex items-center gap-4 px-4 py-3 rounded-xl border-2 text-left transition-all disabled:opacity-60',
                  isLoading
                    ? 'border-accent bg-accent/10 dark:bg-accent/20'
                    : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/40 hover:border-primary dark:hover:border-primary-light'
                )}
              >
                <div className="flex-1">
                  <p className="font-semibold text-sm text-[#2a2520] dark:text-slate-100">
                    {t(`common:roles.${role}`, { defaultValue: role })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {ROLE_DESCRIPTIONS[role]?.[lang] ?? ''}
                  </p>
                </div>
                {isLoading && (
                  <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                )}
              </button>
            )
          })}
        </div>

        {error && (
          <p className="text-red-500 text-xs text-center mt-4">{error}</p>
        )}

        <button
          onClick={clearPendingSelection}
          disabled={loading !== null}
          className="w-full mt-4 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition disabled:opacity-40 inline-flex items-center justify-center gap-1">
          <IcoChevronLeft size={11} /> {t('common:actions.cancel')}
        </button>
      </Card>
    </div>
  )
}
