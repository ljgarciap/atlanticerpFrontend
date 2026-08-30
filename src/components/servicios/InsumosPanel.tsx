import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import InsumoTable from './InsumoTable'
import InsumoCreateModal from './InsumoCreateModal'
import InsumoRequestModal from './InsumoRequestModal'
import type { Insumo } from '@/types/servicios'
import { IcoPlus } from '@/components/icons'

// REQ-273/274/275 — exclusivo de Aaron/Líder de Servicios y superadmin, mismo criterio que
// canManageTools en ToolsPanel.tsx (no se reexporta desde ahí a propósito: son 2 sub-vistas que
// Backend Dev puede evolucionar por separado, ver docblock de InsumosPanel/ToolsPanel).
function canManageInsumos(role: string | undefined): boolean {
  return role === 'lider_servicios' || role === 'superadmin'
}

// REQ-273→275 (Batch Grupo D parte 2, SCRUM-343/344/345). Sub-vista "Insumos" de Insumos y
// Herramientas — reemplaza el ComingSoonPanel que traía Batch 13 (Grupo D parte 1).
export default function InsumosPanel() {
  const { t }   = useTranslation('servicios')
  const qc      = useQueryClient()
  const user    = useAuthStore(s => s.user)
  const canEdit = canManageInsumos(user?.role)

  const [createOpen, setCreateOpen]       = useState(false)
  const [requestTarget, setRequestTarget] = useState<Insumo | null>(null)

  const { data: insumos = [], isLoading } = useQuery({
    queryKey: ['servicios-insumos'],
    queryFn:  () => serviciosApi.insumos.list(),
  })

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['servicios-insumos'] })
  }

  return (
    <div>
      {canEdit && (
        <div className="flex justify-end mb-3">
          <Button onClick={() => setCreateOpen(true)} className="!inline-flex !items-center !gap-1.5">
            <IcoPlus size={14} />
            {t('insumos.addButton')}
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('insumos.table.loading')}</p>
      ) : (
        <InsumoTable insumos={insumos} canEdit={canEdit} onRequest={setRequestTarget} />
      )}

      {createOpen && (
        <InsumoCreateModal
          excludedProductIds={insumos.map(i => i.catalog_product_id)}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); invalidate() }}
        />
      )}

      {requestTarget && (
        <InsumoRequestModal
          insumo={requestTarget}
          onClose={() => setRequestTarget(null)}
          onCreated={() => { setRequestTarget(null); invalidate() }}
        />
      )}
    </div>
  )
}
