import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import ArchitectDetailModal from '@/components/ArchitectDetailModal'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'

// SCRUM-907 — pantalla "Arquitectos" del menú CRM: directorio global de solo consulta/edición
// limitada de los arquitectos que ya alimentan Comisiones Externas (misma BD, ver
// App\Modules\VentasDiseno\Models\Architect). Lista chica (no necesita paginación de backend,
// a diferencia de Clientes) — todos los arquitectos ordenados por nombre en una sola página.
export default function ArchitectsPage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const [search, setSearch] = useState('')
  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).
  const searchTerm = useDebouncedSearchTerm(search)
  const [openArchitectId, setOpenArchitectId] = useState<number | null>(null)

  const { data: architects, isLoading } = useQuery({
    queryKey: ['ventas-diseno-architects', searchTerm],
    queryFn:  () => ventasDisenoApi.architects.listAll(searchTerm),
  })

  const rows = architects ?? []
  const inputClass = 'border border-slate-200 rounded-lg px-3 py-2 md:py-1.5 text-base md:text-[13px] w-full sm:min-w-[220px] sm:flex-1 focus:outline-none focus:border-[#5BA5A0]'

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:architects.title')}
          </h1>
          {!isLoading && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              {t('ventasDiseno:architects.subtitle', { count: rows.length })}
            </p>
          )}
        </div>
      </div>

      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder={t('common:labels.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={inputClass}
        />
      </Card>

      <Card variant="panel" className="overflow-x-auto">
        {isLoading ? (
          <p className="text-slate-400 text-sm p-4">{t('common:labels.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-slate-400 text-sm p-4">{t('ventasDiseno:architects.table.empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 px-3">{t('ventasDiseno:architects.table.name')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:architects.table.phone')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:architects.table.email')}</th>
                <th className="py-2 px-3">{t('ventasDiseno:architects.table.view')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr
                  key={a.id}
                  onClick={() => setOpenArchitectId(a.id)}
                  className="cursor-pointer border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                  <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">{a.name}</td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-200">{a.phone ?? '—'}</td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-200">{a.email ?? '—'}</td>
                  <td className="py-2 px-3">
                    <Button variant="secondary" onClick={e => { e.stopPropagation(); setOpenArchitectId(a.id) }}>
                      {t('ventasDiseno:architects.table.view')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {openArchitectId !== null && (
        <ArchitectDetailModal architectId={openArchitectId} onClose={() => setOpenArchitectId(null)} />
      )}
    </>
  )
}
