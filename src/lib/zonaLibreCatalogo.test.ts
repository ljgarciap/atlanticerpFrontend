import { describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_URL_LENGTH, ZONA_LIBRE_DEFAULT_SORT, ariaSortFor, buildZonaLibreParams, displayText, effectiveSearch, hasActiveFilters,
  nextSort, safeImageUrl,
} from './zonaLibreCatalogo'
import { zonaLibreContractViolations } from '@/test/zonaLibreContract'
import { operativeWarehouses } from './warehouses'
import type { PhysicalWarehouse } from '@/types/bodega'

const base = { search: '', categoria: '', soloDisponibles: false, sort: ZONA_LIBRE_DEFAULT_SORT, dir: 'asc' as const, page: 1, perPage: 25 as const }

describe('buildZonaLibreParams', () => {
  it('estado por defecto: solo sort, dir, page y per_page (sin search, categoria ni solo_disponibles)', () => {
    expect(buildZonaLibreParams(base)).toEqual({ sort: 'referencia', dir: 'asc', page: 1, per_page: 25 })
  })

  it('search de menos de 2 caracteres (tras recortar) no se envía; con 2 o más, recortado', () => {
    expect(buildZonaLibreParams({ ...base, search: 'a' })).not.toHaveProperty('search')
    expect(buildZonaLibreParams({ ...base, search: '  a ' })).not.toHaveProperty('search')
    expect(buildZonaLibreParams({ ...base, search: '  led ' })).toMatchObject({ search: 'led' })
  })

  it('solo_disponibles solo viaja encendido; categoria solo si no está vacía', () => {
    expect(buildZonaLibreParams({ ...base, soloDisponibles: false })).not.toHaveProperty('solo_disponibles')
    expect(buildZonaLibreParams({ ...base, soloDisponibles: true })).toMatchObject({ solo_disponibles: true })
    expect(buildZonaLibreParams({ ...base, categoria: 'PANELES' })).toMatchObject({ categoria: 'PANELES' })
  })

  it('todo estado posible produce parámetros que el controlador del backend aceptaría', () => {
    for (const search of ['', 'a', 'ab', ' x y ']) for (const soloDisponibles of [false, true]) {
      for (const perPage of [25, 50, 100] as const) for (const dir of ['asc', 'desc'] as const) {
        const params = buildZonaLibreParams({ ...base, search, soloDisponibles, perPage, dir, categoria: 'X', page: 3 })
        expect(zonaLibreContractViolations(params as Record<string, unknown>)).toEqual([])
      }
    }
  })
})

describe('búsqueda, filtros y orden', () => {
  it('effectiveSearch aplica el mínimo de 2 caracteres', () => {
    expect(effectiveSearch('')).toBe('')
    expect(effectiveSearch(' a ')).toBe('')
    expect(effectiveSearch(' ab ')).toBe('ab')
  })

  it('hasActiveFilters distingue "catálogo vacío" de "sin resultados"', () => {
    expect(hasActiveFilters({ search: '', categoria: '', soloDisponibles: false })).toBe(false)
    expect(hasActiveFilters({ search: 'a', categoria: '', soloDisponibles: false })).toBe(false) // no alcanza el mínimo
    expect(hasActiveFilters({ search: 'ab', categoria: '', soloDisponibles: false })).toBe(true)
    expect(hasActiveFilters({ search: '', categoria: 'X', soloDisponibles: false })).toBe(true)
    expect(hasActiveFilters({ search: '', categoria: '', soloDisponibles: true })).toBe(true)
  })

  it('nextSort alterna el sentido en la misma columna y arranca en ascendente en otra', () => {
    expect(nextSort({ sort: 'referencia', dir: 'asc' }, 'referencia')).toEqual({ sort: 'referencia', dir: 'desc' })
    expect(nextSort({ sort: 'referencia', dir: 'desc' }, 'referencia')).toEqual({ sort: 'referencia', dir: 'asc' })
    expect(nextSort({ sort: 'referencia', dir: 'desc' }, 'precio')).toEqual({ sort: 'precio', dir: 'asc' })
  })

  it('ariaSortFor', () => {
    expect(ariaSortFor({ sort: 'precio', dir: 'asc' }, 'precio')).toBe('ascending')
    expect(ariaSortFor({ sort: 'precio', dir: 'desc' }, 'precio')).toBe('descending')
    expect(ariaSortFor({ sort: 'precio', dir: 'desc' }, 'marca')).toBe('none')
  })
})

