import BodegaSettingsPanel from '@/components/BodegaSettingsPanel'

/**
 * SCRUM-500 — umbrales de `bodega_settings`, superadmin.all. Extraído a
 * `src/components/BodegaSettingsPanel.tsx` para SCRUM-944/945 (mismo patrón que
 * `ComprasSettingsPage`/`ComprasSettingsPanel`): esta página solo monta el panel, sin chrome
 * propio, para que la vista consolidada de superadmin (`GlobalSettingsPage`) pueda montar el
 * mismo panel sin duplicar lógica ni storage.
 */
export default function BodegaSettingsPage() {
  return <BodegaSettingsPanel />
}
