import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import type { AxiosResponse } from 'axios'
import {
  bytesToMb,
  fileExtension,
  filterManuales,
  formatBytes,
  S3PutError,
  acceptFromExtensions,
  canonicalMimeFor,
  classifyUploadError,
  isFinalizeInProgress,
  isUploadGone,
  mimeFromExtension,
  sortByDateDesc,
  stripExtension,
  validateManualFile,
} from './manuales'
import type { Manual } from '@/types/manuales'

const MB = 1024 * 1024
const LIMITS = { max_pdf_bytes: 50 * MB, max_video_bytes: 500 * MB }

function manual(over: Partial<Manual>): Manual {
  return {
    id: 'm1', name: 'Manual', module: 'crm', type: 'pdf', size_bytes: 1000,
    created_at: '2026-09-01T10:00:00Z', ...over,
  }
}

describe('formatBytes / bytesToMb', () => {
  it('usa B, KB, MB y GB con 1 decimal', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * MB)).toBe('5.0 MB')
    expect(formatBytes(3 * 1024 * MB)).toBe('3.0 GB')
  })

  it('convierte bytes de configuración a MB enteros para el helper de límites', () => {
    expect(bytesToMb(50 * MB)).toBe(50)
    expect(bytesToMb(500 * MB)).toBe(500)
  })
})

describe('filterManuales', () => {
  const data = [
    manual({ id: '1', name: 'Guía de Pedidos', module: 'bodega', type: 'pdf' }),
    manual({ id: '2', name: 'Conteo general', module: 'bodega', type: 'video' }),
    manual({ id: '3', name: 'Órdenes de compra', module: 'compras', type: 'pdf' }),
  ]

  it('sin filtros devuelve todo', () => {
    expect(filterManuales(data, { module: 'all', type: 'all', search: '' })).toHaveLength(3)
  })

  it('filtra por módulo', () => {
    const r = filterManuales(data, { module: 'bodega', type: 'all', search: '' })
    expect(r.map(m => m.id)).toEqual(['1', '2'])
  })

  it('módulo sin manuales devuelve vacío', () => {
    expect(filterManuales(data, { module: 'gerencia', type: 'all', search: '' })).toEqual([])
  })

  it('combina módulo + tipo + búsqueda (AND)', () => {
    const r = filterManuales(data, { module: 'bodega', type: 'video', search: 'conteo' })
    expect(r.map(m => m.id)).toEqual(['2'])
  })

  it('la búsqueda ignora mayúsculas y acentos', () => {
    expect(filterManuales(data, { module: 'all', type: 'all', search: 'ORDENES' }).map(m => m.id)).toEqual(['3'])
    expect(filterManuales(data, { module: 'all', type: 'all', search: 'guia' }).map(m => m.id)).toEqual(['1'])
  })
})

describe('sortByDateDesc', () => {
  it('ordena del más reciente al más antiguo sin mutar la entrada', () => {
    const input = [
      manual({ id: 'a', created_at: '2026-09-01T00:00:00Z' }),
      manual({ id: 'b', created_at: '2026-09-10T00:00:00Z' }),
    ]
    expect(sortByDateDesc(input).map(m => m.id)).toEqual(['b', 'a'])
    expect(input.map(m => m.id)).toEqual(['a', 'b'])
  })
})

describe('validateManualFile', () => {
  it('acepta PDF, MP4 y WebM dentro del límite', () => {
    expect(validateManualFile({ name: 'a.pdf', size: 10 * MB }, LIMITS)).toBeNull()
    expect(validateManualFile({ name: 'a.MP4', size: 499 * MB }, LIMITS)).toBeNull()
    expect(validateManualFile({ name: 'a.webm', size: 1 }, LIMITS)).toBeNull()
  })

  it('rechaza formatos no permitidos', () => {
    expect(validateManualFile({ name: 'a.exe', size: 1 }, LIMITS)).toBe('type')
    expect(validateManualFile({ name: 'sin-extension', size: 1 }, LIMITS)).toBe('type')
    expect(validateManualFile({ name: 'a.mov', size: 1 }, LIMITS)).toBe('type')
  })

  it('respeta la lista de extensiones que manda la configuración', () => {
    expect(validateManualFile({ name: 'a.webm', size: 1 }, { ...LIMITS, allowed_extensions: ['pdf', 'mp4'] })).toBe('type')
  })

  it('aplica el tope según el tipo, tomado de la configuración (no hardcodeado)', () => {
    expect(validateManualFile({ name: 'a.pdf', size: 51 * MB }, LIMITS)).toBe('sizePdf')
    expect(validateManualFile({ name: 'a.mp4', size: 501 * MB }, LIMITS)).toBe('sizeVideo')
    expect(validateManualFile({ name: 'a.pdf', size: 51 * MB }, { ...LIMITS, max_pdf_bytes: 100 * MB })).toBeNull()
  })
})

