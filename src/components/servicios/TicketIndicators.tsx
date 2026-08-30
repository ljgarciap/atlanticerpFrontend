import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { QuoteDisplayStatus, InspectionReportStatus } from '@/types/servicios'
import { IcoLock } from '@/components/icons'

export type ClaimSheetIndicatorStatus = 'pending' | 'completed'

const QUOTE_BADGE_CLASSES: Record<Exclude<QuoteDisplayStatus, null>, string> = {
  not_applicable: 'text-slate-400',
  locked:         'text-amber-600 dark:text-amber-400',
  draft:          'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  sent:           'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  approved:       'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  rejected:       'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
}

interface QuoteIndicatorProps {
  status:      QuoteDisplayStatus
  amount?:     number | null
  showAmount?: boolean
  onOpen?:     () => void
}

// REQ-219 — Indicador de Cotización. Recibe el estado YA RESUELTO (ver `deriveQuoteDisplayStatus`
// en types/servicios.ts) — nunca el `quote_status` crudo del backend, que por sí solo no alcanza
// para distinguir "bloqueada" de "lista para generar" (ambas son `pending` en la base de datos).
// Batch 11 — "Generar cotización" (status === null) y el resto de estados generados abren
// ServiceQuoteModal vía `onOpen` (antes de este batch eran placeholders deshabilitados, el módulo
// no existía todavía).
export function QuoteIndicator({ status, amount, showAmount, onOpen }: QuoteIndicatorProps) {
  const { t } = useTranslation('servicios')
  const [explain, setExplain] = useState(false)

  if (status === 'not_applicable') {
    return <span className={QUOTE_BADGE_CLASSES.not_applicable}>{t('tickets.quote.notApplicable')}</span>
  }

  if (status === 'locked') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExplain(v => !v)}
          className={`inline-flex items-center gap-1 text-sm font-medium ${QUOTE_BADGE_CLASSES.locked}`}
        >
          <IcoLock size={12} />
          {t('tickets.quote.locked')}
        </button>
        {explain && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-[180px]">
            {t('tickets.quote.lockedTooltip')}
          </p>
        )}
      </div>
    )
  }

  if (status === null) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="text-xs font-semibold text-primary underline decoration-dotted hover:opacity-80"
      >
        {t('tickets.quote.generate')}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onOpen}
        className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold hover:opacity-80 ${QUOTE_BADGE_CLASSES[status]}`}
      >
        {t(`tickets.quote.${status}`)}
      </button>
      {showAmount && amount != null && (
        <span className="text-[11px] text-slate-500 dark:text-slate-400">${amount.toLocaleString()}</span>
      )}
    </div>
  )
}

interface InspectionReportIndicatorProps {
  status: InspectionReportStatus
  onOpen?: () => void
}

// REQ-220/REQ-238 (Batch 8) — Indicador de Informe de Inspección. `onOpen` abre
// InspectionReportModal — "Generar informe" (pending) y el badge "Completado" son clickeables por
// igual (RN5 REQ-238: editable después de Completado). El valor de `status` nunca se hardcodea por
// tipo en el frontend — para Reclamos el backend decide qué devolver (ver types/servicios.ts).
export function InspectionReportIndicator({ status, onOpen }: InspectionReportIndicatorProps) {
  const { t } = useTranslation('servicios')

  if (status === 'not_applicable') {
    return <span className="text-slate-400">{t('tickets.inspectionReport.notApplicable')}</span>
  }

  if (status === 'completed') {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:opacity-80"
      >
        {t('tickets.inspectionReport.completed')}
      </button>
    )
  }

  // pending
  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-xs font-semibold text-primary underline decoration-dotted hover:opacity-80"
    >
      {t('tickets.inspectionReport.generate')}
    </button>
  )
}

interface ClaimSheetIndicatorProps {
  status: ClaimSheetIndicatorStatus | undefined
  onOpen?: () => void
}

// REQ-278 (Batch 9) — Indicador de Hoja de Reclamo, mismo patrón que InspectionReportIndicator
// (REQ-220 RN1: Reclamos usa esta hoja en vez de Informe de Inspección — nunca ambas a la vez).
// `status` llega `undefined` mientras el query de la hoja está en vuelo — se trata igual que
// "pending" para no bloquear el botón de generar.
export function ClaimSheetIndicator({ status, onOpen }: ClaimSheetIndicatorProps) {
  const { t } = useTranslation('servicios')

  if (status === 'completed') {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 hover:opacity-80"
      >
        {t('tickets.claimSheet.completed')}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-xs font-semibold text-primary underline decoration-dotted hover:opacity-80"
    >
      {t('tickets.claimSheet.generate')}
    </button>
  )
}
