import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoSearch } from '@/components/icons'

interface Props<T> {
  title:        string
  queryKey:     unknown[]
  fetchResults: (search: string) => Promise<T[]>
  itemKey:      (item: T) => number
  renderItem:   (item: T) => string
  emptyMessage: string
  onSelect:     (item: T) => void
  onClose:      () => void
}

// REQ-246 RN2/RN3 (Cliente Master/Subcliente) + REQ-247 RN3 (Productos) — mismo mecanismo de
// búsqueda en modal aparte, resultados filtrados en vivo mientras el usuario escribe (debounce de
// 250ms para no disparar una request por tecla). Componente genérico: 3 consumidores en
// TicketCreateModal (master, subcliente, producto).
export default function ServiciosSearchPickerModal<T>({
  title, queryKey, fetchResults, itemKey, renderItem, emptyMessage, onSelect, onClose,
}: Props<T>) {
  const { t }      = useTranslation('servicios')
  const [search, setSearch]           = useState('')
  const [debounced, setDebounced]     = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250)
    return () => clearTimeout(id)
  }, [search])

  const { data: results = [], isLoading } = useQuery({
    queryKey: [...queryKey, debounced],
    queryFn:  () => fetchResults(debounced),
  })

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-sm my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-3 shrink-0">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              <IcoSearch size={14} />
            </span>
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div className="overflow-y-auto px-5 pb-4 flex-1">
          {isLoading ? (
            <p className="text-slate-400 text-sm py-2">{t('common:labels.loading')}</p>
          ) : results.length === 0 ? (
            <p className="text-slate-400 text-sm py-2">{emptyMessage}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map(item => (
                <li key={itemKey(item)}>
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-primary/10 dark:hover:bg-primary/20"
                  >
                    {renderItem(item)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
