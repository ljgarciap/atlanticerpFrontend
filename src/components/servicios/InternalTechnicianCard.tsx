import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { InternalTechnician } from '@/types/servicios'

interface Props {
  technician:      InternalTechnician
  onViewVisits:    (technician: InternalTechnician) => void
  onViewDetail:    (technician: InternalTechnician) => void
  onViewCommission?: (technician: InternalTechnician) => void
  canManageCommission?: boolean
  // Batch 10 (REQ-258 RN8/RN9) — distinto de canManageCommission: RN8 es "el propio técnico o
  // Gerencia ve el resultado calculado", nunca Aaron (que sí puede CAPTURAR sin ver el total).
  onViewCommissionResult?: (technician: InternalTechnician) => void
  canViewCommissionResult?: boolean
}

function initials(nombre: string): string {
  return nombre.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}

const STATUS_DOT: Record<InternalTechnician['estado'], string> = {
  available: 'bg-emerald-500',
  en_route:  'bg-amber-500',
  on_site:   'bg-blue-500',
  off:       'bg-slate-400',
}

// REQ-255 — tarjeta de Vista Equipo. RN1: color/avatar único (persistido, no calculado). RN2:
// etiqueta de especialidad. RN3: "Visitas hoy" clicable abre REQ-257. RN5: clic en nombre/avatar
// abre el detalle (teléfono/correo/especialidad).
export default function InternalTechnicianCard({
  technician: t, onViewVisits, onViewDetail, onViewCommission, canManageCommission,
  onViewCommissionResult, canViewCommissionResult,
}: Props) {
  const { i18n } = useTranslation('servicios')

  return (
    <Card variant="panel" className="p-4 flex flex-col gap-3">
      <button type="button" onClick={() => onViewDetail(t)} className="flex items-center gap-3 text-left">
        <span
          aria-hidden="true"
          style={{
            width: 40, height: 40, borderRadius: '50%', background: t.color,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: 'white', flexShrink: 0,
          }}
        >
          {initials(t.nombre)}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-slate-900 dark:text-slate-100 truncate">{t.nombre}</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[t.estado]}`} />
            {i18n.t(`servicios:technicians.internal.status.${t.estado}`)}
            {' · '}
            {i18n.t(`servicios:technicians.internal.specialty.${t.especialidad}`)}
          </span>
        </span>
      </button>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <button
          type="button"
          onClick={() => onViewVisits(t)}
          className="rounded-lg bg-slate-50 dark:bg-slate-900 py-2 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="block text-base font-bold text-slate-800 dark:text-slate-100">{t.visitas_hoy}</span>
          {i18n.t('servicios:technicians.internal.card.visitsToday')}
        </button>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 py-2">
          <span className="block text-base font-bold text-slate-800 dark:text-slate-100">
            {t.pct_resuelto_primera_visita !== null ? `${t.pct_resuelto_primera_visita}%` : '—'}
          </span>
          {i18n.t('servicios:technicians.internal.card.firstVisitRate')}
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900 py-2">
          <span className="block text-base font-bold text-slate-800 dark:text-slate-100">{t.herramientas_asignadas}</span>
          {i18n.t('servicios:technicians.internal.card.tools')}
        </div>
      </div>

      {/* REQ-292 — solo el/los técnico(s) con plan de bonificación activo, y solo Aaron/Gerencia
          pueden abrir la captura mensual (RN5/RN8). */}
      {t.has_bonus_plan && canManageCommission && onViewCommission && (
        <Button variant="outline" className="!text-xs !py-1.5" onClick={() => onViewCommission(t)}>
          {i18n.t('servicios:technicians.internal.card.commission')}
        </Button>
      )}

      {/* Batch 10 (REQ-258 RN8/RN9) — mini-indicador del resultado calculado, exclusivo del
          propio técnico o Gerencia (nunca Aaron, ver docblock de canViewCommissionResult en
          InternalTechniciansPage). Botón separado del de arriba a propósito: son 2 audiencias
          distintas que pueden no solaparse (Aaron gestiona sin ver; Carlos ve sin gestionar). */}
      {t.has_bonus_plan && canViewCommissionResult && onViewCommissionResult && (
        <Button variant="outline" className="!text-xs !py-1.5" onClick={() => onViewCommissionResult(t)}>
          {i18n.t('servicios:technicians.internal.card.commissionResult')}
        </Button>
      )}
    </Card>
  )
}
