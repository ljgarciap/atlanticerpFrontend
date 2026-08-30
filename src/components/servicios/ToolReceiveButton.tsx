import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/store/toastStore'

interface Props {
  requestId: number
  onReceived: () => void
}

// REQ-271 Escenario — botón "Recibida" de una solicitud pendiente (alta nueva o reposición).
// Genera las unidades reales del lado backend; el frontend solo invalida el listado tras el éxito.
export default function ToolReceiveButton({ requestId, onReceived }: Props) {
  const { t }  = useTranslation('servicios')
  const toast  = useToastStore(s => s.show)

  const mutation = useMutation({
    mutationFn: () => serviciosApi.tools.receivePurchase(requestId),
    onSuccess: onReceived,
    onError: () => toast(t('tools.table.receiveError'), 'error'),
  })

  return (
    <Button
      variant="secondary"
      className="!px-2.5 !py-1 !text-xs"
      loading={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {t('tools.table.receiveButton')}
    </Button>
  )
}
