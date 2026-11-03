import { describe, expect, it } from 'vitest'

/**
 * Fase 17c — la entidad que antes se llamaba «Arquitecto» (el tercero que se asocia a un proyecto y puede originar una comisión externa) se
 * muestra como «Asociado». «Arquitecto» sigue existiendo como UN TIPO más del catálogo de asociados (el segmento de clientes dejó de nombrarlo en la Fase 18); esas
 * excepciones y el vocabulario propio del CRM (Fase 7c) se listan acá con su dueño. La lista solo puede encogerse: el test falla si una
 * excepción ya no usa la palabra (se retira) o si aparece un texto nuevo fuera de la lista.
 */
const EXCEPCIONES: Record<string, string> = {
  'es/ventasDiseno.json::associates.types.architect': 'tipo «Arquitecto» del catálogo de asociados',
  'en/ventasDiseno.json::associates.types.architect': 'tipo «Architect» del catálogo de asociados',
  'en/ventasDiseno.json::associates.hint': 'lista de tipos de asociado',
  'es/ventasDiseno.json::associates.hint': 'lista de tipos de asociado',
}
const PROPIOS_DEL_CRM = /^(es|en)\/crm\.json::/

function aplanar(valor: unknown, ruta: string, salida: Record<string, string>): void {
  if (typeof valor === 'string') salida[ruta] = valor
  else if (valor && typeof valor === 'object') for (const [k, v] of Object.entries(valor)) aplanar(v, ruta ? `${ruta}.${k}` : k, salida)
}

describe('vocabulario «Asociado»', () => {
  const archivos = import.meta.glob('./locales/**/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const textos: Record<string, string> = {}
  for (const [archivo, crudo] of Object.entries(archivos)) {
    const plano: Record<string, string> = {}
    aplanar(JSON.parse(crudo), '', plano)
    const nombre = archivo.replace('./locales/', '')
    for (const [ruta, texto] of Object.entries(plano)) textos[`${nombre}::${ruta}`] = texto
  }
  const usan = Object.entries(textos).filter(([, t]) => /arquitect|architect/i.test(t))

  it('ningún texto nombra «arquitecto» fuera de las excepciones', () => {
    const fuera = usan.map(([k]) => k).filter(k => !(k in EXCEPCIONES) && !PROPIOS_DEL_CRM.test(k))
    expect(fuera).toEqual([])
  })

  it('cada excepción sigue usando la palabra (si no, se retira de la lista)', () => {
    const claves = new Set(usan.map(([k]) => k))
    expect(Object.keys(EXCEPCIONES).filter(k => !claves.has(k))).toEqual([])
  })
})
