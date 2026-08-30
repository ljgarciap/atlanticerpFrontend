import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCreateProvider, useCreatePurchaseOrder, useUpdatePurchaseOrder } from './useCompras'
import { comprasApi } from '@/api/comprasApi'

vi.mock('@/api/comprasApi', () => ({
  comprasApi: {
    providers: { create: vi.fn() },
    orders: { create: vi.fn(), update: vi.fn() },
  },
}))

const mockedApi = vi.mocked(comprasApi, true)

/**
 * SCRUM-200 (REQ-137) — confirma el contrato de invalidación de queries entre pantallas de
 * Compras que ya estaba implementado (Proveedores/Órdenes/Catálogo), sin haber tenido nunca un
 * test que lo probara. La parte de catálogo era código muerto hasta el fix de CatalogPage.tsx
 * (esta misma sesión) — ver CatalogPage.test.tsx para el test que confirma el refetch real.
 */
describe('useCompras — invalidación de queries entre pantallas (REQ-137)', () => {
  let queryClient: QueryClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let invalidateSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  })

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  it('crear proveedor invalida compras/providers', async () => {
    mockedApi.providers.create.mockResolvedValue({ id: 1, name: 'X' } as never)
    const { result } = renderHook(() => useCreateProvider(), { wrapper })

    result.current.mutate({ name: 'X' } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const invalidatedKeys = invalidateSpy.mock.calls.map((c: any) => c[0]?.queryKey)
    expect(invalidatedKeys).toContainEqual(['compras/providers'])
  })

  it('crear orden invalida compras/orders, compras/providers y ventas-diseno/catalog-products', async () => {
    mockedApi.orders.create.mockResolvedValue({ id: 1 } as never)
    const { result } = renderHook(() => useCreatePurchaseOrder(), { wrapper })

    result.current.mutate({ provider_id: 1, lines: [] } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const invalidatedKeys = invalidateSpy.mock.calls.map((c: any) => c[0]?.queryKey)
    expect(invalidatedKeys).toContainEqual(['compras/orders'])
    expect(invalidatedKeys).toContainEqual(['compras/providers'])
    expect(invalidatedKeys).toContainEqual(['ventas-diseno/catalog-products'])
  })

  it('editar orden invalida los mismos 3 keys que crearla', async () => {
    mockedApi.orders.update.mockResolvedValue({ id: 1 } as never)
    const { result } = renderHook(() => useUpdatePurchaseOrder(), { wrapper })

    result.current.mutate({ id: 1, data: { provider_id: 1, lines: [] } } as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const invalidatedKeys = invalidateSpy.mock.calls.map((c: any) => c[0]?.queryKey)
    expect(invalidatedKeys).toContainEqual(['compras/orders'])
    expect(invalidatedKeys).toContainEqual(['compras/providers'])
    expect(invalidatedKeys).toContainEqual(['ventas-diseno/catalog-products'])
  })
})
