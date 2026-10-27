import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTicketTypes } from './useTicketTypes'
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

const entry = (key: string, label: string, props: CatalogEntry['props']): CatalogEntry => (
  { id: 1, domain: 'ticket_type', key, label, sort_order: 0, is_active: true, is_system: false, props }
)

describe('useTicketTypes', () => {
  it('mientras carga o si falla, rigen los 4 tipos de siempre con su flujo', async () => {
    api.list.mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useTicketTypes(), { wrapper })
    await waitFor(() => expect(api.list).toHaveBeenCalled())

    expect(result.current.keys).toEqual(['installation', 'warranty', 'claim', 'retrofit'])
    expect(result.current.is('claim', 'reclamo')).toBe(true)
    expect(result.current.is('warranty', 'reclamo')).toBe(false)
    expect(result.current.subtypes('installation')).toEqual(['installation', 'inspection'])
    expect(result.current.subtypes('claim')).toEqual([])
    expect(result.current.color('retrofit')).toBe('#8b5cf6')
  })

  it('con catálogo, un tipo nuevo hereda el comportamiento que eligió la empresa', async () => {
    api.list.mockResolvedValue([
      entry('claim', 'Reclamo', { comportamiento: 'reclamo', prefijo: 'REC', sla_dias: 2, color: '#ef4444', subtipos: [] }),
      entry('mantenimiento', 'Mantenimiento', { comportamiento: 'reclamo', prefijo: 'MNT', sla_dias: 4, subtipos: ['preventivo', 'correctivo'] }),
    ])
    const { result } = renderHook(() => useTicketTypes(), { wrapper })
    await waitFor(() => expect(result.current.keys).toEqual(['claim', 'mantenimiento']))

    expect(result.current.label('mantenimiento')).toBe('Mantenimiento')
    expect(result.current.is('mantenimiento', 'reclamo')).toBe(true)
    expect(result.current.subtypes('mantenimiento')).toEqual(['preventivo', 'correctivo'])
    expect(result.current.info('mantenimiento').slaDays).toBe(4)
    expect(result.current.color('mantenimiento')).toBe('#6b7280') // sin color: gris por defecto
  })

  it('un tipo desactivado (tickets viejos) cae al respaldo de sistema o, si es desconocido, a genérico', async () => {
    api.list.mockResolvedValue([entry('claim', 'Reclamo', { comportamiento: 'reclamo' })])
    const { result } = renderHook(() => useTicketTypes(), { wrapper })
    await waitFor(() => expect(result.current.keys).toEqual(['claim']))

    expect(result.current.is('warranty', 'garantia')).toBe(true) // de sistema, aunque no esté en el catálogo activo
    expect(result.current.label('viejo')).toBe('viejo')
    expect(result.current.is('viejo', 'generico')).toBe(true)
    expect(result.current.info(null).behavior).toBe('generico')
  })
})
