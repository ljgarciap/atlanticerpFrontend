import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useOrderDetail, useOrderDocumentDownloadUrl } from '@/hooks/useBodega'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPrinter } from '@/components/icons'
import AppLogo from '@/components/AppLogo'

interface Props {
  orderId: number
  onClose: () => void
}

/**
 * SCRUM-329 Oleada A / Batch A3 (REQ-330), rediseño Lote 4 (SCRUM-395, 2026-08-17) — vista en-app
 * de la Guía de Entrega, mismo layout que el PDF real (`guia-entrega-pdf.blade.php`, generado por
 * `OrderDocumentService::generateGuiaEntrega()`) para que preview y documento real coincidan.
 * RN1: nunca precios — ninguna columna de la tabla de artículos los incluye. RN2: una vez firmada
 * (`registerSignedGuide` ya corrió, detectable por `stage === 'entregado'`), el área de firma
 * muestra `received_by_name` (quien RECIBIÓ, Pre-QA 2026-07-23 — antes mostraba el repartidor por
 * error) en vez del bloque "Datos de entrega" en blanco. Se toma el documento `guia_entrega` de
 * mayor `id` (el más reciente): un pedido entregado tiene 2 — el generado sin firmar en Por
 * despachar y el firmado subido acá.
 *
 * "Imprimir" (rebote SCRUM-395, 2026-08-19 — Daniela: pie de página no fijo + 10 páginas en
 * blanco al imprimir) — corregido: ANTES este botón hacía `window.print()` sobre el HTML de este
 * modal (patrón "imprimir solo el modal" de `ConsolidatedPickingModal.tsx`/`PickingSheetModal.tsx`,
 * `body.printing-modal`+`.print-target` en `index.css`). Esa técnica oculta el resto del árbol con
 * `visibility:hidden`, que NO saca el tablero de Pedidos del flujo del documento — su altura real
 * (muchas tarjetas) seguía paginándose de fondo, invisible, generando páginas en blanco de más; y
 * el navegador no repite ningún elemento como pie de página fijo entre páginas impresas, por eso
 * el footer aparecía una sola vez pegado al final del contenido. Ese pipeline (React + window.print)
 * era además un documento DISTINTO del PDF real generado server-side (dompdf,
 * `OrderDocumentService::generateGuiaEntrega()`), que ya tiene el pie de página fijo y la
 * paginación corregidos (`page_text()`, `page-break-inside:avoid`) desde el rebote anterior — dos
 * pipelines de "impresión" en paralelo, justo lo que el requerimiento original pedía evitar
 * ("vista previa e impreso deben ser un único documento"). Ahora "Imprimir" abre ese PDF real
 * (URL presignada, mismo mecanismo que `OrderStatusDetailModal.tsx`) en una pestaña nueva — el
 * navegador imprime/guarda ESE documento, no una copia HTML aparte. Este modal queda como
 * preview visual únicamente; ya no se imprime a sí mismo.
 */
