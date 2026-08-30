import type { TFunction } from 'i18next'
import type { ReceptionStatus } from '@/types/compras'

/**
 * REQ-145/158 — misma etiqueta de "Recepción" en Ver Órdenes (tabla + detalle por línea) y
 * Logística — un solo componente para no arriesgar 2 estilos/textos distintos para el mismo dato.
 */
const COLORS: Record<ReceptionStatus, string> = {
  pendiente: 'bg-slate-100 text-slate-500',
  parcial:    'bg-amber-100 text-amber-700',
  completo:   'bg-emerald-100 text-emerald-700',
}

export function ReceptionBadge({ status, t }: { status: ReceptionStatus; t: TFunction }) {
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${COLORS[status]}`}>
      {t(`compras:reception.status.${status}`)}
    </span>
  )
}
