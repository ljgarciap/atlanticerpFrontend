import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '@/api/projectsApi'
import { settingsApi } from '@/api/settingsApi'
import type { Document, DocumentCategoria, DocumentVersion } from '@/types/project'
import ShareLinkModal from './ShareLinkModal'
import { Button } from '@/components/ui/Button'
import {
  IcoFile, IcoFileText, IcoFileCad, IcoImage, IcoArchive, IcoBarChart, IcoBox,
  IcoGlobe, IcoDownload, IcoLink, IcoClose, IcoChevronDown, IcoChevronRight,
} from '@/components/icons'

const CATEGORIAS: DocumentCategoria[] = [
  'cotizacion', 'diseno', 'presentacion', 'plano',
  'render', 'ficha', 'modelo_3d', 'otro',
]

const ACCEPT_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp',
  '.zip', '.rar', '.7z',
  '.dwg', '.dxf', '.rvt',
  '.obj', '.fbx', '.glb', '.gltf', '.blend', '.skp', '.ma', '.mb',
].join(',')

function fileIcon(mimeType: string, filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (mimeType === 'application/pdf' || ext === 'pdf') return <IcoFileText />
  if (['jpg','jpeg','png','gif','svg','webp','bmp'].includes(ext)) return <IcoImage />
  if (['dwg','dxf','rvt'].includes(ext)) return <IcoFileCad />
  if (['obj','fbx','max','3ds','blend','skp','ma','mb'].includes(ext)) return <IcoBox />
  if (['zip','rar','7z'].includes(ext)) return <IcoArchive />
  if (['xls','xlsx','csv'].includes(ext)) return <IcoBarChart />
  if (['doc','docx'].includes(ext)) return <IcoFileText />
  if (['ppt','pptx'].includes(ext)) return <IcoBarChart />
  return <IcoFile />
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  projectId: number
  canWrite:  boolean
  canDelete: boolean
}

