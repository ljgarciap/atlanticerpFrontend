import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'

/**
 * Fase 27c — los 10 códigos de respaldo, que el servidor entrega UNA sola vez. Se pueden copiar o descargar; el botón final
 * exige que la persona confirme que ya los guardó antes de cerrar la lista.
 */
export function MfaBackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation(['auth'])
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
    } catch { /* sin portapapeles: la descarga sigue disponible */ }
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([codes.join('\n') + '\n'], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = t('auth:mfa.backupFileName')
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3" data-testid="mfa-backup-codes">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('auth:mfa.backupTitle')}</h3>
      <p className="text-xs text-slate-500">{t('auth:mfa.backupIntro')}</p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 font-mono text-sm text-slate-700 dark:text-slate-200">
        {codes.map(c => <li key={c} className="text-center tracking-wider">{c}</li>)}
      </ul>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={() => void copy()}>
          {copied ? t('auth:mfa.backupCopied') : t('auth:mfa.backupCopy')}
        </Button>
        <Button type="button" variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={download}>
          {t('auth:mfa.backupDownload')}
        </Button>
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />
        {t('auth:mfa.backupSaved')}
      </label>
      <Button type="button" disabled={!saved} onClick={onDone} className="!px-4 !py-2 !text-xs">
        {t('auth:mfa.backupDone')}
      </Button>
    </div>
  )
}
