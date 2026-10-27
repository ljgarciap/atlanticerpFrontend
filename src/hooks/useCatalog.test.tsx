import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCatalogOptions } from './useCatalog'
import { catalogsApi } from '@/api/catalogsApi'

vi.mock('@/api/catalogsApi', () => ({ catalogsApi: { list: vi.fn() } }))
const api = vi.mocked(catalogsApi, true)
const FALLBACK = [{ key: 'locales', label: 'Locales' }]

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

describe('useCatalogOptions', () => {
  it('usa el respaldo mientras carga y las entradas del catálogo después', async () => {
    api.list.mockResolvedValue([{ id: 1, domain: 'd', key: 'mayorista', label: 'Mayorista', sort_order: 0, is_active: true, is_system: false, props: {} }])
    const { result } = renderHook(() => useCatalogOptions('d', FALLBACK), { wrapper })
    expect(result.current).toEqual(FALLBACK)
    await waitFor(() => expect(result.current).toEqual([{ key: 'mayorista', label: 'Mayorista' }]))
  })

  it('conserva el respaldo si el catálogo falla o viene vacío', async () => {
    api.list.mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useCatalogOptions('d', FALLBACK), { wrapper })
    await waitFor(() => expect(api.list).toHaveBeenCalled())
    expect(result.current).toEqual(FALLBACK)
  })
})
