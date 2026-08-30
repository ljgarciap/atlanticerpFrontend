import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { AlertProject, KpiData } from '@/types/project'
import { Button } from '@/components/ui/Button'

interface Props { kpis: KpiData }

const PREVIEW_COUNT = 3

function previewText(names: string[]): string {
  const shown = names.slice(0, PREVIEW_COUNT).join(' · ')
  return names.length > PREVIEW_COUNT ? `${shown}...` : shown
}

function buildMailto(
  t: TFunction,
  type: 'overdue' | 'upcoming',
  projects: AlertProject[],
  managementEmails: string[],
): string {
  const recipients = Array.from(new Set([
    ...projects.flatMap(p => p.assignees.map(a => a.email).filter((e): e is string => !!e)),
    ...managementEmails,
  ]))

  const subject = type === 'overdue'
    ? t('crm:alerts.mailSubjectOverdue', { count: projects.length })
    : t('crm:alerts.mailSubjectUpcoming', { count: projects.length })

  let body = `${type === 'overdue' ? t('crm:alerts.mailIntroOverdue') : t('crm:alerts.mailIntroUpcoming')}\n\n`

  for (const p of projects) {
    const dias = p.dias ?? 0
    const diasText = dias < 0
      ? t('crm:alerts.mailOverdueBy', { days: Math.abs(dias) })
      : t('crm:alerts.mailDaysRemaining', { days: dias })
    const designers = p.assignees.map(a => a.name).join(', ') || '—'

    body += `• ${p.nombre}\n`
    body += `  ${t('crm:alerts.mailClient')}: ${p.contacto ?? '—'} | ${t('crm:alerts.mailDesigners')}: ${designers}\n`
    body += `  ${t('crm:alerts.mailStage')}: ${t(`crm:stages.${p.etapa}`)} | ${diasText}\n`
    body += `  ${t('crm:alerts.mailDate')}: ${p.fecha_entrega ?? '—'}\n\n`
  }

  body += `\n${t('crm:alerts.mailActionRequired')}\n\n${t('crm:alerts.mailSignature')}`

  return `mailto:${encodeURIComponent(recipients.join(','))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export default function AlertBanner({ kpis }: Props) {
  const { t } = useTranslation(['crm'])

  return (
    <div className="space-y-2 mb-4">
      {kpis.alerts_vencidos > 0 && (
        <div className="flex justify-between items-center gap-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3.5">
          <div className="min-w-0">
            <p className="font-medium text-red-800 dark:text-red-300 text-sm">
              {t('crm:alerts.overdueTitle', { count: kpis.alerts_vencidos })}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400/80 truncate mt-0.5">
              {previewText(kpis.alerts_vencidos_projects.map(p => p.nombre))}
            </p>
          </div>
          <Button
            variant="danger"
            className="!text-xs !px-3 !py-1.5 shrink-0"
            onClick={() => { window.location.href = buildMailto(t, 'overdue', kpis.alerts_vencidos_projects, kpis.management_emails) }}
          >
            {t('crm:alerts.sendReminders')}
          </Button>
        </div>
      )}
      {kpis.alerts_proximos > 0 && (
        <div className="flex justify-between items-center gap-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3.5">
          <div className="min-w-0">
            <p className="font-medium text-amber-800 dark:text-amber-300 text-sm">
              {t('crm:alerts.upcomingTitle', { count: kpis.alerts_proximos })}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400/80 truncate mt-0.5">
              {previewText(kpis.alerts_proximos_projects.map(p => `${p.nombre} (${p.dias ?? 0}d)`))}
            </p>
          </div>
          <Button
            variant="outline"
            className="!text-xs !px-3 !py-1.5 shrink-0 !border-amber-300 !text-amber-700 dark:!text-amber-400"
            onClick={() => { window.location.href = buildMailto(t, 'upcoming', kpis.alerts_proximos_projects, kpis.management_emails) }}
          >
            {t('crm:alerts.sendReminders')}
          </Button>
        </div>
      )}
      {kpis.alerts_frios > 0 && (
        <div className="flex justify-between items-center bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl px-4 py-3.5">
          <div className="min-w-0">
            <p className="font-medium text-sky-800 dark:text-sky-300 text-sm">
              {t('crm:alerts.coldTitle', { count: kpis.alerts_frios })}
            </p>
            <p className="text-xs text-sky-600 dark:text-sky-400/80 truncate mt-0.5">
              {previewText(kpis.alerts_frios_projects.map(p => p.nombre))}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
