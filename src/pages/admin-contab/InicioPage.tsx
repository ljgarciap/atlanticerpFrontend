import { useNavigate } from 'react-router-dom'
import InicioHeader from './home/InicioHeader'
import ResumenDelMesPanel from './home/ResumenDelMesPanel'
import AdminContMyCalendarPanel from './home/AdminContMyCalendarPanel'
import PendientesPanel from './home/PendientesPanel'
import VencidosPorVencerPanel from './home/VencidosPorVencerPanel'
import AntiguedadCarteraPanel from './home/AntiguedadCarteraPanel'
import ApprovalsPendingCard from '@/components/ApprovalsPendingCard'
import { useHomeApprovalsPending } from '@/hooks/useAdminContab'

/**
 * Batch final de Admin&Cont (SCRUM-503→512, REQ-426→435) — "Inicio". Ensambla los 5 grupos ya
 * implementados y revisados por separado (Resumen del mes, Mi calendario, Pendientes, Vencidos y
 * por vencer, Antigüedad de cuentas por cobrar) + el encabezado (Grupo 5, este archivo). Última
 * pieza del plan de 29 batches de Admin&Cont — cierra la épica completa (167/167).
 *
 * SCRUM-869 — orden vertical corregido: Resumen del mes (fila propia) → Pendientes + Mi Calendario
 * (misma fila, Pendientes a la izquierda) → Vencidos y por vencer (fila propia). Cambio puramente
 * de layout, ningún panel cambia de contenido/lógica.
 */
export default function InicioPage() {
  const navigate = useNavigate()
  // SCRUM-908 — tarjeta "Aprobaciones Pendientes".
  const { data: approvalsPending } = useHomeApprovalsPending()

  return (
    <div className="p-4 sm:p-6">
      <InicioHeader />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="xl:col-span-2">
          <ResumenDelMesPanel onVerReporte={() => navigate('/admin-contab/reportes')} />
        </div>
        <PendientesPanel />
        <AdminContMyCalendarPanel />
        <div className="xl:col-span-2">
          <VencidosPorVencerPanel />
        </div>
      </div>

      <div className="mt-4">
        <AntiguedadCarteraPanel />
      </div>

      <div className="mt-4">
        <ApprovalsPendingCard items={approvalsPending?.data ?? []} />
      </div>
    </div>
  )
}
