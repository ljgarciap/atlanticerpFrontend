import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api/authApi'

/**
 * Fase 32 — contacto de soporte que Gerencia configura en Ajustes globales (`support_contact`). Se muestra en el
 * ingreso y en el menú del usuario; si no hay contacto configurado (o la consulta falla) no pinta nada.
 */
export default function SupportContactLine({ className = '' }: { className?: string }) {
  const { t } = useTranslation(['auth'])
  const [contact, setContact] = useState('')

  useEffect(() => {
    let alive = true
    try {
      void authApi.getSupportContact().then(r => { if (alive) setContact(r.data.support_contact) }).catch(() => undefined)
    } catch {
      // sin contacto no se muestra nada
    }
    return () => { alive = false }
  }, [])

  if (contact.trim() === '') return null
  return (
    <p className={className} data-testid="support-contact">
      {t('auth:support.contact', { contact })}
    </p>
  )
}
