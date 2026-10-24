import { createContext, useContext } from 'react'
import { ventasDisenoApi, type QuotePartsApi } from '@/api/ventasDisenoApi'

/**
 * SCRUM-1120 — `QuotePartCard` (partidas, ítems, precios, márgenes) sirve tanto a Cotizaciones como a CotizaYA.
 * Por defecto habla con `/ventas-diseno/quotes/...`; CotizaYA lo envuelve con un provider que apunta a
 * `/ventas-diseno/cotizaya/...`. Así la lógica de Partidas se reutiliza sin una sola línea copiada.
 */
export const QuotePartsApiContext = createContext<QuotePartsApi | null>(null)

/** La API de partidas/ítems del contexto, o la de Cotizaciones si no hay provider. */
export function useQuotePartsApi(): QuotePartsApi {
  return useContext(QuotePartsApiContext) ?? ventasDisenoApi.quotes.parts
}
