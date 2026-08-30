import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'

/**
 * REQ-206 (SCRUM-269) — Encabezado de Inicio de Servicios, saludo dinámico.
 *
 * RN1: nombre de pila únicamente (sin apellido) — `user.first_name`, nunca `last_name`.
 * RN2: "visitas" del subtítulo = mismo dato que el panel Rutas del día (REQ-208, todavía sin
 *      construir) — reusa `internal-technicians/stats` (`visitas_hoy_total`), ya calculado por
 *      Batch 7/REQ-261 para las tarjetas de Equipo. No se duplica el cálculo acá.
 * RN3: "pendientes" del subtítulo = mismo dato que el panel Pendientes (REQ-210, todavía sin
 *      construir). El Excel de requerimientos define el panel Pendientes con 2 tipos de tarjeta:
 *      RN2 "Ticket sin agendar" (>3 días reportado sin `scheduled_at`, umbral configurable) y RN3
 *      "Repuesto sin llegar" (producto solicitado vía cotización/compra, vencido y sin recibir).
 *      Acá solo se cubre el primero, reusando `tickets/stats` (`sin_agendar`) — que el propio
 *      backend ya documenta como la fuente pensada para REQ-210 (ver docblock de
 *      TicketService::stats() RN4: "umbral configurable... compartido a futuro con REQ-210 de
 *      Inicio"), mismo umbral de 3 días por defecto que el Excel (ServiciosSettingsService,
 *      configurable, nunca hardcodeado acá). "Repuesto sin llegar" depende de Cotización de
 *      Servicio (Batch 11-12, sin construir todavía) — hasta que exista, ese componente siempre
 *      vale 0, así que el número mostrado hoy es exacto; cuando Cotización se construya, hay que
 *      sumarle su propio conteo acá (no antes — no hay endpoint que lo calcule todavía).
 * RN4: sin nombre resoluble → saludo genérico "Bienvenido" (sin ", "), nunca romper la pantalla.
 * Fecha del día: pedida en la descripción del ticket ("...un saludo personalizado... la fecha
 * del día, y un resumen dinámico") y en el mockup adjunto (5__Servicios_Home.html, "Viernes 26 de
 * junio · tienes X visitas..."), aunque no tiene un RN/Escenario propio — hallazgo real de Visual
 * Review 2026-08-12, faltaba en la primera pasada. Mismo patrón de locale que
 * BodegaReportesPage.tsx (Intl.DateTimeFormat 'es-ES'), capitalizado a mano porque el locale
 * devuelve el día de la semana en minúscula.
 *
 * Ambos endpoints están gateados por `permission:servicios.read` en el backend — visibles para
 * TODOS los roles del módulo (RN2/RN3: "sin importar el rol de quien inició sesión"), y el
 * subtítulo se oculta mientras cualquiera de las dos queries todavía está cargando en vez de
 * mostrar un 0 engañoso.
 */
function todayLabel(): string {
  // Intl con weekday+day+month en 'es-ES' inserta una coma ("Miércoles, 12 de agosto") que el
  // mockup no tiene ("Viernes 26 de junio") -- se le saca la coma para calzar con el mockup.
  const formatted = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date()).replace(',', '')
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

export default function ServiciosHomeHeader() {
  const { t } = useTranslation('servicios')
  const { user } = useAuthStore()

  const { data: technicianStats, isLoading: loadingTechnicianStats } = useQuery({
    queryKey: ['servicios-internal-technicians-stats'],
    queryFn:  () => serviciosApi.internalTechnicians.stats(),
  })
  const { data: ticketStats, isLoading: loadingTicketStats } = useQuery({
    queryKey: ['servicios-tickets-stats'],
    queryFn:  serviciosApi.tickets.stats,
  })

  const firstName = user?.first_name?.trim()
  const greeting  = firstName ? t('home.greeting', { name: firstName }) : t('home.greetingFallback')

  const isLoadingSummary = loadingTechnicianStats || loadingTicketStats
  const visitasHoy   = technicianStats?.visitas_hoy_total ?? 0
  const pendientes   = ticketStats?.sin_agendar ?? 0

  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{greeting}</h1>
      {!isLoadingSummary && (
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          {/* SCRUM-269 (rebote QA 2026-08-13) — "1 visitas"/"1 pendientes" no concordaban en
              número. i18next pluraliza por un solo `count` por key, y este subtítulo tiene 2
              cantidades independientes — se resuelve cada una por separado (_one/_other) y se
              interpolan ya resueltas en el string final, en vez de forzar un solo `count`. */}
          {t('home.subtitle', {
            fecha: todayLabel(),
            visitasText:    t('home.subtitleVisitas', { count: visitasHoy }),
            pendientesText: t('home.subtitlePendientes', { count: pendientes }),
          })}
        </p>
      )}
    </div>
  )
}
