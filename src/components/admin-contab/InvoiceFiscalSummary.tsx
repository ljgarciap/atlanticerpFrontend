import { FiscalItemsTable, FiscalTotalsBlock } from '@/components/admin-contab/FiscalDocumentPreview'
import { Button } from '@/components/ui/Button'
import { IcoPrinter } from '@/components/icons'
import type { InvoiceLineItem } from '@/types/adminContab'

/**
 * SCRUM-832 — extraído de `InvoiceDetailModal` dentro de `FacturacionPage.tsx` (líneas 807-831
 * antes de este cambio): el bloque de ítems + totales + datos de pago + "Ver / Imprimir PDF" es
 * puramente de lectura, sin nada del flujo de cobrabilidad (marcar/decidir incobrable, registrar
 * cobro) que sigue siendo exclusivo de Admin&Cont. Se comparte con `InvoiceStatusModal` de Bodega
 * (Por despachar → Ver factura), que solo necesita esta porción read-only — nunca el flujo de
 * cobrabilidad, que requiere roles/permisos de Admin&Cont que un usuario de Bodega no tiene.
 */
export function InvoiceFiscalSummary(
  {
    items, subtotal, descuentos, itbms, total, monto, saldoAplicado, totalAPagar,
    cuentaPago, responsable, onVerPdf, pdfLoading, t,
  }: {
    items?: InvoiceLineItem[]
    subtotal?: number
    descuentos?: number
    itbms?: number
    total?: number
    monto?: number
    saldoAplicado?: number
    totalAPagar?: number
    cuentaPago?: string | null
    responsable?: string | null
    onVerPdf: () => void
    pdfLoading: boolean
    t: (key: string) => string
  },
) {
  return (
    <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
      <FiscalItemsTable items={items} t={t} />
      <FiscalTotalsBlock
        subtotal={subtotal} descuentos={descuentos} itbms={itbms}
        total={total} monto={monto}
        saldoAplicable={(saldoAplicado ?? 0) > 0 ? saldoAplicado : undefined}
        totalAPagar={totalAPagar}
        t={t}
      />
      {(cuentaPago || responsable) && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
          <div className="text-[10px] font-medium uppercase text-slate-400">{t('adminContab:facturacion.detalle.datosPago')}</div>
          {cuentaPago && <div>{t('adminContab:facturacion.detalle.cuentaPago')}: {cuentaPago}</div>}
          {responsable && <div>{t('adminContab:facturacion.detalle.responsable')}: {responsable}</div>}
        </div>
      )}
      <Button
        variant="secondary" className="!text-xs mt-3 inline-flex items-center gap-1.5"
        onClick={onVerPdf} loading={pdfLoading}
      >
        <IcoPrinter size={13} /> {t('adminContab:facturacion.detalle.verPdf')}
      </Button>
    </div>
  )
}
