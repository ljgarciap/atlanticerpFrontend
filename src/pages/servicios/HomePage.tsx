import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import TicketCreateModal from '@/components/servicios/TicketCreateModal'
import ServiciosHomeHeader from '@/components/servicios/ServiciosHomeHeader'
import HomeRoutesPanel from '@/components/servicios/HomeRoutesPanel'
import ServiciosMyCalendarPanel from '@/components/servicios/ServiciosMyCalendarPanel'
import HomePendingPanel from '@/components/servicios/HomePendingPanel'
import HomeMonthlyIndicators from '@/components/servicios/HomeMonthlyIndicators'
import ServiciosSinResponderPanel from '@/components/servicios/ServiciosSinResponderPanel'
import InsumosPendientesPanel from '@/components/servicios/InsumosPendientesPanel'
import EstadoTicketsPanel from '@/components/servicios/EstadoTicketsPanel'
import TicketDetailModal from '@/components/servicios/TicketDetailModal'
import { IcoPlus, IcoCalendar } from '@/components/icons'

// REQ-245 RN4 — MISMO criterio que TicketsPage.tsx `canCreateTicket()` (técnico interno/garantías
// NO tienen este botón, ver la ruta en routes/servicios.php). Senior Review 2026-08-11 (Batch 15):
// el botón "+ Nuevo ticket" de Inicio se renderizaba sin este gate, a diferencia del mismo botón
// en la pantalla de Tickets — cualquier rol veía el botón acá y solo se enteraba de que no podía
// crear al recibir un 403 real del backend al enviar el formulario.
function canCreateTicket(role: string | undefined): boolean {
  return role === 'lider_servicios' || role === 'superadmin' || role === 'management' || role === 'vendedor_disenador'
}

// REQ-214 RN3/RN4 (Grupo C, SCRUM-277) — MISMO criterio que TicketsPage.tsx `canEditTicketStatus()`
// (solo Aaron/Líder de Servicios y superadmin agendan/reagendan). Duplicada acá a propósito, no
// exportada desde TicketsPage.tsx — mismo patrón ya usado por `canCreateTicket()` arriba. Si este
// criterio cambia, actualizar las DOS copias (acá y en TicketsPage.tsx) — no diverjas una sin la otra.
function canEditTicketStatus(role: string | undefined): boolean {
  return role === 'lider_servicios' || role === 'superadmin'
}

// Fase 4 — Servicios, Batch 15 (REQ-207/208/210/211) + Batch SCRUM-322/269 (REQ-206, saludo
// dinámico) integrados en el merge a dev del 2026-08-12 — Batch 15 dejó REQ-206 explícitamente
// fuera de su alcance ("queda fuera de este batch"), y el batch de SCRUM-269 lo cerró en paralelo
// sobre un placeholder "Coming Soon" que cubría toda la pantalla. ServiciosHomeHeader reemplaza el
// <h1> estático de título por el saludo dinámico + resumen del día; el resto de Batch 15 (accesos
// rápidos, Rutas del día, Pendientes, Indicadores del mes) sigue igual. REQ-209 (Mi calendario,
// SCRUM-272) implementado 2026-08-13/14 — ver ServiciosMyCalendarPanel.tsx.
export default function ServiciosHomePage() {
  const { t }      = useTranslation(['servicios', 'common'])
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const user       = useAuthStore(s => s.user)
  const canCreate  = canCreateTicket(user?.role)
  const canSchedule = canEditTicketStatus(user?.role)
  const [createOpen, setCreateOpen] = useState(false)
  // REQ-214 (Grupo C) — modal "Ver ticket" abierto desde el panel de Insumos pendientes, siempre
  // de solo lectura (`canEdit=false`, sin Editar ni Cancelar) — solo Agendar/Reagendar respeta el
  // rol real vía `canSchedule` (ver TicketDetailModal.tsx, prop `canSchedule`).
  const [detailTicketId, setDetailTicketId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-home-summary'],
    queryFn:  () => serviciosApi.home.summary(),
  })

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <ServiciosHomeHeader />
        <div className="flex items-center gap-2">
          {/* REQ-207 RN2 — navega a Técnicos Internos → Agenda equipo, SIN filtro de técnico
              (InternalTechniciansPage lee `?view=agenda`, agendaFilter arranca en '' = "Todos"). */}
          <Button
            variant="secondary"
            className="!inline-flex !items-center !gap-1.5"
            onClick={() => navigate('/servicios/tecnicos?view=agenda')}
          >
            <IcoCalendar size={14} />
            {t('home.quickActions.agenda')}
          </Button>
          {/* REQ-207 RN1 — EXACTAMENTE el mismo TicketCreateModal del módulo Tickets, ningún
              formulario simplificado propio de Inicio. Gate de rol igual a TicketsPage (REQ-245
              RN4) — ver canCreateTicket() arriba. */}
          {canCreate && (
            <Button className="!inline-flex !items-center !gap-1.5" onClick={() => setCreateOpen(true)}>
              <IcoPlus size={14} />
              {t('tickets.create.newTicket')}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HomeRoutesPanel data={data?.rutas_dia} />
            <ServiciosMyCalendarPanel />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HomePendingPanel data={data?.pendientes} />
            <HomeMonthlyIndicators data={data?.indicadores_mes} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ServiciosSinResponderPanel data={data?.sin_responder} />
            <InsumosPendientesPanel data={data?.insumos_pendientes} onViewTicket={setDetailTicketId} />
          </div>
          <EstadoTicketsPanel />
        </div>
      )}

      {createOpen && (
        <TicketCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            void qc.invalidateQueries({ queryKey: ['servicios-home-summary'] })
            navigate('/servicios/tickets')
          }}
        />
      )}

      {detailTicketId !== null && (
        <TicketDetailModal
          key={detailTicketId}
          ticketId={detailTicketId}
          canEdit={false}
          canSchedule={canSchedule}
          onClose={() => setDetailTicketId(null)}
        />
      )}
    </>
  )
}
