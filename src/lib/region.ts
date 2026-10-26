/**
 * Fase 6a — contexto regional de la empresa (país, moneda, zona horaria, locale). El backend lo manda en `/auth/me` y en el login
 * (`user.region`, viene del tenant); el store lo publica aquí al cambiar el usuario. Mientras no haya sesión (o una sesión anterior a la
 * 6a no lo traiga) rige el de Panamá, que es lo que ya usaba toda la app: cero cambio de comportamiento por omisión.
 *
 * Los formateadores de moneda, fecha y hora leen `getRegion()` EN CADA LLAMADA (no al cargar el módulo), así que un cambio de empresa o de
 * ajustes se refleja sin recargar.
 */
export interface Region {
  country:  string
  currency: string
  timezone: string
  locale:   string
}

export const DEFAULT_REGION: Region = { country: 'PA', currency: 'USD', timezone: 'America/Panama', locale: 'es-PA' }

let current: Region = DEFAULT_REGION

export function getRegion(): Region {
  return current
}

/** `undefined`/`null` (sin sesión o sesión anterior a la 6a) restablece el contexto por omisión. */
export function setRegion(region: Partial<Region> | null | undefined): void {
  current = region ? { ...DEFAULT_REGION, ...region } : DEFAULT_REGION
}
