import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { Button } from '@/components/ui/Button'
import { useCorrectInvoiceReceptor } from '@/hooks/useAdminContab'
import { usePermission } from '@/hooks/usePermission'
import type { ReceptorValidacion } from '@/types/adminContab'

/** Mismo permiso que exige `PATCH /admin-contab/invoices/receptors/{id}` (ver SpecialPermissionSeeder). */
export const PERMISO_EDITAR_RECEPTOR = 'admin_contab.edit.receptor_fiscal'
/** SCRUM-1140 — facturar a Consumidor final por decisión de quien factura (lo exige `POST /admin-contab/invoices`). */
export const PERMISO_CONSUMIDOR_FINAL = 'admin_contab.edit.receptor_consumidor_final'

interface Props {
  receptor: ReceptorValidacion
  cliente?: string
  /** Se llama tras guardar datos que la DGI confirmó: la vista previa se vuelve a calcular. */
  onCorrected: () => void
  /** SCRUM-1140 — esta factura se emitirá a Consumidor final. Sin `onConsumidorFinalChange` la opción no se ofrece. */
  consumidorFinal?: boolean
  onConsumidorFinalChange?: (value: boolean) => void
}

interface ErrorBody {
  message?: string
  receptor?: ReceptorValidacion
}

/**
 * Guarda de RUC al facturar (docs/specs/guarda-validacion-ruc-al-facturar.md y receptor-tipo-documento-al-facturar.md):
 * muestra el resultado de validar el receptor contra la DGI en la vista previa.
 *  - Bloquea y se puede corregir: formulario de RUC/cédula, DV (opcional) y razón social. El backend valida contra la DGI
 *    ANTES de guardar, así que un documento que no coincide nunca se guarda.
 *  - Razón social distinta: no bloquea. Se muestran ambas; en la factura viaja la de la DGI y "Actualizar cliente" es opcional.
 *  - Con el permiso `PERMISO_CONSUMIDOR_FINAL`: "Facturar como consumidor final" en cualquier estado (el documento no valida, falla
 *    la DGI, razón social distinta, PAC apagado o validado) como decisión consciente. Vale solo para esa factura: el cliente conserva su documento.
 */
