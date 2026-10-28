import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useTechnicalSpecRows } from './useTechnicalSpecFields'

let data: { key: string, label: string }[] | undefined
vi.mock('@/hooks/useCatalog', () => ({
  useCatalogOptions: (_domain: string, fallback: { key: string, label: string }[]) => (data && data.length > 0 ? data : fallback),
}))

// Fase 9c — la ficha técnica estructurada usa los campos del catálogo por empresa.
describe('useTechnicalSpecRows (Fase 9c)', () => {
  beforeEach(() => { data = undefined })

  it('sin ficha no hay filas', () => {
    expect(renderHook(() => useTechnicalSpecRows(null)).result.current).toEqual([])
  })

  it('usa los campos genéricos de respaldo y solo muestra los que tienen valor', () => {
    const { result } = renderHook(() => useTechnicalSpecRows({ weight: '2 kg', dimensions: '1x1', warranty: '' }))
    expect(result.current.map(r => [r.label, r.value])).toEqual([['Dimensiones', '1x1'], ['Peso', '2 kg']])
  })

  it('respeta orden y etiquetas del catálogo y conserva claves desconocidas con su clave legible', () => {
    data = [{ key: 'capacidad', label: 'Capacidad útil' }, { key: 'weight', label: 'Peso neto' }]
    const { result } = renderHook(() => useTechnicalSpecRows({ weight: '2 kg', capacidad: '10 L', clave_extra: 'x' }))
    expect(result.current.map(r => [r.label, r.value])).toEqual([['Capacidad útil', '10 L'], ['Peso neto', '2 kg'], ['Clave extra', 'x']])
  })
})
