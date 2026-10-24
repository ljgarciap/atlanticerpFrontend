interface Props {
  label:   string
  value:   string | number | null | undefined
  hidden?: boolean
}

// Par label/valor reutilizable para vistas tipo "ficha" (cabecera de un documento de solo
// lectura) — nace de la vista "gemela" de Historial ICG (SCRUM-749, 2026-09-02), pensado para
// reusarse en cualquier otra ficha de detalle del proyecto.
export function FichaField({ label, value, hidden = false }: Props) {
  if (hidden) return null

  return (
    <div>
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-slate-800 dark:text-slate-100">{value ?? '—'}</div>
    </div>
  )
}
