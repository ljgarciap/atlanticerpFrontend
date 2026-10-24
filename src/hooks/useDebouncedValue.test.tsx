import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDebouncedValue, useDebouncedSearchTerm } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('conserva el valor inicial y solo cambia tras el retraso', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 250), { initialProps: { v: 'a' } })
    rerender({ v: 'ab' })
    expect(result.current).toBe('a')
    act(() => { vi.advanceTimersByTime(249) })
    expect(result.current).toBe('a')
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe('ab')
  })
})

describe('useDebouncedSearchTerm', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('una ráfaga de 10 teclas produce un único cambio de término', () => {
    const seen: string[] = []
    const { result, rerender } = renderHook(({ v }) => {
      const term = useDebouncedSearchTerm(v)
      if (seen[seen.length - 1] !== term) seen.push(term)
      return term
    }, { initialProps: { v: '' } })

    const word = 'luminaria1'
    for (let i = 1; i <= word.length; i++) {
      rerender({ v: word.slice(0, i) })
      act(() => { vi.advanceTimersByTime(50) })
    }
    expect(result.current).toBe('')
    act(() => { vi.advanceTimersByTime(250) })

    expect(result.current).toBe('luminaria1')
    expect(seen).toEqual(['', 'luminaria1'])
  })

  it('un solo carácter no dispara: conserva el último término válido', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedSearchTerm(v), { initialProps: { v: 'lamp' } })
    act(() => { vi.advanceTimersByTime(250) })
    expect(result.current).toBe('lamp')
    rerender({ v: 'l' })
    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBe('lamp')
  })

  it('vaciar el input restaura el listado completo', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedSearchTerm(v), { initialProps: { v: 'lamp' } })
    act(() => { vi.advanceTimersByTime(250) })
    rerender({ v: '' })
    act(() => { vi.advanceTimersByTime(250) })
    expect(result.current).toBe('')
  })
})
