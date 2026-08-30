import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { REQUIREMENT_KEYS } from '@/types/servicios'
import type { RequirementsPayload } from '@/types/servicios'
import { IcoCheck, IcoClose, IcoPlus } from '@/components/icons'

interface Props {
  value:    RequirementsPayload
  onChange: (value: RequirementsPayload) => void
}

// REQ-247 RN1/RN6 — checklist fijo de 18 requerimientos especiales (ninguno obligatorio) + "+
// Agregar otro" para texto libre repetible. Compartido entre el formulario de Nuevo ticket y la
// edición global (TicketDetailModal) — mismo dato estructurado en ambos lados desde Batch 3
// parte 2 (antes era un textarea libre en la edición).
export default function RequirementsChecklist({ value, onChange }: Props) {
  const { t } = useTranslation('servicios')
  const [addingOther, setAddingOther] = useState(false)
  const [otherDraft, setOtherDraft]   = useState('')

  function toggleCatalogKey(key: string) {
    const active = value.catalog.includes(key)
    onChange({
      ...value,
      catalog: active ? value.catalog.filter(k => k !== key) : [...value.catalog, key],
    })
  }

  function confirmOther() {
    const texto = otherDraft.trim()
    if (texto !== '') {
      onChange({ ...value, otros: [...value.otros, texto] })
    }
    setOtherDraft('')
    setAddingOther(false)
  }

  function removeOther(idx: number) {
    onChange({ ...value, otros: value.otros.filter((_, i) => i !== idx) })
  }

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="requirements-checklist">
      {REQUIREMENT_KEYS.map(key => {
        const active = value.catalog.includes(key)
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggleCatalogKey(key)}
            data-testid={`requirement-chip-${key}`}
            className={[
              'inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-full border transition-colors',
              active
                ? 'bg-primary border-primary text-white'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
            ].join(' ')}
          >
            {active && <IcoCheck size={11} />}
            {t(`tickets.requirements.catalog.${key}`)}
          </button>
        )
      })}

      {value.otros.map((otro, idx) => (
        <span
          key={`${otro}-${idx}`}
          data-testid={`requirement-other-${idx}`}
          className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-full border bg-primary border-primary text-white"
        >
          <IcoCheck size={11} />
          {otro}
          <button
            type="button"
            onClick={() => removeOther(idx)}
            aria-label={t('tickets.requirements.removeOther')}
            className="ml-0.5 opacity-80 hover:opacity-100"
          >
            <IcoClose size={11} />
          </button>
        </span>
      ))}

      {addingOther ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={otherDraft}
            onChange={e => setOtherDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); confirmOther() }
              if (e.key === 'Escape') { setAddingOther(false); setOtherDraft('') }
            }}
            onBlur={confirmOther}
            placeholder={t('tickets.requirements.otherPlaceholder')}
            className="text-[12px] px-2.5 py-1.5 rounded-full border border-slate-200 dark:border-slate-600 dark:bg-slate-900 w-48"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAddingOther(true)}
          data-testid="requirement-add-other"
          className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <IcoPlus size={11} />
          {t('tickets.requirements.addOther')}
        </button>
      )}
    </div>
  )
}
