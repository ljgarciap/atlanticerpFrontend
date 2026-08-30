import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import ExternalTechnicianTable from '@/components/servicios/ExternalTechnicianTable'
import ExternalTechnicianCreateModal from '@/components/servicios/ExternalTechnicianCreateModal'
import ExternalTechnicianDetailModal from '@/components/servicios/ExternalTechnicianDetailModal'
import { IcoPlus } from '@/components/icons'
import type { ExternalTechnicianStatus } from '@/types/servicios'

type StatusChip = ExternalTechnicianStatus | ''

// REQ-263 RN5 / REQ-264 RN4 / REQ-265 RN1 / REQ-266 RN1 — alta, tarifa y activar/inactivar son
// exclusivos de Aaron/Líder de Servicios y Gerencia; técnico interno tiene solo consulta.
function canManage(role: string | undefined): boolean {
  return role === 'lider_servicios' || role === 'superadmin' || role === 'management'
}

// Fase 4 — Servicios, Batch 5 (REQ-263→267). Vive bajo /servicios/tickets/externos
// (REQ-287/290 — navegación directa desde "Técnicos → Técnicos Externos" en el sidebar,
// SCRUM-774, ver Sidebar.tsx).
export default function ExternalTechniciansPage() {
  const { t }    = useTranslation('servicios')
  const user     = useAuthStore(s => s.user)
  const canEdit  = canManage(user?.role)

  const [search, setSearch]     = useState('')
  const [chip, setChip]         = useState<StatusChip>('')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId]     = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['servicios-external-technicians', search, chip],
    queryFn:  () => serviciosApi.externalTechnicians.list({
      search: search || undefined,
      estado: chip || undefined,
    }),
  })

  const technicians = data?.data ?? []
  const counts       = data?.counts ?? { active: 0, inactive: 0, total: 0 }

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('technicians.external.title')}</h1>
        {canEdit && (
          <Button onClick={() => setCreateOpen(true)} className="!inline-flex !items-center !gap-1.5">
            <IcoPlus size={14} />
            {t('technicians.external.addButton')}
          </Button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap gap-2 items-center mb-3">
        <input
          type="text"
          placeholder={t('technicians.external.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />

        {/* REQ-263 RN3 — los chips muestran el conteo en tiempo real de cada categoría. */}
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
          <Button
            variant="secondary" active={chip === ''} className="!rounded-none !border-0"
            onClick={() => setChip('')}
          >
            {t('technicians.external.chips.all')} ({counts.total})
          </Button>
          <Button
            variant="secondary" active={chip === 'active'} className="!rounded-none !border-0"
            onClick={() => setChip('active')}
          >
            {t('technicians.external.chips.active')} ({counts.active})
          </Button>
          <Button
            variant="secondary" active={chip === 'inactive'} className="!rounded-none !border-0"
            onClick={() => setChip('inactive')}
          >
            {t('technicians.external.chips.inactive')} ({counts.inactive})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('technicians.external.table.loading')}</p>
      ) : (
        <ExternalTechnicianTable technicians={technicians} onViewDetail={setDetailId} />
      )}

      {createOpen && (
        <ExternalTechnicianCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(technician) => {
            setCreateOpen(false)
            setDetailId(technician.id)
          }}
        />
      )}

      {detailId !== null && (
        <ExternalTechnicianDetailModal
          technicianId={detailId}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
        />
      )}
    </>
  )
}
