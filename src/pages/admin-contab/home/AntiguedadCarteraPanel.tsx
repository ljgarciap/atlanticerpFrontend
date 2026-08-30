import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { useInvoiceAging } from '@/hooks/useAdminContab'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

/**
 * Batch Home (SCRUM-503→512), Grupo 4 (SCRUM-512, REQ-435) — "Antigüedad de cuentas por cobrar"
 * de "Inicio". RN1 del ticket: misma fuente que Facturación → "Antigüedad de cartera" (reusa
 * `useInvoiceAging()` tal cual, sin endpoint propio — ver `AgingPanel` en FacturacionPage.tsx).
 * RN4: el último rango (hasta_dias === null, "+90 días") se destaca visualmente acá — Facturación
 * no lo hace hoy, Home sí lo exige.
 */
export default function AntiguedadCarteraPanel() {
  const { t } = useTranslation(['adminContab'])
  const { data } = useInvoiceAging()
  const ranges = data?.ranges ?? []

  return (
    <Card variant="panel" className="p-4">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
        {t('adminContab:home.antiguedad.title')}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ranges.map((r, i) => {
          const isLast = i === ranges.length - 1 && r.hasta_dias === null
          return (
            <div
              key={r.desde_dias}
              className={`rounded-lg border p-3 ${
                isLast
                  ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20'
                  : 'border-slate-100 dark:border-slate-700'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                {r.hasta_dias === null
                  ? t('adminContab:facturacion.aging.masDe', { desde: r.desde_dias })
                  : t('adminContab:facturacion.aging.rango', { desde: r.desde_dias, hasta: r.hasta_dias })}
              </div>
              <div className={`text-lg font-bold ${isLast ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                {formatCurrency(r.monto)}
              </div>
              <div className="text-[10.5px] text-slate-400 mt-0.5">
                {t('adminContab:facturacion.aging.cantidad', { cantidad: r.cantidad })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
