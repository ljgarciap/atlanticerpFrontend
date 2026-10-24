import { useTranslation } from 'react-i18next'
import { useDemoModeActive } from '@/hooks/useDemoMode'

/**
 * docs/specs/demo-mode.md (F3) — indicador sobrio (sin emoji, paleta de marca) de que Catálogo/
 * Inventario/selector de producto están mostrando la vista filtrada de Modo Demo, para que nadie
 * confunda "filtrado por demo" con "no hay productos". Mismo estilo de badge que el status de MFA
 * en SettingsPage.tsx (pill teal claro). No renderiza nada si el modo no está activo.
 */
export default function DemoModeBadge() {
  const { t }        = useTranslation('common')
  const { isActive } = useDemoModeActive()

  if (!isActive) return null

  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: '#E3F0EE', color: '#3D7E7A' }}
    >
      {t('common:demoMode.badge')}
    </span>
  )
}
