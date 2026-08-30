import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeactivateBankAccount, useReactivateBankAccount } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoAlertTriangle } from '@/components/icons'
import type { BankAccount } from '@/types/adminContab'

interface Props {
  account: BankAccount
  onClose: () => void
}

/**
 * REQ-532 — detalle de cuenta bancaria: eliminar (si activa) o reactivar (si eliminada). RN2 —
 * eliminar exige confirmación explícita, dejando claro que el historial se conserva y que se
 * puede reactivar. RN1 — el historial de movimientos nunca se borra (mostrado acá vía
 * `movimientos_count`, la tabla de movimientos en sí sigue siendo consultable desde "Eliminadas").
 */
export default function BankAccountDetailModal({ account, onClose }: Props) {
  const { t } = useTranslation(['common', 'adminContab'])
  const deactivate = useDeactivateBankAccount()
  const reactivate = useReactivateBankAccount()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('adminContab:cuentasBancarias.detailTitle')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common:actions.close')}>
            <IcoClose />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <Field label={t('adminContab:cuentasBancarias.fields.banco')} value={account.banco} />
          <Field label={t('adminContab:cuentasBancarias.fields.tipoCuenta')} value={t(`adminContab:cuentasBancarias.tipos.${account.tipo_cuenta}`)} />
          <Field label={t('adminContab:cuentasBancarias.fields.ultimos4')} value={`****${account.ultimos_4_digitos}`} />
          <Field label={t('adminContab:cuentasBancarias.fields.moneda')} value={account.moneda} />
          <Field
            label={t('adminContab:cuentasBancarias.fields.estado')}
            value={account.activa ? t('adminContab:cuentasBancarias.status.active') : t('adminContab:cuentasBancarias.status.inactive')}
          />
          <Field label={t('adminContab:cuentasBancarias.fields.movimientosCount')} value={String(account.movimientos_count)} />
        </div>

        {confirmingDelete && (
          <div className="mb-4 px-3 py-2.5 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20">
            <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300 text-xs mb-2.5">
              <IcoAlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{t('adminContab:cuentasBancarias.confirmDelete')}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>{t('common:actions.cancel')}</Button>
              <Button
                variant="danger" loading={deactivate.isPending}
                onClick={() => deactivate.mutate(account.id, { onSuccess: onClose })}
              >
                {t('adminContab:cuentasBancarias.confirmDeleteButton')}
              </Button>
            </div>
          </div>
        )}

        {(deactivate.isError || reactivate.isError) && (
          <p className="text-xs text-red-500 mb-3">{t('adminContab:cuentasBancarias.actionError')}</p>
        )}

        <div className="flex justify-between items-center">
          {account.activa ? (
            !confirmingDelete && (
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                {t('adminContab:cuentasBancarias.deleteAccount')}
              </Button>
            )
          ) : (
            <Button loading={reactivate.isPending} onClick={() => reactivate.mutate(account.id, { onSuccess: onClose })}>
              {t('adminContab:cuentasBancarias.reactivateAccount')}
            </Button>
          )}
          {!confirmingDelete && <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>}
        </div>
      </Card>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  )
}
