import { describe, expect, it } from 'vitest'

/**
 * Fase 4b (docs/specs/fase4b-dataset-demo-generico.md §6.1) — contrato de neutralidad del frontend: ni organizaciones, marcas, bancos y lugares del cliente
 * anterior ni el vocabulario de su sector en `src` y `e2e`. Misma lista que `Tests\Support\TerminosDelClienteAnterior` del backend.
 *
 * Excepciones TEMPORALES con dueño (`ALLOWED`): son términos del MODELO (claves y etiquetas de categoría del catálogo de productos, campo `dialux`) y salen cuando su fase termine. Solo pueden encogerse: el contrato falla si un dueño ya no tiene ningún uso.
 */
const ENTIDADES = [
  'decameron', 'westland', 'costa bella', 'torre delta', 'torre pac[ií]fic', 'torre business park', 'hotel riu', 'grupo constructor delta',
  'minsa', 'ministerio de salud', 'ulatina', 'universidad latina', 'supermercado el rey', 'elrey', 'aeropuertospa', 'plazatocumen', 'plaza tocumen',
  'grupopacifico', 'cl[ií]nica san fernando', 'clinicasf', 'pitsa', 'constructoramc', 'ff-inversiones', 'atlapa', 'iluminex', 'lightcorp', 'luxtech',
  'juanma', 'bernardo', 'mauricio', 'idmar', 'maribel', 'vanessa', 'fefi', 'neil', 'quiel', 'bonvini',
  'atlantic home', 'signature lighting', 'nordic glow', 'proline comercial', 'banco general', 'banistmo', 'global bank', 'multibank', 'multiplaza',
  'super 99', 'paitilla', 'albrook', 'tocumen', 'bethania', 'costa del este', 'punta pac[ií]fica', 'condado del rey', 'farmacias transporte',
  'automotriz rey', 'ocean view', 'grupo melo', 'gelabert', 'farallon', 'illuminations',
  // Fase 8 — nombres de almacén del cliente anterior (los almacenes son configurables).
  'showrooms?', 'obarrio',
]
const SECTOR_CI = [
  'iluminaci', 'iluminacon', 'luminaria', 'l[aá]mpara', 'lamparas', 'downlight', 'candelabro', 'bombill', 'chandelier', 'luminaire', 'dialux',
  // Fase 9c — campos de la ficha técnica de iluminación (ahora un catálogo por empresa).
  'luminous', 'lum[ií]nic', 'flujo luminoso', 'casquillo', 'color_temperature', 'temperatura de color', 'ip_rating', 'socket_type',
]
// siglas: distinguen mayúsculas
const SECTOR_CS = ['\\bLED\\b', '(?<![A-Za-z])LAMP(?![A-Za-z])']

const ALLOWED: Record<string, string> = {}

const files = {
  ...import.meta.glob('/src/**/*.{ts,tsx,json}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/e2e/**/*.ts', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

function strip(text: string): string {
  let out = text
  for (const p of Object.keys(ALLOWED)) out = out.replace(new RegExp(p, 'giu'), '')
  return out
}

function find(text: string): string | null {
  const clean = strip(text)
  for (const e of ENTIDADES) { const m = clean.match(new RegExp(e, 'iu')); if (m) return m[0] }
  for (const s of SECTOR_CI) { const m = clean.match(new RegExp(s, 'iu')); if (m) return m[0] }
  for (const s of SECTOR_CS) { const m = clean.match(new RegExp(s, 'u')); if (m) return m[0] }
  return null
}

const SELF = 'neutralidadDelRepo.test.ts'

describe('neutralidad del repositorio (Fase 4b)', () => {
  it('se escanean los archivos (el glob no puede quedar vacío)', () => {
    expect(Object.keys(files).length).toBeGreaterThan(500)
  })

  it('src y e2e no llevan nombres ni vocabulario del cliente anterior', () => {
    const hits: string[] = []
    for (const [path, content] of Object.entries(files)) {
      if (path.endsWith(SELF)) continue
      content.split('\n').forEach((line, i) => {
        const t = find(line)
        if (t) hits.push(`${path}:${i + 1} «${t}»`)
      })
    }
    expect(hits.slice(0, 25), `${hits.length} línea(s) con términos del cliente anterior (se muestran 25)`).toEqual([])
  })

  it('cada dueño de excepciones temporales sigue teniendo al menos un uso', () => {
    const all = Object.entries(files).filter(([p]) => !p.endsWith(SELF)).map(([, c]) => c).join('\n')
    const used = new Set<string>()
    for (const [p, owner] of Object.entries(ALLOWED)) if (new RegExp(p, 'iu').test(all)) used.add(owner)
    for (const owner of new Set(Object.values(ALLOWED))) {
      expect(used.has(owner), `ya no queda ningún uso de las excepciones de «${owner}»: bórralas de ALLOWED`).toBe(true)
    }
  })
})
