import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LegacyDocumentoFicha } from '@/components/legacy/LegacyDocumentoFicha'
import { legacyVistaIcgApi } from '@/api/legacyMigrationApi'
import type { VistaIcgDocumentoEntidad } from '@/types/legacyMigration'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'

interface Props {
  entidad: VistaIcgDocumentoEntidad
  // SCRUM-840 — Albaranes de Compra se vincula por Proveedor, no por Cliente; el resto de las
  // entidades no pasa esta prop y sigue mostrando "Cliente" (default).
  ownerLabel?: string
}

// "Vista ICG" (SCRUM-749, 2026-09-03) — pestaña genérica para Cotizaciones/Pedidos/Albaranes/
// Facturas/Albaranes de Compra dentro de VistaIcgPage.tsx. A diferencia de
// SubClientIcgHistoryModal.tsx (scoped por Subcliente), esta lista es global — filtro de fecha +
// búsqueda por folio/cliente(o proveedor), en vez de partir de un cliente puntual. Reusa
// LegacyDocumentoFicha para el detalle (mismo shape exacto que ya devuelve el backend para la
// pestaña scoped).
export function LegacyDocumentoTabPanel({ entidad, ownerLabel = 'Cliente' }: Props) {
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [q, setQ] = useState('')
  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).
  const qTerm = useDebouncedSearchTerm(q)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['vista-icg-documento', entidad, fechaDesde, fechaHasta, qTerm, page],
    queryFn:  () => legacyVistaIcgApi.documentos.list(entidad, {
      fecha_desde: fechaDesde || undefined,
      fecha_hasta: fechaHasta || undefined,
      q: qTerm || undefined,
      page,
    }),
    enabled: selectedId === null,
  })

  const { data: document, isLoading: isLoadingDocument } = useQuery({
    queryKey: ['vista-icg-documento-show', entidad, selectedId],
    queryFn:  () => legacyVistaIcgApi.documentos.show(entidad, selectedId as number),
    enabled:  selectedId !== null,
  })

  const inputClass = 'rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500'

  if (selectedId !== null) {
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Detalle</h2>
          <Button variant="secondary" onClick={() => setSelectedId(null)}>Volver a la lista</Button>
        </div>
        <LegacyDocumentoFicha isLoading={isLoadingDocument} header={document?.header ?? null} items={document?.items ?? null} />
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Listado</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1) }}
            placeholder={`Buscar por ${ownerLabel.toLowerCase()} o folio…`}
            className={`${inputClass} w-52`}
            aria-label="Buscar"
          />
          <input
            type="date"
            value={fechaDesde}
            onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
            className={inputClass}
            aria-label="Fecha desde"
          />
          <input
            type="date"
            value={fechaHasta}
            onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
            className={inputClass}
            aria-label="Fecha hasta"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 py-6 text-center">Cargando...</p>
      ) : (data?.data.length ?? 0) === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">Sin registros para este filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2">Número</th>
                <th className="px-3 py-2">{ownerLabel}</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map(row => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="px-3 py-2 text-xs font-mono font-semibold">{row.numero}</td>
                  <td className="px-3 py-2 text-xs">{row.cliente ?? row.proveedor ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{row.fecha ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-xs font-mono">
                    {row.total != null ? `$${Number(row.total).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.estado ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.last_page > 1 && (
        <div className="flex items-center justify-between mt-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-[12px] text-slate-500">Página {data.current_page} de {data.last_page} ({data.total.toLocaleString()} filas)</span>
          <Button variant="secondary" disabled={page >= data.last_page} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
        </div>
      )}
    </Card>
  )
}
