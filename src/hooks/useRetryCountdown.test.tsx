import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeWait, useRetryCountdown } from './useRetryCountdown'

describe('useRetryCountdown', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('arranca inactivo', () => {
    const { result } = renderHook(() => useRetryCountdown())
    expect(result.current.active).toBe(false)
    expect(result.current.remaining).toBe(0)
  })

  it('start(n) activa la espera y baja cada segundo hasta desactivarse', () => {
    const { result } = renderHook(() => useRetryCountdown())
    act(() => { result.current.start(3) })
    expect(result.current.active).toBe(true)
    expect(result.current.remaining).toBe(3)

    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.remaining).toBe(2)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current.active).toBe(false)
    expect(result.current.remaining).toBe(0)
  })

  it('nunca arma una espera menor a 1 segundo', () => {
    const { result } = renderHook(() => useRetryCountdown())
    act(() => { result.current.start(0) })
    expect(result.current.remaining).toBe(1)
  })

  it('clear() cancela la espera de inmediato', () => {
    const { result } = renderHook(() => useRetryCountdown())
    act(() => { result.current.start(30) })
    act(() => { result.current.clear() })
    expect(result.current.active).toBe(false)
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(result.current.remaining).toBe(0)
  })

  it('volver a llamar start() reemplaza la espera anterior', () => {
    const { result } = renderHook(() => useRetryCountdown())
    act(() => { result.current.start(10) })
    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { result.current.start(60) })
    expect(result.current.remaining).toBe(60)
  })

  it('al desmontar no deja temporizadores vivos', () => {
    const { result, unmount } = renderHook(() => useRetryCountdown())
    act(() => { result.current.start(30) })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('describeWait', () => {
  it.each([
    [1, 'seconds', 1], [30, 'seconds', 30], [59, 'seconds', 59],
    [60, 'minutes', 1], [61, 'minutes', 2], [120, 'minutes', 2], [300, 'minutes', 5],
  ])('%i s -> %s %i', (s, unit, count) => {
    expect(describeWait(s)).toEqual({ unit, count })
  })

  it('nunca devuelve 0 segundos', () => {
    expect(describeWait(0)).toEqual({ unit: 'seconds', count: 1 })
  })
})
