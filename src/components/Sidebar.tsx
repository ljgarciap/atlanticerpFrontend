import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { useUnsavedQuoteGuard } from '@/store/unsavedQuoteGuard'
import { usePermission } from '@/hooks/usePermission'
import AppLogo from '@/components/AppLogo'
import { Button } from '@/components/ui/Button'
import ExitWithoutSavingModal from '@/components/ExitWithoutSavingModal'
import {
  IcoHome, IcoList, IcoPipeline, IcoShoppingBag, IcoBox, IcoBeaker,
  IcoBarChart, IcoUsers, IcoUserCheck, IcoChevronLeft, IcoChevronRight, IcoChevronDown, IcoClock,
  IcoFileText, IcoMapPin, IcoGlobe, IcoSettings, IcoShield, IcoTool, IcoDollarSign, IcoBan,
  IcoTrendingUp, IcoBook,
} from '@/components/icons'

interface NavItem {
  id:    string
  label: string
  href:  string
  icon:  React.ReactNode
}

// SCRUM-724 — mapea cada NavItem.id real de este archivo a su {module, key} en
// MENU_ITEM_CATALOG (src/config/menuItemCatalog.ts), fuente única de la lista de
// ítems por módulo. Los `id` de acá son internos del Sidebar (con guiones, legado)
// y no coinciden 1:1 con las claves del catálogo (con guion bajo) — este mapa es el
// puente; si se agrega/quita un ítem en cualquiera de los dos lados, actualizar el
// otro. Un id ausente acá no está gateado por este mecanismo (ej. Auditoría,
// Configuración/Seguridad, Dev/Sandbox — fuera del catálogo de 7 módulos).
const MENU_ITEM_KEYS: Record<string, { module: string; key: string }> = {
  'crm-dashboard':             { module: 'ventas_diseno', key: 'crm_dashboard' },
  'crm-pipeline':               { module: 'ventas_diseno', key: 'crm_pipeline' },
  'crm-projects':               { module: 'ventas_diseno', key: 'crm_projects' },
  'crm-clients':                 { module: 'ventas_diseno', key: 'crm_clients' },
  'ventas-diseno-home':         { module: 'ventas_diseno', key: 'home' },
  'ventas-diseno-quotes-list': { module: 'ventas_diseno', key: 'quotes_list' },
  'ventas-diseno-pedidos':     { module: 'ventas_diseno', key: 'pedidos' },
  'ventas-diseno-reports':     { module: 'ventas_diseno', key: 'reports' },
  'ventas-diseno-audit-log': { module: 'ventas_diseno', key: 'audit_log' },
  'compras-inicio':             { module: 'compras', key: 'inicio' },
  'compras-proveedores':       { module: 'compras', key: 'proveedores' },
  'compras-ordenes':           { module: 'compras', key: 'ordenes' },
  'compras-nueva-orden':       { module: 'compras', key: 'nueva_orden' },
  'compras-logistica':         { module: 'compras', key: 'logistica' },
  'compras-ingresos':           { module: 'compras', key: 'ingresos' },
  'compras-agencias':           { module: 'compras', key: 'agencias' },
  'compras-pagos':               { module: 'compras', key: 'pagos' },
  'compras-reclamos':           { module: 'compras', key: 'reclamos' },
  'compras-sustitutos':         { module: 'compras', key: 'sustitutos' },
  'compras-reportes':           { module: 'compras', key: 'reportes' },
  inventario:                    { module: 'compras', key: 'inventario' },
  'bodega-home':                 { module: 'bodega', key: 'home' },
  'bodega-pedidos':             { module: 'bodega', key: 'pedidos' },
  'bodega-inventario-ver':     { module: 'bodega', key: 'inventario_ver' },
  'bodega-ajustes':             { module: 'bodega', key: 'ajustes' },
  'bodega-zona-libre':         { module: 'bodega', key: 'zona_libre' },
  'bodega-inventario-general': { module: 'bodega', key: 'inventario_general' },
  'bodega-devoluciones':       { module: 'bodega', key: 'devoluciones' },
  'bodega-bodegas':             { module: 'bodega', key: 'bodegas' },
  'bodega-kardex':               { module: 'bodega', key: 'kardex' },
  'bodega-reportes':             { module: 'bodega', key: 'reportes' },
  'bodega-configuracion':       { module: 'bodega', key: 'configuracion' },
  'servicios-inicio':           { module: 'servicios', key: 'inicio' },
  'admin-contab':               { module: 'admin_contab', key: 'inicio' },
  gerencia:                       { module: 'gerencia', key: 'inicio' },
  operaciones:                   { module: 'operaciones', key: 'inicio' },
}

// SCRUM-363 (REQ-293, RN1) — submenú "Inventario" de Bodega: un ítem del sidebar que en vez de
// navegar directo despliega una lista de sub-ítems. No había precedente de un dropdown anidado
// dentro de una sección (comprasInventarioItems agrupa por sección, pero cada ítem ahí sigue
// siendo un link plano) — se agrega este tipo nuevo en vez de forzar el patrón existente.
interface NavDropdown {
  id:       string
  label:    string
  icon:     React.ReactNode
  children: NavItem[]
}

type NavEntry = NavItem | NavDropdown

function isDropdown(entry: NavEntry): entry is NavDropdown {
  return 'children' in entry
}

interface SidebarGroup { section: string; items: NavEntry[] }

