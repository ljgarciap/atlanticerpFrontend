import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { manualesApi } from '@/api/manualesApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoAlertTriangle, IcoTrash, IcoUpload } from '@/components/icons'
import { MANUALES_KEY, useDeleteManual, useManualesConfig } from '@/hooks/useManuales'
import {
  MANUAL_MODULES,
  MANUAL_NAME_MAX_LENGTH,
  S3PutError,
  UploadAbortedError,
  acceptFromExtensions,
  bytesToMb,
  canonicalMimeFor,
  classifyUploadError,
  formatBytes,
  isUploadGone,
  moduleI18nKey,
  putFileToS3,
  stripExtension,
  validateManualFile,
} from '@/lib/manuales'
import type { FileValidationError, UploadFailure, UploadStage } from '@/lib/manuales'
import { useToastStore } from '@/store/toastStore'
import { formatDateFromTimestamp } from '@/utils/dates'
import type { Manual, ManualModule, ManualUploadInitResponse } from '@/types/manuales'
import ManualDeleteModal from './ManualDeleteModal'

interface Props {
  id:            string
  open:          boolean
  manuales:      Manual[]
  onBusyChange:  (busy: boolean) => void
}

type Phase = 'idle' | 'preparing' | 'uploading' | 'finalizing' | 'error' | 'cancelled'

/**
 * Subida en curso que un Reintentar puede continuar sin gastar otro cupo de subidas pendientes:
 * si el PUT ya terminó solo se repite el finalize; si no, el PUT se repite con la misma URL mientras
 * siga vigente. `key` ata la sesión al archivo/módulo/nombre con que se inició.
 */
interface UploadSession {
  key:         string
  init:        ManualUploadInitResponse
  expiresAtMs: number | null
  putDone:     boolean
}

// No se reutiliza una URL prefirmada que vence en menos de este margen (el PUT de un video tarda).
const URL_REUSE_MARGIN_MS = 60_000

const FIELD = 'rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-primary w-full'

