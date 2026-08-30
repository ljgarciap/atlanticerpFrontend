import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { BodegaReportPeriodKey } from '@/types/bodega'

/**
 * SCRUM-490 (REQ-420 RN1) — "el período seleccionado aplica a los 4 reportes de la pantalla a la
 * vez, no individualmente". Estado elevado a un contexto compartido en vez de duplicar un
 * `useState` por tarjeta — las 4 (`ProductivityReportCard`/`AdjustmentAccuracyReportCard`/
 * `WarehouseCapacityReportCard`/`InventorySummaryReportCard`) consumen el mismo `period` y se
 * recalculan juntas cuando cambia (Escenario 1 del ticket).
 */
interface ReportPeriodContextValue {
  period:    BodegaReportPeriodKey
  setPeriod: (period: BodegaReportPeriodKey) => void
}

const ReportPeriodContext = createContext<ReportPeriodContextValue | null>(null)

export function ReportPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<BodegaReportPeriodKey>('month')

  return (
    <ReportPeriodContext.Provider value={{ period, setPeriod }}>
      {children}
    </ReportPeriodContext.Provider>
  )
}

export function useReportPeriod(): ReportPeriodContextValue {
  const ctx = useContext(ReportPeriodContext)
  if (ctx === null) {
    throw new Error('useReportPeriod debe usarse dentro de <ReportPeriodProvider>')
  }

  return ctx
}
