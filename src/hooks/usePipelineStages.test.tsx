import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { usePipelineStages } from './usePipelineStages'
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
  { id: order, domain: 'pipeline_stage', key, label, sort_order: order, is_active: true, is_system: isSystem, props }
)
const SYSTEM = [
  entry('lead', 'Lead', 100, { categoria: 'abierta' }), entry('design', 'Diseño', 200, { categoria: 'abierta' }),
  entry('quote', 'Cotización', 300, { categoria: 'abierta' }), entry('proposal', 'Propuesta', 400, { categoria: 'abierta' }),
  entry('approved', 'Aprobado', 500, { categoria: 'ganada' }), entry('lost', 'Perdido', 900, { categoria: 'perdida' }),
]

describe('usePipelineStages', () => {
  it('mientras carga o si falla, rigen las 6 etapas de sistema con su flujo y su color', async () => {
    api.list.mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => usePipelineStages(), { wrapper })
    await waitFor(() => expect(api.list).toHaveBeenCalled())

    expect(result.current.keys).toEqual(['lead', 'design', 'quote', 'proposal', 'approved', 'lost'])
    expect(result.current.linear).toEqual(['lead', 'design', 'quote', 'proposal', 'approved'])
    expect(result.current.next('lead')).toBe('design')
    expect(result.current.next('proposal')).toBe('approved')
    expect(result.current.next('approved')).toBeNull()
    expect(result.current.next('lost')).toBeNull()
    expect(result.current.isWon('approved')).toBe(true)
    expect(result.current.isLost('lost')).toBe(true)
    expect(result.current.isOpen('quote')).toBe(true)
    expect(result.current.color('approved')).toBe('#16a34a')
  })

  it('con catálogo, una etapa propia se intercala en el flujo y es abierta', async () => {
    api.list.mockResolvedValue([...SYSTEM, entry('negociacion', 'Negociación', 450, { categoria: 'abierta', color: '#0ea5e9' }, false)])
    const { result } = renderHook(() => usePipelineStages(), { wrapper })
    await waitFor(() => expect(result.current.keys).toContain('negociacion'))

    expect(result.current.linear).toEqual(['lead', 'design', 'quote', 'proposal', 'negociacion', 'approved'])
    expect(result.current.next('proposal')).toBe('negociacion')
    expect(result.current.next('negociacion')).toBe('approved')
    expect(result.current.isOpen('negociacion')).toBe(true)
    expect(result.current.isWon('negociacion')).toBe(false)
    expect(result.current.label('negociacion')).toBe('Negociación')
    expect(result.current.color('negociacion')).toBe('#0ea5e9')
    expect(result.current.info('negociacion').isSystem).toBe(false)
  })

  it('isAtOrAfter e isBefore responden por posición, también con una etapa propia', async () => {
    api.list.mockResolvedValue([...SYSTEM, entry('visita', 'Visita técnica', 250, { categoria: 'abierta' }, false)])
    const { result } = renderHook(() => usePipelineStages(), { wrapper })
    await waitFor(() => expect(result.current.keys).toContain('visita'))

    expect(result.current.isBefore('visita', 'quote')).toBe(true)
    expect(result.current.isAtOrAfter('visita', 'quote')).toBe(false)
    expect(result.current.isAtOrAfter('approved', 'proposal')).toBe(true)
    expect(result.current.isAtOrAfter('lost', 'proposal')).toBe(false)
    expect(result.current.isBefore('lost', 'quote')).toBe(false)
  })

  it('el color del catálogo manda y, sin él, rige el de siempre de la etapa de sistema', async () => {
    api.list.mockResolvedValue(SYSTEM.map(e => (e.key === 'lead' ? { ...e, props: { categoria: 'abierta', color: '#111111' } } : e)))
    const { result } = renderHook(() => usePipelineStages(), { wrapper })
    await waitFor(() => expect(result.current.color('lead')).toBe('#111111'))

    expect(result.current.color('design')).toBe('#3b82f6')
  })
})