export default function ReceptorGuardNotice({ receptor, cliente, onCorrected, consumidorFinal = false, onConsumidorFinalChange }: Props) {
  const { t } = useTranslation('adminContab')
  const puedeEditar = usePermission(PERMISO_EDITAR_RECEPTOR)
  const puedeConsumidorFinal = usePermission(PERMISO_CONSUMIDOR_FINAL) && onConsumidorFinalChange !== undefined && receptor.sub_client_id !== null
  const mutation = useCorrectInvoiceReceptor()

  // El último resultado de la DGI (tras un intento fallido) reemplaza al de la vista previa.
  const [actual, setActual] = useState<ReceptorValidacion>(receptor)
  const [nombre, setNombre] = useState(receptor.nombre ?? cliente ?? '')
  const [ruc, setRuc]       = useState(receptor.ruc ?? '')
  const [dv, setDv]         = useState(receptor.dv ?? '')
  const [error, setError]   = useState<string | null>(null)

  if (actual.estado === 'no_aplica') return null

  const inputClass = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2.5 py-1.5 text-sm font-normal normal-case'

  // Decisión tomada: esta factura sale a Consumidor final y el cliente conserva su documento.
  if (consumidorFinal) {
    return (
      <div className="rounded-lg p-2.5 mb-1.5 space-y-2 text-[11.5px] bg-slate-50 text-slate-800 dark:bg-slate-900/40 dark:text-slate-200" role="status" data-testid="receptor-consumidor-final">
        <p className="font-semibold">{t('facturacion.preview.receptor.consumidorFinal.titulo')}</p>
        <p>{t('facturacion.preview.receptor.consumidorFinal.detalle')}</p>
        <Button variant="secondary" onClick={() => onConsumidorFinalChange?.(false)}>
          {t('facturacion.preview.receptor.consumidorFinal.quitar')}
        </Button>
      </div>
    )
  }

  // Documento validado y sin diferencias: solo se ofrece, si corresponde, la decisión consciente de Consumidor final.
  if (actual.estado === 'ok') {
    if (!puedeConsumidorFinal) return null
    return (
      <div className="mb-1.5 text-[11.5px]" data-testid="receptor-ok">
        <Button variant="secondary" onClick={() => onConsumidorFinalChange?.(true)}>
          {t('facturacion.preview.receptor.consumidorFinal.facturar')}
        </Button>
      </div>
    )
  }

  const bloquea = actual.bloquea
  const tono = bloquea
    ? 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'
    : 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
  const puedeCorregir = bloquea && actual.corregible && actual.sub_client_id !== null && !actual.edicion_bloqueada
  const puedeActualizar = actual.estado === 'nombre_distinto' && actual.actualizable && actual.sub_client_id !== null
    && !actual.edicion_bloqueada && actual.nombre_dgi !== null && actual.ruc !== null
  // El DV es opcional (una cédula puede no tenerlo); si se escribe debe ser de 1 o 2 dígitos. El backend lo exige solo si la DGI lo trae.
  const dvValido = dv.trim() === '' || /^\d{1,2}$/.test(dv.trim())
  const canSubmit = nombre.trim() !== '' && ruc.trim() !== '' && dvValido && !mutation.isPending
  const titulo = bloquea
    ? 'facturacion.preview.receptor.titulo'
    : actual.estado === 'nombre_distinto' ? 'facturacion.preview.receptor.tituloNombreDistinto' : 'facturacion.preview.receptor.tituloAviso'

  function enviar(data: { business_name: string; tax_id: string; tax_id_dv?: string }) {
    if (actual.sub_client_id === null) return
    setError(null)
    mutation.mutate(
      { subClientId: actual.sub_client_id, data },
      {
        onSuccess: onCorrected,
        onError: err => {
          const body = isAxiosError<ErrorBody>(err) ? err.response?.data : undefined
          if (body?.receptor) setActual(body.receptor)
          setError(body?.message ?? t('facturacion.preview.receptor.errorGuardar'))
        },
      },
    )
  }

  function submit() {
    if (!canSubmit) return
    enviar({ business_name: nombre.trim(), tax_id: ruc.trim(), ...(dv.trim() !== '' ? { tax_id_dv: dv.trim() } : {}) })
  }

  function actualizarCliente() {
    if (actual.nombre_dgi === null || actual.ruc === null) return
    enviar({ business_name: actual.nombre_dgi, tax_id: actual.ruc, ...(actual.dv_dgi ? { tax_id_dv: actual.dv_dgi } : {}) })
  }

  return (
    <div className={`rounded-lg p-2.5 mb-1.5 space-y-2 text-[11.5px] ${tono}`} role={bloquea ? 'alert' : 'status'} data-testid="receptor-guard">
      <p className="font-semibold">{t(titulo)}</p>
      <p>{actual.mensaje}</p>

      {actual.estado === 'nombre_distinto' && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5" data-testid="receptor-nombres">
          <dt className="font-semibold">{t('facturacion.preview.receptor.nombreEnAtlanticERP')}</dt>
          <dd>{actual.nombre}</dd>
          <dt className="font-semibold">{t('facturacion.preview.receptor.nombreEnDgi')}</dt>
          <dd>{actual.nombre_dgi}</dd>
        </dl>
      )}

      {actual.edicion_bloqueada && <p>{t('facturacion.preview.receptor.edicionBloqueada')}</p>}
      {bloquea && actual.corregible && !actual.edicion_bloqueada && !puedeEditar && <p>{t('facturacion.preview.receptor.sinPermiso')}</p>}

      {puedeActualizar && puedeEditar && (
        <div className="space-y-1 pt-1">
          {error && <p className="font-medium">{error}</p>}
          <Button variant="secondary" onClick={actualizarCliente} loading={mutation.isPending}>
            {t('facturacion.preview.receptor.actualizarCliente')}
          </Button>
        </div>
      )}

      {puedeCorregir && puedeEditar && (
        <div className="space-y-2 pt-1">
          <label className="block">
            <span className="block text-[10.5px] font-semibold uppercase mb-0.5">{t('facturacion.preview.receptor.razonSocial')}</span>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className={inputClass} />
          </label>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <label className="block">
              <span className="block text-[10.5px] font-semibold uppercase mb-0.5">{t('facturacion.preview.receptor.ruc')}</span>
              <input type="text" value={ruc} onChange={e => setRuc(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="block text-[10.5px] font-semibold uppercase mb-0.5">{t('facturacion.preview.receptor.dv')}</span>
              <input type="text" inputMode="numeric" maxLength={2} value={dv} onChange={e => setDv(e.target.value)} className={inputClass} />
            </label>
          </div>

          {(actual.nombre_dgi || actual.dv_dgi) && (
            <Button
              variant="secondary"
              onClick={() => { if (actual.nombre_dgi) setNombre(actual.nombre_dgi); if (actual.dv_dgi) setDv(actual.dv_dgi) }}
            >
              {t('facturacion.preview.receptor.usarDgi')}
            </Button>
          )}

          {error && <p className="font-medium">{error}</p>}

          <Button onClick={submit} disabled={!canSubmit} loading={mutation.isPending}>
            {t('facturacion.preview.receptor.validarGuardar')}
          </Button>
        </div>
      )}

      {puedeConsumidorFinal && (
        <div className="pt-1">
          <Button variant="secondary" onClick={() => onConsumidorFinalChange?.(true)}>
            {t('facturacion.preview.receptor.consumidorFinal.facturar')}
          </Button>
        </div>
      )}
    </div>
  )
}
