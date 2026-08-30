import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import AppShell from './AppShell'
import { useAuthStore } from '@/store/authStore'
import type { UserInfo } from '@/types/auth'

// ── Mock react-i18next ────────────────────────────────────────────────────
// Namespace-aware (Epic CRM Batch A, SCRUM-673→676): 'nav.module' ahora tiene
// valores distintos en crm ("CRM") y ventasDiseno ("Ventas & Diseño") — un
// mock plano por key, ignorando el namespace, colisionaba entre los dos.
const LABELS: Record<string, Record<string, string>> = {
  common: {
    'nav.security':  'Seguridad',
    'nav.compras':   'Compras',
    'nav.inventario': 'Inventario',
    'nav.servicios': 'Servicios',
    'nav.adminContab': 'Admin. & Contab.',
    'nav.gerencia':  'Gerencia',
    'nav.operaciones': 'Operaciones',
    'nav.settings':  'Configuración',
  },
  ventasDiseno: {
    'nav.module':    'Ventas & Diseño',
    'nav.home':      'Inicio',
    'nav.pipeline':  'Pipeline',
    'nav.clients':   'Clientes',
    'nav.quotesList': 'Cotizaciones',
    'nav.pedidos':   'Pedidos',
    'nav.reports':   'Reportes',
    'nav.auditLog':  'Historial',
    'nav.quote':     'Cotización',
    'catalog.pageTitle': 'Catálogo',
  },
  crm: {
    'nav.module':      'CRM',
    'nav.dashboard':   'Dashboard CRM',
    'nav.projectList': 'Lista de Proyectos',
  },
}

vi.mock('react-i18next', () => ({
  useTranslation: (ns: string = 'common') => ({
    t: (key: string) => LABELS[ns]?.[key] ?? key,
    i18n: { changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// ── Evitar dependencias pesadas de TopBar/Sidebar (API calls) — solo nos
// interesa el moduleLabel que recibe TopBar según la ruta actual ──────────
vi.mock('./TopBar', () => ({
  default: ({ moduleLabel }: { moduleLabel: string }) => (
    <div data-testid="topbar">
      <span data-testid="module-label">{moduleLabel}</span>
    </div>
  ),
}))
vi.mock('./Sidebar', () => ({
  default: ({ collapsed }: { collapsed: boolean }) => <div data-testid="sidebar" data-collapsed={String(collapsed)} />,
}))
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => {} }))

function baseUser(overrides: Partial<UserInfo> = {}): UserInfo {
  return {
    id: 1, first_name: 'Test', last_name: 'User', email: 't@t.com',
    role: 'electrician', permissions: [],
    ...overrides,
  }
}

function renderShell(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AppShell />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAuthStore.setState({ user: null })
})

// SCRUM-711 — el tab Seguridad (y Dashboard) se elimina de la barra superior;
// Seguridad se muda a Configuración > Seguridad en el Sidebar (ver Sidebar.test.tsx,
// describe "Configuración / Seguridad (SCRUM-711)").

describe('AppShell — título del módulo en el topbar (SCRUM-58)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: baseUser() })
  })

  it('muestra "Ventas & Diseño · Inicio" en Inicio de Ventas & Diseño', () => {
    renderShell(['/ventas-diseno/home'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('Ventas & Diseño · Inicio')
  })

  it('muestra "Ventas & Diseño · Reportes" en Reportes de Ventas & Diseño', () => {
    renderShell(['/ventas-diseno/reports'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('Ventas & Diseño · Reportes')
  })

  it('muestra "Ventas & Diseño · Catálogo" en la pantalla de Catálogo', () => {
    renderShell(['/ventas-diseno/catalog'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('Ventas & Diseño · Catálogo')
  })

  it('muestra solo "Ventas & Diseño" en una ruta del módulo sin mapeo de pantalla', () => {
    renderShell(['/ventas-diseno/unknown-screen'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('Ventas & Diseño')
    expect(screen.getByTestId('module-label')).not.toHaveTextContent('·')
  })

  it('muestra el nombre del módulo en Compras/Servicios/Gerencia/Operaciones', () => {
    renderShell(['/compras'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('Compras')
  })

  it('muestra "Seguridad" en pantallas de seguridad', () => {
    renderShell(['/security/users'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('Seguridad')
  })
})

// Epic CRM Batch A (SCRUM-673→676, REQ-593→596) — Pipeline y Clientes se reubican de sección
// de menú a CRM sin cambiar de URL (siguen en /ventas-diseno/pipeline|clients, ver Sidebar.tsx);
// el topbar debe reflejar "CRM", no "Ventas & Diseño", para esas dos rutas específicas.
describe('AppShell — Pipeline/Clientes muestran "CRM" en el topbar pese a su URL (Epic CRM Batch A)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: baseUser() })
  })

  it('muestra "CRM · Pipeline" en /ventas-diseno/pipeline', () => {
    renderShell(['/ventas-diseno/pipeline'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('CRM · Pipeline')
  })

  it('muestra "CRM · Clientes" en /ventas-diseno/clients', () => {
    renderShell(['/ventas-diseno/clients'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('CRM · Clientes')
  })

  it('muestra "CRM · Dashboard CRM" en /crm/dashboard', () => {
    renderShell(['/crm/dashboard'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('CRM · Dashboard CRM')
  })

  it('muestra "CRM · Lista de Proyectos" en /crm/projects', () => {
    renderShell(['/crm/projects'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('CRM · Lista de Proyectos')
  })

  it('muestra "Ventas & Diseño · Pedidos" en /ventas-diseno/pedidos (Pedidos NO es CRM, ver hoja del Excel del epic)', () => {
    renderShell(['/ventas-diseno/pedidos'])
    expect(screen.getByTestId('module-label')).toHaveTextContent('Ventas & Diseño · Pedidos')
  })
})

describe('AppShell — migración one-time de sidebar colapsado (SCRUM-711)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: baseUser() })
    localStorage.clear()
  })

  it('fuerza colapsado y marca la migración en un navegador sin marcador previo', () => {
    renderShell()
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true')
    expect(localStorage.getItem('sidebar-collapsed')).toBe('true')
    expect(localStorage.getItem('sidebar-collapsed-migrated-v711')).toBe('true')
  })

  it('respeta el valor guardado si el navegador ya pasó por la migración', () => {
    localStorage.setItem('sidebar-collapsed-migrated-v711', 'true')
    localStorage.setItem('sidebar-collapsed', 'false')
    renderShell()
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'false')
  })
})
