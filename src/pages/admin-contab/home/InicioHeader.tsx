import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { useHomeCalendarToday, useHomePendientes } from '@/hooks/useAdminContab'

/**
 * Batch Home (SCRUM-503→512), Grupo 5 (SCRUM-503, REQ-426) — encabezado de "Inicio".
 *
 * RN1: nombre completo del usuario logueado (no solo el de pila, a diferencia de otros módulos) —
 * viene del JWT vía `useAuthStore`, nunca de una llamada nueva. RN5: sin nombre resuelto, saludo
 * genérico sin romper la pantalla.
 * RN3/RN4: los conteos de "reuniones"/"pendientes" son SIEMPRE los mismos que ya muestran los
 * paneles "Mi calendario" (Grupo 2, acotado a hoy) y "Pendientes" (Grupo 3) — nunca un conteo
 * recalculado aparte, para que el encabezado nunca pueda desincronizarse de los paneles reales.
 */
export default function InicioHeader() {
  const { t } = useTranslation(['adminContab'])
  const { user } = useAuthStore()

  const fullName = user ? `${user.first_name} ${user.last_name}`.trim() : ''

  const { data: eventosHoy } = useHomeCalendarToday()
  const { data: pendientes } = useHomePendientes()

  const reuniones = eventosHoy?.data.length ?? 0
  const pendientesCount = pendientes?.count ?? 0

  const fechaLabel = fechaHoyLabel()

  return (
    <div className="mb-5">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
        {fullName ? t('adminContab:home.header.saludo', { nombre: fullName }) : t('adminContab:home.header.saludoGenerico')}
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
        {t('adminContab:home.header.subtitulo', {
          fecha:            fechaLabel,
          reunionesTexto:   t('adminContab:home.header.reunionesCount', { count: reuniones }),
          pendientesTexto:  t('adminContab:home.header.pendientesCount', { count: pendientesCount }),
        })}
      </p>
    </div>
  )
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * RN2 (SCRUM-503): "Día de la semana DD de mes" — ej. "Viernes 26 de junio", SIN coma. Se arma a
 * mano (no `Intl.DateTimeFormat`) porque el formato `long` de ICU en es-PA inserta una coma entre
 * el día de la semana y el resto ("Jueves, 27 de agosto") — hallazgo real de Visual Review, el
 * texto exacto de los escenarios de aceptación del ticket no lleva coma.
 */
function fechaHoyLabel(): string {
  const hoy = new Date()
  return `${DIAS_SEMANA[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`
}