interface SidebarProps {
  isOpen:           boolean
  onClose:          () => void
  collapsed:        boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const { t }             = useTranslation('common')
  const { t: tVentasDiseno } = useTranslation('ventasDiseno')
  const { t: tCompras }   = useTranslation('compras')
  const { t: tCrm }       = useTranslation('crm')
  const { t: tAdminContab } = useTranslation('adminContab')
  const { t: tServicios } = useTranslation('servicios')
  const navigate     = useNavigate()
  const { pathname } = useLocation()
  const user         = useAuthStore(s => s.user)
  // SCRUM-723 — QuotePage marca isDirty mientras haya una cotización sin confirmar;
  // handleNavItem() intercepta cualquier click de navegación del Sidebar mientras
  // esté prendido, en vez de navegar directo.
  const isQuoteDirty  = useUnsavedQuoteGuard(s => s.isDirty)
  const clearQuoteDirty = useUnsavedQuoteGuard(s => s.setDirty)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const canSeeAuditLog = usePermission('ventas_diseno.audit')
  // SCRUM-711 — Seguridad se mueve del tab superior a Configuración > Seguridad.
  // SCRUM-739 (UAT-2) — 'configuracion'/'root' es el ítem sintético que usa la
  // máscara global de rollout para este menú (no es parte de ModuleCatalog, así
  // que no pasa por el check de módulo como el resto de las secciones de abajo).
  const canSeeSecurity = (usePermission('security.users') || usePermission('security.levels'))
    && user?.menuVisibility?.configuracion?.root !== false
  // ADR-006, Decisión 11 — el resto de las secciones sí son módulos del catálogo nuevo.
  // effectivePermissionsV2() (User.php) ya traduce modules.view -> permissions 'X.read' y
  // capacidad de editar -> 'X.write', así que un usuario con rol+visibilidad ya cumple ambos
  // checks (resuelto con Luis 2026-07-10). El OR se mantiene igual para el caso de alguien con
  // ventas_diseno.read otorgado individualmente por extra_permissions pero sin visibilidad de rol
  // (ej. una excepción puntual) -- sin el OR, esa persona perdería el link del sidebar.
  // SCRUM-739 (UAT-2) — hallazgo real de Pre-QA (re-corrida contra el diseño nuevo): el OR de
  // abajo existe para que una extra_permission individual sin visibilidad de rol no pierda el
  // link, pero eso mismo hacía que ocultar este módulo vía UAT no tuviera ningún efecto visible
  // para un usuario con acceso real por rol (el permiso plano `X.read` sigue ahí, la máscara UAT
  // nunca lo toca a propósito — ver docblock de UatVisibilityService en el backend). `__module__`
  // es la señal separada que el backend emite en menuVisibility SOLO cuando UAT oculta este
  // módulo (mismo criterio que el resto de menuVisibility: ausencia = visible, false = oculto) —
  // gana por sobre el OR, sin tocar el caso de extra_permission individual que el OR sí cubre.
  const hasVentasDisenoAccess = usePermission('ventas_diseno.read')
  const canSeeVentasDiseno = (user?.modules?.ventas_diseno?.view === true || hasVentasDisenoAccess)
    && user?.menuVisibility?.ventas_diseno?.__module__ !== false
  const canSeeCompras      = user?.modules?.compras?.view === true
  // SCRUM-231→244 — Inventario reusa permission:compras.* en el backend (las 14 tickets dicen
  // "Compras y Gerencia" en su sección PERMISOS, nunca "Bodega" — confirmado con Luis 2026-07-17,
  // el gateo modules.bodega.view era un placeholder nunca validado contra esta spec). También
  // visible para Ventas & Diseño (REQ-168/171: "Ver, modo restringido, sin costos") — mismo
  // criterio dual ya resuelto en el backend, ver InventoryController::resolveAccess().
  // SCRUM-741 — hallazgo real: a diferencia de ventas_diseno/bodega/servicios arriba, este OR
  // nunca leía la señal `__module__` de UAT, así que ocultar Compras vía UAT no ocultaba este
  // ítem (ni la sección "Compras · Inventario" que lo envuelve, ver comprasInventarioItems más
  // abajo) para nadie con acceso a Ventas & Diseño — Gerencia incluido. El backend ya corta el
  // acceso real en este mismo escenario (InventoryController::resolveAccess()); esto es la
  // contraparte cosmética para que el link ni siquiera aparezca.
  const canSeeInventario   = canSeeCompras
    || (canSeeVentasDiseno && user?.menuVisibility?.compras?.__module__ !== false)
  // SCRUM-451→456 — primera pantalla real del módulo Bodega (ModuleCatalog::BODEGA), gateada
  // por `bodega.read` (cada ticket dice "Visible para todos los perfiles de Bodega", a
  // diferencia de Inventario/Compras arriba). Mismo OR que ventas_diseno arriba (hallazgo de
  // Pre-QA 2026-07-21): sin el OR, alguien con bodega.read otorgado por extra_permissions
  // (sin visibilidad de rol) pierde el link del sidebar aunque la ruta le funcione igual.
  // SCRUM-739 (UAT-2) — mismo criterio que ventas_diseno arriba.
  const hasBodegaAccess = usePermission('bodega.read')
  const canSeeBodega       = (user?.modules?.bodega?.view === true || hasBodegaAccess)
    && user?.menuVisibility?.bodega?.__module__ !== false
  // SCRUM-58 — 4 módulos que faltaban del catálogo de 7 (ModuleCatalog.php en el backend).
  // Fase 4 Batch 1+19 — mismo OR dual que ventas_diseno/bodega arriba: alguien con
  // servicios.read otorgado por extra_permissions pero sin visibilidad de rol (ej. excepción
  // puntual) no debe perder el link del sidebar.
  // SCRUM-739 (UAT-2) — mismo criterio que ventas_diseno arriba.
  const hasServiciosAccess = usePermission('servicios.read')
  const canSeeServicios    = (user?.modules?.servicios?.view === true || hasServiciosAccess)
    && user?.menuVisibility?.servicios?.__module__ !== false
  const canSeeAdminContab  = user?.modules?.admin_contab?.view === true
  const canSeeGerencia     = user?.modules?.gerencia?.view === true
  // Auditoría de uso de IA (pedido de Luis 2026-07-20) — igual que Roles/Notification Rules
  // en Seguridad, exige permission:superadmin.all estricto en el backend (AiUsageController).
  const canSeeAiUsage = usePermission('superadmin.all')
  // SCRUM-500 — administración de umbrales de Bodega, mismo gate estricto que arriba.
  const canSeeBodegaSettings = usePermission('superadmin.all')

