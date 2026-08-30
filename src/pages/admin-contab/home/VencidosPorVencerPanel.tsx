import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { useHomeVencidosPorVencer } from '@/hooks/useAdminContab'
import type { HomeVencidoRow, HomePorVencerRow } from '@/types/adminContab'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

/**
 * Batch Home (SCRUM-503→512), Grupo 4 (SCRUM-511, REQ-434) — "Vencidos y por vencer" de "Inicio".
 * 2 secciones: "Vencidos" (dias_vencido, siempre > 0) y "Por vencer" (dias_para_vencer, 0 = "vence
 * hoy" — texto distinto de "vence en N días", RN2/RN3 del ticket).
 */
export default function VencidosPorVencerPanel() {
  const { t } = useTranslation(['adminContab'])
  const { data, isLoading } = useHomeVencidosPorVencer()

  const vencidos = data?.vencidos ?? []
  const porVencer = data?.por_vencer ?? []

  return (
    <Card variant="panel" className="p-4">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
        {t('adminContab:home.vencidosPorVencer.title')}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Section
          title={t('adminContab:home.vencidosPorVencer.vencidos.title')}
          empty={t('adminContab:home.vencidosPorVencer.vencidos.empty')}
          isLoading={isLoading}
          rows={vencidos}
          renderRow={row => (
            <Row
              key={row.numero}
              numero={row.numero}
              cliente={row.cliente}
              monto={row.monto}
              texto={t('adminContab:home.vencidosPorVencer.vencidos.texto', { dias: row.dias_vencido })}
              tone="text-red-600 dark:text-red-400"
            />
          )}
        />
        <Section
          title={t('adminContab:home.vencidosPorVencer.porVencer.title')}
          empty={t('adminContab:home.vencidosPorVencer.porVencer.empty')}
          isLoading={isLoading}
          rows={porVencer}
          renderRow={row => (
            <Row
              key={row.numero}
              numero={row.numero}
              cliente={row.cliente}
              monto={row.monto}
              texto={row.dias_para_vencer === 0
                ? t('adminContab:home.vencidosPorVencer.porVencer.hoy')
                : t('adminContab:home.vencidosPorVencer.porVencer.texto', { dias: row.dias_para_vencer })}
              tone="text-amber-600 dark:text-amber-400"
            />
          )}
        />
      </div>
    </Card>
  )
}

function Section<T extends HomeVencidoRow | HomePorVencerRow>(
  { title, empty, isLoading, rows, renderRow }:
  { title: string; empty: string; isLoading: boolean; rows: T[]; renderRow: (row: T) => ReactNode },
) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
        {title}
      </div>
      {!isLoading && rows.length === 0 && (
        <div className="text-xs text-slate-400">{empty}</div>
      )}
      <ul className="space-y-2">
        {rows.map(row => renderRow(row))}
      </ul>
    </div>
  )
}

function Row(
  { numero, cliente, monto, texto, tone }:
  { numero: string; cliente: string; monto: number; texto: string; tone: string },
) {
  return (
    <li className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{numero}</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{cliente}</div>
        <div className={`text-[11px] font-medium ${tone}`}>{texto}</div>
      </div>
      <div className="text-[13px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
        {formatCurrency(monto)}
      </div>
    </li>
  )
}
