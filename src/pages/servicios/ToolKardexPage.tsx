import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import type { ToolKardexTipo } from '@/types/servicios'

const TIPOS: ToolKardexTipo[] = ['ingreso', 'damaged', 'worn', 'lost']

// REQ-276 — chip de color propio por tipo, mismo esquema de 4 colores ya usados en el resto de la
// app (amber/emerald/red/slate, ver InsumoTable.tsx) — 'ingreso' es el único movimiento positivo
// (verde), los otros 3 replican el criterio de severidad de ToolEstado (damaged > worn ≈ lost, sin
// 2 tonos idénticos para no confundirlos entre sí).
const TIPO_COLORS: Record<ToolKardexTipo, string> = {
  ingreso: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  damaged: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  worn:    'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  lost:    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
}

function TipoChip({ tipo }: { tipo: ToolKardexTipo }) {
  const { t } = useTranslation('servicios')
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${TIPO_COLORS[tipo]}`}>
      {t(`toolKardex.tipos.${tipo}`)}
    </span>
  )
}

// REQ-276 — Kardex de movimientos de herramientas. Solo lectura, sin acciones de edición/borrado.
// Vista de apoyo, se abre en una pestaña nueva desde ToolsAndSuppliesPage vía window.open(), bajo
// FocusedViewShell (SCRUM-359 — sin el menú de navegación general, ver App.tsx). Gate de acceso a
// nivel de ruta (App.tsx, RequireRole) — Aaron/Gerencia/superadmin únicamente.
//
// SCRUM-779 (rebote Daniela 2026-08-20 + decisión de Luis 2026-08-23) — columnas Cantidad/Saldo
// inicial/Saldo resultante agregadas: ver docblock de `ToolKardexEntry` en types/servicios.ts para
// la definición real de "saldo" para una herramienta serializada (unidades en Buen estado por
// nombre) y su limitación conocida.
export default function ToolKardexPage() {
  const { t } = useTranslation('servicios')

  const [toolId, setToolId] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [tipo, setTipo]     = useState<ToolKardexTipo | ''>('')

  // Selects poblados con los mismos listados ya usados en el resto del módulo — herramientas
  // (ToolsPanel.tsx) y técnicos internos (InternalTechniciansPage.tsx) — en vez de los inputs de
  // texto libre que traía la primera versión (los filtros reales son numéricos: tool_id/user_id).
  const { data: tools = [] } = useQuery({
    queryKey: ['servicios-tools-for-kardex-filter'],
    queryFn:  () => serviciosApi.tools.list(),
  })
  const { data: technicians = [] } = useQuery({
    queryKey: ['servicios-internal-technicians-for-kardex-filter'],
    queryFn:  () => serviciosApi.internalTechnicians.list(),
  })

  const { data: entries = [], isFetching } = useQuery({
    queryKey: ['servicios-tool-kardex', toolId, userId, tipo],
    queryFn:  () => serviciosApi.toolMovements.list({
      tool_id: toolId ? Number(toolId) : undefined,
      user_id: userId ? Number(userId) : undefined,
      tipo:    tipo || undefined,
    }),
  })

  const clearFilters = () => { setToolId(''); setUserId(''); setTipo('') }
  const hasActiveFilters = toolId !== '' || userId !== '' || tipo !== ''

  return (
    <div>
      {/* RN1 (SCRUM-359) — sin menú de navegación general en esta vista de apoyo, solo un botón
          para cerrar. Se abre en pestaña nueva vía window.open() (ver docblock arriba), así que
          "cerrar" es la acción correcta, no "volver" (no hay historial propio detrás). */}
      <button
        type="button"
        onClick={() => window.close()}
        className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4"
      >
        <IcoClose size={14} />
        {t('toolKardex.close')}
      </button>

      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('toolKardex.title')}</h1>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('toolKardex.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          aria-label={t('toolKardex.filters.herramienta')}
          value={toolId}
          onChange={e => setToolId(e.target.value)}
          className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">{t('toolKardex.filters.allHerramientas')}</option>
          {tools.map(tool => (
            <option key={tool.id} value={tool.id}>{tool.nombre} ({tool.codigo_unico})</option>
          ))}
        </select>

        <select
          aria-label={t('toolKardex.filters.responsable')}
          value={userId}
          onChange={e => setUserId(e.target.value)}
          className="px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">{t('toolKardex.filters.allResponsables')}</option>
          {technicians.map(tech => (
            <option key={tech.id} value={tech.id}>{tech.nombre}</option>
          ))}
        </select>

        <Button
          variant="outline" active={tipo === ''} activeVariant="primary"
          className="!text-xs !px-3 !py-1.5"
          onClick={() => setTipo('')}
        >
          {t('toolKardex.filters.allTipos')}
        </Button>
        {TIPOS.map(tp => (
          <Button
            key={tp}
            variant="outline" active={tipo === tp} activeVariant="primary"
            className="!text-xs !px-3 !py-1.5"
            onClick={() => setTipo(tp)}
          >
            {t(`toolKardex.tipos.${tp}`)}
          </Button>
        ))}

        {hasActiveFilters && (
          <Button variant="outline" onClick={clearFilters}>{t('toolKardex.filters.clear')}</Button>
        )}
      </div>

      <Card variant="panel" className="overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700">
              <Th>{t('toolKardex.table.fecha')}</Th>
              <Th>{t('toolKardex.table.herramienta')}</Th>
              <Th>{t('toolKardex.table.codigo')}</Th>
              <Th>{t('toolKardex.table.tipo')}</Th>
              <Th>{t('toolKardex.table.cantidad')}</Th>
              <Th>{t('toolKardex.table.detalle')}</Th>
              <Th>{t('toolKardex.table.realizadoPor')}</Th>
              <Th>{t('toolKardex.table.saldoInicial')}</Th>
              <Th>{t('toolKardex.table.saldoResultante')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {entries.length === 0 && !isFetching && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('toolKardex.empty')}
                </td>
              </tr>
            )}
            {entries.map(entry => (
              <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-slate-800 dark:text-slate-100 font-semibold">{entry.tool_nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {entry.tool_codigo_unico}
                </td>
                <td className="px-4 py-3"><TipoChip tipo={entry.tipo} /></td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-right">{entry.cantidad}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{entry.detalle ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{entry.user_nombre ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-right">{entry.saldo_inicial}</td>
                <td className="px-4 py-3 text-slate-800 dark:text-slate-100 font-semibold text-right">{entry.saldo_resultante}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
      {children}
    </th>
  )
}
