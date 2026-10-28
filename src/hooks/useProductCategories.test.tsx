import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useProductCategories } from './useProductCategories'

let data: { key: string, label: string }[] | undefined
vi.mock('@/hooks/useCatalog', () => ({
  useCatalogOptions: (_domain: string, fallback: { key: string, label: string }[]) => (data && data.length > 0 ? data : fallback),
}))

// Fase 9a — las categorías de producto salen del catálogo por empresa.
describe('useProductCategories (Fase 9a)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('usa «General» mientras el catálogo no ha cargado', () => {
    data = undefined
    const { result } = renderHook(() => useProductCategories())
    expect(result.current.options).toEqual([{ key: 'general', label: 'General' }])
  })

  it('devuelve las entradas del catálogo y resuelve la etiqueta por clave', () => {
    data = [{ key: 'general', label: 'General' }, { key: 'herramientas', label: 'Utensilios' }]
    const { result } = renderHook(() => useProductCategories())
    expect(result.current.options.map(o => o.key)).toEqual(['general', 'herramientas'])
    expect(result.current.label('herramientas')).toBe('Utensilios')
  })

  it('una categoría desactivada o desconocida se muestra con su clave legible', () => {
    data = [{ key: 'general', label: 'General' }]
    const { result } = renderHook(() => useProductCategories())
    expect(result.current.label('lamparas_de_mesa')).toBe('Lamparas de mesa')
  })
})
