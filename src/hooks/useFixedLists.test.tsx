import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useAdjustmentReasons, useReturnReasons, useTechnicianSpecialties } from './useFixedLists'
import { catalogsApi } from '@/api/catalogsApi'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, o?: { defaultValue?: string }) => (key.endsWith('.general') ? 'General' : (o?.defaultValue ?? key)) }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/api/catalogsApi', () => ({ catalogsApi: { list: vi.fn() } }))
const api = vi.mocked(catalogsApi, true)

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)
const entry = (key: string, label: string) => ({ id: 1, domain: 'd', key, label, sort_order: 0, is_active: true, is_system: false, props: {} })

describe('listas del catálogo (Fase 14c)', () => {
  it('sin catálogo rigen las claves de siempre; una clave desconocida se muestra legible', async () => {
    api.list.mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useAdjustmentReasons(), { wrapper })
    await waitFor(() => expect(api.list).toHaveBeenCalled())

    expect(result.current.options.map(o => o.key)).toEqual([
      'CONTEO_FISICO_NO_COINCIDE', 'PRODUCTO_DANADO_ROTO', 'PRODUCTO_VENCIDO_OBSOLETO', 'ERROR_DE_REGISTRO', 'ROBO_O_PERDIDA', 'OTRO_ESPECIFICAR',
    ])
    expect(result.current.label('MERMA_PROCESO')).toBe('Merma proceso')
  })

  it('con catálogo usa sus entradas activas y resuelve la etiqueta de una clave propia', async () => {
    api.list.mockResolvedValue([entry('electrico', 'Eléctrico'), entry('warranty', 'Garantías')])
    const { result } = renderHook(() => useTechnicianSpecialties(), { wrapper })

    await waitFor(() => expect(result.current.options).toEqual([{ key: 'electrico', label: 'Eléctrico' }, { key: 'warranty', label: 'Garantías' }]))
    expect(result.current.label('electrico')).toBe('Eléctrico')
  })

  it('las claves de respaldo de devolución son las seis de siempre', async () => {
    api.list.mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useReturnReasons(), { wrapper })
    await waitFor(() => expect(api.list).toHaveBeenCalled())

    expect(result.current.options).toHaveLength(6)
    expect(result.current.options[5]?.key).toBe('otra')
  })
})
