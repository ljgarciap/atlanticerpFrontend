import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import StockSyncPanel from '@/components/StockSyncPanel'
import { IcoArchive, IcoAlertTriangle, IcoCheck } from '@/components/icons'
import { useLegacyMigrationCounts, useLegacyMigrationExcluded, useLegacyMigrationRuns } from '@/hooks/useLegacyMigration'
import type { SyncRunStatus } from '@/types/legacyMigration'

// SCRUM-816 (épica SCRUM-749 — Migración ICG→AtlanticERP) — dashboard de solo lectura para ver el
// resultado real de las corridas de `legacy:sync-*` sin SQL directo. Spec cerrada con Luis
// 2026-09-01/02: 3 bloques (resumen histórico, comparación de conteos, muestra de excluidos con
// motivo). Audiencia incluye Gerencia/CTO — gate `role:superadmin,management` en el backend y en
// Sidebar.tsx (mismo criterio que Gerencia, no hay módulo propio en el JWT para esta épica).

const ENTITIES = ['productos', 'stock', 'clientes', 'proveedores', 'cotizaciones', 'pedidos', 'albaranes', 'facturas', 'pagos'] as const
const ENTITY_LABELS: Record<string, string> = {
  productos: 'Productos', stock: 'Stock (AL4)', clientes: 'Clientes', proveedores: 'Proveedores', cotizaciones: 'Cotizaciones',
  pedidos: 'Pedidos', albaranes: 'Albaranes', facturas: 'Facturas', pagos: 'Pagos',
}

