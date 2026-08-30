import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import i18n from '@/i18n'
import { settingsApi, type UserPreferences } from '@/api/settingsApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'

const LANGUAGES: { code: 'es' | 'en'; label: string }[] = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
]

// Misma fuente única de verdad que el toggle de tema en TopBar — el idioma
// elegido acá persiste a BD de inmediato, sin un nivel intermedio de "override
// de sesión" (consistente con cómo ya funciona el tema, ver SCRUM-36).
export default function LanguageSelector() {
  const user       = useAuthStore(s => s.user)
  const updateUser = useAuthStore(s => s.updateUser)
  const qc         = useQueryClient()

  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn:  settingsApi.getPreferences,
    enabled:  !!user,
  })
  const current = prefs?.language ?? 'es'

  const saveLanguage = useMutation({
    mutationFn: (lang: 'es' | 'en') => settingsApi.updatePreferences({ language: lang }),
    onSuccess: (data) => {
      qc.setQueryData(['preferences'], data)
      // Mantiene sincronizado el store de auth persistido — sin esto,
      // user.language queda desactualizado hasta el próximo login.
      if (user) updateUser({ ...user, language: data.language })
    },
  })

  const setLang = (code: 'es' | 'en') => {
    if (code === current) return
    void i18n.changeLanguage(code)
    localStorage.setItem('atlanticerp_lang', code)
    qc.setQueryData(['preferences'], (old: UserPreferences | undefined) => old ? { ...old, language: code } : old)
    saveLanguage.mutate(code)
  }

  return (
    <div className="flex items-center rounded-md overflow-hidden border border-slate-200 text-[11px] font-bold select-none">
      {LANGUAGES.map(lang => (
        <Button
          key={lang.code}
          variant="outline"
          active={current === lang.code}
          onClick={() => setLang(lang.code)}
          className="!rounded-none !border-0 !px-2 !py-1 !text-[11px] !font-bold"
        >
          {lang.label}
        </Button>
      ))}
    </div>
  )
}