// SCRUM-984 — panel de carga/borrado de manuales (solo manuales.manage; la página ni lo monta sin
// el permiso). Subida directa a S3 con URL prefirmada: init -> PUT (XHR con progreso) -> finalize.
export default function ManualesAdminPanel({ id, open, manuales, onBusyChange }: Props) {
  const { t } = useTranslation('manuales')
  const qc = useQueryClient()
  const showToast = useToastStore(s => s.show)
  const { data: config, isLoading: configLoading, isError: configError } = useManualesConfig(true)
  const deleteMutation = useDeleteManual()

  const inputRef = useRef<HTMLInputElement>(null)
  const selectBtnRef = useRef<HTMLButtonElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const deleteTriggerRef = useRef<HTMLElement | null>(null)
  const sessionRef = useRef<UploadSession | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<FileValidationError | null>(null)
  const [module, setModule] = useState<ManualModule | ''>('')
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [failure, setFailure] = useState<UploadFailure | null>(null)
  const [progress, setProgress] = useState({ loaded: 0, total: 0 })
  const [dragOver, setDragOver] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Manual | null>(null)

  const busy = phase === 'preparing' || phase === 'uploading' || phase === 'finalizing'

  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])

  // Protección: navegar/cerrar con una subida en curso pierde el archivo a medias.
  useEffect(() => {
    if (!busy) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [busy])

  // Si la configuración llega después de elegir el archivo, se valida en ese momento.
  useEffect(() => {
    if (file && config) setFileError(validateManualFile(file, config))
  }, [file, config])

  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0

  function pickFile(next: File | null) {
    if (busy) return
    sessionRef.current = null
    setFile(next)
    setPhase('idle')
    setFailure(null)
    if (!next) { setFileError(null); return }
    setName(stripExtension(next.name).slice(0, MANUAL_NAME_MAX_LENGTH))
    setFileError(config ? validateManualFile(next, config) : null)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    pickFile(e.dataTransfer.files?.[0] ?? null)
  }

  const resetForm = useCallback(() => {
    sessionRef.current = null
    setFile(null)
    setFileError(null)
    setModule('')
    setName('')
    setPhase('idle')
    setFailure(null)
    setProgress({ loaded: 0, total: 0 })
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const canSubmit = !!file && !fileError && module !== '' && name.trim() !== '' && !!config && !busy

  async function startUpload() {
    if (!file || module === '') return
    setPhase('preparing')
    setFailure(null)
    setProgress({ loaded: 0, total: file.size })
    // El backend exige el mime canónico de la extensión; `file.type` depende del navegador/SO (p. ej. un
    // .mp4 puede llegar como video/x-m4v o vacío) y daría 422 sin remedio.
    const contentType = canonicalMimeFor(file.name)
    const key = [file.name, file.size, file.lastModified, module, name.trim()].join('|')
    let stage: UploadStage = 'init'
    try {
      let session = sessionRef.current
      if (session && session.key !== key) session = null
      // Sin fecha de vencimiento o a punto de vencer, la URL del PUT no se reutiliza. Si el PUT ya terminó,
      // la URL no importa: solo se repite el finalize.
      if (session && !session.putDone
        && (session.expiresAtMs === null || session.expiresAtMs - Date.now() < URL_REUSE_MARGIN_MS)) session = null
      if (!session) {
        const init = await manualesApi.initUpload({
          module,
          name: name.trim(),
          filename: file.name,
          content_type: contentType,
          size_bytes: file.size,
        })
        const expires = init.expires_at ? Date.parse(init.expires_at) : NaN
        session = { key, init, expiresAtMs: Number.isNaN(expires) ? null : expires, putDone: false }
        sessionRef.current = session
      }
      if (!session.putDone) {
        stage = 'put'
        setPhase('uploading')
        await putFileToS3(
          session.init.url,
          { 'Content-Type': contentType, ...session.init.headers },
          file,
          (loaded, total) => setProgress({ loaded, total }),
          xhr => { xhrRef.current = xhr },
        )
        xhrRef.current = null
        session.putDone = true
      }
      stage = 'finalize'
      setPhase('finalizing')
      await manualesApi.finalizeUpload(session.init.upload_id)
      sessionRef.current = null
      showToast(t('admin.uploaded'), 'success')
      await qc.invalidateQueries({ queryKey: MANUALES_KEY })
      resetForm()
      selectBtnRef.current?.focus()
    } catch (err) {
      xhrRef.current = null
      if (err instanceof UploadAbortedError) { setPhase('cancelled'); return }
      const failed = classifyUploadError(err, stage)
      // Se conserva la sesión solo si reintentar la misma URL/el mismo finalize puede funcionar:
      // un 403 de S3 (firma inválida o vencida), un rechazo del backend o un 404 (la subida ya no
      // existe) obligan a pedir un init nuevo.
      const signatureFailure = err instanceof S3PutError && err.status === 403
      const uploadGone = stage === 'finalize' && isUploadGone(err)
      if (!failed.retryable || signatureFailure || uploadGone) sessionRef.current = null
      setFailure(failed)
      setPhase('error')
    }
  }

  function handleCancel() {
    xhrRef.current?.abort()
  }

  function confirmDelete() {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        showToast(t('admin.deleted'), 'success')
        setDeleteTarget(null)
        setTimeout(() => deleteTriggerRef.current?.focus(), 0)
      },
      onError: () => showToast(t('admin.deleteError'), 'error'),
    })
  }

  function closeDelete() {
    setDeleteTarget(null)
    setTimeout(() => deleteTriggerRef.current?.focus(), 0)
  }

  const errorText: Record<FileValidationError, string> = {
    type: t('admin.errType'),
    sizePdf: t('admin.errSizePdf', { max: config ? bytesToMb(config.max_pdf_bytes) : '' }),
    sizeVideo: t('admin.errSizeVideo', { max: config ? bytesToMb(config.max_video_bytes) : '' }),
  }

  return (
    <>
      <Card id={id} variant="panel" className="p-4 mb-3 space-y-5" hidden={!open} aria-label={t('admin.panelLabel')}>
        <section className="space-y-3" aria-labelledby={`${id}-upload`}>
          <h2 id={`${id}-upload`} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('admin.upload')}</h2>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <div
                onDragOver={e => { e.preventDefault(); if (!busy) setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={
                  'border-2 border-dashed rounded-lg p-4 text-center flex flex-col items-center gap-2 ' +
                  (dragOver
                    ? 'border-primary bg-primary-soft dark:bg-slate-700'
                    : 'border-slate-300 dark:border-slate-600')
                }
              >
                <IcoUpload size={22} className="text-slate-400 dark:text-slate-500" />
                <p className="text-sm text-slate-600 dark:text-slate-300">{t('admin.dropHint')}</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept={acceptFromExtensions(config?.allowed_extensions)}
                  className="hidden"
                  data-testid="manual-file-input"
                  onChange={e => pickFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  ref={selectBtnRef}
                  variant="outline"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                >
                  {t('admin.selectFile')}
                </Button>
                {file && <p className="text-[12px] text-slate-500 dark:text-slate-400 break-all">{file.name} · {formatBytes(file.size)}</p>}
              </div>

              {configLoading && <div className="h-4 w-3/4 rounded animate-pulse bg-slate-200 dark:bg-slate-700" aria-hidden="true" />}
              {configError && <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">{t('admin.configError')}</p>}
              {config && (
                <p className="text-[12px] text-slate-500 dark:text-slate-400" data-testid="manual-limits">
                  {t('admin.limits', { pdf: bytesToMb(config.max_pdf_bytes), video: bytesToMb(config.max_video_bytes) })}
                </p>
              )}
              {fileError && <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">{errorText[fileError]}</p>}
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor={`${id}-module`} className="block text-[12px] font-semibold text-slate-600 dark:text-slate-300 mb-1">{t('admin.module')}</label>
                <select
                  id={`${id}-module`}
                  required
                  disabled={busy}
                  value={module}
                  onChange={e => setModule(e.target.value as ManualModule | '')}
                  className={FIELD}
                >
                  <option value="">{t('admin.modulePlaceholder')}</option>
                  {MANUAL_MODULES.map(m => (
                    <option key={m.value} value={m.value}>{t(`modules.${m.i18nKey}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-name`} className="block text-[12px] font-semibold text-slate-600 dark:text-slate-300 mb-1">{t('admin.name')}</label>
                <input
                  id={`${id}-name`}
                  type="text"
                  required
                  disabled={busy}
                  maxLength={MANUAL_NAME_MAX_LENGTH}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className={FIELD}
                />
              </div>
            </div>
          </div>

          <div aria-live="polite" className="space-y-2">
            {phase === 'preparing' && <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('admin.preparing')}</p>}
            {phase === 'finalizing' && <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('admin.finalizing')}</p>}
            {phase === 'uploading' && (
              <div className="space-y-1">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={t('admin.uploading', { pct })}
                  className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
                >
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  {t('admin.progress', { pct, loaded: formatBytes(progress.loaded), total: formatBytes(progress.total) })}
                </p>
              </div>
            )}
            {phase === 'cancelled' && <p role="status" className="text-[12px] text-slate-500 dark:text-slate-400">{t('admin.cancelled')}</p>}
          </div>

          {phase === 'error' && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 dark:border-red-900/50 px-3 py-2">
              <IcoAlertTriangle size={16} className="text-red-600 dark:text-red-400 shrink-0" />
              <p role="alert" className="text-sm text-red-600 dark:text-red-400 flex-1">
                {failure?.message ?? (failure?.retryable === false ? t('admin.uploadRejected') : t('admin.uploadError'))}
              </p>
              {failure?.retryable !== false && (
                <Button variant="outline" onClick={() => void startUpload()}>{t('retry')}</Button>
              )}
              <Button variant="ghost" onClick={resetForm}>{t('admin.discard')}</Button>
            </div>
          )}

          <div className="flex gap-2">
            {(phase === 'uploading' || phase === 'preparing') && (
              <Button variant="outline" onClick={handleCancel} disabled={phase === 'preparing'}>{t('admin.cancel')}</Button>
            )}
            <Button variant="primary" disabled={!canSubmit} onClick={() => void startUpload()}>
              {t('admin.upload')}
            </Button>
          </div>
        </section>

        <section className="space-y-2" aria-labelledby={`${id}-published`}>
          <h2 id={`${id}-published`} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('admin.published')}</h2>
          {manuales.length === 0 ? (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('admin.publishedEmpty')}</p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg">
              {manuales.map(m => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex-1 min-w-[160px] break-words">{m.name}</span>
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">{t(`modules.${moduleI18nKey(m.module)}`)}</span>
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">{t(`type.${m.type}`)}</span>
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">{formatBytes(m.size_bytes)} · {formatDateFromTimestamp(m.created_at)}</span>
                  <Button
                    variant="danger-text"
                    aria-label={t('admin.deleteAria', { name: m.name })}
                    className="inline-flex items-center gap-1 min-h-[40px]"
                    onClick={e => { deleteTriggerRef.current = e.currentTarget; setDeleteTarget(m) }}
                  >
                    <IcoTrash size={14} />
                    {t('admin.delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      {deleteTarget && (
        <ManualDeleteModal
          manual={deleteTarget}
          loading={deleteMutation.isPending}
          onConfirm={confirmDelete}
          onCancel={closeDelete}
        />
      )}
    </>
  )
}
