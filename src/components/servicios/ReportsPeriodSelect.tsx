import { useTranslation } from 'react-i18next'
import type { ReportsPeriodParams } from '@/types/servicios'

interface Props {
  value:     ReportsPeriodParams
  onChange:  (value: ReportsPeriodParams) => void
}

// Pre-QA 2026-08-13 (recheck SCRUM-321) — mismo bug del rebote de QA, sin corregir acá: CSS
// `capitalize` title-cases CADA palabra ("Agosto De 2026"); acá solo la primera letra debe ir en
// mayúscula ("Agosto de 2026"). Mismo patrón ya usado en InternalTechnicianCommissionModal.tsx/
// InternalTechnicianCommissionResultModal.tsx/ReportsCommissionSection.tsx. Se capitaliza el
// label acá (no vía CSS) porque este helper alimenta <option>, cuyo soporte de text-transform
// varía por navegador — capitalizar el string en JS es la única forma confiable.
function periodLabel(year: number, month: number, locale: string): string {
  const formatted = new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

/**
 * REQ-280 RN — selector de período de Reportes: mes actual + 5 anteriores (6 opciones fijas),
 * mes/año concretos. Decisión de producto (ver docblock de ReportsPage.tsx): NUNCA la opción
 * "Últimos 3 meses" del mockup viejo — no hay regla de negocio definida para esa ventana, queda
 * en backlog. Autocontenido: genera sus propias opciones, no depende de un catálogo del backend.
 */
export default function ReportsPeriodSelect({ value, onChange }: Props) {
  const { i18n } = useTranslation('servicios')

  const now = new Date()
  const options = Array.from({ length: 6 }, (_, i) => {
    const zeroBased = now.getMonth() - i
    const year  = now.getFullYear() + Math.floor(zeroBased / 12)
    const month = ((zeroBased % 12) + 12) % 12 + 1
    const label = periodLabel(year, month, i18n.language)
    return { year, month, label }
  })

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const [year, month] = e.target.value.split('-').map(Number)
    onChange({ year, month })
  }

  return (
    <select
      value={`${value.year}-${value.month}`}
      onChange={handleChange}
      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 bg-white text-sm text-slate-700 focus:outline-none focus:border-primary"
    >
      {options.map(opt => (
        <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
