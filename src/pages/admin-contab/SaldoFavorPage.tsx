import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSaldoFavor } from '@/hooks/useAdminContab'
import type { SaldoFavorEstado, SaldoFavorOrigen, SaldoFavorRow, AbonoNivelAsociacion } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { IcoSearch, IcoTrendingUp } from '@/components/icons'
import { formatDateShort } from '@/utils/dates'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'
import { getRegion } from '@/lib/region'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(getRegion().locale, { style: 'currency', currency: getRegion().currency }).format(value)
}

// Igual criterio que `Abono.nivel_asociacion` (calculado del más específico al más general) —
// el backend no manda un campo de nivel separado en cada row, se deriva de qué id viene lleno.
function nivelDe(row: SaldoFavorRow): AbonoNivelAsociacion {
  if (row.invoice_id !== null) return 'factura'
  if (row.sales_project_id !== null) return 'proyecto'
  return 'cliente'
}

const ESTADO_PILL_CLASSES: Record<SaldoFavorEstado, string> = {
  disponible: 'bg-primary-soft text-primary-dark',
  usado_parcialmente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  agotado: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
}

const selectClass = 'rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

/**
 * SCRUM-903 — "Saldo a favor de clientes" (mockup 4N), 100% solo lectura: sin crear, editar,
 * eliminar ni aplicar nada acá (regla dura del ticket, §3.4/Escenario 9) — no agregar ninguna
 * acción por fila aunque parezca útil.
 */
