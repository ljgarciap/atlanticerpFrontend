import { useQueryClient, useQuery } from '@tanstack/react-query'
import { settingsApi } from '@/api/settingsApi'
import { useAuthStore } from '@/store/authStore'

/**
 * docs/specs/demo-mode.md — combina el gate GLOBAL (system_settings.demo_mode_enabled) con el gate
 * PERSONAL (users.preferences.demo_mode_enabled). Fuente única para el toggle de TopBar, el switch
 * de SettingsPage y el badge de Catálogo/Inventario/selector de producto — ninguno de esos 3
 * lugares debe volver a resolver los 2 gates por su cuenta.
 *
 * El gate global se lee vía `GET /settings/demo-mode-status` (sin permiso especial, cualquier
 * autenticado) — NO vía `getSystemSettings()` (esa sigue detrás de `settings.global`, correcta
 * para el switch de SettingsPage, pero un usuario sin ese permiso recibiría 403 acá y el toggle
 * personal/badge quedarían ocultos aunque el superadmin haya encendido el gate de verdad; gotcha
 * ya corregido, ver docs/specs/demo-mode.md).
 */
export function useDemoModeActive() {
  const { user } = useAuthStore()

  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn:  settingsApi.getPreferences,
    enabled:  !!user,
  })

  const { data: status } = useQuery({
    queryKey: ['demo-mode-status'],
    queryFn:  settingsApi.getDemoModeStatus,
    enabled:  !!user,
  })

  const globalGateOn   = status?.enabled === true
  const personalGateOn = prefs?.demo_mode_enabled === true

  return {
    globalGateOn,
    personalGateOn,
    // Único valor que Catálogo/Inventario/selector de producto deberían mirar para
    // mostrar el badge — ambos gates encendidos.
    isActive: globalGateOn && personalGateOn,
  }
}

// Prefijos de query key de los 3 puntos de integración listados en el spec (Catálogo, Inventario,
// selector de producto compartido de Servicios) — mantenerlos en un solo lugar en vez de repetir
// los strings en cada mutation que cambie alguno de los 2 gates.
const CATALOG_QUERY_KEY   = 'ventas-diseno-catalog'   // src/pages/ventas-diseno/CatalogPage.tsx
const BODEGA_INVENTORY_KEY = 'bodega/inventory'         // src/hooks/useBodega.ts (useBodegaInventory)
const SERVICIOS_LOOKUP_PRODUCTS_PREFIX = 'servicios-lookup-products' // ver ServiciosSearchPickerModal, 4 consumidores (TicketCreateModal/TicketDetailModal/ServiceQuoteModal/InsumoCreateModal), cada uno con su propio sufijo de queryKey.

export function invalidateDemoModeAffectedQueries(qc: ReturnType<typeof useQueryClient>): void {
  // 'demo-mode-status' — para que el toggle personal (TopBar) y los badges reaccionen de
  // inmediato en la MISMA sesión que acaba de cambiar cualquiera de los 2 gates (otra pestaña/
  // usuario solo lo ve tras su propio refetch, no hay push entre sesiones).
  void qc.invalidateQueries({ queryKey: ['demo-mode-status'] })
  void qc.invalidateQueries({ queryKey: [CATALOG_QUERY_KEY] })
  void qc.invalidateQueries({ queryKey: [BODEGA_INVENTORY_KEY] })
  void qc.invalidateQueries({
    predicate: query =>
      typeof query.queryKey[0] === 'string'
      && query.queryKey[0].startsWith(SERVICIOS_LOOKUP_PRODUCTS_PREFIX),
  })
}
