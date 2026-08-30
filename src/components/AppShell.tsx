import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/hooks/useTheme'
import TopBar from './TopBar'
import Sidebar from './Sidebar'

// SCRUM-58 — el topbar decía "CRM" fijo en toda la app, incluidas las 6 pantallas de
// Ventas & Diseño. Mapea el pathname actual a "{módulo}" o "{módulo} · {pantalla}".
// Epic CRM Batch A (SCRUM-673→676) — Pipeline y Clientes se reubicaron de sección de menú a
// CRM pero conservan su URL /ventas-diseno/pipeline|clients (ver Sidebar.tsx) — hay que
// resolverlas ANTES del bloque general de /ventas-diseno/ o el topbar seguiría diciendo
// "Ventas & Diseño" para pantallas que ahora son de CRM.
function moduleLabel(pathname: string, t: (key: string) => string, tVd: (key: string) => string, tCrm: (key: string) => string): string {
  if (pathname.startsWith('/crm/') || pathname.startsWith('/ventas-diseno/pipeline') || pathname.startsWith('/ventas-diseno/clients')) {
    const screen = pathname.startsWith('/crm/dashboard')             ? tCrm('nav.dashboard')
      : pathname.startsWith('/crm/projects')                         ? tCrm('nav.projectList')
      : pathname.startsWith('/ventas-diseno/pipeline')                ? tVd('nav.pipeline')
      : pathname.startsWith('/ventas-diseno/clients')                 ? tVd('nav.clients')
      : null
    return screen ? `${tCrm('nav.module')} · ${screen}` : tCrm('nav.module')
  }
  if (pathname.startsWith('/ventas-diseno/')) {
    const screen = pathname.startsWith('/ventas-diseno/home')        ? tVd('nav.home')
      : pathname.startsWith('/ventas-diseno/quotes-list')            ? tVd('nav.quotesList')
      : pathname.startsWith('/ventas-diseno/pedidos')                ? tVd('nav.pedidos')
      : pathname.startsWith('/ventas-diseno/quotes')                 ? tVd('nav.quote')
      : pathname.startsWith('/ventas-diseno/reports')                ? tVd('nav.reports')
      : pathname.startsWith('/ventas-diseno/audit-log')              ? tVd('nav.auditLog')
      : pathname.startsWith('/ventas-diseno/catalog')                ? tVd('catalog.pageTitle')
      : null
    return screen ? `${tVd('nav.module')} · ${screen}` : tVd('nav.module')
  }
  if (pathname.startsWith('/compras'))      return t('nav.compras')
  if (pathname.startsWith('/inventario'))   return t('nav.inventario')
  if (pathname.startsWith('/servicios'))    return t('nav.servicios')
  if (pathname.startsWith('/admin-contab')) return t('nav.adminContab')
  if (pathname.startsWith('/gerencia'))     return t('nav.gerencia')
  if (pathname.startsWith('/operaciones'))  return t('nav.operaciones')
  if (pathname.startsWith('/security'))     return t('nav.security')
  if (pathname.startsWith('/settings'))     return t('nav.settings')
  return ''
}

export default function AppShell() {
  const { t }        = useTranslation('common')
  const { t: tVd }   = useTranslation('ventasDiseno')
  const { t: tCrm }  = useTranslation('crm')
  const { pathname } = useLocation()
  const [sidebarOpen,      setSidebarOpen]      = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // SCRUM-711 — sesiones persistidas desde antes de este ticket nunca vuelven a pasar
    // por setAuth() (que fuerza 'sidebar-collapsed'), así que se quedan con el valor viejo
    // para siempre. Forzamos el colapso una única vez por navegador; después de esta
    // migración, el toggle manual del usuario persiste con normalidad.
    if (localStorage.getItem('sidebar-collapsed-migrated-v711') !== 'true') {
      localStorage.setItem('sidebar-collapsed-migrated-v711', 'true')
      localStorage.setItem('sidebar-collapsed', 'true')
      return true
    }
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })

  useTheme()

  // Cerrar drawer móvil al navegar
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  const toggleDesktopCollapse = () => {
    setSidebarCollapsed(c => {
      const next = !c
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden print:h-auto print:overflow-visible">
      {/* Sidebar: full-height column on desktop, drawer on mobile */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleDesktopCollapse}
      />

      {/* Right column: TopBar + content */}
      <div className="flex flex-col flex-1 overflow-hidden print:overflow-visible">
        <TopBar
          moduleLabel={moduleLabel(pathname, t, tVd, tCrm)}
          onSidebarToggle={() => setSidebarOpen(o => !o)}
        />
        {/* print:overflow-visible/h-auto — SCRUM-140: este contenedor + los 2 de arriba
            son overflow-auto/hidden con altura fija (h-screen/flex-1) para el scroll de
            pantalla; sin este override, un window.print() disparado con este layout
            montado (PickingSheetModal/ConsolidatedPickingModal — Cotización usa un PDF
            real desde SCRUM-766, ya no window.print()) se recortaba al alto visible del
            viewport en vez de fluir a varias páginas. */}
        <main className="flex-1 overflow-auto bg-surface dark:bg-[#0f172a] print:overflow-visible print:h-auto">
          <div className="max-w-[1600px] mx-auto px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
