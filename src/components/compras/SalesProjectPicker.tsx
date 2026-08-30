import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { comprasApi } from '@/api/comprasApi'
import type { ApprovedProject } from '@/types/compras'

interface Props {
  projectId:    number | null
  projectLabel: string | null
  onChange:     (projectId: number | null, projectLabel: string | null) => void
  // Copy del botón "sin seleccionar" — por defecto el de Nueva Orden ("Ninguno (stock)": una
  // línea sin proyecto queda como stock genérico, ahí es opcional). Otros callers donde el
  // proyecto es obligatorio (ej. GenerateRequestModal, REQ-184) deben pasar un texto propio —
  // ese mismo copy en un contexto "requerido" sugeriría erróneamente que dejarlo en blanco está bien.
  emptyLabel?:  string
}

/**
 * REQ-133 — buscador restringido a Pedidos Aprobados, extraído a componente compartido en
 * SCRUM-247 (ADR-SCRUM245, REQ-184): el Excel de requerimientos marca la falta de este picker
 * como la 5ta repetición del mismo bug (REQ-118/179/180 en OrderLinesEditor, ahora
 * ReplacementRequestsPage) — NUNCA `prompt()` nativo, siempre este buscador. Antes vivía inline
 * en OrderLinesEditor::LineRow.
 */
export default function SalesProjectPicker({ projectId, projectLabel, onChange, emptyLabel }: Props) {
  const { t } = useTranslation(['common', 'compras'])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const { data: results } = useQuery({
    queryKey: ['compras/approved-projects/picker', search],
    queryFn:  () => comprasApi.approvedProjects.search(search),
    enabled:  open,
  })

  const pick = (p: ApprovedProject) => {
    onChange(p.sales_project_id, p.project_name)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="relative inline-block">
      {projectId !== null ? (
        <button
          type="button"
          className="text-xs text-primary underline"
          onClick={() => onChange(null, null)}
        >
          {projectLabel}
        </button>
      ) : (
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-slate-700"
          onClick={() => setOpen(v => !v)}
        >
          {emptyLabel ?? t('compras:newOrder.lines.projectNone')}
        </button>
      )}
      {open && (
        <div className="absolute z-10 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-2">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('compras:newOrder.lines.projectSearchPlaceholder')}
            className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <ul className="max-h-40 overflow-y-auto divide-y divide-slate-50">
            {(results?.data ?? []).map(p => (
              <li key={p.sales_project_id}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 rounded"
                >
                  {p.project_name} {p.folio ? `· ${p.folio}` : ''}
                </button>
              </li>
            ))}
            {results && results.data.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-slate-400">—</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
