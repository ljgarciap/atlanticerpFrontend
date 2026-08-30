import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'

interface Props {
  onConfirm:  (blob: Blob) => void
  confirming: boolean
}

// REQ-253 — lienzo táctil de firma gráfica. RN2: "Firmar" deshabilitado sin trazo. RN3: "Limpiar
// firma" borra y vuelve a deshabilitar. RN4: el lienzo se bloquea mientras se está guardando (evita
// seguir dibujando durante el guardado; una vez confirmado con éxito el padre desmonta este
// componente y muestra la pantalla de confirmación, que es el bloqueo real y definitivo). Pointer
// Events (no touch/mouse separados) — un solo set de handlers cubre mouse, touch y stylus.
export default function SignaturePad({ onConfirm, confirming }: Props) {
  const { t } = useTranslation('servicios')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const [hasStroke, setHasStroke] = useState(false)

  function ctx(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext('2d') ?? null
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (confirming) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    const c = ctx()
    if (!c) return
    const { x, y } = pointerPos(e)
    c.beginPath()
    c.moveTo(x, y)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || confirming) return
    const c = ctx()
    if (!c) return
    const { x, y } = pointerPos(e)
    c.lineWidth = 2.5
    c.lineCap = 'round'
    c.strokeStyle = '#2a2520'
    c.lineTo(x, y)
    c.stroke()
    if (!hasStroke) setHasStroke(true)
  }

  function handlePointerUp() {
    drawingRef.current = false
  }

  function clear() {
    const canvas = canvasRef.current
    const c = ctx()
    if (!canvas || !c) return
    c.clearRect(0, 0, canvas.width, canvas.height)
    setHasStroke(false)
  }

  function confirm() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(blob => {
      if (blob) onConfirm(blob)
    }, 'image/png')
  }

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvasRef}
        width={340}
        height={220}
        className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-white touch-none"
        style={{ aspectRatio: '340 / 220' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <p className="text-xs text-slate-400 text-center">{t('tickets.inspectionReport.mobile.signHere')}</p>

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={clear} disabled={!hasStroke || confirming}>
          {t('tickets.inspectionReport.mobile.clearSignature')}
        </Button>
        <Button className="flex-1" onClick={confirm} disabled={!hasStroke} loading={confirming}>
          {t('tickets.inspectionReport.mobile.confirmSignature')}
        </Button>
      </div>
    </div>
  )
}
