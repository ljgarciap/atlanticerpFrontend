import { useState } from 'react'
import { isAxiosError } from 'axios'
import type { FeAccionBoton, FeAccionResultado } from '@/types/adminContab'

/**
 * SCRUM-1007 — acción fiscal manual sobre un documento electrónico (solo Mark/superadmin; el caller lo monta
 * únicamente si el backend devolvió `accion_fe`). Pide confirmación explícita porque vuelve a hablar con la
 * DGI a través de MSL, muestra "Enviando…" mientras dura la llamada (puede tardar ~15 s por el timeout de MSL)
 * y luego el resultado real: un rechazo nuevo NO es un error, es el resultado.
 *
 * Todo el texto del resultado se muestra como texto (nunca HTML): el mensaje y el motivo vienen del backend
 * y, en el caso del motivo, de un tercero.
 */
export default function FeAccionFiscalBoton(
  { accion, disponible, onEjecutar, t }:
  {
    accion: FeAccionBoton
    /** El backend todavía ofrece la acción. Tras certificarse deja de ofrecerla: el caller mantiene el componente
     *  montado para que el resultado siga visible, pero el botón se oculta. */
    disponible: boolean
    onEjecutar: () => Promise<FeAccionResultado>
    t: (key: string) => string
  },
) {
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const k = 'adminContab:facturacion.detalle.facturacionElectronica.accion'
  const etiqueta = accion === 'reintentar' ? t(`${k}.reintentar`)
    : accion === 'reconciliar' ? t(`${k}.reconciliar`)
    : t(`${k}.actualizarEstado`)
  const textoConfirmar = accion === 'reintentar' ? t(`${k}.confirmarReintentar`)
    : accion === 'reconciliar' ? t(`${k}.confirmarReconciliar`)
    : t(`${k}.confirmarActualizar`)

  async function ejecutar() {
    setEnviando(true)
    setResultado(null)
    try {
      const r = await onEjecutar()
      const texto = r.codigo === 'ya_certificado_9022' ? t(`${k}.ya9022`) : r.mensaje
      setResultado({ tipo: 'ok', texto })
    } catch (err) {
      const mensaje = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setResultado({ tipo: 'error', texto: mensaje ?? t(`${k}.errorGenerico`) })
    } finally {
      setEnviando(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {disponible && !confirmando && !enviando && (
        <button
          type="button" onClick={() => { setResultado(null); setConfirmando(true) }}
          className="w-fit px-2.5 py-1 rounded-lg border border-primary-dark text-[11px] font-medium text-primary-dark hover:bg-primary-soft transition-colors"
        >
          {etiqueta}
        </button>
      )}

      {(confirmando || enviando) && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 flex flex-col gap-2" role="group" aria-label={t(`${k}.confirmarTitulo`)} aria-busy={enviando}>
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{t(`${k}.confirmarTitulo`)}</p>
          <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
            {textoConfirmar}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={ejecutar} disabled={enviando}
              className="px-2.5 py-1 rounded-lg bg-primary text-white text-[11px] font-medium disabled:opacity-60"
            >
              {enviando ? t(`${k}.enviando`) : t(`${k}.confirmar`)}
            </button>
            <button
              type="button" onClick={() => setConfirmando(false)} disabled={enviando}
              className="px-2.5 py-1 rounded-lg text-[11px] text-slate-500 hover:underline disabled:opacity-60"
            >
              {t(`${k}.cancelar`)}
            </button>
          </div>
        </div>
      )}

      {resultado && (
        <p
          role="status"
          className={`text-[10.5px] whitespace-pre-wrap break-words ${resultado.tipo === 'ok' ? 'text-slate-600 dark:text-slate-300' : 'text-red-500'}`}
        >
          {resultado.texto}
        </p>
      )}
    </div>
  )
}
