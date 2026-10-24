import FraudSettingsPanel from '@/components/FraudSettingsPanel'

/**
 * REQ-635 (SCRUM-811) — administración de los umbrales de alertas de fraude de Admin&Cont.
 * Extraído a `src/components/FraudSettingsPanel.tsx` para SCRUM-944/945 (mismo patrón que
 * `ComprasSettingsPage`/`ComprasSettingsPanel`): esta página solo monta el panel, sin chrome
 * propio, para que la vista consolidada de superadmin (`GlobalSettingsPage`) pueda montar el
 * mismo panel sin duplicar lógica ni storage.
 */
export default function FraudSettingsPage() {
  return <FraudSettingsPanel />
}
