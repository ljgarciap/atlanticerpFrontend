import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { usePermission } from '@/hooks/usePermission'
import type { ReceptorTipo, SubClientDetail } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoAlertTriangle } from '@/components/icons'
import TaxIdValidator from '@/components/TaxIdValidator'
import { dvPattern, useFiscalId } from '@/hooks/useFiscalId'
import { fiscalIdText } from '@/lib/region'
import ReceptorTipoSelect from '@/components/ReceptorTipoSelect'

/**
 * SCRUM-1002 — edición de razón social, RUC y DV de un SubCliente. El receptor de la factura electrónica sale de
 * estos datos en vivo: el backend bloquea (409) si el cliente ya tiene documentos certificados o pendientes ante la
 * DGI, y el mensaje se muestra tal cual. Cada cambio queda en la bitácora de auditoría.
 */

export default function EditSubClientTaxDataModal({ subClient, onClose }: { subClient: SubClientDetail; onClose: () => void }) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()
  const canMarkConsumidorFinal = usePermission('ventas_diseno.edit.client_tax_data')
  const [businessName, setBusinessName] = useState(subClient.business_name)
  const [receptorTipo, setReceptorTipo] = useState<ReceptorTipo>(subClient.receptor_tipo ?? '01')
  const [taxId, setTaxId] = useState(subClient.tax_id)
  const [taxIdDv, setTaxIdDv] = useState(subClient.tax_id_dv ?? '')
  const fiscalId = useFiscalId() // Fase 6c: RUC+DV en Panamá, NIT+DV en Colombia, EIN sin DV en EE. UU.
  const [error, setError] = useState<string | null>(null)
  // SCRUM-1166 — si el cliente es exento y se cambian RUC, DV o tipo, el servidor avisa que la exención hay que revisarla; el modal lo muestra antes de cerrar.
  const [revisarExencion, setRevisarExencion] = useState(false)

  const mutation = useMutation({
    mutationFn: () => ventasDisenoApi.clients.updateSubClientTaxData(subClient.id, receptorTipo === '02'
      ? { business_name: businessName.trim(), receptor_tipo: receptorTipo } // SCRUM-1003 — Consumidor Final: sin RUC ni DV
      : { business_name: businessName.trim(), receptor_tipo: receptorTipo, tax_id: taxId.trim(), tax_id_dv: fiscalId.uses_dv ? taxIdDv.trim() : '' }),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['ventas-diseno-client'] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-clients'] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-fiscal-directory'] })
      if (r.exencion_a_revisar) { setRevisarExencion(true); return }
      onClose()
    },
    onError: (err: unknown) => {
      const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
      const primerError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
      setError(data?.message ?? primerError ?? t('ventasDiseno:clients.editTaxData.errorGenerico'))
    },
  })

  const valido = businessName.trim() !== '' && (receptorTipo === '02' || (taxId.trim() !== '' && (!fiscalId.uses_dv || taxIdDv.trim() === '' || dvPattern(fiscalId).test(taxIdDv.trim()))))
  const inputClass = 'w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#5BA5A0] focus:outline-none'
  const labelClass = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1'

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-lg my-4 flex flex-col max-h-[calc(100dvh-2rem)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('ventasDiseno:clients.editTaxData.title')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1 flex flex-col gap-3">
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 p-2.5 text-[11.5px] font-medium">
            <IcoAlertTriangle size={13} /> <span>{t('ventasDiseno:clients.editTaxData.aviso')}</span>
          </p>
          {/* SCRUM-1166 — antes de guardar: este cliente es exento de ITBMS y cambiar su RUC o tipo obliga a revisar la exención. */}
          {subClient.itbms_exento && !revisarExencion && (
            <p data-testid="edit-tax-aviso-exento" className="flex items-start gap-2 rounded-lg bg-primary-soft text-primary-dark p-2.5 text-[11.5px] font-medium">
              <IcoAlertTriangle size={13} /> <span>{t('ventasDiseno:clients.editTaxData.avisoExento', { documento: subClient.itbms_exencion_documento ?? '—' })}</span>
            </p>
          )}
          {revisarExencion && (
            <div data-testid="edit-tax-exencion-revisar" role="status" className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-[12px] text-amber-900 dark:text-amber-200">
              <p className="mb-2">{t('ventasDiseno:clients.editTaxData.exencionARevisar')}</p>
              <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t('ventasDiseno:clients.editTaxData.entendido')}</Button></div>
            </div>
          )}

          <div>
            <label htmlFor="edit-tax-business-name" className={labelClass}>{t('ventasDiseno:clients.createModal.businessName')} *</label>
            <input id="edit-tax-business-name" type="text" value={businessName} onChange={e => setBusinessName(e.target.value)} className={inputClass} />
          </div>
          <ReceptorTipoSelect id="edit-receptor-tipo" value={receptorTipo} onChange={setReceptorTipo} permitirConsumidorFinal={canMarkConsumidorFinal} valorOriginal={subClient.receptor_tipo ?? '01'} />

          {receptorTipo === '01' && <>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <label htmlFor="edit-tax-id" className={labelClass}>{fiscalIdText(t('ventasDiseno:clients.createModal.taxId'), fiscalId)} *</label>
                <input id="edit-tax-id" type="text" value={taxId} onChange={e => setTaxId(e.target.value)} className={inputClass} />
              </div>
              {fiscalId.uses_dv && <div className="w-20 shrink-0">
                <label htmlFor="edit-tax-dv" className={labelClass}>{t('ventasDiseno:clients.createModal.taxIdDv')}</label>
                <input
                  id="edit-tax-dv" type="text" inputMode="numeric" value={taxIdDv}
                  onChange={e => setTaxIdDv(e.target.value.replace(/\D/g, '').slice(0, fiscalId.dv_max_length))} className={inputClass}
                />
              </div>}
            </div>

            <TaxIdValidator
              taxId={taxId} taxIdDv={taxIdDv} businessName={businessName}
              onApply={({ dv, nombre }) => {
                if (dv !== null) setTaxIdDv(dv)
                if (nombre !== null) setBusinessName(nombre)
              }}
            />
          </>}

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button disabled={!valido || mutation.isPending} onClick={() => { setError(null); mutation.mutate() }}>
            {mutation.isPending ? t('ventasDiseno:clients.editTaxData.guardando') : t('ventasDiseno:clients.editTaxData.guardar')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
