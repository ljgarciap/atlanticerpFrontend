import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { IcoAlertTriangle } from '@/components/icons'
import type { HomePendientes } from '@/types/servicios'

interface Props {
  data: HomePendientes | undefined
}

// REQ-210 — panel "Pendientes" de Inicio. RN1: solo tarjetas generadas automáticamente (no hay
// acción de "crear pendiente" en este panel). RN4: el badge de conteo es SIEMPRE `data.count`, el
// total real del backend — nunca `items.length` calculado acá (evita que un filtro futuro del
// lado del cliente desincronice el número del badge del contenido mostrado).
export default function HomePendingPanel({ data }: Props) {
  const { t }      = useTranslation('servicios')
  const navigate   = useNavigate()
  const items      = data?.items ?? []
  const count      = data?.count ?? 0

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('home.pending.title')}</h2>
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">
            {count}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{t('home.pending.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, idx) => (
            <li
              key={`${item.type}-${item.ticket_id}-${idx}`}
              className="flex items-center gap-2.5 rounded-lg border border-amber-100 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-2.5"
            >
              <IcoAlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
              <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">
                {item.message}
              </span>
              <button
                type="button"
                onClick={() => navigate(`/servicios/tickets?ticket=${item.ticket_id}`)}
                className="text-xs font-semibold text-primary hover:text-primary-dark whitespace-nowrap"
              >
                {t('home.pending.viewTicket')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
