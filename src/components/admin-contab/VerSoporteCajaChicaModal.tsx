import { useTranslation } from 'react-i18next'
import { usePettyCashAttachmentUrl } from '@/hooks/useAdminContab'
import { useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  expenseId: number
  attachmentId: number
  nombreArchivo: string
  mimeType: string
  onClose: () => void
}

/**
 * Batch 21 (SCRUM-623, REQ-546) — visor de un soporte de Caja Chica. Mismo patrón que
 * `VerComprobanteNotaCreditoModal.tsx` (duplicado a propósito, ver docblock de ese componente):
 * imagen vs PDF decidido por `mime_type`, URL firmada de corta duración (15 min, ver
 * AdminContPettyCashAttachmentService en el backend) — se resuelve al abrir el modal, no antes.
 */
export default function VerSoporteCajaChicaModal({ expenseId, attachmentId, nombreArchivo, mimeType, onClose }: Props) {
  const { t } = useTranslation('adminContab')
  const { mutate, data: url, isPending, isError } = usePettyCashAttachmentUrl()
  const isImage = mimeType.startsWith('image/')

  useEffect(() => {
    mutate({ expenseId, attachmentId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseId, attachmentId])

  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{nombreArchivo}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4">
          {isPending && <p className="text-sm text-slate-400">…</p>}
          {isError && <p className="text-sm text-red-600">{t('cajaChica.soporteModal.error')}</p>}

          {url && (
            <div className="rounded-lg bg-slate-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center" style={{ minHeight: 320 }}>
              {isImage ? (
                // eslint-disable-next-line jsx-a11y/img-redundant-alt
                <img src={url} alt={nombreArchivo} className="max-w-full max-h-[60vh] object-contain" />
              ) : (
                <iframe src={url} title={nombreArchivo} className="w-full h-[60vh]" />
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('cajaChica.soporteModal.cerrar')}</Button>
        </div>
      </Card>
    </div>
  )
}
