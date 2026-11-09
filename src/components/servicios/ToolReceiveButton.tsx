import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { serviciosApi } from '@/api/serviciosApi'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/store/toastStore'

interface Props {
  requestId: number
  onReceived: () => void
}

// REQ-271 Escenario — botón "Recibida" de una solicitud pendiente (alta nueva o reposición).
// Fase 30: recibir exige una referencia de compra (factura u orden, texto libre) que respalde las unidades nuevas.
export default function ToolReceiveButton({ requestId, onReceived }: Props) {
  const { t }  = useTranslation('servicios')
  const toast  = useToastStore(s => s.show)
  const [asking, setAsking]         = useState(false)
  const [referencia, setReferencia] = useState('')

  const mutation = useMutation({
    mutationFn: () => serviciosApi.tools.receivePurchase(requestId, referencia.trim()),
    onSuccess: onReceived,
    onError: (err) => {
      const msg = isAxiosError(err) ? (err.response?.data as { message?: string } | undefined)?.message : undefined
      toast(msg ?? t('tools.table.receiveError'), 'error')
    },
  })

  if (!asking) {
    return (
      <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={() => setAsking(true)}>
        {t('tools.table.receiveButton')}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus value={referencia} onChange={e => setReferencia(e.target.value)}
        aria-label={t('tools.table.receiveReferenciaLabel')}
        placeholder={t('tools.table.receiveReferenciaPlaceholder')}
        className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-2 py-1 text-xs w-36"
      />
      <Button
        className="!px-2.5 !py-1 !text-xs"
        disabled={referencia.trim().length < 3}
        loading={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {t('tools.table.receiveConfirm')}
      </Button>
    </div>
  )
}
