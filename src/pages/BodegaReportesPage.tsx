import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ReportPeriodProvider, useReportPeriod } from '@/components/bodega/ReportPeriodContext'
import ProductivityReportCard from '@/components/bodega/ProductivityReportCard'
import AdjustmentAccuracyReportCard from '@/components/bodega/AdjustmentAccuracyReportCard'
import WarehouseCapacityReportCard from '@/components/bodega/WarehouseCapacityReportCard'
import InventorySummaryReportCard from '@/components/bodega/InventorySummaryReportCard'
import type { BodegaReportPeriodKey } from '@/types/bodega'

const PERIODS: BodegaReportPeriodKey[] = ['month', 'quarter', 'year']

/**
 * Formatea el período de reporte actualmente seleccionado en un string legible.
 * Ej: "Junio 2026" para mes, "Q3 2026 (jul-sep)" para trimestre, "2026" para año.
 */
function formatReportPeriod(period: BodegaReportPeriodKey): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  switch (period) {
    case 'month':
      return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(now)
    case 'quarter': {
      const q = Math.floor(month / 3) + 1
      const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
      const startMonth = (q - 1) * 3
      const endMonth = q * 3 - 1
      return `Q${q} ${year} (${months[startMonth]}-${months[endMonth]})`
    }
    case 'year':
      return `${year}`
  }
}

/**
 * SCRUM-490→495 (REQ-420→425, epic SCRUM-329) — "Reportes de Bodega": encabezado + selector de
 * período (SCRUM-490) que las 4 tarjetas (SCRUM-491→494) consumen vía `ReportPeriodContext` —
 * RN1 de REQ-420: el período aplica a los 4 reportes a la vez, no individualmente. Las tarjetas
 * navegan a su pantalla real al hacer clic (SCRUM-495/REQ-425).
 */
function PeriodLabel() {
  const { period } = useReportPeriod()

  return (
    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
      {formatReportPeriod(period)}
    </p>
  )
}

function PeriodToggle() {
  const { t } = useTranslation('bodega')
  const { period, setPeriod } = useReportPeriod()

  return (
    <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden w-fit">
      {PERIODS.map(p => (
        <Button
          key={p} variant="secondary" active={period === p} activeVariant="primary"
          className="!rounded-none !border-0" onClick={() => setPeriod(p)}
        >
          {t(`reports.period.${p}`)}
        </Button>
      ))}
    </div>
  )
}

function BodegaReportesContent() {
  const { t } = useTranslation('bodega')

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('reports.title')}</h1>
          <PeriodLabel />
        </div>
      </div>

      <Card variant="panel" className="p-3 mb-4 w-fit">
        <PeriodToggle />
      </Card>

      <div className="flex flex-col gap-4">
        <ProductivityReportCard />
        <AdjustmentAccuracyReportCard />
        <WarehouseCapacityReportCard />
        <InventorySummaryReportCard />
      </div>
    </>
  )
}

export default function BodegaReportesPage() {
  return (
    <ReportPeriodProvider>
      <BodegaReportesContent />
    </ReportPeriodProvider>
  )
}
