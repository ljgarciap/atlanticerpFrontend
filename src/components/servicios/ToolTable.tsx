import { useTranslation } from 'react-i18next'
import { TOOL_ESTADOS } from '@/types/servicios'
import type { Tool, ToolPurchaseRequest, InternalTechnician } from '@/types/servicios'
import ToolEstadoSelect from './ToolEstadoSelect'
import ToolAssignmentSelect from './ToolAssignmentSelect'
import ToolReceiveButton from './ToolReceiveButton'
import { Button } from '@/components/ui/Button'

interface Props {
  tools:               Tool[]
  // GET /servicios/tools/purchase-requests devuelve TODAS las solicitudes (pendientes y ya
  // recibidas) — este componente filtra las relevantes para REQ-271 acá mismo (ver groupTools).
  purchaseRequests:    ToolPurchaseRequest[]
  technicians:         InternalTechnician[]
  canEdit:             boolean
  onChanged:           () => void
  onRequestReplenish:  (tool: Tool) => void
}

interface ToolGroup {
  nombre:               string
  units:                Tool[]
  // REQ-271 — solicitudes de herramienta NUEVA (source_tool_id null, todavía sin recibir) sin
  // ninguna unidad real todavía, agrupadas por nombre. Las de reposición (source_tool_id no
  // null) viajan embebidas en la unidad vía Tool.pending_replacement_request, nunca duplicadas acá.
  newPendingRequests:   ToolPurchaseRequest[]
}

function groupTools(tools: Tool[], purchaseRequests: ToolPurchaseRequest[]): ToolGroup[] {
  const byName = new Map<string, ToolGroup>()

  function ensure(nombre: string): ToolGroup {
    let group = byName.get(nombre)
    if (!group) {
      group = { nombre, units: [], newPendingRequests: [] }
      byName.set(nombre, group)
    }
    return group
  }

  for (const tool of tools) ensure(tool.nombre).units.push(tool)
  for (const request of purchaseRequests) {
    if (request.estado !== 'solicitado' || request.source_tool_id !== null) continue
    ensure(request.nombre).newPendingRequests.push(request)
  }

  return [...byName.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

// CRÍTICO Pre-QA 2026-08-13 (REQ-270) — `assigned_since` viaja como fecha pura "YYYY-MM-DD"
// (Tool::assigned_since->toDateString()), sin hora/zona. `new Date('2026-08-13')` la interpreta
// como medianoche UTC; en cualquier zona horaria negativa (ej. America/Panama, UTC-5 — la zona
// real de producción), `.toLocaleDateString()` la muestra un día ANTES del valor real ("Desde"
// mostraba ayer en vez de hoy tras reasignar, reproducido en vivo). Se arma la fecha a partir de
// sus componentes en vez de parsear el string ISO, para que quede anclada a la zona local.
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString()
}

// REQ-268 RN1 — resumen "5 unidad(es) (4 buen estado, 1 desgaste)".
function estadoSummary(units: Tool[], t: (key: string) => string): string {
  const counts = new Map<string, number>()
  for (const unit of units) counts.set(unit.estado, (counts.get(unit.estado) ?? 0) + 1)
  return TOOL_ESTADOS
    .filter(estado => (counts.get(estado) ?? 0) > 0)
    .map(estado => `${counts.get(estado)} ${t(`tools.estados.${estado}`).toLowerCase()}`)
    .join(', ')
}

// REQ-268→272 — tabla agrupada por nombre. Cada grupo muestra el encabezado (RN1) y, debajo,
// cada unidad individual (RN2) — incluidas las filas "pendiente de recibir" de solicitudes de
// herramienta nueva sin ninguna unidad real todavía (REQ-271 Escenario).
export default function ToolTable({ tools, purchaseRequests, technicians, canEdit, onChanged, onRequestReplenish }: Props) {
  const { t } = useTranslation('servicios')

  const groups = groupTools(tools, purchaseRequests)

  if (groups.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
        <p className="text-slate-400 text-sm">{t('tools.table.empty')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map(group => (
        <div
          key={group.nombre}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
        >
          <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{group.nombre}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {group.units.length > 0
                ? t('tools.table.groupHeader', { count: group.units.length, summary: estadoSummary(group.units, t) })
                : t('tools.table.groupHeaderEmpty')}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              {group.units.length > 0 && (
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-3 py-2">{t('tools.table.columns.codigo')}</th>
                    <th className="px-3 py-2">{t('tools.table.columns.assignedTo')}</th>
                    <th className="px-3 py-2">{t('tools.table.columns.estado')}</th>
                    <th className="px-3 py-2">{t('tools.table.columns.desde')}</th>
                    <th className="px-3 py-2 text-right">{t('tools.table.columns.actions')}</th>
                  </tr>
                </thead>
              )}
              <tbody>
                {group.units.map(unit => (
                  <tr key={unit.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {unit.codigo_unico}
                    </td>
                    <td className="px-3 py-2.5">
                      <ToolAssignmentSelect tool={unit} technicians={technicians} canEdit={canEdit} onChanged={onChanged} />
                    </td>
                    <td className="px-3 py-2.5">
                      <ToolEstadoSelect tool={unit} canEdit={canEdit} onChanged={onChanged} />
                      {/* REQ-269 — el backend resuelve el responsable server-side; el frontend
                          solo lo muestra, nunca lo pide. */}
                      {unit.responsable_incidente && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          {t('tools.table.responsableIncidente', { nombre: unit.responsable_incidente })}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      {formatDate(unit.assigned_since)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {unit.pending_replacement_request ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-[11px] px-2 py-1 rounded-full font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
                            {t('tools.table.pendingBadge', { cantidad: unit.pending_replacement_request.cantidad })}
                          </span>
                          {canEdit && (
                            <ToolReceiveButton requestId={unit.pending_replacement_request.id} onReceived={onChanged} />
                          )}
                        </div>
                      ) : canEdit ? (
                        <Button
                          variant="secondary"
                          className="!px-2.5 !py-1 !text-xs"
                          onClick={() => onRequestReplenish(unit)}
                        >
                          {t('tools.table.requestButton')}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}

                {group.newPendingRequests.map(request => (
                  <tr key={`pending-${request.id}`} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2.5 text-slate-400 text-xs" colSpan={3}>—</td>
                    <td className="px-3 py-2.5 text-right" colSpan={2}>
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-[11px] px-2 py-1 rounded-full font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
                          {t('tools.table.pendingBadge', { cantidad: request.cantidad })}
                        </span>
                        {canEdit && (
                          <ToolReceiveButton requestId={request.id} onReceived={onChanged} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
