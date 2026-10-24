import api from './authApi'
import type { GlobalSettingItem } from '@/types/globalSettings'

/**
 * SCRUM-944/945 (hallazgo E) — claves numéricas de `GlobalSetting` (key/value transversal del
 * backend) expuestas a superadmin. Contrato: `GET /admin/global-settings` → `{ data: [...] }`,
 * `PUT /admin/global-settings/{key}` con `{ value }`. Las claves llevan puntos (`documents.max_size_mb`)
 * — se codifican en la URL.
 */
export const globalSettingsApi = {
  list: (): Promise<GlobalSettingItem[]> =>
    api.get<{ data: GlobalSettingItem[] }>('/admin/global-settings').then(r => r.data.data),

  update: (key: string, value: number | boolean, operatorPassword?: string): Promise<GlobalSettingItem> =>
    api.put<GlobalSettingItem | { data: GlobalSettingItem }>(
      `/admin/global-settings/${encodeURIComponent(key)}`,
      operatorPassword ? { value, operator_password: operatorPassword } : { value },
    ).then(r => ('data' in r.data ? r.data.data : r.data)),
}
