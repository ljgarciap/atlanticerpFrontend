import type { ZonaLibreCatalogoMeta, ZonaLibreCatalogoResponse, ZonaLibreCatalogoRow } from '@/types/bodega'

/**
 * SCRUM-990 — espejo del CONTRATO real de `GET /bodega/zona-libre/productos` para los tests del frontend. La fuente de verdad es el
 * backend: `ZonaLibreCatalogoContractTest` (claves exactas y en orden) y `ZonaLibreCatalogoController` (validación). Si cambia allá,
 * cambia acá y el test que usa este módulo falla en el frontend: es la defensa contra la desalineación que ya ocurrió en
 * SCRUM-984 (el front mandaba `mime` y el back exigía `content_type`; cada lado testeaba contra un mock del otro).
 */

/** Claves EXACTAS y en orden de cada fila de `data` (`ZonaLibreCatalogoContractTest::ROW_KEYS`). */
export const ZONA_LIBRE_ROW_KEYS = [
  'id', 'referencia_lafayette', 'referencia', 'descripcion', 'marca', 'categoria', 'url_imagen', 'disponible', 'precio', 'synced_at',
] as const

/** Claves EXACTAS y en orden de `meta` (`ZonaLibreCatalogoContractTest::META_KEYS`). */
export const ZONA_LIBRE_META_KEYS = [
  'total', 'per_page', 'current_page', 'last_page', 'categorias', 'total_catalogo', 'ultima_sincronizacion', 'puede_ver_precio',
] as const

/** `ZonaLibreCatalogoService::SORTS` (lista blanca de `sort`). */
export const ZONA_LIBRE_SORT_WHITELIST = [
  'referencia_lafayette', 'referencia', 'descripcion', 'marca', 'categoria', 'disponible', 'precio',
] as const

/** `ZonaLibreCatalogoService::PAGE_MAX`: una página por encima responde 422. */
export const ZONA_LIBRE_PAGE_MAX = 10000

const ALLOWED_PARAMS = ['search', 'categoria', 'solo_disponibles', 'sort', 'dir', 'page', 'per_page']

/**
 * Lo que `ZonaLibreCatalogoController::productos` responde 422: devuelve la lista de violaciones (vacía = válido). Mismas reglas:
 * search 2..100 caracteres, categoria <= 255, solo_disponibles en {'true','false','1','0',true,false,1,0}, sort en la lista blanca,
 * dir asc|desc, page entero entre 1 y 10000, per_page en {25,50,100}. Además, parámetro desconocido = violación (el front no inventa claves).
 * `puedeVerPrecio` (defecto true): sin ese permiso (ni compras.read ni superadmin.all) `sort=precio` también es 422, como en el backend.
 */
export function zonaLibreContractViolations(
  params: Record<string, unknown> | undefined,
  opts: { puedeVerPrecio?: boolean } = {},
): string[] {
  const puedeVerPrecio = opts.puedeVerPrecio ?? true
  const p = params ?? {}
  const out: string[] = []
  for (const key of Object.keys(p)) {
    if (!ALLOWED_PARAMS.includes(key)) out.push(`parámetro desconocido: ${key}`)
  }
  const has = (k: string) => p[k] !== undefined && p[k] !== null
  if (has('search')) {
    const v = p.search
    if (typeof v !== 'string' || v.length < 2 || v.length > 100) out.push('search debe tener entre 2 y 100 caracteres')
  }
  if (has('categoria') && (typeof p.categoria !== 'string' || p.categoria.length > 255)) out.push('categoria inválida')
  if (has('solo_disponibles') && ![true, false, 1, 0, 'true', 'false', '1', '0'].includes(p.solo_disponibles as never)) {
    out.push('solo_disponibles inválido')
  }
  if (has('sort') && !(ZONA_LIBRE_SORT_WHITELIST as readonly string[]).includes(p.sort as string)) out.push('sort fuera de la lista blanca')
  if (has('dir') && !['asc', 'desc'].includes(p.dir as string)) out.push('dir inválido')
  if (has('page') && !(Number.isInteger(Number(p.page)) && Number(p.page) >= 1 && Number(p.page) <= ZONA_LIBRE_PAGE_MAX)) {
    out.push('page inválido (1..10000)')
  }
  if (!puedeVerPrecio && p.sort === 'precio') out.push('sort=precio requiere compras.read o superadmin.all')
  if (has('per_page') && ![25, 50, 100].includes(Number(p.per_page))) out.push('per_page fuera de 25/50/100')
  return out
}

export function makeZonaLibreRow(i: number, overrides: Partial<ZonaLibreCatalogoRow> = {}): ZonaLibreCatalogoRow {
  const n = String(i).padStart(7, '0')
  return {
    id: `LNP${n}`,
    referencia_lafayette: `LNP${n}`,
    referencia: `REF-${n}`,
    descripcion: `Luminaria de prueba ${i}`,
    marca: 'MarcaPrueba',
    categoria: 'PANELES',
    url_imagen: `https://img.lafayette-e2e.invalid/${n}.jpg`,
    disponible: 10 + i,
    precio: 12.5 + i,
    synced_at: '2026-09-30T12:00:00-05:00',
    ...overrides,
  }
}

export function makeZonaLibreResponse(
  rows: ZonaLibreCatalogoRow[] = [makeZonaLibreRow(1), makeZonaLibreRow(2), makeZonaLibreRow(3)],
  meta: Partial<ZonaLibreCatalogoMeta> = {},
): ZonaLibreCatalogoResponse {
  return {
    data: rows,
    meta: {
      total: rows.length, per_page: 25, current_page: 1, last_page: 1,
      categorias: ['PANELES', 'SPOTS'], total_catalogo: rows.length, ultima_sincronizacion: '2026-09-30T12:05:00-05:00',
      puede_ver_precio: true,
      ...meta,
    },
  }
}

/** Respuesta de un usuario SIN permiso de precio: `precio` null en TODAS las filas y `meta.puede_ver_precio` false. */
export function makeZonaLibreResponseSinPrecio(
  rows: ZonaLibreCatalogoRow[] = [makeZonaLibreRow(1), makeZonaLibreRow(2), makeZonaLibreRow(3)],
  meta: Partial<ZonaLibreCatalogoMeta> = {},
): ZonaLibreCatalogoResponse {
  return makeZonaLibreResponse(rows.map(r => ({ ...r, precio: null })), { ...meta, puede_ver_precio: false })
}
