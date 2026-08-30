import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useOrderStatusDetail, useOrderStatusDocument } from '@/hooks/useBodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoDownload, IcoImage } from '@/components/icons'

interface Props {
  orderId: number
  onClose: () => void
}

/**
 * Batch A4 (SCRUM-407→413, REQ-337→343) — modal "Detalle del pedido" de la pantalla "Status de
 * Pedidos". Solo lectura para todos los perfiles (Bodega y Ventas & Diseño) — no hay ningún
 * control de edición en este batch.
 *
 * "Diseñador"/"Cliente" acá reusan el mismo dato que "Vendedor"/"Subcliente" de la tabla de
 * `OrderStatusPage` (`PipelineCard.owner_id` y el cliente del pedido) — no son campos separados
 * en el backend, solo cambia la etiqueta según el contexto.
 *
 * "Fecha de Estatus": se usa `fecha_estatus` tal como la manda el backend (server-computed) en
 * vez de `new Date()` del cliente — el contrato deja ambas como válidas, se elige la del backend
 * para no depender del reloj/locale del navegador y porque ya llega lista para mostrar.
 */
export default function OrderStatusDetailModal({ orderId, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: order, isLoading } = useOrderStatusDetail(orderId)
  const documentMutation = useOrderStatusDocument()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function handleViewDocument() {
    documentMutation.mutate(orderId, {
      onSuccess: ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {order ? t('bodega:orderStatusPage.detailModal.title', { number: order.order_number }) : t('common:labels.loading')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !order ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <Field label={t('bodega:orderStatusPage.detailModal.project')} value={order.proyecto} />
                <Field label={t('bodega:orderStatusPage.detailModal.designer')} value={order.disenador} />
                <Field label={t('bodega:orderStatusPage.detailModal.client')} value={order.cliente} />
                <Field label={t('bodega:orderStatusPage.detailModal.contact')} value={order.contacto} />
                <Field label={t('bodega:orderStatusPage.detailModal.phone')} value={order.telefono} />
                <Field label={t('bodega:orderStatusPage.detailModal.statusDate')} value={order.fecha_estatus} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="order-status-items-table">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                      <Th>{t('bodega:orderStatusPage.detailModal.items.image')}</Th>
                      <Th>{t('bodega:orderStatusPage.detailModal.items.publicRef')}</Th>
                      <Th>{t('bodega:orderStatusPage.detailModal.items.description')}</Th>
                      <Th>{t('bodega:orderStatusPage.detailModal.items.requested')}</Th>
                      <Th>{t('bodega:orderStatusPage.detailModal.items.delivered')}</Th>
                      <Th>{t('bodega:orderStatusPage.detailModal.items.pending')}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {order.items.map((item, i) => (
                      <tr key={item.catalog_product_id ?? i} data-testid="order-status-item-row">
                        <td className="px-3 py-2">
                          {item.imagen ? (
                            <img
                              src={item.imagen}
                              alt={item.description ?? ''}
                              className="w-10 h-10 rounded object-cover border border-slate-200 dark:border-slate-700"
                            />
                          ) : (
                            <IcoImage size={20} className="text-slate-300" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">{item.reference ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.description ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.solicitada}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.entregado}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300" data-testid="order-status-item-pending">
                          {item.pendiente}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
          {order && (
            <Button
              onClick={handleViewDocument}
              disabled={documentMutation.isPending}
              loading={documentMutation.isPending}
              className="!flex !items-center !gap-1.5"
              data-testid="view-document-button"
            >
              <IcoDownload size={14} /> {t('bodega:orderStatusPage.detailModal.viewDocument')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function Field({ label, value, fallback = '—' }: { label: string; value: string | null | undefined; fallback?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</label>
      <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">{value ?? fallback}</p>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  )
}