function statusBadge(status: SyncRunStatus) {
  const styles: Record<SyncRunStatus, string> = {
    success: 'text-teal-700 bg-teal-50 dark:text-teal-400 dark:bg-teal-900/20',
    partial: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
    failed:  'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
    held_for_review: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
  }
  const labels: Record<SyncRunStatus, string> = { success: 'éxito', partial: 'parcial', failed: 'falló', held_for_review: 'retenida' }
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[status]}`}>{labels[status]}</span>
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' })
}

function fmtDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

export default function LegacyMigrationDashboardPage() {
  const [runsEntidad, setRunsEntidad] = useState('')
  const [runsPage, setRunsPage] = useState(1)
  const [excludedEntidad, setExcludedEntidad] = useState('')
  const [excludedStatus, setExcludedStatus] = useState('')
  const [excludedPage, setExcludedPage] = useState(1)

  const { data: counts, isLoading: countsLoading } = useLegacyMigrationCounts()
  const { data: runs, isLoading: runsLoading } = useLegacyMigrationRuns({ entidad: runsEntidad || undefined, page: runsPage })
  const { data: excluded, isLoading: excludedLoading } = useLegacyMigrationExcluded({
    entidad: excludedEntidad || undefined,
    status: excludedStatus || undefined,
    page: excludedPage,
  })

  const selectClass = 'rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500'

  return (
    <div className="p-6 space-y-5 max-w-screen-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Migración ICG</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
          Resultado real de las corridas de sincronización — datos importados de ICG Software
        </p>
      </div>

      {/* Bloque 2 — Comparación de conteos staging vs destino */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
            <IcoArchive size={16} className="text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Comparación de conteos</h2>
            <p className="text-xs text-slate-400 mt-0.5">Staging (legacy.*) vs registros resueltos hacia el destino real</p>
          </div>
        </div>
        {countsLoading ? (
          <p className="text-sm text-slate-400 py-6 text-center">Cargando...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {counts?.data.map(row => (
              <div key={row.entidad} className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-3.5">
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">{ENTITY_LABELS[row.entidad] ?? row.entidad}</p>
                <p className="text-[19px] font-bold text-slate-800 dark:text-slate-100 leading-none">{row.staging.toLocaleString()}</p>
                <p className="text-[10.5px] text-slate-400 mt-1">
                  {row.resuelto === null ? 'sin destino/matching' : `${row.resuelto.toLocaleString()} resueltos`}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* SCRUM-1114 — sincronización de stock por delta (ajustes + estado) */}
      <StockSyncPanel />

      {/* Bloque 1 — Resumen histórico de corridas */}
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Resumen histórico</h2>
            <p className="text-xs text-slate-400 mt-0.5">Cada fila es una corrida real de legacy:sync-*</p>
          </div>
          <select
            value={runsEntidad}
            onChange={e => { setRunsEntidad(e.target.value); setRunsPage(1) }}
            className={selectClass}
          >
            <option value="">Todas las entidades</option>
            {ENTITIES.map(e => <option key={e} value={e}>{ENTITY_LABELS[e]}</option>)}
          </select>
        </div>
        {runsLoading ? (
          <p className="text-sm text-slate-400 py-6 text-center">Cargando...</p>
        ) : (runs?.data.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">Sin corridas registradas todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Entidad</th>
                  <th className="px-3 py-2 text-right">Extraídos</th>
                  <th className="px-3 py-2 text-right">Staged</th>
                  <th className="px-3 py-2 text-right">Cargados</th>
                  <th className="px-3 py-2 text-right">Excluidos</th>
                  <th className="px-3 py-2 text-right">Errores</th>
                  <th className="px-3 py-2 text-right">Duración</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {runs?.data.map(run => (
                  <tr key={run.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(run.started_at)}</td>
                    <td className="px-3 py-2 text-xs">{ENTITY_LABELS[run.entidad] ?? run.entidad}</td>
                    <td className="px-3 py-2 text-right text-xs">{run.extraidos.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs">{run.staged.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs">{run.cargados.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs">{run.excluidos.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs">{run.errores.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-xs">{fmtDuration(run.duracion_ms)}</td>
                    <td className="px-3 py-2">{statusBadge(run.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {runs && runs.last_page > 1 && (
          <div className="flex items-center justify-between mt-3">
            <Button variant="secondary" disabled={runsPage <= 1} onClick={() => setRunsPage(p => p - 1)}>Anterior</Button>
            <span className="text-[12px] text-slate-500">Página {runs.current_page} de {runs.last_page}</span>
            <Button variant="secondary" disabled={runsPage >= runs.last_page} onClick={() => setRunsPage(p => p + 1)}>Siguiente</Button>
          </div>
        )}
      </Card>

      {/* Bloque 3 — Muestra de excluidos con motivo */}
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Registros excluidos</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Solo cubre corridas desde el 2026-09-02 — el motivo de corridas anteriores nunca se persistió
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={excludedEntidad}
              onChange={e => { setExcludedEntidad(e.target.value); setExcludedPage(1) }}
              className={selectClass}
            >
              <option value="">Todas las entidades</option>
              {ENTITIES.map(e => <option key={e} value={e}>{ENTITY_LABELS[e]}</option>)}
            </select>
            <select
              value={excludedStatus}
              onChange={e => { setExcludedStatus(e.target.value); setExcludedPage(1) }}
              className={selectClass}
            >
              <option value="">Todos los motivos</option>
              <option value="excluded">Excluido</option>
              <option value="orphan">Sin match (orphan)</option>
              <option value="unmatched">Sin match (unmatched)</option>
              <option value="ambiguous">Ambiguo</option>
              <option value="error">Error</option>
            </select>
          </div>
        </div>
        {excludedLoading ? (
          <p className="text-sm text-slate-400 py-6 text-center">Cargando...</p>
        ) : (excluded?.data.length ?? 0) === 0 ? (
          <div className="py-10 flex flex-col items-center text-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center">
              <IcoCheck size={18} className="text-teal-600 dark:text-teal-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Sin registros excluidos</p>
            <p className="text-xs text-slate-400 max-w-[260px]">
              Ningún registro quedó excluido/sin match en el filtro actual.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">Entidad</th>
                  <th className="px-3 py-2">Referencia</th>
                  <th className="px-3 py-2">Motivo</th>
                  <th className="px-3 py-2">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {excluded?.data.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 text-xs">{ENTITY_LABELS[row.entidad ?? ''] ?? row.entidad ?? '—'}</td>
                    <td className="px-3 py-2 text-xs font-mono">{row.referencia}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <IcoAlertTriangle size={12} className="shrink-0 text-amber-500" />
                      {row.motivo ?? '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{row.created_at ? fmtDate(row.created_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {excluded && excluded.last_page > 1 && (
          <div className="flex items-center justify-between mt-3">
            <Button variant="secondary" disabled={excludedPage <= 1} onClick={() => setExcludedPage(p => p - 1)}>Anterior</Button>
            <span className="text-[12px] text-slate-500">Página {excluded.current_page} de {excluded.last_page}</span>
            <Button variant="secondary" disabled={excludedPage >= excluded.last_page} onClick={() => setExcludedPage(p => p + 1)}>Siguiente</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
