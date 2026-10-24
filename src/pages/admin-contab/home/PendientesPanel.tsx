import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import CountBadge from '@/components/ui/CountBadge'
import ShowMoreListModal from '@/components/ShowMoreListModal'
import { useHomePendientes } from '@/hooks/useAdminContab'
import { MAX_HOME_CARD_ITEMS } from '@/lib/homeCards'
import type { HomePendientesAlert } from '@/types/adminContab'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

const DOT_COLOR: Record<HomePendientesAlert['severidad'], string> = {
  alta:  'bg-red-500',
  media: 'bg-amber-500',
}

/**
 * Batch Home (SCRUM-503→512), Grupo 3 (SCRUM-510, REQ-433) — "Pendientes" de "Inicio". Badge con
 * `count` + lista de alertas auto-generadas por el backend (facturas vencidas sin pago, pagos
 * parciales sin completar, comisiones pendientes hace +10 días) — `titulo`/`detalle` ya vienen
 * armados del backend, este panel solo los renderiza con el punto de color por severidad.
 *
 * SCRUM-871 — cap de MAX_HOME_CARD_ITEMS + "Ver más" (antes sin límite); badge unificado al
 * estilo píldora pastel (antes círculo sólido rojo con texto blanco).
 */
export default function PendientesPanel() {
  const { t } = useTranslation(['adminContab'])
  const { data, isLoading } = useHomePendientes()

  const items = data?.items ?? []
  const [showAll, setShowAll] = useState(false)

  const renderRow = (item: HomePendientesAlert, i: number) => (
    <li key={`${item.tipo}-${item.fecha_referencia}-${i}`} className="flex items-start gap-2.5">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[item.severidad]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{item.titulo}</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.detalle}</div>
      </div>
      <div className="text-[13px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
        {formatCurrency(item.monto)}
      </div>
    </li>
  )

  return (
    <Card variant="panel" className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t('adminContab:home.pendientes.title')}
        </div>
        {!isLoading && data && data.count > 0 && <CountBadge count={data.count} tone="critical" />}
      </div>

      {!isLoading && items.length === 0 && (
        <div className="text-xs text-slate-400">{t('adminContab:home.pendientes.empty')}</div>
      )}

      <ul className="space-y-2.5">
        {items.slice(0, MAX_HOME_CARD_ITEMS).map((item, i) => renderRow(item, i))}
      </ul>
      {items.length > MAX_HOME_CARD_ITEMS && (
        <Button variant="secondary" className="!text-xs mt-3 w-full" onClick={() => setShowAll(true)}>
          {t('common:actions.viewMore')}
        </Button>
      )}

      {showAll && (
        <ShowMoreListModal
          title={t('adminContab:home.pendientes.title')}
          items={items}
          onClose={() => setShowAll(false)}
          renderItem={(item, i) => (
            <ul key={`${item.tipo}-${item.fecha_referencia}-${i}`} className="px-3 py-1">{renderRow(item, i)}</ul>
          )}
        />
      )}
    </Card>
  )
}
