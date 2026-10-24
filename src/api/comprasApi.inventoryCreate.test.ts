import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as axiosModule from 'axios'
import type { InventoryProductPayload } from '@/types/compras'

// SCRUM-1126 (hotfix) — `inventory.create` arma el multipart a mano. `provider_ids` (arreglo) se serializaba con
// `String([9, 10])` = "9,10" y Laravel respondía 422 "El campo provider ids debe ser un arreglo": ningún alta de producto
// funcionaba. Los tests de la página mockean la función entera y NUNCA ejercitaron esta serialización; este archivo sí
// inspecciona el FormData real que sale hacia axios (mismo patrón de mock que adminContabApi.test.ts).
vi.mock('axios', () => {
  const instance = {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    post: vi.fn(), get: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
  }
  return { default: { create: vi.fn(() => instance) }, __mockInstance: instance }
})

const mockInstance = (
  axiosModule as unknown as { __mockInstance: { post: ReturnType<typeof vi.fn> } }
).__mockInstance

const { comprasApi } = await import('./comprasApi')

function payload(overrides: Record<string, unknown> = {}): InventoryProductPayload {
  return {
    name: 'NEON STRIP',
    provider_id: 9,
    provider_ids: [9, 10],
    reference: '11111',
    factory_reference: '1111',
    brand: 'BK',
    barcode: '3',
    ...overrides,
  } as unknown as InventoryProductPayload
}

async function enviado(p: InventoryProductPayload): Promise<FormData> {
  mockInstance.post.mockResolvedValue({ data: { id: 1 } })
  await comprasApi.inventory.create(p, { link: 'https://ficha.test/a.pdf' }, new File(['x'], 'foto.png', { type: 'image/png' }))
  return mockInstance.post.mock.calls[0][1] as FormData
}

describe('comprasApi.inventory.create — serialización multipart', () => {
  beforeEach(() => { mockInstance.post.mockReset() })

  it('provider_ids viaja como provider_ids[] repetido, nunca como una cadena "9,10"', async () => {
    const form = await enviado(payload())
    expect(form.getAll('provider_ids[]')).toEqual(['9', '10'])
    expect(form.has('provider_ids')).toBe(false)
  })

  it('con un solo proveedor también viaja como arreglo (provider_ids[]=9)', async () => {
    const form = await enviado(payload({ provider_ids: [9] }))
    expect(form.getAll('provider_ids[]')).toEqual(['9'])
    expect(form.has('provider_ids')).toBe(false)
  })

  it('conserva el orden de los proveedores (el principal primero)', async () => {
    const form = await enviado(payload({ provider_id: 12, provider_ids: [12, 3, 7] }))
    expect(form.getAll('provider_ids[]')).toEqual(['12', '3', '7'])
    expect(form.get('provider_id')).toBe('12')
  })

  it('los campos escalares y initial_stock siguen serializándose igual que antes', async () => {
    const form = await enviado(payload({ initial_stock: [{ warehouse_id: 1, quantity: 5 }, { warehouse_id: 2, quantity: 0 }] }))
    expect(form.get('name')).toBe('NEON STRIP')
    expect(form.get('factory_reference')).toBe('1111')
    expect(form.get('initial_stock[0][warehouse_id]')).toBe('1')
    expect(form.get('initial_stock[0][quantity]')).toBe('5')
    expect(form.get('initial_stock[1][warehouse_id]')).toBe('2')
    expect(form.get('link')).toBe('https://ficha.test/a.pdf')
    expect(form.get('photo')).toBeInstanceOf(File)
  })
})
