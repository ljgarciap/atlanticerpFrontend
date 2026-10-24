import { isAxiosError } from 'axios'
import { parseApiValidationError, summaryMessage } from '@/lib/apiValidationError'
import type { Manual, ManualModule, ManualType, ManualesConfig } from '@/types/manuales'

// Orden de la lista = orden del filtro del ticket SCRUM-984. Agregar un módulo nuevo es agregar
// una fila acá + su clave en i18n (manuales:modules.*); la lógica del filtro no cambia.
export const MANUAL_MODULES: ReadonlyArray<{ value: ManualModule; i18nKey: string }> = [
  { value: 'crm',                i18nKey: 'crm' },
  { value: 'ventas_diseno',      i18nKey: 'ventasDiseno' },
  { value: 'compras',            i18nKey: 'compras' },
  { value: 'bodega',             i18nKey: 'bodega' },
  { value: 'servicios',          i18nKey: 'servicios' },
  { value: 'admin_contabilidad', i18nKey: 'adminContab' },
  { value: 'gerencia',           i18nKey: 'gerencia' },
]

export function moduleI18nKey(module: ManualModule): string {
  return MANUAL_MODULES.find(m => m.value === module)?.i18nKey ?? module
}

const MB = 1024 * 1024

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(1)} MB`
  return `${(bytes / (1024 * MB)).toFixed(1)} GB`
}

export function bytesToMb(bytes: number): number {
  return Math.round(bytes / MB)
}

/** Minúsculas y sin acentos, para comparar nombres en la búsqueda. */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export interface ManualFilters {
  module: ManualModule | 'all'
  type:   ManualType | 'all'
  search: string
}

export function filterManuales(manuales: Manual[], filters: ManualFilters): Manual[] {
  const needle = normalizeText(filters.search.trim())
  return manuales.filter(m =>
    (filters.module === 'all' || m.module === filters.module) &&
    (filters.type === 'all' || m.type === filters.type) &&
    (needle === '' || normalizeText(m.name).includes(needle)),
  )
}

export function sortByDateDesc(manuales: Manual[]): Manual[] {
  return [...manuales].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export type FileValidationError = 'type' | 'sizePdf' | 'sizeVideo'

const DEFAULT_EXTENSIONS = ['pdf', 'mp4', 'webm']

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export function manualTypeFromExtension(ext: string): ManualType | null {
  if (ext === 'pdf') return 'pdf'
  if (ext === 'mp4' || ext === 'webm') return 'video'
  return null
}

/** Valida extensión y tamaño contra los límites dinámicos; null = archivo válido. */
export function validateManualFile(
  file: { name: string; size: number },
  config: Pick<ManualesConfig, 'max_pdf_bytes' | 'max_video_bytes'> & { allowed_extensions?: string[] },
): FileValidationError | null {
  const ext = fileExtension(file.name)
  const allowed = config.allowed_extensions ?? DEFAULT_EXTENSIONS
  const type = manualTypeFromExtension(ext)
  if (type === null || !allowed.includes(ext)) return 'type'
  if (type === 'pdf' && file.size > config.max_pdf_bytes) return 'sizePdf'
  if (type === 'video' && file.size > config.max_video_bytes) return 'sizeVideo'
  return null
}

/** Atributo `accept` del input de archivo a partir de las extensiones que permite el backend. */
export function acceptFromExtensions(extensions: string[] | undefined): string {
  return (extensions ?? DEFAULT_EXTENSIONS).map(e => `.${e}`).join(',')
}

export function mimeFromExtension(ext: string): string {
  if (ext === 'pdf') return 'application/pdf'
  return ext === 'webm' ? 'video/webm' : 'video/mp4'
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name : name.slice(0, dot)
}

export const MANUAL_NAME_MAX_LENGTH = 120

export type UploadStage = 'init' | 'put' | 'finalize'

export interface UploadFailure {
  /** Mensaje del backend (cuota, formato, tamaño, contenido rechazado); null = usar el texto i18n genérico. */
  message:   string | null
  /** Solo los fallos transitorios (red, 5xx, URL vencida, 429) ofrecen Reintentar. */
  retryable: boolean
}

/**
 * Clasifica un fallo de la subida. Un 422 (validación de init, o rechazo del finalize por tipo/tamaño/
 * contenido) es una decisión del backend: reintentar con el mismo archivo da el mismo resultado, así
 * que no se ofrece Reintentar y sí se muestra su mensaje. El 404 del finalize (la subida expiró), el
 * finalize ya en curso y los fallos de red/S3/5xx/429 sí son reintentables (el panel decide si el
 * reintento reutiliza la URL prefirmada vigente o pide un init nuevo).
 */
export function classifyUploadError(err: unknown, stage: UploadStage): UploadFailure {
  const parsed = parseApiValidationError(err)
  const message = parsed ? summaryMessage(parsed, '') || null : null
  if (!isAxiosError(err)) return { message: null, retryable: true }

  const status = err.response?.status
  if (status === undefined) return { message: null, retryable: true }
  if (status === 429 || status >= 500) return { message, retryable: true }
  if (status === 404 && stage === 'finalize') return { message, retryable: true }
  if (stage === 'finalize' && isFinalizeInProgress(err)) return { message, retryable: true }
  return { message, retryable: false }
}

/**
 * "Esta subida ya se está finalizando": el backend lo rechaza porque otro finalize del mismo upload_id
 * sostiene el lock. No es un rechazo de contenido: pasados unos segundos se puede reintentar. Se reconoce
 * por un código estable (`code`) o por 409 — nunca por el texto del mensaje, que depende del idioma.
 */
export function isFinalizeInProgress(err: unknown): boolean {
  if (!isAxiosError(err)) return false
  const data = err.response?.data as { code?: unknown } | undefined
  return err.response?.status === 409 || data?.code === 'finalize_in_progress'
}

/** El backend ya no conoce ese upload_id (expiró o se consumió): hay que pedir un init nuevo. */
export function isUploadGone(err: unknown): boolean {
  return isAxiosError(err) && err.response?.status === 404
}

/** Mime canónico que el backend exige para el archivo: sale de la extensión, nunca de `file.type` del navegador. */
export function canonicalMimeFor(fileName: string): string {
  return mimeFromExtension(fileExtension(fileName))
}

/** El PUT a S3 respondió con un estado de error (p. ej. 403 = firma vencida o inválida). */
export class S3PutError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`S3 ${status}`)
    this.name = 'S3PutError'
    this.status = status
  }
}

export class UploadAbortedError extends Error {
  constructor() {
    super('upload aborted')
    this.name = 'UploadAbortedError'
  }
}

/**
 * PUT directo a S3 con la URL prefirmada. XHR (no fetch) porque necesita el progreso de subida.
 * `onXhr` entrega la instancia para que el llamador pueda abortarla (botón Cancelar).
 */
export function putFileToS3(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (loaded: number, total: number) => void,
  onXhr: (xhr: XMLHttpRequest) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    onXhr(xhr)
    xhr.open('PUT', url)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded, e.total) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new S3PutError(xhr.status)))
    xhr.onerror = () => reject(new Error('network'))
    xhr.onabort = () => reject(new UploadAbortedError())
    xhr.send(file)
  })
}
