import { useTranslation } from 'react-i18next'
import type { LegacyDocumentHeader, LegacyDocumentItem } from '@/types/ventasDiseno'
import { FichaField } from '@/components/ui/FichaField'

interface Props {
  isLoading: boolean
  header:    LegacyDocumentHeader | null
  items:     LegacyDocumentItem[] | null
}

// Ficha "gemela" tipo documento (cabecera + líneas) de Cotizaciones/Pedidos/Albaranes/Facturas —
// extraído de SubClientIcgHistoryModal.tsx (SCRUM-762/SCRUM-749) para reusarse también desde
// VistaIcgPage.tsx (la pantalla global "Vista ICG" bajo Migración, 2026-09-03), que consume el
// mismo shape de respuesta (LegacyDocumentPresenter en el backend). Los campos que no aplican a
// una entidad puntual (ej. `fecha_entrega` fuera de Pedidos) vienen `undefined` desde el backend
// y simplemente no se renderizan (ver `FichaField` con `hidden={value == null}`).
export function LegacyDocumentoFicha({ isLoading, header, items }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])

  if (isLoading || header === null) {
    return <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
  }

  return (
    <div className="space-y-5">
      <div data-testid="legacy-documento-ficha" className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.folio')} value={header.folio} />
        {header.cliente !== undefined && (
          <FichaField
            label={t('ventasDiseno:clients.icgHistoryModal.document.cliente')}
            value={header.cliente
              ? (header.cliente.nombre_comercial ?? header.cliente.razon_social)
              : t('ventasDiseno:clients.icgHistoryModal.document.clienteHuerfano', { code: header.icg_codcliente ?? '—' })}
          />
        )}
        {header.proveedor !== undefined && (
          <FichaField
            label={t('ventasDiseno:clients.icgHistoryModal.document.proveedor')}
            value={header.proveedor
              ? (header.proveedor.nombre_comercial ?? header.proveedor.nombre)
              : t('ventasDiseno:clients.icgHistoryModal.document.proveedorHuerfano', { code: header.icg_codproveedor ?? '—' })}
          />
        )}
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.fecha')} value={header.fecha ?? '—'} />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.vendedorCodigo')} value={header.icg_codvendedor ?? '—'} hidden={header.icg_codvendedor === undefined} />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.fechaEntrega')} value={header.fecha_entrega} hidden={header.fecha_entrega == null} />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.estadoCodigo')} value={header.estado} hidden={header.estado == null} />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.totalNeto')} value={fmtMoney(header.total_neto)} />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.totalBruto')} value={fmtMoney(header.total_bruto)} hidden={header.total_bruto == null} />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.totalImpuestos')} value={fmtMoney(header.total_impuestos)} hidden={header.total_impuestos == null} />
        <FichaField
          label={t('ventasDiseno:clients.icgHistoryModal.document.facturado')}
          value={header.facturado ? t('ventasDiseno:clients.icgHistoryModal.document.si') : t('ventasDiseno:clients.icgHistoryModal.document.no')}
          hidden={header.facturado === undefined}
        />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.albaranRelacionado')} value={header.albaran_relacionado} hidden={header.albaran_relacionado == null} />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.facturaRelacionada')} value={header.factura_relacionada} hidden={header.factura_relacionada == null} />
        {/* SCRUM-842 — campos libres, solo aplican a Cotizaciones/Pedidos/Albaranes venta */}
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.proyecto')} value={header.proyecto} hidden={header.proyecto == null} />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.promocion')} value={header.promocion} hidden={header.promocion == null} />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.comision')} value={fmtMoney(header.comision)} hidden={header.comision == null} />
        <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.observaciones')} value={header.observaciones} hidden={header.observaciones == null} />
      </div>

      {(header.fe_estado != null || header.fe_qr != null || header.fe_auth_number != null) && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
            {t('ventasDiseno:clients.icgHistoryModal.document.feTitle')}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.feEstado')} value={header.fe_estado} hidden={header.fe_estado == null} />
            <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.feAuthNumber')} value={header.fe_auth_number} hidden={header.fe_auth_number == null} />
            <FichaField
              label={t('ventasDiseno:clients.icgHistoryModal.document.feSerieNumero')}
              value={header.fe_serie != null && header.fe_numero != null ? `${header.fe_serie}-${header.fe_numero}` : null}
              hidden={header.fe_serie == null && header.fe_numero == null}
            />
            <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.feFechaEmision')} value={header.fe_fecha_emision} hidden={header.fe_fecha_emision == null} />
            <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.feFechaRecepcion')} value={header.fe_fecha_recepcion} hidden={header.fe_fecha_recepcion == null} />
            <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.feError')} value={header.fe_error} hidden={header.fe_error == null} />
            <FichaField label={t('ventasDiseno:clients.icgHistoryModal.document.feQr')} value={header.fe_qr} hidden={header.fe_qr == null} />
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
          {t('ventasDiseno:clients.icgHistoryModal.document.itemsTitle')}
        </div>
        {items === null ? (
          <p className="text-xs text-slate-400">{t('ventasDiseno:clients.icgHistoryModal.document.sinLineasOrigen')}</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-400">{t('ventasDiseno:clients.icgHistoryModal.document.itemsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-700">
                  <th className="py-1.5 pr-2">{t('ventasDiseno:clients.icgHistoryModal.document.itemsReferencia')}</th>
                  <th className="py-1.5 pr-2">{t('ventasDiseno:clients.icgHistoryModal.document.itemsDescripcion')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('ventasDiseno:clients.icgHistoryModal.document.itemsCantidad')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('ventasDiseno:clients.icgHistoryModal.document.itemsPrecio')}</th>
                  {items.some(i => i.descuento != null) && (
                    <th className="py-1.5 pr-2 text-right">{t('ventasDiseno:clients.icgHistoryModal.document.itemsDescuento')}</th>
                  )}
                  <th className="py-1.5 pr-2 text-right">{t('ventasDiseno:clients.icgHistoryModal.document.itemsTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-50 dark:border-slate-800">
                    <td className="py-1.5 pr-2 font-mono">{item.referencia ?? '—'}</td>
                    <td className="py-1.5 pr-2">{item.descripcion ?? '—'}</td>
                    <td className="py-1.5 pr-2 text-right">{item.cantidad ?? '—'}</td>
                    <td className="py-1.5 pr-2 text-right">{fmtMoney(item.precio)}</td>
                    {items.some(i => i.descuento != null) && (
                      <td className="py-1.5 pr-2 text-right">{item.descuento != null ? fmtMoney(item.descuento) : '—'}</td>
                    )}
                    <td className="py-1.5 pr-2 text-right">{fmtMoney(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export function fmtMoney(value: string | null | undefined): string {
  if (value == null) return '—'
  return `$${Number(value).toLocaleString()}`
}
