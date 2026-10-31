import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { useSetupChecklist } from '@/hooks/useGerencia'

// Fase 16 (5.1) — pasos de primera puesta en marcha que faltan. Se oculta cuando todo está completo
// (o mientras carga / si falla: no es información crítica y no debe estorbar el inicio).
export default function SetupChecklistCard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data } = useSetupChecklist()

  if (!data || data.completo) return null
  const pendientes = data.pasos.filter(p => !p.completo)

  return (
    <Card className="p-5" data-testid="setup-checklist">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('common:setupChecklist.title')}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
        {t('common:setupChecklist.intro', { count: pendientes.length, total: data.pasos.length })}
      </p>
      <ul className="mt-3 space-y-2">
        {pendientes.map(p => (
          <li key={p.clave} className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
            <span>{t(`common:setupChecklist.steps.${p.clave}`)}</span>
            <button
              type="button"
              data-testid={`setup-step-${p.clave}`}
              onClick={() => navigate(p.ruta)}
              className="shrink-0 px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {t('common:setupChecklist.go')}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
