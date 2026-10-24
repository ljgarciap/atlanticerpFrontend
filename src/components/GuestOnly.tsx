import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { getHomeRoute } from '@/lib/homeRoute'
import { returnPathFor } from '@/lib/returnPath'

/**
 * Pantallas solo para quien NO tiene sesión (login, registro, recuperar contraseña). Con sesión redirige: al destino que se pidió antes de
 * iniciarla (`state.from`, SCRUM-1159) si es una ruta interna segura, y si no al inicio del usuario.
 *
 * Importa que lo respete AQUÍ y no solo en `LoginPage`: al iniciar sesión el store cambia y este guard redirige en cuanto re-renderiza, antes o
 * después de la navegación propia del login — si ignorara `state.from`, el enlace de un correo se perdía igual aunque el login lo supiera.
 */
export default function GuestOnly({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const location = useLocation()
  if (!user) return <>{children}</>
  const returnTo = returnPathFor(location.state, user.id)
  return <Navigate to={returnTo ?? getHomeRoute(user)} replace />
}
