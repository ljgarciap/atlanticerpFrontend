import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import CountBadge from '@/components/ui/CountBadge'
import ShowMoreListModal from '@/components/ShowMoreListModal'
import { MAX_HOME_CARD_ITEMS, type ApprovalPendingItem } from '@/lib/homeCards'

interface Props {
  items: ApprovalPendingItem[]
  /** Gerencia (SCRUM-908) usa esto para distinguir su card cross-módulo de la card estándar
   *  por-módulo — el resto de los callers no lo pasa y usa el título por defecto. */
  title?: string
}

/**
 * SCRUM-908 — tarjeta "Aprobaciones Pendientes", ancho completo, al final del Home de cada
 * módulo. Sigue el estándar de SCRUM-871 (máx. `MAX_HOME_CARD_ITEMS` + "Ver más", orden ya
 * resuelto server-side por antigüedad, badge estilo píldora de `CountBadge`). Data-driven: no
 * sabe de dónde viene cada tipo de aprobación, solo renderiza lo que el endpoint del módulo
 * devuelve. Sin ningún pendiente, no renderiza nada — ni el título de la tarjeta.
 */
export default function ApprovalsPendingCard({ items, title }: Props) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)

  if (items.length === 0) return null

  const cardTitle = title ?? t('home.approvalsPending.title', { defaultValue: 'Aprobaciones Pendientes' })

  const renderRow = (item: ApprovalPendingItem, onNavigate: () => void) => (
    <div className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900">
      <span className="text-[12px] text-slate-600 dark:text-slate-300 truncate">{item.label}</span>
      <Button variant="secondary" className="!text-xs !px-2.5 !py-1 shrink-0" onClick={onNavigate}>
        {t('actions.view')}
      </Button>
    </div>
  )

  return (
    <Card variant="panel" className="p-4 col-span-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {cardTitle}
        </h3>
        <CountBadge count={items.length} />
      </div>
      <ul className="flex flex-col gap-1">
        {items.slice(0, MAX_HOME_CARD_ITEMS).map((item, i) => (
          <li key={`${item.tipo}-${i}`}>{renderRow(item, () => navigate(item.detail_route))}</li>
        ))}
      </ul>
      {items.length > MAX_HOME_CARD_ITEMS && (
        <Button variant="secondary" className="!text-xs mt-2 w-full" onClick={() => setShowAll(true)}>
          {t('actions.viewMore')}
        </Button>
      )}

      {showAll && (
        <ShowMoreListModal
          title={cardTitle}
          items={items}
          onClose={() => setShowAll(false)}
          renderItem={(item, i) => (
            <div key={`${item.tipo}-${i}`}>
              {renderRow(item, () => { setShowAll(false); navigate(item.detail_route) })}
            </div>
          )}
        />
      )}
    </Card>
  )
}
