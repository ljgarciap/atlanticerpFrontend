import { useAuthStore } from '@/store/authStore'
import type { UserFlags } from '@/types/auth'

/**
 * Fase 5a — módulos fuera del núcleo que el backend enciende por configuración (`config/modules.php`, apagados por defecto) y declara en
 * `flags` del usuario. Apagados, no tienen rutas en el backend: el frontend oculta menú, rutas y pestañas. Una sesión abierta antes de este
 * cambio no trae las banderas y se trata como apagado hasta el próximo ingreso.
 */
export type OptionalModule = 'legacy_icg' | 'lafayette'

export function isModuleEnabled(flags: Partial<UserFlags> | null | undefined, module: OptionalModule): boolean {
  return flags?.[module] === true
}

export function useModuleEnabled(module: OptionalModule): boolean {
  return useAuthStore(s => isModuleEnabled(s.user?.flags, module))
}
