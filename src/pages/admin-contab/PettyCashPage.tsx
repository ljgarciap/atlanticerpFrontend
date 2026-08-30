import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePettyCashSummary, usePettyCashPending, usePettyCashReports, usePettyCashRejected } from '@/hooks/useAdminContab'
import type { PettyCashEstadoLinea } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoBook, IcoClock, IcoFileText, IcoBan, IcoPlus } from '@/components/icons'
import RegistrarGastoCajaChicaModal from '@/components/admin-contab/RegistrarGastoCajaChicaModal'
import GenerarReportePettyCashModal from '@/components/admin-contab/GenerarReportePettyCashModal'
import DetalleReportePettyCashModal from '@/components/admin-contab/DetalleReportePettyCashModal'
import DetalleLineaCajaChicaModal from '@/components/admin-contab/DetalleLineaCajaChicaModal'

type Tab = 'pendientes' | 'reportes' | 'rechazados'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

const ESTADO_PILL_CLASS: Record<PettyCashEstadoLinea, string> = {
  pendiente: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  rechazado_temporal: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  reabierto: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  // Estado terminal (>= 2 rechazos) — más sólido/oscuro que rechazado_temporal a propósito, para
  // distinguirlo visualmente si algún día se renderiza junto al resto (hoy la pestaña Rechazados
  // no lo necesita, la ubicación ya lo comunica).
  rechazado_permanente: 'bg-red-600 text-white dark:bg-red-700 dark:text-red-50',
}

/**
 * Batch 20 de Admin&Cont (SCRUM-612→617, REQ-535→540) — Caja Chica. Batch 21 (SCRUM-618→623,
 * REQ-541→546) agrega rechazo/reapertura de líneas — pestaña "Rechazados" real, modal unificado
 * de detalle de línea (REQ-545) abierto desde cualquiera de las 3 pestañas.
 */
export default function PettyCashPage() {
  const { t } = useTranslation('adminContab')
  const [tab, setTab] = useState<Tab>('pendientes')
  const [nuevoGastoOpen, setNuevoGastoOpen] = useState(false)
  const [generarReporteOpen, setGenerarReporteOpen] = useState(false)
  const [selectedReporte, setSelectedReporte] = useState<string | null>(null)
  const [selectedLinea, setSelectedLinea] = useState<number | null>(null)

  const { data: summary } = usePettyCashSummary()

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <IcoBook size={20} className="text-slate-500 dark:text-slate-400" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('cajaChica.title')}</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('cajaChica.subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setNuevoGastoOpen(true)}>
            <IcoPlus size={13} className="inline -mt-0.5 mr-1" /> {t('cajaChica.nuevoGasto')}
          </Button>
          <Button
            onClick={() => setGenerarReporteOpen(true)}
            disabled={!summary || summary.pendientes_count === 0}
          >
            {t('cajaChica.generarReporte')}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-5 mb-4">
        <TabButton
          active={tab === 'pendientes'} onClick={() => setTab('pendientes')}
          icon={<IcoClock size={16} />} label={t('cajaChica.tabs.pendientes')}
          sub={t('cajaChica.tabs.pendientesSub', { count: summary?.pendientes_count ?? 0 })}
        />
        <TabButton
          active={tab === 'reportes'} onClick={() => setTab('reportes')}
          icon={<IcoFileText size={16} />} label={t('cajaChica.tabs.reportes')}
          sub={summary && summary.reportes_sin_aprobar_count > 0
            ? t('cajaChica.tabs.reportesSubSinAprobar', { count: summary.reportes_count, sinAprobar: summary.reportes_sin_aprobar_count })
            : t('cajaChica.tabs.reportesSub', { count: summary?.reportes_count ?? 0 })}
        />
        <TabButton
          active={tab === 'rechazados'} onClick={() => setTab('rechazados')}
          icon={<IcoBan size={16} />} label={t('cajaChica.tabs.rechazados')}
          sub={t('cajaChica.tabs.rechazadosSub', { count: summary?.rechazados_count ?? 0 })}
        />
      </div>

      <Card variant="panel" className="p-4">
        {tab === 'pendientes' && <PendientesPanel t={t} onSelectLinea={setSelectedLinea} />}
        {tab === 'reportes' && <ReportesPanel t={t} onSelect={setSelectedReporte} />}
        {tab === 'rechazados' && <RechazadosPanel t={t} onSelectLinea={setSelectedLinea} />}
      </Card>

      {nuevoGastoOpen && (
        <RegistrarGastoCajaChicaModal onClose={() => setNuevoGastoOpen(false)} onSaved={() => setNuevoGastoOpen(false)} />
      )}
      {generarReporteOpen && (
        <GenerarReportePettyCashModal
          onClose={() => setGenerarReporteOpen(false)}
          onGenerated={(numero) => { setGenerarReporteOpen(false); setTab('reportes'); setSelectedReporte(numero) }}
        />
      )}
      {selectedReporte !== null && (
        <DetalleReportePettyCashModal
          numero={selectedReporte}
          onClose={() => setSelectedReporte(null)}
          onSelectLinea={setSelectedLinea}
          // REQ-541 RN4 — el reporte deja de existir como "pendiente" tras un rechazo completo o
          // al perder su última línea; volvemos a Pendientes en vez de reabrir este detalle.
          onDisuelto={() => { setSelectedReporte(null); setTab('pendientes') }}
        />
      )}
      {selectedLinea !== null && (
        <DetalleLineaCajaChicaModal expenseId={selectedLinea} onClose={() => setSelectedLinea(null)} />
      )}
    </div>
  )
}