export default function DocumentSection({ projectId, canWrite, canDelete }: Props) {
  const { t }  = useTranslation(['crm', 'common'])
  const qc     = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [categoria,     setCategoria]     = useState<DocumentCategoria>('otro')
  const [uploadPct,     setUploadPct]     = useState<number | null>(null)
  const [uploadError,   setUploadError]   = useState<string | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)
  const [deletingId,    setDeletingId]    = useState<number | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [showHistory,   setShowHistory]   = useState(false)
  const [sharingDoc,    setSharingDoc]    = useState<Document | null>(null)

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['project-documents', projectId],
    queryFn:  () => projectsApi.listDocuments(projectId),
  })

  const { data: history = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['project-documents-history', projectId],
    queryFn:  () => projectsApi.listDocumentHistory(projectId),
    enabled:  showHistory,
  })

  // Old versions = not current (the current ones are already in the main list)
  const oldVersions: DocumentVersion[] = history.filter(d => !d.is_current)

  const { data: maxSizeSetting, isLoading: isLoadingMaxSize } = useQuery({
    queryKey: ['documents-max-size'],
    queryFn:  settingsApi.getDocumentsMaxSize,
  })
  const maxMb          = maxSizeSetting?.max_size_mb ?? 500
  const uploadDisabled = uploadPct !== null || isLoadingMaxSize

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      setUploadError(null)
      setUploadPct(0)
      return projectsApi.uploadDocument(projectId, file, categoria, pct => setUploadPct(pct))
    },
    onSuccess: () => {
      setUploadPct(null)
      qc.invalidateQueries({ queryKey: ['project-documents', projectId] })
      qc.invalidateQueries({ queryKey: ['project-documents-history', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (err: Error) => {
      setUploadPct(null)
      setUploadError(err.message)
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > maxMb * 1024 * 1024) {
      setUploadError(t('crm:document.errorSize', { max: maxMb }))
      return
    }
    uploadMutation.mutate(file)
  }

  async function handleDelete(doc: Document) {
    setDeletingId(doc.id)
    setActionError(null)
    try {
      await projectsApi.deleteDocument(projectId, doc.id)
      qc.invalidateQueries({ queryKey: ['project-documents', projectId] })
      qc.invalidateQueries({ queryKey: ['project-documents-history', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common:errors.unexpected'))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleDownload(doc: Document) {
    setDownloadingId(doc.id)
    setActionError(null)
    try {
      await projectsApi.downloadDocument(projectId, doc.id, doc.nombre_archivo)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('common:errors.unexpected'))
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
          {t('crm:document.title')}
          {documents.length > 0 && (
            <span className="ml-2 normal-case text-[#5BA5A0] font-bold">({documents.length})</span>
          )}
        </p>

        {canWrite && (
          <div className="flex items-center gap-2">
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value as DocumentCategoria)}
              className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none focus:border-[#5BA5A0]"
            >
              {CATEGORIAS.map(c => (
                <option key={c} value={c}>{t(`crm:document.categorias.${c}`)}</option>
              ))}
            </select>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadDisabled}
              className="!px-3 !py-1 !text-[11px]"
            >
              {uploadPct !== null ? t('crm:document.uploading') : t('crm:document.upload')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_EXTENSIONS}
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}
      </div>

      {/* Hint */}
      <p className="text-[10px] text-slate-400 mb-2">{t('crm:document.hint', { max: maxMb })}</p>

      {/* Progress bar */}
      {uploadPct !== null && (
        <div className="mb-3">
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${uploadPct}%`, background: '#5BA5A0' }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{uploadPct}%</p>
        </div>
      )}

      {/* Errors */}
      {uploadError && <p className="text-[11px] text-red-500 mb-2">{uploadError}</p>}
      {actionError && <p className="text-[11px] text-red-500 mb-2">{actionError}</p>}

      {/* Current documents list */}
      {isLoading && <p className="text-[12px] text-slate-400">{t('common:labels.loading')}</p>}
      {!isLoading && documents.length === 0 && (
        <p className="text-[12px] text-slate-400">{t('crm:document.noDocuments')}</p>
      )}
      {documents.length > 0 && (
        <ul className="space-y-1.5">
          {documents.map(doc => (
            <li
              key={doc.id}
              className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 text-[12px]"
            >
              <span className="text-base shrink-0">{fileIcon(doc.mime_type, doc.nombre_archivo)}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-700 truncate">{doc.nombre_archivo}</p>
                <p className="text-[10px] text-slate-400">
                  {formatBytes(doc.size_bytes)}
                  {' · '}
                  {doc.uploader.first_name} {doc.uploader.last_name}
                </p>
              </div>
              {/* Version badge — solo si hay más de una versión */}
              {doc.version > 1 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 shrink-0">
                  v{doc.version}
                </span>
              )}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 shrink-0">
                {t(`crm:document.categorias.${doc.categoria}`)}
              </span>
              {doc.storage_zone === 'public' && (
                <span className="p-0.5 rounded bg-green-100 text-green-600 shrink-0" title="Público">
                  <IcoGlobe size={12} />
                </span>
              )}
              <Button
                variant="icon"
                onClick={() => { void handleDownload(doc) }}
                disabled={downloadingId === doc.id}
                className="!p-1 !min-h-[32px] shrink-0 !text-primary hover:!text-primary-dark dark:!text-primary-light"
                title={t('crm:document.download')}
              >
                <IcoDownload />
              </Button>
              {canWrite && (
                <Button
                  variant="icon"
                  onClick={() => setSharingDoc(doc)}
                  className="!p-1 !min-h-[32px] shrink-0 hover:!text-primary dark:hover:!text-primary-light"
                  title={t('crm:shareLink.buttonTitle')}
                >
                  <IcoLink />
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="icon"
                  onClick={() => { void handleDelete(doc) }}
                  disabled={deletingId === doc.id}
                  className="!p-1 !min-h-[32px] shrink-0 hover:!text-red-500 dark:hover:!text-red-400"
                  title={t('crm:document.delete')}
                >
                  <IcoClose />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Historial de versiones */}
      <div className="mt-3">
        <Button
          variant="ghost"
          onClick={() => setShowHistory(h => !h)}
          className="!text-[11px] inline-flex items-center gap-1"
        >
          {showHistory ? <IcoChevronDown size={12} /> : <IcoChevronRight size={12} />}
          {t('crm:document.history')}
        </Button>

        {showHistory && (
          <div className="mt-2">
            {isLoadingHistory && (
              <p className="text-[11px] text-slate-400">{t('common:labels.loading')}</p>
            )}
            {!isLoadingHistory && oldVersions.length === 0 && (
              <p className="text-[11px] text-slate-400">{t('crm:document.noHistory')}</p>
            )}
            {oldVersions.length > 0 && (
              <ul className="space-y-1">
                {oldVersions.map(doc => (
                  <li
                    key={doc.id}
                    className="flex items-center gap-2 bg-slate-50/60 border border-slate-100 rounded-lg px-3 py-1.5 text-[11px] opacity-70"
                  >
                    <span className="shrink-0">{fileIcon(doc.mime_type, doc.nombre_archivo)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-600 truncate">{doc.nombre_archivo}</p>
                      <p className="text-[10px] text-slate-400">
                        v{doc.version} · {formatBytes(doc.size_bytes)} · {doc.created_at.slice(0, 10)}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-400 shrink-0">
                      {t(`crm:document.categorias.${doc.categoria}`)}
                    </span>
                    <Button
                      variant="icon"
                      onClick={() => { void handleDownload(doc) }}
                      disabled={downloadingId === doc.id}
                      className="!p-1 !min-h-[28px] shrink-0 !text-primary hover:!text-primary-dark dark:!text-primary-light"
                      title={t('crm:document.download')}
                    >
                      <IcoDownload />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {sharingDoc && (
        <ShareLinkModal
          projectId={projectId}
          document={sharingDoc}
          onClose={() => setSharingDoc(null)}
        />
      )}
    </section>
  )
}
