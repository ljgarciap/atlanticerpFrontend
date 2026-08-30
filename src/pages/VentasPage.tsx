import { useTranslation } from 'react-i18next'

export default function VentasPage() {
  const { t } = useTranslation('common')
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: '#f0fdf4' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9fc54d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
        </svg>
      </div>
      <h1 className="text-xl font-bold text-slate-800 mb-2">{t('nav.ventas')}</h1>
      <p className="text-slate-400 text-sm max-w-xs">{t('comingSoon', { module: t('nav.ventas') })}</p>
    </div>
  )
}
