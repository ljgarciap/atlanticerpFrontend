import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FichaField } from '@/components/ui/FichaField'
import { legacyVistaIcgApi } from '@/api/legacyMigrationApi'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'

// "Vista ICG" (SCRUM-749, 2026-09-03) — pestaña "Clientes" (legacy.clientes) dentro de
// VistaIcgPage.tsx. Lista global con búsqueda por nombre/CIF; ficha con contactos (legacy.
// contactos_cliente) en vez de líneas de documento.
export function ClientesTabPanel() {
  const [q, setQ] = useState('')
  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).
  const qTerm = useDebouncedSearchTerm(q)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['vista-icg-clientes', qTerm, page],
    queryFn:  () => legacyVistaIcgApi.clientes.list({ q: qTerm || undefined, page }),
    enabled:  selectedId === null,
  })

  const { data: detail, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['vista-icg-clientes-show', selectedId],
    queryFn:  () => legacyVistaIcgApi.clientes.show(selectedId as number),
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
              <FichaField label="Código ICG" value={header.icg_codcliente} />
              <FichaField label="Nombre comercial" value={header.nombre_comercial} />
              <FichaField label="Razón social" value={header.razon_social} />
              <FichaField label="CIF" value={header.cif} />
              <FichaField label="Dirección" value={header.direccion} />
              <FichaField label="Población" value={header.poblacion} />
              <FichaField label="Provincia" value={header.provincia} />
              <FichaField label="País" value={header.pais} />
              <FichaField label="Teléfono 1" value={header.telefono1} />
              <FichaField label="Teléfono 2" value={header.telefono2} />
              <FichaField label="Móvil" value={header.mobil} />
              <FichaField label="Email" value={header.email} />
              <FichaField label="Vendedor (código ICG)" value={header.icg_codvendedor} />
              <FichaField label="Estado de matching" value={header.match_status} />
              <FichaField label="Bloqueado" value={header.bloqueado ? 'Sí' : 'No'} />
            </div>

            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Contactos</div>
              {detail && detail.contactos.length === 0 ? (
                <p className="text-xs text-slate-400">Sin contactos</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 dark:border-slate-700">
                      <th className="py-1.5 pr-2">Nombre</th>
                      <th className="py-1.5 pr-2">Cargo</th>
                      <th className="py-1.5 pr-2">Teléfono</th>
                      <th className="py-1.5 pr-2">Móvil</th>
                      <th className="py-1.5 pr-2">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail?.contactos.map((c, idx) => (
                      <tr key={idx} className="border-b border-slate-50 dark:border-slate-800">
                        <td className="py-1.5 pr-2">{c.nombre}</td>
                        <td className="py-1.5 pr-2">{c.cargo ?? '—'}</td>
                        <td className="py-1.5 pr-2">{c.telefono ?? '—'}</td>
                        <td className="py-1.5 pr-2">{c.mobil ?? '—'}</td>
                        <td className="py-1.5 pr-2">{c.email ?? '—'}</td>
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
          placeholder="Buscar por nombre o CIF…"
          className={`${inputClass} w-56`}
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
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">CIF</th>
                <th className="px-3 py-2">Matching</th>
                <th className="px-3 py-2">Bloqueado</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map(row => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  onClick={() => setSelectedId(row.id)}
                >
                  <td className="px-3 py-2 text-xs font-semibold">{row.nombre_comercial ?? row.razon_social}</td>
                  <td className="px-3 py-2 text-xs font-mono">{row.cif ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{row.match_status}</td>
                  <td className="px-3 py-2 text-xs">{row.bloqueado ? 'Sí' : 'No'}</td>
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
