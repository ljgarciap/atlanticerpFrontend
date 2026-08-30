import { useTranslation } from 'react-i18next'
import { useSetItbmsRateActive } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { IcoClose } from '@/components/icons'
import type { ItbmsRate } from '@/types/adminContab'

interface Props {
  rate: ItbmsRate
  editable: boolean
  onClose: () => void
}

/** REQ-559 — detalle de una tasa de ITBMS. RN1: el interruptor solo es funcional en modo edición.
 *  RN2: el cambio se refleja de inmediato en el modal y en la tabla principal, sin cerrar el modal
 *  — la invalidación de `useSetItbmsRateActive` ya actualiza la tabla; acá basta con no cerrar. */
export default function ItbmsRateDetailModal({ rate, editable, onClose }: Props) {
  const { t } = useTranslation(['common', 'adminContab'])
  const setActive = useSetItbmsRateActive()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('adminContab:fiscal.itbms.detailTitle')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common:actions.close')}>
            <IcoClose />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t('adminContab:fiscal.itbms.fields.nombre')}
            </span>
            <span className="text-sm text-slate-800 dark:text-slate-100">{rate.nombre ?? rate.descripcion}</span>
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t('adminContab:fiscal.itbms.fields.descripcion')}
            </span>
            <span className="text-sm text-slate-800 dark:text-slate-100">{rate.descripcion}</span>
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t('adminContab:fiscal.itbms.fields.porcentaje')}
            </span>
            <span className="text-sm text-slate-800 dark:text-slate-100">{rate.porcentaje}%</span>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {rate.activa ? t('adminContab:fiscal.itbms.status.active') : t('adminContab:fiscal.itbms.status.inactive')}
            </span>
            <Toggle
              checked={rate.activa}
              disabled={!editable}
              onChange={(activa) => setActive.mutate({ id: rate.id, activa })}
              label={t('adminContab:fiscal.itbms.toggleActive')}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
