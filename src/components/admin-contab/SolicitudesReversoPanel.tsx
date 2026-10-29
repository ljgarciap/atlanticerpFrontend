import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { useReversalRequests, useDecideReversal } from '@/hooks/useAdminContab'
import { useAuthStore } from '@/store/authStore'
import { usePermission } from '@/hooks/usePermission'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatDateShort } from '@/utils/dates'
import { getRegion } from '@/lib/region'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(getRegion().locale, { style: 'currency', currency: getRegion().currency }).format(value)
}

/**
 * SCRUM-1168 F4 — solicitudes de anulación de cobros pendientes de decisión. Las ven quienes manejan Cobros; solo Gerencia (y superadmin) pueden aprobar o
 * rechazar, y el servidor lo exige igual. Aprobar ejecuta la anulación (reversa aplicaciones, saca el dinero de caja, descuenta comisión ya liquidada);
 * rechazar exige un motivo. No se muestra nada si no hay solicitudes pendientes.
 */
export default function SolicitudesReversoPanel() {
  const { t } = useTranslation('adminContab')
  const user = useAuthStore(s => s.user)
  const esSuperadmin = usePermission('superadmin.all')
  const puedeDecidir = esSuperadmin || user?.flags?.primary_approver === true

  const { data } = useReversalRequests({ estado: 'solicitada', per_page: 50 })
  const decideMutation = useDecideReversal()

  const [decidiendo, setDecidiendo] = useState<{ id: number; aprobar: boolean; tipo: string } | null>(null)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)

  const rows = data?.rows ?? []
  if (rows.length === 0 && resultado === null) return null

  function confirmar() {
    if (!decidiendo) return
    setError(null)
    decideMutation.mutate({ id: decidiendo.id, aprobar: decidiendo.aprobar, motivoRechazo: decidiendo.aprobar ? undefined : motivoRechazo.trim() }, {
      onSuccess: r => {
        const descuentos = r.ajustes_comision ?? []
        setResultado(decidiendo.aprobar
          ? (decidiendo.tipo === 'devolucion' ? t('solicitudesReverso.aprobadaDevolucion') : decidiendo.tipo === 'reverso_compensacion' ? t('solicitudesReverso.aprobadaReverso') : t('solicitudesReverso.aprobada')) + (descuentos.length > 0 ? ' ' + t('solicitudesReverso.descuentoComision', { monto: formatCurrency(descuentos.reduce((a, d) => a + d.monto, 0)) }) : '')
          : t('solicitudesReverso.rechazada'))
        setDecidiendo(null)
        setMotivoRechazo('')
      },
      onError: err => setError((isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined) ?? t('solicitudesReverso.error')),
    })
  }

  return (
    <Card variant="panel" className="p-4 mt-4" data-testid="solicitudes-reverso">
      <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('solicitudesReverso.titulo')}</h2>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">{puedeDecidir ? t('solicitudesReverso.ayudaAprobador') : t('solicitudesReverso.ayudaOtros')}</p>

      {resultado && <p role="status" data-testid="solicitud-resultado" className="text-sm text-emerald-700 dark:text-emerald-300 mb-2">{resultado}</p>}
      {error && <p role="alert" className="text-sm text-red-600 mb-2">{error}</p>}

      <div className="flex flex-col gap-2">
        {rows.map(r => (
          <div key={r.id} className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2 text-sm" data-testid={`solicitud-${r.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {r.tipo === 'devolucion' ? t('solicitudesReverso.devolver') : r.tipo === 'reverso_compensacion' ? t('solicitudesReverso.reversarCruce') : t('solicitudesReverso.anular', { recibo: r.numero_recibo ?? `#${r.payment_id}` })}
                </span>
                <span className="text-slate-500"> · {r.cliente}</span>
                {r.monto != null && <span className="text-slate-500"> · {formatCurrency(r.monto)}</span>}
                <div className="text-[11px] text-slate-500">{t('solicitudesReverso.detalle', { quien: r.solicitada_por ?? '—', fecha: r.created_at ? formatDateShort(r.created_at) : '—' })}</div>
                <div className="text-xs text-slate-700 dark:text-slate-300">{t('solicitudesReverso.motivo')}: {r.motivo}</div>
                {r.tipo === 'devolucion' && (
                  <div className="text-xs text-slate-700 dark:text-slate-300">
                    {t('solicitudesReverso.referencia')}: {r.referencia ?? '—'}
                    {r.comprobante_url && <> · <a href={r.comprobante_url} target="_blank" rel="noreferrer" className="text-primary-dark hover:underline">{t('solicitudesReverso.verComprobante')}</a></>}
                  </div>
                )}
              </div>
              {puedeDecidir && decidiendo?.id !== r.id && (
                <div className="flex gap-2">
                  <Button variant="accent" onClick={() => { setDecidiendo({ id: r.id, aprobar: true, tipo: r.tipo }); setResultado(null) }}>{t('solicitudesReverso.aprobar')}</Button>
                  <Button variant="secondary" onClick={() => { setDecidiendo({ id: r.id, aprobar: false, tipo: r.tipo }); setResultado(null) }}>{t('solicitudesReverso.rechazar')}</Button>
                </div>
              )}
            </div>
            {puedeDecidir && decidiendo?.id === r.id && (
              <div className="mt-2 border-t border-slate-200 dark:border-slate-600 pt-2" data-testid="solicitud-confirmar">
                {decidiendo.aprobar ? (
                  <p className="text-xs mb-2">{r.tipo === 'devolucion' ? t('solicitudesReverso.confirmarAprobarDevolucion') : t('solicitudesReverso.confirmarAprobar')}</p>
                ) : (
                  <textarea
                    value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} rows={2} placeholder={t('solicitudesReverso.motivoRechazo')}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm mb-2"
                  />
                )}
                <div className="flex gap-2">
                  <Button variant="accent" onClick={confirmar} loading={decideMutation.isPending} disabled={!decidiendo.aprobar && motivoRechazo.trim() === ''}>
                    {decidiendo.aprobar ? t('solicitudesReverso.confirmarSi') : t('solicitudesReverso.rechazar')}
                  </Button>
                  <Button variant="secondary" onClick={() => { setDecidiendo(null); setMotivoRechazo('') }}>{t('solicitudesReverso.cancelar')}</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
