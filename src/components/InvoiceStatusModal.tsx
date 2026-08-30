import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  orderNumber:  string
  statusMessage: string
  onClose:       () => void
}

/**
 * SCRUM-401 (REQ-331) — ALCANCE REDUCIDO a propósito (decisión de Luis, ver docblock de
 * `OrderInvoiceController` en el backend): el link "ver" de la fila de factura solo muestra el
 * `status_message` que ya trae el backend, nunca una vista de documento con Subtotal/ITBMS/Total
 * — esa Factura real depende de un módulo de Administración & Contabilidad que no existe todavía.
 */
export default function InvoiceStatusModal({ orderNumber, statusMessage, onClose }: Props) {
  const { t } = useTranslation(['common', 'bodega'])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card variant="modal" className="w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('bodega:pedidos.invoiceModal.title', { number: orderNumber })}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <p className="text-sm text-slate-700 dark:text-slate-200" data-testid="invoice-status-message">
          {statusMessage}
        </p>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
