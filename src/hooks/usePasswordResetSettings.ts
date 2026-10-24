import { useQuery } from '@tanstack/react-query'
import { globalSettingsApi } from '@/api/globalSettingsApi'
import type { GlobalSettingItem } from '@/types/globalSettings'

/** Claves de los ajustes globales del reset de contraseñas (cierre de H2/S2). */
export const PASSWORD_RESET_ENABLED_KEY    = 'password_reset_enabled'
export const PASSWORD_RESET_EXPIRATION_KEY = 'password_reset_expiration_hours'

/** Busca un ajuste por nombre; tolera que el backend lo prefije con su grupo (`grupo.nombre`). */
export function findGlobalSetting(items: GlobalSettingItem[] | undefined, name: string): GlobalSettingItem | undefined {
  return items?.find(i => i.key === name || i.key.endsWith(`.${name}`))
}

/** El valor de un ajuste booleano puede llegar como true/false, 1/0 o "1"/"true". */
export function settingToBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

/**
 * Valor EFECTIVO del interruptor global "Habilitar el restablecimiento de contraseñas": `false` si está
 * apagado (en producción lo está por defecto), `true` si está encendido y `undefined` mientras carga o si el
 * usuario no puede leer la configuración global (403). En ese caso se confía en la respuesta del backend.
 */
export function usePasswordResetEnabled(): boolean | undefined {
  const { data } = useQuery({
    queryKey: ['global-settings'],
    queryFn:  () => globalSettingsApi.list(),
    retry:    false,
    staleTime: 30_000,
  })
  const item = findGlobalSetting(data, PASSWORD_RESET_ENABLED_KEY)
  return item === undefined ? undefined : settingToBool(item.value)
}
