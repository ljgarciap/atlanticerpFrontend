import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { InvoiceFiscalSummary } from '@/components/admin-contab/InvoiceFiscalSummary'
import { useDownloadOrderInvoicePdf } from '@/hooks/useBodega'
import type { OrderInvoiceStatusResponse } from '@/types/bodega'

interface Props {
  response: OrderInvoiceStatusResponse
  onClose:  () => void
}

/**
 * SCRUM-832 — antes (SCRUM-401/REQ-331) este modal solo pintaba `status_message`, sin importar si
 * la factura ya existía (el módulo real de Admin&Cont no existía todavía en ese momento). Ahora
 * que `OrderInvoiceStatusResponse` trae el detalle fiscal completo cuando `invoice_ready===true`
 * y `estado` es 'facturada'/'anulada', se muestra la factura real (ítems/Subtotal/ITBMS/Total +
 * "Ver / Imprimir PDF") reusando `InvoiceFiscalSummary` — el mismo bloque read-only que
 * `FacturacionPage.tsx` usa en Admin&Cont, sin el flujo de cobrabilidad (exclusivo de ese módulo).
 * El PDF se pide vía el endpoint propio de Bodega (`bodegaApi.orders.invoicePdf`,
 * `permission:bodega.read`) — nunca llama directo a las rutas de `admin-contab`, gateadas por
 * roles que un usuario de Bodega no necesariamente tiene (ver docblock de `OrderInvoiceController`
 * en el backend).
 *
 * SCRUM-832 — también fix del bug de jitter/intermitencia (SCRUM-393, mismo diagnóstico que
 * `RegisterDeliveryModal`): portal a `document.body` para que este `position: fixed` no quede
 * anidado bajo el `hover:-translate-y-px` de `OrderCardTile`.
 */
export default function InvoiceStatusModal({ response, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega', 'adminContab'])
  const pdfMutation = useDownloadOrderInvoicePdf()

  const tieneFacturaReal = response.invoice_ready
    && (response.estado === 'facturada' || response.estado === 'anulada')

  function verPdf() {
    pdfMutation.mutate({ orderId: response.order_id, orderNumber: response.order_number })
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className={`w-full my-4 sm:my-0 max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] overflow-y-auto p-5 ${tieneFacturaReal ? 'max-w-xl' : 'max-w-sm'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:pedidos.invoiceModal.title', { number: response.order_number })}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        {response.es_anulada && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg p-3 text-xs font-medium mb-3">
            {t('adminContab:facturacion.detalle.anuladaAviso')}
          </div>
        )}

        {tieneFacturaReal ? (
          <InvoiceFiscalSummary
            items={response.items} subtotal={response.subtotal} descuentos={response.descuentos}
            itbms={response.itbms} total={response.total} monto={response.monto}
            saldoAplicado={response.saldo_aplicado} totalAPagar={response.total_a_pagar}
            cuentaPago={response.cuenta_pago} responsable={response.responsable}
            onVerPdf={verPdf} pdfLoading={pdfMutation.isPending} t={t}
          />
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-200" data-testid="invoice-status-message">
            {response.status_message}
          </p>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>,
    document.body,
  )
}
