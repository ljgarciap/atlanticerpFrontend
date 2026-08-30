import { useTranslation } from 'react-i18next'
import type { TicketTechnician } from '@/types/servicios'

interface Props {
  technician: TicketTechnician | null
  size?:      number
}

// REQ-216 — columna Técnico: avatar+iniciales+nombre completo, o "Sin asignar". Mismo criterio
// de color determinístico por id que AssigneeAvatarStack (misma persona siempre el mismo color).
function initials(t: TicketTechnician): string {
  return (t.first_name[0] ?? '') + (t.last_name[0] ?? '')
}

function avatarBg(id: number): string {
  const hues = [196, 152, 262, 32, 344, 88, 220]
  const h = hues[id % hues.length] ?? 196
  return `hsl(${h} 55% 48%)`
}

export default function TechnicianBadge({ technician, size = 24 }: Props) {
  const { t } = useTranslation('servicios')

  if (!technician) {
    return <span className="text-slate-400 text-sm">{t('tickets.table.unassigned')}</span>
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        style={{
          width: size, height: size, borderRadius: '50%',
          background: avatarBg(technician.id),
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.4, fontWeight: 600, color: 'white',
          textTransform: 'uppercase', flexShrink: 0,
        }}
      >
        {initials(technician)}
      </span>
      <span className="text-sm text-slate-700 dark:text-slate-200">
        {technician.first_name} {technician.last_name}
      </span>
    </span>
  )
}
