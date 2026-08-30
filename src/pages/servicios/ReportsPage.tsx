import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReportsPeriodSelect from '@/components/servicios/ReportsPeriodSelect'
import ReportsPanoramaCards from '@/components/servicios/ReportsPanoramaCards'
import ReportsInstallationsCards from '@/components/servicios/ReportsInstallationsCards'
import ReportsTypeDonut from '@/components/servicios/ReportsTypeDonut'
import ReportsTechnicianBars from '@/components/servicios/ReportsTechnicianBars'
import ReportsYearlyChart from '@/components/servicios/ReportsYearlyChart'
import ReportsCommissionSection from '@/components/servicios/ReportsCommissionSection'
import ReportsLibraryTable from '@/components/servicios/ReportsLibraryTable'
import type { ReportsPeriodParams } from '@/types/servicios'

/**
 * Fase 4 — Servicios, Batch 17/18 (REQ-280→286, SCRUM-350→356). Página "Reportes".
 *
 * 2 decisiones de producto ya tomadas (no son hallazgos de esta tarea):
 * 1. "Documentos de satisfacción" (texto del mockup viejo) NO existe en el dominio real — solo
 *    "informes de inspección" y "hojas de reclamo" en todo el copy de esta pantalla.
 * 2. Selector de período: mes/año concreto (mes actual + 5 anteriores), NUNCA la opción
 *    "Últimos 3 meses" del mockup — sin regla de negocio definida, queda en backlog.
 *
 * `period` es un único estado compartido por los primeros 5 paneles (Panorama del mes,
 * Instalaciones cotizadas vs. realizadas, Distribución por tipo, Distribución por técnico,
 * Servicios completados en el año — este último usa solo `period.year`). La sección de comisión
 * de Carlos Vergara (REQ-286) tiene su propia navegación de período (calcada del modal de
 * resultado de comisión de Batch 10) y la biblioteca de documentos (REQ-280) no tiene período.
 */
export default function ServiciosReportsPage() {
  const { t } = useTranslation('servicios')

  const now = new Date()
  const [period, setPeriod] = useState<ReportsPeriodParams>({ year: now.getFullYear(), month: now.getMonth() + 1 })

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('reports.title')}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{t('reports.description')}</p>
        </div>
        <ReportsPeriodSelect value={period} onChange={setPeriod} />
      </div>

      <ReportsPanoramaCards period={period} />
      <ReportsInstallationsCards period={period} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <ReportsTypeDonut period={period} />
        <ReportsTechnicianBars period={period} />
      </div>

      <div className="mb-4">
        <ReportsYearlyChart year={period.year} />
      </div>

      <ReportsCommissionSection />

      <ReportsLibraryTable />
    </>
  )
}
