import { useTranslation } from 'react-i18next'
import { usePaymentAttachment } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Props {
  paymentId: number
  onClose: () => void
}

/**
 * Batch 7 del cuerpo principal (SCRUM-549, REQ-472) — "Ver comprobante". RN1: si el cobro tiene un
 * comprobante adjunto, se muestra el archivo (inline: imagen o PDF) junto con quién lo adjuntó y
 * cuándo. RN2: si no tiene ninguno, un mensaje explícito en vez de una pantalla vacía o un error.
 */
export default function VerComprobanteModal({ paymentId, onClose }: Props) {
  const { t } = useTranslation('adminContab')
  const { data: attachment, isLoading, isError } = usePaymentAttachment(paymentId)
  const isImage = attachment?.mime_type.startsWith('image/') ?? false

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('cobros.comprobanteModal.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4">
          {isLoading && <p className="text-sm text-slate-400">…</p>}
          {isError && <p className="text-sm text-red-600">{t('cobros.comprobanteModal.error')}</p>}

          {!isLoading && !isError && attachment === null && (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('cobros.comprobanteModal.sinComprobante')}</p>
          )}

          {attachment && (
            <>
              <div className="rounded-lg bg-slate-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center" style={{ minHeight: 320 }}>
                {isImage ? (
                  // eslint-disable-next-line jsx-a11y/img-redundant-alt
                  <img src={attachment.url} alt={attachment.nombre_archivo} className="max-w-full max-h-[60vh] object-contain" />
                ) : (
                  <iframe src={attachment.url} title={attachment.nombre_archivo} className="w-full h-[60vh]" />
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                {t('cobros.comprobanteModal.adjuntadoPor', {
                  nombre: attachment.uploaded_by ?? '—',
                  fecha: formatDate(attachment.created_at),
                })}
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('cobros.comprobanteModal.cerrar')}</Button>
        </div>
      </Card>
    </div>
  )
}
