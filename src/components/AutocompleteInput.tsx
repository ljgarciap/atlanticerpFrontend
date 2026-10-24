import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  value:        string
  onChange:     (value: string) => void
  fetchOptions: (q: string) => Promise<string[]>
  placeholder?: string
  id?:          string
  disabled?:    boolean
  /**
   * SCRUM-949 — llamado SOLO al elegir una sugerencia (click/Enter), nunca en cada tecleo — a
   * diferencia de `onChange`, que se dispara con cada cambio del input. Los 5 usos existentes de
   * este componente (`ProjectModal.tsx`) no lo pasan y siguen sin cambios: sin `onSelect`, elegir
   * una opción solo llama a `onChange`, como siempre.
   */
  onSelect?:    (value: string) => void
  /**
   * SCRUM-949 — sin esta prop, el dropdown se queda cerrado cuando `fetchOptions` no encuentra
   * nada (comportamiento de siempre, el que ya cubre `AutocompleteInput.test.tsx`). Con ella, se
   * muestra este texto en vez del listado — es el estado "sin resultados" que pide el ticket para
   * los buscadores de listado (Compras/Bodega), sin forzarlo en los usos existentes de un campo de
   * texto libre (`ProjectModal.tsx`), donde "sin sugerencias" no es un estado que haga falta anunciar.
   */
  noResultsLabel?: string
  /**
   * SCRUM-949 — Enter cuando NO hay una sugerencia enfocada (dropdown cerrado, o abierto sin
   * navegar con flechas): antes de este componente, ese Enter no hacía nada especial y el input
   * quedaba libre para un handler de `onKeyDown` propio de cada página (búsqueda de texto libre,
   * no solo de una sugerencia sugerida). Optativo — sin esta prop, ese Enter simplemente no hace
   * nada, como ya pasaba antes de agregar `onSelect`/`noResultsLabel`.
   */
  onEnterWithoutSelection?: () => void
  /**
   * SCRUM-992 (Pre-QA H14) — mínimo de caracteres (sin contar espacios de los extremos) para pedir
   * sugerencias. Debajo del mínimo no se hace ningún request, se cierra el dropdown y se descarta
   * cualquier respuesta en vuelo. Sin esta prop (0) el comportamiento es el de siempre: ProjectModal
   * y el resto de usos no cambian.
   */
  minChars?: number
}

export default function AutocompleteInput({
  value,
  onChange,
  fetchOptions,
  placeholder,
  id,
  disabled,
  onSelect,
  noResultsLabel,
  onEnterWithoutSelection,
  minChars = 0,
}: Props) {
  const [options,   setOptions]   = useState<string[]>([])
  const [open,      setOpen]      = useState(false)
  const [focused,   setFocused]   = useState(-1)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLUListElement>(null)
  // Senior Review (2026-09-22, hallazgo no bloqueante de SCRUM-949) — mismo patrón que
  // ClientPicker.tsx (SCRUM-938): sin esto, una respuesta más lenta de una tecleada ANTERIOR
  // podía llegar después de una más rápida de una tecleada posterior y pisar el desplegable con
  // resultados obsoletos. El debounce de 300ms ya evita la carrera entre tecleadas normales, pero
  // no entre dos requests que sí llegaron a dispararse (ej. red lenta/fuera de orden). Cada
  // llamada se numera y una respuesta solo se aplica si sigue siendo la más reciente en vuelo.
  const searchSeqRef = useRef(0)

  const search = useCallback(
    (q: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (minChars > 0 && q.trim().length < minChars) {
        searchSeqRef.current++
        setOptions([])
        setOpen(false)
        setFocused(-1)
        return
      }
      timerRef.current = setTimeout(() => {
        const seq = ++searchSeqRef.current
        fetchOptions(q)
          .then(opts => {
            if (seq !== searchSeqRef.current) return
            setOptions(opts)
            setOpen(opts.length > 0 || noResultsLabel !== undefined)
            setFocused(-1)
          })
          .catch(() => { if (seq === searchSeqRef.current) setOptions([]) })
      }, 300)
    },
    [fetchOptions, noResultsLabel, minChars],
  )

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    onChange(q)
    search(q)
  }

  function pick(opt: string) {
    onChange(opt)
    onSelect?.(opt)
    setOpen(false)
    setOptions([])
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter') onEnterWithoutSelection?.()

      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocused(f => Math.min(f + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocused(f => Math.max(f - 1, -1))
    } else if (e.key === 'Enter' && focused >= 0) {
      e.preventDefault()
      const opt = options[focused]
      if (opt !== undefined) pick(opt)
    } else if (e.key === 'Enter') {
      onEnterWithoutSelection?.()
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative w-full">
      <input
        ref={id ? undefined : inputRef}
        id={id}
        type="text"
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onFocus={() => search(value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#5BA5A0] focus:outline-none focus:ring-1 focus:ring-[#5BA5A0] disabled:bg-slate-50 disabled:text-slate-400"
      />

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.length === 0 && noResultsLabel !== undefined ? (
            <li className="px-3 py-1.5 text-sm text-slate-400 italic">{noResultsLabel}</li>
          ) : (
            options.map((opt, i) => (
              <li
                key={opt}
                role="option"
                aria-selected={i === focused}
                onMouseDown={() => pick(opt)}
                className={[
                  'cursor-pointer px-3 py-1.5 text-sm',
                  i === focused
                    ? 'bg-[#5BA5A0] text-white'
                    : 'text-slate-700 hover:bg-slate-50',
                ].join(' ')}
              >
                {opt}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
