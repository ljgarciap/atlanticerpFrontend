import { useNavigate } from 'react-router-dom'
import InicioHeader from './home/InicioHeader'
import ResumenDelMesPanel from './home/ResumenDelMesPanel'
import AdminContMyCalendarPanel from './home/AdminContMyCalendarPanel'
import PendientesPanel from './home/PendientesPanel'
import VencidosPorVencerPanel from './home/VencidosPorVencerPanel'
import AntiguedadCarteraPanel from './home/AntiguedadCarteraPanel'

/**
 * Batch final de Admin&Cont (SCRUM-503→512, REQ-426→435) — "Inicio". Ensambla los 5 grupos ya
 * implementados y revisados por separado (Resumen del mes, Mi calendario, Pendientes, Vencidos y
 * por vencer, Antigüedad de cuentas por cobrar) + el encabezado (Grupo 5, este archivo). Última
 * pieza del plan de 29 batches de Admin&Cont — cierra la épica completa (167/167).
 */
export default function InicioPage() {
  const navigate = useNavigate()

  return (
    <div className="p-4 sm:p-6">
      <InicioHeader />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ResumenDelMesPanel onVerReporte={() => navigate('/admin-contab/reportes')} />
        <AdminContMyCalendarPanel />
        <PendientesPanel />
        <VencidosPorVencerPanel />
      </div>

      <div className="mt-4">
        <AntiguedadCarteraPanel />
      </div>
    </div>
  )
}
