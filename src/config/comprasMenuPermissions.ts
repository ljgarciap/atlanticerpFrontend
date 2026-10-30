/**
 * SCRUM-1157 — permisos que exige la RUTA de cada ítem del menú de Compras (espejo de los `RequirePermission` de `App.tsx`;
 * "cualquiera de" la lista, o `superadmin.all`). El menú solo muestra un ítem si el usuario pasaría el guard de su ruta: antes bastaba
 * `modules.compras.view` para listar todo Compras, y quien solo tiene permisos de consulta (`compras.limited.view`) veía enlaces que
 * redirigían a inicio («opciones fantasma»). Si se cambia el guard de una ruta en `App.tsx`, actualizar acá.
 *
 * Un id ausente del mapa no se filtra (ej. «Pedidos de venta» y «Configuración» ya traen su propio gate).
 */
export const COMPRAS_ROUTE_PERMISSIONS: Record<string, readonly string[]> = {
  'compras-inicio':       ['compras.read', 'compras.edit', 'compras.approve', 'compras.sustitutos.manage', 'ventas_diseno.edit'],
  'compras-ordenes':      ['compras.read', 'compras.limited.view'],
  'compras-nueva-orden':  ['compras.write'],
  'compras-reposicion':   ['compras.write'],
  'compras-logistica':    ['compras.read', 'compras.limited.view', 'compras.logistica.view'],
  'inventario':           ['compras.read', 'compras.limited.view', 'ventas_diseno.read'],
  'compras-ingresos':     ['compras.read', 'compras.limited.view'],
  'compras-sustitutos':   ['compras.read', 'compras.sustitutos.manage', 'ventas_diseno.edit'],
  'compras-pagos':        ['compras.read'],
  'compras-agencias':     ['compras.read'],
  'compras-proveedores':  ['compras.read'],
  'compras-reclamos':     ['compras.read'],
  'compras-reportes':     ['compras.read'],
}

export function canReachComprasItem(itemId: string, permissions: readonly string[]): boolean {
  const required = COMPRAS_ROUTE_PERMISSIONS[itemId]
  if (required === undefined) return true
  return permissions.includes('superadmin.all') || required.some(p => permissions.includes(p))
}
