import { describe, expect, it } from 'vitest'
import es from './locales/es/compras.json'
import en from './locales/en/compras.json'

// SCRUM-992 (Pre-QA H12) — el catálogo de Lafayette (~26K productos) usa la categoría `LAMPARAS`, que no
// tenía traducción: la UI mostraba la clave cruda `newOrder.newProduct.categories.LAMPARAS`.
describe('traducciones de categorías de producto', () => {
  const esCats = es.newOrder.newProduct.categories as Record<string, string>
  const enCats = en.newOrder.newProduct.categories as Record<string, string>

  it('LAMPARAS (categoría de Lafayette) tiene etiqueta legible en es y en', () => {
    expect(esCats.LAMPARAS).toBe('Lámparas')
    expect(enCats.LAMPARAS).toBe('Lamps')
  })

  it('es y en tienen exactamente las mismas categorías', () => {
    expect(Object.keys(enCats).sort()).toEqual(Object.keys(esCats).sort())
  })

  it('ninguna etiqueta es vacía ni parece una clave sin traducir', () => {
    for (const label of [...Object.values(esCats), ...Object.values(enCats)]) {
      expect(label.trim()).not.toBe('')
      expect(label).not.toContain('newOrder.newProduct')
    }
  })
})
