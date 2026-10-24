import { describe, expect, it, vi, beforeEach } from 'vitest'
import actualAxios from 'axios'

// SCRUM-1163 (Pre-QA CRÍTICO) — `exclude_ids` viajaba como `exclude_ids=6237` (sin corchetes): PHP lo lee como escalar y el backend lo ignoraba, así que un
// producto ya agregado seguía ofreciéndose en el picker. Los tests de las páginas mockean `searchPage` entera y nunca vieron la URL real; este archivo arma
// la URL final con el axios REAL a partir de la config que comprasApi le pasa a la instancia.
const getMock = vi.fn()
vi.mock('./authApi', () => ({ default: { get: (...args: unknown[]) => getMock(...args) } }))

const { comprasApi } = await import('./comprasApi')

beforeEach(() => {
  getMock.mockReset()
  getMock.mockResolvedValue({ data: { data: [], fuzzy: false, meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } } })
})

describe('comprasApi.products.searchPage', () => {
  it('serializa exclude_ids con corchetes para que PHP lo lea como arreglo', async () => {
    await comprasApi.products.searchPage({ providerId: 140, search: 'led', page: 2, perPage: 50, excludeIds: [6237, 9] })

    const [url, config] = getMock.mock.calls[0] as [string, Record<string, unknown>]
    const finalUrl = decodeURIComponent(actualAxios.getUri({ url, ...config }))

    expect(finalUrl).toContain('exclude_ids[]=6237')
    expect(finalUrl).toContain('exclude_ids[]=9')
    expect(finalUrl).not.toMatch(/exclude_ids=\d/)   // la forma sin corchetes que el backend ignoraba
    expect(finalUrl).toContain('provider_id=140')
    expect(finalUrl).toContain('page=2')
    expect(finalUrl).toContain('per_page=50')
  })

  it('sin productos que excluir no manda el parámetro', async () => {
    await comprasApi.products.searchPage({ providerId: 140, search: '', page: 1, perPage: 20, excludeIds: [] })

    const [url, config] = getMock.mock.calls[0] as [string, Record<string, unknown>]
    expect(actualAxios.getUri({ url, ...config })).not.toContain('exclude_ids')
  })
})
