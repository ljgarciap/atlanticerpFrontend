import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { Button } from '@/components/ui/Button'

// Buscador con "+ Crear nuevo" inline para Cliente Master/Subcliente — usado en
// PipelineCardModal (REQ-010) y NewProjectModal (REQ-020). Extraído a componente
// compartido para no duplicar el mismo buscador+creación en los dos flujos.
// Generic en `T` desde SCRUM-122 — el caller de Arquitecto necesita propagar
// phone/email además de id/label (mismo patrón que SimpleSearchPicker<T> en
// QuotePage.tsx); Proyecto/Cliente Master/Subcliente siguen usando el default
// {id, label} sin tocar nada.
export default function ClientPicker<T extends { id: number; label: string }>({
  label, value, onSelect, search, onCreate, disabled, extraFieldLabel, extraFieldLabel2, dvFieldLabel, inputRef, hint,
}: {
  label:    string
  value:    string
  onSelect: (opt: T) => void
  search:   (q: string) => Promise<T[]>
  onCreate: (q: string, extra: string, extra2: string, dv: string) => Promise<T>
  disabled: boolean
  /** Cuando se pasa, "+ Crear nuevo" abre un segundo campo antes de poder
   *  confirmar (ej. RUC para Subcliente) en vez de crear con el primer campo solo.
   *  Si `extraFieldLabel2` NO se pasa, este campo es obligatorio. Si sí se pasa,
   *  ambos pasan a ser "al menos uno de los dos" (ej. Teléfono O Correo). */
  extraFieldLabel?: string
  /** SCRUM-122 — segundo campo opcional del mini-form de creación (ej. Correo
   *  para Arquitecto). Solo tiene efecto si `extraFieldLabel` también está seteado. */
  extraFieldLabel2?: string
  /** SCRUM-928 — tercer campo del mini-form: DV del RUC (solo dígitos, 1–2 caracteres). Desde SCRUM-1140 es OPCIONAL:
   *  una cédula puede no tener DV y la guarda de facturación lo exige solo si la DGI lo trae. Independiente de la regla
   *  "al menos uno" de los dos campos anteriores. Solo tiene efecto si `extraFieldLabel` también está seteado. */
  dvFieldLabel?: string
  /** REQ-011 criterio 2 — permite que un padre enfoque/abra este picker
   *  programaticamente (ej. al bloquear un intento de avance por falta de cliente). */
  inputRef?: React.Ref<HTMLInputElement>
  /** SCRUM-873 — texto aclaratorio chico justo debajo del label (ej. "incluir
   *  arquitecto si va a comisionar"), para dejar explícito que el campo es
   *  opcional sin depender solo de la ausencia de "*" junto al label. Opcional,
   *  no afecta a los demás callers que no lo pasan. */
  hint?: string
}) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const [query,   setQuery]   = useState(value)
  const [options, setOptions] = useState<T[]>([])
  const [open,    setOpen]    = useState(false)
  const [creating, setCreating] = useState(false)
  const [draftQuery, setDraftQuery] = useState<string | null>(null)
  const [extraValue, setExtraValue] = useState('')
  const [extraValue2, setExtraValue2] = useState('')
  const [dvValue, setDvValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setQuery(value) }, [value])

  // SCRUM-938 — carrera entre la búsqueda vacía de onFocus y la del último caracter tipeado: si la
  // de onFocus responde después, pisaba el desplegable con la lista sin filtrar. Cada llamada se
  // numera y una respuesta solo se aplica si sigue siendo la más reciente en vuelo.
  const searchSeq = useRef(0)

  const runSearch = useCallback((q: string) => {
    const seq = ++searchSeq.current
    search(q)
      .then(opts => { if (seq === searchSeq.current) { setOptions(opts); setOpen(true) } })
      .catch(() => { if (seq === searchSeq.current) setOptions([]) })
  }, [search])

  // SCRUM-1176 — escribir no manda una petición por tecla: la búsqueda sale tras 250 ms sin teclear. Enfocar el campo sí busca de inmediato.
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelPendingSearch = () => { if (typingTimer.current !== null) { clearTimeout(typingTimer.current); typingTimer.current = null } }
  const runSearchDebounced = useCallback((q: string) => {
    cancelPendingSearch()
    typingTimer.current = setTimeout(() => { typingTimer.current = null; runSearch(q) }, 250)
  }, [runSearch])
  useEffect(() => cancelPendingSearch, [])

  async function doCreate(q: string, extra: string, extra2: string, dv: string) {
    setError(null)
    setCreating(true)
    try {
      const created = await onCreate(q, extra, extra2, dv)
      onSelect(created)
      // Solo se cierra el mini-form al confirmar con éxito — si el backend rechaza (422),
      // se queda abierto con lo ya tipeado para corregir, en vez de perder los datos
      // (hallazgo real de Pre-QA, SCRUM-122, 2026-07-30).
      setDraftQuery(null)
      setExtraValue('')
      setExtraValue2('')
      setDvValue('')
    } catch (err) {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setError(message ?? t('ventasDiseno:modal.createError'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="relative w-full">
      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</label>
      {hint && <p className="-mt-0.5 mb-1 text-[11px] text-slate-400">{hint}</p>}
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        onChange={e => { setQuery(e.target.value); runSearchDebounced(e.target.value) }}
        onFocus={() => { cancelPendingSearch(); runSearch(query) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400 focus:border-[#5BA5A0] focus:outline-none"
      />
      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white dark:bg-slate-800 py-1 shadow-lg max-h-48 overflow-auto">
          {options.map(opt => (
            <li key={opt.id}
              onMouseDown={() => { onSelect(opt); setOpen(false) }}
              className="cursor-pointer px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">
              {opt.label}
            </li>
          ))}
          {/* SCRUM-79/89/122 — "+ Crear" solo aparecia con 0 resultados, pero el buscador
              hace fuzzy match tokenizado: un nombre nuevo que comparta una palabra con un
              registro existente (ej. "QA ...") siempre traia resultados y ocultaba "+ Crear"
              para siempre, aunque el nombre exacto no existiera. Ahora se ofrece junto a los
              resultados, salvo que el query ya coincida exacto con una opcion existente. */}
          {query.trim() !== '' && !creating
            && !options.some(opt => opt.label.trim().toLowerCase() === query.trim().toLowerCase())
            && (
            <li
              onMouseDown={() => {
                if (extraFieldLabel) {
                  // Requiere un segundo dato (ej. RUC) — no se puede crear con un solo
                  // click, se abre el mini-form de abajo (fuera del dropdown, para no
                  // pelear con el onBlur del input principal).
                  setDraftQuery(query)
                  setOpen(false)
                } else {
                  void doCreate(query, '', '', '')
                }
              }}
              className="cursor-pointer px-3 py-1.5 text-sm font-semibold text-[#5BA5A0]"
            >
              {t('ventasDiseno:modal.createNew', { query })}
            </li>
          )}
        </ul>
      )}

      {draftQuery !== null && (
        <div className="mt-1 p-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col gap-1.5">
          <input
            type="text"
            autoFocus
            placeholder={extraFieldLabel}
            value={extraValue}
            onChange={e => setExtraValue(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          {extraFieldLabel2 && (
            <input
              type="text"
              placeholder={extraFieldLabel2}
              value={extraValue2}
              onChange={e => setExtraValue2(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          )}
          {dvFieldLabel && (
            <input
              type="text"
              inputMode="numeric"
              placeholder={dvFieldLabel}
              value={dvValue}
              onChange={e => setDvValue(e.target.value.replace(/\D/g, '').slice(0, 2))}
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => { setDraftQuery(null); setExtraValue(''); setExtraValue2(''); setDvValue('') }}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              onClick={() => void doCreate(draftQuery, extraValue, extraValue2, dvValue)}
              disabled={(extraFieldLabel2 ? (!extraValue.trim() && !extraValue2.trim()) : !extraValue.trim()) || creating}
              loading={creating}
            >
              {t('common:actions.confirm')}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
