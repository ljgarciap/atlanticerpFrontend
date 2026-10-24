import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { manualesApi } from '@/api/manualesApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoAlertTriangle, IcoClose, IcoDownload } from '@/components/icons'
import type { Manual } from '@/types/manuales'

interface Props {
  manual:     Manual
  onClose:    () => void
  onDownload: () => void
}

type Status = 'loading' | 'ready' | 'error'

// El <video> entra al trap por su tabIndex (0 solo cuando está listo, -1 mientras carga o falla).
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// SCRUM-984 — reproductor de video de un manual. La URL prefirmada vence (TTL configurable en
// backend): si el <video> falla se pide UNA nueva automáticamente conservando la posición, y solo
// si vuelve a fallar se muestra el estado de error con Reintentar (spec UX 2.4).
export default function ManualVideoModal({ manual, onClose, onDownload }: Props) {
  const { t } = useTranslation('manuales')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const resumeAtRef = useRef(0)
  const autoRetriedRef = useRef(false)

  const [status, setStatus] = useState<Status>('loading')
  const [src, setSrc] = useState<string | null>(null)

  const loadUrl = useCallback(() => {
    setStatus('loading')
    manualesApi.getUrl(manual.id, 'ver')
      .then(({ url }) => { setSrc(url); setStatus('ready') })
      .catch(() => setStatus('error'))
  }, [manual.id])

  useEffect(() => { loadUrl() }, [loadUrl])

  // Foco inicial en Cerrar; al desmontar se pausa y se vacía el src (corta la descarga en curso).
  useEffect(() => {
    closeRef.current?.focus()
    const video = videoRef.current
    return () => {
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function handleVideoError() {
    if (!autoRetriedRef.current) {
      autoRetriedRef.current = true
      resumeAtRef.current = videoRef.current?.currentTime ?? 0
      loadUrl()
      return
    }
    setStatus('error')
  }

  function handleLoadedMetadata() {
    if (resumeAtRef.current > 0 && videoRef.current) {
      videoRef.current.currentTime = resumeAtRef.current
      resumeAtRef.current = 0
    }
  }

  function handleRetry() {
    autoRetriedRef.current = false
    loadUrl()
  }

  const titleId = `manual-video-title-${manual.id}`

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[1100] flex items-start justify-center p-2 sm:p-6 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl my-4"
      >
      <Card variant="modal" className="flex flex-col">
        <div className="flex justify-between items-center gap-3 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 rounded-t-2xl">
          <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{manual.name}</h2>
          <Button
            ref={closeRef}
            variant="icon"
            onClick={onClose}
            aria-label={t('video.close')}
            className="w-10 h-10 flex items-center justify-center shrink-0"
          >
            <IcoClose size={16} />
          </Button>
        </div>

        <div className="p-4 sm:p-6">
          {status === 'loading' && (
            <div
              className="aspect-video w-full rounded-lg animate-pulse bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400"
              role="status"
            >
              {t('video.preparing')}
            </div>
          )}

          {status === 'error' && (
            <div className="aspect-video w-full rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-3 text-center px-4">
              <IcoAlertTriangle size={24} className="text-slate-400 dark:text-slate-500" />
              <p role="alert" className="text-sm text-slate-600 dark:text-slate-300">{t('video.error')}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button variant="outline" onClick={handleRetry}>{t('retry')}</Button>
                <Button variant="outline" onClick={onDownload}>
                  <span className="inline-flex items-center gap-1.5"><IcoDownload size={14} />{t('card.download')}</span>
                </Button>
              </div>
            </div>
          )}

          {/* El <video> siempre está montado (el cleanup de arriba necesita la referencia) y solo se
              oculta mientras no hay URL lista. Sin autoplay. */}
          <video
            ref={videoRef}
            src={status === 'ready' && src ? src : undefined}
            controls
            preload="metadata"
            playsInline
            tabIndex={status === 'ready' ? 0 : -1}
            onError={handleVideoError}
            onLoadedMetadata={handleLoadedMetadata}
            className={status === 'ready' ? 'w-full rounded-lg bg-black aspect-video' : 'hidden'}
          />
        </div>
      </Card>
      </div>
    </div>
  )
}
