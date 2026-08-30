import { useEffect, useRef } from 'react'

const POLL_MS = 10_000

async function fetchBuildTs(): Promise<number | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return null
    const { ts } = (await res.json()) as { ts?: number }
    return ts ?? null
  } catch {
    return null
  }
}

export function useDevLiveReload() {
  const baseTs    = useRef<number | null>(null)
  const timer     = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkRef  = useRef<(() => void) | null>(null)

  useEffect(() => {
    const check = async () => {
      const current = await fetchBuildTs()
      if (current !== null && baseTs.current !== null && current !== baseTs.current) {
        window.location.reload()
      }
    }

    checkRef.current = () => void check()

    fetchBuildTs().then(ts => {
      if (ts === null) return
      baseTs.current = ts
      timer.current  = setInterval(() => void check(), POLL_MS)
    })

    const onVisible = () => { if (document.visibilityState === 'visible') checkRef.current?.() }
    const onFocus   = () => checkRef.current?.()

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      if (timer.current) clearInterval(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
}
