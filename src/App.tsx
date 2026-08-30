import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/authStore'
import { useDevLiveReload } from '@/hooks/useDevLiveReload'
import { getHomeRoute } from '@/lib/homeRoute'
import type { Role } from '@/types/auth'
import AppShell             from '@/components/AppShell'
import FocusedViewShell     from '@/components/FocusedViewShell'
import SecurityLayout       from '@/components/SecurityLayout'
import AiUsagePage          from '@/pages/AiUsagePage'
import LogsPage             from '@/pages/LogsPage'
import LoginPage            from '@/pages/LoginPage'
import ForgotPasswordPage   from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage    from '@/pages/auth/ResetPasswordPage'
import RegisterPage         from '@/pages/auth/RegisterPage'
import ChangePasswordPage from '@/pages/ChangePasswordPage'
import ComprasHomePage      from '@/pages/compras/ComprasHomePage'
import ComprasProvidersPage from '@/pages/compras/ProvidersPage'
import NewPurchaseOrderPage from '@/pages/compras/NewPurchaseOrderPage'
import OrdersPage        from '@/pages/compras/OrdersPage'
import OrderDetailPage   from '@/pages/compras/OrderDetailPage'
import LogisticsPage     from '@/pages/compras/LogisticsPage'
import GoodsReceiptsPage from '@/pages/compras/GoodsReceiptsPage'
import GoodsReceiptWizardPage from '@/pages/compras/GoodsReceiptWizardPage'
import AgenciesSummaryPage from '@/pages/compras/AgenciesSummaryPage'
import AgencyDetailPage    from '@/pages/compras/AgencyDetailPage'
import PaymentsPage        from '@/pages/compras/PaymentsPage'
import ClaimsPage          from '@/pages/compras/ClaimsPage'
import ReplacementRequestsPage from '@/pages/compras/ReplacementRequestsPage'
import ComprasReportsPage from '@/pages/compras/ReportsPage'
import VentasPage        from '@/pages/VentasPage'
import InventarioPage    from '@/pages/InventarioPage'
import BodegasPage       from '@/pages/BodegasPage'
import BodegaHomePage    from '@/pages/BodegaHomePage'
import PedidosPage       from '@/pages/PedidosPage'
import BodegaRutasDiaPage from '@/pages/BodegaRutasDiaPage'
import OrderStatusPage   from '@/pages/OrderStatusPage'
import KardexPage        from '@/pages/KardexPage'
import SolicitudAjustePage from '@/pages/SolicitudAjustePage'
import BodegaSettingsPage from '@/pages/BodegaSettingsPage'
import BodegaInventarioPage from '@/pages/BodegaInventarioPage'
import BodegaOrdenesZonaLibrePage from '@/pages/BodegaOrdenesZonaLibrePage'
import BodegaNuevaOrdenZonaLibrePage from '@/pages/BodegaNuevaOrdenZonaLibrePage'
import BodegaInventarioGeneralPage from '@/pages/BodegaInventarioGeneralPage'
import BodegaDevolucionesPage from '@/pages/BodegaDevolucionesPage'
import BodegaNuevaDevolucionPage from '@/pages/BodegaNuevaDevolucionPage'
import BodegaReportesPage from '@/pages/BodegaReportesPage'
import ServiciosHomePage             from '@/pages/servicios/HomePage'
import ServiciosTicketsPage          from '@/pages/servicios/TicketsPage'
import ServiciosInternalTechniciansPage from '@/pages/servicios/InternalTechniciansPage'
import ServiciosExternalTechniciansPage from '@/pages/servicios/ExternalTechniciansPage'
import ServiciosToolsAndSuppliesPage from '@/pages/servicios/ToolsAndSuppliesPage'
import ServiciosToolKardexPage       from '@/pages/servicios/ToolKardexPage'
import ServiciosReportsPage          from '@/pages/servicios/ReportsPage'
import ServiciosSettingsPage         from '@/pages/servicios/ServiciosSettingsPage'
import ServiceQuotesHistoryPage      from '@/pages/servicios/ServiceQuotesHistoryPage'
import InspectionReportMobilePage    from '@/pages/servicios/InspectionReportMobilePage'
import InicioPage        from '@/pages/admin-contab/InicioPage'
import FiscalConfigPage  from '@/pages/admin-contab/FiscalConfigPage'
import CompanyProfilePage from '@/pages/admin-contab/CompanyProfilePage'
import BankAccountsPage  from '@/pages/admin-contab/BankAccountsPage'
import FacturacionPage   from '@/pages/admin-contab/FacturacionPage'
import EstadoCuentaPage from '@/pages/admin-contab/EstadoCuentaPage'
import CobrosPage from '@/pages/admin-contab/CobrosPage'
import NotasCreditoPage from '@/pages/admin-contab/NotasCreditoPage'
import ComisionesInternasPage from '@/pages/admin-contab/ComisionesInternasPage'
import ComisionesExternasPage from '@/pages/admin-contab/ComisionesExternasPage'
import ArqueoCajaPage from '@/pages/admin-contab/ArqueoCajaPage'
import PettyCashPage from '@/pages/admin-contab/PettyCashPage'
import ReportesPage from '@/pages/admin-contab/ReportesPage'
import MensualClientePage from '@/pages/admin-contab/MensualClientePage'
import MensualClienteAcumuladoPage from '@/pages/admin-contab/MensualClienteAcumuladoPage'
import LibroFacturasPage from '@/pages/admin-contab/LibroFacturasPage'
import VentasMedioPagoPage from '@/pages/admin-contab/VentasMedioPagoPage'
import GerenciaPage      from '@/pages/GerenciaPage'
import OperacionesPage   from '@/pages/OperacionesPage'
import VentasDisenoHomePage     from '@/pages/ventas-diseno/HomePage'
import VentasDisenoPipelinePage from '@/pages/ventas-diseno/PipelinePage'
import VentasDisenoClientsPage  from '@/pages/ventas-diseno/ClientsPage'
import VentasDisenoQuotePage    from '@/pages/ventas-diseno/QuotePage'
import VentasDisenoReportsPage  from '@/pages/ventas-diseno/ReportsPage'
import VentasDisenoQuotesListPage from '@/pages/ventas-diseno/QuotesListPage'
import VentasDisenoAuditLogPage from '@/pages/ventas-diseno/AuditLogPage'
import VentasDisenoCatalogPage  from '@/pages/ventas-diseno/CatalogPage'
import VentasDisenoPedidosPage  from '@/pages/ventas-diseno/PedidosPage'
import CrmDashboardPage     from '@/pages/crm/DashboardPage'
import CrmProjectsListPage  from '@/pages/crm/ProjectsListPage'
import SettingsPage       from '@/pages/SettingsPage'
import TestPage           from '@/pages/TestPage'
import UsersPage            from '@/pages/security/UsersPage'
import SecurityLevelsPage  from '@/pages/security/SecurityLevelsPage'
import DepartmentsPage     from '@/pages/security/DepartmentsPage'
import RolesPage           from '@/pages/security/RolesPage'
import SecurityAlertsPage  from '@/pages/security/SecurityAlertsPage'
import NotificationRulesPage from '@/pages/security/NotificationRulesPage'
import SessionExpiredModal from '@/components/SessionExpiredModal'
import Toaster              from '@/components/Toaster'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

