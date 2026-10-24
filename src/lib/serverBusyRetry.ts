/**
 * Reintento ante el 503 `server_busy` de nginx (CAP-02, `limit_conn api_conc`): con más de N peticiones simultáneas a PHP el exceso se rechaza
 * al instante, sin llegar a Laravel. Una pantalla que abre 4-5 llamadas a la vez (ej. Cobros) puede perder algunas; reintentarlas con una espera
 * distinta por llamada las reparte en el tiempo en vez de volver a chocar todas juntas (el reintento de TanStack Query espera siempre 1 s fijo).
 *
 * Solo GET/HEAD/OPTIONS: una escritura que recibió 503 nunca llegó a PHP, pero reenviarla sin que la persona lo decida no es nuestra decisión.
 * Tope de intentos y esperas con variación para no convertir una saturación en una tormenta de reintentos.
 */
export const SERVER_BUSY_CODE = 'server_busy'
export const SERVER_BUSY_MAX_RETRIES = 3
const BASE_DELAYS_MS = [600, 1500, 3500]
const SAFE_METHODS = ['get', 'head', 'options']

/** Espera antes del reintento n (0 = el primero): la base ±30 % para que las llamadas simultáneas no vuelvan a coincidir. */
export function serverBusyDelay(attempt: number, random: () => number = Math.random): number {
  const base = BASE_DELAYS_MS[Math.min(attempt, BASE_DELAYS_MS.length - 1)]
  return Math.round(base * (0.7 + 0.6 * random()))
}

export function isRetryableMethod(method: string | undefined): boolean {
  return SAFE_METHODS.includes((method ?? 'get').toLowerCase())
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

/** ¿El error es el rechazo `server_busy` de nginx? Las descargas (blob) traen el cuerpo como Blob: se lee como texto. */
export async function isServerBusy(err: unknown): Promise<boolean> {
  const res = (err as { response?: { status?: number; data?: unknown } } | null)?.response
  if (!res || res.status !== 503) return false
  const data = res.data
  if (data && typeof data === 'object' && 'code' in data) return (data as { code?: unknown }).code === SERVER_BUSY_CODE
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try { return (await readBlobText(data)).includes(SERVER_BUSY_CODE) } catch { return false }
  }
  return typeof data === 'string' && data.includes(SERVER_BUSY_CODE)
}
