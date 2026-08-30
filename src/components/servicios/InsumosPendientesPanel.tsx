import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoBox } from '@/components/icons'
import type { HomeInsumosPendientes, HomeInsumoPendienteProducto } from '@/types/servicios'

interface Props {
  data:         HomeInsumosPendientes | undefined
  onViewTicket: (ticketId: number) => void
}

// Preventivo (Pre-QA 2026-08-13) — `llegada_estimada` es siempre `null` hoy (ver
// HomeService::insumosPendientes(), sin fuente real de ETA todavía), así que este branch es
// inalcanzable en este batch. Se blinda igual contra el mismo off-by-one ya encontrado en Grupo D
// parte 1 (ToolTable.tsx): si el backend algún día manda una fecha pura "YYYY-MM-DD",
// `new Date(iso)` la interpreta como medianoche UTC y `.toLocaleDateString()` la muestra un día
// ANTES en zonas horarias negativas (America/Panama, UTC-5) — se arma la fecha desde sus
// componentes en vez de parsear el string ISO, para quedar anclada a la zona local.
function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString()
}

// `descripcion` es el nombre más específico disponible; sin ella caemos a marca+referencia, y
// si tampoco hay nada de eso (snapshot incompleto) mostramos '—' en vez de una fila en blanco.
function formatProducto(producto: HomeInsumoPendienteProducto): string {
  if (producto.descripcion) return producto.descripcion
  const parts = [producto.marca, producto.referencia].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

// REQ-213 (Grupo C, SCRUM-276) — panel "Insumos y herramientas pendientes" de Inicio. RN2 —
// `llegada_estimada` en null se muestra SIEMPRE como "Por confirmar", nunca una fecha inventada
// del lado del frontend. RN4 (mismo criterio que los otros paneles de conteo de Inicio): el badge
// usa `data.count`, nunca `items.length`.
export default function InsumosPendientesPanel({ data, onViewTicket }: Props) {
  const { t }  = useTranslation('servicios')
  const items  = data?.items ?? []
  const count  = data?.count ?? 0

  return (
    <Card variant="panel" className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <IcoBox size={16} className="text-slate-400" />
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{t('home.insumosPendientes.title')}</h2>
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold">
            {count}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{t('home.insumosPendientes.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="pb-2 pr-2">{t('home.insumosPendientes.columns.repuesto')}</th>
                <th className="pb-2 pr-2">{t('home.insumosPendientes.columns.ticket')}</th>
                <th className="pb-2 pr-2">{t('home.insumosPendientes.columns.solicitado')}</th>
                <th className="pb-2 pr-2">{t('home.insumosPendientes.columns.llegadaEstimada')}</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.ticket_id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-2 pr-2 text-slate-800 dark:text-slate-100">{formatProducto(item.producto)}</td>
                  <td className="py-2 pr-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    #{item.numero} — {item.cliente}
                  </td>
                  <td className="py-2 pr-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {t('home.insumosPendientes.solicitadoHaceDias', { count: item.solicitado_hace_dias })}
                  </td>
                  <td className="py-2 pr-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {item.llegada_estimada ? formatDate(item.llegada_estimada) : t('home.insumosPendientes.llegadaPorConfirmar')}
                  </td>
                  <td className="py-2 text-right">
                    <Button variant="secondary" className="!px-2.5 !py-1 !text-xs" onClick={() => onViewTicket(item.ticket_id)}>
                      {t('home.insumosPendientes.viewTicket')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
