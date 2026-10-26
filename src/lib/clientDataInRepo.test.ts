import { describe, expect, it } from 'vitest'

/**
 * Fase 4a (docs/specs/fase4-dataset-demo-generico.md, §3.3): datos del cliente anterior que no pueden volver al código versionado — número de
 * cuenta bancaria, dirección, teléfonos, correo y sitio web de su pie de página. Escanea `src` y `e2e` (Vite `import.meta.glob`, sin tipos de Node).
 */
const FORBIDDEN = ['074455', 'Times Square', 'www.atlantic.com.pa', '269-8051', '269-1828', 'atlanticlatam', 'ATLANTIC USA CORP', 'Calle 57 Este']

const files = {
  ...import.meta.glob('/src/**/*.{ts,tsx,json}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/e2e/**/*.ts', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

describe('datos del cliente anterior fuera del código (Fase 4a)', () => {
  it('se escanean los archivos (el glob no puede quedar vacío)', () => {
    expect(Object.keys(files).length).toBeGreaterThan(500)
  })

  it('src y e2e no contienen cuenta, dirección, teléfonos ni sitio web del cliente anterior', () => {
    const hits: string[] = []
    for (const [path, content] of Object.entries(files)) {
      if (path.endsWith('clientDataInRepo.test.ts')) continue
      for (const needle of FORBIDDEN) if (content.includes(needle)) hits.push(`${path}: ${needle}`)
    }
    expect(hits).toEqual([])
  })
})
