import FiscalSettingsPanel from '@/components/FiscalSettingsPanel'

/**
 * REQ-555→560 (SCRUM-632→637) — Configuración Fiscal, pantalla exclusiva de Mark. El gate real
 * vive en el backend: `GET /admin-contab/fiscal-settings` devuelve 403 para cualquier otro
 * usuario, no solo Mark puede editar — nadie más ni siquiera ve la pantalla (RN1 REQ-555). El
 * 403/loading/formulario se maneja en `FiscalSettingsPanel` (mismo patrón que
 * `ComprasSettingsPage`/`ComprasSettingsPanel`, SCRUM-861): esta página solo monta el panel, sin
 * chrome propio porque el panel ya renderiza su propio título — se extrajo a
 * `src/components/` para SCRUM-944/945, así que la vista consolidada de superadmin
 * (`GlobalSettingsPage`) puede montar el mismo panel, mismo storage, sin duplicar lógica.
 */
export default function FiscalConfigPage() {
  return <FiscalSettingsPanel />
}
