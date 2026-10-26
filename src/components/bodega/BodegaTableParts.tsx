/** Piezas de presentación compartidas por las pantallas de Bodega (extraídas de `BodegasPage.tsx` en SCRUM-990 para que
 * otra tabla las reuse sin duplicarlas). Mismo markup y comportamiento que tenían inline. */

export function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  )
}

export function KpiCard({ label, value, sublabel, color }: { label: string; value: string; sublabel?: string; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: `${color}18` }}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold leading-none" style={{ color }}>{value}</div>
      {sublabel && <div className="text-[11px] text-slate-400 mt-1">{sublabel}</div>}
    </div>
  )
}
