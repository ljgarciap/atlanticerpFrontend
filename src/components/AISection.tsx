import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { aiApi } from '@/api/aiApi'
import { useAIAnalysis } from '@/hooks/useAIAnalysis'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  projectId: number
}

const MESSAGE_TYPES = [
  { value: 'email',    label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'llamada',  label: 'Guión llamada' },
] as const

type MessageType = 'email' | 'whatsapp' | 'llamada'

export default function AISection({ projectId }: Props) {
  const { t } = useTranslation(['crm', 'common'])
  const ai = useAIAnalysis()

  const [draftOpen,   setDraftOpen]   = useState(false)
  const [messageType, setMessageType] = useState<MessageType>('email')
  const [intent,      setIntent]      = useState('')

  const handleSummarize = () => {
    ai.run(() => aiApi.summarize(projectId))
  }

  const handleSuggest = () => {
    ai.run(() => aiApi.suggestActions(projectId))
  }

  const handleDraft = () => {
    if (!intent.trim()) return
    setDraftOpen(false)
    ai.run(() => aiApi.draftMessage(projectId, messageType, intent.trim()))
    setIntent('')
  }

  const isActive = ai.status === 'loading' || ai.status === 'polling'

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {t('crm:ai.title')}
      </p>

      {/* Buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        <Button
          variant="outline"
          onClick={handleSummarize}
          disabled={isActive}
          className="!px-3 !py-1.5 !text-xs">
          {t('crm:ai.summarize')}
        </Button>
        <Button
          variant="outline"
          onClick={handleSuggest}
          disabled={isActive}
          className="!px-3 !py-1.5 !text-xs">
          {t('crm:ai.suggest')}
        </Button>
        <Button
          variant="outline"
          onClick={() => { ai.reset(); setDraftOpen(true) }}
          disabled={isActive}
          className="!px-3 !py-1.5 !text-xs">
          {t('crm:ai.draft')}
        </Button>
      </div>

      {/* Draft message form */}
      {draftOpen && ai.status === 'idle' && (
        <div className="mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
          <div className="flex gap-2">
            {MESSAGE_TYPES.map(mt => (
              <Button
                key={mt.value}
                type="button"
                variant="outline"
                active={messageType === mt.value}
                onClick={() => setMessageType(mt.value)}
                className="!px-2.5 !py-1 !text-xs">
                {mt.label}
              </Button>
            ))}
          </div>
          <input
            type="text"
            value={intent}
            onChange={e => setIntent(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleDraft()}
            placeholder={t('crm:ai.intentPlaceholder')}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => { setDraftOpen(false); setIntent('') }}
              className="!px-3 !py-1.5 !text-xs">
              {t('common:actions.cancel')}
            </Button>
            <Button
              variant="accent"
              onClick={handleDraft}
              disabled={!intent.trim()}
              className="!px-3 !py-1.5 !text-xs">
              {t('common:actions.generate')}
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {(ai.status === 'loading' || ai.status === 'polling') && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
          <span className="inline-block w-4 h-4 border-2 border-slate-300 dark:border-slate-600 border-t-primary rounded-full animate-spin" />
          {t('crm:ai.analyzing')}
        </div>
      )}

      {/* Result */}
      {ai.status === 'completed' && ai.result && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('crm:ai.result')}</span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => void navigator.clipboard.writeText(ai.result ?? '')}
                className="!text-xs !text-slate-500 hover:!text-slate-700 dark:!text-slate-400 dark:hover:!text-slate-200 !font-medium">
                {t('common:actions.copy')}
              </Button>
              <Button
                variant="ghost"
                onClick={ai.reset}
                className="!text-xs !text-slate-400 hover:!text-slate-600 dark:!text-slate-500 dark:hover:!text-slate-300">
                <IcoClose size={12} />
              </Button>
            </div>
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{ai.result}</p>
        </div>
      )}

      {/* Error */}
      {(ai.status === 'failed' || ai.status === 'timeout') && ai.error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600 flex-1">{ai.error}</p>
          <Button variant="danger-text" onClick={ai.reset} className="!text-xs shrink-0">
            {t('common:actions.close')}
          </Button>
        </div>
      )}
    </div>
  )
}
