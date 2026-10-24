import { describe, expect, it, vi, beforeEach } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('./authApi', () => ({ default: http }))

import { ventasDisenoApi, buildQuotePartsApi } from './ventasDisenoApi'

beforeEach(() => {
  vi.clearAllMocks()
  for (const fn of Object.values(http)) fn.mockResolvedValue({ data: {} })
})

// SCRUM-1120 — la lógica de Partidas es UNA sola; CotizaYA y Cotizaciones solo cambian la ruta base.
describe('API de partidas reutilizada por CotizaYA (SCRUM-1120)', () => {
  it('Cotizaciones sigue hablando con /ventas-diseno/quotes/...', async () => {
    await ventasDisenoApi.quotes.parts.create(5, 'Sala')
    await ventasDisenoApi.quotes.parts.items.update(5, 6, 7, {} as never)
    await ventasDisenoApi.quotes.parts.items.bulkCreate(5, 6, [1, 2])

    expect(http.post).toHaveBeenCalledWith('/ventas-diseno/quotes/5/parts', { name: 'Sala' })
    expect(http.put).toHaveBeenCalledWith('/ventas-diseno/quotes/5/parts/6/items/7', {})
    expect(http.post).toHaveBeenCalledWith('/ventas-diseno/quotes/5/parts/6/items/bulk', { catalog_product_ids: [1, 2] })
  })

  it('CotizaYA usa las rutas gemelas /ventas-diseno/cotizaya/...', async () => {
    await ventasDisenoApi.cotizaya.parts.create(9, 'Sala')
    await ventasDisenoApi.cotizaya.parts.duplicate(9, 6)
    await ventasDisenoApi.cotizaya.parts.items.remove(9, 6, 7)
    await ventasDisenoApi.cotizaya.parts.items.previewPrice(9, 6, 7, 120)

    expect(http.post).toHaveBeenCalledWith('/ventas-diseno/cotizaya/9/parts', { name: 'Sala' })
    expect(http.post).toHaveBeenCalledWith('/ventas-diseno/cotizaya/9/parts/6/duplicate')
    expect(http.delete).toHaveBeenCalledWith('/ventas-diseno/cotizaya/9/parts/6/items/7')
    expect(http.post).toHaveBeenCalledWith('/ventas-diseno/cotizaya/9/parts/6/items/7/preview-price', { unit_price: 120 })
  })

  it('la fábrica produce las mismas funciones para cualquier base', () => {
    expect(Object.keys(buildQuotePartsApi('cotizaya'))).toEqual(Object.keys(buildQuotePartsApi('quotes')))
  })

  it('crear, generar y PDF de CotizaYA usan sus propias rutas (nunca /quotes)', async () => {
    await ventasDisenoApi.cotizaya.create({ cotizaya_customer_name: 'Zulema' })
    await ventasDisenoApi.cotizaya.update(9, { description: 'x' })
    await ventasDisenoApi.cotizaya.generate(9)
    await ventasDisenoApi.cotizaya.pdf(9)

    expect(http.post).toHaveBeenCalledWith('/ventas-diseno/cotizaya', { cotizaya_customer_name: 'Zulema' })
    expect(http.put).toHaveBeenCalledWith('/ventas-diseno/cotizaya/9', { description: 'x' })
    expect(http.post).toHaveBeenCalledWith('/ventas-diseno/cotizaya/9/generate')
    expect(http.get).toHaveBeenCalledWith('/ventas-diseno/cotizaya/9/pdf', { params: { external: 0 }, responseType: 'blob' })
  })
})
