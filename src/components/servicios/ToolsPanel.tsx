import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import ToolTable from './ToolTable'
import ToolCreateModal from './ToolCreateModal'
import ToolPurchaseRequestModal from './ToolPurchaseRequestModal'
import { TOOL_ESTADOS } from '@/types/servicios'
import type { Tool, ToolEstado } from '@/types/servicios'
import { IcoPlus } from '@/components/icons'

const BODEGA = 'bodega'

// REQ-269/270/271/272 — exclusivo de Aaron/Líder de Servicios y superadmin (mismo patrón que
// canEditTicketStatus en TicketsPage.tsx). Técnico interno y otros roles del módulo ven la
// pantalla completa en modo lectura.
function canManageTools(role: string | undefined): boolean {
  return role === 'lider_servicios' || role === 'superadmin'
}

// REQ-268→272 (Batch 13 Grupo D parte 1). Sub-vista "Herramientas" de Insumos y Herramientas.
export default function ToolsPanel() {
  const { t }   = useTranslation('servicios')
  const qc      = useQueryClient()
  const user    = useAuthStore(s => s.user)
  const canEdit = canManageTools(user?.role)

  const [search, setSearch]         = useState('')
  const [estado, setEstado]         = useState<ToolEstado | ''>('')
  const [assignedTo, setAssignedTo] = useState<string>('')   // '' | 'bodega' | technician id
  const [createOpen, setCreateOpen]           = useState(false)
  const [replenishTarget, setReplenishTarget] = useState<Tool | null>(null)

  const { data: technicians = [] } = useQuery({
    queryKey: ['servicios-internal-technicians-list'],
    queryFn:  () => serviciosApi.internalTechnicians.list(),
  })

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ['servicios-tools', search, estado, assignedTo],
    queryFn:  () => serviciosApi.tools.list({
      search:      search || undefined,
      estado:      estado || undefined,
      assigned_to: assignedTo === '' ? undefined : assignedTo === BODEGA ? BODEGA : Number(assignedTo),
    }),
  })

  // GET /servicios/tools no incluye las solicitudes de herramienta nueva (REQ-271) — viven en un
  // endpoint separado, sin filtro de servidor (devuelve TODAS, pendientes y ya recibidas);
  // ToolTable filtra las relevantes (ver docblock ahí).
  const { data: purchaseRequests = [] } = useQuery({
    queryKey: ['servicios-tools-purchase-requests'],
    queryFn:  () => serviciosApi.tools.purchaseRequests(),
  })

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['servicios-tools'] })
    void qc.invalidateQueries({ queryKey: ['servicios-tools-purchase-requests'] })
    // SCRUM-777 — asignar/retirar una herramienta acá debe reflejarse de inmediato en el
    // contador "Herramientas asignadas" de la tarjeta de Técnicos Internos (dos query keys
    // distintas apuntando al mismo endpoint: esta misma page y InternalTechniciansPage).
    void qc.invalidateQueries({ queryKey: ['servicios-internal-technicians-list'] })
    void qc.invalidateQueries({ queryKey: ['servicios-internal-technicians'] })
  }

  return (
    <div>
      {canEdit && (
        <div className="flex justify-end mb-3">
          <Button onClick={() => setCreateOpen(true)} className="!inline-flex !items-center !gap-1.5">
            <IcoPlus size={14} />
            {t('tools.addButton')}
          </Button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-wrap gap-2 items-center mb-3">
        <input
          type="text"
          placeholder={t('tools.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />

        <select
          aria-label={t('tools.filters.assignedLabel')}
          value={assignedTo}
          onChange={e => setAssignedTo(e.target.value)}
          className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-2 py-2 text-sm bg-white focus:outline-none focus:border-primary"
        >
          <option value="">{t('tools.filters.allAssigned')}</option>
          <option value={BODEGA}>{t('tools.filters.bodega')}</option>
          {technicians.map(tech => (
            <option key={tech.id} value={tech.id}>{tech.nombre}</option>
          ))}
        </select>

        <select
          aria-label={t('tools.filters.estadoLabel')}
          value={estado}
          onChange={e => setEstado(e.target.value as ToolEstado | '')}
          className="rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 px-2 py-2 text-sm bg-white focus:outline-none focus:border-primary"
        >
          <option value="">{t('tools.filters.allEstados')}</option>
          {TOOL_ESTADOS.map(e => (
            <option key={e} value={e}>{t(`tools.estados.${e}`)}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('tools.table.loading')}</p>
      ) : (
        <ToolTable
          tools={tools}
          purchaseRequests={purchaseRequests}
          technicians={technicians}
          canEdit={canEdit}
          onChanged={invalidate}
          onRequestReplenish={setReplenishTarget}
        />
      )}

      {createOpen && (
        <ToolCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); invalidate() }}
        />
      )}

      {replenishTarget && (
        <ToolPurchaseRequestModal
          tool={replenishTarget}
          onClose={() => setReplenishTarget(null)}
          onCreated={() => { setReplenishTarget(null); invalidate() }}
        />
      )}
    </div>
  )
}