export default function SaldoFavorPage() {
  const { t } = useTranslation('adminContab')

  const [search, setSearch]   = useState('')

  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).

  const searchTerm = useDebouncedSearchTerm(search)
  const [cliente, setCliente] = useState('')
  const [proyecto, setProyecto] = useState('')
  const [factura, setFactura] = useState('')
  const [estado, setEstado]   = useState<SaldoFavorEstado | ''>('')
  const [origen, setOrigen]   = useState<SaldoFavorOrigen | ''>('')
  const [page, setPage]       = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  // SCRUM-947 — cliente/proyecto/factura viajan al backend como filtro de texto "contiene"
  // (antes eran 100% client-side sobre la página completa cargada; con paginación real un
  // filtro que solo mira la página actual deja de tener sentido).
  const { data, isFetching } = useSaldoFavor({
    search: searchTerm || undefined,
    cliente: cliente || undefined,
    proyecto: proyecto || undefined,
    factura: factura || undefined,
    estado: estado || undefined,
    origen: origen || undefined,
    page, per_page: perPage,
  })

  const rows = data?.rows ?? []
  const meta = data?.meta
  const indicadores = data?.indicadores

  // Sugerencias del datalist — solo lo visto en la página actual (mismo trade-off ya aceptado
  // para filtros derivados de `rows` en este batch, ver commit de Notas Crédito); la búsqueda
  // real ahora es server-side vía `cliente`/`proyecto`/`factura` arriba, no depende de esto.
  const clientesVistos  = useMemo(() => Array.from(new Set(rows.map(r => r.cliente))).sort(), [rows])
  const proyectosVistos = useMemo(() => Array.from(new Set(rows.map(r => r.proyecto).filter((p): p is string => p !== null))).sort(), [rows])
  const facturasVistas  = useMemo(() => Array.from(new Set(rows.map(r => r.factura).filter((f): f is string => f !== null))).sort(), [rows])

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-center gap-2 mb-1">
        <IcoTrendingUp size={20} className="text-slate-500 dark:text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('saldoFavor.title')}</h1>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">{t('saldoFavor.subtitle')}</p>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Card variant="panel" className="p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t('saldoFavor.kpiTotal')}</div>
          <div className="text-xl font-bold text-primary-dark">{indicadores ? formatCurrency(indicadores.saldo_disponible_total) : '—'}</div>
          {indicadores && (
            <div className="text-[11px] text-slate-400 mt-1">{t('saldoFavor.kpiTotalNote', { count: indicadores.clientes_con_saldo })}</div>
          )}
          {indicadores?.saldo_aplicable_cliente !== undefined && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1" data-testid="kpi-desglose">
              {t('saldoFavor.kpiDesglose', {
                aplicable: formatCurrency(indicadores.saldo_aplicable_cliente),
                cuenta: formatCurrency(indicadores.saldo_a_cuenta ?? 0),
                reservado: formatCurrency(indicadores.saldo_reservado ?? 0),
              })}
            </div>
          )}
        </Card>
        <Card variant="panel" className="p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t('saldoFavor.kpiClientes')}</div>
          <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{indicadores?.clientes_con_saldo ?? '—'}</div>
        </Card>
      </div>

      <Card variant="panel" className="p-4 mt-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">{t('saldoFavor.panelTitle')}</h2>

        <div className="relative mb-2">
          <IcoSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder={t('saldoFavor.searchPlaceholder')}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input list="sf-clientes" value={cliente} onChange={e => { setCliente(e.target.value); setPage(1) }} placeholder={t('saldoFavor.filtroCliente')} className={`${selectClass} min-w-[180px]`} />
          <datalist id="sf-clientes">{clientesVistos.map(c => <option key={c} value={c} />)}</datalist>

          <input list="sf-proyectos" value={proyecto} onChange={e => { setProyecto(e.target.value); setPage(1) }} placeholder={t('saldoFavor.filtroProyecto')} className={`${selectClass} min-w-[180px]`} />
          <datalist id="sf-proyectos">{proyectosVistos.map(p => <option key={p} value={p} />)}</datalist>

          <input list="sf-facturas" value={factura} onChange={e => { setFactura(e.target.value); setPage(1) }} placeholder={t('saldoFavor.filtroFactura')} className={`${selectClass} min-w-[160px]`} />
          <datalist id="sf-facturas">{facturasVistas.map(f => <option key={f} value={f} />)}</datalist>

          <select value={estado} onChange={e => { setEstado(e.target.value as SaldoFavorEstado | ''); setPage(1) }} className={selectClass}>
            <option value="">{t('saldoFavor.filtroEstadoTodos')}</option>
            <option value="disponible">{t('saldoFavor.estados.disponible')}</option>
            <option value="usado_parcialmente">{t('saldoFavor.estados.usado_parcialmente')}</option>
            <option value="agotado">{t('saldoFavor.estados.agotado')}</option>
          </select>

          <select value={origen} onChange={e => { setOrigen(e.target.value as SaldoFavorOrigen | ''); setPage(1) }} className={selectClass}>
            <option value="">{t('saldoFavor.filtroOrigenTodos')}</option>
            <option value="abono">{t('saldoFavor.origenes.abonos')}</option>
            <option value="devolucion">{t('saldoFavor.origenes.devoluciones')}</option>
            <option value="descuento">{t('saldoFavor.origenes.descuentos')}</option>
            <option value="anulacion">{t('saldoFavor.origenes.anulaciones')}</option>
          </select>
        </div>

        <div className="text-[11px] text-slate-400 mb-2">{t('saldoFavor.resultCount', { count: meta?.total ?? 0 })}</div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 pr-3">{t('saldoFavor.columnas.cliente')}</th>
                <th className="py-2 pr-3">{t('saldoFavor.columnas.asociadoA')}</th>
                <th className="py-2 pr-3">{t('saldoFavor.columnas.origen')}</th>
                <th className="py-2 pr-3">{t('saldoFavor.columnas.fecha')}</th>
                <th className="py-2 pr-3 text-right">{t('saldoFavor.columnas.montoOriginal')}</th>
                <th className="py-2 pr-3 text-right">{t('saldoFavor.columnas.usado')}</th>
                <th className="py-2 pr-3 text-right">{t('saldoFavor.columnas.saldoDisponible')}</th>
                <th className="py-2 pr-3">{t('saldoFavor.columnas.estado')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const nivel = nivelDe(r)
                const key = `${r.origen_tipo}-${r.master_client_id}-${r.referencia}-${r.fecha}`
                return (
                  <tr key={key} className="border-b border-slate-50 dark:border-slate-800">
                    <td className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-slate-100">{r.cliente}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${nivel === 'cliente' ? 'bg-primary-soft text-primary-dark' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                        {t(`abonos.nivel.${nivel}`)}
                      </span>
                      <div className="text-[11px] text-slate-400 mt-0.5">{r.asociado_a}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="font-medium text-slate-700 dark:text-slate-200">{r.origen}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{r.referencia}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDateShort(r.fecha)}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatCurrency(r.monto_original)}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatCurrency(r.monto_usado)}</td>
                    <td className={`py-2.5 pr-3 text-right font-bold whitespace-nowrap ${r.monto_disponible > 0 ? 'text-primary-dark' : 'text-slate-400'}`}>
                      {formatCurrency(r.monto_disponible)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_PILL_CLASSES[r.estado]}`}>
                        {t(`saldoFavor.estados.${r.estado}`)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!isFetching && rows.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">{t('saldoFavor.vacio')}</p>
          )}
        </div>

        {meta && (
          <Pagination
            meta={meta}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
          />
        )}

        <p className="text-[10.5px] text-slate-400 dark:text-slate-500 mt-4 leading-relaxed">{t('saldoFavor.footnote')}</p>
      </Card>
    </div>
  )
}
