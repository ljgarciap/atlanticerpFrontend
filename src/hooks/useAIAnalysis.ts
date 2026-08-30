import { useCallback, useEffect, useRef, useState } from 'react'
import { aiApi, type AiAnalysisResponse } from '@/api/aiApi'

const POLL_INTERVAL_MS = 2_000
const TIMEOUT_MS       = 150_000

type Status = 'idle' | 'loading' | 'polling' | 'completed' | 'failed' | 'timeout'

interface AIAnalysisState {
  status:  Status
  result:  string | null
  error:   string | null
  jobId:   string | null
}

interface UseAIAnalysisReturn extends AIAnalysisState {
  run:   (fn: () => Promise<{ job_id: string }>) => void
  reset: () => void
}

const INITIAL: AIAnalysisState = { status: 'idle', result: null, error: null, jobId: null }

export function useAIAnalysis(): UseAIAnalysisReturn {
  const [state, setState] = useState<AIAnalysisState>(INITIAL)

  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jobIdRef   = useRef<string | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current)    clearInterval(pollRef.current)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    pollRef.current    = null
    timeoutRef.current = null
  }, [])

  const startPolling = useCallback((jobId: string) => {
    jobIdRef.current = jobId

    const poll = async () => {
      try {
        const data: AiAnalysisResponse = await aiApi.getAnalysis(jobId)

        if (data.status === 'completed') {
          stopPolling()
          setState({ status: 'completed', result: data.result, error: null, jobId })
        } else if (data.status === 'failed') {
          stopPolling()
          setState({ status: 'failed', result: null, error: data.error ?? 'Error desconocido', jobId })
        }
        // pending | running → keep polling
      } catch {
        stopPolling()
        setState(prev => ({ ...prev, status: 'failed', error: 'Error al verificar el estado del análisis.' }))
      }
    }

    pollRef.current = setInterval(() => { void poll() }, POLL_INTERVAL_MS)

    timeoutRef.current = setTimeout(() => {
      stopPolling()
      setState(prev => ({ ...prev, status: 'timeout', error: 'El análisis tardó demasiado. Intenta de nuevo.' }))
    }, TIMEOUT_MS)
  }, [stopPolling])

  const run = useCallback((fn: () => Promise<{ job_id: string }>) => {
    stopPolling()
    setState({ status: 'loading', result: null, error: null, jobId: null })

    fn()
      .then(({ job_id }) => {
        setState(prev => ({ ...prev, status: 'polling', jobId: job_id }))
        startPolling(job_id)
      })
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? 'Error al iniciar el análisis.'
        setState({ status: 'failed', result: null, error: msg, jobId: null })
      })
  }, [stopPolling, startPolling])

  const reset = useCallback(() => {
    stopPolling()
    setState(INITIAL)
  }, [stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  return { ...state, run, reset }
}
