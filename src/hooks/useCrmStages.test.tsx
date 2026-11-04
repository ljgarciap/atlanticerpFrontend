import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCrmStages } from './useCrmStages'
import { catalogsApi } from '@/api/catalogsApi'
import type { CatalogEntry } from '@/types/catalogs'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('.').pop() ?? key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/catalogsApi', () => ({ catalogsApi: { list: vi.fn() } }))
const api = vi.mocked(catalogsApi, true)

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const entry = (key: string, label: string, order: number, props: CatalogEntry['props'], isSystem = true): CatalogEntry => (
  { id: order, domain: 'crm_stage', key, label, sort_order: order, is_active: true, is_system: isSystem, props }
)

describe('useCrmStages (Fase 22, B5)', () => {
  it('si el catálogo falla, rigen las 6 etapas de siempre con su categoría', async () => {
    api.list.mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useCrmStages(), { wrapper })
    await waitFor(() => expect(api.list).toHaveBeenCalled())

    expect(result.current.stages.map(s => s.id)).toEqual(['lead', 'diseno', 'cotizacion', 'propuesta', 'cerrado', 'perdido'])
    expect(result.current.isLost('perdido')).toBe(true)
    expect(result.current.isWon('cerrado')).toBe(true)
    expect(result.current.isLost('lead')).toBe(false)
  })

  it('con catálogo, una etapa propia aparece en su orden y es abierta', async () => {
    api.list.mockResolvedValue([
      entry('lead', 'Lead', 100, { categoria: 'abierta' }), entry('negociacion', 'Negociación', 450, { categoria: 'abierta', color: '#0ea5e9' }, false),
      entry('cerrado', 'Cerrado', 500, { categoria: 'ganada' }), entry('perdido', 'Perdido', 900, { categoria: 'perdida' }),
    ])
    const { result } = renderHook(() => useCrmStages(), { wrapper })
    await waitFor(() => expect(result.current.stages.map(s => s.id)).toContain('negociacion'))

    expect(result.current.stages.map(s => s.id)).toEqual(['lead', 'negociacion', 'cerrado', 'perdido'])
    expect(result.current.label('negociacion')).toBe('Negociación')
    expect(result.current.info('negociacion')).toMatchObject({ category: 'abierta', color: '#0ea5e9' })
    expect(result.current.isLost('negociacion')).toBe(false)
  })
})
