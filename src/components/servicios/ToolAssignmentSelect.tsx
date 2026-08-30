import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { serviciosApi } from '@/api/serviciosApi'
import type { Tool, InternalTechnician } from '@/types/servicios'

const BODEGA = 'bodega'

interface Props {
  tool:         Tool
  technicians:  InternalTechnician[]
  canEdit:      boolean
  onChanged:    () => void
}

function valueFor(tool: Tool): string {
  return tool.assigned_to_technician_id !== null ? String(tool.assigned_to_technician_id) : BODEGA
}

// REQ-270 — select inline por unidad. `null` = "En bodega de herramientas". El backend devuelve
// `assigned_since` ya actualizada (RN — nunca se calcula en el cliente). `assigned_to_technician_id`
// (FK crudo) maneja el `value` real del select; `assigned_to` (string ya resuelto por el backend
// — nombre del técnico o "En bodega de herramientas") es lo único que se muestra en modo lectura.
export default function ToolAssignmentSelect({ tool, technicians, canEdit, onChanged }: Props) {
  const { t } = useTranslation('servicios')
  const [value, setValue] = useState<string>(valueFor(tool))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setValue(valueFor(tool)) }, [tool.assigned_to_technician_id])

  const mutation = useMutation({
    mutationFn: (technicianId: number | null) => serviciosApi.tools.reassign(tool.id, technicianId),
    onSuccess: () => {
      setError(null)
      onChanged()
    },
    onError: () => {
      setValue(valueFor(tool))
      setError(t('tools.table.assignmentChangeError'))
    },
  })

  if (!canEdit) {
    return <span className="text-slate-700 dark:text-slate-200">{tool.assigned_to}</span>
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    setError(null)
    setValue(next)
    mutation.mutate(next === BODEGA ? null : Number(next))
  }

  return (
    <div>
      <select
        aria-label={t('tools.table.columns.assignedTo')}
        value={value}
        disabled={mutation.isPending}
        onChange={handleChange}
        className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <option value={BODEGA}>{t('tools.table.bodega')}</option>
        {technicians.map(tech => (
          <option key={tech.id} value={tech.id}>{tech.nombre}</option>
        ))}
      </select>
      {error && <p className="text-red-600 text-[11px] mt-1 max-w-[160px]">{error}</p>}
    </div>
  )
}
