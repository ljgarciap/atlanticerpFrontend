import { IcoClock } from '@/components/icons'

interface Props {
  title:       string
  description: string
}

// Placeholder compartido por las 4 pantallas principales de Servicios que todavía no tienen
// contenido real en este batch (Inicio, Técnicos internos/externos, Insumos y Herramientas,
// Reportes) — mismo criterio visual que VentasPage/InventarioPage/etc (nunca emoji, ver SCRUM-56).
export default function ComingSoonPanel({ title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: '#E3F0EE' }}>
        <IcoClock size={28} className="text-primary" />
      </div>
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">{title}</h1>
      <p className="text-slate-400 text-sm max-w-xs">{description}</p>
    </div>
  )
}
