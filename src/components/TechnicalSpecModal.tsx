import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'
import type { TechnicalSpec } from '@/types/compras'
import { useTechnicalSpecRows } from '@/hooks/useTechnicalSpecFields'

/**
 * SCRUM-425/426 (REQ-355/356) — "Ver ficha técnica" es el mismo dato y el mismo modal en
 * Compras (`InventarioPage.tsx`) y en Bodega (`BodegaInventarioPage.tsx`): los campos técnicos
 * de solo lectura del producto, sin precio/costo. Fase 9c: los campos y sus etiquetas salen del catálogo por empresa. Extraído acá para no duplicar la implementación
 * entre los 2 módulos (hallazgo de QA 2026-07-27, qa.qa — el botón faltaba en Bodega).
 *
 * Sin dependencia de un namespace de i18n fijo a propósito: cada módulo resuelve sus propios
 * textos con su propio namespace (`compras:...` / `bodega:...`) y se los pasa ya traducidos —
 * mismo criterio que el resto del código evita mezclar namespaces entre módulos.
 */
interface TechnicalSpecModalProps {
  reference:  string
  spec:       TechnicalSpec | null | undefined
  title:      string
  emptyText:  string
  closeLabel: string
  onClose:    () => void
}

export function TechnicalSpecModal({ reference, spec, title, emptyText, closeLabel, onClose }: TechnicalSpecModalProps) {
  const rows = useTechnicalSpecRows(spec)
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <Card variant="modal" className="w-full max-w-md max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{reference}</h2>
            <p className="text-xs text-slate-400">{title}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IcoClose />
          </button>
        </div>

        {rows.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {rows.map(row => (
              <div key={row.key}>
                <div className="text-[10px] uppercase text-slate-400 font-bold">{row.label}</div>
                <div className="text-slate-700">{row.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-6 text-center">{emptyText}</p>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>{closeLabel}</Button>
        </div>
      </Card>
    </div>
  )
}