export default function GuiaEntregaModal({ orderId, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data: order, isLoading } = useOrderDetail(orderId)
  const documentUrlMutation = useOrderDocumentDownloadUrl()

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Pre-QA 2026-07-23 (CRÍTICO, junto con `received_by_name`) — un pedido "entregado" tiene 2
  // documentos `guia_entrega`: el generado sin firmar al entrar a "Por despachar"
  // (`OrderDocumentService::generateGuiaEntrega()`) y el firmado real subido en
  // `registerSignedGuide()`. Tomar el de mayor `id` (el más reciente), no el primero — si no, la
  // vista sigue mostrando el documento viejo sin `received_by_name` aunque el pedido ya esté firmado.
  const guideDocuments = order?.documents.filter(d => d.tipo === 'guia_entrega') ?? []
  const guideDocument = guideDocuments.length > 0
    ? guideDocuments.reduce((latest, d) => (d.id > latest.id ? d : latest))
    : null
  const isSigned = order?.stage === 'entregado'
  const guideNumber = order ? `${order.order_number}-G` : null

  function handlePrint() {
    if (!guideDocument) return
    documentUrlMutation.mutate(
      { orderId, documentId: guideDocument.id },
      { onSuccess: ({ url }) => window.open(url, '_blank', 'noopener,noreferrer') },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-2xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:pedidos.guideModal.title')}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !order ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : !guideDocument ? (
            <p className="text-sm text-slate-400 py-6 text-center">{t('bodega:pedidos.guideModal.notGenerated')}</p>
          ) : (
            <div className="border-b-4 border-[#5BA5A0] pb-4 mb-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <AppLogo size={40} />
                  <div>
                    <p className="text-lg font-bold text-[#5BA5A0] leading-tight">ATLANTIC</p>
                    <p className="text-[10px] text-slate-500">Powered by AtlanticERP</p>
                  </div>
                </div>
              </div>

              <p className="text-xl font-bold text-[#5BA5A0] mt-2 mb-4">
                {t('bodega:pedidos.guideModal.title').toUpperCase()}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {/* Columna izquierda — datos del cliente */}
                <div className="space-y-3">
                  <GuideField label={t('bodega:pedidos.guideModal.client')} value={order.cliente} />
                  <GuideField label={t('bodega:pedidos.guideModal.project')} value={order.proyecto} />
                  <GuideField
                    label={t('bodega:pedidos.guideModal.deliveryAddress')}
                    value={order.direccion_entrega}
                    fallback={t('bodega:pedidos.detailModal.notAvailable')}
                  />
                  <GuideField
                    label={t('bodega:pedidos.guideModal.contactName')}
                    value={order.contacto_cliente}
                    fallback={t('bodega:pedidos.detailModal.notAvailable')}
                  />
                  <GuideField
                    label={t('bodega:pedidos.guideModal.contactPhone')}
                    value={order.contacto_telefono}
                    fallback={t('bodega:pedidos.detailModal.notAvailable')}
                  />
                  <GuideField
                    label={t('bodega:pedidos.guideModal.contactEmail')}
                    value={order.contacto_correo}
                    fallback={t('bodega:pedidos.detailModal.notAvailable')}
                  />
                </div>
                {/* Columna derecha — guía/pedido/logística */}
                <div className="space-y-3 sm:text-right">
                  <GuideField label={t('bodega:pedidos.guideModal.guideNumber')} value={`#${guideNumber}`} />
                  <GuideField label={t('bodega:pedidos.guideModal.orderNumber')} value={order.order_number} />
                  <GuideField label={t('bodega:pedidos.guideModal.date')} value={new Date(guideDocument.created_at).toLocaleString()} />
                  <GuideField label={t('bodega:pedidos.guideModal.seller')} value={order.vendedor} />
                  <GuideField label={t('bodega:pedidos.guideModal.courier')} value={order.repartidor} />
                </div>
              </div>
            </div>
          )}

          {!isLoading && order && guideDocument && (
            <>
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    <Th>{t('bodega:pedidos.guideModal.items.publicRef')}</Th>
                    <Th>{t('bodega:pedidos.guideModal.items.item')}</Th>
                    <Th>{t('bodega:pedidos.guideModal.items.quantity')}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {order.items.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.reference ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{item.description ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                        {item.qty_delivered > 0 ? item.qty_delivered : item.qty_requested}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* RN1 — nunca precios. */}
              <p className="text-[11px] text-slate-400 italic mb-4">{t('bodega:pedidos.guideModal.noPrices')}</p>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-700 mb-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {t('bodega:pedidos.guideModal.status')}
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  {t(`bodega:pedidos.stages.${order.stage}`)}
                </p>
              </div>

              {isSigned ? (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                    {t('bodega:pedidos.guideModal.signature')}
                  </p>
                  <p className="text-sm italic text-slate-700 dark:text-slate-200" data-testid="guide-signature">
                    {t('bodega:pedidos.guideModal.signedBy')}: {guideDocument.received_by_name ?? '—'}
                  </p>
                </div>
              ) : (
                <div className="pt-4 mt-2 border-t-4 border-[#5BA5A0]" data-testid="guide-signature">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#3D7E7A] mb-4">
                    {t('bodega:pedidos.guideModal.deliveryData.title')}
                  </p>
                  <div className="max-w-[260px] ml-auto text-right mb-4">
                    <div className="border-b border-slate-400 h-5" />
                    <p className="text-[10px] text-slate-400 mt-1">{t('bodega:pedidos.guideModal.deliveryData.receivedBy')}</p>
                  </div>
                  <div className="max-w-[260px] ml-auto text-right">
                    <div className="border-b border-slate-400 h-5" />
                    <p className="text-[10px] text-slate-400 mt-1">{t('bodega:pedidos.guideModal.deliveryData.signature')}</p>
                  </div>
                  <p className="text-sm text-slate-400 sr-only">{t('bodega:pedidos.guideModal.pendingSignature')}</p>
                </div>
              )}

              <p className="text-center text-[10px] text-slate-400 mt-6">
                {t('bodega:pedidos.guideModal.footer')}
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
          {guideDocument && (
            <Button
              onClick={handlePrint}
              disabled={documentUrlMutation.isPending}
              loading={documentUrlMutation.isPending}
              className="!flex !items-center !gap-1.5"
            >
              <IcoPrinter size={14} /> {t('bodega:pedidos.guideModal.print')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

function GuideField({ label, value, fallback = '—' }: { label: string; value: string | null | undefined; fallback?: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <p className="text-sm text-slate-700 dark:text-slate-200">{value ?? fallback}</p>
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