describe('safeImageUrl (url_imagen de un tercero)', () => {
  it('acepta solo https y devuelve la forma normalizada', () => {
    expect(safeImageUrl('https://img.example.com/a.jpg')).toBe('https://img.example.com/a.jpg')
    expect(safeImageUrl('HTTPS://IMG.EXAMPLE.COM/A.jpg')).toBe('https://img.example.com/A.jpg')
    expect(safeImageUrl('https://img.example.com:8443/a b.jpg')).toBe('https://img.example.com:8443/a%20b.jpg')
  })

  it.each([
    ['javascript:alert(1)'], ['JAVASCRIPT:alert(1)'], ['data:image/png;base64,AAAA'], ['http://img.example.com/a.jpg'],
    ['blob:https://x.invalid/abc'], ['file:///etc/passwd'], ['ftp://x.invalid/a.jpg'], ['//img.example.com/a.jpg'], ['/a.jpg'],
    ['a.jpg'], ['https://u:p@img.example.com/a.jpg'], ['https://u@img.example.com/a.jpg'], ['https://'],
    ['https://img.example.com/a\nb.jpg'], ['https://img.example.com/a\tb.jpg'], ['https://img.example.com/a\u0000b.jpg'],
    ['https://img.example.com/a\u007Fb.jpg'], ['https://img.example.com/a\u0085b.jpg'],
    [' https://img.example.com/a.jpg'], ['https://img.example.com/a.jpg '], [''], ['   '],
  ])('rechaza %j', raw => {
    expect(safeImageUrl(raw)).toBeNull()
  })

  it('rechaza null, undefined y valores que no son string', () => {
    expect(safeImageUrl(null)).toBeNull()
    expect(safeImageUrl(undefined)).toBeNull()
    expect(safeImageUrl(42 as unknown as string)).toBeNull()
  })

  it(`rechaza una URL de más de ${MAX_IMAGE_URL_LENGTH} caracteres y acepta una justo en el límite`, () => {
    const prefix = 'https://img.example.com/'
    expect(safeImageUrl(prefix + 'a'.repeat(MAX_IMAGE_URL_LENGTH - prefix.length))).not.toBeNull()
    expect(safeImageUrl(prefix + 'a'.repeat(MAX_IMAGE_URL_LENGTH - prefix.length + 1))).toBeNull()
  })
})

describe('displayText (texto de un tercero)', () => {
  it('quita controles de dirección, convierte controles en espacio y colapsa espacios', () => {
    expect(displayText('uno\u0000dos')).toBe('uno dos')
    expect(displayText('a‮b⁦c')).toBe('abc')
    expect(displayText('  a \n\n b\t c  ')).toBe('a b c')
  })

  it('no interpreta marcado: devuelve el texto literal', () => {
    expect(displayText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })

  it('null, undefined, vacío o solo controles -> null', () => {
    expect(displayText(null)).toBeNull()
    expect(displayText(undefined)).toBeNull()
    expect(displayText('')).toBeNull()
    expect(displayText('\u0000\n\t')).toBeNull()
  })
})

describe('operativeWarehouses', () => {
  const w = (id: number, solo: boolean): PhysicalWarehouse => ({
    id, name: `B${id}`, responsable: null, capacidad_pct: null, modo_detalle: 'ubicacion_exacta', solo_consulta: solo,
  })

  it('excluye las bodegas de solo consulta y conserva el orden', () => {
    expect(operativeWarehouses([w(1, false), w(2, true), w(3, false)]).map(x => x.id)).toEqual([1, 3])
  })

  it('lista vacía -> vacía', () => {
    expect(operativeWarehouses([])).toEqual([])
  })
})
