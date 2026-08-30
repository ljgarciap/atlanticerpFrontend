import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function SessionExpiredModal() {
  const { t }            = useTranslation('common')
  const navigate         = useNavigate()
  const { sessionExpired, setSessionExpired } = useAuthStore()

  if (!sessionExpired) return null

  const handleGoToLogin = () => {
    setSessionExpired(false)
    navigate('/login', { replace: true })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <Card variant="modal" className="w-full max-w-sm p-8 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: '#fff5f5' }}>
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-slate-800 mb-2">
          {t('messages.sessionExpiredTitle')}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {t('messages.sessionExpiredBody')}
        </p>

        <Button onClick={handleGoToLogin} className="w-full">
          {t('messages.sessionExpiredCta')}
        </Button>
      </Card>
    </div>
  )
}
