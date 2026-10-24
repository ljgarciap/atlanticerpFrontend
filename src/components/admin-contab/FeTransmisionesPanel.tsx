import { useState } from 'react'
import { IcoChevronDown, IcoChevronRight } from '@/components/icons'
import type { FeTransmision } from '@/types/adminContab'
import { formatDateTimeShort } from '@/utils/dates'

/**
 * SCRUM-987 — visor de transmisiones al PAC (payload enviado + respuesta recibida), solo para
 * Gerencia/superadmin (el caller lo monta únicamente si `puede_ver_fe_transmisiones`). Carga al
 * expandir, nunca al abrir el modal. Todo se muestra como texto (JSON.stringify dentro de <pre>),
 * nunca como HTML: la respuesta es texto de un tercero.
 *
 * "Copiar" deja en el portapapeles el JSON exacto, pensado para pegarlo en un correo a soporte del
 * proveedor (MSL pidió los payloads de las pruebas con falla).
 */
export default function FeTransmisionesPanel(
  { onLoad, t }:
  { onLoad: () => Promise<FeTransmision[]>; t: (key: string) => string },
) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [items, setItems] = useState<FeTransmision[] | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Cada vez que se expande se vuelve a pedir el historial: un registro nuevo (una aprobación que
  // certifica, un polling) no debe quedar oculto por una carga vieja. El estado "cargando" se ve
  // porque `expanded` se activa ANTES del await, y se ignora el clic mientras hay una carga en curso.
  async function toggle() {
    if (loading) return
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    setLoading(true)
    setError(false)
    try {
      setItems(await onLoad())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  async function copy(key: string, value: unknown) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2))
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(current => (current === key ? null : current)), 2000)
    } catch {
      // Sin permiso de portapapeles: el JSON sigue visible y seleccionable.
    }
  }

  const k = 'adminContab:facturacion.detalle.facturacionElectronica.transmisiones'

  return (
    <div>
      <button
        type="button" onClick={toggle}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-dark hover:underline"
      >
        {expanded ? <IcoChevronDown size={11} /> : <IcoChevronRight size={11} />}
        {t(`${k}.ver`)}
      </button>

      {expanded && (
        loading ? (
          <p className="text-[10.5px] text-slate-400 mt-1">{t('common:labels.loading')}</p>
        ) : error ? (
          <p className="text-[10.5px] text-red-500 mt-1">{t(`${k}.error`)}</p>
        ) : items !== null && items.length === 0 ? (
          <p className="text-[10.5px] text-slate-400 mt-1">{t(`${k}.vacio`)}</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-2.5">
            {items?.map(tx => (
              <li key={tx.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                <p className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
                  {formatDateTimeShort(tx.created_at)} · {t(`${k}.resultado.${tx.resultado}`)}
                  {' · '}{t(`${k}.operacion.${tx.operacion}`)}
                  {tx.http_status !== null ? ` · HTTP ${tx.http_status}` : ` · ${t(`${k}.sinHttp`)}`}
                  {tx.duracion_ms !== null ? ` · ${tx.duracion_ms} ms` : ''}
                </p>
                <p className="text-[10.5px] text-slate-400 dark:text-slate-500 break-all">
                  {tx.provider}{tx.ambiente ? ` · ${tx.ambiente}` : ''}{tx.endpoint ? ` · ${tx.endpoint}` : ''}
                  {tx.request_id ? ` · ${t(`${k}.requestId`)}: ${tx.request_id}` : ''}
                </p>

                {tx.request_payload !== null && (
                  <div className="mt-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10.5px] font-medium text-slate-500">{t(`${k}.request`)}</span>
                      <button type="button" onClick={() => copy(`${tx.id}-req`, tx.request_payload)} className="text-[10.5px] text-primary-dark hover:underline">
                        {copiedKey === `${tx.id}-req` ? t(`${k}.copiado`) : t(`${k}.copiar`)}
                      </button>
                    </div>
                    <pre className="mt-0.5 max-h-56 overflow-auto rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 text-[10.5px] text-slate-700 dark:text-slate-200">
                      {JSON.stringify(tx.request_payload, null, 2)}
                    </pre>
                  </div>
                )}

                {tx.response_body !== null && (
                  <div className="mt-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10.5px] font-medium text-slate-500">{t(`${k}.respuesta`)}</span>
                      <button type="button" onClick={() => copy(`${tx.id}-res`, tx.response_body)} className="text-[10.5px] text-primary-dark hover:underline">
                        {copiedKey === `${tx.id}-res` ? t(`${k}.copiado`) : t(`${k}.copiar`)}
                      </button>
                    </div>
                    <pre className="mt-0.5 max-h-56 overflow-auto rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 text-[10.5px] text-slate-700 dark:text-slate-200">
                      {JSON.stringify(tx.response_body, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  )
}
