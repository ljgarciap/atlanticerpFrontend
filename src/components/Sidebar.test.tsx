import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '@/store/authStore'
import { useUnsavedQuoteGuard } from '@/store/unsavedQuoteGuard'
import type { UserInfo, ModulePermissions } from '@/types/auth'

// Namespace-aware (Epic CRM Batch A, SCRUM-673→676): 'nav.module' tiene valores distintos en
// crm ("CRM") y ventasDiseno ("Ventas & Diseño") — un mock plano por key, ignorando el
// namespace, hacía que tCrm('nav.module') devolviera "Ventas & Diseño" por accidente, dejando
// pasar en falso el viejo test "CRM oculto para todos los usuarios" (SCRUM-711).
const LABELS: Record<string, Record<string, string>> = {
  common: {
    'nav.compras': 'Compras', 'nav.inventario': 'Inventario',
    'nav.servicios': 'Servicios', 'nav.adminContab': 'Admin. & Contab.',
    'nav.gerencia': 'Gerencia',
    'nav.bodega': 'Bodega', 'nav.bodegas': 'Bodegas', 'nav.kardex': 'Movimientos',
    'nav.ajustes': 'Solicitud de ajuste',
    'nav.bodegaHome': 'Inicio Bodega', 'nav.verInventario': 'Ver inventario',
    'nav.ordenesZonaLibre': 'Órdenes Zona Libre', 'nav.inventarioGeneral': 'Inventario general',
    'nav.devoluciones': 'Devoluciones',
    'nav.settings': 'Configuración', 'nav.security': 'Seguridad',
  },
  ventasDiseno: {
    'nav.module': 'Ventas & Diseño', 'nav.home': 'Inicio', 'nav.pipeline': 'Pipeline',
    'nav.clients': 'Clientes', 'nav.quotesList': 'Cotizaciones', 'nav.reports': 'Reportes',
    'nav.auditLog': 'Historial', 'nav.pedidos': 'Pedidos',
  },
  crm: {
    'nav.module': 'CRM', 'nav.dashboard': 'Dashboard CRM', 'nav.projectList': 'Lista de Proyectos',
    'nav.team': 'Equipo', 'nav.directory': 'Directorio', 'nav.catalog': 'Catálogo',
  },
  // SCRUM-774 — el menú de Servicios se muda al sidebar (antes vivía en ServiciosNavMenu,
  // eliminado). Labels iguales a src/i18n/locales/es/servicios.json > nav.*.
  servicios: {
    'nav.home': 'Inicio', 'nav.tickets': 'Tickets', 'nav.ticketsList': 'Listado de Tickets', 'nav.technicians': 'Técnicos',
    'nav.techniciansInternal': 'Técnicos internos', 'nav.techniciansExternal': 'Técnicos externos',
    'nav.toolsAndSupplies': 'Insumos y Herramientas', 'nav.reports': 'Reportes',
    'nav.settings': 'Ajustes', 'nav.quotesHistory': 'Cotizaciones',
  },
  // Hallazgo de Luis (2026-08-22) — el submenú real reemplaza el placeholder de un solo link.
  adminContab: {
    'nav.fiscal': 'Configuración Fiscal', 'nav.empresa': 'Datos de la Empresa',
    'nav.cuentasBancarias': 'Cuentas Bancarias', 'nav.facturacion': 'Facturación',
  },
}

