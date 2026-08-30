import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { IcoEye } from '@/components/icons'
import { useHomeResumenMes } from '@/hooks/useAdminContab'
import { formatDateShort } from '@/utils/dates'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

interface ResumenDelMesPanelProps {
  onVerReporte: () => void
}

/**
 * Batch Home (SCRUM-503→512), Grupo 1 (SCRUM-504→508, REQ-427→431) — "Resumen del mes" de
 * "Inicio". Monto grande (cobrado en el mes) + 3 stat-cards (cuentas al día / cartera por cobrar /
 * ventas de ayer) + 2 stat-cards de comisiones por pagar (internas/externas), mismo layout de dos
 * filas del mockup `4__Admin_Contabilidad_Home.html`.
 */
export default function ResumenDelMesPanel({ onVerReporte }: ResumenDelMesPanelProps) {
  const { t } = useTranslation(['adminContab'])
  const { data, isLoading } = useHomeResumenMes()

  return (
    <Card variant="panel" className="p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t('adminContab:home.resumenMes.title')}
        </div>
        {data && <div className="text-[11px] text-slate-400">{data.mes_label}</div>}
      </div>

      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary-dark">
            {isLoading || !data ? '—' : formatCurrency(data.total_cobrado_mes)}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t('adminContab:home.resumenMes.cobradoMes')}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <StatCard
          label={t('adminContab:home.resumenMes.cuentasAlDia.label')}
          value={isLoading || !data ? '—' : `${data.cuentas_al_dia.porcentaje}%`}
          sub={t('adminContab:home.resumenMes.cuentasAlDia.sub')}
        />
        <StatCard
          label={t('adminContab:home.resumenMes.carteraPorCobrar.label')}
          value={isLoading || !data ? '—' : formatCurrency(data.cartera_por_cobrar.monto)}
          valueClassName="text-amber-700 dark:text-amber-400"
          sub={isLoading || !data
            ? undefined
            : t('adminContab:home.resumenMes.carteraPorCobrar.sub', { incobrable: formatCurrency(data.cartera_por_cobrar.monto_incobrable_excluido) })}
        />
        <StatCard
          label={t('adminContab:home.resumenMes.ventasAyer.label')}
          value={isLoading || !data ? '—' : formatCurrency(data.ventas_de_ayer.monto)}
          valueClassName="text-primary-dark"
          sub={isLoading || !data
            ? undefined
            : t('adminContab:home.resumenMes.ventasAyer.sub', { count: data.ventas_de_ayer.cantidad, fecha: formatDateShort(data.ventas_de_ayer.fecha) })}
          action={
            <button
              type="button"
              onClick={onVerReporte}
              aria-label={t('adminContab:home.resumenMes.ventasAyer.verReporte')}
              title={t('adminContab:home.resumenMes.ventasAyer.verReporte')}
              className="absolute top-2.5 right-2.5 text-slate-400 hover:text-primary-dark"
            >
              <IcoEye size={15} />
            </button>
          }
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2.5">
        <StatCard
          label={t('adminContab:home.resumenMes.comisionesInternas.label')}
          value={isLoading || !data ? '—' : formatCurrency(data.comisiones_por_pagar.internas)}
          valueClassName="text-amber-700 dark:text-amber-400"
          sub={t('adminContab:home.resumenMes.comisionesInternas.sub')}
        />
        <StatCard
          label={t('adminContab:home.resumenMes.comisionesExternas.label')}
          value={isLoading || !data ? '—' : formatCurrency(data.comisiones_por_pagar.externas)}
          valueClassName="text-amber-700 dark:text-amber-400"
          sub={t('adminContab:home.resumenMes.comisionesExternas.sub')}
        />
      </div>
    </Card>
  )
}

function StatCard(
  { label, value, sub, valueClassName, action }:
  { label: string; value: string; sub?: string; valueClassName?: string; action?: ReactNode },
) {
  return (
    <div className="relative rounded-xl bg-slate-50 dark:bg-slate-900/40 px-3.5 py-3">
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</div>
      <div className={`text-xl font-semibold text-slate-900 dark:text-slate-100 ${valueClassName ?? ''}`}>{value}</div>
      {sub && <div className="text-[10.5px] text-slate-400 mt-1">{sub}</div>}
      {action}
    </div>
  )
}
