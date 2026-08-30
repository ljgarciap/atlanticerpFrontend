import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '@/api/settingsApi'
import { useAuthStore } from '@/store/authStore'

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('atlanticerp_theme', theme)
}

export { applyTheme }

export function useTheme() {
  const user = useAuthStore(s => s.user)
  const qc   = useQueryClient()

  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn:  settingsApi.getPreferences,
    enabled:  !!user,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (prefs?.theme) applyTheme(prefs.theme)
  }, [prefs?.theme])

  // Sincroniza el tema entre pestañas del mismo navegador: 'storage' solo
  // dispara en OTRAS pestañas, nunca en la que hizo el cambio.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'atlanticerp_theme' || !e.newValue) return
      const next = e.newValue as 'light' | 'dark'
      document.documentElement.classList.toggle('dark', next === 'dark')
      qc.setQueryData(['preferences'], (old: typeof prefs) => old ? { ...old, theme: next } : old)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [qc])
}
