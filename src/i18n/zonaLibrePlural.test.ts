import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import es from './locales/es/bodega.json'
import en from './locales/en/bodega.json'

// SCRUM-990 (ronda 2, BAJO F3) — el aviso `sr-only` de cantidad de resultados de Zona Libre usa el plural REAL de i18next (los tests de
// componente mockean react-i18next y devuelven la clave, así que no pueden probarlo): "1 producto", no "1 productos".
async function instance(lng: 'es' | 'en') {
  const i18n = i18next.createInstance()
  await i18n.init({ lng, fallbackLng: false, resources: { es: { bodega: es }, en: { bodega: en } }, interpolation: { escapeValue: false } })
  return i18n
}

describe('bodega:warehouses.zonaLibre.resultsCount (plural)', () => {
  const KEY = 'bodega:warehouses.zonaLibre.resultsCount'

  it('es: singular con 1, plural con 0, 2 y 25816', async () => {
    const t = (await instance('es')).t
    expect(t(KEY, { count: 1 })).toBe('1 producto')
    expect(t(KEY, { count: 0 })).toBe('0 productos')
    expect(t(KEY, { count: 2 })).toBe('2 productos')
    expect(t(KEY, { count: 25816 })).toBe('25816 productos')
  })

  it('es: millones usan la categoría "many" ("1000000 de productos")', async () => {
    expect((await instance('es')).t(KEY, { count: 1_000_000 })).toBe('1000000 de productos')
  })

  it('en: singular con 1 y plural con el resto', async () => {
    const t = (await instance('en')).t
    expect(t(KEY, { count: 1 })).toBe('1 product')
    expect(t(KEY, { count: 0 })).toBe('0 products')
    expect(t(KEY, { count: 42 })).toBe('42 products')
  })

  it('no queda la clave sin sufijo (si no, i18next devolvería la clave literal)', () => {
    expect(Object.keys(es.warehouses.zonaLibre)).not.toContain('resultsCount')
    expect(Object.keys(en.warehouses.zonaLibre)).not.toContain('resultsCount')
  })
})
