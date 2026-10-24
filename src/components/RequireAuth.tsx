import { Fragment } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import ForcePasswordChangePage from '@/pages/ForcePasswordChangePage'

/**
 * Guard de rutas autenticadas. Sin sesión -> /login, recordando la ruta pedida en `state.from` para que el login vuelva ahí (SCRUM-1159:
 * el enlace de un correo o de una notificación no debe perderse). Con la contraseña restablecida por un
 * administrador (`must_change_password`), se muestra SOLO la pantalla obligatoria de cambio, en
 * lugar de la app (AppShell/FocusedViewShell y sus rutas hijas): sin sidebar ni navegación.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const lastUserId = useAuthStore(s => s.lastUserId)
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}`, fromUserId: lastUserId }} />
  // SCRUM-1158 — durante «Ver como usuario» el flag es de la persona OBSERVADA, no de quien mira: forzar la pantalla de cambio le taparía toda
  // la app al superadmin (el cambio ya está bloqueado en el backend por ser solo lectura). Sin sesión observada, igual que siempre.
  if (user.must_change_password === true && !user.impersonation) return <ForcePasswordChangePage />
  // SCRUM-1158 — al cambiar de identidad EN SITIO (entrar o salir de «Ver como usuario») el árbol autenticado se vuelve a montar entero:
  // ningún estado local de la persona anterior (borradores, filtros, formularios) sobrevive en la pantalla de la siguiente. Es una decisión
  // propia, independiente de los hooks: el Sidebar ya llama siempre a todos sus hooks (SCRUM-1181), así que esto NO tapa ningún defecto suyo.
  return <Fragment key={`${user.id}:${user.impersonation?.id ?? ''}`}>{children}</Fragment>
}
