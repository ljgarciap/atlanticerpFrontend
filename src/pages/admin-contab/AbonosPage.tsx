import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { useAbonos } from '@/hooks/useAdminContab'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import type { AbonoEstado, PaymentMethod } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { IcoDollarSign, IcoSearch, IcoClose } from '@/components/icons'
import RegistrarAbonoModal from '@/components/admin-contab/RegistrarAbonoModal'
import type { AbonoPrefill } from '@/components/admin-contab/RegistrarAbonoModal'
import { formatDateShort } from '@/utils/dates'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'
import { getRegion } from '@/lib/region'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(getRegion().locale, { style: 'currency', currency: getRegion().currency }).format(value)
}

const ESTADO_PILL_CLASSES: Record<string, string> = {
  confirmado: 'bg-primary-soft text-primary-dark',
  por_confirmar: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
}

/**
 * SCRUM-902 — "Registrar abono" (mockup 4O). Ubicada en el menú Movimientos, después de
 * "Notas crédito y devoluciones". La columna "Asociado a" y `nivel_asociacion` vienen calculados
 * del backend — nunca se recalculan acá (mismo criterio que 903).
 */
export default function AbonosPage() {
  const { t } = useTranslation('adminContab')
  const metodosPago = usePaymentMethods()
  // SCRUM-1128 — "Pasar a Pedido" redirige acá con el proyecto aprobado en `location.state` y abre
  // el formulario de abono nuevo ya precargado.
  const location = useLocation()
  const [prefill, setPrefill] = useState<AbonoPrefill | null>(
    () => (location.state as { abonoPrefill?: AbonoPrefill } | null)?.abonoPrefill ?? null,
  )
  const [modalAbonoId, setModalAbonoId] = useState<number | null | 'new'>(() => (prefill ? 'new' : null))
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  // SCRUM-948 — mismos buscadores/criterios de búsqueda que Historial de cobros
  // (HistorialCobrosPanel.tsx), aplicados sobre esta tabla. `master_client_id` (no un nombre de
  // texto libre) porque el backend de Abonos ya filtra por id — evita colisiones de nombre.
  const [search, setSearch]                 = useState('')
  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).
  const searchTerm = useDebouncedSearchTerm(search)
  const [masterClientId, setMasterClientId] = useState<number | ''>('')
  const [metodoPago, setMetodoPago]         = useState<PaymentMethod | ''>('')
  const [estado, setEstado]                 = useState<AbonoEstado | ''>('')
  const [desde, setDesde]                   = useState('')
  const [hasta, setHasta]                   = useState('')

  const { data, isFetching } = useAbonos({
    search: searchTerm || undefined,
    master_client_id: masterClientId || undefined,
    metodo_pago: metodoPago || undefined,
    estado: estado || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    page, per_page: perPage,
  })
  const abonos = data?.data ?? []
  const meta   = data?.meta
  const hasFilters = !!(search || masterClientId || metodoPago || estado || desde || hasta)
  // Igual que HistorialCobrosPanel: las opciones de Cliente se derivan de las filas ya cargadas
  // (filtradas), no de un catálogo aparte.
  const clientesOptions = useMemo(() => {
    const byId = new Map<number, string>()
    for (const a of abonos) if (!byId.has(a.master_client_id)) byId.set(a.master_client_id, a.cliente)
    return Array.from(byId.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [abonos])

  function clearFilters() {
    setSearch(''); setMasterClientId(''); setMetodoPago(''); setEstado(''); setDesde(''); setHasta(''); setPage(1)
  }

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <IcoDollarSign size={20} className="text-slate-500 dark:text-slate-400" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('abonos.title')}</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">{t('abonos.subtitle')}</p>
        </div>
        <Button onClick={() => setModalAbonoId('new')}>{t('abonos.registrarButton')}</Button>
      </div>

      <Card variant="panel" className="p-4 mt-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">{t('abonos.panelTitle')}</h2>

        <div className="flex flex-col gap-2 mb-3">
          <div className="relative">
            <IcoSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder={t('abonos.buscador.searchPlaceholder')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={masterClientId} onChange={e => { setMasterClientId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
              className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">{t('abonos.buscador.filtroCliente')}</option>
              {clientesOptions.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
            </select>
            <select
              value={metodoPago} onChange={e => { setMetodoPago(e.target.value); setPage(1) }}
              className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">{t('abonos.buscador.filtroMetodo')}</option>
              {metodosPago.methods.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <select
              value={estado} onChange={e => { setEstado(e.target.value as AbonoEstado | ''); setPage(1) }}
              className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">{t('abonos.buscador.filtroEstado')}</option>
              <option value="por_confirmar">{t('abonos.estados.por_confirmar')}</option>
              <option value="confirmado">{t('abonos.estados.confirmado')}</option>
            </select>
            <input
              type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1) }}
              title={t('abonos.buscador.desde')}
              className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <input
              type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1) }}
              title={t('abonos.buscador.hasta')}
              className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {hasFilters && (
              <button
                type="button" onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2"
              >
                <IcoClose size={13} />{t('abonos.buscador.limpiarFiltros')}
              </button>
            )}
          </div>
        </div>

        <div className="text-[11px] text-slate-400 mb-2">
          {t('abonos.buscador.resultCount', { mostrados: abonos.length, total: meta?.total ?? 0 })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 pr-3">{t('abonos.columnas.fecha')}</th>
                <th className="py-2 pr-3">{t('abonos.columnas.clienteMaster')}</th>
                <th className="py-2 pr-3">{t('abonos.columnas.subCliente')}</th>
                <th className="py-2 pr-3">{t('abonos.columnas.proyecto')}</th>
                <th className="py-2 pr-3">{t('abonos.columnas.factura')}</th>
                <th className="py-2 pr-3">{t('abonos.columnas.asociadoA')}</th>
                <th className="py-2 pr-3 text-right">{t('abonos.columnas.monto')}</th>
                <th className="py-2 pr-3">{t('abonos.columnas.metodoPago')}</th>
                <th className="py-2 pr-3">{t('abonos.columnas.estado')}</th>
              </tr>
            </thead>
            <tbody>
              {abonos.map(a => (
                <tr
                  key={a.id}
                  onClick={() => setModalAbonoId(a.id)}
                  className="border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDateShort(a.fecha_registro)}</td>
                  <td className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-slate-100">{a.cliente}</td>
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{a.sub_cliente ?? <span className="text-slate-400">—</span>}</td>
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{a.proyecto ?? <span className="text-slate-400">—</span>}</td>
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{a.factura ?? <span className="text-slate-400">—</span>}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${a.nivel_asociacion === 'cliente' ? 'bg-primary-soft text-primary-dark' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      {t(`abonos.nivel.${a.nivel_asociacion}`)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{formatCurrency(a.monto_original)}</td>
                  <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{t(`cobros.metodos.${a.metodo_pago}`)}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_PILL_CLASSES[a.estado]}`}>
                      {t(`abonos.estados.${a.estado}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isFetching && abonos.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">{t('abonos.vacio')}</p>
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

        <p className="text-[10.5px] text-slate-400 dark:text-slate-500 mt-4 leading-relaxed">{t('abonos.footnote')}</p>
      </Card>

      {modalAbonoId !== null && (
        <RegistrarAbonoModal
          abonoId={modalAbonoId === 'new' ? null : modalAbonoId}
          prefill={modalAbonoId === 'new' ? prefill : null}
          onClose={() => { setModalAbonoId(null); setPrefill(null) }}
          onSaved={() => { setModalAbonoId(null); setPrefill(null) }}
        />
      )}
    </div>
  )
}
