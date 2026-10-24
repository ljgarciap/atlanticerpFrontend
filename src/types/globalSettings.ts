/**
 * SCRUM-944/945 (hallazgo E) — una clave numérica editable de `GlobalSetting`, tal como la lista
 * `GET /api/admin/global-settings`. `min`/`max` vienen del backend (misma validación que aplica el 422).
 */
export interface GlobalSettingItem {
  key: string
  /** Enteros (rango `min`..`max`) o interruptores booleanos (ej. `password_reset_enabled`). */
  value: number | boolean
  type: 'integer' | 'boolean'
  /** Solo para `integer`; los booleanos no tienen rango. */
  min?: number
  max?: number
  /** Agrupación visual (ej. `documents`, `notifications`, `audit_logs`). */
  group: string
  /** Clave i18n del rótulo, resuelta en el namespace `common`. */
  label_key: string
  /**
   * SCRUM-1158 — guardar este ajuste exige la contraseña del superadmin (`operator_password`). Lo manda el backend en las claves
   * `impersonation_*`; los ajustes del reset de contraseñas siguen siendo críticos por su clave (ver GlobalSettingsPanel) y los demás
   * no lo traen, así que su comportamiento no cambia.
   */
  requires_reauth?: boolean
}
