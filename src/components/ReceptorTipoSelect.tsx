import { useTranslation } from 'react-i18next'
import type { ReceptorTipo } from '@/types/ventasDiseno'

/**
 * SCRUM-1003 — "Tipo de cliente ante la DGI" de un SubCliente. Selector EXPLÍCITO (decisión de Luis, sin inferirlo de la
 * categoría "WalkIn" ni decidirlo por documento): Contribuyente (default) o Consumidor Final. Gobierno y Extranjero quedan
 * fuera de alcance. Con Consumidor Final el formulario oculta RUC y DV.
 *
 * Decisión de Luis (2026-09-30): PASAR un cliente a Consumidor Final exige el permiso angosto de Gerencia y Contabilidad
 * (`permitirConsumidorFinal`); sin él, la opción aparece deshabilitada con la razón. Un cliente que ya es Consumidor Final
 * conserva su opción: se compara contra el valor ORIGINAL guardado (`valorOriginal`), no contra el que se está tecleando, para que
 * quien lo pasa a Contribuyente en el modal pueda arrepentirse sin cancelar.
 */
export default function ReceptorTipoSelect(
  { value, onChange, id, permitirConsumidorFinal, valorOriginal = '01' }:
  { value: ReceptorTipo; onChange: (v: ReceptorTipo) => void; id: string; permitirConsumidorFinal: boolean; valorOriginal?: ReceptorTipo },
) {
  const { t } = useTranslation('ventasDiseno')
  const k = 'clients.receptorTipo'

  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
        {t(`${k}.label`)}
      </label>
      <select
        id={id} value={value} onChange={e => onChange(e.target.value as ReceptorTipo)}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-[#5BA5A0] focus:outline-none"
      >
        <option value="01">{t(`${k}.contribuyente`)}</option>
        <option value="02" disabled={!permitirConsumidorFinal && valorOriginal !== '02'}>{t(`${k}.consumidorFinal`)}</option>
      </select>
      {!permitirConsumidorFinal && valorOriginal !== '02' && (
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t(`${k}.soloMarkFelix`)}</p>
      )}
      {value === '02' && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t(`${k}.consumidorFinalAyuda`)}</p>}
    </div>
  )
}