describe('helpers de nombre', () => {
  it('extrae extensión y nombre base', () => {
    expect(fileExtension('Manual v2.PDF')).toBe('pdf')
    expect(fileExtension('sin')).toBe('')
    expect(stripExtension('Manual v2.pdf')).toBe('Manual v2')
    expect(stripExtension('.oculto')).toBe('.oculto')
  })

  it('deduce el mime cuando el navegador no lo informa', () => {
    expect(mimeFromExtension('pdf')).toBe('application/pdf')
    expect(mimeFromExtension('webm')).toBe('video/webm')
    expect(mimeFromExtension('mp4')).toBe('video/mp4')
  })
})

describe('classifyUploadError', () => {
  const http = (status: number, data: unknown) =>
    new AxiosError('x', 'ERR', undefined, undefined, { status, data } as AxiosResponse)

  it('422: mensaje del backend y no reintentable, en cualquier etapa', () => {
    expect(classifyUploadError(http(422, { message: 'Formato no permitido.' }), 'init'))
      .toEqual({ message: 'Formato no permitido.', retryable: false })
    expect(classifyUploadError(http(422, { message: 'Contenido inválido.' }), 'finalize'))
      .toEqual({ message: 'Contenido inválido.', retryable: false })
  })

  it('422 sin mensaje útil: message null, no reintentable', () => {
    expect(classifyUploadError(http(422, {}), 'init')).toEqual({ message: null, retryable: false })
  })

  it('5xx, 429 y 404 del finalize (subida expirada) son reintentables', () => {
    expect(classifyUploadError(http(503, { message: 'No disponible' }), 'init').retryable).toBe(true)
    expect(classifyUploadError(http(429, {}), 'init').retryable).toBe(true)
    expect(classifyUploadError(http(404, { message: 'La subida expiró.' }), 'finalize'))
      .toEqual({ message: 'La subida expiró.', retryable: true })
  })

  it('404 fuera del finalize y 403 no son reintentables', () => {
    expect(classifyUploadError(http(404, {}), 'init').retryable).toBe(false)
    expect(classifyUploadError(http(403, {}), 'init').retryable).toBe(false)
  })

  it('finalize ya en curso (409 o code finalize_in_progress) es reintentable; el mismo 422 sin código no', () => {
    expect(classifyUploadError(http(409, { message: 'Espera unos segundos.' }), 'finalize'))
      .toEqual({ message: 'Espera unos segundos.', retryable: true })
    expect(classifyUploadError(http(422, { code: 'finalize_in_progress', message: 'Espera.' }), 'finalize').retryable).toBe(true)
    expect(classifyUploadError(http(422, { message: 'Esta subida ya se está finalizando.' }), 'finalize').retryable).toBe(false)
    // Fuera del finalize el código no aplica: un init rechazado sigue siendo una decisión del backend.
    expect(classifyUploadError(http(409, {}), 'init').retryable).toBe(false)
  })

  it('fallo de red o de S3 (no axios con respuesta) es reintentable y sin mensaje', () => {
    expect(classifyUploadError(new Error('S3 403'), 'put')).toEqual({ message: null, retryable: true })
    expect(classifyUploadError(new AxiosError('Network Error'), 'init')).toEqual({ message: null, retryable: true })
  })
})

describe('acceptFromExtensions', () => {
  it('arma el accept desde la configuración y cae al default sin ella', () => {
    expect(acceptFromExtensions(['pdf', 'webm'])).toBe('.pdf,.webm')
    expect(acceptFromExtensions(undefined)).toBe('.pdf,.mp4,.webm')
  })
})

describe('isFinalizeInProgress / isUploadGone', () => {
  const http = (status: number, data: unknown = {}) =>
    new AxiosError('x', 'ERR', undefined, undefined, { status, data } as AxiosResponse)

  it('se reconoce por 409 o por code, no por el texto del mensaje', () => {
    expect(isFinalizeInProgress(http(409))).toBe(true)
    expect(isFinalizeInProgress(http(422, { code: 'finalize_in_progress' }))).toBe(true)
    expect(isFinalizeInProgress(http(422, { message: 'Esta subida ya se está finalizando.' }))).toBe(false)
    expect(isFinalizeInProgress(new Error('x'))).toBe(false)
  })

  it('isUploadGone: solo el 404', () => {
    expect(isUploadGone(http(404))).toBe(true)
    expect(isUploadGone(http(403))).toBe(false)
    expect(isUploadGone(new Error('x'))).toBe(false)
  })
})

describe('canonicalMimeFor', () => {
  it('sale de la extensión, sin importar mayúsculas ni puntos previos', () => {
    expect(canonicalMimeFor('Guia.v2.PDF')).toBe('application/pdf')
    expect(canonicalMimeFor('clase.MP4')).toBe('video/mp4')
    expect(canonicalMimeFor('clase.webm')).toBe('video/webm')
  })
})

describe('S3PutError', () => {
  it('conserva el estado HTTP y el mensaje histórico', () => {
    const e = new S3PutError(403)
    expect(e.status).toBe(403)
    expect(e.message).toBe('S3 403')
  })
})
