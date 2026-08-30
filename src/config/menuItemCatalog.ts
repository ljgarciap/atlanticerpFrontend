// SCRUM-724 — catálogo único de ítems de menú por módulo, fuente de verdad tanto
// para la UI de admin (UserVisibilityModal, checkboxes por ítem) como para el
// gateo real en Sidebar.tsx (MENU_ITEM_KEYS ahí mapea cada NavItem.id real a un
// {module, key} de este catálogo — no se vuelve a tipear la lista de ítems, pero
// las claves sí tienen que copiarse a mano en ese mapa porque los `id` internos
// del Sidebar no coinciden 1:1 con estas claves; mantenerlos sincronizados si se
// agrega/quita un ítem acá).
//
// Solo cubre los 7 módulos del catálogo de negocio (ModuleCatalog.php en el
// backend, mismo set que MODULES en RoleVisibilityModal.tsx) — "CRM" no es un
// módulo propio, comparte el gate de `ventas_diseno` (ver comentario en
// Sidebar.tsx sobre Epic CRM Batch A), así que sus ítems viven acá bajo
// `ventas_diseno`. Secciones fuera del catálogo de 7 (Auditoría, Configuración/
// Seguridad, Dev/Sandbox) no tienen override por usuario — quedan gateadas solo
// por permiso, igual que hoy.
export interface MenuItemCatalogEntry {
  key:   string
  label: string
}

export const MENU_ITEM_CATALOG: Record<string, MenuItemCatalogEntry[]> = {
  ventas_diseno: [
    { key: 'crm_dashboard', label: 'Dashboard CRM' },
    { key: 'crm_pipeline',  label: 'Pipeline' },
    { key: 'crm_projects',  label: 'Lista de Proyectos' },
    { key: 'crm_clients',   label: 'Clientes' },
    { key: 'home',          label: 'Inicio' },
    { key: 'quotes_list',   label: 'Cotizaciones' },
    { key: 'pedidos',       label: 'Pedidos' },
    { key: 'reports',       label: 'Reportes' },
    { key: 'audit_log',     label: 'Historial' },
    // SCRUM-739 (UAT-2) — botones de Catálogo, no ítems de navegación del Sidebar
    // (gateados directamente en CatalogPage.tsx, no en MENU_ITEM_KEYS de Sidebar.tsx).
    { key: 'catalogo_inventario_compras', label: 'Catálogo — Inventario de Compras' },
    { key: 'catalogo_inventario_bodega',  label: 'Catálogo — Inventario de Bodega' },
  ],
  compras: [
    { key: 'inicio',       label: 'Inicio' },
    { key: 'proveedores',  label: 'Proveedores' },
    { key: 'ordenes',      label: 'Ver Órdenes' },
    { key: 'nueva_orden',  label: 'Nueva Orden' },
    { key: 'logistica',    label: 'Logística & Envío' },
    { key: 'ingresos',     label: 'Ingresos de Mercancía' },
    { key: 'agencias',     label: 'Agencias de Liquidación' },
    { key: 'pagos',        label: 'Pagos' },
    { key: 'reclamos',     label: 'Garantías & Reclamos' },
    { key: 'sustitutos',   label: 'Sustitutos' },
    { key: 'reportes',     label: 'Reportes' },
    { key: 'inventario',   label: 'Inventario' },
  ],
  bodega: [
    { key: 'home',               label: 'Inicio' },
    { key: 'pedidos',            label: 'Pedidos' },
    { key: 'inventario_ver',     label: 'Ver inventario' },
    { key: 'ajustes',            label: 'Solicitud de ajuste' },
    { key: 'zona_libre',         label: 'Órdenes Zona Libre' },
    { key: 'inventario_general', label: 'Inventario general' },
    { key: 'devoluciones',       label: 'Devoluciones' },
    { key: 'bodegas',            label: 'Bodegas' },
    { key: 'kardex',             label: 'Movimientos' },
    { key: 'reportes',           label: 'Reportes' },
    { key: 'configuracion',      label: 'Configuración' },
  ],
  servicios: [
    { key: 'inicio', label: 'Servicios' },
  ],
  admin_contab: [
    { key: 'inicio', label: 'Admin. & Contab.' },
  ],
  gerencia: [
    { key: 'inicio', label: 'Gerencia' },
  ],
  operaciones: [
    { key: 'inicio', label: 'Operaciones' },
  ],
}

export const MENU_CATALOG_MODULES = Object.keys(MENU_ITEM_CATALOG)
