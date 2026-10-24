import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FichaField } from '@/components/ui/FichaField'
import { legacyVistaIcgApi } from '@/api/legacyMigrationApi'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'

// "Vista ICG" (SCRUM-749, 2026-09-03) — pestaña "Productos" (legacy.productos, solo activos —
// ver docblock del modelo Producto) dentro de VistaIcgPage.tsx. Ficha con 2 tablas propias
// (precios por tarifa + costos por proveedor) en vez de la tabla de líneas genérica de
// Cotizaciones/Pedidos/Albaranes.
export function ProductosTabPanel() {
  const [q, setQ] = useState('')
  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).
  const qTerm = useDebouncedSearchTerm(q)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['vista-icg-productos', qTerm, page],
    queryFn:  () => legacyVistaIcgApi.productos.list({ q: qTerm || undefined, page }),
    enabled:  selectedId === null,
  })

  const { data: detail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['vista-icg-productos-show', selectedId],
    queryFn:  () => legacyVistaIcgApi.productos.show(selectedId as number),
    enabled:  selectedId !== null,
  })

  const inputClass = 'rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500'

  if (selectedId !== null) {
    const header = detail?.header
    return (
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Detalle</h2>
          <Button variant="secondary" onClick={() => setSelectedId(null)}>Volver a la lista</Button>
        </div>
        {isLoadingDetail || !header ? (
          <p className="text-slate-400 text-sm">Cargando...</p>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <FichaField label="Código ICG" value={header.icg_codarticulo} />
              <FichaField label="Descripción" value={header.descripcion} />
              <FichaField label="Marca (código ICG)" value={header.marca_nombre} />
              <FichaField label="Familia (código ICG)" value={header.familia_nombre} />
              <FichaField label="Referencia de fabricante" value={header.ref_proveedor} />
              <FichaField label="Vinculado a catálogo AtlanticERP" value={header.catalog_product_id ? `#${header.catalog_product_id}` : 'No'} />
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Precios por tarifa</div>
              {detail && detail.precios.length === 0 ? (
                <p className="text-xs text-slate-400">Sin precios</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-700">
                      <th className="py-1.5 pr-2">Tarifa</th>
                      <th className="py-1.5 pr-2 text-right">Precio neto</th>
                      <th className="py-1.5 pr-2 text-right">Precio bruto</th>
                      <th className="py-1.5 pr-2 text-right">Descuento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail?.precios.map((p, idx) => (
                      <tr key={idx} className="border-b border-slate-50 dark:border-slate-800">
                        <td className="py-1.5 pr-2">{p.price_type ?? `tarifa ${p.idtarifav}`}</td>
                        <td className="py-1.5 pr-2 text-right">${p.precio_neto.toLocaleString()}</td>
                        <td className="py-1.5 pr-2 text-right">{p.precio_bruto != null ? `$${p.precio_bruto.toLocaleString()}` : '—'}</td>
                        <td className="py-1.5 pr-2 text-right">{p.descuento != null ? `${p.descuento}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Costos por proveedor</div>
              {detail && detail.costos.length === 0 ? (
                <p className="text-xs text-slate-400">Sin costos</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-700">
                      <th className="py-1.5 pr-2">Proveedor (código ICG)</th>
                      <th className="py-1.5 pr-2 text-right">Costo neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail?.costos.map((c, idx) => (
                      <tr key={idx} className="border-b border-slate-50 dark:border-slate-800">
                        <td className="py-1.5 pr-2">{c.codproveedor}</td>
                        <td className="py-1.5 pr-2 text-right">${c.costo_neto.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Listado</h2>
        <input
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1) }}
          placeholder="Buscar por descripción, marca o código…"
          className={`${inputClass} w-64`}
          aria-label="Buscar"
        />
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
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2">Marca</th>
                <th className="px-3 py-2">Familia</th>
                <th className="px-3 py-2">Catálogo AtlanticERP</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map(row => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="px-3 py-2 text-xs font-semibold">{row.descripcion}</td>
                  <td className="px-3 py-2 text-xs">{row.marca_nombre ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{row.familia_nombre ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{row.catalog_product_id ? `#${row.catalog_product_id}` : '—'}</td>
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
