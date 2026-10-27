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

/**
 * Fase 6d — nombre VISIBLE del impuesto sobre ventas del país (`user.tax_label` del backend): «ITBMS» en Panamá, «IVA» en Colombia, «Sales tax» en
 * EE. UU. Solo es texto de pantalla; los textos traducidos lo reciben como `{{tax}}` (ver `i18n/index.ts`). Sin sesión rige Panamá.
 */
export const DEFAULT_TAX_LABEL = 'ITBMS'

let taxLabel = DEFAULT_TAX_LABEL

export function getTaxLabel(): string {
  return taxLabel
}

export function setTaxLabel(label: string | null | undefined): void {
  taxLabel = label && label.trim() !== '' ? label : DEFAULT_TAX_LABEL
}

/**
 * Fase 6c — cómo se llama y cómo se captura la identificación fiscal del país de la empresa (`user.fiscal_id` del backend): «RUC» con DV de
 * 1-2 dígitos en Panamá, «NIT» con DV de 1 en Colombia, «EIN / Tax ID» sin DV en EE. UU. Sin sesión (o sesión anterior a la 6c) rige Panamá.
 */
export interface FiscalId {
  label:         string
  uses_dv:       boolean
  dv_max_length: number
}

export const DEFAULT_FISCAL_ID: FiscalId = { label: 'RUC', uses_dv: true, dv_max_length: 2 }

/** Texto de un campo de identificación: en Panamá el que ya tenía la pantalla («RUC / Cédula»); en otro país, el nombre de su identificación. */
export function fiscalIdText(panamaText: string, fiscalId: FiscalId): string {
  return fiscalId.label === DEFAULT_FISCAL_ID.label ? panamaText : fiscalId.label
}
