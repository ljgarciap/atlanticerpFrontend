import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'
import type { Tool, ToolPurchaseRequest } from '@/types/servicios'

interface Props {
  tool:      Tool
  onClose:   () => void
  onCreated: (request: ToolPurchaseRequest) => void
}

const INPUT_CLASSES = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-primary'

// REQ-272 — solicitar reposición de una herramienta ya existente. Disponible en CUALQUIER
// unidad (no solo dañada/perdida). Dispara el mismo flujo de compra que REQ-271, referenciando
// la unidad que disparó el pedido (`tool_id`) — el backend nunca reutiliza su código en las
// unidades nuevas, solo el nombre.
export default function ToolPurchaseRequestModal({ tool, onClose, onCreated }: Props) {
  const { t }   = useTranslation('servicios')
  const toast   = useToastStore(s => s.show)
  const [cantidad, setCantidad] = useState('')

  const mutation = useMutation({
    mutationFn: () => serviciosApi.tools.requestPurchase({
      tool_id:  tool.id,
      cantidad: Number(cantidad),
    }),
    onSuccess: onCreated,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tools.purchaseModal.error'), 'error')
    },
  })

  const canSubmit = cantidad.trim() !== '' && Number(cantidad) > 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-md" data-testid="tool-purchase-request-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('tools.purchaseModal.title')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('tools.purchaseModal.subtitle', { nombre: tool.nombre })}</p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4">
          <label className="text-sm block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('tools.purchaseModal.cantidad')}<span className="text-red-500"> *</span>
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
            {t('tools.purchaseModal.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>
            {t('tools.purchaseModal.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
