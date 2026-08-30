import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IcoChevronLeft, IcoChevronRight } from '@/components/icons'

export interface PaginationMeta {
  total:        number
  per_page:     number
  current_page: number
  last_page:    number
}

interface Props {
  meta:            PaginationMeta
  perPage:         number | 'all'
  onPageChange:    (page: number) => void
  onPerPageChange: (perPage: number | 'all') => void
}

const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const

/**
 * Política global de paginación/sorting (memory/feedback_pagination_sorting_policy.md,
 * daily sprint2 2026-07-14): toda vista de tabla pagina desde el backend, selector 10/20/50/100/
 * todos, con sorting configurable. Componente compartido para no repetir el bloque inline que ya
 * existe 2 veces en UsersPage.tsx.
 *
 * SCRUM-754 (2026-08-18) — estandarización: default pasó de 5 a 20 en todas las pantallas, y se
 * quitó la opción 5 del selector, a pedido explícito del cliente. El default real lo fija cada
 * pantalla en su propio `useState` inicial (este componente no tiene default propio) — ver
 * docs/changelog.md para la lista de pantallas migradas en este batch.
 */
export function Pagination({ meta, perPage, onPageChange, onPerPageChange }: Props) {
  const { t } = useTranslation('common')
  const lastPage = meta.last_page

  return (
    <div className="flex flex-wrap gap-2 items-center justify-between mt-4 text-sm text-slate-600">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">
          {t('pagination.showing', {
            from:  meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1,
            to:    Math.min(meta.current_page * meta.per_page, meta.total),
            total: meta.total,
          })}
        </span>
        <select
          value={perPage}
          onChange={e => onPerPageChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          className="px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white"
        >
          {PER_PAGE_OPTIONS.map(n => (
            <option key={n} value={n}>{n} {t('pagination.perPage')}</option>
          ))}
          <option value="all">{t('pagination.all')}</option>
        </select>
      </div>
      {lastPage > 1 && (
        <div className="flex gap-1">
          <Button
            variant="outline"
            className="!px-3 !py-1.5 !text-xs"
            disabled={meta.current_page <= 1}
            onClick={() => onPageChange(Math.max(1, meta.current_page - 1))}
          >
            <IcoChevronLeft size={13} />
          </Button>
          {Array.from({ length: Math.min(lastPage, 7) }, (_, i) => {
            const pg = meta.current_page <= 4 ? i + 1 : meta.current_page - 3 + i
            if (pg < 1 || pg > lastPage) return null
            return (
              <Button
                key={pg}
                variant="outline"
                active={pg === meta.current_page}
                className="!px-3 !py-1.5 !text-xs"
                onClick={() => onPageChange(pg)}
              >
                {pg}
              </Button>
            )
          })}
          <Button
            variant="outline"
            className="!px-3 !py-1.5 !text-xs"
            disabled={meta.current_page >= lastPage}
            onClick={() => onPageChange(Math.min(lastPage, meta.current_page + 1))}
          >
            <IcoChevronRight size={13} />
          </Button>
        </div>
      )}
    </div>
  )
}