vi.mock('react-i18next', () => ({
  useTranslation: (ns: string = 'common') => ({
    t: (key: string) => LABELS[ns]?.[key] ?? key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

function noModule(overrides: Partial<ModulePermissions> = {}): ModulePermissions {
  return { view: false, view_team: false, edit: false, approve: false, ...overrides }
}

function baseUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Test', last_name: 'User', email: 't@t.com',
    role: 'designer', permissions: [], modules: {},
    ...overrides,
  }
}

function renderSidebar(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar isOpen={false} onClose={vi.fn()} collapsed={false} onToggleCollapse={vi.fn()} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.setState({ user: null })
  useUnsavedQuoteGuard.setState({ isDirty: false })
})

describe('Sidebar — módulos placeholder del catálogo de 7 (SCRUM-58)', () => {
  it('no muestra Servicios/Admin.&Contab./Gerencia sin el permiso de módulo', () => {
    useAuthStore.setState({ user: baseUser({ modules: {} }) })
    renderSidebar()

    expect(screen.queryByText('Servicios')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin. & Contab.')).not.toBeInTheDocument()
    expect(screen.queryByText('Gerencia')).not.toBeInTheDocument()
  })

  it('muestra cada grupo nuevo solo cuando modules.<key>.view es true', () => {
    useAuthStore.setState({ user: baseUser({
      modules: {
        servicios: noModule({ view: true }),
        admin_contab: noModule({ view: true }),
        gerencia: noModule({ view: true }),
      },
    }) })
    renderSidebar()

    expect(screen.getAllByText('Servicios').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Admin. & Contab.').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Gerencia').length).toBeGreaterThan(0)
  })

  // Hallazgo de Luis (2026-08-22) — "Admin. & Contab." tenía 5 batches de pantallas reales
  // construidas (Config Fiscal, Datos de la Empresa, Cuentas Bancarias, Facturación) pero el
  // sidebar seguía linkeando a un único placeholder "Próximamente" — ninguna las mostraba.
  it('"Admin. & Contab." muestra las 4 pantallas reales, no un único link placeholder', () => {
    useAuthStore.setState({ user: baseUser({ modules: { admin_contab: noModule({ view: true }) } }) })
    renderSidebar()

    // Cada sección es un accordion colapsado por defecto (SCRUM-58) — hay que abrirla para ver
    // sus ítems, mismo criterio que un usuario real haciendo clic. El Sidebar renderiza dos veces
    // (mobile + desktop) compartiendo el mismo estado `openGroups` — clickear las 2 apariciones
    // alternaría abierto→cerrado, así que se clickea solo la primera.
    fireEvent.click(screen.getAllByText('Admin. & Contab.')[0])

    expect(screen.getAllByText('Configuración Fiscal').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Datos de la Empresa').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cuentas Bancarias').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Facturación').length).toBeGreaterThan(0)
  })
})

describe('Sidebar — visibilidad de Bodega (SCRUM-451, hallazgo Pre-QA 2026-07-21)', () => {
  it('no muestra Bodega sin modules.bodega.view ni el permiso bodega.read', () => {
    useAuthStore.setState({ user: baseUser({ modules: {}, permissions: [] }) })
    renderSidebar()
    expect(screen.queryByText('Bodegas')).not.toBeInTheDocument()
  })

  it('muestra Bodega cuando modules.bodega.view es true', () => {
    useAuthStore.setState({ user: baseUser({ modules: { bodega: noModule({ view: true }) } }) })
    renderSidebar()
    // SCRUM-711 3ra vuelta — el grupo nace colapsado, hay que abrirlo para ver sus items.
    fireEvent.click(screen.getAllByText('Bodega')[0])
    expect(screen.getAllByText('Bodegas').length).toBeGreaterThan(0)
  })

  it('muestra Bodega cuando bodega.read viene solo de extra_permissions, sin visibilidad de rol', () => {
    // Mismo patrón que ventas_diseno.read: un grant angosto por extra_permissions sin
    // modules.bodega.view no debe dejar a la persona sin forma de encontrar la pantalla.
    useAuthStore.setState({ user: baseUser({ modules: {}, permissions: ['bodega.read'] }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Bodega')[0])
    expect(screen.getAllByText('Bodegas').length).toBeGreaterThan(0)
  })
})

describe('Sidebar — Inicio + dropdown Inventario de Bodega (SCRUM-363)', () => {
  it('muestra "Inicio" como primera opción del módulo Bodega', () => {
    useAuthStore.setState({ user: baseUser({ modules: { bodega: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Bodega')[0])
    expect(screen.getAllByText('Inicio Bodega').length).toBeGreaterThan(0)
  })

  it('el desplegable "Inventario" arranca cerrado y un clic revela sus 5 opciones', () => {
    useAuthStore.setState({ user: baseUser({ modules: { bodega: noModule({ view: true }) } }) })
    renderSidebar()

    // SCRUM-711 3ra vuelta — el grupo "Bodega" también nace colapsado ahora; hay que abrirlo
    // primero para poder ver (y luego hacer clic en) el desplegable "Inventario" anidado.
    fireEvent.click(screen.getAllByText('Bodega')[0])

    expect(screen.queryByText('Ver inventario')).not.toBeInTheDocument()
    expect(screen.queryByText('Órdenes Zona Libre')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByText('Inventario')[0])

    expect(screen.getAllByText('Ver inventario').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Solicitud de ajuste').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Órdenes Zona Libre').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Inventario general').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Devoluciones').length).toBeGreaterThan(0)
  })

  it('Kardex sigue siendo un ítem propio del módulo, no una opción del desplegable Inventario', () => {
    useAuthStore.setState({ user: baseUser({ modules: { bodega: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Bodega')[0])
    expect(screen.getAllByText('Movimientos').length).toBeGreaterThan(0)
  })
})

// SCRUM-774 — rebote de Daniela 2026-08-18: el menú de Servicios vivía en un menú superior
// (ServiciosNavMenu, ya eliminado) en vez del panel lateral como el resto de los módulos, y el
// submenú "Técnicos" mostraba la flecha de desplegable pero nunca revelaba sus opciones (bug real
// en el componente viejo). Mismo patrón que "Inventario" de Bodega (SCRUM-363, ver describe de
// arriba): un NavDropdown anidado dentro de la sección "Servicios".
describe('Sidebar — menú de Servicios en el sidebar, con "Técnicos" desplegable (SCRUM-774)', () => {
  function serviciosUser(role: string) {
    return baseUser({ role, modules: { servicios: noModule({ view: true }) } })
  }

  it('el desplegable "Técnicos" arranca cerrado y un clic revela Internos/Externos', () => {
    useAuthStore.setState({ user: serviciosUser('lider_servicios') })
    renderSidebar()

    fireEvent.click(screen.getAllByText('Servicios')[0])
    expect(screen.queryByText('Técnicos internos')).not.toBeInTheDocument()
    expect(screen.queryByText('Técnicos externos')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByText('Técnicos')[0])
    expect(screen.getAllByText('Técnicos internos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Técnicos externos').length).toBeGreaterThan(0)
  })

  it('muestra Inicio/Tickets/Insumos y Herramientas/Reportes como ítems propios', () => {
    useAuthStore.setState({ user: serviciosUser('lider_servicios') })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Servicios')[0])

    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tickets').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Insumos y Herramientas').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Reportes').length).toBeGreaterThan(0)
  })

  // SCRUM-780 (rebote de Daniela 2026-08-19) — "Cotizaciones" deja de ser ítem propio de la
  // sección, pasa a submenú de "Tickets" (mismo patrón NavDropdown que "Técnicos" de arriba).
  it('el desplegable "Tickets" arranca cerrado y un clic revela Listado de Tickets/Cotizaciones', () => {
    useAuthStore.setState({ user: serviciosUser('lider_servicios') })
    renderSidebar()

    fireEvent.click(screen.getAllByText('Servicios')[0])
    expect(screen.queryByText('Listado de Tickets')).not.toBeInTheDocument()
    expect(screen.queryByText('Cotizaciones')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByText('Tickets')[0])
    expect(screen.getAllByText('Listado de Tickets').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cotizaciones').length).toBeGreaterThan(0)
  })

  // Hallazgo de Luis (2026-08-25) — reportado sobre "Tickets", pero el bug era del mecanismo
  // compartido por todo NavDropdown: estando en la pantalla de un hijo activo, `open` se forzaba
  // siempre a true (`openDropdowns.has(id) || anyChildActive`), así que el clic en el header no
  // colapsaba nada — parecía un botón estático pese a tener la flecha de desplegable. Smoke test
  // promovido a permanente (regla del proyecto: un test que verifica un gate/flujo ya roto una
  // vez no se borra, ver CLAUDE.md).
  it('estando en /servicios/tickets (ruta activa = hijo del dropdown), un clic en el header "Tickets" lo colapsa', () => {
    useAuthStore.setState({ user: serviciosUser('lider_servicios') })
    renderSidebar('/servicios/tickets')

    fireEvent.click(screen.getAllByText('Servicios')[0])
    // Auto-expandido porque la ruta activa es un hijo — hasta acá es el comportamiento esperado.
    expect(screen.getAllByText('Listado de Tickets').length).toBeGreaterThan(0)

    // Clic explícito en el header debe colapsarlo — antes del fix, no tenía ningún efecto.
    fireEvent.click(screen.getAllByText('Tickets')[0])
    expect(screen.queryByText('Listado de Tickets')).not.toBeInTheDocument()

    // Y un segundo clic debe volver a expandirlo (el toggle sigue siendo bidireccional).
    fireEvent.click(screen.getAllByText('Tickets')[0])
    expect(screen.getAllByText('Listado de Tickets').length).toBeGreaterThan(0)
  })

  it('"Ajustes" no aparece para un rol sin ese permiso (ej. tecnico_servicios)', () => {
    useAuthStore.setState({ user: serviciosUser('tecnico_servicios') })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Servicios')[0])
    expect(screen.queryByText('Ajustes')).not.toBeInTheDocument()
  })

  // SCRUM-780 — angosta "Ajustes" de lider_servicios/management/superadmin a solo Gerencia
  // (management/superadmin); antes Aaron/Líder de Servicios sí lo veía.
  it('"Ajustes" ya no aparece para lider_servicios (SCRUM-780)', () => {
    useAuthStore.setState({ user: serviciosUser('lider_servicios') })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Servicios')[0])
    expect(screen.queryByText('Ajustes')).not.toBeInTheDocument()
  })

  it('"Ajustes" aparece para management', () => {
    useAuthStore.setState({ user: serviciosUser('management') })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Servicios')[0])
    expect(screen.getAllByText('Ajustes').length).toBeGreaterThan(0)
  })

  it('vendedor_disenador ve Inicio/Tickets/Técnicos (solo "internos", sin desplegable de externos) y nada más', () => {
    useAuthStore.setState({ user: serviciosUser('vendedor_disenador') })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Servicios')[0])

    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tickets').length).toBeGreaterThan(0)
    expect(screen.queryByText('Insumos y Herramientas')).not.toBeInTheDocument()
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument()
    expect(screen.queryByText('Ajustes')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByText('Técnicos')[0])
    expect(screen.getAllByText('Técnicos internos').length).toBeGreaterThan(0)
    expect(screen.queryByText('Técnicos externos')).not.toBeInTheDocument()

    // Tickets sí despliega, pero sin Cotizaciones (mismo gate isServiciosLimited).
    fireEvent.click(screen.getAllByText('Tickets')[0])
    expect(screen.getAllByText('Listado de Tickets').length).toBeGreaterThan(0)
    expect(screen.queryByText('Cotizaciones')).not.toBeInTheDocument()
  })
})

describe('Sidebar — colapso por grupo (SCRUM-58)', () => {
  // SCRUM-711 3ra vuelta — este test codificaba el comportamiento VIEJO (grupo arranca
  // expandido) que era exactamente el bug reportado por Mark Bekhar. Se corrige para reflejar
  // el AC real: colapsado por default, clic para abrir, otro clic para cerrar de nuevo.
  it('el grupo arranca colapsado; un clic en el header lo abre, otro clic lo vuelve a cerrar', () => {
    useAuthStore.setState({ user: baseUser({
      modules: { ventas_diseno: noModule({ view: true }) },
    }) })
    renderSidebar()

    // El sidebar renderiza dos copias en el DOM (desktop + drawer móvil) —
    // "Ventas & Diseño" solo aparece como header de grupo, sin colisión con
    // ningún item, así que 2 matches = 1 por copia.
    expect(screen.queryByText('Inicio')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.getAllByText('Inicio').length).toBe(2)

    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.queryByText('Inicio')).not.toBeInTheDocument()
  })
})

// SCRUM-711 3ra vuelta — reproduce el escenario exacto del video (Mark Bekhar, 2026-07-31):
// login real y fresco (sin localStorage previo, sin flags de migración de rondas anteriores),
// usuario real (no demo). Ningún grupo debe mostrar sus submenús hasta un clic explícito.
describe('Sidebar — ningún submenú expandido en un login fresco (SCRUM-711, hallazgo real)', () => {
  beforeEach(() => {
    // Simula un navegador limpio: sin 'sidebar-collapsed', sin flag de migración de la
    // ronda 2 (`sidebar-collapsed-migrated-v711`), sin nada tocado por sesiones previas.
    localStorage.clear()
  })

  it('con acceso a Ventas & Diseño y Configuración, ambos grupos nacen sin sus items visibles', () => {
    useAuthStore.setState({ user: baseUser({
      id: 42,
      email: 'mbekhar@illuminations.com.pa',
      first_name: 'Mark',
      last_name: 'Bekhar',
      role: 'management',
      permissions: ['security.users'],
      modules: { ventas_diseno: noModule({ view: true }) },
    }) })
    renderSidebar()

    // Los headers de sección (módulos principales) sí están visibles.
    expect(screen.getAllByText('Ventas & Diseño').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Configuración').length).toBeGreaterThan(0)

    // Pero ningún submenú/item del grupo aparece desplegado sin clic previo.
    expect(screen.queryByText('Inicio')).not.toBeInTheDocument()
    expect(screen.queryByText('Cotizaciones')).not.toBeInTheDocument()
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument()
    expect(screen.queryByText('Seguridad')).not.toBeInTheDocument()

    // Clic explícito en el módulo principal expande solo ESE grupo.
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0)
    // Configuración sigue colapsado — el clic en un grupo no afecta a los demás.
    expect(screen.queryByText('Seguridad')).not.toBeInTheDocument()
  })
})

describe('Sidebar — visibilidad de Dev/Sandbox (SCRUM-58)', () => {
  it('no muestra el grupo Dev/Sandbox para un usuario no-superadmin', () => {
    useAuthStore.setState({ user: baseUser({ role: 'designer' }) })
    renderSidebar()
    expect(screen.queryByText('Sandbox')).not.toBeInTheDocument()
  })

  it('muestra el grupo Dev/Sandbox para superadmin', () => {
    useAuthStore.setState({ user: baseUser({ role: 'superadmin' }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Dev')[0])
    expect(screen.getAllByText('Sandbox').length).toBeGreaterThan(0)
  })
})

// Epic CRM Batch A (SCRUM-673→676, REQ-593→596) — reemplaza el bloqueo total de SCRUM-713/711.
// CRM es un módulo propio, con el mismo gate que Ventas & Diseño (Pipeline/Clientes no cambian
// de permiso al reubicarse, ver REQ-593 RN3). Pipeline y Clientes se listan bajo CRM apuntando
// a sus rutas de siempre (/ventas-diseno/pipeline|clients, ver comentario en groups[] de
// Sidebar.tsx) — no se duplica la pantalla, solo el ítem de menú.
describe('Sidebar — módulo CRM (Epic CRM Batch A, SCRUM-673→676)', () => {
  it('no muestra el grupo CRM sin acceso a ventas_diseno.read', () => {
    useAuthStore.setState({ user: baseUser({ modules: { ventas_diseno: noModule() }, permissions: [] }) })
    renderSidebar()
    expect(screen.queryByText('CRM')).not.toBeInTheDocument()
  })

  it('muestra el grupo CRM con Dashboard CRM, Pipeline, Lista de Proyectos y Clientes para Gerencia (role=management)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'management', modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    // getAllByText: el sidebar renderiza dos árboles (desktop + drawer móvil), cada label
    // aparece 2 veces siempre — mismo patrón que el resto de este archivo (ver "Inicio Bodega").
    expect(screen.getAllByText('CRM').length).toBeGreaterThan(0)
    // SCRUM-711 3ra vuelta — el grupo nace colapsado, hay que abrirlo para ver sus items.
    fireEvent.click(screen.getAllByText('CRM')[0])
    expect(screen.getAllByText('Dashboard CRM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pipeline').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Lista de Proyectos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Clientes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Catálogo').length).toBeGreaterThan(0)
  })

  // SCRUM-728 — submenú "Catálogo" dentro de CRM, mismo gate (ventas_diseno.read /
  // modules.ventas_diseno.view) que el resto del grupo — no agrega ni quita permisos,
  // solo un acceso adicional a la misma ruta/pantalla que ya usan los botones "Catálogo"
  // en Clientes/Pedidos/Pipeline.
  it('SCRUM-728: muestra "Catálogo" dentro de CRM para cualquier perfil con acceso a Ventas & Diseño', () => {
    useAuthStore.setState({ user: baseUser({ role: 'vendedor_disenador', modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('CRM')[0])
    expect(screen.getAllByText('Catálogo').length).toBeGreaterThan(0)
  })

  it('SCRUM-728: no muestra "Catálogo" en CRM sin acceso a ventas_diseno.read', () => {
    useAuthStore.setState({ user: baseUser({ modules: { ventas_diseno: noModule() }, permissions: [] }) })
    renderSidebar()
    expect(screen.queryByText('Catálogo')).not.toBeInTheDocument()
  })

  // Corrige un hallazgo de un segundo pase de Pre-QA (2026-07-31): el primer fix gateaba
  // Dashboard CRM solo a 'management', dejando afuera a superadmin — a diferencia del resto de
  // la app (RequirePermission trata superadmin.all como comodín; /security/departments ya usa
  // roles={['superadmin','management']} con el mismo RequireRole que ahora usa /crm/dashboard).
  it('también muestra "Dashboard CRM" para superadmin (mismo bypass que el resto de la app)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'superadmin', permissions: ['superadmin.all'], modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('CRM')[0])
    expect(screen.getAllByText('Dashboard CRM').length).toBeGreaterThan(0)
  })

  it('el grupo Ventas & Diseño ya no incluye Pipeline ni Clientes (solo aparecen bajo CRM), pero sí Pedidos', () => {
    useAuthStore.setState({ user: baseUser({ role: 'management', modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    // Ambos grupos nacen colapsados — hay que abrir los dos para verificar la reubicación.
    fireEvent.click(screen.getAllByText('CRM')[0])
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    // Exactamente 2 (desktop + drawer) y no 4 — confirma que no quedaron duplicados en
    // ambos grupos (CRM y Ventas & Diseño) tras mover el ítem de menú.
    expect(screen.getAllByText('Pipeline')).toHaveLength(2)
    expect(screen.getAllByText('Clientes')).toHaveLength(2)
    expect(screen.getAllByText('Pedidos').length).toBeGreaterThan(0)
  })

  // Hallazgo de Pre-QA (2026-07-31) — REQ-594 RN5/RN6: "Dashboard CRM" y "Pedidos" no son
  // visibles para todo perfil con acceso a Ventas & Diseño/CRM, a diferencia de Pipeline/Lista
  // de Proyectos/Clientes. role_key confirmado contra la DB local (ver comentario en Sidebar.tsx).
  it('NO muestra "Dashboard CRM" para un perfil que no sea Gerencia (ej. vendedor_disenador)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'vendedor_disenador', modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('CRM')[0])
    expect(screen.queryByText('Dashboard CRM')).not.toBeInTheDocument()
    // El resto del grupo CRM sigue visible — solo Dashboard CRM se oculta (REQ-594 Escenario 4).
    expect(screen.getAllByText('Pipeline').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Lista de Proyectos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Clientes').length).toBeGreaterThan(0)
  })

  it('NO muestra "Pedidos" para Líder Admin (lider_admin_contab)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'lider_admin_contab', modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    // Se abre el grupo para que la ausencia de "Pedidos" sea por permiso, no por colapso.
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.queryByText('Pedidos')).not.toBeInTheDocument()
  })

  it('NO muestra "Pedidos" para Asistente Administrativa (asistente_administrativa)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'asistente_administrativa', modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.queryByText('Pedidos')).not.toBeInTheDocument()
  })

  it('sí muestra "Pedidos" para un vendedor_disenador (ve solo lo propio, ver REQ-629 — Batch F)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'vendedor_disenador', modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.getAllByText('Pedidos').length).toBeGreaterThan(0)
  })
})

// SCRUM-729 — regresión real reportada por Daniela: "Nueva Orden" (/compras/ordenes/nueva)
// es un sub-path literal de "Ver Órdenes" (/compras/ordenes), así que el viejo isActive()
// basado en startsWith puro resaltaba ambos a la vez en /compras/ordenes/nueva. Test
// permanente (no se borra tras el fix, mismo criterio que los smoke de Playwright
// promovidos a e2e/) para que esta regresión no vuelva a colarse en silencio.
describe('Sidebar — menú lateral de Compras no resalta dos ítems a la vez (SCRUM-729)', () => {
  function comprasUser() {
    return baseUser({ modules: { compras: noModule({ view: true }) } })
  }

  it('en /compras/ordenes/nueva resalta únicamente "Nueva Orden", no "Ver Órdenes"', () => {
    useAuthStore.setState({ user: comprasUser() })
    renderSidebar('/compras/ordenes/nueva')
    fireEvent.click(screen.getAllByText('Compras · Inventario')[0])

    const nuevaOrdenButton = screen.getAllByText('nav.newOrder')[0].closest('button')
    const verOrdenesButton = screen.getAllByText('nav.orders')[0].closest('button')

    expect(nuevaOrdenButton).toHaveClass('bg-[#d1ede9]')
    expect(verOrdenesButton).not.toHaveClass('bg-[#d1ede9]')
  })

  it('en /compras/ordenes resalta únicamente "Ver Órdenes"', () => {
    useAuthStore.setState({ user: comprasUser() })
    renderSidebar('/compras/ordenes')
    fireEvent.click(screen.getAllByText('Compras · Inventario')[0])

    const nuevaOrdenButton = screen.getAllByText('nav.newOrder')[0].closest('button')
    const verOrdenesButton = screen.getAllByText('nav.orders')[0].closest('button')

    expect(verOrdenesButton).toHaveClass('bg-[#d1ede9]')
    expect(nuevaOrdenButton).not.toHaveClass('bg-[#d1ede9]')
  })
})

describe('Sidebar — Configuración / Seguridad (SCRUM-711)', () => {
  it('no muestra Configuración para un usuario sin permisos de seguridad', () => {
    useAuthStore.setState({ user: baseUser({ permissions: [] }) })
    renderSidebar()
    expect(screen.queryByText('Configuración')).not.toBeInTheDocument()
  })

  it('muestra Configuración > Seguridad para un usuario con permiso security.users', () => {
    useAuthStore.setState({ user: baseUser({ permissions: ['security.users'] }) })
    renderSidebar()
    expect(screen.getAllByText('Configuración').length).toBeGreaterThan(0)
    // SCRUM-711 3ra vuelta — el grupo nace colapsado, hay que abrirlo para ver "Seguridad".
    fireEvent.click(screen.getAllByText('Configuración')[0])
    expect(screen.getAllByText('Seguridad').length).toBeGreaterThan(0)
  })

  it('muestra Configuración > Seguridad para un superadmin (superadmin.all bypassa el check)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'superadmin', permissions: ['superadmin.all'] }) })
    renderSidebar()
    expect(screen.getAllByText('Configuración').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('Configuración')[0])
    expect(screen.getAllByText('Seguridad').length).toBeGreaterThan(0)
  })

  // SCRUM-739 (UAT-2) — 'configuracion'/'root' es el ítem sintético de la máscara
  // global de rollout (UatVisibilityService); a diferencia del resto de la
  // sección, Configuración no es parte de ModuleCatalog, así que su gate no pasa
  // por modules.view — tiene que chequear menuVisibility directamente.
  it('con permiso security.users pero configuracion.root oculto por UAT, no muestra Configuración', () => {
    useAuthStore.setState({ user: baseUser({
      permissions: ['security.users'],
      menuVisibility: { configuracion: { root: false } },
    }) })
    renderSidebar()
    expect(screen.queryByText('Configuración')).not.toBeInTheDocument()
  })
})

// SCRUM-739 (UAT-2) — hallazgo real de Pre-QA (re-corrida contra el diseño nuevo, 2026-08-07):
// ventas_diseno/bodega/servicios tienen un OR (`modules.X.view === true ||
// usePermission('X.read')`) pensado para el caso de una extra_permission individual sin
// visibilidad de rol. Ese mismo OR hacía que ocultar cualquiera de esos 3 módulos vía UAT no
// tuviera NINGÚN efecto visible para un usuario con acceso real por rol (el permiso plano
// `X.read` sigue presente — la máscara UAT a propósito nunca lo toca, ver
// UatVisibilityService). Fix: el backend emite ahora `menuVisibility.<module>.__module__ = false`
// cuando UAT oculta ese módulo, y el Sidebar lo usa para ganarle al OR.
describe('Sidebar — UAT oculta un módulo de negocio pese al permiso plano por rol (SCRUM-739)', () => {
  it('con servicios.read otorgado por rol, si UAT oculta servicios (__module__:false), no lo muestra', () => {
    useAuthStore.setState({ user: baseUser({
      permissions: ['servicios.read'],
      modules: { servicios: noModule({ view: true }) },
      menuVisibility: { servicios: { __module__: false } },
    }) })
    renderSidebar()
    expect(screen.queryByText('Servicios')).not.toBeInTheDocument()
  })

  it('con ventas_diseno.read otorgado por rol, si UAT oculta ventas_diseno, no lo muestra', () => {
    useAuthStore.setState({ user: baseUser({
      permissions: ['ventas_diseno.read'],
      modules: { ventas_diseno: noModule({ view: true }) },
      menuVisibility: { ventas_diseno: { __module__: false } },
    }) })
    renderSidebar()
    expect(screen.queryByText('Ventas & Diseño')).not.toBeInTheDocument()
  })

  it('con bodega.read otorgado por rol, si UAT oculta bodega, no lo muestra', () => {
    useAuthStore.setState({ user: baseUser({
      permissions: ['bodega.read'],
      modules: { bodega: noModule({ view: true }) },
      menuVisibility: { bodega: { __module__: false } },
    }) })
    renderSidebar()
    expect(screen.queryByText('Bodega')).not.toBeInTheDocument()
  })

  it('sin __module__:false, servicios sigue visible por el permiso individual (no regresiona el caso original del OR)', () => {
    useAuthStore.setState({ user: baseUser({
      permissions: ['servicios.read'],
      modules: {},
    }) })
    renderSidebar()
    expect(screen.getAllByText('Servicios').length).toBeGreaterThan(0)
  })

  // SCRUM-741 — hallazgo real en producción (David/Mark, Gerencia): a diferencia de
  // ventas_diseno/bodega/servicios arriba, "Inventario" (dentro de la sección "Compras ·
  // Inventario") tiene su PROPIO OR de dos niveles (canSeeCompras || canSeeVentasDiseno,
  // SCRUM-231→244/REQ-168) que nunca leía __module__ — así que ocultar Compras vía UAT no
  // ocultaba este ítem (ni la sección que lo envuelve) para nadie con acceso a Ventas & Diseño,
  // Gerencia incluido, aunque modules.compras.view ya viniera en false.
  it('con acceso a Ventas & Diseño, si UAT oculta compras (__module__:false), no muestra la sección "Compras · Inventario"', () => {
    useAuthStore.setState({ user: baseUser({
      role: 'management',
      modules: { ventas_diseno: noModule({ view: true }), compras: noModule({ view: false }) },
      menuVisibility: { compras: { __module__: false } },
    }) })
    renderSidebar()
    expect(screen.queryByText('Compras · Inventario')).not.toBeInTheDocument()
    expect(screen.queryByText('Inventario')).not.toBeInTheDocument()
  })

  it('con acceso a Ventas & Diseño y compras SIN ocultar por UAT, sigue viendo Inventario en modo restringido (REQ-168, no regresiona)', () => {
    useAuthStore.setState({ user: baseUser({
      role: 'management',
      modules: { ventas_diseno: noModule({ view: true }), compras: noModule({ view: false }) },
    }) })
    renderSidebar()
    expect(screen.getAllByText('Compras · Inventario').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('Compras · Inventario')[0])
    expect(screen.getAllByText('Inventario').length).toBeGreaterThan(0)
  })
})

// SCRUM-723 — con una cotización sin confirmar abierta (QuotePage marca isDirty en
// useUnsavedQuoteGuard), cualquier click de navegación del Sidebar debe interceptarse
// con el modal "Salir sin guardar" en vez de navegar directo.
describe('Sidebar — guard de cotización sin guardar (SCRUM-723)', () => {
  function openVentasDisenoAndClickInicio() {
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    fireEvent.click(screen.getAllByText('Inicio')[0])
  }

  it('navega directo sin mostrar el modal cuando no hay cotización sin guardar', () => {
    useAuthStore.setState({ user: baseUser({ modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()

    openVentasDisenoAndClickInicio()

    expect(screen.queryByText('ventasDiseno:quote.exitWithoutSavingModal.title')).not.toBeInTheDocument()
  })

  it('intercepta la navegación con el modal "Salir sin guardar" cuando isDirty es true', () => {
    useUnsavedQuoteGuard.setState({ isDirty: true })
    useAuthStore.setState({ user: baseUser({ modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()

    openVentasDisenoAndClickInicio()

    expect(screen.getByText('ventasDiseno:quote.exitWithoutSavingModal.title')).toBeInTheDocument()
  })

  it('"Cancelar" cierra el modal, no navega y deja isDirty intacto', () => {
    useUnsavedQuoteGuard.setState({ isDirty: true })
    useAuthStore.setState({ user: baseUser({ modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()

    openVentasDisenoAndClickInicio()
    fireEvent.click(screen.getByText('common:actions.cancel'))

    expect(screen.queryByText('ventasDiseno:quote.exitWithoutSavingModal.title')).not.toBeInTheDocument()
    expect(useUnsavedQuoteGuard.getState().isDirty).toBe(true)
  })

  it('"Salir sin guardar" limpia isDirty y cierra el modal', () => {
    useUnsavedQuoteGuard.setState({ isDirty: true })
    useAuthStore.setState({ user: baseUser({ modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()

    openVentasDisenoAndClickInicio()
    fireEvent.click(screen.getByText('ventasDiseno:quote.exitWithoutSavingModal.confirm'))

    expect(useUnsavedQuoteGuard.getState().isDirty).toBe(false)
    expect(screen.queryByText('ventasDiseno:quote.exitWithoutSavingModal.title')).not.toBeInTheDocument()
  })
})

// SCRUM-724 — override de visibilidad de ítems de menú por usuario (menuVisibility
// del JWT), por encima del gate de módulo por rol de arriba (modules.*.view).
describe('Sidebar — override de visibilidad de ítems de menú por usuario (SCRUM-724)', () => {
  it('oculta un ítem con override explícito en false, sin afectar a sus hermanos', () => {
    useAuthStore.setState({ user: baseUser({
      modules: { ventas_diseno: noModule({ view: true }) },
      menuVisibility: { ventas_diseno: { quotes_list: false } },
    }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])

    expect(screen.queryByText('Cotizaciones')).not.toBeInTheDocument()
    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0)
  })

  it('un ítem ausente de menuVisibility sigue visible (default true)', () => {
    useAuthStore.setState({ user: baseUser({
      modules: { ventas_diseno: noModule({ view: true }) },
      menuVisibility: { ventas_diseno: {} },
    }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])

    expect(screen.getAllByText('Cotizaciones').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0)
  })

  it('sin menuVisibility en absoluto, todos los ítems se muestran igual que antes', () => {
    useAuthStore.setState({ user: baseUser({ modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])

    expect(screen.getAllByText('Cotizaciones').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0)
  })

  it('oculta un hijo específico del desplegable Inventario de Bodega sin ocultar a sus hermanos', () => {
    useAuthStore.setState({ user: baseUser({
      modules: { bodega: noModule({ view: true }) },
      menuVisibility: { bodega: { inventario_ver: false } },
    }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Bodega')[0])
    fireEvent.click(screen.getAllByText('Inventario')[0])

    expect(screen.queryByText('Ver inventario')).not.toBeInTheDocument()
    expect(screen.getAllByText('Solicitud de ajuste').length).toBeGreaterThan(0)
  })

  it('oculta el desplegable Inventario completo cuando todos sus hijos están ocultos, sin afectar ítems propios del módulo', () => {
    useAuthStore.setState({ user: baseUser({
      modules: { bodega: noModule({ view: true }) },
      menuVisibility: { bodega: {
        inventario_ver: false, ajustes: false, zona_libre: false, inventario_general: false, devoluciones: false,
      } },
    }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Bodega')[0])

    expect(screen.queryByText('Inventario')).not.toBeInTheDocument()
    expect(screen.getAllByText('Bodegas').length).toBeGreaterThan(0)
  })
})
