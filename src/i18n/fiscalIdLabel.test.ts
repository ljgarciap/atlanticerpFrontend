import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { getFiscalIdFullLabel, getFiscalIdLabel, setFiscalIdLabel } from '@/lib/region'

/** Fase 17b — el nombre de la identificación fiscal sale del país de la empresa; sin sesión rige «RUC» (Panamá). */
describe('etiqueta de la identificación fiscal por país', () => {
  afterEach(() => setFiscalIdLabel(undefined))

  it('por omisión es RUC / «RUC / Cédula» y se restablece con null o vacío', () => {
    expect(getFiscalIdLabel()).toBe('RUC')
    expect(getFiscalIdFullLabel()).toBe('RUC / Cédula')
    setFiscalIdLabel('NIT')
    expect(getFiscalIdLabel()).toBe('NIT')
    setFiscalIdLabel('  ')
    expect(getFiscalIdLabel()).toBe('RUC')
  })

  it('los textos traducidos toman la etiqueta del país en cada traducción', () => {
    const corto = () => i18n.t('ventasDiseno:clients.createModal.taxId', { lng: 'es' })
    expect(corto()).toBe('RUC')

    setFiscalIdLabel('NIT')
    expect(corto()).toBe('NIT')
    expect(corto()).not.toContain('RUC')
    expect(getFiscalIdFullLabel(), 'fuera de Panamá el texto largo es solo la etiqueta').toBe('NIT')
  })

  it('no queda «RUC» fijo en ningún texto traducido (solo la variable)', () => {
    const textos = import.meta.glob('./locales/**/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const fijos = Object.entries(textos).filter(([, contenido]) => /\bRUC\b/.test(contenido)).map(([archivo]) => archivo)
    expect(Object.keys(textos).length).toBeGreaterThan(5)
    expect(fijos).toEqual([])
  })
})
