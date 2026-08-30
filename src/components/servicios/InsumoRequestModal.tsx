import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'
import type { Insumo } from '@/types/servicios'

interface Props {
  insumo:    Insumo
  onClose:   () => void
  onCreated: () => void
}

const INPUT_CLASSES = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-primary'

// REQ-274 — solicitar compra de un insumo ya trackeado. Mismo patrón que
// ToolPurchaseRequestModal (REQ-272): un solo campo, cantidad entera positiva.
//
// RECONCILIADO 2026-08-13 — la respuesta real de POST .../solicitar es el resource
// `InsumoPurchaseRequest` (forma distinta a `Insumo`, ver types/servicios.ts), no el insumo
// actualizado como se asumió originalmente. En vez de mergear esa respuesta en la fila, `onCreated`
// no recibe argumento — el caller (InsumosPanel) invalida `insumos.list()` y deja que el backend
// recalcule `estado_solicitud`.
export default function InsumoRequestModal({ insumo, onClose, onCreated }: Props) {
  const { t }   = useTranslation('servicios')
  const toast   = useToastStore(s => s.show)
  const [cantidad, setCantidad] = useState('')

  const mutation = useMutation({
    mutationFn: () => serviciosApi.insumos.requestPurchase(insumo.id, { cantidad: Number(cantidad) }),
    onSuccess: () => onCreated(),
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('insumos.requestModal.error'), 'error')
    },
  })

  const canSubmit = cantidad.trim() !== '' && Number(cantidad) > 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-md" data-testid="insumo-request-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('insumos.requestModal.title')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('insumos.requestModal.subtitle', { descripcion: insumo.nombre })}
            </p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4">
          <label className="text-sm block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('insumos.requestModal.cantidad')}<span className="text-red-500"> *</span>
            </span>
            <input
              autoFocus type="number" min={1} step="1"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              className={INPUT_CLASSES}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('insumos.requestModal.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>
            {t('insumos.requestModal.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
