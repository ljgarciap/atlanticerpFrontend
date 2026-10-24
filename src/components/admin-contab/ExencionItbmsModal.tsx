import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { adminContabApi } from '@/api/adminContabApi'
import type { FiscalDirectoryRow } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

/**
 * SCRUM-1166 — marcar o quitar la exención de ITBMS de un cliente fiscal. Marcar exige el documento que la respalda (número de resolución o ley);
 * quitarla pide confirmar. El servidor decide quién puede (permiso `admin_contab.edit.client_itbms_exemption`) y actualiza los borradores del cliente.
 */
export default function ExencionItbmsModal({ cliente, onClose }: { cliente: FiscalDirectoryRow; onClose: () => void }) {
  const { t } = useTranslation(['adminContab'])
  const qc = useQueryClient()
  const k = 'adminContab:clientesFiscal.exencion'

  const quita = cliente.itbms_exento
  const [documento, setDocumento] = useState(cliente.itbms_exencion_documento ?? '')
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ borradores: number; sinFacturar: number } | null>(null)

  const mutation = useMutation({
    mutationFn: () => adminContabApi.clientesFiscal.setItbmsExemption(cliente.id, quita ? { exento: false } : { exento: true, documento: documento.trim() }),
    onSuccess: r => {
      setResultado({ borradores: r.borradores_actualizados, sinFacturar: r.confirmadas_sin_facturar })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-fiscal-directory'] })
    },
    onError: err => setError((isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined) ?? t(`${k}.error`)),
  })

  const puedeGuardar = quita || documento.trim() !== ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t(`${k}.titulo`)}>
      <Card className="w-full max-w-md p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{quita ? t(`${k}.tituloQuitar`) : t(`${k}.titulo`)}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{cliente.business_name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common:actions.close')} className="text-slate-400 hover:text-slate-600"><IcoClose size={16} /></button>
        </div>

        {resultado !== null ? (
          <div data-testid="exencion-resultado">
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-3">{quita ? t(`${k}.quitada`) : t(`${k}.marcada`)}</p>
            {resultado.borradores > 0 && <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">{t(`${k}.borradores`, { count: resultado.borradores })}</p>}
            {/* Una cotización ya confirmada conserva su marca: si aún no se factura, saldrá como estaba. Se avisa para que la corrija antes de facturar. */}
            {resultado.sinFacturar > 0 && (
              <p role="status" data-testid="exencion-aviso-confirmadas" className="text-xs rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-amber-900 dark:text-amber-200 mb-3">
                {t(quita ? `${k}.avisoConfirmadasQuitar` : `${k}.avisoConfirmadas`, { count: resultado.sinFacturar })}
              </p>
            )}
            <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t(`${k}.cerrar`)}</Button></div>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">{quita ? t(`${k}.ayudaQuitar`) : t(`${k}.ayuda`)}</p>

            {quita ? (
              <p className="text-xs text-slate-500 mb-3">{t(`${k}.documentoActual`)}: <b>{cliente.itbms_exencion_documento ?? '—'}</b></p>
            ) : (
              <label className="block mb-3">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{t(`${k}.documento`)}</span>
                <input
                  id="exencion-documento" value={documento} onChange={e => setDocumento(e.target.value)} maxLength={255} placeholder={t(`${k}.documentoPlaceholder`)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm focus:border-[#5BA5A0] focus:outline-none"
                />
              </label>
            )}

            {error && <p role="alert" className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>{t(`${k}.cancelar`)}</Button>
              <Button variant={quita ? 'secondary' : 'accent'} onClick={() => { setError(null); mutation.mutate() }} disabled={!puedeGuardar} loading={mutation.isPending}>
                {quita ? t(`${k}.quitar`) : t(`${k}.marcar`)}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
