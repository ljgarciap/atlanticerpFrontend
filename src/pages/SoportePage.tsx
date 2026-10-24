import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { soporteApi } from '@/api/soporteApi'
import { Card } from '@/components/ui/Card'
import { IcoAlertTriangle } from '@/components/icons'

// SCRUM-923 — widget de Illumination Support Tickets embebido en AtlanticERP vía Identity Bridge.
// `embed.js` ya resuelve la carrera de "ready" internamente (reintenta sendCode() ~2s si se
// llama antes de que el widget termine de montarse, ver integrador-externo.md sección 5) —
// alcanza con llamarlo una vez el script cargó y tenemos el código, sin un listener de
// postMessage propio.
declare global {
  interface Window {
    IlluminationTickets?: { sendCode: (code: string) => void }
  }
}

export default function SoportePage() {
  const { t } = useTranslation(['common', 'soporte'])

  const [code, setCode] = useState<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [error, setError] = useState(false)

  // Paso 1 — código de un solo uso, pedido fresco en cada carga de esta página, nunca cacheado.
  useEffect(() => {
    let cancelled = false
    soporteApi.getWidgetCode()
      .then(({ code }) => { if (!cancelled) setCode(code) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [])

  // Paso 2 — carga del script del widget. Sin precedente de esto en el repo (único <iframe>
  // existente, ServiceQuotePdfViewerModal, carga un blob local, no mensajería cross-origin).
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://tickets.atlanticerp.ai/embed.js'
    script.dataset.tenant = 'atlanticerp'
    script.dataset.container = 'soporte-widget'
    script.onload = () => setScriptLoaded(true)
    script.onerror = () => setError(true)
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }, [])

  // Paso 3 — una vez el script cargó y tenemos el código, se lo entregamos al widget.
  useEffect(() => {
    if (code && scriptLoaded && window.IlluminationTickets) {
      window.IlluminationTickets.sendCode(code)
    }
  }, [code, scriptLoaded])

  const ready = code !== null && scriptLoaded

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('soporte:title')}</h1>
        <p className="text-[12px] text-slate-500">{t('soporte:subtitle')}</p>
      </div>

      <Card variant="panel" className="overflow-hidden min-h-[500px]">
        {error ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500 justify-center">
            <IcoAlertTriangle size={16} />
            {t('soporte:unavailable')}
          </div>
        ) : (
          <>
            {!ready && (
              <div className="px-4 py-8 text-sm text-slate-500 text-center">{t('soporte:loading')}</div>
            )}
            <div id="soporte-widget" className={ready ? 'min-h-[500px]' : 'hidden'} />
          </>
        )}
      </Card>
    </div>
  )
}
