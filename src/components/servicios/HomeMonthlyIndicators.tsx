import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoPencil } from '@/components/icons'
import { useAuthStore } from '@/store/authStore'
import InstallationGoalModal from './InstallationGoalModal'
import type { HomeIndicadoresMes } from '@/types/servicios'

interface Props {
  data: HomeIndicadoresMes | undefined
}

// REQ-211 RN2a(c) — solo Gerencia puede sobrescribir la meta del mes (mismo gate que el backend,
// `role:superadmin,management` en routes/servicios.php). Oculto por completo para el resto, no
// deshabilitado — es una acción, no un umbral que todo el equipo deba poder consultar (a
// diferencia de ServiciosSettingsPage).
function canEditGoal(role: string | undefined): boolean {
  return role === 'superadmin' || role === 'management'
}

function formatPct(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

function formatDays(value: number | null, unit: string): string {
  return value === null ? '—' : `${value} ${unit}`
}

function formatMoney(value: number | null): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

// REQ-211 — panel "Indicadores del mes" de Inicio. RN1: visible para todo el equipo, sin gate
// propio. RN2a — `meta_source` explica de dónde sale la meta mostrada (nunca un número sin
// contexto): manual_default (< 3 meses de historial real), calculated (promedio de los últimos N
// meses × el % de crecimiento configurado) o manual_override (Gerencia ajustó este mes puntual).
export default function HomeMonthlyIndicators({ data }: Props) {
  const { t }  = useTranslation('servicios')
  const qc     = useQueryClient()
  const user   = useAuthStore(s => s.user)
  const editable = canEditGoal(user?.role)
  const [goalModalOpen, setGoalModalOpen] = useState(false)

  const instalaciones = data?.instalaciones
  const progresoPct   = instalaciones ? Math.min(100, instalaciones.progreso_pct) : 0

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1

  return (
    <Card variant="panel" className="p-4">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">{t('home.indicators.title')}</h2>

      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="text-slate-600 dark:text-slate-300">{t('home.indicators.installations.label')}</span>
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {instalaciones ? `${instalaciones.completadas} / ${instalaciones.meta}` : '—'}
            </span>
            {editable && instalaciones && (
              <Button
                variant="icon"
                className="!p-1"
                title={t('home.indicators.goalModal.title')}
                onClick={() => setGoalModalOpen(true)}
              >
                <IcoPencil size={13} />
              </Button>
            )}
          </span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progresoPct}%` }}
          />
        </div>
        {instalaciones && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {t(`home.indicators.installations.metaSource.${instalaciones.meta_source}`)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 py-2.5 px-2">
          <span className="block text-base font-bold text-slate-800 dark:text-slate-100">
            {formatPct(data?.resuelto_primera_visita_pct ?? null)}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{t('home.indicators.firstVisitRate')}</span>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 py-2.5 px-2">
          <span className="block text-base font-bold text-slate-800 dark:text-slate-100">
            {formatDays(data?.tiempo_promedio_resolucion_dias ?? null, t('home.indicators.days'))}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{t('home.indicators.avgResolutionTime')}</span>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 py-2.5 px-2">
          <span className="block text-base font-bold text-slate-800 dark:text-slate-100">
            {data?.ingresos_instalaciones.available ? formatMoney(data.ingresos_instalaciones.value) : '—'}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{t('home.indicators.installationsRevenue')}</span>
        </div>
      </div>

      {goalModalOpen && instalaciones && (
        <InstallationGoalModal
          year={year}
          month={month}
          currentValue={instalaciones.meta}
          onClose={() => setGoalModalOpen(false)}
          onSaved={() => {
            setGoalModalOpen(false)
            void qc.invalidateQueries({ queryKey: ['servicios-home-summary'] })
          }}
        />
      )}
    </Card>
  )
}