  // SCRUM-711, 3ra vuelta — causa raíz real del bug reportado por Mark Bekhar (video
  // 2026-07-31, login fresco): esto NO tiene relación con `sidebar-collapsed` (el ancho del
  // sidebar completo, ya arreglado en rondas 1 y 2) — es un mecanismo totalmente aparte, el
  // acordeón de cada SECCIÓN del menú (ej. "VENTAS & DISEÑO", "CONFIGURACIÓN"). Antes de este
  // fix se trackeaba qué secciones estaban CERRADAS (`collapsedGroups`, SCRUM-58) arrancando
  // en un Set vacío — es decir "nada está cerrado" == todas las secciones nacían EXPANDIDAS
  // con sus submenús visibles, sin ninguna interacción del usuario ni relación con la ruta
  // activa. Eso es exactamente lo que el AC de SCRUM-711 prohíbe ("NINGÚN SUBMENÚ debe
  // aparecer desplegado" al iniciar sesión). Se invierte la polaridad: ahora se trackea qué
  // secciones están ABIERTAS (`openGroups`), arrancando también en un Set vacío — "nada está
  // abierto" == todo nace colapsado. Ventaja extra de trackear "abierto" en vez de "cerrado":
  // una sección que recién aparece en un render posterior (ej. si `user.modules` tarda en
  // resolver) nace colapsada por default sin depender de conocer de antemano el listado
  // completo de secciones.
  //
  // Nota de alcance, a pedido explícito de la tarea: el AC pide el comportamiento LITERAL
  // (todo colapsado, expandir solo por clic explícito) sin mencionar excepción por ruta
  // activa — así que NO se agregó auto-expansión de la sección que contiene la ruta actual acá
  // (a diferencia del NavDropdown "Inventario" de Bodega más abajo, que sí auto-expande si un
  // hijo está activo — ese es un mecanismo previo de SCRUM-363, ya funcionaba bien y queda
  // fuera de este fix). Si UX quiere esa excepción para las secciones también, es una decisión
  // de producto de Luis, no de este ticket.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (section: string) => setOpenGroups(prev => {
    const next = new Set(prev)
    next.has(section) ? next.delete(section) : next.add(section)
    return next
  })

  // SCRUM-363 (REQ-293) — apertura manual de un NavDropdown (ej. "Inventario" de Bodega).
  // Empieza cerrado; se abre solo o bien al hacer clic, o automáticamente si la ruta activa
  // corresponde a uno de sus hijos (ver el useEffect más abajo, tras `isActive`) para que el
  // usuario no aterrice en una pantalla del submenú sin ver de dónde vino resaltado.
  //
  // Hallazgo de Luis (2026-08-25, reportado sobre "Tickets" de Servicios, aplica a cualquier
  // NavDropdown): antes, `open` se calculaba en el render como `openDropdowns.has(id) ||
  // anyChildActive` — mientras la ruta activa fuera un hijo del dropdown, el OR lo mantenía
  // SIEMPRE abierto sin importar cuántas veces el usuario clickeara el header, así que en la
  // pantalla de un hijo el desplegable parecía un botón estático (visualmente con flecha, pero
  // el clic no colapsaba nada). Ahora `openDropdowns` es la única fuente de verdad de qué está
  // abierto — el auto-expandir al aterrizar en un hijo pasa a un useEffect que sincroniza el Set
  // cuando cambia la ruta, en vez de forzarlo en cada render; a partir de ahí el toggle manual
  // sí tiene efecto real, incluso estando en la pantalla del hijo activo.
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set())
  const toggleDropdown = (id: string) => setOpenDropdowns(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })


  // SCRUM-747 — hijos de cada dropdown de Compras, mismos hrefs/ids ya existentes, sin cambios de
  // ruta (solo agrupación visual). Ver NavDropdown/isDropdown() más arriba — mismo patrón que
  // 'bodega-inventario-menu'.
  const comprasOrdenesChildren: NavItem[] = [
    { id: 'compras-ordenes', label: tCompras('nav.orders'), href: '/compras/ordenes', icon: <IcoBarChart /> },
    { id: 'compras-nueva-orden', label: tCompras('nav.newOrder'), href: '/compras/ordenes/nueva', icon: <IcoList /> },
    { id: 'compras-logistica', label: tCompras('nav.logistics'), href: '/compras/logistica', icon: <IcoPipeline /> },
  ]

  const comprasCatalogoStockChildren: NavItem[] = [
    { id: 'inventario', label: t('nav.inventario'), href: '/inventario', icon: <IcoBox /> },
    { id: 'compras-ingresos', label: tCompras('nav.goodsReceipts'), href: '/compras/ingresos', icon: <IcoBox /> },
    { id: 'compras-sustitutos', label: tCompras('nav.replacements'), href: '/compras/sustitutos', icon: <IcoBeaker /> },
  ]

  const comprasPagosChildren: NavItem[] = [
    { id: 'compras-pagos', label: tCompras('nav.payments'), href: '/compras/pagos', icon: <IcoBarChart /> },
    { id: 'compras-agencias', label: tCompras('nav.agencies'), href: '/compras/agencias', icon: <IcoGlobe /> },
  ]

  // SCRUM-747 — reestructura la lista plana de 12 ítems en 7 accesos de nivel superior, 3 de
  // ellos NavDropdown (Órdenes/Catálogo y Stock/Pagos) reusando el patrón ya probado en
  // 'bodega-inventario-menu' (RN8 del ticket pide explícitamente "mismo principio"). Ningún href
  // cambia. "Inventario" pasa a vivir dentro de "Catálogo y Stock" cuando el usuario ve todo
  // Compras (canSeeCompras) — el fallback de abajo (Ventas & Diseño con acceso de solo lectura a
  // Inventario, sin ver el resto de Compras) se mantiene como link suelto para no duplicarlo (RN5)
  // ni mostrarlo dentro de un dropdown con ítems a los que ese usuario no tiene acceso.
  const comprasInventarioItems: NavEntry[] = [
    // SCRUM-183→196 — Proveedores + Nueva Orden reales, ya no placeholder "coming soon" (ver App.tsx).
    ...(canSeeCompras
      ? [
          { id: 'compras-inicio', label: tCompras('nav.home'), href: '/compras/inicio', icon: <IcoHome /> },
          { id: 'compras-ordenes-menu', label: tCompras('nav.ordersMenu'), icon: <IcoBarChart />, children: comprasOrdenesChildren },
          { id: 'compras-catalogo-stock-menu', label: tCompras('nav.catalogStockMenu'), icon: <IcoBox />, children: comprasCatalogoStockChildren },
          { id: 'compras-pagos-menu', label: tCompras('nav.paymentsMenu'), icon: <IcoBarChart />, children: comprasPagosChildren },
          { id: 'compras-proveedores', label: tCompras('nav.providers'), href: '/compras/proveedores', icon: <IcoShoppingBag /> },
          { id: 'compras-reclamos', label: tCompras('nav.claims'), href: '/compras/reclamos', icon: <IcoFileText /> },
          { id: 'compras-reportes', label: tCompras('nav.reports'), href: '/compras/reportes', icon: <IcoBarChart /> },
        ]
      : []),
    ...(canSeeInventario && !canSeeCompras
      ? [{ id: 'inventario', label: t('nav.inventario'), href: '/inventario', icon: <IcoBox /> }]
      : []),
  ]

  // Epic CRM (SCRUM-332) Batch A — SCRUM-673→676/REQ-593→596, reemplaza el bloqueo total que
  // traía SCRUM-713/SCRUM-711. CRM pasa a ser un módulo propio, separado de Ventas & Diseño
  // (confirmado en el mockup: sidebar de 7 módulos CRM/Ventas&Diseño/Compras/Bodega/Admin.&
  // Contab./Servicios/Gerencia). Mismo gate que Ventas & Diseño (canSeeVentasDiseno): Pipeline y
  // Clientes siguen siendo la misma pantalla/permiso de siempre (REQ-593 RN3), solo cambia bajo
  // qué sección de menú aparecen — el href se queda en /ventas-diseno/pipeline|clients a
  // propósito, para no romper ~26 referencias existentes a esas rutas (ver App.tsx).
  //
  // Hallazgo de Pre-QA (2026-07-31, SCRUM-674): REQ-594 RN5/RN6 exige gating por PERFIL además
  // del gate de módulo de arriba — "Dashboard CRM" solo Gerencia, "Pedidos" oculto para Líder
  // Admin (Felix) y Asistente Administrativa (Yaneth). `user.role` en runtime es el role_key de
  // negocio (auth_roles.key vía JwtClaimsBuilder, no el enum legado) — confirmado en la DB local:
  // Mark/Daniela/David/Whileyner (los 4 "Gerencia" del REQ) tienen role_key='management'; Felix
  // ('lider_admin_contab') y Yaneth ('asistente_administrativa') no tienen ventas_diseno.read en
  // absoluto todavía, así que el escenario de "ve 3 de 4 pestañas" no es alcanzable hasta que se
  // les otorgue ese acceso base — decisión de negocio aparte, no de este batch. El gate de acá
  // deja el comportamiento correcto para cuando eso pase.
  // superadmin incluido — mismo bypass que el resto de la app (RequirePermission ya trata
  // superadmin.all como comodín, y /security/departments ya usa roles={['superadmin','management']}
  // con este mismo RequireRole) — sin esto, Luis/Andres/Luis J quedarían bloqueados de su propia
  // pantalla. Hallazgo de un segundo pase de Pre-QA (2026-07-31, revisión estática) que no pudo
  // correr en vivo por una limitación de sandbox del worktree.
  const isGerencia = user?.role === 'management' || user?.role === 'superadmin'
  const canSeePedidosTab = user?.role !== 'lider_admin_contab' && user?.role !== 'asistente_administrativa'

  // SCRUM-774 — el menú de Servicios se muda del menú superior (ServiciosNavMenu, eliminado)
  // al panel lateral, mismo patrón que "Inventario" de Bodega (NavDropdown anidado dentro de la
  // sección). Mismo gate de rol que tenía ServiciosNavMenu (REQ-287/288, ahora eliminado):
  // vendedor_disenador ve solo Inicio/Tickets/Técnicos (con una única opción, "Técnicos
  // internos", sin desplegable de externos) — Insumos/Reportes/Cotizaciones/Ajustes quedan
  // fuera para ese rol.
  //
  // SCRUM-780 (rebote de Daniela 2026-08-19) — reemplaza dos decisiones tomadas en SCRUM-774:
  // (1) "Cotizaciones" deja de ser un ítem propio de la sección, pasa a submenú de "Tickets"
  // (mismo patrón NavDropdown que "Técnicos" un poco más abajo); (2) "Ajustes" se angosta de
  // lider_servicios/management/superadmin a solo Gerencia (management/superadmin) — Aaron/Líder
  // de Servicios ya no debe verlo. Ver también RequireRole en App.tsx (acceso por URL directa) y
  // el gate del backend en routes/servicios.php (GET /servicios/settings).
  const isServiciosLimited = user?.role === 'vendedor_disenador'
  const canViewServiciosSettings = ['management', 'superadmin'].includes(user?.role ?? '')

  const serviciosTechChildren: NavItem[] = [
    { id: 'servicios-tecnicos-internos', label: tServicios('nav.techniciansInternal'), href: '/servicios/tecnicos', icon: <IcoUsers /> },
    // REQ-287 RN — "Técnicos externos" navega directo a la vista dentro de Tickets, sin pasos
    // intermedios (mismo criterio que tenía ServiciosNavMenu).
    ...(isServiciosLimited ? [] : [
      { id: 'servicios-tecnicos-externos', label: tServicios('nav.techniciansExternal'), href: '/servicios/tickets/externos', icon: <IcoUserCheck /> },
    ]),
  ]

  const serviciosTicketsChildren: NavItem[] = [
    { id: 'servicios-tickets-listado', label: tServicios('nav.ticketsList'), href: '/servicios/tickets', icon: <IcoList /> },
    ...(isServiciosLimited ? [] : [
      { id: 'servicios-cotizaciones', label: tServicios('nav.quotesHistory'), href: '/servicios/cotizaciones', icon: <IcoDollarSign /> },
    ]),
  ]

  const serviciosItems: NavEntry[] = [
    { id: 'servicios-inicio', label: tServicios('nav.home'), href: '/servicios/inicio', icon: <IcoHome /> },
    { id: 'servicios-tickets-menu', label: tServicios('nav.tickets'), icon: <IcoList />, children: serviciosTicketsChildren },
    { id: 'servicios-tecnicos-menu', label: tServicios('nav.technicians'), icon: <IcoUsers />, children: serviciosTechChildren },
    ...(isServiciosLimited ? [] : [
      { id: 'servicios-insumos', label: tServicios('nav.toolsAndSupplies'), href: '/servicios/insumos-herramientas', icon: <IcoTool /> },
      { id: 'servicios-reportes', label: tServicios('nav.reports'), href: '/servicios/reportes', icon: <IcoBarChart /> },
      ...(canViewServiciosSettings
        ? [{ id: 'servicios-ajustes', label: tServicios('nav.settings'), href: '/servicios/ajustes', icon: <IcoSettings /> }]
        : []),
    ]),
  ]
  // Hallazgo de Luis (2026-08-22) — "Admin. & Contab." llevaba 5 batches (Config Fiscal, Datos
  // de la Empresa, Cuentas Bancarias, Facturación 2/3/4) con pantallas reales construidas, pero
  // el ítem de menú seguía siendo el placeholder original de un solo link a `/admin-contab`
  // (`AdminContabPage.tsx`, "Próximamente") — cada Visual Review de esos batches validó su propia
  // pantalla, ninguna validó que el punto de entrada del sidebar llevara a algo. Mismo patrón que
  // `serviciosItems` de abajo: items planos, sin gate de rol adicional por ítem porque cada
  // pantalla ya se auto-gatea (Fiscal/Empresa muestran "Acceso restringido" si el actor no es
  // Mark, ver `restricted.*` en `adminContab.json` — el router no necesita duplicarlo).
  const adminContabItems: NavEntry[] = [
    // Batch final (SCRUM-503→512) — "Inicio" ya es una pantalla real, primer ítem del menú (mismo
    // patrón que compras-inicio/servicios-inicio/ventas-diseno-home arriba).
    { id: 'admin-contab-inicio',   label: tAdminContab('nav.home'),             href: '/admin-contab/inicio',             icon: <IcoHome /> },
    { id: 'admin-contab-fiscal',   label: tAdminContab('nav.fiscal'),           href: '/admin-contab/fiscal',             icon: <IcoSettings /> },
    { id: 'admin-contab-empresa',  label: tAdminContab('nav.empresa'),          href: '/admin-contab/empresa',            icon: <IcoUsers /> },
    // Batch 18 (SCRUM-597→601) — Arqueo de Caja. Mismo criterio "item plano" que el resto de este
    // menú (ver hallazgo de Luis arriba) — orden del mockup dentro del grupo "Tesorería" (Arqueo de
    // Caja antes de Cuentas bancarias/Caja chica), aunque acá no se replica el dropdown "Tesorería"
    // del mockup — sigue el patrón real ya establecido de items planos sin agrupar.
    { id: 'admin-contab-arqueo-caja', label: tAdminContab('nav.arqueoCaja'), href: '/admin-contab/arqueo-caja', icon: <IcoTrendingUp /> },
    { id: 'admin-contab-cuentas',  label: tAdminContab('nav.cuentasBancarias'), href: '/admin-contab/cuentas-bancarias',  icon: <IcoDollarSign /> },
    // Batch 20 (SCRUM-612→617) — Caja Chica. Ver comentario de Arqueo de Caja arriba: mismo
    // criterio "item plano", orden del mockup dentro del grupo Tesorería (Arqueo → Cuentas → Caja
    // chica).
    { id: 'admin-contab-caja-chica', label: tAdminContab('nav.cajaChica'), href: '/admin-contab/caja-chica', icon: <IcoBook /> },
    { id: 'admin-contab-facturacion', label: tAdminContab('nav.facturacion'),   href: '/admin-contab/facturacion',        icon: <IcoFileText /> },
    // Batch 10 (SCRUM-553→558) — Notas Crédito y Devoluciones. Agregado en el mismo batch que crea
    // la pantalla, a propósito, para no repetir el hallazgo de Luis de arriba.
    { id: 'admin-contab-notas-credito', label: tAdminContab('nav.notasCredito'), href: '/admin-contab/notas-credito',     icon: <IcoBan /> },
    // Batch 14 (SCRUM-575→579) — Comisiones Internas.
    { id: 'admin-contab-comisiones-menu', label: tAdminContab('nav.comisionesMenu'), icon: <IcoBarChart />, children: [
      { id: 'admin-contab-comisiones-internas', label: tAdminContab('nav.comisionesInternas'), href: '/admin-contab/comisiones/internas', icon: <IcoBarChart /> },
      // Batch 16 (SCRUM-585→590) — antes omitido a propósito ("Externas" sin pantalla real, ver
      // comentario viejo de Batch 14), ya implementado.
      { id: 'admin-contab-comisiones-externas', label: tAdminContab('nav.comisionesExternas'), href: '/admin-contab/comisiones/externas', icon: <IcoBarChart /> },
    ] },
    // Batch 22 (SCRUM-643→647) — home de Reportes. Agregado en el mismo batch que crea la
    // pantalla, a propósito (ver hallazgo de Luis arriba, mismo criterio que Notas Crédito).
    { id: 'admin-contab-reportes', label: tAdminContab('nav.reportes'), href: '/admin-contab/reportes', icon: <IcoBarChart /> },
  ]

  const groups: SidebarGroup[] = [
    ...(canSeeVentasDiseno
      ? [{
          section: tCrm('nav.module'),
          items: [
            ...(isGerencia
              ? [{ id: 'crm-dashboard', label: tCrm('nav.dashboard'), href: '/crm/dashboard', icon: <IcoBarChart /> }]
              : []),
            { id: 'crm-pipeline',  label: tVentasDiseno('nav.pipeline'), href: '/ventas-diseno/pipeline', icon: <IcoPipeline /> },
            { id: 'crm-projects',  label: tCrm('nav.projectList'),      href: '/crm/projects',           icon: <IcoList /> },
            { id: 'crm-clients',   label: tVentasDiseno('nav.clients'),  href: '/ventas-diseno/clients',  icon: <IcoUsers /> },
            // SCRUM-728 — acceso adicional al Catálogo desde CRM, misma ruta/permiso
            // (ventas_diseno.read, ver App.tsx) que los botones "Catálogo" ya existentes
            // en Clientes/Pedidos/Pipeline — no duplica pantalla ni funcionalidad.
            { id: 'crm-catalog',   label: tCrm('nav.catalog'),          href: '/ventas-diseno/catalog',  icon: <IcoBox /> },
          ],
        }]
      : []),
    ...(canSeeVentasDiseno
      ? [{
          section: tVentasDiseno('nav.module'),
          items: [
            { id: 'ventas-diseno-home',     label: tVentasDiseno('nav.home'),     href: '/ventas-diseno/home',     icon: <IcoHome /> },
            { id: 'ventas-diseno-quotes-list', label: tVentasDiseno('nav.quotesList'), href: '/ventas-diseno/quotes-list', icon: <IcoList /> },
            // Epic CRM Batch F (SCRUM-703→710) — placeholder hasta esa pantalla existir.
            ...(canSeePedidosTab
              ? [{ id: 'ventas-diseno-pedidos', label: tVentasDiseno('nav.pedidos'), href: '/ventas-diseno/pedidos', icon: <IcoShoppingBag /> }]
              : []),
            { id: 'ventas-diseno-reports',  label: tVentasDiseno('nav.reports'),  href: '/ventas-diseno/reports',  icon: <IcoBarChart /> },
            ...(canSeeAuditLog
              ? [{ id: 'ventas-diseno-audit-log', label: tVentasDiseno('nav.auditLog'), href: '/ventas-diseno/audit-log', icon: <IcoClock /> }]
              : []),
          ],
        }]
      : []),
    ...(comprasInventarioItems.length > 0
      ? [{ section: t('nav.compras') + ' · ' + t('nav.inventario'), items: comprasInventarioItems }]
      : []),
    ...(canSeeBodega
      ? [{ section: t('nav.bodega'), items: [
          // SCRUM-363 (REQ-293) — "Inicio", primera opción del módulo (Home de Bodega).
          { id: 'bodega-home', label: t('nav.bodegaHome'), href: '/bodega/home', icon: <IcoHome /> },
          // SCRUM-329 Oleada A / Batch A3 (REQ-305→335) — tablero "Pedidos", primera pantalla
          // real del flujo Kanban de Bodega. Mismo gate `bodega.read` que el resto del módulo.
          { id: 'bodega-pedidos', label: t('nav.pedidos'), href: '/bodega/pedidos', icon: <IcoShoppingBag /> },
          // SCRUM-363 (REQ-293, RN1) — submenú "Inventario" con 5 opciones (Ver inventario,
          // Solicitud de ajuste, Órdenes Zona Libre, Inventario general, Devoluciones). Solo
          // "Devoluciones" (Bloque B6) sigue en placeholder "próximamente" — el resto ya tiene
          // pantalla real (Ver inventario B2, Solicitud de ajuste, Órdenes Zona Libre B3,
          // Inventario general B5).
          { id: 'bodega-inventario-menu', label: t('nav.inventario'), icon: <IcoBox />, children: [
            { id: 'bodega-inventario-ver', label: t('nav.verInventario'), href: '/bodega/inventario', icon: <IcoBox /> },
            { id: 'bodega-ajustes', label: t('nav.ajustes'), href: '/bodega/solicitud-ajuste', icon: <IcoFileText /> },
            { id: 'bodega-zona-libre', label: t('nav.ordenesZonaLibre'), href: '/bodega/ordenes-zona-libre', icon: <IcoGlobe /> },
            { id: 'bodega-inventario-general', label: t('nav.inventarioGeneral'), href: '/bodega/inventario-general', icon: <IcoBarChart /> },
            { id: 'bodega-devoluciones', label: t('nav.devoluciones'), href: '/bodega/devoluciones', icon: <IcoList /> },
          ] },
          { id: 'bodega-bodegas', label: t('nav.bodegas'), href: '/bodega/bodegas', icon: <IcoMapPin /> },
          // SCRUM-467 (REQ-397) — el ticket pedía el link en el encabezado de "Inventario
          // general"; ese link ya existe ahí también (Bloque B5, `BodegaInventarioGeneralPage`),
          // pero este ítem del sidebar se mantiene igual como acceso directo — no es una de las
          // 5 opciones del desplegable "Inventario" (RN1 de SCRUM-363), es propio del módulo.
          { id: 'bodega-kardex', label: t('nav.kardex'), href: '/bodega/kardex', icon: <IcoClock /> },
          // SCRUM-490→495 (REQ-420→425) — "Reportes de Bodega". Mismo ícono que "compras-reportes".
          { id: 'bodega-reportes', label: t('nav.reportes'), href: '/bodega/reportes', icon: <IcoBarChart /> },
          // SCRUM-500 — solo superadmin.all, aparte del gate `bodega.read`/`view` del resto de
          // la sección (alguien con bodega.read pero sin superadmin.all no debe verlo).
          ...(canSeeBodegaSettings
            ? [{ id: 'bodega-configuracion', label: t('nav.bodegaConfiguracion'), href: '/bodega/configuracion', icon: <IcoSettings /> }]
            : []),
        ] }]
      : []),
    // SCRUM-58 — 4 módulos del catálogo de 7 sin pantallas reales todavía, cada uno
    // como grupo propio con un placeholder "próximamente" (mismo patrón que Compras/
    // Ventas/Inventario antes de tener pantallas reales).
    // href se queda en /servicios (redirige a /servicios/inicio, ver App.tsx) para que
    // isActive() lo resalte con pathname.startsWith('/servicios/') en cualquier subpantalla
    // del módulo (tickets, técnicos, etc.) — un href a una subruta puntual solo resaltaría esa.
    ...(canSeeServicios
      ? [{ section: t('nav.servicios'), items: serviciosItems }]
      : []),
    ...(canSeeAdminContab
      ? [{ section: t('nav.adminContab'), items: adminContabItems }]
      : []),
    ...(canSeeGerencia
      ? [{ section: t('nav.gerencia'), items: [{ id: 'gerencia', label: t('nav.gerencia'), href: '/gerencia', icon: <IcoUserCheck /> }] }]
      : []),
    ...(canSeeAiUsage
      ? [{
          section: t('nav.auditoria'),
          items: [
            { id: 'ai-usage', label: t('nav.consumoIa'), href: '/auditoria/uso-ia', icon: <IcoClock /> },
            // SCRUM-793 (Epic SCRUM-788 — Logs y Telemetría) — mismo gate que Consumo IA arriba.
            { id: 'audit-logs', label: t('nav.logs'), href: '/auditoria/logs', icon: <IcoList /> },
          ],
        }]
      : []),
    // SCRUM-711 — Configuración reemplaza el tab superior "Seguridad"; mismo gate
    // (security.users / security.levels) que tenía el tab en AppShell.tsx.
    ...(canSeeSecurity
      ? [{
          section: t('nav.settings'),
          items: [{ id: 'config-seguridad', label: t('nav.security'), href: '/security/users', icon: <IcoShield /> }],
        }]
      : []),
    // SCRUM-58 — "visible a los roles permitidos": Sandbox es una herramienta de
    // desarrollo, no un módulo de negocio — se restringe a superadmin (antes era
    // visible para cualquier usuario autenticado).
    ...(user?.role === 'superadmin'
      ? [{
          section: 'Dev',
          items: [{ id: 'sandbox', label: 'Sandbox', href: '/test', icon: <IcoBeaker /> }],
        }]
      : []),
  ]

  // SCRUM-729 — antes, cualquier href cuyo pathname empezara con él quedaba activo,
  // así que en /compras/ordenes/nueva tanto "Ver Órdenes" (/compras/ordenes) como
  // "Nueva Orden" (/compras/ordenes/nueva) se resaltaban a la vez (Nueva Orden es un
  // sub-path literal de Ver Órdenes). Ahora, entre todos los hrefs del menú que
  // matchean el pathname actual, gana el más específico (el más largo) — un solo
  // ítem activo por vez, sin cambiar el comportamiento de módulos de un solo ítem
  // (ej. /servicios, ver comentario más arriba) que siguen matcheando igual.
  const allNavHrefs = groups.flatMap(group => group.items.flatMap(entry =>
    isDropdown(entry) ? entry.children.map(child => child.href) : [entry.href],
  ))
  const bestMatchHref = allNavHrefs
    .filter(href => pathname === href || pathname.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0]

  const isActive = (href: string) => {
    if (href === '/crm') return pathname === '/crm'
    return href === bestMatchHref
  }

  // SCRUM-724 — override de visibilidad de ítems de menú por usuario, por encima del
  // gate de módulo por rol de arriba (canSeeXxx). Una clave ausente en
  // user.menuVisibility significa visible=true (default) — solo un `false` explícito
  // oculta el ítem. Entries sin mapeo en MENU_ITEM_KEYS (Auditoría, Configuración/
  // Seguridad, Dev/Sandbox) no pasan por este mecanismo.
  const isMenuEntryVisible = (entry: NavItem): boolean => {
    const mapped = MENU_ITEM_KEYS[entry.id]
    if (!mapped) return true
    return user?.menuVisibility?.[mapped.module]?.[mapped.key] !== false
  }

  const visibleGroups: SidebarGroup[] = groups
    .map(group => ({
      section: group.section,
      items: group.items.reduce<NavEntry[]>((acc, entry) => {
        if (isDropdown(entry)) {
          const children = entry.children.filter(isMenuEntryVisible)
          if (children.length > 0) acc.push({ ...entry, children })
          return acc
        }
        if (isMenuEntryVisible(entry)) acc.push(entry)
        return acc
      }, []),
    }))
    .filter(group => group.items.length > 0)

  // Hallazgo de Luis (2026-08-25) — auto-expandir el dropdown cuya ruta activa es uno de sus
  // hijos, pero SOLO al cambiar de ruta (no en cada render): agrega el id a `openDropdowns` si
  // todavía no está, sin volver a agregarlo si el usuario ya lo colapsó a mano estando en esa
  // misma pantalla (por eso depende de `pathname`, no de `openDropdowns`). Ver el comentario en
  // la declaración de `openDropdowns` más arriba para el porqué de este cambio.
  useEffect(() => {
    const activeDropdownIds = visibleGroups
      .flatMap(group => group.items)
      .filter(isDropdown)
      .filter(entry => entry.children.some(child => isActive(child.href)))
      .map(entry => entry.id)
    if (activeDropdownIds.length === 0) return
    setOpenDropdowns(prev => {
      const next = new Set(prev)
      let changed = false
      activeDropdownIds.forEach(id => {
        if (!next.has(id)) { next.add(id); changed = true }
      })
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const handleNavItem = (href: string) => {
    // SCRUM-723 — con una cotización sin confirmar abierta, cualquier navegación del
    // Sidebar queda en espera del modal de confirmación en vez de navegar directo.
    if (isQuoteDirty) {
      setPendingHref(href)
      return
    }
    navigate(href)
    onClose()
  }

  const navContent = (isCollapsed: boolean) => (
    <nav className="py-2 flex-1 overflow-y-auto">
      {visibleGroups.map((group, gi) => {
        // SCRUM-58 — colapso por grupo (accordion), distinto del colapso global del
        // sidebar (isCollapsed, que lo reduce a solo íconos): en modo global colapsado
        // no tiene sentido colapsar por grupo también, solo se ven íconos.
        const groupCollapsed = !isCollapsed && !openGroups.has(group.section)
        return (
        <div key={gi} className={gi > 0 ? 'mt-2 pt-2 border-t border-slate-100 dark:border-slate-700' : ''}>
          {!isCollapsed && (
            <button
              type="button"
              onClick={() => toggleGroup(group.section)}
              className="w-full flex items-center justify-between px-4 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <span>{group.section}</span>
              <span className={`transition-transform ${groupCollapsed ? '-rotate-90' : ''}`}>
                <IcoChevronDown size={12} />
              </span>
            </button>
          )}
          {isCollapsed && gi > 0 && <div className="my-1" />}
          {!groupCollapsed && group.items.map(entry => {
            // SCRUM-363 (REQ-293, RN1/RN2) — "Inventario" de Bodega: dropdown anidado, resaltado
            // si la pantalla activa es uno de sus hijos, y expandido automáticamente en ese caso
            // para que el resaltado sea visible sin que el usuario tenga que abrirlo a mano.
            if (isDropdown(entry)) {
              const anyChildActive = entry.children.some(c => isActive(c.href))
              // El auto-expandir por ruta activa lo resuelve el useEffect de arriba (una sola
              // vez por cambio de ruta) — acá `openDropdowns` es la única fuente de verdad de
              // qué está abierto, para que el toggle manual del usuario siempre tenga efecto.
              const open = openDropdowns.has(entry.id)
              return (
                <div key={entry.id}>
                  <button
                    onClick={() => {
                      if (isCollapsed) { handleNavItem(entry.children[0].href); return }
                      toggleDropdown(entry.id)
                    }}
                    title={isCollapsed ? entry.label : undefined}
                    className={[
                      'w-full flex items-center py-3 lg:py-2 text-sm lg:text-[13px] font-medium transition-colors border-l-2',
                      isCollapsed ? 'justify-center px-0' : 'gap-2.5 px-4',
                      anyChildActive
                        ? 'bg-[#d1ede9] dark:bg-[#1a3c38] text-[#1f6b66] dark:text-[#4db8b0] font-semibold border-[#5BA5A0]'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border-transparent',
                    ].join(' ')}>
                    <span className={anyChildActive ? 'text-[#5BA5A0]' : 'text-slate-400 dark:text-slate-500'}>
                      {entry.icon}
                    </span>
                    {!isCollapsed && (
                      <>
                        <span className="flex-1 text-left">{entry.label}</span>
                        <span className={`transition-transform ${open ? '' : '-rotate-90'}`}>
                          <IcoChevronDown size={12} />
                        </span>
                      </>
                    )}
                  </button>
                  {!isCollapsed && open && entry.children.map(child => {
                    const childActive = isActive(child.href)
                    return (
                      <button
                        key={child.id}
                        onClick={() => handleNavItem(child.href)}
                        className={[
                          'w-full flex items-center gap-2.5 py-2.5 lg:py-2 pl-9 pr-4 text-sm lg:text-[13px] font-medium transition-colors border-l-2',
                          childActive
                            ? 'bg-[#d1ede9] dark:bg-[#1a3c38] text-[#1f6b66] dark:text-[#4db8b0] font-semibold border-[#5BA5A0]'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border-transparent',
                        ].join(' ')}>
                        <span className={childActive ? 'text-[#5BA5A0]' : 'text-slate-400 dark:text-slate-500'}>
                          {child.icon}
                        </span>
                        <span className="text-left">{child.label}</span>
                      </button>
                    )
                  })}
                </div>
              )
            }

            const active = isActive(entry.href)
            return (
              <button
                key={entry.id}
                onClick={() => handleNavItem(entry.href)}
                title={isCollapsed ? entry.label : undefined}
                className={[
                  'w-full flex items-center py-3 lg:py-2 text-sm lg:text-[13px] font-medium transition-colors border-l-2',
                  isCollapsed ? 'justify-center px-0' : 'gap-2.5 px-4',
                  active
                    ? 'bg-[#d1ede9] dark:bg-[#1a3c38] text-[#1f6b66] dark:text-[#4db8b0] font-semibold border-[#5BA5A0]'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 border-transparent',
                ].join(' ')}>
                <span className={active ? 'text-[#5BA5A0]' : 'text-slate-400 dark:text-slate-500'}>
                  {entry.icon}
                </span>
                {!isCollapsed && entry.label}
              </button>
            )
          })}
        </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Desktop sidebar — colapsable */}
      <aside className={[
        'hidden lg:flex lg:flex-col lg:shrink-0 print:hidden',
        'bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700',
        'transition-all duration-200 ease-in-out overflow-hidden',
        collapsed ? 'lg:w-14' : 'lg:w-56',
      ].join(' ')}>

        {/* Logo header */}
        <div className="shrink-0 border-b border-slate-100 dark:border-slate-700">
          {collapsed ? (
            /* Collapsed: isotipo centrado + toggle abajo */
            <div className="flex flex-col items-center py-2 gap-1">
              <AppLogo size={28} iconOnly />
              <Button
                variant="icon"
                onClick={onToggleCollapse}
                className="!p-1"
                title="Expandir menú"
              >
                <IcoChevronRight />
              </Button>
            </div>
          ) : (
            /* Expanded: logo + nombre + toggle a la derecha */
            <div className="px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <AppLogo size={28} iconOnly />
                  <span
                    className="font-bold tracking-widest text-xs truncate text-[#2a2520] dark:text-slate-100"
                  >
                    {t('brand')}
                  </span>
                </div>
                <Button
                  variant="icon"
                  onClick={onToggleCollapse}
                  className="!p-1.5 shrink-0"
                  title="Colapsar menú"
                >
                  <IcoChevronLeft />
                </Button>
              </div>
              {/* REQ-LOGO2 (SCRUM-174) — texto "Powered by AtlanticERP" debajo del logo, alineado a la derecha */}
              <p className="text-right text-[9px] text-slate-400 dark:text-slate-500 mt-1">
                {t('poweredBy')}
              </p>
            </div>
          )}
        </div>

        {navContent(collapsed)}
      </aside>

      {/* Móvil — backdrop + drawer (sin cambios) */}
      <div className="lg:hidden">
        {isOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
            aria-hidden="true"
          />
        )}
        <aside
          className={[
            'fixed inset-y-0 left-0 z-50 w-64 flex flex-col print:hidden',
            'bg-white dark:bg-slate-800',
            'border-r border-slate-200 dark:border-slate-700',
            'transform transition-transform duration-200 ease-in-out',
            isOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}>
          {navContent(false)}
        </aside>
      </div>

      {pendingHref !== null && (
        <ExitWithoutSavingModal
          onCancel={() => setPendingHref(null)}
          onConfirm={() => {
            clearQuoteDirty(false)
            const href = pendingHref
            setPendingHref(null)
            navigate(href)
            onClose()
          }}
        />
      )}
    </>
  )
}
