import { useTranslation } from 'react-i18next'
import { useNotaCreditoComprobante } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { formatDateShort } from '@/utils/dates'

interface Props {
  notaId: number
  onClose: () => void
}

/**
 * Batch 13 (SCRUM-572, REQ-495) — "Ver comprobante" de una Nota de Crédito. Mismo patrón que
 * `VerComprobanteModal` (Cobros, Batch 7), duplicado en vez de generalizado porque cada módulo de
 * Admin&Cont ya sigue este mismo criterio (Historial/Detalle propios por módulo, no compartidos) —
 * generalizar ahora tocaría el componente de Cobros ya en producción sin necesidad real. RN1: si
 * hay comprobante, se muestra el archivo (inline: imagen o PDF) junto con quién lo adjuntó y
 * cuándo — acá siempre es quien registró la nota, ya que el comprobante solo se sube una vez, al
 * registrar (no hay flujo de re-adjuntar). RN2: si no tiene, mensaje explícito.
 */
export default function VerComprobanteNotaCreditoModal({ notaId, onClose }: Props) {
  const { t } = useTranslation('adminContab')
  const { data: comprobante, isLoading, isError } = useNotaCreditoComprobante(notaId)
  const isImage = comprobante?.mime_type?.startsWith('image/') ?? false

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('notasCredito.comprobanteModal.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4">
          {isLoading && <p className="text-sm text-slate-400">…</p>}
          {isError && <p className="text-sm text-red-600">{t('notasCredito.comprobanteModal.error')}</p>}

          {comprobante && !comprobante.tiene_comprobante && (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('notasCredito.comprobanteModal.sinComprobante')}</p>
          )}

          {comprobante && comprobante.tiene_comprobante && comprobante.url && (
            <>
              <div className="rounded-lg bg-slate-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center" style={{ minHeight: 320 }}>
                {isImage ? (
                  // eslint-disable-next-line jsx-a11y/img-redundant-alt
                  <img src={comprobante.url} alt={t('notasCredito.comprobanteModal.title')} className="max-w-full max-h-[60vh] object-contain" />
                ) : (
                  <iframe src={comprobante.url} title={t('notasCredito.comprobanteModal.title')} className="w-full h-[60vh]" />
                )}
              </div>
              {comprobante.fecha && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {t('notasCredito.comprobanteModal.adjuntadoPor', {
                    nombre: comprobante.subido_por ?? '—',
                    fecha: formatDateShort(comprobante.fecha),
                  })}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('notasCredito.comprobanteModal.cerrar')}</Button>
        </div>
      </Card>
    </div>
  )
}
