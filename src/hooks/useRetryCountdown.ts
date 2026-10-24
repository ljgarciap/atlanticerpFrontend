import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Cuenta atrás en segundos para los 429 `too_many_attempts` (login, MFA, olvidé mi contraseña).
 * `start(seconds)` la arma; `remaining` baja cada segundo hasta 0 y `active` indica si hay espera.
 * Se calcula contra una marca de tiempo absoluta (no contando ticks), así que no se desfasa si la
 * pestaña se duerme.
 */
export function useRetryCountdown() {
  const [until, setUntil]       = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timer.current !== null) { clearInterval(timer.current); timer.current = null }
  }, [])

  const start = useCallback((seconds: number) => {
    setUntil(Date.now() + Math.max(1, Math.ceil(seconds)) * 1000)
  }, [])

  const clear = useCallback(() => { stop(); setUntil(null); setRemaining(0) }, [stop])

  useEffect(() => {
    if (until === null) return
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000)
      if (left <= 0) { stop(); setUntil(null); setRemaining(0) } else setRemaining(left)
    }
    tick()
    timer.current = setInterval(tick, 1000)
    return stop
  }, [until, stop])

  return { remaining, active: remaining > 0, start, clear }
}

/** `{ unit: 'seconds' | 'minutes', count }` para armar el texto legible de la espera. */
export function describeWait(seconds: number): { unit: 'seconds' | 'minutes'; count: number } {
  return seconds < 60 ? { unit: 'seconds', count: Math.max(1, seconds) } : { unit: 'minutes', count: Math.ceil(seconds / 60) }
}
