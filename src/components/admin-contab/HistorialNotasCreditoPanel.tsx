import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotaCreditoHistorial } from '@/hooks/useAdminContab'
import type { NotaCreditoHistorialEstado, NotaCreditoHistorialRow, NotaCreditoTipo } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { IcoSearch, IcoClose, IcoTruck } from '@/components/icons'
import { formatDateShort } from '@/utils/dates'

const selectClass = 'rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

const TIPOS: NotaCreditoTipo[] = ['descuento_comercial', 'anulacion_completa', 'devolucion_mercancia']
const ESTADOS: NotaCreditoHistorialEstado[] = ['aplicada', 'pendiente_aprobacion', 'pendiente_generar_nota', 'rechazada']

const ESTADO_PILL_CLASSES: Record<NotaCreditoHistorialEstado, string> = {
  aplicada:                'bg-primary-soft text-primary-dark',
  pendiente_aprobacion:    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  pendiente_generar_nota:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  rechazada:                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

// SCRUM-787 — `formatDate()` local eliminado, reemplazado por `formatDateShort()` compartido
// (`@/utils/dates`), que corrige el bug real de "date-only" mostrado un día atrás en Panamá.

interface Props {
  /** Fila real (`id` no-null) — abre el modal de detalle (REQ-493). */
  onSelectNota: (id: number) => void
  /** Fila virtual de la cola de Bodega (`customer_return_id` no-null, REQ-491) — abre el formulario
   *  YA precargado (mismo mecanismo de precarga que Batch 10). */
  onGenerarDesdeDevolucion: (row: NotaCreditoHistorialRow) => void
}

/**
 * Batch 12 del cuerpo principal (SCRUM-569, REQ-492) — "Historial de notas": tabla nueva (no existía
 * ningún `index` antes de este batch, ver ADR-SCRUM565-570) + búsqueda + filtros combinados (AND).
 * Mezcla notas reales con las filas virtuales de la cola de devoluciones confirmadas por Bodega
 * (REQ-491) — distinguibles por color ámbar y sin acción de "ver detalle" (van directo a precarga).
 */
export default function HistorialNotasCreditoPanel({ onSelectNota, onGenerarDesdeDevolucion }: Props) {
  const { t } = useTranslation('adminContab')

  const [search, setSearch]   = useState('')
  const [cliente, setCliente] = useState('')
  const [tipo, setTipo]       = useState<NotaCreditoTipo | ''>('')
  const [estado, setEstado]   = useState<NotaCreditoHistorialEstado | ''>('')

  const { data, isFetching } = useNotaCreditoHistorial({
    search: search || undefined,
    cliente: cliente || undefined,
    tipo: tipo || undefined,
    estado: estado || undefined,
  })

  const rows  = data?.data ?? []
  // Sin paginación del lado del backend — `total` es simplemente el tamaño del resultado ya
  // filtrado (ver docblock de `NotaCreditoHistorialResult`).
  const total = rows.length
  const hasFilters = !!(search || cliente || tipo || estado)
  const clientesOptions = useMemo(() => Array.from(new Set(rows.map(r => r.cliente))).sort(), [rows])

  function clearFilters() {
    setSearch(''); setCliente(''); setTipo(''); setEstado('')
  }

  function handleRowClick(row: NotaCreditoHistorialRow) {
    if (row.id === null) {
      onGenerarDesdeDevolucion(row)
      return
    }
    onSelectNota(row.id)
  }

  return (
    <Card variant="panel" className="p-4 mt-6">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('notasCredito.historial.title')}</h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('notasCredito.historial.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-2 mb-3">
        <div className="relative">
          <IcoSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('notasCredito.historial.searchPlaceholder')}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={cliente} onChange={e => setCliente(e.target.value)} className={selectClass}>
            <option value="">{t('notasCredito.historial.filtroCliente')}</option>
            {clientesOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={tipo} onChange={e => setTipo(e.target.value as NotaCreditoTipo | '')} className={selectClass}>
            <option value="">{t('notasCredito.historial.filtroTipo')}</option>
            {TIPOS.map(tp => <option key={tp} value={tp}>{t(`notasCredito.tipos.${tp}`)}</option>)}
          </select>
          <select value={estado} onChange={e => setEstado(e.target.value as NotaCreditoHistorialEstado | '')} className={selectClass}>
            <option value="">{t('notasCredito.historial.filtroEstado')}</option>
            {ESTADOS.map(es => <option key={es} value={es}>{t(`notasCredito.historial.estados.${es}`)}</option>)}
          </select>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2">
              <IcoClose size={13} />{t('notasCredito.historial.limpiarFiltros')}
            </button>
          )}
        </div>
      </div>

      <div className="text-[11px] text-slate-400 mb-2">
        {t('notasCredito.historial.resultCount', { total })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <th className="py-2 pr-3">{t('notasCredito.historial.columnas.fecha')}</th>
              <th className="py-2 pr-3">{t('notasCredito.historial.columnas.cliente')}</th>
              <th className="py-2 pr-3">{t('notasCredito.historial.columnas.tipo')}</th>
              <th className="py-2 pr-3">{t('notasCredito.historial.columnas.factura')}</th>
              <th className="py-2 pr-3">{t('notasCredito.historial.columnas.monto')}</th>
              <th className="py-2 pr-3">{t('notasCredito.historial.columnas.estado')}</th>
              <th className="py-2 pr-3">{t('notasCredito.historial.columnas.registradoPor')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const esColaBodega = row.id === null
              return (
                <tr
                  key={row.id ?? `cola-${row.customer_return_id}`}
                  onClick={() => handleRowClick(row)}
                  className={`border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${esColaBodega ? 'bg-amber-50/70 dark:bg-amber-900/10' : ''}`}
                >
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDateShort(row.fecha)}</td>
                  <td className="py-2 pr-3 text-slate-800 dark:text-slate-100">{row.cliente}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                    {esColaBodega ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                        <IcoTruck size={12} />{t('notasCredito.historial.filaBodegaLabel')}
                      </span>
                    ) : (
                      row.subtipo_anulacion === 'correccion'
                        ? t('notasCredito.subtiposAnulacion.correccion')
                        : t(`notasCredito.tipos.${row.tipo}`)
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{row.factura_origen_numero ?? '—'}</td>
                  <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {row.monto !== null ? formatCurrency(row.monto) : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_PILL_CLASSES[row.estado]}`}>
                      {t(`notasCredito.historial.estados.${row.estado}`)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{row.registrado_por ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!isFetching && rows.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">{t('notasCredito.historial.vacio')}</p>
        )}
      </div>
    </Card>
  )
}
