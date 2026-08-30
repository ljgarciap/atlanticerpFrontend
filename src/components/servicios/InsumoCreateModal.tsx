import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'
import ServiciosSearchPickerModal from './ServiciosSearchPickerModal'
import type { Insumo, ProductOption } from '@/types/servicios'

interface Props {
  // REQ-275 — `catalog_product_id` de los insumos ya trackeados, para excluirlos del buscador
  // (mismo criterio que `excludedProductIds` en TicketCreateModal — el backend resuelve `exclude`
  // server-side, el frontend nunca filtra localmente).
  excludedProductIds: number[]
  onClose:            () => void
  onCreated:          (insumo: Insumo) => void
}

const INPUT_CLASSES = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-primary'

// REQ-275 — alta de insumo nuevo, en 2 pasos: 1) elegir del catálogo real de Compras (nunca texto
// libre — RECONCILIADO 2026-08-13: REQ-275 no tiene endpoint de catálogo propio, reusa el mismo
// `serviciosApi.lookup.products()` de tickets vía ServiciosSearchPickerModal, ya usado en
// TicketCreateModal, con su propio emptyMessage si no aparece nada); 2) mínimo deseado + cantidad
// inicial a solicitar, que dispara la misma acción de compra de REQ-274 (insumos.create() en el
// backend crea el registro de tracking Y la solicitud de compra en una sola llamada — se asume así
// para no duplicar la llamada de InsumoRequestModal inmediatamente después de crear).
export default function InsumoCreateModal({ excludedProductIds, onClose, onCreated }: Props) {
  const { t }   = useTranslation('servicios')
  const toast   = useToastStore(s => s.show)
  const [product, setProduct]   = useState<ProductOption | null>(null)
  const [minimo, setMinimo]     = useState('')
  const [cantidad, setCantidad] = useState('')

  const mutation = useMutation({
    mutationFn: () => serviciosApi.insumos.create({
      catalog_product_id: product!.id,
      minimo:             Number(minimo),
      cantidad_inicial:   Number(cantidad),
    }),
    onSuccess: onCreated,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('insumos.createModal.error'), 'error')
    },
  })

  const canSubmit = product !== null
    && minimo.trim() !== '' && Number(minimo) > 0
    && cantidad.trim() !== '' && Number(cantidad) > 0

  if (!product) {
    return (
      <ServiciosSearchPickerModal<ProductOption>
        title={t('insumos.createModal.searchTitle')}
        queryKey={['servicios-lookup-products-insumos', excludedProductIds.join(',')]}
        fetchResults={search => serviciosApi.lookup.products(search, excludedProductIds)}
        itemKey={item => item.id}
        renderItem={item => `${item.reference} — ${item.name}`}
        emptyMessage={t('insumos.createModal.searchEmpty')}
        onSelect={setProduct}
        onClose={onClose}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-md" data-testid="insumo-create-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('insumos.createModal.title')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{product.name}</p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="text-sm block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('insumos.createModal.minimo')}<span className="text-red-500"> *</span>
            </span>
            <input
              autoFocus type="number" min={1} step="1"
              value={minimo} onChange={e => setMinimo(e.target.value)}
              className={INPUT_CLASSES}
            />
          </label>
          <label className="text-sm block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('insumos.createModal.cantidadInicial')}<span className="text-red-500"> *</span>
            </span>
            <input
              type="number" min={1} step="1"
              value={cantidad} onChange={e => setCantidad(e.target.value)}
              className={INPUT_CLASSES}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={() => setProduct(null)} disabled={mutation.isPending}>
            {t('insumos.createModal.back')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>
            {t('insumos.createModal.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
