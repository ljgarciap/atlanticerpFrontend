import ServiciosSettingsPanel from '@/components/ServiciosSettingsPanel'

/**
 * Batch 10 (decisión de Luis 2026-08-11) — "Ajustes de Servicios". Extraído a
 * `src/components/ServiciosSettingsPanel.tsx` para SCRUM-944/945 (mismo patrón que
 * `ComprasSettingsPage`/`ComprasSettingsPanel`): esta página solo monta el panel, sin chrome
 * propio, para que la vista consolidada de superadmin (`GlobalSettingsPage`) pueda montar el
 * mismo panel sin duplicar lógica ni storage.
 */
export default function ServiciosSettingsPage() {
  return <ServiciosSettingsPanel />
}