// Ruta desconocida o legado (ej. /dashboard, eliminada en SCRUM-711) — mismo criterio de
// resolución por módulo que el resto de los guards de acá arriba (getHomeRoute ya devuelve
// '/login' si no hay usuario autenticado).
function CatchAllRedirect() {
  const user = useAuthStore(s => s.user)
  return <Navigate to={getHomeRoute(user)} replace />
}

// SCRUM-711 — Dashboard se elimina (era un stub cuyo único CTA navegaba a /crm, tambien
// oculto). SCRUM-175 (2026-08-04) — el fallback fijo a /ventas-diseno/home causaba un loop
// infinito de <Navigate> (pantalla en blanco) para cualquier usuario sin acceso a Ventas &
// Diseño (ej. Yirena, lider_compras, solo ve el módulo Compras) — ver
// src/lib/homeRoute.ts para el detalle completo. El fallback ahora se resuelve por usuario
// según sus módulos reales en vez de un módulo fijo.

function GuestOnly({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  return user ? <Navigate to={getHomeRoute(user)} replace /> : <>{children}</>
}

function RequireRole({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={getHomeRoute(user)} replace />
  return <>{children}</>
}

// Espeja el catálogo de permisos del backend (security.users, security.levels, etc.)
// en vez de una lista de roles hardcodeada — superadmin.all sigue dando acceso a todo.
function RequirePermission({ children, permission }: { children: React.ReactNode; permission: string | string[] }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  const required = Array.isArray(permission) ? permission : [permission]
  const hasAccess = user.permissions.includes('superadmin.all') || required.some(p => user.permissions.includes(p))
  if (!hasAccess) return <Navigate to={getHomeRoute(user)} replace />
  return <>{children}</>
}

export default function App() {
  useDevLiveReload()
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login"           element={<GuestOnly><LoginPage /></GuestOnly>} />
          <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
          <Route path="/reset-password"  element={<GuestOnly><ResetPasswordPage /></GuestOnly>} />
          <Route path="/register"        element={<GuestOnly><RegisterPage /></GuestOnly>} />

          {/* Authenticated shell — all app routes live inside */}
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route path="/change-password" element={<ChangePasswordPage />} />

            <Route path="/settings" element={<SettingsPage />} />

            {/* CRM (epic SCRUM-332, Batch A — SCRUM-673→676/REQ-593→596) — módulo nuevo,
                separado de Ventas & Diseño (ver mockup 2A/2B/2C/2__CRM_*.html). Pipeline y
                Clientes se reubican de menú sin cambiar de URL (RN1-RN4 de REQ-593, evita
                romper ~26 referencias existentes a /ventas-diseno/pipeline|clients) — el link
                del sidebar simplemente vive ahora bajo la sección CRM. Dashboard CRM y Lista de
                Proyectos son pantallas nuevas; quedan en placeholder hasta Batch C (REQ-604→609)
                y Batch D (REQ-610→614). Reemplaza el bloqueo total que traía SCRUM-713/SCRUM-711. */}
            {/* Hallazgo de Pre-QA (2026-07-31, SCRUM-674/REQ-594 RN5, REQ-609): Dashboard CRM es
                exclusivo de Gerencia (role_key='management', ver comentario en Sidebar.tsx) —
                estaba alcanzable por URL directa con solo ventas_diseno.read. RequireRole ya
                existe y usa exactamente este mecanismo (ver /security/departments). "/crm" ya no
                redirige a dashboard por default para evitar mandar a un no-Gerencia a una ruta
                que va a rebotar — cae a Pipeline, la primera pantalla de CRM a la que todos con
                acceso a CRM sí llegan. */}
            <Route path="/crm" element={<Navigate to="/ventas-diseno/pipeline" replace />} />
            <Route path="/crm/dashboard" element={
              <RequirePermission permission="ventas_diseno.read">
                <RequireRole roles={['management', 'superadmin']}>
                  <CrmDashboardPage />
                </RequireRole>
              </RequirePermission>
            } />
            <Route path="/crm/projects" element={
              <RequirePermission permission="ventas_diseno.read">
                <CrmProjectsListPage />
              </RequirePermission>
            } />

            {/* Ventas & Diseño — Grupo 1 (Pipeline) + Grupo 2 (Clientes) + Grupo 3
                (Inicio), ver memory/project_backlog_ventas_diseno_req.md */}
            <Route path="/ventas-diseno/home" element={
              <RequirePermission permission="ventas_diseno.read">
                <VentasDisenoHomePage />
              </RequirePermission>
            } />
            <Route path="/ventas-diseno/pipeline" element={
              <RequirePermission permission="ventas_diseno.read">
                <VentasDisenoPipelinePage />
              </RequirePermission>
            } />
            <Route path="/ventas-diseno/clients" element={
              <RequirePermission permission="ventas_diseno.read">
                <VentasDisenoClientsPage />
              </RequirePermission>
            } />
            {/* Grupo 4 (Reportes) — ver memory/project_backlog_ventas_diseno_req.md */}
            <Route path="/ventas-diseno/reports" element={
              <RequirePermission permission="ventas_diseno.read">
                <VentasDisenoReportsPage />
              </RequirePermission>
            } />
            {/* Grupo 5 (Cotizaciones — listado, REQ-079 a 085) */}
            <Route path="/ventas-diseno/quotes-list" element={
              <RequirePermission permission="ventas_diseno.read">
                <VentasDisenoQuotesListPage />
              </RequirePermission>
            } />
            {/* Epic CRM Batch F (SCRUM-703→710, REQ-623→630) — "Pedidos" queda en Ventas & Diseño
                (no en CRM, ver hoja CRM del Excel: ÁREA="Ventas & Diseño") — placeholder hasta
                Batch F, mismo patrón que el resto de módulos sin pantalla real todavía. */}
            <Route path="/ventas-diseno/pedidos" element={
              <RequirePermission permission="ventas_diseno.read">
                <VentasDisenoPedidosPage />
              </RequirePermission>
            } />
            <Route path="/ventas-diseno/quotes/:id?" element={
              <RequirePermission permission="ventas_diseno.write">
                <VentasDisenoQuotePage />
              </RequirePermission>
            } />
            {/* REQ-053 — Historial y auditoría de cambios */}
            <Route path="/ventas-diseno/audit-log" element={
              <RequirePermission permission="ventas_diseno.audit">
                <VentasDisenoAuditLogPage />
              </RequirePermission>
            } />
            {/* SCRUM-695→701 (REQ-615→621, Batch E del Epic CRM SCRUM-332) — pantalla "Catálogo"
                completa (grid/lista, filtros, ficha técnica, selección/envío). Reemplaza la
                pantalla de "modo consulta" (SCRUM-70/92/100) que vivía en esta misma ruta — el
                buscador REQ-036/037 sigue vivo sin cambios dentro de QuotePartCard.tsx. */}
            <Route path="/ventas-diseno/catalog" element={
              <RequirePermission permission="ventas_diseno.read">
                <VentasDisenoCatalogPage />
              </RequirePermission>
            } />

            {/* Compras — SCRUM-183→196 (Proveedores + Nueva Orden) + SCRUM-201→209 (Ver Órdenes,
                REQ-138→146), ver docs/specs/compras-proveedores-sprint2.md */}
            <Route path="/compras" element={<Navigate to="/compras/inicio" replace />} />
            <Route path="/compras/inicio" element={
              <RequirePermission permission="compras.read">
                <ComprasHomePage />
              </RequirePermission>
            } />
            <Route path="/compras/proveedores" element={
              <RequirePermission permission="compras.read">
                <ComprasProvidersPage />
              </RequirePermission>
            } />
            <Route path="/compras/ordenes" element={
              // SCRUM-771 (corrección 2026-08-18) — compras.limited.view: Ver Órdenes es una de
              // las 4 pantallas de solo lectura de Líder de Operaciones.
              <RequirePermission permission={["compras.read", "compras.limited.view"]}>
                <OrdersPage />
              </RequirePermission>
            } />
            <Route path="/compras/ordenes/nueva" element={
              <RequirePermission permission="compras.write">
                <NewPurchaseOrderPage />
              </RequirePermission>
            } />
            <Route path="/compras/ordenes/:id" element={
              // bodega.read también puede ver el detalle (solo lectura) — botón "Ver orden" del
              // panel "Por recibir" de Bodega Home (SCRUM-371/REQ-301). compras.limited.view
              // (SCRUM-771) por el mismo motivo que la lista.
              <RequirePermission permission={["compras.read", "bodega.read", "compras.limited.view"]}>
                <OrderDetailPage />
              </RequirePermission>
            } />
            <Route path="/compras/logistica" element={
              // SCRUM-771 — misma pantalla/endpoint que Ver Órdenes para este rol.
              <RequirePermission permission={["compras.read", "compras.limited.view"]}>
                <LogisticsPage />
              </RequirePermission>
            } />
            <Route path="/compras/ingresos" element={
              // SCRUM-771 — Ver Registros de Ingreso es una de las 4 pantallas permitidas.
              <RequirePermission permission={["compras.read", "compras.limited.view"]}>
                <GoodsReceiptsPage />
              </RequirePermission>
            } />
            <Route path="/compras/ingresos/nuevo" element={
              <RequirePermission permission="compras.edit">
                <GoodsReceiptWizardPage />
              </RequirePermission>
            } />
            <Route path="/compras/ingresos/:id/editar" element={
              <RequirePermission permission="compras.edit">
                <GoodsReceiptWizardPage />
              </RequirePermission>
            } />
            <Route path="/compras/agencias" element={
              <RequirePermission permission="compras.read">
                <AgenciesSummaryPage />
              </RequirePermission>
            } />
            <Route path="/compras/agencias/:id" element={
              <RequirePermission permission="compras.read">
                <AgencyDetailPage />
              </RequirePermission>
            } />
            <Route path="/compras/pagos" element={
              <RequirePermission permission="compras.read">
                <PaymentsPage />
              </RequirePermission>
            } />
            <Route path="/compras/reclamos" element={
              <RequirePermission permission="compras.read">
                <ClaimsPage />
              </RequirePermission>
            } />
            <Route path="/compras/sustitutos" element={
              // SCRUM-771 (corrección 2026-08-18) — Líder de Operaciones ya no tiene compras.read
              // general (ver User::effectivePermissionsV2() en atlanticerp-backend), solo el permiso
              // angosto de Sustitutos (acceso completo, no solo lectura).
              <RequirePermission permission={["compras.read", "compras.sustitutos.manage"]}>
                <ReplacementRequestsPage />
              </RequirePermission>
            } />
            <Route path="/compras/reportes" element={
              <RequirePermission permission="compras.read">
                <ComprasReportsPage />
              </RequirePermission>
            } />
            {/* SCRUM-363→374 (REQ-293→304) — Home de Bodega. */}
            <Route path="/bodega/home" element={
              <RequirePermission permission="bodega.read">
                <BodegaHomePage />
              </RequirePermission>
            } />
            <Route path="/bodega/pedidos" element={
              <RequirePermission permission="bodega.read">
                <PedidosPage />
              </RequirePermission>
            } />
            <Route path="/bodega/pedidos/status" element={
              <RequirePermission permission={['bodega.read', 'ventas_diseno.read']}>
                <OrderStatusPage />
              </RequirePermission>
            } />
            {/* SCRUM-171 RN2 — "Rutas de entrega del día completo", ver docblock de BodegaRutasDiaPage.tsx. */}
            <Route path="/bodega/rutas-dia" element={
              <RequirePermission permission="bodega.read">
                <BodegaRutasDiaPage />
              </RequirePermission>
            } />
            <Route path="/bodega/bodegas" element={
              <RequirePermission permission="bodega.read">
                <BodegasPage />
              </RequirePermission>
            } />
            <Route path="/bodega/kardex" element={
              <RequirePermission permission="bodega.read">
                <KardexPage />
              </RequirePermission>
            } />
            <Route path="/bodega/solicitud-ajuste" element={
              <RequirePermission permission="bodega.read">
                <SolicitudAjustePage />
              </RequirePermission>
            } />
            {/* SCRUM-329 Batch B2 (REQ-344→362, SCRUM-414→432) — "Ver Inventario" real, reemplaza
                el placeholder "próximamente" que traía Batch B1. Las 5 opciones del desplegable
                "Inventario" ya tienen pantalla real — "Devoluciones" (Bloque B6) cierra el set. */}
            <Route path="/bodega/inventario" element={
              <RequirePermission permission="bodega.read">
                <BodegaInventarioPage />
              </RequirePermission>
            } />
            {/* SCRUM-329 Batch B3 (REQ-363→375, SCRUM-433→445) — "Zona Libre de Colón": bandeja
                (3D) real, reemplaza el placeholder "próximamente". "Nueva orden" (3C) gateada
                igual que el resto de Bodega (bodega.read a nivel de ruta, mismo criterio ya usado
                en Solicitud de Ajuste) — el backend enforcea bodega.write en el POST real. */}
            <Route path="/bodega/ordenes-zona-libre" element={
              <RequirePermission permission="bodega.read">
                <BodegaOrdenesZonaLibrePage />
              </RequirePermission>
            } />
            <Route path="/bodega/ordenes-zona-libre/nueva" element={
              <RequirePermission permission="bodega.read">
                <BodegaNuevaOrdenZonaLibrePage />
              </RequirePermission>
            } />
            {/* SCRUM-797 (revierte SCRUM-440) — reusa la misma pantalla en modo edición (detecta
                `:id` vía useParams); el gate real de quién puede editar y hasta qué estado vive en
                el backend (`BodegaZonaLibreRequestController::update()`), acá solo bodega.read. */}
            <Route path="/bodega/ordenes-zona-libre/:id/editar" element={
              <RequirePermission permission="bodega.read">
                <BodegaNuevaOrdenZonaLibrePage />
              </RequirePermission>
            } />
            {/* Bloque B5 (SCRUM-460→466, REQ-390→396) — "Inventario general" real, reemplaza el
                placeholder "próximamente". Aprobar/Rechazar visibles a todos los perfiles de
                Bodega (bodega.read a nivel de ruta) — el backend enforcea el gate de Mark (403)
                en approve/reject, mismo criterio que Solicitud de ajuste/Reubicación. "Realizar
                ajuste" es la excepción: exclusivo del Líder de Bodega, oculto en frontend para
                cualquier otro perfil (incl. Mark) desde SCRUM-466 (rebote 2026-08-14, ver
                LIDER_BODEGA_ROLE en BodegaInventarioGeneralPage.tsx). */}
            <Route path="/bodega/inventario-general" element={
              <RequirePermission permission="bodega.read">
                <BodegaInventarioGeneralPage />
              </RequirePermission>
            } />
            {/* Bloque B6 (SCRUM-473→489, REQ-403→419) — "Devoluciones" real, reemplaza el
                placeholder "próximamente" que traía Batch B1. Backend implementado localmente en
                `atlanticerp-backend` (commit 4ab8513), sin push a origin todavía — bodega.read a nivel
                de ruta, el backend enforcea bodega.write en los POST reales (incl. reject, que NO
                requiere el gate de aprobación de Mark). */}
            <Route path="/bodega/devoluciones" element={
              <RequirePermission permission="bodega.read">
                <BodegaDevolucionesPage />
              </RequirePermission>
            } />
            <Route path="/bodega/devoluciones/nueva" element={
              <RequirePermission permission="bodega.read">
                <BodegaNuevaDevolucionPage />
              </RequirePermission>
            } />
            {/* SCRUM-500 — administración de umbrales de Bodega, superadmin.all estricto (mismo
                gate que Roles/Notification Rules/Auditoría de uso de IA en Seguridad). */}
            <Route path="/bodega/configuracion" element={
              <RequirePermission permission="superadmin.all">
                <BodegaSettingsPage />
              </RequirePermission>
            } />
            {/* SCRUM-490→495 (REQ-420→425, epic SCRUM-329) — "Reportes de Bodega": encabezado +
                selector de período compartido + 4 tarjetas (Productividad/Precisión de
                inventario/Capacidad por bodega/Inventario rotación y atención), cada una
                navegando a su pantalla real. Visible para todos los perfiles de Bodega. */}
            <Route path="/bodega/reportes" element={
              <RequirePermission permission="bodega.read">
                <BodegaReportesPage />
              </RequirePermission>
            } />

            {/* Business modules (placeholders) */}
            <Route path="/ventas"        element={<VentasPage />} />
            <Route path="/inventario"    element={<InventarioPage />} />
            {/* SCRUM-58 — 4 módulos del catálogo de 7 (ModuleCatalog.php) sin pantallas
                reales todavía: admin_contab, gerencia, operaciones.
                "compras" ya no es placeholder — ver rutas reales arriba (SCRUM-183→209).
                "servicios" tampoco — Fase 4 Batch 1+19 (SCRUM-279→284/357→360, REQ-216→221/
                287→290), reemplaza el placeholder único que traía SCRUM-58. */}
            <Route path="/servicios" element={<Navigate to="/servicios/inicio" replace />} />
            <Route path="/servicios/inicio" element={
              <RequirePermission permission="servicios.read">
                <ServiciosHomePage />
              </RequirePermission>
            } />
            <Route path="/servicios/tickets" element={
              <RequirePermission permission="servicios.read">
                <ServiciosTicketsPage />
              </RequirePermission>
            } />
            {/* REQ-287/290 — "Técnicos externos" vive dentro de Tickets (ruta real de router,
                nunca ?query param), placeholder hasta Batch 5. */}
            <Route path="/servicios/tickets/externos" element={
              <RequirePermission permission="servicios.read">
                <ServiciosExternalTechniciansPage />
              </RequirePermission>
            } />
            <Route path="/servicios/tecnicos" element={
              <RequirePermission permission="servicios.read">
                <ServiciosInternalTechniciansPage />
              </RequirePermission>
            } />
            <Route path="/servicios/insumos-herramientas" element={
              <RequirePermission permission="servicios.read">
                <ServiciosToolsAndSuppliesPage />
              </RequirePermission>
            } />
            <Route path="/servicios/reportes" element={
              <RequirePermission permission="servicios.read">
                <ServiciosReportsPage />
              </RequirePermission>
            } />
            {/* Batch 10 (decisión de Luis 2026-08-11) creó esta ruta con lectura amplia y edición
                restringida dentro de la página. SCRUM-780 (Daniela, 2026-08-19) la reemplaza:
                Ajustes debe ser exclusivo de Gerencia, incluida la entrada por URL directa — no
                alcanza con ocultar el link del sidebar. Mismo gate en el backend
                (routes/servicios.php, GET /servicios/settings). */}
            <Route path="/servicios/ajustes" element={
              <RequirePermission permission="servicios.read">
                <RequireRole roles={['management', 'superadmin']}>
                  <ServiciosSettingsPage />
                </RequireRole>
              </RequirePermission>
            } />
            {/* Batch 12 (REQ-250, SCRUM-313) — historial global de cotizaciones, transversal a
                todo el equipo. Mismo permiso de entrada que el resto del módulo (misma lectura
                amplia que /servicios/quotes en el backend). */}
            <Route path="/servicios/cotizaciones" element={
              <RequirePermission permission="servicios.read">
                <ServiceQuotesHistoryPage />
              </RequirePermission>
            } />
            {/* Batch final de Admin&Cont (SCRUM-503→512) — "Inicio" ya existe como pantalla real,
                así que la ruta raíz redirige ahí en vez de a Facturación (era un default
                provisional mientras Inicio no estaba implementado, ver nota previa de este
                comentario en el historial de git). */}
            <Route path="/admin-contab"  element={<Navigate to="/admin-contab/inicio" replace />} />
            <Route path="/admin-contab/inicio" element={
              <RequirePermission permission="admin_contab.view">
                <InicioPage />
              </RequirePermission>
            } />
            {/* Batch Configuración Fiscal (SCRUM-632→637, REQ-555→560) — este gate de entrada es
                el normal del router (mismo criterio que el resto de rutas); el gate real (Mark,
                no un permiso de nivel) vive en el 403 del backend, ver FiscalConfigPage. */}
            <Route path="/admin-contab/fiscal" element={
              <RequirePermission permission="admin_contab.view">
                <FiscalConfigPage />
              </RequirePermission>
            } />
            {/* Batch Datos de la Empresa (SCRUM-638→642, REQ-561→565) — mismo criterio que
                /admin-contab/fiscal: gate de entrada normal del router, gate real (Mark) en el
                403 del backend, ver CompanyProfilePage. */}
            <Route path="/admin-contab/empresa" element={
              <RequirePermission permission="admin_contab.view">
                <CompanyProfilePage />
              </RequirePermission>
            } />
            {/* Batch 1 del cuerpo principal de Admin&Cont (SCRUM-607→611, REQ-530→534) — Cuentas
                Bancarias. A diferencia de Fiscal/Empresa, NO es exclusiva de Mark — el backend
                gatea cada acción por rol (Felix/Yaneth/Gerencia), sin 403 en el GET general. */}
            <Route path="/admin-contab/cuentas-bancarias" element={
              <RequirePermission permission="admin_contab.view">
                <BankAccountsPage />
              </RequirePermission>
            } />
            {/* Batch 2 del cuerpo principal (SCRUM-513→518, REQ-436→441) — Facturación. Mismo
                criterio que Cuentas Bancarias: no exclusiva de Mark, gate por rol en el backend. */}
            <Route path="/admin-contab/facturacion" element={
              <RequirePermission permission="admin_contab.view">
                <FacturacionPage />
              </RequirePermission>
            } />
            {/* Batch 5 del cuerpo principal (SCRUM-539→544) — reemplaza el placeholder de REQ-451. */}
            <Route path="/admin-contab/cobros" element={
              <RequirePermission permission="admin_contab.view">
                <CobrosPage />
              </RequirePermission>
            } />
            {/* Batch 10 del cuerpo principal (SCRUM-553→558, REQ-476→481) — apertura de Notas
                Crédito y Devoluciones. Mismo criterio que Facturación/Cobros: no exclusiva de
                Mark, gate por rol en el backend. Sin submit real todavía (Batch 11). */}
            <Route path="/admin-contab/notas-credito" element={
              <RequirePermission permission="admin_contab.view">
                <NotasCreditoPage />
              </RequirePermission>
            } />
            {/* Batch 14 del cuerpo principal (SCRUM-575→579, REQ-498→502) — Comisiones Internas.
                Mismo gate `admin_contab.view` que el resto del módulo — un vendedor sin
                `view_team` ve una versión acotada a su propio historial dentro de la misma
                pantalla (ComisionesInternasPage decide qué mostrar según view/view_team), no un
                permiso de ruta distinto. Ver ADR-SCRUM575-579-batch14-comisiones-internas.md. */}
            <Route path="/admin-contab/comisiones/internas" element={
              <RequirePermission permission="admin_contab.view">
                <ComisionesInternasPage />
              </RequirePermission>
            } />
            {/* Batch 16 (SCRUM-585→590, REQ-508→513) — Comisiones Externas. Mismo gate
                `admin_contab.view` — a diferencia de Internas, la audiencia acá es únicamente
                Felix/Yaneth/Mark/Gerencia, sin versión acotada por rol dentro de la pantalla. Ver
                ADR-SCRUM585-590-batch16-comisiones-externas.md. */}
            <Route path="/admin-contab/comisiones/externas" element={
              <RequirePermission permission="admin_contab.view">
                <ComisionesExternasPage />
              </RequirePermission>
            } />
            {/* Batch 18 (SCRUM-597→601, REQ-520→524) — Arqueo / Flujo de Caja, parte 1. Mismo gate
                `admin_contab.view` de entrada que el resto del módulo — la restricción fina de
                Yaneth (sin Proyectado/Real 30-90d) vive dentro de la página, no acá (ver
                ADR-SCRUM597-601-batch18-arqueo-caja.md). */}
            <Route path="/admin-contab/arqueo-caja" element={
              <RequirePermission permission="admin_contab.view">
                <ArqueoCajaPage />
              </RequirePermission>
            } />
            {/* Batch 20 (SCRUM-612→617, REQ-535→540) — Caja Chica. Mismo gate de entrada
                `admin_contab.view` que el resto del módulo — el gate fino por rol (registrar/
                generar reporte solo Felix/Yaneth, aprobar exclusivo Mark) vive en el backend. */}
            <Route path="/admin-contab/caja-chica" element={
              <RequirePermission permission="admin_contab.view">
                <PettyCashPage />
              </RequirePermission>
            } />
            {/* Batch 22 (SCRUM-643→647, REQ-566→570) — home de Reportes. CORREGIDO 2026-08-27
                (hallazgo de Pre-QA/Visual Review fusionado): el comentario original asumía que
                vendedor_disenador no tiene `admin_contab.view` y por eso quedaba afuera sin gate
                adicional — falso, ese rol SÍ tiene `admin_contab.view=true` (lo necesita para
                Comisiones Internas, Batch 14/15) y llegaba a esta pantalla por URL directa viendo
                el shell completo (títulos/selector) con las 4 queries siempre en 403 sin nunca
                salir del skeleton de carga. Mismo patrón/fix ya usado en /crm/dashboard (ver
                comentario ahí, SCRUM-674 2026-07-31): `RequireRole` anidado dentro de
                `RequirePermission`, alineado 1:1 con el roster real del backend
                (`role:superadmin,lider_admin_contab,asistente_administrativa,management` en
                routes/admin-contab.php, sección Reportes). */}
            <Route path="/admin-contab/reportes" element={
              <RequirePermission permission="admin_contab.view">
                <RequireRole roles={['superadmin', 'lider_admin_contab', 'asistente_administrativa', 'management']}>
                  <ReportesPage />
                </RequireRole>
              </RequirePermission>
            } />
            {/* Batch 23 Grupo 2 (SCRUM-651→660, REQ-574→583) — mismo gate que /admin-contab/reportes.
                Sin link de navegación todavía (ni en Sidebar ni en ReportesPage) — se agrega en
                SCRUM-650, junto con las otras 3 pantallas de reporte, para no dejar un acceso a
                medio construir. Alcanzables por URL directa mientras tanto. */}
            <Route path="/admin-contab/reportes/mensual-cliente" element={
              <RequirePermission permission="admin_contab.view">
                <RequireRole roles={['superadmin', 'lider_admin_contab', 'asistente_administrativa', 'management']}>
                  <MensualClientePage />
                </RequireRole>
              </RequirePermission>
            } />
            <Route path="/admin-contab/reportes/mensual-cliente-acumulado" element={
              <RequirePermission permission="admin_contab.view">
                <RequireRole roles={['superadmin', 'lider_admin_contab', 'asistente_administrativa', 'management']}>
                  <MensualClienteAcumuladoPage />
                </RequireRole>
              </RequirePermission>
            } />
            {/* Batch 23 Grupo 3 (SCRUM-661→669, REQ-584→592) — mismo gate/criterio que el Grupo 2
                de arriba: sin link de navegación todavía (SCRUM-650 al final), alcanzables por URL
                directa mientras tanto. */}
            <Route path="/admin-contab/reportes/libro-facturas" element={
              <RequirePermission permission="admin_contab.view">
                <RequireRole roles={['superadmin', 'lider_admin_contab', 'asistente_administrativa', 'management']}>
                  <LibroFacturasPage />
                </RequireRole>
              </RequirePermission>
            } />
            <Route path="/admin-contab/reportes/ventas-medio-pago" element={
              <RequirePermission permission="admin_contab.view">
                <RequireRole roles={['superadmin', 'lider_admin_contab', 'asistente_administrativa', 'management']}>
                  <VentasMedioPagoPage />
                </RequireRole>
              </RequirePermission>
            } />
            <Route path="/gerencia"      element={
              <RequirePermission permission="gerencia.view">
                <GerenciaPage />
              </RequirePermission>
            } />
            <Route path="/operaciones"   element={<OperacionesPage />} />

            {/* Auditoría de uso de IA (pedido de Luis 2026-07-20) */}
            <Route path="/auditoria/uso-ia" element={
              <RequirePermission permission="superadmin.all">
                <AiUsagePage />
              </RequirePermission>
            } />

            {/* SCRUM-793 (Epic SCRUM-788 — Logs y Telemetría) — mismo gate que Consumo IA arriba. */}
            <Route path="/auditoria/logs" element={
              <RequirePermission permission="superadmin.all">
                <LogsPage />
              </RequirePermission>
            } />

            {/* Dev sandbox */}
            <Route path="/test" element={<TestPage />} />

            {/* Security */}
            <Route path="/security" element={<Navigate to="/security/users" replace />} />
            <Route path="/security/users" element={
              <RequirePermission permission="security.users">
                <SecurityLayout><UsersPage /></SecurityLayout>
              </RequirePermission>
            } />
            <Route path="/security/levels" element={
              <RequirePermission permission="security.levels">
                <SecurityLayout><SecurityLevelsPage /></SecurityLayout>
              </RequirePermission>
            } />
            <Route path="/security/departments" element={
              <RequireRole roles={['superadmin', 'management']}>
                <SecurityLayout><DepartmentsPage /></SecurityLayout>
              </RequireRole>
            } />
            <Route path="/security/alerts" element={
              <RequirePermission permission="superadmin.all">
                <SecurityLayout><SecurityAlertsPage /></SecurityLayout>
              </RequirePermission>
            } />
            <Route path="/security/notification-rules" element={
              <RequirePermission permission="superadmin.all">
                <SecurityLayout><NotificationRulesPage /></SecurityLayout>
              </RequirePermission>
            } />
            <Route path="/security/roles" element={
              <RequirePermission permission="superadmin.all">
                <SecurityLayout><RolesPage /></SecurityLayout>
              </RequirePermission>
            } />
          </Route>

          {/* SCRUM-359 (REQ-289) — vistas SECUNDARIAS de apoyo: sin el menú de navegación general,
              solo su propio control de cerrar/volver (ver FocusedViewShell). Mismos guards de
              permiso/rol que tenían dentro del grupo de AppShell, sin cambios de alcance. */}
          <Route element={<RequireAuth><FocusedViewShell /></RequireAuth>}>
            {/* REQ-276 (SCRUM-346) — "Movimiento de herramientas", vista de apoyo abierta en
                pestaña nueva desde ToolsAndSuppliesPage (window.open). Gate de rol acá
                (Aaron/Gerencia/superadmin), no solo visual en el botón que la abre. */}
            <Route path="/servicios/tools/kardex" element={
              <RequirePermission permission="servicios.read">
                <RequireRole roles={['lider_servicios', 'management', 'superadmin']}>
                  <ServiciosToolKardexPage />
                </RequireRole>
              </RequirePermission>
            } />
            {/* Batch 10 (REQ-251→254) — Informe móvil. Mismo permiso de entrada que el resto del
                módulo; el gate real de "puede editar ESTE informe" vive dentro de la página
                (canEditInspectionReport, mismo criterio que el modal de escritorio). */}
            <Route path="/servicios/tickets/:ticketId/inspection-report/movil" element={
              <RequirePermission permission="servicios.read">
                <InspectionReportMobilePage />
              </RequirePermission>
            } />
            {/* Batch 8 de Admin&Cont (SCRUM-529→533, REQ-452) — reemplaza el placeholder de
                REQ-440, que vivía dentro de AppShell. RN1 pide explícitamente que esta pantalla NO
                lleve el menú de navegación principal — se abre en pestaña nueva desde Facturación
                (`FacturacionPage.tsx::openEstadoCuenta`), mismo criterio que Kardex arriba. */}
            <Route path="/admin-contab/facturacion/estado-cuenta" element={
              <RequirePermission permission="admin_contab.view">
                <EstadoCuentaPage />
              </RequirePermission>
            } />
          </Route>

          <Route path="*" element={<CatchAllRedirect />} />
        </Routes>
        <SessionExpiredModal />
        {/* SCRUM-684→689 (Batch C): existía construido (store + componente) desde antes pero
            nunca se había montado en el árbol — primer consumidor real, ver "Enviar
            recordatorios" en Dashboard CRM. */}
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
