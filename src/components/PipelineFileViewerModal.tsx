import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoDownload } from '@/components/icons'

interface Props {
  url:        string
  filename:   string
  mimeType:   string
  onClose:    () => void
  onDownload: () => void
}

/**
 * SCRUM-767 — previsualización inline de un archivo ya cargado en una tarjeta de Pipeline.
 *
 * `url` es una URL presignada de S3 real (`GET /pipeline/{cardId}/files/{fileId}/url?disposition=inline`),
 * no un Object URL de blob — a diferencia de `servicios/ServiceQuotePdfViewerModal.tsx` (que sí
 * necesita blob porque su endpoint sirve los bytes directo detrás de auth JWT), acá no hace falta
 * crear ni revocar un blob: URL. Mismo criterio de UI que ese componente igual: iframe embebido
 * dentro del propio modal (no una pestaña nueva) para que "cerrar" siempre vuelva al detalle de la
 * tarjeta, consistente en toda la app.
 *
 * `onDownload` (no un handler local) — el botón "Descargar" de ACÁ necesita su propia URL con
 * `disposition=attachment` (distinta de la `url` 'inline' de la previsualización, ver docblock de
 * `PipelineFileService::getPresignedUrl()`); el padre (`PipelineCardModal`) ya sabe pedirla.
 */
export default function PipelineFileViewerModal({ url, filename, mimeType, onClose, onDownload }: Props) {
  const { t } = useTranslation('ventasDiseno')
  const isImage = mimeType.startsWith('image/')

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/60">
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{filename}</h2>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={onDownload}>
            <span className="inline-flex items-center gap-1.5">
              <IcoDownload size={14} />
              {t('modal.fileDownload')}
            </span>
          </Button>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>
      </div>
      {isImage ? (
        <div className="flex-1 flex items-center justify-center overflow-auto bg-slate-100 dark:bg-slate-900 p-4">
          {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
          <img src={url} alt={filename} className="max-w-full max-h-full object-contain" />
        </div>
      ) : (
        <iframe src={url} title={filename} className="flex-1 w-full bg-slate-100 dark:bg-slate-900" />
      )}
    </div>
  )
}
