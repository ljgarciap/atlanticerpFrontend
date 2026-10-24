/**
 * SCRUM-949 — helper puro compartido entre `searchSuggestionsCompras.ts` y
 * `searchSuggestionsBodega.ts`. A propósito en su propio archivo SIN importar ningún cliente de
 * API: si viviera junto a las funciones de un dominio, el otro dominio lo arrastraría por nada al
 * importar esta función — mismo motivo por el que Compras y Bodega están separados en 2 archivos
 * en primer lugar (ver docblock de cualquiera de los dos).
 */
export function dedupeSuggestions(...groups: Array<Array<string | null | undefined>>): string[] {
  const seen = new Set<string>()
  for (const group of groups) {
    for (const value of group) {
      if (value !== null && value !== undefined && value.trim() !== '') seen.add(value)
    }
  }

  return Array.from(seen)
}
