import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as axiosModule from 'axios'

// SCRUM-998 — `catalog.sendPdf()` distingue el PDF plano (200: se descarga en el momento) del catálogo grande que el backend
// genera en segundo plano (202 con el identificador de la exportación). Mismo patrón de mock de axios que adminContabApi.test.ts.
vi.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    post: vi.fn(), get: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
  }
  return { default: { create: vi.fn(() => instance) }, __mockInstance: instance }
})

const mockInstance = (
  axiosModule as unknown as { __mockInstance: { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } }
).__mockInstance

const { ventasDisenoApi } = await import('./ventasDisenoApi')

let clicked: HTMLAnchorElement | null = null

beforeEach(() => {
  vi.clearAllMocks()
  clicked = null
  URL.createObjectURL = vi.fn(() => 'blob:pdf')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked = this })
})

afterEach(() => { vi.restoreAllMocks() })

describe('ventasDisenoApi.catalog.sendPdf', () => {
  it('200: descarga el PDF plano y devuelve queued:false', async () => {
    mockInstance.post.mockResolvedValue({ status: 200, data: new Blob(['%PDF-1.7'], { type: 'application/pdf' }) })

    const result = await ventasDisenoApi.catalog.sendPdf('completo')

    expect(result).toEqual({ queued: false })
    expect(mockInstance.post).toHaveBeenCalledWith('/ventas-diseno/catalog/send-pdf', { mode: 'completo' }, { responseType: 'blob' })
    expect(clicked?.download).toMatch(/^Catalogo-Atlantic-\d{4}-\d{2}-\d{2}\.pdf$/)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf')
  })

  it('202: parsea el cuerpo (llega como Blob), NO descarga nada y devuelve el identificador de la exportación', async () => {
    const body = JSON.stringify({ export_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'queued', total_products: 29630, volumes: 60 })
    mockInstance.post.mockResolvedValue({ status: 202, data: new Blob([body], { type: 'application/json' }) })

    const result = await ventasDisenoApi.catalog.sendPdf('seleccionados', [1, 2, 3])

    expect(result).toEqual({ queued: true, exportId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', totalProducts: 29630, volumes: 60 })
    expect(mockInstance.post).toHaveBeenCalledWith('/ventas-diseno/catalog/send-pdf', { mode: 'seleccionados', product_ids: [1, 2, 3] }, { responseType: 'blob' })
    expect(clicked).toBeNull()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})

describe('ventasDisenoApi.catalog.pdfExport', () => {
  it('consulta el estado de la exportación por su identificador', async () => {
    mockInstance.get.mockResolvedValue({ data: { export_id: 'x', status: 'done', download_url: 'https://s3.test/zip' } })

    const status = await ventasDisenoApi.catalog.pdfExport('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    expect(mockInstance.get).toHaveBeenCalledWith('/ventas-diseno/catalog/pdf-exports/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(status.download_url).toBe('https://s3.test/zip')
  })
})
