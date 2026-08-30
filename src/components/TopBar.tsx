import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/authApi'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '@/api/settingsApi'
import { applyTheme } from '@/hooks/useTheme'
import AppLogo from './AppLogo'
import LanguageSelector from './LanguageSelector'
import RoleSwitcher from './RoleSwitcher'
import ChangePasswordModal from './ChangePasswordModal'
import UserAvatar from './UserAvatar'
import EditProfileDrawer from './EditProfileDrawer'
import NotificationBell from './NotificationBell'
import { Button } from '@/components/ui/Button'
import { IcoSun, IcoMoon } from '@/components/icons'

interface Tab { id: string; label: string }

interface Props {
  moduleLabel:       string
  // SCRUM-711 — Dashboard y Seguridad (únicos tabs que existían) se eliminaron de la
  // barra superior; tabs queda como afordancia para el único consumidor (AppShell), que
  // hoy no pasa ninguno.
  tabs?:             Tab[]
  activeTab?:        string
  onTab?:            (id: string) => void
  backLink?:         { label: string; href: string }
  onSidebarToggle?:  () => void
}

export default function TopBar({ moduleLabel, tabs = [], activeTab, onTab, backLink, onSidebarToggle }: Props) {
  const { t } = useTranslation(['common', 'auth'])
  const { user, refreshToken, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [userMenuOpen,    setUserMenuOpen]    = useState(false)
  const [changePwOpen,    setChangePwOpen]    = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)

  // Fuente única de verdad: misma query key que SettingsPage y useTheme() —
  // react-query dedupea la petición, así que los 3 controles quedan sincronizados.
  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn:  settingsApi.getPreferences,
    enabled:  !!user,
  })
  const theme = prefs?.theme ?? 'light'

  const saveTheme = useMutation({
    mutationFn: (t: 'light' | 'dark') => settingsApi.updatePreferences({ theme: t }),
    onSuccess: (data) => qc.setQueryData(['preferences'], data),
  })

  const handleToggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    applyTheme(next)
    qc.setQueryData(['preferences'], (old: typeof prefs) => old ? { ...old, theme: next } : old)
    saveTheme.mutate(next)
  }

  const handleLogout = async () => {
    if (refreshToken) await authApi.logout(refreshToken)
    localStorage.removeItem('atlanticerp_theme')
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-3 flex items-center justify-between shadow-sm shrink-0 print:hidden">
        {/* Left — hamburger (móvil) + brand */}
        <div className="flex items-center gap-2">
          {onSidebarToggle && (
            <Button
              variant="icon"
              onClick={onSidebarToggle}
              className="lg:hidden -ml-1 mr-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Abrir menú">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="2" y="4"  width="16" height="2" rx="1" fill="currentColor" />
                <rect x="2" y="9"  width="16" height="2" rx="1" fill="currentColor" />
                <rect x="2" y="14" width="16" height="2" rx="1" fill="currentColor" />
              </svg>
            </Button>
          )}
          {/* Logo + brand: visible on mobile (sidebar is a drawer); hidden on desktop (sidebar shows it) */}
          <div className="flex items-center gap-2 lg:hidden">
            <AppLogo size={32} iconOnly />
            <span className="font-bold tracking-widest text-[#2a2520] dark:text-slate-100 text-sm">{t('common:brand')}</span>
          </div>
          {/* SCRUM-58 — antes decía "CRM" fijo en toda la app; ahora refleja el módulo
              (y la pantalla, para Ventas & Diseño) actual, ver AppShell::moduleLabel(). */}
          <span className="hidden lg:inline text-slate-500 dark:text-slate-400 font-semibold text-xs tracking-widest uppercase">{moduleLabel}</span>
        </div>

        {/* Right — role badge, tools, settings, avatar */}
        <div className="flex items-center gap-1.5 sm:gap-3 text-sm">
          {/* Role badge — oculto en xs para no desbordar */}
          <span className="hidden sm:inline-block px-2 py-0.5 rounded text-xs font-bold uppercase"
            style={{ background: '#d1ede9', color: '#1f6b66' }}>
            {user?.role ? t(`common:roles.${user.role}`, { defaultValue: user.role }) : ''}
          </span>
          {/* RoleSwitcher — oculto en xs (accesible desde menú avatar) */}
          <span className="hidden sm:flex"><RoleSwitcher /></span>
          {/* LanguageSelector — oculto en xs */}
          <span className="hidden sm:flex"><LanguageSelector /></span>

          {/* Notificaciones — siempre visible, incluso en xs */}
          <NotificationBell />

          {/* Theme toggle — oculto en xs (accesible desde menú avatar) */}
          <Button
            variant="icon"
            onClick={handleToggleTheme}
            title={theme === 'dark' ? t('common:theme.switchToLight') : t('common:theme.switchToDark')}
            className="hidden sm:flex min-h-[44px] min-w-[44px] items-center justify-center">
            {theme === 'dark' ? <IcoSun /> : <IcoMoon />}
          </Button>

          {/* Settings gear — oculto en xs (accesible desde menú avatar) */}
          <Button
            variant="icon"
            onClick={() => navigate('/settings')}
            title={t('common:nav.settings')}
            className="hidden sm:flex min-h-[44px] min-w-[44px] items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            </svg>
          </Button>

          {/* Avatar with dropdown */}
          <div className="relative">
            <Button
              variant="icon"
              onClick={() => setUserMenuOpen(o => !o)}
              className="flex items-center gap-1 min-h-[44px] min-w-[44px] justify-center focus:outline-none">
              <UserAvatar size={32} />
              <span className="text-slate-400 text-xs">▾</span>
            </Button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 min-w-[200px]">
                  {user && (
                    <div className="px-4 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100 mb-1">
                      {user.first_name} {user.last_name}
                    </div>
                  )}
                  {/* RoleSwitcher inline — solo visible en xs donde el header lo oculta */}
                  <div className="sm:hidden px-4 py-1.5 border-b border-slate-100">
                    <RoleSwitcher />
                  </div>
                  {/* LanguageSelector inline — solo visible en xs donde el header lo oculta */}
                  <div className="sm:hidden px-4 py-1.5 border-b border-slate-100">
                    <LanguageSelector />
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); setEditProfileOpen(true) }}
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium">
                    {t('auth:profile.title')}
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); setChangePwOpen(true) }}
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium">
                    {t('auth:changePassword.title')}
                  </button>
                  {/* Theme toggle — visible siempre en el dropdown */}
                  <button
                    onClick={() => { handleToggleTheme(); setUserMenuOpen(false) }}
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium flex items-center gap-2">
                    {theme === 'dark' ? <IcoSun /> : <IcoMoon />}
                    {theme === 'dark' ? t('common:theme.light') : t('common:theme.dark')}
                  </button>
                  {/* Settings — solo visible en xs donde el botón del header está oculto */}
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/settings') }}
                    className="sm:hidden w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium">
                    {t('common:nav.settings')}
                  </button>
                  <hr className="my-1 border-slate-100" />
                  <button onClick={() => { setUserMenuOpen(false); void handleLogout() }}
                    className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 font-medium">
                    {t('common:actions.logout')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {(tabs.length > 0 || backLink) && (
        <nav className="relative bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-3 sm:px-6 flex items-center gap-1 py-1.5 overflow-x-auto shrink-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {tabs.map(tab => (
            <Button
              key={tab.id}
              variant="outline"
              active={activeTab === tab.id}
              onClick={() => onTab?.(tab.id)}
              className="!px-3.5 !py-2 !text-xs sm:!text-[13px] whitespace-nowrap">
              {tab.label}
            </Button>
          ))}
          {backLink && (
            <>
              <span className="ml-auto h-4 w-px bg-slate-200" />
              <Button
                variant="ghost"
                onClick={() => navigate(backLink.href)}
                className="!text-slate-400 dark:!text-slate-500 hover:!text-slate-600 dark:hover:!text-slate-300 !font-medium !text-[13px] whitespace-nowrap">
                {backLink.label}
              </Button>
            </>
          )}
        </nav>
      )}

      {changePwOpen && <ChangePasswordModal onClose={() => setChangePwOpen(false)} />}
      {editProfileOpen && <EditProfileDrawer onClose={() => setEditProfileOpen(false)} />}
    </>
  )
}
