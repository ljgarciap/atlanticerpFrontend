import { PagosTabPanel } from '@/components/legacy/PagosTabPanel'

// SCRUM-827 (épica SCRUM-749 — Migración ICG→AtlanticERP) — vista de solo lectura de legacy.pagos
// (TESORERIA), catálogo standalone sin cliente (no se puede filtrar por Subcliente, a diferencia
// de SCRUM-762). Audiencia solo equipo técnico — gate role:superadmin exclusivo en App.tsx/
// Sidebar.tsx, distinto del dashboard SCRUM-816 que también admite management.
//
// La lista + ficha viven en PagosTabPanel.tsx (extraído 2026-09-03) para reusarse también como
// pestaña "Pagos" dentro de VistaIcgPage.tsx — este archivo queda como wrapper delgado con la
// cabecera de la pantalla standalone.
export default function LegacyPagosPage() {
  return (
    <div className="p-6 space-y-5 max-w-screen-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Pagos ICG</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
          legacy.pagos (TESORERIA) — catálogo standalone importado de ICG, sin vínculo a cliente
        </p>
      </div>

      <PagosTabPanel />
    </div>
  )
}
