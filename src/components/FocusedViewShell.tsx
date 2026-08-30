import { Outlet } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'

// SCRUM-359 (REQ-289) — vistas SECUNDARIAS de apoyo (Movimiento de Herramientas, Informe móvil):
// RN1/RN2 piden que NO lleven el menú de navegación general de las 5 pestañas, a diferencia de
// toda otra ruta de la app, que hasta ahora vivía sin excepción dentro de AppShell (ver docblock
// viejo en App.tsx). Reemplaza ese criterio para estas 2 rutas puntuales — decisión del Arquitecto
// 2026-08-20 tras el rebote de QA (Marly) sobre el Kardex mostrando el sidebar/topbar completo.
// Sin Sidebar ni TopBar acá — cada página bajo este shell es responsable de su propio control de
// cerrar/volver (ToolKardexPage — window.close(), se abre en pestaña nueva; InspectionReportMobilePage
// — navigate(-1), ya lo tenía desde su creación), para no duplicar el control en 2 lugares.
export default function FocusedViewShell() {
  useTheme()

  return (
    <div className="min-h-screen bg-surface dark:bg-[#0f172a]">
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <Outlet />
      </div>
    </div>
  )
}
