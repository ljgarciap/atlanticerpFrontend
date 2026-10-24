import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { usePermission } from '@/hooks/usePermission'
import type { FiscalDirectoryRow, SubClientDetail } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import EditSubClientTaxDataModal from '@/components/EditSubClientTaxDataModal'
import ExencionItbmsModal from '@/components/admin-contab/ExencionItbmsModal'

/**
 * SCRUM-1002 — punto de entrada de Admin&Cont (Mark, Felix) para validar y editar la razón social, el RUC y el DV de un
 * SubCliente sin pasar por Ventas & Diseño (sus homes y su sidebar no incluyen la pantalla Clientes). Reusa el mismo
 * modal que el detalle del cliente. La lista marca los clientes ya "bloqueados" (con facturas o notas de crédito
 * certificadas/pendientes): el backend rechazaría su edición con 409, así que el botón se deshabilita con la razón.
 */
export default function ClientesFiscalPage() {
  const { t } = useTranslation(['common', 'adminContab', 'ventasDiseno'])
  // SCRUM-1182 — los hooks se llaman SIEMPRE, todos, y se combinan después (`a || b` no ejecuta el segundo hook y cambia el número de hooks entre renders).
  const hasEditClientTaxData = usePermission('ventas_diseno.edit.client_tax_data')
  const hasVentasDisenoEdit  = usePermission('ventas_diseno.edit')
  const canEdit = hasEditClientTaxData || hasVentasDisenoEdit
  // SCRUM-1166 — marcar clientes exentos de ITBMS es un permiso angosto propio (Mark, Felix y Yaneth): quien solo tiene este entra a ver el listado.
  const canExempt = usePermission('admin_contab.edit.client_itbms_exemption')

  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  const [editando, setEditando] = useState<FiscalDirectoryRow | null>(null)
  const [exentando, setExentando] = useState<FiscalDirectoryRow | null>(null)

  // Debounce: no se consulta en cada tecla.
  useEffect(() => {
    const id = setTimeout(() => { setBusquedaAplicada(busqueda.trim()); setPage(1) }, 350)
    return () => clearTimeout(id)
  }, [busqueda])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ventas-diseno-fiscal-directory', busquedaAplicada, page, perPage],
    queryFn: () => ventasDisenoApi.clients.fiscalDirectory({
      search: busquedaAplicada || undefined, page, per_page: perPage === 'all' ? 100 : perPage,
    }),
    enabled: canEdit || canExempt,
  })

  const k = 'adminContab:clientesFiscal'

  if (!canEdit && !canExempt) {
    return (
      <Card className="max-w-xl mx-auto mt-10 p-6 text-center">
        <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('adminContab:fiscal.restricted.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t(`${k}.sinPermiso`)}</p>
      </Card>
    )
  }

  // El modal recibe la forma de un SubCliente de Ventas & Diseño; acá solo se conocen los datos fiscales.
  const comoSubCliente = (f: FiscalDirectoryRow): SubClientDetail => ({
    id: f.id, master_client_id: f.master_client_id, business_name: f.business_name, receptor_tipo: f.receptor_tipo, tax_id: f.tax_id, tax_id_dv: f.tax_id_dv,
    delivery_address: null, category: null, contacts: [],
    itbms_exento: f.itbms_exento, itbms_exencion_documento: f.itbms_exencion_documento,
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t(`${k}.title`)}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t(`${k}.subtitle`)}</p>
      </div>

      <input
        type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
        placeholder={t(`${k}.buscar`)} aria-label={t(`${k}.buscar`)}
        className="w-full max-w-md rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#5BA5A0] focus:outline-none"
      />

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-700">
              <th className="px-3 py-2">{t(`${k}.columnas.razonSocial`)}</th>
              <th className="px-3 py-2">{t(`${k}.columnas.cliente`)}</th>
              <th className="px-3 py-2">{t(`${k}.columnas.ruc`)}</th>
              <th className="px-3 py-2">{t(`${k}.columnas.dv`)}</th>
              <th className="px-3 py-2">{t(`${k}.columnas.itbms`)}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-3 py-4 text-slate-400">{t('common:labels.loading')}</td></tr>}
            {isError && <tr><td colSpan={6} className="px-3 py-4 text-red-600">{t(`${k}.error`)}</td></tr>}
            {data?.data.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-slate-400">{t(`${k}.vacio`)}</td></tr>}
            {data?.data.map(f => (
              <tr key={f.id} className="border-b border-slate-50 dark:border-slate-800">
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{f.business_name}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{f.master_client_name}</td>
                <td className="px-3 py-2">{f.receptor_tipo === '02' ? t('ventasDiseno:clients.receptorTipo.consumidorFinal') : f.tax_id}</td>
                <td className="px-3 py-2">{f.receptor_tipo === '02' ? '—' : (f.tax_id_dv ?? '—')}</td>
                <td className="px-3 py-2">
                  {f.itbms_exento ? (
                    <span data-testid={`chip-exento-${f.id}`} title={f.itbms_exencion_documento ?? undefined}
                      className="inline-flex items-center rounded-full bg-primary-soft text-primary-dark px-2 py-0.5 text-[11px] font-medium">
                      {t(`${k}.exento`)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">{t(`${k}.noExento`)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {canExempt && (
                      <Button variant="secondary" onClick={() => setExentando(f)} data-testid={`exencion-${f.id}`}>
                        {f.itbms_exento ? t(`${k}.exencion.quitarAccion`) : t(`${k}.exencion.marcarAccion`)}
                      </Button>
                    )}
                    {canEdit && (f.bloqueado ? (
                      <span className="text-[11px] text-slate-400 self-center" title={t(`${k}.bloqueadoAyuda`)}>{t(`${k}.bloqueado`)}</span>
                    ) : (
                      <Button variant="secondary" onClick={() => setEditando(f)}>{t(`${k}.editar`)}</Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data && data.meta.total > 0 && (
        <Pagination meta={data.meta} perPage={perPage} onPageChange={setPage} onPerPageChange={p => { setPerPage(p); setPage(1) }} />
      )}

      {editando && <EditSubClientTaxDataModal subClient={comoSubCliente(editando)} onClose={() => setEditando(null)} />}
      {exentando && <ExencionItbmsModal cliente={exentando} onClose={() => setExentando(null)} />}
    </div>
  )
}
