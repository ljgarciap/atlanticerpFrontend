import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { DEFAULT_TAX_LABEL, getTaxLabel, setTaxLabel } from '@/lib/region'

/** Fase 6d — el nombre visible del impuesto sale del país de la empresa; sin sesión rige «ITBMS» (Panamá). */
describe('etiqueta del impuesto por país', () => {
  afterEach(() => setTaxLabel(undefined))

  it('por omisión es ITBMS y se restablece con null/vacío', () => {
    expect(getTaxLabel()).toBe(DEFAULT_TAX_LABEL)
    setTaxLabel('IVA')
    expect(getTaxLabel()).toBe('IVA')
    setTaxLabel('  ')
    expect(getTaxLabel()).toBe('ITBMS')
  })

  it('los textos traducidos toman el nombre del impuesto del país en cada traducción', () => {
    const texto = (lng: string) => i18n.t('adminContab:notasCredito.formulario.productosSinItbmsHint', { lng })
    expect(texto('es')).toContain('ITBMS')

    setTaxLabel('IVA')
    expect(texto('es')).toContain('IVA')
    expect(texto('es')).not.toContain('ITBMS')

    setTaxLabel('Sales tax')
    expect(texto('en')).toContain('Sales tax')
  })
})
