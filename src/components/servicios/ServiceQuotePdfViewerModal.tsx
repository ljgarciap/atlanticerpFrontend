import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoDownload } from '@/components/icons'

interface Props {
  blobUrl: string
  numero:  string
  onClose: () => void
}

// Batch 12 (REQ-235/236, SCRUM-298/299) — visor de PDF en pantalla, dentro de la propia app.
//
// El endpoint `document()` sirve el mismo documento formal para 3 puntos de entrada: el botón de
// cabecera "Ver/Imprimir" (REQ-235, la cotización vigente), cada fila del historial de un ticket
// (REQ-236 — "abre esa cotización específica en modo de solo lectura") y el historial global
// (REQ-250). Un `<a download>` (el diseño original) fuerza el archivo a disco sin mostrar nada en
// pantalla — no hay forma de "ver" la cotización, solo de descargarla a ciegas.
//
// Se intentó abrir el blob en una pestaña nueva (`window.open` + navegar esa ventana al Object
// URL) para reusar el visor de PDF nativo del navegador — Chrome (≥115) bloquea en silencio la
// navegación de nivel superior de OTRA ventana/pestaña hacia un `blob:` creado en otro contexto
// ("cross-partition blob URL navigation", confirmado con Playwright: la pestaña quedaba en blanco,
// `requestfailed` con `ERR_ABORTED`). Un `<iframe>` DENTRO del mismo documento que generó el
// Object URL no tiene ese problema (no es una navegación de nivel superior) — de ahí este visor
// embebido en vez de una pestaña nueva.
//
// Con esto, "Ver" (este modal) e "Imprimir" (Ctrl+P / ícono de impresión del visor de PDF del
// propio navegador dentro del iframe) usan exactamente el mismo documento — RN4 de REQ-235.
export default function ServiceQuotePdfViewerModal({ blobUrl, numero, onClose }: Props) {
  const { t } = useTranslation('servicios')

  // El Object URL vive mientras este modal está montado — se revoca al cerrar, nunca antes (el
  // iframe todavía lo está leyendo mientras el modal existe).
  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl])

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/60">
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {t('tickets.quoteModal.pdfViewerTitle', { numero })}
        </h2>
        <div className="flex items-center gap-2">
          <a href={blobUrl} download={`Cotizacion-${numero}.pdf`} className="inline-flex">
            <Button variant="secondary">
              <span className="inline-flex items-center gap-1.5">
                <IcoDownload size={14} />
                {t('tickets.quoteModal.pdfDownload')}
              </span>
            </Button>
          </a>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>
      </div>
      <iframe
        src={blobUrl}
        title={t('tickets.quoteModal.pdfViewerTitle', { numero })}
        className="flex-1 w-full bg-slate-100 dark:bg-slate-900"
      />
    </div>
  )
}
