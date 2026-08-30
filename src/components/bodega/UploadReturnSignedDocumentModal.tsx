import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUploadReturnSignedDocument } from '@/hooks/useBodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPaperclip } from '@/components/icons'

interface Props {
  id: number
  onClose: () => void
}

const MAX_SIZE_BYTES = 20 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'pdf']

/**
 * SCRUM-478 — "Cargar documento firmado" (3J). Contrato: multipart `file`, jpg/jpeg/png/pdf, max
 * 20MB (`POST /bodega/returns/{id}/signed-document`). Validación de tipo/tamaño client-side ANTES
 * de subir, para no gastar el request en algo que el backend va a rechazar de todas formas.
 */
export default function UploadReturnSignedDocumentModal({ id, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadReturnSignedDocument()

  function validateAndSetFile(candidate: File) {
    const ext = candidate.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setError(t('bodega:returns.uploadModal.errors.invalidType'))
      return
    }
    if (candidate.size > MAX_SIZE_BYTES) {
      setError(t('bodega:returns.uploadModal.errors.tooLarge'))
      return
    }
    setError(null)
    setFile(candidate)
  }

  function handleSave() {
    if (!file) { setError(t('bodega:returns.uploadModal.errors.required')); return }
    upload.mutate({ id, file }, {
      onSuccess: onClose,
      onError:   () => setError(t('bodega:returns.uploadModal.errors.uploadFailed')),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:returns.uploadModal.title')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common:actions.close')}>
            <IcoClose />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">{t('bodega:returns.uploadModal.subtitle')}</p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) validateAndSetFile(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl py-6 text-xs text-slate-500 hover:border-primary hover:text-primary transition-colors"
        >
          <IcoPaperclip size={20} />
          {file ? t('bodega:returns.uploadModal.selectedFile', { name: file.name }) : t('bodega:returns.uploadModal.dropzone')}
        </button>

        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button onClick={handleSave} loading={upload.isPending}>{t('bodega:returns.uploadModal.save')}</Button>
        </div>
      </Card>
    </div>
  )
}
