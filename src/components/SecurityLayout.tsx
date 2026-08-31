import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { usePermission } from '@/hooks/usePermission'
import { Button } from '@/components/ui/Button'

interface Props { children: React.ReactNode }

export default function SecurityLayout({ children }: Props) {
  const { user }     = useAuthStore()
  const { t }        = useTranslation(['security', 'common'])
  const navigate     = useNavigate()
  const { pathname } = useLocation()

  // Pre-QA 2026-07-28 (SCRUM-713): estos 4 tabs estaban todos gateados por el mismo
  // check de rol (isSuperAdmin), pero las rutas reales en App.tsx exigen permisos
  // distintos entre sí -- un usuario management sin security.levels/superadmin.all
  // (ej. gerencia5@test.com) veía los 4 tabs clickeables y 3 lo redirigían en
  // silencio a /ventas-diseno/home. Cada tab ahora refleja el gate real de su ruta.
  const isDepartmentsRole = user?.role === 'superadmin' || user?.role === 'management' // matches RequireRole en App.tsx
  const canSeeLevels = usePermission('security.levels')
  const canSeeSuperadminOnly = usePermission('superadmin.all') // alerts, notification-rules, roles

  const tabs = [
    { id: 'users',  label: t('security:nav.users'),  href: '/security/users' },
    ...(canSeeLevels ? [{ id: 'levels', label: t('security:nav.levels'), href: '/security/levels' }] : []),
    ...(isDepartmentsRole ? [{ id: 'departments', label: t('security:nav.departments'), href: '/security/departments' }] : []),
    ...(canSeeSuperadminOnly ? [
      { id: 'alerts',      label: t('security:nav.alerts'),      href: '/security/alerts' },
      { id: 'notification-rules', label: t('security:nav.notificationRules'), href: '/security/notification-rules' },
      { id: 'roles', label: t('security:nav.roles'), href: '/security/roles' },
    ] : []),
  ]

  const activeTab = tabs.find(tab => pathname.startsWith(tab.href))?.id ?? 'users'

  return (
    <div>
      {/* Security sub-navigation */}
      <nav className="flex items-center gap-1 mb-6 -mt-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {tabs.map(tab => (
          <Button
            key={tab.id}
            variant="outline"
            active={activeTab === tab.id}
            onClick={() => navigate(tab.href)}
            className="!px-3.5 !py-2 !text-[13px] whitespace-nowrap">
            {tab.label}
          </Button>
        ))}
      </nav>
      {children}
    </div>
  )
}