function TabButton(
  { active, onClick, icon, label, sub }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; sub: string },
) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
        active ? 'border-primary bg-primary-soft' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-md ${active ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
        {icon}
      </span>
      <span>
        <div className={`text-xs font-semibold ${active ? 'text-primary-dark' : 'text-slate-700 dark:text-slate-200'}`}>{label}</div>
        <div className="text-[10.5px] text-slate-400">{sub}</div>
      </span>
    </button>
  )
}

function PendientesPanel(
  { t, onSelectLinea }: { t: (key: string, opts?: Record<string, unknown>) => string; onSelectLinea: (id: number) => void },
) {
  const { data, isFetching } = usePettyCashPending()

  if (!data) return <p className="text-xs text-slate-400 text-center py-8">{isFetching ? '…' : null}</p>

  if (data.grupos.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-8">{t('cajaChica.pendientesPanel.vacio')}</p>
  }

  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-3">{t('cajaChica.pendientesPanel.subtitle')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.fecha')}</th>
              <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.proveedor')}</th>
              <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.descripcion')}</th>
              <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.montoBruto')}</th>
              <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.itbms')}</th>
              <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.total')}</th>
              <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.estado')}</th>
              <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.soporte')}</th>
            </tr>
          </thead>
          <tbody>
            {data.grupos.map(g => (
              <Fragment key={g.solicitante_id}>
                <tr>
                  <td colSpan={8} className="pt-3 pb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{g.solicitante_nombre}</td>
                </tr>
                {g.lineas.map(l => (
                  <tr
                    key={l.id} onClick={() => onSelectLinea(l.id)}
                    className="border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{l.fecha}</td>
                    <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{l.proveedor}</td>
                    <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{l.descripcion}</td>
                    <td className="py-2 pr-3">{formatCurrency(l.monto_bruto)}</td>
                    <td className="py-2 pr-3">{formatCurrency(l.itbms)}</td>
                    <td className="py-2 pr-3 font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(l.total)}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ${ESTADO_PILL_CLASS[l.estado]}`}>
                        {t(`cajaChica.estados.${l.estado}`)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-400">{t('cajaChica.pendientesPanel.verSoportes', { count: l.attachments.length })}</td>
                  </tr>
                ))}
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <td colSpan={5} className="py-1.5 pr-3 text-[11px] text-slate-500 dark:text-slate-400">
                    {t('cajaChica.pendientesPanel.subtotal', { solicitante: g.solicitante_nombre })}
                  </td>
                  <td className="py-1.5 pr-3 font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(g.subtotal)}</td>
                  <td colSpan={2} />
                </tr>
              </Fragment>
            ))}
            <tr>
              <td colSpan={5} className="pt-2 text-sm font-bold text-slate-700 dark:text-slate-200">{t('cajaChica.pendientesPanel.totalGeneral')}</td>
              <td className="pt-2 text-sm font-bold text-slate-900 dark:text-slate-100">{formatCurrency(data.total_general)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-slate-400 mt-4">{t('cajaChica.pendientesPanel.footnote')}</p>
    </div>
  )
}

function ReportesPanel(
  { t, onSelect }: { t: (key: string, opts?: Record<string, unknown>) => string; onSelect: (numero: string) => void },
) {
  const { data, isFetching } = usePettyCashReports()

  if (!data) return <p className="text-xs text-slate-400 text-center py-8">{isFetching ? '…' : null}</p>
  if (data.length === 0) return <p className="text-xs text-slate-400 text-center py-8">{t('cajaChica.reportesPanel.vacio')}</p>

  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-3">{t('cajaChica.reportesPanel.subtitle')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <th className="py-2 pr-3">{t('cajaChica.reportesPanel.columnas.numero')}</th>
              <th className="py-2 pr-3">{t('cajaChica.reportesPanel.columnas.fechaCreacion')}</th>
              <th className="py-2 pr-3">{t('cajaChica.reportesPanel.columnas.total')}</th>
              <th className="py-2 pr-3">{t('cajaChica.reportesPanel.columnas.estado')}</th>
              <th className="py-2 pr-3">{t('cajaChica.reportesPanel.columnas.realizadoPor')}</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.numero} className="border-b border-slate-50 dark:border-slate-800">
                <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{r.numero}</td>
                <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{r.fecha_creacion}</td>
                <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">{formatCurrency(r.total)}</td>
                <td className="py-2 pr-3">
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ${
                    r.estado === 'finalizado' ? 'bg-primary-soft text-primary-dark'
                      : r.estado === 'rechazado' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  }`}>
                    {t(`cajaChica.estadosReporte.${r.estado}`)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{r.realizado_por_nombre}</td>
                <td className="py-2 pr-3">
                  <button type="button" onClick={() => onSelect(r.numero)} className="text-primary-dark hover:underline">
                    {t('cajaChica.reportesPanel.ver')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** REQ-543 — líneas que llegaron exactamente a 2 rechazos, con acceso al detalle completo (motivo
 *  de cada intento, botón Reabrir) vía el modal unificado. */
function RechazadosPanel(
  { t, onSelectLinea }: { t: (key: string, opts?: Record<string, unknown>) => string; onSelectLinea: (id: number) => void },
) {
  const { data, isFetching } = usePettyCashRejected()

  if (!data) return <p className="text-xs text-slate-400 text-center py-8">{isFetching ? '…' : null}</p>

  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-3">{t('cajaChica.rechazadosPanel.subtitle')}</p>
      {data.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-8">{t('cajaChica.rechazadosPanel.vacio')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.fecha')}</th>
                <th className="py-2 pr-3">{t('cajaChica.rechazadosPanel.columnas.solicitante')}</th>
                <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.proveedor')}</th>
                <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.descripcion')}</th>
                <th className="py-2 pr-3">{t('cajaChica.pendientesPanel.columnas.total')}</th>
                <th className="py-2 pr-3">{t('cajaChica.rechazadosPanel.columnas.intentos')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map(l => (
                <tr
                  key={l.id} onClick={() => onSelectLinea(l.id)}
                  className="border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{l.fecha}</td>
                  <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{l.solicitante_nombre}</td>
                  <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{l.proveedor}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{l.descripcion}</td>
                  <td className="py-2 pr-3 font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(l.total)}</td>
                  <td className="py-2 pr-3">{l.intentos_rechazo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
