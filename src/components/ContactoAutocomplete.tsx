import { useState, useEffect, useRef } from 'react'
import { autocompleteApi, type ContactSuggestion } from '@/api/autocompleteApi'

interface Props {
  value:      string
  onChange:   (nombre: string) => void
  onSelect:   (contact: ContactSuggestion) => void
  placeholder?: string
}

export default function ContactoAutocomplete({ value, onChange, onSelect, placeholder }: Props) {
  const [options, setOptions] = useState<ContactSuggestion[]>([])
  const [open,    setOpen]    = useState(false)
  const [focused, setFocused] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    onChange(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      autocompleteApi.contacts(q)
        .then(opts => { setOptions(opts); setOpen(opts.length > 0); setFocused(-1) })
        .catch(() => setOptions([]))
    }, 300)
  }

  function pick(opt: ContactSuggestion) {
    onChange(opt.nombre)
    onSelect(opt)
    setOpen(false)
    setOptions([])
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setFocused(f => Math.min(f + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setFocused(f => Math.max(f - 1, -1))
    } else if (e.key === 'Enter' && focused >= 0) {
      e.preventDefault()
      const opt = options[focused]
      if (opt) pick(opt)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#5BA5A0] focus:outline-none focus:ring-1 focus:ring-[#5BA5A0]"
      />

      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((opt, i) => (
            <li
              key={opt.nombre + (opt.email ?? '')}
              role="option"
              aria-selected={i === focused}
              onMouseDown={() => pick(opt)}
              className={[
                'cursor-pointer px-3 py-2 text-sm',
                i === focused ? 'bg-[#5BA5A0] text-white' : 'text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              <span className="font-medium">{opt.nombre}</span>
              {(opt.email ?? opt.telefono) && (
                <span className={`ml-2 text-xs ${i === focused ? 'text-teal-100' : 'text-slate-400'}`}>
                  {[opt.email, opt.telefono].filter(Boolean).join(' · ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
