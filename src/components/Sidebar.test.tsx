import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '@/store/authStore'
import { permissionsForOrEmpty } from '@/test/identities'
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
    'nav.configuracionGlobal': 'Configuración global',
  },
  ventasDiseno: {
    'nav.module': 'Ventas & Diseño', 'nav.home': 'Inicio', 'nav.pipeline': 'Pipeline',
    'nav.clients': 'Clientes', 'nav.quotesList': 'Cotizaciones', 'nav.reports': 'Reportes',
    'nav.auditLog': 'Historial', 'nav.pedidos': 'Pedidos',
    'nav.statusPedidos': 'Status de Pedidos',
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
    'nav.movimientosMenu': 'Movimientos', 'nav.cobros': 'Cobros', 'nav.tesoreriaMenu': 'Tesorería',
    // SCRUM-882 — labels agregados para el test de gate por rol más abajo.
    'nav.home': 'Inicio', 'nav.comisionesMenu': 'Comisiones', 'nav.comisionesInternas': 'Internas',
    'nav.comisionesExternas': 'Externas', 'nav.reportes': 'Reportes',
    // SCRUM-930 (F5).
    'nav.estadoCuentaMenu': 'Estado de Cuenta',
    // SCRUM-1002.
    'nav.clientesFiscal': 'Datos fiscales de clientes',
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

// Fase 1b: el menú se decide por permiso. Los permisos del rol REAL del seed (fixture volcado del backend) se mezclan
// con los individuales de cada caso, igual que el JWT real (nivel de seguridad + extra_permissions).
function baseUser(overrides: Partial<UserInfo> = {}): UserInfo {
  const role = overrides.role ?? 'designer'
  return {
    id: 1, first_name: 'Test', last_name: 'User', email: 't@t.com',
    role, modules: {},
    ...overrides,
    permissions: [...new Set([...permissionsForOrEmpty(role), ...(overrides.permissions ?? [])])],
  }
}

// Para los casos «sin el permiso X»: SOLO los permisos que pasa el caso, sin los del rol del seed (que ya podrían traer X).
function exactUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return { ...baseUser(overrides), permissions: overrides.permissions ?? [] }
}

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>
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
  //
  // SCRUM-825 (2026-09-01) — actualizado tras la reorganización del menú: Facturación sigue
  // siendo item plano de nivel 1, pero Cuentas Bancarias pasó a vivir dentro del dropdown
  // "Tesorería" (necesita su propio click para expandirse), y Configuración Fiscal/Datos de la
  // Empresa se movieron fuera de Admin&Cont, a la sección "Configuración" (RN6/RN7).
  it('"Admin. & Contab." muestra las pantallas reales, no un único link placeholder', () => {
    // SCRUM-882 — role explícito de la allow-list de acceso completo (ver
    // ADMIN_CONTAB_FULL_ACCESS_ROLES en Sidebar.tsx): este test verifica la estructura del menú
    // para un actor con acceso pleno, no el gate por rol en sí (eso lo cubre el describe de
    // SCRUM-882 más abajo) — el role placeholder de baseUser ('designer') ya no alcanza sin él.
    useAuthStore.setState({ user: baseUser({ role: 'lider_admin_contab', modules: { admin_contab: noModule({ view: true }) } }) })
    renderSidebar()

    // Cada sección es un accordion colapsado por defecto (SCRUM-58) — hay que abrirla para ver
    // sus ítems, mismo criterio que un usuario real haciendo clic. El Sidebar renderiza dos veces
    // (mobile + desktop) compartiendo el mismo estado `openGroups` — clickear las 2 apariciones
    // alternaría abierto→cerrado, así que se clickea solo la primera.
    fireEvent.click(screen.getAllByText('Admin. & Contab.')[0])

    expect(screen.getAllByText('Facturación').length).toBeGreaterThan(0)
    // SCRUM-930 (F5) — "Estado de Cuenta" entre Inicio y Facturación, mismo nivel (item plano,
    // no dentro de ningún dropdown).
    expect(screen.getAllByText('Estado de Cuenta').length).toBeGreaterThan(0)

    // "Tesorería" es un NavDropdown anidado dentro de la sección — necesita su propio click.
    fireEvent.click(screen.getAllByText('Tesorería')[0])
    expect(screen.getAllByText('Cuentas Bancarias').length).toBeGreaterThan(0)

    // Configuración Fiscal/Datos de la Empresa viven ahora en la sección "Configuración"
    // (SCRUM-825 RN6/RN7, t('nav.settings') del namespace común — no confundir con el "Ajustes"
    // de Servicios, otro namespace), no dentro de Admin&Cont — es su propia sección-accordion
    // (mismo mecanismo que "Admin. & Contab." arriba), necesita su propio click para expandirse.
    fireEvent.click(screen.getAllByText('Configuración')[0])
    expect(screen.getAllByText('Configuración Fiscal').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Datos de la Empresa').length).toBeGreaterThan(0)
  })

  // SCRUM-825 RN2/RN5 — Cobros existía como pantalla (CobrosPage) sin ningún link de sidebar.
  it('"Movimientos" agrupa Cobros y Notas Crédito y Devoluciones', () => {
    // SCRUM-882 — mismo motivo que el test anterior: role explícito de la allow-list.
    useAuthStore.setState({ user: baseUser({ role: 'lider_admin_contab', modules: { admin_contab: noModule({ view: true }) } }) })
    renderSidebar()

    fireEvent.click(screen.getAllByText('Admin. & Contab.')[0])
    fireEvent.click(screen.getAllByText('Movimientos')[0])

    expect(screen.getAllByText('Cobros').length).toBeGreaterThan(0)
  })

  // SCRUM-1139 — `lider_operaciones` (Lider Operaciones) recibe el módulo por override de visibilidad y espeja a la asistente.
  it.each(['lider_operaciones', 'asistente_administrativa'])('%s ve las secciones completas de Admin. & Contab.', role => {
    useAuthStore.setState({ user: baseUser({ role, modules: { admin_contab: noModule({ view: true }) } }) })
    renderSidebar()

    fireEvent.click(screen.getAllByText('Admin. & Contab.')[0])

    expect(screen.getAllByText('Facturación').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Estado de Cuenta').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Movimientos').length).toBeGreaterThan(0)
  })

  // SCRUM-882 — vendedor tiene admin_contab.view=true (lo necesita para sus propias
  // Comisiones Internas) pero el backend le devuelve datos vacíos en el resto de las pantallas del
  // módulo; el síntoma reportado era que el sidebar igual las mostraba (pantallas vacías en vez de
  // ítems ocultos). Ver ADMIN_CONTAB_FULL_ACCESS_ROLES en Sidebar.tsx.
  it('vendedor solo ve "Comisiones → Internas" dentro de Admin. & Contab., el resto queda oculto', () => {
    useAuthStore.setState({ user: baseUser({ role: 'vendedor', modules: { admin_contab: noModule({ view: true }) } }) })
    renderSidebar()

    fireEvent.click(screen.getAllByText('Admin. & Contab.')[0])

    expect(screen.queryByText('Inicio')).not.toBeInTheDocument()
    expect(screen.queryByText('Facturación')).not.toBeInTheDocument()
    expect(screen.queryByText('Estado de Cuenta')).not.toBeInTheDocument()
    expect(screen.queryByText('Movimientos')).not.toBeInTheDocument()
    expect(screen.queryByText('Tesorería')).not.toBeInTheDocument()
    expect(screen.queryByText('Reportes')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByText('Comisiones')[0])
    expect(screen.getAllByText('Internas').length).toBeGreaterThan(0)
    expect(screen.queryByText('Externas')).not.toBeInTheDocument()
  })

  // SCRUM-1002 — Contabilidad/Aprobador editan los datos fiscales de un cliente desde Admin&Cont (no tienen la pantalla Clientes).
  describe('"Datos fiscales de clientes" (SCRUM-1002)', () => {
    function abrirConfiguracion(user: Partial<UserInfo>) {
      useAuthStore.setState({ user: baseUser({ modules: { admin_contab: noModule({ view: true }) }, ...user }) })
      renderSidebar()
      fireEvent.click(screen.getAllByText('Configuración')[0])
    }

    it('aparece para quien tiene acceso completo a Admin&Cont y el permiso angosto de edición', () => {
      abrirConfiguracion({ role: 'lider_admin_contab', permissions: ['ventas_diseno.edit.client_tax_data'] })
      expect(screen.getAllByText('Datos fiscales de clientes').length).toBeGreaterThan(0)
    })

    it('no aparece sin el permiso, aunque tenga acceso completo a Admin&Cont', () => {
      useAuthStore.setState({ user: exactUser({ role: 'lider_admin_contab', permissions: ['admin_contab.records.manage'], modules: { admin_contab: noModule({ view: true }) } }) })
      renderSidebar()
      fireEvent.click(screen.getAllByText('Configuración')[0])
      expect(screen.queryByText('Datos fiscales de clientes')).not.toBeInTheDocument()
    })

    it('no aparece para un vendedor/diseñador con ventas_diseno.edit: él ya tiene el botón en Clientes y la ruta le está vedada', () => {
      // SCRUM-1012: ni siquiera existe el grupo Configuración para él (sin Empresa/Fiscal/Seguridad/Global).
      useAuthStore.setState({ user: baseUser({ role: 'vendedor', modules: { admin_contab: noModule({ view: true }) }, permissions: ['ventas_diseno.edit'] }) })
      renderSidebar()
      expect(screen.queryByText('Configuración')).not.toBeInTheDocument()
      expect(screen.queryByText('Datos fiscales de clientes')).not.toBeInTheDocument()
    })
  })

  // SCRUM-930 (F5) — el ítem no navega dentro del AppShell (no hay ruta de sidebar para Estado de
  // Cuenta): abre el mismo popup que ya usa el botón de Facturación, sin cliente preseleccionado,
  // para que "Cerrar Ventana" (window.close(), ver EstadoCuentaPage.tsx) siga funcionando.
  it('"Estado de Cuenta" abre el popup existente (window.open), no navega en la SPA', () => {
    useAuthStore.setState({ user: baseUser({ role: 'lider_admin_contab', modules: { admin_contab: noModule({ view: true }) } }) })
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderSidebar()

    fireEvent.click(screen.getAllByText('Admin. & Contab.')[0])
    fireEvent.click(screen.getAllByText('Estado de Cuenta')[0])

    expect(openSpy).toHaveBeenCalledWith('/admin-contab/facturacion/estado-cuenta', '_blank')
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

// SCRUM-774 — rebote de Gerencia 2026-08-18: el menú de Servicios vivía en un menú superior
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

  // SCRUM-780 (rebote de Gerencia 2026-08-19) — "Cotizaciones" deja de ser ítem propio de la
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

  it('"Ajustes" no aparece para un rol sin ese permiso (ej. tecnico)', () => {
    useAuthStore.setState({ user: serviciosUser('tecnico') })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Servicios')[0])
    expect(screen.queryByText('Ajustes')).not.toBeInTheDocument()
  })

  // SCRUM-780 — angosta "Ajustes" de lider_servicios/management/superadmin a solo Gerencia
  // (management/superadmin); antes Lider Servicios/Líder de Servicios sí lo veía.
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

  it('vendedor ve Inicio/Tickets/Técnicos (solo "internos", sin desplegable de externos) y nada más', () => {
    useAuthStore.setState({ user: serviciosUser('vendedor') })
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
  // expandido) que era exactamente el bug reportado por Gerencia Test 3. Se corrige para reflejar
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

// SCRUM-711 3ra vuelta — reproduce el escenario exacto del video (Gerencia Test 3, 2026-07-31):
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
      email: 'gerencia3@test.com',
      first_name: 'Gerencia',
      last_name: 'Test 3',
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
    useAuthStore.setState({ user: baseUser({ role: 'vendedor', modules: { ventas_diseno: noModule({ view: true }) } }) })
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
  // roles={['superadmin','management']} con el mismo RequirePermission que ahora usa /crm/dashboard).
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
  it('NO muestra "Dashboard CRM" para un perfil que no sea Gerencia (ej. vendedor)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'vendedor', modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('CRM')[0])
    expect(screen.queryByText('Dashboard CRM')).not.toBeInTheDocument()
    // El resto del grupo CRM sigue visible — solo Dashboard CRM se oculta (REQ-594 Escenario 4).
    expect(screen.getAllByText('Pipeline').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Lista de Proyectos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Clientes').length).toBeGreaterThan(0)
  })

  it('NO muestra "Pedidos" para Líder Admin (lider_admin_contab)', () => {
    useAuthStore.setState({ user: exactUser({ role: 'lider_admin_contab', modules: { ventas_diseno: noModule({ view: true }) } }) })
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

  // SCRUM-1119 — Pedidos muestra márgenes, montos y estado de compra: solo Compras y Gerencia.
  it('NO muestra "Pedidos" para un vendedor (SCRUM-1119)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'vendedor', modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.queryByText('Pedidos')).not.toBeInTheDocument()
  })

  // SCRUM-1159 — quien no ve «Pedidos» (márgenes y montos) sí tiene «Status de Pedidos»: consulta de solo lectura de sus propios pedidos.
  it('vendedor ve «Status de Pedidos» y al hacer clic navega a /bodega/pedidos/status (SCRUM-1159)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'vendedor', modules: { ventas_diseno: noModule({ view: true }) } }) })
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar isOpen={false} onClose={vi.fn()} collapsed={false} onToggleCollapse={vi.fn()} />
        <LocationProbe />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.queryByText('Pedidos')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByText('Status de Pedidos')[0])
    expect(screen.getByTestId('location')).toHaveTextContent('/bodega/pedidos/status')
  })

  // SCRUM-1159 (rebote) — Gerencia busca la consulta de pedidos bajo Bodega: el vendedor la ve también ahí (sin abrirle «Pedidos» del tablero).
  it('vendedor ve «Status de Pedidos» también bajo Bodega y no ve «Pedidos» del tablero (SCRUM-1159)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'vendedor', modules: { ventas_diseno: noModule({ view: true }) } }) })
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar isOpen={false} onClose={vi.fn()} collapsed={false} onToggleCollapse={vi.fn()} />
        <LocationProbe />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getAllByText('Bodega')[0])
    expect(screen.queryByText('nav.pedidos')).not.toBeInTheDocument()
    expect(screen.queryByText('Inicio Bodega')).not.toBeInTheDocument()
    // Una entrada en Ventas & Diseño y otra bajo Bodega; la de Bodega es la última del menú.
    const entradas = screen.getAllByText('Status de Pedidos')
    expect(entradas).toHaveLength(2)
    fireEvent.click(entradas[1])
    expect(screen.getByTestId('location')).toHaveTextContent('/bodega/pedidos/status')
  })

  it('quien tiene Bodega completo NO recibe «Status de Pedidos» duplicado bajo Bodega (SCRUM-1159)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'lider_bodega', permissions: ['bodega.read'], modules: { bodega: noModule({ view: true }), ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Bodega')[0])
    expect(screen.getAllByText('nav.pedidos').length).toBeGreaterThan(0)
    // Bajo Bodega ya tiene el módulo completo: nunca más de una entrada (a lo sumo la de Ventas & Diseño).
    expect(screen.queryAllByText('Status de Pedidos').length).toBeLessThan(2)
  })

  it('superadmin NO ve «Status de Pedidos» en el menú: ya tiene «Pedidos», que enlaza a esa pantalla (SCRUM-1159)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'superadmin', permissions: ['superadmin.all'], modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.queryByText('Status de Pedidos')).not.toBeInTheDocument()
  })

  it.each(['lider_operaciones', 'lider_bodega', 'lider_servicios'])('NO muestra "Pedidos" para %s (SCRUM-1119)', role => {
    useAuthStore.setState({ user: baseUser({ role, modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.queryByText('Pedidos')).not.toBeInTheDocument()
  })

  it('superadmin ve "Pedidos" en Ventas & Diseño (SCRUM-1119)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'superadmin', permissions: ['superadmin.all'], modules: { ventas_diseno: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Ventas & Diseño')[0])
    expect(screen.getAllByText('Pedidos').length).toBeGreaterThan(0)
  })

  it('lider_compras ve "Pedidos de venta" en su sección Compras, aunque no tenga Ventas & Diseño (SCRUM-1119)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'lider_compras', permissions: [], modules: { compras: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Compras · Inventario')[0])
    expect(screen.getAllByText('nav.salesOrders').length).toBeGreaterThan(0)
  })

  it('un usuario de Compras que no es lider_compras no ve "Pedidos de venta" (SCRUM-1119)', () => {
    useAuthStore.setState({ user: baseUser({ role: 'asistente_compras', permissions: ['compras.read'], modules: { compras: noModule({ view: true }) } }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Compras · Inventario')[0])
    expect(screen.queryByText('nav.salesOrders')).not.toBeInTheDocument()
  })

})

// SCRUM-729 — regresión real reportada por Gerencia: "Nueva Orden" (/compras/ordenes/nueva)
// es un sub-path literal de "Ver Órdenes" (/compras/ordenes), así que el viejo isActive()
// basado en startsWith puro resaltaba ambos a la vez en /compras/ordenes/nueva. Test
// permanente (no se borra tras el fix, mismo criterio que los smoke de Playwright
// promovidos a e2e/) para que esta regresión no vuelva a colarse en silencio.
describe('Sidebar — menú lateral de Compras no resalta dos ítems a la vez (SCRUM-729)', () => {
  function comprasUser() {
    // SCRUM-1157 — un usuario real de Compras trae compras.read/.write en el JWT (el menú filtra por el guard de cada ruta).
    return baseUser({ permissions: ['compras.read', 'compras.write'], modules: { compras: noModule({ view: true }) } })
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

  it('muestra Configuración > Seguridad para Gerencia (management) con permiso security.users', () => {
    useAuthStore.setState({ user: baseUser({ role: 'management', permissions: ['security.users'] }) })
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
      role: 'management',
      permissions: ['security.users'],
      menuVisibility: { configuracion: { root: false } },
    }) })
    renderSidebar()
    expect(screen.queryByText('Configuración')).not.toBeInTheDocument()
  })
})

