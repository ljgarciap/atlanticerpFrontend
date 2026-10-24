/** Mueve el elemento de `from` a `to` y devuelve una lista nueva (la original no se toca). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
