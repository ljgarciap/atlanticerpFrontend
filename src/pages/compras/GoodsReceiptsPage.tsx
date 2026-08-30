import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGoodsReceipts, useGoodsReceipt } from '@/hooks/useCompras'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { IcoClose } from '@/components/icons'
import { usePermission } from '@/hooks/usePermission'

/**
 * REQ-159 (SCRUM-222) — "Ver registros de ingreso". Movida acá desde Ingreso de Mercancía por
 * decisión explícita del cliente (ver RN del ticket) — la edición real sigue viviendo en
 * GoodsReceiptWizardPage (REQ-167), esta pantalla solo lista/consulta y navega para corregir.
 */
export default function GoodsReceiptsPage() {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data: receipts } = useGoodsReceipts(search, page, perPage)
  const { data: detail } = useGoodsReceipt(selectedId)
  // SCRUM-773 (CA5) — "+ Nuevo ingreso" no tenía ningún check propio, quedaba visible/clickeable
  // para Líder de Operaciones (compras.limited.view); la ruta real (POST /compras/goods-receipts)
  // ya exige compras.edit, esto solo alinea la UI con lo que el backend ya bloquea.
  const canCreate = usePermission('compras.edit')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-slate-900">{t('compras:goodsReceipts.title')}</h1>
        {canCreate && (
          <Button onClick={() => navigate('/compras/ingresos/nuevo')}>
            {t('compras:goodsReceipts.actions.new')}
          </Button>
        )}
      </div>

      <input
        type="text"
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1) }}
        placeholder={t('compras:goodsReceipts.searchPlaceholder')}
        className="w-full max-w-md mb-4 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />

      <Card variant="panel" className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:goodsReceipts.table.date')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:goodsReceipts.table.provider')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:goodsReceipts.table.order')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:goodsReceipts.table.lines')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:goodsReceipts.table.units')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('compras:goodsReceipts.table.orderStatus')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(receipts?.data ?? []).map(r => (
              <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedId(r.id)}>
                <td className="px-4 py-3 text-slate-600">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-slate-600">{r.provider_name}</td>
                <td className="px-4 py-3 text-slate-600">#{r.purchase_order_id}</td>
                <td className="px-4 py-3 text-slate-600">{r.lines_count}</td>
                <td className="px-4 py-3 text-slate-600">{r.total_units}</td>
                <td className="px-4 py-3 text-slate-600">{t(`compras:orders.status.${r.order_status}`)}</td>
              </tr>
            ))}
            {receipts && receipts.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('compras:goodsReceipts.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {receipts?.meta && (
        <Pagination
          meta={receipts.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={p => { setPerPage(p); setPage(1) }}
        />
      )}

      {selectedId !== null && detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card variant="modal" className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900">
                {t('compras:goodsReceipts.detail.title', { id: detail.id })}
              </h2>
              <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-600">
                <IcoClose />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-1">{detail.provider_name} — #{detail.purchase_order_id}</p>
            <p className="text-xs text-slate-400 mb-4">{new Date(detail.created_at).toLocaleString()}</p>

            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.product')}</th>
                  <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.quantity')}</th>
                  <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.unitCost')}</th>
                  <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:goodsReceipts.wizard.lines.costTotal')}</th>
                  <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:goodsReceipts.wizard.lines.warehouse')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.lines.map(l => (
                  <tr key={l.id}>
                    <td className="py-2">
                      <div className="font-medium text-slate-800">{l.description}</div>
                      <div className="text-xs text-slate-400">{l.reference}</div>
                    </td>
                    <td className="py-2 text-slate-600">{l.quantity}</td>
                    <td className="py-2 text-slate-600">${l.unit_cost.toFixed(2)}</td>
                    {/* REQ-164 Escenario 1 (fix Pre-QA 2026-07-20) — cost_total ya persistido por línea */}
                    <td className="py-2 text-slate-600">${l.cost_total.toFixed(2)}</td>
                    <td className="py-2 text-slate-600">{l.warehouse_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {detail.editable ? (
              <Button onClick={() => navigate(`/compras/ingresos/${detail.id}/editar`)}>
                {t('compras:goodsReceipts.detail.edit')}
              </Button>
            ) : (
              <p className="text-xs text-slate-400">{t('compras:goodsReceipts.detail.locked')}</p>
            )}

            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setSelectedId(null)}>{t('compras:inventory.actions.close')}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
