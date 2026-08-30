import { useTranslation } from 'react-i18next'
import { TICKET_STATUSES, TICKET_TYPES } from '@/types/servicios'
import type { TicketStatus, TicketType, TechnicianOption } from '@/types/servicios'

export interface TicketFilterState {
  search:                 string
  tipo:                   TicketType | ''
  internal_technician_id: number | ''
  estado:                 TicketStatus | ''
}

export const EMPTY_TICKET_FILTERS: TicketFilterState = {
  search: '', tipo: '', internal_technician_id: '', estado: '',
}

interface Props {
  value:        TicketFilterState
  onChange:     (value: TicketFilterState) => void
  technicians:  TechnicianOption[]
  shown:        number
  total:        number
}

// REQ-217 — buscador de texto libre + 3 selects (Tipo/Técnico/Estado), combinan con AND.
// A propósito NO hay fila de chips de Tipo redundante con el select (el mockup del cliente la
// traía; se elimina acá por instrucción explícita — no duplicar el mismo control dos veces).
export default function TicketFiltersBar({ value, onChange, technicians, shown, total }: Props) {
  const { t } = useTranslation('servicios')

  const hasActiveFilters = value.search !== '' || value.tipo !== '' || value.internal_technician_id !== '' || value.estado !== ''

  function clear() {
    onChange(EMPTY_TICKET_FILTERS)
  }

  return (
    <div className="mb-3">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder={t('tickets.filters.searchPlaceholder')}
          value={value.search}
          onChange={e => onChange({ ...value, search: e.target.value })}
          className="flex-1 min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />

        <select
          aria-label={t('tickets.table.columns.type')}
          value={value.tipo}
          onChange={e => onChange({ ...value, tipo: e.target.value as TicketType | '' })}
          className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-2 py-2 text-sm bg-white focus:outline-none focus:border-primary"
        >
          <option value="">{t('tickets.filters.allTypes')}</option>
          {TICKET_TYPES.map(type => (
            <option key={type} value={type}>{t(`tickets.types.${type}`)}</option>
          ))}
        </select>

        <select
          aria-label={t('tickets.table.columns.technician')}
          value={value.internal_technician_id}
          onChange={e => onChange({ ...value, internal_technician_id: e.target.value ? Number(e.target.value) : '' })}
          className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-2 py-2 text-sm bg-white focus:outline-none focus:border-primary"
        >
          <option value="">{t('tickets.filters.allTechnicians')}</option>
          {technicians.map(tech => (
            <option key={tech.id} value={tech.id}>{tech.first_name} {tech.last_name}</option>
          ))}
        </select>

        <select
          aria-label={t('tickets.filters.statusLabel')}
          value={value.estado}
          onChange={e => onChange({ ...value, estado: e.target.value as TicketStatus | '' })}
          className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-2 py-2 text-sm bg-white focus:outline-none focus:border-primary"
        >
          <option value="">{t('tickets.filters.allStatuses')}</option>
          {TICKET_STATUSES.map(status => (
            <option key={status} value={status}>{t(`tickets.statuses.${status}`)}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clear}
            className="text-sm font-semibold text-primary hover:text-primary-dark whitespace-nowrap"
          >
            {t('tickets.filters.clear')}
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
        {t('tickets.filters.showing', { shown, total })}
      </p>
    </div>
  )
}
