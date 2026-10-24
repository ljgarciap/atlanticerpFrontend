import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import CountBadge from '@/components/ui/CountBadge'
import ShowMoreListModal from '@/components/ShowMoreListModal'
import { IcoBox } from '@/components/icons'
import { MAX_HOME_CARD_ITEMS } from '@/lib/homeCards'
import { formatDateShort } from '@/utils/dates'
import type { HomeInsumosPendientes, HomeInsumoPendienteItem, HomeInsumoPendienteProducto } from '@/types/servicios'

interface Props {
  data:         HomeInsumosPendientes | undefined
  onViewTicket: (ticketId: number) => void
}

// Preventivo (Pre-QA 2026-08-13) — `llegada_estimada` es siempre `null` hoy (ver
// HomeService::insumosPendientes(), sin fuente real de ETA todavía), así que este branch es
// inalcanzable en este batch. `formatDateShort()` (utils/dates.ts, SCRUM-787/883) ya blinda contra
// el mismo off-by-one encontrado en Grupo D parte 1 (ToolTable.tsx) para fechas "date-only" — se
// dejó de duplicar esa lógica acá.
function formatDate(iso: string): string {
  return formatDateShort(iso)
}

// `descripcion` es el nombre más específico disponible; sin ella caemos a marca+referencia, y
// si tampoco hay nada de eso (snapshot incompleto) mostramos '—' en vez de una fila en blanco.
function formatProducto(producto: HomeInsumoPendienteProducto): string {
  if (producto.descripcion) return producto.descripcion
  const parts = [producto.marca, producto.referencia].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

// REQ-213 (Grupo C, SCRUM-276) — panel "Insumos y herramientas pendientes" de Inicio. RN2 —
// `llegada_estimada` en null se muestra SIEMPRE como "Por confirmar", nunca una fecha inventada
// del lado del frontend. RN4 (mismo criterio que los otros paneles de conteo de Inicio): el badge
// usa `data.count`, nunca `items.length`.
// SCRUM-871 — cap de MAX_HOME_CARD_ITEMS + "Ver más" (antes sin límite); badge unificado al
// estilo píldora pastel (antes círculo sólido ámbar con texto blanco).
export default function InsumosPendientesPanel({ data, onViewTicket }: Props) {
  const { t }  = useTranslation('servicios')
  const items  = data?.items ?? []
  const count  = data?.count ?? 0
  const [showAll, setShowAll] = useState(false)

  const renderCells = (item: HomeInsumoPendienteItem, onView: () => void) => (
    <>
      <td className="py-2 pr-2 text-slate-800 dark:text-slate-100">{formatProducto(item.producto)}</td>
      <td className="py-2 pr-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">
        #{item.numero} — {item.cliente}
      </td>
      <td className="py-2 pr-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {t('home.insumosPendientes.solicitadoHaceDias', { count: item.solicitado_hace_dias })}
      </td>
      <td className="py-2 pr-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {item.llegada_estimada ? formatDate(item.llegada_estimada) : t('home.insumosPendientes.llegadaPorConfirmar')}
      </td>
      <td className="py-2 text-right">
        <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={onView}>
          {t('home.insumosPendientes.viewTicket')}
        </Button>
      </td>
    </>
  )

  const renderModalRow = (item: HomeInsumoPendienteItem) => (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm">
      <div>
        <div className="font-medium text-slate-800 dark:text-slate-100">{formatProducto(item.producto)}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          #{item.numero} — {item.cliente} · {t('home.insumosPendientes.solicitadoHaceDias', { count: item.solicitado_hace_dias })}
          {' · '}
          {item.llegada_estimada ? formatDate(item.llegada_estimada) : t('home.insumosPendientes.llegadaPorConfirmar')}
        </div>
      </div>
      <Button
        variant="secondary"
        className="!px-2.5 !py-1 !text-xs shrink-0"
        onClick={() => { setShowAll(false); onViewTicket(item.ticket_id) }}
      >
        {t('home.insumosPendientes.viewTicket')}
      </Button>
    </div>
  )

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <IcoBox size={16} className="text-slate-400" />
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('home.insumosPendientes.title')}</h2>
        {count > 0 && <CountBadge count={count} tone="warning" />}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{t('home.insumosPendientes.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="pb-2 pr-2">{t('home.insumosPendientes.columns.repuesto')}</th>
                <th className="pb-2 pr-2">{t('home.insumosPendientes.columns.ticket')}</th>
                <th className="pb-2 pr-2">{t('home.insumosPendientes.columns.solicitado')}</th>
                <th className="pb-2 pr-2">{t('home.insumosPendientes.columns.llegadaEstimada')}</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {items.slice(0, MAX_HOME_CARD_ITEMS).map(item => (
                <tr key={item.ticket_id} className="border-t border-slate-100 dark:border-slate-700">
                  {renderCells(item, () => onViewTicket(item.ticket_id))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length > MAX_HOME_CARD_ITEMS && (
        <Button variant="secondary" className="!text-xs mt-2 w-full" onClick={() => setShowAll(true)}>
          {t('common:actions.viewMore')}
        </Button>
      )}

      {showAll && (
        <ShowMoreListModal
          title={t('home.insumosPendientes.title')}
          items={items}
          onClose={() => setShowAll(false)}
          renderItem={item => <div key={item.ticket_id}>{renderModalRow(item)}</div>}
        />
      )}
    </Card>
  )
}
