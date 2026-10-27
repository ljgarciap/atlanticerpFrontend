import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTicketTypes } from '@/hooks/useTicketTypes'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import CountBadge from '@/components/ui/CountBadge'
import ShowMoreListModal from '@/components/ShowMoreListModal'
import { IcoAlertTriangle } from '@/components/icons'
import { MAX_HOME_CARD_ITEMS } from '@/lib/homeCards'
import type { HomeSinResponder, HomeSinResponderItem } from '@/types/servicios'

interface Props {
  data: HomeSinResponder | undefined
}

// REQ-212 (Grupo C, SCRUM-275) — panel "Servicios sin responder" de Inicio. RN4 (mismo criterio
// que HomePendingPanel/HomeSinResponder): el badge de conteo es SIEMPRE `data.count`, nunca
// `items.length`. El badge de tipo usa `t('tickets.types.<tipo>')`, no el `tipo_label` que manda
// el backend — mismo patrón i18n que TicketBoard.tsx, para que el label cambie con el idioma
// activo en vez de quedar fijo en el string que resuelve el backend.
// SCRUM-871 — cap de MAX_HOME_CARD_ITEMS + "Ver más" (antes sin límite); badge unificado al
// estilo píldora pastel (antes círculo sólido rojo con texto blanco).
export default function ServiciosSinResponderPanel({ data }: Props) {
  const { t }  = useTranslation('servicios')
  const ticketTypes = useTicketTypes()
  const items  = data?.items ?? []
  const count  = data?.count ?? 0
  const [showAll, setShowAll] = useState(false)

  const renderRow = (item: HomeSinResponderItem) => (
    <li key={item.ticket_id} className="rounded-lg border border-slate-100 dark:border-slate-700 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{item.cliente}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.descripcion}</p>
        </div>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white whitespace-nowrap shrink-0"
          style={{ background: ticketTypes.color(item.tipo) }}
        >
          {ticketTypes.label(item.tipo)}
        </span>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
        <IcoAlertTriangle size={12} />
        {t('home.sinResponder.reportedDaysAgo', { count: item.dias })}
      </p>
    </li>
  )

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center gap-2 mb-0.5">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('home.sinResponder.title')}</h2>
        {count > 0 && <CountBadge count={count} tone="critical" />}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('home.sinResponder.subtitle')}</p>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{t('home.sinResponder.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.slice(0, MAX_HOME_CARD_ITEMS).map(item => renderRow(item))}
        </ul>
      )}
      {items.length > MAX_HOME_CARD_ITEMS && (
        <Button variant="secondary" className="!text-xs mt-2 w-full" onClick={() => setShowAll(true)}>
          {t('common:actions.viewMore')}
        </Button>
      )}

      {showAll && (
        <ShowMoreListModal
          title={t('home.sinResponder.title')}
          items={items}
          onClose={() => setShowAll(false)}
          renderItem={item => renderRow(item)}
        />
      )}
    </Card>
  )
}
