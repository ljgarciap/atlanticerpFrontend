import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import InternalTechnicianCard from '@/components/servicios/InternalTechnicianCard'
import InternalTechnicianVisitsModal from '@/components/servicios/InternalTechnicianVisitsModal'
import InternalTechnicianDetailModal from '@/components/servicios/InternalTechnicianDetailModal'
import InternalTechnicianCreateModal from '@/components/servicios/InternalTechnicianCreateModal'
import InternalTechnicianAgendaView from '@/components/servicios/InternalTechnicianAgendaView'
import InternalTechnicianStatCards from '@/components/servicios/InternalTechnicianStatCards'
import InternalTechnicianCommissionModal from '@/components/servicios/InternalTechnicianCommissionModal'
import InternalTechnicianCommissionResultModal from '@/components/servicios/InternalTechnicianCommissionResultModal'
import { IcoPlus } from '@/components/icons'
import type { InternalTechnician } from '@/types/servicios'
import type { UserInfo } from '@/types/auth'

type ViewMode = 'team' | 'agenda'

// REQ-259 RN5 — exclusivo de Aaron/Líder de Servicios.
function canRegisterTechnician(role: string | undefined): boolean {
  return role === 'lider_servicios' || role === 'superadmin'
}

// REQ-292 RN5 — Aaron y Gerencia capturan/editan la comisión mensual.
function canManageCommission(role: string | undefined): boolean {
  return role === 'lider_servicios' || role === 'management' || role === 'superadmin'
}

// Batch 10 (REQ-258 RN8) — el resultado calculado lo ve el propio técnico o Gerencia, NUNCA Aaron
// (a diferencia de canManageCommission arriba, que sí incluye lider_servicios). Se evalúa por
// técnico (no solo por rol) porque "el propio técnico" depende de cuál tarjeta es.
function canViewCommissionResultFor(user: UserInfo | null | undefined, technician: InternalTechnician): boolean {
  if (!user) return false
  if (user.role === 'management' || user.role === 'superadmin') return true
  return technician.user_id !== null && technician.user_id === user.id
}

// Fase 4 — Servicios, Batch 6 (REQ-255→260). Vive bajo /servicios/tecnicos.
export default function InternalTechniciansPage() {
  const { t }    = useTranslation('servicios')
  const user     = useAuthStore(s => s.user)
  const qc       = useQueryClient()
  const canAdd   = canRegisterTechnician(user?.role)
  const canManageComm = canManageCommission(user?.role)
  const [searchParams] = useSearchParams()

  // REQ-207 RN2 (Inicio → botón "Agenda") / REQ-208 RN2 (panel Rutas del día → "Ver agenda
  // completa") — ambos navegan acá con `?view=agenda`, siempre SIN filtro de técnico (arranca en
  // 'team' cuando no viene el query param, mismo default de siempre).
  const [view, setView]         = useState<ViewMode>(searchParams.get('view') === 'agenda' ? 'agenda' : 'team')
  const [createOpen, setCreateOpen] = useState(false)
  const [visitsFor, setVisitsFor]   = useState<InternalTechnician | null>(null)
  const [detailFor, setDetailFor]   = useState<InternalTechnician | null>(null)
  const [commissionFor, setCommissionFor] = useState<InternalTechnician | null>(null)
  const [commissionResultFor, setCommissionResultFor] = useState<InternalTechnician | null>(null)
  const [agendaFilter, setAgendaFilter] = useState<number | ''>('')

  const { data: technicians = [], isLoading } = useQuery({
    queryKey: ['servicios-internal-technicians'],
    queryFn:  () => serviciosApi.internalTechnicians.list(),
    enabled:  view === 'team',
    // SCRUM-777 (REQ-256 RN6) — el estado se calcula 100% server-side en cada request, sin
    // persistir (TechnicianStatusService); su propio docblock dice que el "refresco corto" es
    // responsabilidad del frontend. Sin esto, un reagendamiento hecho desde Tickets solo se
    // reflejaba acá tras F5 — mismo intervalo que el staleTime global (queryClient.ts).
    refetchInterval: view === 'team' ? 30_000 : false,
  })

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('technicians.internal.title')}</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
            <Button variant="secondary" active={view === 'team'} className="!rounded-none !border-0" onClick={() => setView('team')}>
              {t('technicians.internal.views.team')}
            </Button>
            <Button variant="secondary" active={view === 'agenda'} className="!rounded-none !border-0" onClick={() => setView('agenda')}>
              {t('technicians.internal.views.agenda')}
            </Button>
          </div>
          {canAdd && view === 'team' && (
            <Button onClick={() => setCreateOpen(true)} className="!inline-flex !items-center !gap-1.5">
              <IcoPlus size={14} />
              {t('technicians.internal.addButton')}
            </Button>
          )}
        </div>
      </div>

      {view === 'team' && <InternalTechnicianStatCards />}

      {view === 'agenda' ? (
        <InternalTechnicianAgendaView technicianId={agendaFilter} onFilterChange={setAgendaFilter} />
      ) : isLoading ? (
        <p className="text-slate-400 text-sm">{t('technicians.internal.card.loading')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {technicians.map(tech => (
            <InternalTechnicianCard
              key={tech.id}
              technician={tech}
              onViewVisits={setVisitsFor}
              onViewDetail={setDetailFor}
              onViewCommission={setCommissionFor}
              canManageCommission={canManageComm}
              onViewCommissionResult={setCommissionResultFor}
              canViewCommissionResult={canViewCommissionResultFor(user, tech)}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <InternalTechnicianCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false)
            void qc.invalidateQueries({ queryKey: ['servicios-internal-technicians'] })
          }}
        />
      )}
      {visitsFor && (
        <InternalTechnicianVisitsModal technician={visitsFor} onClose={() => setVisitsFor(null)} />
      )}
      {detailFor && (
        <InternalTechnicianDetailModal technician={detailFor} onClose={() => setDetailFor(null)} />
      )}
      {commissionFor && (
        <InternalTechnicianCommissionModal technician={commissionFor} onClose={() => setCommissionFor(null)} />
      )}
      {commissionResultFor && (
        <InternalTechnicianCommissionResultModal technician={commissionResultFor} onClose={() => setCommissionResultFor(null)} />
      )}
    </>
  )
}
