import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { formatMoney } from '@/lib/money'
import { formatDateFromTimestamp } from '@/utils/dates'
import { downloadCotizaYaPdf } from './cotizaYaPdf'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'

/**
 * SCRUM-1120 — CotizaYA: cotizaciones de venta chica, guardadas solo aquí (nunca en Cotizaciones ni en Pipeline).
 * Tabla con ID (folio), nombre del cliente, ver detalle y descargar el PDF; el botón superior derecho abre el formulario.
 */
export default function VentasDisenoCotizaYaPage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()

  const [search, setSearch] = useState('')

  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).

  const searchTerm = useDebouncedSearchTerm(search)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null)
  const [pdfError, setPdfError] = useState(false)

  const { data: result, isLoading } = useQuery({
    queryKey: ['ventas-diseno-cotizaya-list', searchTerm, page, perPage],
    queryFn:  () => ventasDisenoApi.cotizaya.list({ search: searchTerm || undefined, page, per_page: perPage }),
  })

  const rows = result?.data ?? []

  async function handlePdf(id: number, folio: string) {
    setPdfBusyId(id)
    setPdfError(false)
    try {
      await downloadCotizaYaPdf(id, folio)
    } catch {
      setPdfError(true)
    } finally {
      setPdfBusyId(null)
    }
  }

  return (
    <>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('ventasDiseno:cotizaya.title')}</h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">{t('ventasDiseno:cotizaya.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/ventas-diseno/cotizaya/nueva')}>
          {t('ventasDiseno:cotizaya.button')}
        </Button>
      </div>

      <Card variant="panel" className="p-3 mb-3">
        <input
          type="text" placeholder={t('ventasDiseno:cotizaya.searchPlaceholder')}
          value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-[#5BA5A0]"
        />
      </Card>

      {pdfError && (
        <div role="alert" data-testid="cotizaya-pdf-error" className="mb-3 px-3 py-2 rounded-lg border text-[12.5px] bg-red-50 border-red-200 text-red-700">
          {t('ventasDiseno:cotizaya.pdfError')}
        </div>
      )}

      <Card variant="panel" className="p-0 overflow-hidden">
        {isLoading ? (
          <p className="text-slate-400 text-sm p-4">{t('common:loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400 text-sm p-4">{t('ventasDiseno:cotizaya.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-2">{t('ventasDiseno:cotizaya.table.id')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:cotizaya.table.customer')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:cotizaya.table.phone')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:cotizaya.table.description')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:cotizaya.table.designer')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:cotizaya.table.date')}</th>
                  <th className="px-3 py-2 text-right">{t('ventasDiseno:cotizaya.table.total')}</th>
                  <th className="px-3 py-2">{t('ventasDiseno:cotizaya.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{row.folio}</td>
                    <td className="px-3 py-2">{row.customer_name || 'CotizaYA'}</td>
                    <td className="px-3 py-2">{row.customer_phone || '—'}</td>
                    <td className="px-3 py-2">{row.description || '—'}</td>
                    <td className="px-3 py-2">{row.owner.name}</td>
                    <td className="px-3 py-2">{row.generated_at ? formatDateFromTimestamp(row.generated_at) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold">${formatMoney(row.grand_total)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => navigate(`/ventas-diseno/cotizaya/${row.id}`)}
                          className="text-[11.5px] font-semibold text-[#3D7E7A] bg-[#E3F0EE] dark:bg-slate-900 dark:text-[#5BA5A0] rounded-lg px-3 py-1.5"
                        >
                          {t('ventasDiseno:cotizaya.table.viewDetail')}
                        </button>
                        <button
                          onClick={() => handlePdf(row.id, row.folio)}
                          disabled={pdfBusyId === row.id}
                          className="text-[11.5px] font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300 rounded-lg px-3 py-1.5 disabled:opacity-50"
                        >
                          {t('ventasDiseno:cotizaya.table.downloadPdf')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {result?.meta && (
        <Pagination
          meta={result.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={p => { setPerPage(p); setPage(1) }}
        />
      )}
    </>
  )
}
