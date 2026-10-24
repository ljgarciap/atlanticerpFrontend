import { createContext, useContext } from 'react'
import { ventasDisenoApi, type QuotePartsApi } from '@/api/ventasDisenoApi'

/**
 * `QuotePartCard` (partidas, ítems, precios, márgenes) habla por defecto con `/ventas-diseno/quotes/...`; un provider
 * puede apuntarlo a otra API de partidas sin copiar la lógica.
 */
export const QuotePartsApiContext = createContext<QuotePartsApi | null>(null)

/** La API de partidas/ítems del contexto, o la de Cotizaciones si no hay provider. */
export function useQuotePartsApi(): QuotePartsApi {
  return useContext(QuotePartsApiContext) ?? ventasDisenoApi.quotes.parts
}