// SCRUM-1012 — Configuración (grupo del menú principal) exclusiva de Gerencia (management) +
// superadmin; Admin&Cont conserva solo sus 3 ítems (Empresa, Fiscal, Datos fiscales de clientes).
describe('Sidebar — Configuración exclusiva de Gerencia (SCRUM-1012)', () => {
  it.each(['management', 'superadmin'] as const)('%s ve Configuración > Seguridad', (role) => {
    useAuthStore.setState({ user: baseUser({ role, permissions: ['security.users', 'security.levels'] }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Configuración')[0])
    expect(screen.getAllByText('Seguridad').length).toBeGreaterThan(0)
  })

  it.each(['vendedor', 'lider_compras', 'lider_bodega', 'lider_servicios', 'tecnico'])(
    '%s NO ve el grupo Configuración ni Seguridad aunque tenga security.users/levels por permiso individual',
    (role) => {
      useAuthStore.setState({ user: baseUser({ role, permissions: ['security.users', 'security.levels'] }) })
      renderSidebar()
      expect(screen.queryByText('Configuración')).not.toBeInTheDocument()
      expect(screen.queryByText('Seguridad')).not.toBeInTheDocument()
    },
  )

  // Pre-QA 1012: Vendedor/Diseñador tienen admin_contab.view por Comisiones, y eso les mostraba Empresa/Fiscal.
  it.each(['vendedor'])('%s con admin_contab.view (Comisiones) NO ve Empresa, Fiscal ni un grupo Configuración vacío', (role) => {
    useAuthStore.setState({ user: baseUser({
      role,
      modules: { admin_contab: noModule({ view: true }) },
      permissions: ['ventas_diseno.edit'],
    }) })
    renderSidebar()
    expect(screen.queryByText('Configuración')).not.toBeInTheDocument()
    expect(screen.queryByText('Datos de la Empresa')).not.toBeInTheDocument()
    expect(screen.queryByText('Configuración Fiscal')).not.toBeInTheDocument()
    expect(screen.queryByText('Datos fiscales de clientes')).not.toBeInTheDocument()
  })

  it('lider_admin_contab ve los 3 ítems de Admin&Cont en Configuración y NO ve Seguridad', () => {
    useAuthStore.setState({ user: baseUser({
      role: 'lider_admin_contab',
      modules: { admin_contab: noModule({ view: true }) },
      permissions: ['security.users', 'ventas_diseno.edit'],
    }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Configuración')[0])
    expect(screen.getAllByText('Datos de la Empresa').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Configuración Fiscal').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Datos fiscales de clientes').length).toBeGreaterThan(0)
    expect(screen.queryByText('Seguridad')).not.toBeInTheDocument()
  })
})

// SCRUM-944/945 — vista consolidada de valores paramétricos de negocio, último ítem del grupo
// "Configuración", gate estricto de superadmin.all (mismo criterio que Auditoría de uso de IA /
// Configuración de Bodega, ver canSeeGlobalSettings en Sidebar.tsx).
describe('Sidebar — Configuración global (SCRUM-944/945)', () => {
  it('un superadmin ve "Configuración global" dentro de Configuración', () => {
    useAuthStore.setState({ user: baseUser({ role: 'superadmin', permissions: ['superadmin.all'] }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Configuración')[0])
    expect(screen.getAllByText('Configuración global').length).toBeGreaterThan(0)
  })

  it('un usuario con security.users pero sin superadmin.all NO ve "Configuración global"', () => {
    useAuthStore.setState({ user: baseUser({ role: 'management', permissions: ['security.users'] }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Configuración')[0])
    expect(screen.queryAllByText('Configuración global')).toHaveLength(0)
  })

  it('un usuario de Admin&Cont sin superadmin.all NO ve "Configuración global"', () => {
    useAuthStore.setState({ user: baseUser({
      role: 'lider_admin_contab', modules: { admin_contab: noModule({ view: true }) }, permissions: [],
    }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Configuración')[0])
    expect(screen.queryAllByText('Configuración global')).toHaveLength(0)
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

  // SCRUM-741 — hallazgo real en producción (Gerencia/Aprobador, Gerencia): a diferencia de
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
      role: 'management', permissions: ['ventas_diseno.read'],
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

// SCRUM-1157 — Lider Operaciones (lider_operaciones): `modules.compras.view` true pero solo permisos de consulta (compras.limited.view +
// compras.sustitutos.manage, sin compras.read/.write). El menú no debe listar pantallas cuya ruta la redirige a inicio.
describe('Sidebar — Compras solo muestra lo que la ruta deja abrir (SCRUM-1157)', () => {
  const visible = (text: string) => screen.queryAllByText(text).length > 0

  const openCompras = () => {
    fireEvent.click(screen.getAllByText('Compras · Inventario')[0])
    // Se abren los desplegables para que la ausencia de un hijo sea por permiso, no por colapso.
    for (const menu of ['nav.ordersMenu', 'nav.catalogStockMenu', 'nav.paymentsMenu']) {
      const el = screen.queryAllByText(menu)[0]
      if (el) fireEvent.click(el)
    }
  }

  it('lider_operaciones (consulta + sustitutos) ve solo Órdenes, Logística, Inventario, Ingresos y Sustitutos', () => {
    useAuthStore.setState({ user: baseUser({
      role: 'lider_operaciones',
      permissions: ['compras.view', 'compras.limited.view', 'compras.sustitutos.manage', 'ventas_diseno.read'],
      modules: { compras: noModule({ view: true }) },
    }) })
    renderSidebar()
    openCompras()

    for (const ok of ['nav.orders', 'nav.logistics', 'Inventario', 'nav.goodsReceipts', 'nav.replacements']) {
      expect(visible(ok), ok).toBe(true)
    }
    for (const fantasma of ['nav.newOrder', 'nav.providers', 'nav.claims', 'nav.reports', 'nav.payments', 'nav.agencies', 'nav.paymentsMenu']) {
      expect(visible(fantasma), fantasma).toBe(false)
    }
  })

  // Pre-QA de SCRUM-1157 (C-1): Lider Operaciones tiene el módulo Compras en solo lectura por persona (`modules.compras.view=false`) y solo permisos de
  // consulta. Su aterrizaje /compras/ordenes y sus pantallas de consulta deben estar en el menú.
  const lideroperaciones = (extra: string[] = []) => baseUser({
    role: 'lider_operaciones',
    permissions: ['compras.limited.view', 'compras.sustitutos.manage', 'ventas_diseno.read', 'admin_contab.view', ...extra],
    modules: { compras: noModule({ view: false }), admin_contab: noModule({ view: true }), ventas_diseno: noModule({ view: true }) },
  })
  const count = (text: string) => screen.queryAllByText(text).length

  it('con compras.limited.view y el módulo en solo lectura ve Ver Órdenes, Logística, Inventario, Ingresos y Sustitutos, y nada más de Compras', () => {
    useAuthStore.setState({ user: lideroperaciones() })
    renderSidebar()
    openCompras()

    for (const ok of ['nav.orders', 'nav.logistics', 'Inventario', 'nav.goodsReceipts', 'nav.replacements']) {
      expect(visible(ok), ok).toBe(true)
    }
    for (const no of ['nav.newOrder', 'nav.providers', 'nav.claims', 'nav.reports', 'nav.payments', 'nav.agencies', 'nav.paymentsMenu']) {
      expect(visible(no), no).toBe(false)
    }
  })

  it('sin compras.sustitutos.manage no ve Comparación de Referencias (su ruta lo rebotaría)', () => {
    useAuthStore.setState({ user: exactUser({
      role: 'lider_operaciones', permissions: ['compras.limited.view'], modules: { compras: noModule({ view: false }) },
    }) })
    renderSidebar()
    openCompras()

    expect(visible('nav.orders')).toBe(true)
    expect(visible('nav.replacements')).toBe(false)
  })

  it('no duplica Inventario, Sustitutos ni Órdenes (los links sueltos de Ventas & Diseño y Logística ceden al menú de consulta)', () => {
    useAuthStore.setState({ user: lideroperaciones(['compras.logistica.view']) })
    renderSidebar()
    openCompras()

    // El menú se pinta dos veces (drawer móvil y escritorio): cada ítem aparece exactamente una vez por pintado.
    const veces = count('nav.ordersMenu')
    expect(veces).toBeGreaterThan(0)
    for (const label of ['Inventario', 'nav.replacements', 'nav.logistics', 'nav.orders', 'nav.catalogStockMenu']) {
      expect(count(label), label).toBe(veces)
    }
  })

  it('sin compras.limited.view y sin el módulo no aparece ningún menú de Compras de consulta', () => {
    useAuthStore.setState({ user: exactUser({ role: 'lider_operaciones', permissions: ['admin_contab.view'], modules: { admin_contab: noModule({ view: true }) } }) })
    renderSidebar()

    expect(visible('Compras · Inventario')).toBe(false)
  })

  it('un usuario con compras.read ve el menú completo de Compras (sin regresión)', () => {
    useAuthStore.setState({ user: baseUser({
      role: 'lider_compras', permissions: ['compras.read', 'compras.write'],
      modules: { compras: noModule({ view: true }) },
    }) })
    renderSidebar()
    openCompras()

    for (const ok of ['nav.orders', 'nav.newOrder', 'nav.logistics', 'nav.providers', 'nav.claims', 'nav.reports', 'nav.payments', 'nav.agencies', 'nav.goodsReceipts', 'nav.replacements']) {
      expect(visible(ok), ok).toBe(true)
    }
  })
})

// SCRUM-1157 — «Datos de la Empresa» y «Configuración Fiscal» son exclusivas de Gerencia (403 para el resto del roster de Admin&Cont, Contabilidad y
// Lider Operaciones incluidos): el menú solo las ofrece al aprobador Gerencia (flag `mark_approver`) y a superadmin.
describe('Sidebar — Empresa y Fiscal solo para Gerencia y superadmin (SCRUM-1157)', () => {
  const adminUser = (role: string, mark: boolean | undefined, permissions: string[] = []) => baseUser({
    role, permissions,
    modules: { admin_contab: noModule({ view: true }) },
    flags: { approve_large_amounts: false, manage_users: false, ...(mark === undefined ? {} : { mark_approver: mark }) },
  })
  const abrirConfiguracion = () => { const c = screen.queryAllByText('Configuración')[0]; if (c) fireEvent.click(c) }
  const visible = (text: string) => screen.queryAllByText(text).length > 0

  it.each(['lider_operaciones', 'lider_admin_contab'])('%s que no es el aprobador Gerencia NO ve Empresa ni Fiscal', role => {
    useAuthStore.setState({ user: adminUser(role, false) })
    renderSidebar()
    abrirConfiguracion()
    expect(visible('Datos de la Empresa')).toBe(false)
    expect(visible('Configuración Fiscal')).toBe(false)
  })

  it('el aprobador Gerencia (flag true) ve Empresa y Fiscal', () => {
    useAuthStore.setState({ user: adminUser('management', true) })
    renderSidebar()
    abrirConfiguracion()
    expect(visible('Datos de la Empresa')).toBe(true)
    expect(visible('Configuración Fiscal')).toBe(true)
  })

  it('superadmin las ve aunque el flag sea false (el backend lo deja pasar por superadmin.all)', () => {
    useAuthStore.setState({ user: adminUser('superadmin', false, ['superadmin.all']) })
    renderSidebar()
    abrirConfiguracion()
    expect(visible('Datos de la Empresa')).toBe(true)
    expect(visible('Configuración Fiscal')).toBe(true)
  })

  it('una sesión abierta antes del cambio (sin el flag) conserva el menú hasta renovarla', () => {
    useAuthStore.setState({ user: adminUser('management', undefined) })
    renderSidebar()
    abrirConfiguracion()
    expect(visible('Datos de la Empresa')).toBe(true)
    expect(visible('Configuración Fiscal')).toBe(true)
  })

  it('lo demás de Administración no cambia para quien no es Gerencia (Facturación sigue visible)', () => {
    useAuthStore.setState({ user: adminUser('lider_operaciones', false) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('Admin. & Contab.')[0])
    expect(visible('Facturación')).toBe(true)
  })
})

// SCRUM-1013 (rebote de Gerencia, 2026-10-02) / SCRUM-1021 — el vendedor no tiene los módulos Compras ni
// Bodega; solo dos permisos angostos de consulta. Su menú: Inventario + Comparación de Referencias
// (como antes de 1013) + Órdenes → Logística y Envío, y Bodega → Bodegas. Nunca el menú completo.
describe('Sidebar — vendedor con permisos angostos de consulta (SCRUM-1013 rebote, SCRUM-1021)', () => {
  const vendedor = (permissions: string[]) => exactUser({
    role: 'vendedor', permissions: ['ventas_diseno.read', 'ventas_diseno.edit', ...permissions],
    modules: { ventas_diseno: noModule({ view: true }) },
  })
  // El Sidebar renderiza el menú dos veces (drawer móvil + escritorio): se consulta por "alguna ocurrencia".
  const visible = (text: string) => screen.queryAllByText(text).length > 0

  it('con compras.logistica.view ve Inventario, Comparación de Referencias y Órdenes → Logística, y nada más de Compras', () => {
    useAuthStore.setState({ user: vendedor(['compras.logistica.view']) })
    renderSidebar()

    fireEvent.click(screen.getAllByText('Compras · Inventario')[0])
    expect(visible('Inventario')).toBe(true)
    expect(visible('nav.replacements')).toBe(true)
    fireEvent.click(screen.getAllByText('nav.ordersMenu')[0])
    expect(visible('nav.logistics')).toBe(true)

    for (const oculto of ['nav.home', 'nav.providers', 'nav.reports', 'nav.claims', 'nav.newOrder', 'nav.orders', 'nav.goodsReceipts', 'nav.payments', 'nav.agencies']) {
      expect(visible(oculto), oculto).toBe(false)
    }
  })

  it('sin compras.logistica.view no aparece Órdenes ni Logística', () => {
    useAuthStore.setState({ user: vendedor([]) })
    renderSidebar()

    fireEvent.click(screen.getAllByText('Compras · Inventario')[0])
    expect(visible('nav.ordersMenu')).toBe(false)
    expect(visible('nav.logistics')).toBe(false)
    expect(visible('Inventario')).toBe(true)
  })

  it('con bodega.warehouses.view ve solo Bodega → Bodegas', () => {
    useAuthStore.setState({ user: vendedor(['bodega.warehouses.view']) })
    renderSidebar()

    expect(visible('Bodega')).toBe(true)
    fireEvent.click(screen.getAllByText('Bodega')[0])
    expect(visible('Bodegas')).toBe(true)
    for (const oculto of ['Inicio Bodega', 'nav.pedidos', 'Movimientos', 'Ver inventario', 'Devoluciones']) {
      expect(visible(oculto), oculto).toBe(false)
    }
  })

  it('sin bodega.warehouses.view no hay Bodega → Bodegas (SCRUM-1159: solo «Status de Pedidos» bajo Bodega)', () => {
    useAuthStore.setState({ user: vendedor([]) })
    renderSidebar()

    expect(visible('Bodegas')).toBe(false)
    fireEvent.click(screen.getAllByText('Bodega')[0])
    for (const oculto of ['Inicio Bodega', 'nav.pedidos', 'Movimientos', 'Ver inventario', 'Devoluciones']) {
      expect(visible(oculto), oculto).toBe(false)
    }
  })

  it('un usuario con bodega.read sigue viendo el menú completo de Bodega (no cambia para Bodega)', () => {
    useAuthStore.setState({ user: baseUser({ permissions: ['bodega.read'], modules: { bodega: noModule({ view: true }) } }) })
    renderSidebar()

    fireEvent.click(screen.getAllByText('Bodega')[0])
    expect(visible('Inicio Bodega')).toBe(true)
    expect(visible('Bodegas')).toBe(true)
    expect(visible('Movimientos')).toBe(true)
  })
})

describe('Sidebar — Contabilidad: Pipeline solo lectura (SCRUM-1128)', () => {
  it('con ventas_diseno.pipeline.read_all ve únicamente el ítem Pipeline de CRM, nada más del módulo', () => {
    useAuthStore.setState({ user: exactUser({ role: 'lider_admin_contab', permissions: ['ventas_diseno.pipeline.read_all'], modules: {} }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('CRM')[0])
    expect(screen.getAllByText('Pipeline').length).toBeGreaterThan(0)
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument()
    expect(screen.queryByText('Lista de Proyectos')).not.toBeInTheDocument()
    expect(screen.queryByText('Cotizaciones')).not.toBeInTheDocument()
    expect(screen.queryByText('Ventas & Diseño')).not.toBeInTheDocument()
  })

  // SCRUM-1139 — Contabilidad edita el Pipeline con `pipeline.edit`, pero el Sidebar sigue mostrándole solo ese ítem.
  it('con read_all + pipeline.edit ve únicamente el ítem Pipeline de CRM, sin ítems de otros módulos', () => {
    useAuthStore.setState({ user: exactUser({ role: 'lider_admin_contab', permissions: ['ventas_diseno.pipeline.read_all', 'ventas_diseno.pipeline.edit'], modules: {} }) })
    renderSidebar()
    fireEvent.click(screen.getAllByText('CRM')[0])
    expect(screen.getAllByText('Pipeline').length).toBeGreaterThan(0)
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument()
    expect(screen.queryByText('Lista de Proyectos')).not.toBeInTheDocument()
    expect(screen.queryByText('Cotizaciones')).not.toBeInTheDocument()
    expect(screen.queryByText('Ventas & Diseño')).not.toBeInTheDocument()
  })

  it('solo con pipeline.edit (sin read_all ni read) no ve Pipeline', () => {
    useAuthStore.setState({ user: baseUser({ role: 'lider_admin_contab', permissions: ['ventas_diseno.pipeline.edit'], modules: {} }) })
    renderSidebar()
    expect(screen.queryByText('Pipeline')).not.toBeInTheDocument()
  })

  it('sin ese permiso ni ventas_diseno.read no ve Pipeline', () => {
    useAuthStore.setState({ user: baseUser({ role: 'lider_admin_contab', permissions: [], modules: {} }) })
    renderSidebar()
    expect(screen.queryByText('Pipeline')).not.toBeInTheDocument()
  })
})

// SCRUM-1168 — con el concepto nuevo de cobros (flag `cobros_v2` del login) el menú Movimientos ofrece «Compensaciones» y deja de ofrecer
// «Registrar abono» (el dinero que entra sin factura ahora es un cobro). Sin el flag, todo sigue como siempre.
describe('Sidebar — Compensaciones según el concepto nuevo de cobros (SCRUM-1168)', () => {
  const contabilidad = (cobrosV2: boolean | undefined) => baseUser({
    role: 'lider_admin_contab',
    modules: { admin_contab: noModule({ view: true }) },
    flags: { approve_large_amounts: false, manage_users: false, ...(cobrosV2 === undefined ? {} : { cobros_v2: cobrosV2 }) },
  })
  const abrirMovimientos = () => {
    fireEvent.click(screen.getAllByText('Admin. & Contab.')[0])
    fireEvent.click(screen.getAllByText('Movimientos')[0])
  }
  const visible = (text: string) => screen.queryAllByText(text).length > 0

  it('con cobros_v2 ve «Compensaciones» y no «Registrar abono»', () => {
    useAuthStore.setState({ user: contabilidad(true) })
    renderSidebar()
    abrirMovimientos()
    expect(visible('nav.compensaciones')).toBe(true)
    expect(visible('nav.registrarAbono')).toBe(false)
    expect(visible('nav.saldoFavor')).toBe(false)   // F5 — el saldo a favor se usa desde Compensaciones
    expect(visible('Cobros')).toBe(true)
  })

  it.each([false, undefined])('sin el concepto nuevo (flag %s) ve «Registrar abono» y no «Compensaciones»', flag => {
    useAuthStore.setState({ user: contabilidad(flag) })
    renderSidebar()
    abrirMovimientos()
    expect(visible('nav.registrarAbono')).toBe(true)
    expect(visible('nav.saldoFavor')).toBe(true)
    expect(visible('nav.compensaciones')).toBe(false)
  })
})

// SCRUM-1181 — el Sidebar llamaba a `usePermission` dentro de `||`: según el resultado de la primera, la segunda NO se ejecutaba y cambiaba la
// cantidad de hooks entre renders. Con la misma instancia montada (entrar o salir de «Ver como usuario» cambia la identidad en sitio) React
// lanzaba «Rendered more/fewer hooks» y la pantalla quedaba en blanco.
describe('Sidebar — cambio de identidad en sitio sin romper las reglas de hooks (SCRUM-1181)', () => {
  const HOOKS_ERROR = /order of Hooks|Rendered (more|fewer) hooks/i

  // Con la primera operación de cada `||` en true (acorta) frente a todas en false (evalúa la segunda): dos conteos de hooks distintos.
  const withShortCircuitPermissions = () => baseUser({
    role: 'management', permissions: ['security.users', 'ventas_diseno.edit.client_tax_data'],
    modules: { ventas_diseno: noModule({ view: true }), admin_contab: noModule({ view: true }) },
  })
  const withoutPermissions = () => baseUser({ id: 2, role: 'designer', permissions: [], modules: { ventas_diseno: noModule({ view: true }) } })

  function expectNoHooksError(spy: { mock: { calls: unknown[][] } }) {
    const logged = spy.mock.calls.map(c => String(c[0]) + ' ' + String(c[1] ?? '')).filter(m => HOOKS_ERROR.test(m))
    expect(logged).toEqual([])
  }

  it('pasar de permisos que acortan a permisos vacíos en la misma instancia no lanza ni registra error de hooks', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ user: withShortCircuitPermissions() })
    renderSidebar()

    expect(() => act(() => { useAuthStore.setState({ user: withoutPermissions() }) })).not.toThrow()

    expectNoHooksError(spy)
    expect(screen.getAllByText('Ventas & Diseño').length).toBeGreaterThan(0)   // sigue renderizando el menú de la identidad nueva
    spy.mockRestore()
  })

  it('y de permisos vacíos a permisos que acortan (el sentido contrario: salir de la sesión observada)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ user: withoutPermissions() })
    renderSidebar()

    expect(() => act(() => { useAuthStore.setState({ user: withShortCircuitPermissions() }) })).not.toThrow()

    expectNoHooksError(spy)
    expect(screen.getAllByText('Ventas & Diseño').length).toBeGreaterThan(0)
    spy.mockRestore()
  })

  it('varios cambios seguidos de identidad (ida y vuelta) tampoco rompen', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAuthStore.setState({ user: withShortCircuitPermissions() })
    renderSidebar()

    expect(() => {
      act(() => { useAuthStore.setState({ user: withoutPermissions() }) })
      act(() => { useAuthStore.setState({ user: withShortCircuitPermissions() }) })
      act(() => { useAuthStore.setState({ user: withoutPermissions() }) })
    }).not.toThrow()

    expectNoHooksError(spy)
    spy.mockRestore()
  })
})

