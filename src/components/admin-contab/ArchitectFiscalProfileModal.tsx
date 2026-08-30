import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateArchitectFiscalProfile } from '@/hooks/useAdminContab'
import type { ArchitectCommissionRegimen, ArchitectCommissionRow } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

const REGIMENES: ArchitectCommissionRegimen[] = ['exento', 'con_itbms', 'retencion_50']

interface Props {
  architect: ArchitectCommissionRow
  onClose: () => void
}

/**
 * Batch 16 (SCRUM-587, REQ-510) — los 3 campos son obligatorios en conjunto (RN1): el botón
 * "Guardar" queda deshabilitado hasta completar los 3, mismo criterio que el resto de modales de
 * este módulo (validación en el cliente, el backend igual la repite server-side).
 */
export default function ArchitectFiscalProfileModal({ architect, onClose }: Props) {
  const { t } = useTranslation('adminContab')

  const [empresa, setEmpresa]         = useState(architect.empresa ?? '')
  const [ruc, setRuc]                 = useState(architect.ruc ?? '')
  const [regimen, setRegimen]         = useState<ArchitectCommissionRegimen | ''>(architect.regimen_fiscal ?? '')

  const mutation = useUpdateArchitectFiscalProfile()
  const canSubmit = empresa.trim() !== '' && ruc.trim() !== '' && regimen !== '' && !mutation.isPending

  function handleSubmit() {
    if (!canSubmit) return
    mutation.mutate(
      { architectId: architect.architect_id, data: { empresa: empresa.trim(), ruc: ruc.trim(), regimen_fiscal: regimen } },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-md my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('comisionesExternas.datosFiscales.title')}</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{architect.nombre}</p>
          </div>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('comisionesExternas.datosFiscales.subtitle')}</p>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('comisionesExternas.datosFiscales.empresaLabel')}
            </span>
            <input
              type="text" value={empresa} onChange={e => setEmpresa(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('comisionesExternas.datosFiscales.rucLabel')}
            </span>
            <input
              type="text" value={ruc} onChange={e => setRuc(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
              {t('comisionesExternas.datosFiscales.regimenLabel')}
            </span>
            <select
              value={regimen} onChange={e => setRegimen(e.target.value as ArchitectCommissionRegimen)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">{t('comisionesExternas.datosFiscales.regimenPlaceholder')}</option>
              {REGIMENES.map(r => <option key={r} value={r}>{t(`comisionesExternas.regimenes.${r}`)}</option>)}
            </select>
          </label>

          {mutation.isError && (
            <p className="text-red-600 text-sm">{t('comisionesExternas.datosFiscales.error')}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('comisionesExternas.datosFiscales.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} loading={mutation.isPending}>
            {t('comisionesExternas.datosFiscales.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
