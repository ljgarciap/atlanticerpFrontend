import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  value:        string
  onChange:     (value: string) => void
  fetchOptions: (q: string) => Promise<string[]>
  placeholder?: string
  id?:          string
  disabled?:    boolean
}

export default function AutocompleteInput({
  value,
  onChange,
  fetchOptions,
  placeholder,
  id,
  disabled,
}: Props) {
  const [options,   setOptions]   = useState<string[]>([])
  const [open,      setOpen]      = useState(false)
  const [focused,   setFocused]   = useState(-1)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLUListElement>(null)

  const search = useCallback(
    (q: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        fetchOptions(q)
          .then(opts => {
            setOptions(opts)
            setOpen(opts.length > 0)
            setFocused(-1)
          })
          .catch(() => setOptions([]))
      }, 300)
    },
    [fetchOptions],
  )

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    onChange(q)
    search(q)
  }

  function pick(opt: string) {
    onChange(opt)
    setOpen(false)
    setOptions([])
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
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
          {options.map((opt, i) => (
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
          ))}
        </ul>
      )}
    </div>
  )
}
