/**
 * SCRUM-871 — estilo de contador numérico unificado para tarjetas de Home, en todos los módulos.
 * Referencia: el estilo "suave" ya usado en Compras (píldora pastel, texto en el mismo tono
 * oscuro) — reemplaza el estilo de círculo sólido con número blanco que tenía Servicios.
 */
export type CountBadgeTone = 'neutral' | 'warning' | 'critical'

const TONE_CLASSES: Record<CountBadgeTone, string> = {
  neutral:  'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  warning:  'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  critical: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400',
}

interface Props {
  count: number
  tone?: CountBadgeTone
  className?: string
}

export default function CountBadge({ count, tone = 'neutral', className = '' }: Props) {
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${TONE_CLASSES[tone]} ${className}`}>
      {count}
    </span>
  )
}
