import type { UserInfo } from '@/types/auth'

// SCRUM-175 (REQ-111) — hallazgo CRÍTICO de Daniela (2026-08-04): gerencia2@illuminations.com.pa
// (Yirena, role_key='lider_compras') no veía nada al entrar a AtlanticERP. Causa raíz: App.tsx tenía
// una única `FALLBACK_ROUTE = '/ventas-diseno/home'` hardcodeada, usada tanto para el redirect
// post-login como para el catch-all `*` y como destino de "acceso denegado" de
// RequirePermission/RequireRole. Yirena solo tiene `role_module_visibility` para el módulo
// `compras` (ver 2026_07_11_100001_create_auth_role_module_visibility_table.php en
// atlanticerp-backend — comportamiento de backend correcto y deliberado, no un bug), así que al
// aterrizar en `/ventas-diseno/home` el RequirePermission de esa ruta (permission
// 'ventas_diseno.read') la rebotaba... de vuelta a la misma FALLBACK_ROUTE, un loop infinito de
// <Navigate> que renderiza pantalla en blanco.
//
// Este helper reemplaza el fallback fijo por uno que resuelve la primera pantalla de Inicio de
// un módulo al que el usuario realmente tiene acceso, en el mismo orden en que Sidebar.tsx arma
// sus secciones (ventas_diseno primero, luego compras/bodega/servicios/admin_contab/gerencia/
// operaciones). Mismo criterio OR que ya usa Sidebar.tsx para ventas_diseno/compras*/bodega/
// servicios: `user.modules.<módulo>.view === true` OR el permiso legado `<módulo>.read`
// (extra_permissions individual sin visibilidad de rol no debe perder también su landing page).
//
// *compras usa 'compras.read' igual que el resto — Sidebar no tiene un caso especial para
// Compras (a diferencia de "Inventario", que sí reusa permission:compras.* con motivo propio,
// ver SCRUM-231→244 en Sidebar.tsx — no aplica acá, es una pantalla distinta).
const MODULE_HOME_ROUTES: Array<{ module: string; route: string; legacyPermission?: string }> = [
  { module: 'ventas_diseno', route: '/ventas-diseno/home', legacyPermission: 'ventas_diseno.read' },
  { module: 'compras',       route: '/compras/inicio',      legacyPermission: 'compras.read' },
  { module: 'bodega',        route: '/bodega/home',         legacyPermission: 'bodega.read' },
  { module: 'servicios',     route: '/servicios/inicio',    legacyPermission: 'servicios.read' },
  { module: 'admin_contab',  route: '/admin-contab' },
  { module: 'gerencia',      route: '/gerencia' },
  { module: 'operaciones',   route: '/operaciones' },
]

// Última red de seguridad: ninguna sección de módulo visible (ej. un usuario con solo permisos
// de Seguridad, sin ningún módulo de negocio otorgado). `/settings` no tiene ningún gate de
// permiso (ver App.tsx) — accesible a cualquier usuario autenticado, evita el mismo loop que
// causó este bug si algún día aparece un rol así.
export const UNIVERSAL_FALLBACK_ROUTE = '/settings'

/**
 * Resuelve la pantalla de Inicio real de un usuario autenticado, según los módulos a los que
 * tiene acceso (JWT `modules` + puente de compatibilidad `permissions`) — nunca un módulo fijo.
 * Usado como reemplazo de la vieja FALLBACK_ROUTE estática en App.tsx.
 */
export function getHomeRoute(user: UserInfo | null | undefined): string {
  if (!user) return '/login'

  if (user.permissions?.includes('superadmin.all')) {
    return MODULE_HOME_ROUTES[0].route
  }

  // SCRUM-771 (corrección 2026-08-18) — Líder de Operaciones: `modules.compras.view=true` vía
  // VIEW_READONLY, pero SIN `compras.read` (el permiso amplio, ver User::effectivePermissionsV2()
  // en atlanticerp-backend). '/compras/inicio' exige `compras.read` — aterrizar ahí la rebotaría en
  // loop infinito, mismo patrón de bug que el hallazgo original de Daniela documentado arriba.
  // Landing dedicado a la primera de sus 4 pantallas realmente permitidas.
  if (user.permissions?.includes('compras.limited.view') && !user.permissions?.includes('compras.read')) {
    return '/compras/ordenes'
  }

  for (const { module, route, legacyPermission } of MODULE_HOME_ROUTES) {
    const hasModuleView = user.modules?.[module]?.view === true
    const hasLegacyPermission = legacyPermission ? (user.permissions?.includes(legacyPermission) ?? false) : false
    if (hasModuleView || hasLegacyPermission) {
      return route
    }
  }

  return UNIVERSAL_FALLBACK_ROUTE
}
