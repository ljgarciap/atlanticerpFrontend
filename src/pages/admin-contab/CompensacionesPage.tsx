import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompensacionClientes } from '@/hooks/useAdminContab'
import type { CompensacionClienteRow } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { IcoSearch, IcoTrendingUp } from '@/components/icons'
import CompensacionClienteModal from '@/components/admin-contab/CompensacionClienteModal'
import { formatDateShort } from '@/utils/dates'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'
import { getRegion } from '@/lib/region'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(getRegion().locale, { style: 'currency', currency: getRegion().currency }).format(value)
}

const selectClass = 'rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

const NETO_CLASS: Record<CompensacionClienteRow['signo'], string> = {
  positivo: 'text-primary-dark',
  negativo: 'text-red-600 dark:text-red-400',
  cero: 'text-slate-400',
}

/**
 * SCRUM-1168 F3 — Compensaciones: vista aparte, por CLIENTE (no por proyecto: hay más menudeo que proyectos), de quienes tienen saldo a favor o
 * movimiento reciente. Positivo = tiene más a favor que lo que debe; negativo = debe más. Desde cada cliente se decide a qué facturas aplicar su
 * dinero disponible.
 */
export default function CompensacionesPage() {
  const { t } = useTranslation('adminContab')

  const [search, setSearch]   = useState('')

  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).

  const searchTerm = useDebouncedSearchTerm(search)
  const [signo, setSigno]     = useState<'positivo' | 'negativo' | ''>('')
  const [page, setPage]       = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  const [clienteId, setClienteId] = useState<number | null>(null)

  const { data, isFetching } = useCompensacionClientes({ search: searchTerm || undefined, signo: signo || undefined, page, per_page: perPage })

  const rows = data?.rows ?? []
  const meta = data?.meta
  const indicadores = data?.indicadores

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-center gap-2 mb-1">
        <IcoTrendingUp size={20} className="text-slate-500 dark:text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('compensaciones.title')}</h1>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">{t('compensaciones.subtitle')}</p>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <Card variant="panel" className="p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t('compensaciones.kpiTotal')}</div>
          <div className="text-xl font-bold text-primary-dark">{indicadores ? formatCurrency(indicadores.saldo_a_favor_total) : '—'}</div>
        </Card>
        <Card variant="panel" className="p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t('compensaciones.kpiClientes')}</div>
          <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{indicadores?.clientes_con_saldo ?? '—'}</div>
        </Card>
      </div>

      <Card variant="panel" className="p-4 mt-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-[220px]">
            <IcoSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder={t('compensaciones.searchPlaceholder')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <select value={signo} onChange={e => { setSigno(e.target.value as 'positivo' | 'negativo' | ''); setPage(1) }} className={selectClass} aria-label={t('compensaciones.filtroSigno')}>
            <option value="">{t('compensaciones.signoTodos')}</option>
            <option value="positivo">{t('compensaciones.signoPositivo')}</option>
            <option value="negativo">{t('compensaciones.signoNegativo')}</option>
          </select>
        </div>

        <div className="text-[11px] text-slate-400 mb-2">{t('compensaciones.resultCount', { count: meta?.total ?? 0 })}</div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 pr-3">{t('compensaciones.columnas.cliente')}</th>
                <th className="py-2 pr-3 text-right">{t('compensaciones.columnas.aFavor')}</th>
                <th className="py-2 pr-3 text-right">{t('compensaciones.columnas.pendiente')}</th>
                <th className="py-2 pr-3 text-right">{t('compensaciones.columnas.neto')}</th>
                <th className="py-2 pr-3 text-right">{t('compensaciones.columnas.facturas')}</th>
                <th className="py-2 pr-3">{t('compensaciones.columnas.ultimoMovimiento')}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.master_client_id} className="border-b border-slate-50 dark:border-slate-800" data-testid={`comp-cliente-${r.master_client_id}`}>
                  <td className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-slate-100">{r.cliente}</td>
                  <td className="py-2.5 pr-3 text-right font-bold text-primary-dark whitespace-nowrap">{formatCurrency(r.saldo_a_favor)}</td>
                  <td className="py-2.5 pr-3 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatCurrency(r.pendiente)}</td>
                  <td className={`py-2.5 pr-3 text-right font-bold whitespace-nowrap ${NETO_CLASS[r.signo]}`}>{formatCurrency(r.neto)}</td>
                  <td className="py-2.5 pr-3 text-right text-slate-600 dark:text-slate-300">{r.facturas_pendientes}</td>
                  <td className="py-2.5 pr-3 text-slate-500 whitespace-nowrap">{r.ultimo_movimiento ? formatDateShort(r.ultimo_movimiento) : '—'}</td>
                  <td className="py-2.5 text-right"><Button variant="secondary" onClick={() => setClienteId(r.master_client_id)}>{t('compensaciones.compensar')}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isFetching && rows.length === 0 && <p className="text-sm text-slate-400 text-center py-8">{t('compensaciones.vacio')}</p>}
        </div>

        {meta && <Pagination meta={meta} perPage={perPage} onPageChange={setPage} onPerPageChange={pp => { setPerPage(pp); setPage(1) }} />}
      </Card>

      {clienteId !== null && <CompensacionClienteModal masterClientId={clienteId} onClose={() => setClienteId(null)} />}
    </div>
  )
}
