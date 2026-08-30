import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { useToastStore } from '@/store/toastStore'
import type { ToolPurchaseRequest } from '@/types/servicios'

interface Props {
  onClose:   () => void
  onCreated: (request: ToolPurchaseRequest) => void
}

const INPUT_CLASSES = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:border-primary'

// REQ-271 — alta de herramienta nueva. Pide SOLO Nombre y Cantidad (nunca un código, ese lo
// genera el backend al recibir). Al guardar aparece una fila "pendiente de recibir" con 0
// unidades reales — no crea unidades acá, solo la solicitud de compra.
export default function ToolCreateModal({ onClose, onCreated }: Props) {
  const { t }   = useTranslation('servicios')
  const toast   = useToastStore(s => s.show)
  const [nombre, setNombre]     = useState('')
  const [cantidad, setCantidad] = useState('')

  const mutation = useMutation({
    mutationFn: () => serviciosApi.tools.requestPurchase({
      nombre:   nombre.trim(),
      cantidad: Number(cantidad),
    }),
    onSuccess: onCreated,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tools.createModal.error'), 'error')
    },
  })

  const canSubmit = nombre.trim() !== '' && cantidad.trim() !== '' && Number(cantidad) > 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-md" data-testid="tool-create-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('tools.createModal.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <label className="text-sm block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('tools.createModal.nombre')}<span className="text-red-500"> *</span>
            </span>
            <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} className={INPUT_CLASSES} />
          </label>
          <label className="text-sm block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('tools.createModal.cantidad')}<span className="text-red-500"> *</span>
            </span>
            <input
              type="number" min={1} step="1"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              className={INPUT_CLASSES}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('tools.createModal.cancel')}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>
            {t('tools.createModal.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
