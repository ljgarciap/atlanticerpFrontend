import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ToolsPanel from '@/components/servicios/ToolsPanel'
import InsumosPanel from '@/components/servicios/InsumosPanel'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/store/authStore'
import { IcoClock } from '@/components/icons'

type SubView = 'tools' | 'supplies'

// REQ-276 — mismo gate que ToolKardexPage.tsx (App.tsx, RequireRole) — Aaron/Gerencia/superadmin
// únicamente. Se oculta el botón para el resto en vez de dejarlo visible y redirigir al hacer
// click (evita el viaje de ida y vuelta confuso de abrir una pestaña nueva solo para rebotar).
function canViewToolKardex(role: string | undefined): boolean {
  return role === 'lider_servicios' || role === 'management' || role === 'superadmin'
}

// REQ-268→272 (Batch 13 Grupo D parte 1, SCRUM-338→342) — sub-vista Herramientas implementada
// completa. REQ-273→276 (Batch Grupo D parte 2, SCRUM-343→346) — Insumos (InsumosPanel) reemplaza
// el ComingSoonPanel que traía Batch 13; "Movimiento de herramientas" (REQ-276) abre el Kardex de
// herramientas en una pestaña nueva, mismo patrón que TicketDetailModal.tsx:139
// (window.open + noopener,noreferrer). Toggle de sub-vista, mismo criterio visual que el toggle
// Tabla/Tablero de TicketsPage.tsx.
export default function ToolsAndSuppliesPage() {
  const { t }  = useTranslation('servicios')
  const user   = useAuthStore(s => s.user)
  const [view, setView] = useState<SubView>('tools')

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('toolsAndSupplies.title')}</h1>
        <div className="flex items-center gap-2">
          {canViewToolKardex(user?.role) && (
            <Button
              variant="outline"
              className="!inline-flex !items-center !gap-1.5"
              onClick={() => window.open('/servicios/tools/kardex', '_blank', 'noopener,noreferrer')}
            >
              <IcoClock size={14} />
              {t('toolsAndSupplies.kardexButton')}
            </Button>
          )}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
            <Button
              variant="secondary" active={view === 'tools'} className="!rounded-none !border-0"
              onClick={() => setView('tools')}
            >
              {t('toolsAndSupplies.views.tools')}
            </Button>
            <Button
              variant="secondary" active={view === 'supplies'} className="!rounded-none !border-0"
              onClick={() => setView('supplies')}
            >
              {t('toolsAndSupplies.views.supplies')}
            </Button>
          </div>
        </div>
      </div>

      {view === 'tools' ? <ToolsPanel /> : <InsumosPanel />}
    </>
  )
}
