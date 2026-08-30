import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useKardex } from '@/hooks/useBodega'
import { useWarehousesList } from '@/hooks/useBodega'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import type { KardexTipo } from '@/types/bodega'

const TIPOS: KardexTipo[] = ['Entrada', 'Salida', 'Ajuste', 'Reubicación', 'Devolución']

/** SCRUM-467→472 (REQ-397→402) — pantalla "Movimientos de inventario" (Kardex). Solo lectura. */
export default function KardexPage() {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: warehousesData } = useWarehousesList()
  const warehouses = warehousesData?.data ?? []

  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [tipo, setTipo] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data, isFetching } = useKardex({
    search: query || undefined,
    tipo: tipo || undefined,
    warehouse_id: warehouseId ? Number(warehouseId) : undefined,
    page, per_page: perPage,
  })

  const clearFilters = () => {
    setSearch(''); setQuery(''); setTipo(''); setWarehouseId(''); setPage(1)
  }

  const rows = data?.data ?? []

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('bodega:kardex.title')}</h1>
        <p className="text-[12px] text-slate-500">{t('bodega:kardex.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (setQuery(search), setPage(1))}
          placeholder={t('bodega:kardex.filters.search')}
          className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <select
          value={tipo}
          onChange={e => { setTipo(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="">{t('bodega:kardex.filters.type')}</option>
          {TIPOS.map(tp => <option key={tp} value={tp}>{tp}</option>)}
        </select>
        <select
          value={warehouseId}
          onChange={e => { setWarehouseId(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="">{t('bodega:kardex.filters.warehouse')}</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <Button variant="outline" onClick={clearFilters}>{t('bodega:kardex.filters.clear')}</Button>
      </div>

      <Card variant="panel" className="overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <Th>{t('bodega:kardex.table.date')}</Th>
              <Th>{t('bodega:kardex.table.product')}</Th>
              <Th>{t('bodega:kardex.table.warehouse')}</Th>
              <Th>{t('bodega:kardex.table.type')}</Th>
              <Th>{t('bodega:kardex.table.quantity')}</Th>
              <Th>{t('bodega:kardex.table.reference')}</Th>
              <Th>{t('bodega:kardex.table.doneBy')}</Th>
              <Th>{t('bodega:kardex.table.initialBalance')}</Th>
              <Th>{t('bodega:kardex.table.finalBalance')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('bodega:kardex.empty')}
                </td>
              </tr>
            )}
            {rows.map(m => (
              <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(m.fecha).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-800 font-semibold">{m.producto.reference}</td>
                <td className="px-4 py-3 text-slate-600">{m.bodega}</td>
                <td className="px-4 py-3 text-slate-600">{m.tipo}</td>
                <td className={`px-4 py-3 font-semibold ${m.cantidad >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {m.cantidad >= 0 ? `+${m.cantidad}` : m.cantidad}
                </td>
                <td className="px-4 py-3 text-slate-600">{m.referencia}</td>
                <td className="px-4 py-3 text-slate-600">{m.realizado_por}</td>
                <td className="px-4 py-3 text-slate-600">{m.saldo_inicial}</td>
                <td className="px-4 py-3 text-slate-600">{m.saldo_resultante}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data?.meta && (
        <Pagination
          meta={data.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
        />
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  )
}
