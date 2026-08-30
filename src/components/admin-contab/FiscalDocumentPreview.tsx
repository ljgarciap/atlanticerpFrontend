import type { InvoiceLineItem } from '@/types/adminContab'

/**
 * Extraído de `FacturacionPage.tsx` (Batch 12, SCRUM-565→570) — `FiscalItemsTable`/
 * `FiscalTotalsBlock` ya eran compartidos entre `PreviewModal` y `InvoiceDetailModal` dentro de ese
 * archivo (RN1 REQ-443/RN1 REQ-449 piden el mismo formato visual de documento fiscal). La vista
 * previa de factura nueva de "Corrección de datos" (REQ-489) reusa el mismo layout — mismos
 * productos de la factura original, con el ITBMS/fecha ya corregidos — por eso pasan a ser
 * componentes compartidos en vez de quedar duplicados en un tercer lugar.
 */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

export function FiscalItemsTable({ items, t }: { items?: InvoiceLineItem[]; t: (key: string) => string }) {
  if (!items || items.length === 0) return null
  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-700 overflow-hidden mb-2">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400">
          <tr>
            <th className="text-left font-medium px-2.5 py-1.5">{t('adminContab:facturacion.preview.items.descripcion')}</th>
            <th className="text-right font-medium px-2.5 py-1.5">{t('adminContab:facturacion.preview.items.cantidad')}</th>
            <th className="text-right font-medium px-2.5 py-1.5">{t('adminContab:facturacion.preview.items.precioUnitario')}</th>
            <th className="text-right font-medium px-2.5 py-1.5">{t('adminContab:facturacion.preview.items.subtotal')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-t border-slate-100 dark:border-slate-700">
              <td className="px-2.5 py-1.5">{item.descripcion}</td>
              <td className="px-2.5 py-1.5 text-right">{item.cantidad}</td>
              <td className="px-2.5 py-1.5 text-right">{formatCurrency(item.precio_unitario)}</td>
              <td className="px-2.5 py-1.5 text-right">{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function FiscalTotalsBlock(
  { subtotal, descuentos, itbms, total, monto, saldoAplicable, totalAPagar, t }:
  {
    subtotal?: number; descuentos?: number; itbms?: number; total?: number; monto?: number
    saldoAplicable?: number; totalAPagar?: number
    t: (key: string) => string
  },
) {
  return (
    <div className="text-sm space-y-0.5">
      {subtotal !== undefined && (
        <div className="flex justify-between text-slate-500 dark:text-slate-400 text-xs">
          <span>{t('adminContab:facturacion.preview.subtotal')}</span><span>{formatCurrency(subtotal)}</span>
        </div>
      )}
      {!!descuentos && (
        <div className="flex justify-between text-slate-500 dark:text-slate-400 text-xs">
          <span>{t('adminContab:facturacion.preview.descuentos')}</span><span>-{formatCurrency(descuentos)}</span>
        </div>
      )}
      {itbms !== undefined && (
        <div className="flex justify-between text-slate-500 dark:text-slate-400 text-xs">
          <span>{t('adminContab:facturacion.preview.itbms')}</span><span>{formatCurrency(itbms)}</span>
        </div>
      )}
      {(saldoAplicable ?? 0) > 0 ? (
        <>
          <div className="flex justify-between text-slate-400 dark:text-slate-500 line-through text-xs">
            <span>{t('adminContab:facturacion.preview.totalFactura')}</span><span>{formatCurrency(total ?? monto ?? 0)}</span>
          </div>
          <div className="flex justify-between text-slate-500 dark:text-slate-400 text-xs">
            <span>{t('adminContab:facturacion.preview.saldoAplicado')}</span><span>-{formatCurrency(saldoAplicable ?? 0)}</span>
          </div>
          <div className="flex justify-between font-bold text-primary-dark pt-0.5">
            <span>{t('adminContab:facturacion.preview.totalAPagar')}</span><span>{formatCurrency(totalAPagar ?? total ?? monto ?? 0)}</span>
          </div>
        </>
      ) : (
        <div className="flex justify-between font-bold text-primary-dark pt-0.5">
          <span>{t('adminContab:facturacion.preview.totalFactura')}</span><span>{formatCurrency(total ?? monto ?? 0)}</span>
        </div>
      )}
    </div>
  )
}
