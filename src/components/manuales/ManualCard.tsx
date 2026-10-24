import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { manualesApi } from '@/api/manualesApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoDownload, IcoEye, IcoFileText, IcoPlay, IcoVideo } from '@/components/icons'
import { formatBytes, moduleI18nKey } from '@/lib/manuales'
import { useToastStore } from '@/store/toastStore'
import { formatDateFromTimestamp } from '@/utils/dates'
import type { Manual } from '@/types/manuales'
import ManualVideoModal from './ManualVideoModal'

interface Props {
  manual: Manual
}

type Busy = 'open' | 'download' | null

export default function ManualCard({ manual }: Props) {
  const { t } = useTranslation('manuales')
  const showToast = useToastStore(s => s.show)
  const openBtnRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [videoOpen, setVideoOpen] = useState(false)

  const isVideo = manual.type === 'video'

  async function handleDownload() {
    setBusy('download')
    try {
      const { url } = await manualesApi.getUrl(manual.id, 'descargar')
      const a = document.createElement('a')
      a.href = url
      a.download = manual.name
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch {
      showToast(t('error.open'), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function handleOpen() {
    if (isVideo) {
      setVideoOpen(true)
      return
    }
    setBusy('open')
    try {
      const { url } = await manualesApi.getUrl(manual.id, 'ver')
      // No se usa la feature 'noopener' de window.open: en Chrome hace que devuelva siempre null y
      // entonces un popup bloqueado es indistinguible de uno abierto. Se corta el opener a mano.
      const win = window.open(url, '_blank')
      if (win) win.opener = null
      else showToast(t('error.open'), 'error')
    } catch {
      showToast(t('error.open'), 'error')
    } finally {
      setBusy(null)
    }
  }

  function closeVideo() {
    setVideoOpen(false)
    // Devuelve el foco al botón que abrió el modal (spec UX 2.4).
    setTimeout(() => openBtnRef.current?.focus(), 0)
  }

  const openLabel = isVideo ? t('card.play') : t('card.view')
  const openAria = isVideo ? t('card.playAria', { name: manual.name }) : t('card.viewAria', { name: manual.name })
  const focusRing = 'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'

  return (
    <li className="list-none">
      <Card variant="list-item" shadow className="p-4 flex flex-col gap-3 h-full hover:border-primary/40 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary-soft text-primary-dark dark:bg-slate-700 dark:text-primary-light">
            {isVideo ? <IcoVideo size={18} /> : <IcoFileText size={18} />}
          </span>
          <span
            className={
              'inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 ' +
              (isVideo
                ? 'bg-primary-soft text-primary-dark dark:bg-slate-700 dark:text-slate-200'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200')
            }
          >
            {t(`type.${manual.type}`)}
          </span>
        </div>

        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2" title={manual.name}>
          {manual.name}
        </h3>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">{t(`modules.${moduleI18nKey(manual.module)}`)}</p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          {formatBytes(manual.size_bytes)} · {formatDateFromTimestamp(manual.created_at)}
        </p>

        <div className="mt-auto flex gap-2">
          <Button
            ref={openBtnRef}
            variant="primary"
            loading={busy === 'open'}
            onClick={handleOpen}
            aria-label={openAria}
            className={`flex-1 min-h-[40px] ${focusRing}`}
          >
            {busy !== 'open' && (isVideo ? <IcoPlay size={14} className="inline mr-1.5" /> : <IcoEye size={14} className="inline mr-1.5" />)}
            {openLabel}
          </Button>
          <Button
            variant="outline"
            loading={busy === 'download'}
            onClick={handleDownload}
            aria-label={t('card.downloadAria', { name: manual.name })}
            className={`min-h-[40px] ${focusRing}`}
          >
            {busy !== 'download' && <IcoDownload size={14} className="inline mr-1.5" />}
            {t('card.download')}
          </Button>
        </div>
      </Card>

      {videoOpen && <ManualVideoModal manual={manual} onClose={closeVideo} onDownload={handleDownload} />}
    </li>
  )
}
