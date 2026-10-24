import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

/**
 * SCRUM-871 — modal de listado completo para tarjetas de Home ("Ver más"). Distinto de
 * `HomeItemDetailModal` (detalle de UN ítem): este muestra TODOS los elementos de una tarjeta que
 * excede el máximo de 5 visibles. `renderItem` reusa el mismo markup/onClick que ya tiene cada
 * tarjeta en su lista corta, para no duplicar comportamiento entre la vista corta y el modal.
 */
interface Props<T> {
  title: string
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  onClose: () => void
}

export default function ShowMoreListModal<T>({ title, items, renderItem, onClose }: Props<T>) {
  const { t } = useTranslation('common')

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-lg my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-2 py-2 flex-1 flex flex-col gap-1">
          {items.map((item, i) => renderItem(item, i))}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>{t('actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
