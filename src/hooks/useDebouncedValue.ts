import { useEffect, useState } from 'react'

/** Devuelve `value` con retraso: solo cambia cuando el valor lleva `delay` ms sin modificarse. */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

/**
 * SCRUM-992 — término de búsqueda para buscadores en tiempo real (sin botón intermedio, REQ-617):
 * el input sigue respondiendo al instante, pero el término que dispara el request solo cambia tras
 * `delay` ms sin teclear, y solo si tiene al menos `minChars` caracteres o está vacío (vaciar el
 * input restaura el listado completo). Un término de 1 carácter conserva el último válido.
 */
export function useDebouncedSearchTerm(value: string, delay = 250, minChars = 2): string {
  const debounced = useDebouncedValue(value, delay)
  const [term, setTerm] = useState(() => debounced.trim())

  useEffect(() => {
    const trimmed = debounced.trim()
    if (trimmed === '' || trimmed.length >= minChars) setTerm(trimmed)
  }, [debounced, minChars])

  return term
}
