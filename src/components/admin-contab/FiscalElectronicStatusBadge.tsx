import { useState } from 'react'
import { IcoCheck, IcoClock, IcoAlertTriangle, IcoBan, IcoChevronDown, IcoChevronRight } from '@/components/icons'
import type { FiscalDocumentPreviewResult, FiscalElectronicStatus } from '@/types/adminContab'

/**
 * SCRUM-943 — badge compartido entre `InvoiceDetailModal` y `DetalleNotaCreditoModal`: mismo
 * vocabulario de estados en ambos (factura y Nota de Crédito comparten `fe_estado`). Regla dura
 * (pedida explícitamente en el ticket): `error_configuracion` NUNCA se muestra como "rechazado" —
 * es un problema de configuración nuestro, no un rechazo real de la DGI, por eso tiene su propio
 * color/ícono, distinto del rojo de `rechazado`.
 *
 * SCRUM-943 (pedido de Luis, 2026-09-25) — en `no_aplica` (típicamente `pac_ambiente: apagado`)
 * ofrece "Ver JSON que se enviaría al PAC": llama a `onLoadPreview` (provisto por el caller, que
 * sabe si es una factura o una Nota de Crédito — este componente no conoce esa diferencia) solo al
 * expandir, una vez por apertura del modal — nunca se precarga sin que el usuario lo pida.
 */
export default function FiscalElectronicStatusBadge(
  { estado, cufe, qrContent, detalle, onLoadPreview, t }:
  {
    estado: FiscalElectronicStatus | null
    cufe: string | null
    qrContent: string | null
    /** Motivo textual del rechazo (solo Gerencia/superadmin lo reciben del backend). */
    detalle?: string | null
    onLoadPreview?: () => Promise<FiscalDocumentPreviewResult>
    t: (key: string) => string
  },
) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<FiscalDocumentPreviewResult | null>(null)

  if (estado === null) return null // certificación nunca corrida (factura previa a esta feature) — sin badge.

  async function toggleExpanded() {
    if (!expanded && preview === null && onLoadPreview) {
      setLoading(true)
      try {
        setPreview(await onLoadPreview())
      } finally {
        setLoading(false)
      }
    }
    setExpanded(prev => !prev)
  }

  if (estado === 'no_aplica') {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium text-slate-400 dark:text-slate-500 w-fit">
          {t('adminContab:facturacion.detalle.facturacionElectronica.noAplica')}
        </span>
        {onLoadPreview && (
          <div>
            <button
              type="button" onClick={toggleExpanded}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-dark hover:underline"
            >
              {expanded ? <IcoChevronDown size={11} /> : <IcoChevronRight size={11} />}
              {t('adminContab:facturacion.detalle.facturacionElectronica.verJson')}
            </button>
            {expanded && (
              loading ? (
                <p className="text-[10.5px] text-slate-400 mt-1">{t('common:labels.loading')}</p>
              ) : preview?.ok ? (
                <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2.5 text-[10.5px] text-slate-700 dark:text-slate-200">
                  {JSON.stringify(preview.payload, null, 2)}
                </pre>
              ) : (
                <p className="text-[10.5px] text-red-500 mt-1">{preview?.error}</p>
              )
            )}
          </div>
        )}
      </div>
    )
  }

  const badgeClass: Record<'pendiente' | 'certificado' | 'rechazado' | 'error_configuracion' | 'en_espera_nc', string> = {
    pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    certificado: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
    rechazado: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    error_configuracion: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
    // Ni verde ni rojo: no es un rechazo, es una espera deliberada (SCRUM-1009).
    en_espera_nc: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  }
  const icon = {
    pendiente: <IcoClock size={12} />,
    certificado: <IcoCheck size={12} />,
    rechazado: <IcoBan size={12} />,
    error_configuracion: <IcoAlertTriangle size={12} />,
    en_espera_nc: <IcoClock size={12} />,
  }[estado]
  const labelKey = estado === 'error_configuracion' ? 'errorConfiguracion' : estado === 'en_espera_nc' ? 'enEsperaNc' : estado

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-full text-xs font-bold ${badgeClass[estado]}`}>
        {icon}
        {t(`adminContab:facturacion.detalle.facturacionElectronica.${labelKey}`)}
      </span>
      {(estado === 'rechazado' || estado === 'error_configuracion') && detalle && (
        <p className="text-[10.5px] text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-words">
          {t('adminContab:facturacion.detalle.facturacionElectronica.motivo')}: {detalle}
        </p>
      )}
      {estado === 'certificado' && cufe && (
        <p className="text-[10.5px] text-slate-400 dark:text-slate-500">
          {t('adminContab:facturacion.detalle.facturacionElectronica.cufe')}: {cufe}
          {qrContent && (
            <>
              {' · '}
              <a href={qrContent} target="_blank" rel="noreferrer" className="underline hover:text-slate-600 dark:hover:text-slate-300">
                {t('adminContab:facturacion.detalle.facturacionElectronica.verQr')}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
