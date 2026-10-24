import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FichaField } from '@/components/ui/FichaField'
import { IcoAlertTriangle, IcoClose } from '@/components/icons'
import { useLegacyPagos } from '@/hooks/useLegacyMigration'
import type { PagoRow } from '@/types/legacyMigration'

// SCRUM-827 (épica SCRUM-749 — Migración ICG→AtlanticERP) — extraído de LegacyPagosPage.tsx (2026-09-03)
// para reusarse también como pestaña "Pagos" dentro de VistaIcgPage.tsx, sin duplicar la lista +
// ficha. Comportamiento idéntico al original — LegacyPagosPage.tsx ahora es un wrapper delgado
// alrededor de este componente.
//
// Los códigos crudos de ICG (estado/icg_origen/icg_tipodocumento) se muestran TAL CUAL, nunca
// traducidos — las hipótesis de abajo vienen del comentario de investigación de Luis en el
// ticket (2026-09-02), basadas en patrones de datos reales, explícitamente sin confirmar contra
// documentación oficial de ICG. Se muestran como nota, no como label definitivo.

const ESTADO_HIPOTESIS: Record<string, string> = {
  S: 'hipótesis: Saldado',
  P: 'hipótesis: Pendiente',
  C: 'hipótesis: Cancelado',
  X: 'hipótesis: Anulado/excepción',
}

const ORIGEN_HIPOTESIS: Record<string, string> = {
  C: 'hipótesis: Cobro',
  E: 'hipótesis: Efectos (letras/pagarés)',
  P: 'hipótesis: Pago',
}

const TIPO_DOCUMENTO_HIPOTESIS: Record<string, string> = {
  F: 'hipótesis: Factura',
  A: 'hipótesis: Albarán',
  E: 'hipótesis: Efectos',
  P: 'hipótesis: Pago',
}

// Fecha centinela absurda encontrada en los datos reales (9202-04-02) — ICG parece usarla en vez
// de NULL. Se muestra tal cual (nunca se oculta un dato real), con una nota aparte.
const SENTINEL_YEAR_THRESHOLD = 3000

function isSentinelDate(iso: string | null): boolean {
  if (iso === null) return false
  const year = Number(iso.slice(0, 4))
  return Number.isFinite(year) && year >= SENTINEL_YEAR_THRESHOLD
}

function fmtFecha(iso: string | null): string {
  if (iso === null) return '—'
  return iso
}

export function PagosTabPanel() {
  const [estado, setEstado] = useState('')
  const [origen, setOrigen] = useState('')
  const [tipoDocumento, setTipoDocumento] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')
  const [page, setPage] = useState(1)
  const [selectedPago, setSelectedPago] = useState<PagoRow | null>(null)

  const { data, isLoading } = useLegacyPagos({
    estado: estado || undefined,
    icg_origen: origen || undefined,
    icg_tipodocumento: tipoDocumento || undefined,
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    page,
  })

  const selectClass = 'rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500'
  const dateInputClass = selectClass

  return (
    <>
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-3.5">
        <IcoAlertTriangle size={16} className="shrink-0 text-amber-500 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Los códigos <span className="font-mono">estado</span>/<span className="font-mono">icg_origen</span>/
          <span className="font-mono">icg_tipodocumento</span> se muestran crudos, tal como vienen de ICG.
          Las hipótesis de significado (tooltip) están basadas en patrones de los datos reales, NO confirmadas
          contra documentación oficial de ICG — no asumir que son definitivas. Algunas fechas contienen valores
          centinela absurdos (ej. año 9202) que ICG parece usar en vez de NULL.
        </p>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Listado</h2>
            <p className="text-xs text-slate-400 mt-0.5">145k+ filas reales — paginado y filtrado desde el backend</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={fechaDesde}
              onChange={e => { setFechaDesde(e.target.value); setPage(1) }}
              className={dateInputClass}
              aria-label="Fecha desde"
            />
            <input
              type="date"
              value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setPage(1) }}
              className={dateInputClass}
              aria-label="Fecha hasta"
            />
            <select value={estado} onChange={e => { setEstado(e.target.value); setPage(1) }} className={selectClass} aria-label="Estado">
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_HIPOTESIS).map(([code, label]) => (
                <option key={code} value={code}>{code} — {label}</option>
              ))}
            </select>
            <select value={origen} onChange={e => { setOrigen(e.target.value); setPage(1) }} className={selectClass} aria-label="Origen">
              <option value="">Todos los orígenes</option>
              {Object.entries(ORIGEN_HIPOTESIS).map(([code, label]) => (
                <option key={code} value={code}>{code} — {label}</option>
              ))}
            </select>
            <select value={tipoDocumento} onChange={e => { setTipoDocumento(e.target.value); setPage(1) }} className={selectClass} aria-label="Tipo de documento">
              <option value="">Todos los tipos</option>
              {Object.entries(TIPO_DOCUMENTO_HIPOTESIS).map(([code, label]) => (
                <option key={code} value={code}>{code} — {label}</option>
              ))}
            </select>
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
                  <th className="px-3 py-2">Fecha doc.</th>
                  <th className="px-3 py-2">Origen</th>
                  <th className="px-3 py-2">Tipo doc.</th>
                  <th className="px-3 py-2">Referencia</th>
                  <th className="px-3 py-2 text-right">Importe</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Vencimiento</th>
                  <th className="px-3 py-2">Saldado</th>
                </tr>
              </thead>
              <tbody>
                {data?.data.map(row => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    onClick={() => setSelectedPago(row)}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtFecha(row.fecha_documento)}</td>
                    <td className="px-3 py-2 text-xs" title={ORIGEN_HIPOTESIS[row.icg_origen] ?? 'sin hipótesis'}>{row.icg_origen}</td>
                    <td className="px-3 py-2 text-xs" title={TIPO_DOCUMENTO_HIPOTESIS[row.icg_tipodocumento] ?? 'sin hipótesis'}>{row.icg_tipodocumento}</td>
                    <td className="px-3 py-2 text-xs font-mono">{row.icg_serie}-{row.icg_numero}-{row.icg_n}/{row.icg_posicion}</td>
                    <td className="px-3 py-2 text-right text-xs font-mono">{row.importe}</td>
                    <td className="px-3 py-2 text-xs" title={row.estado ? (ESTADO_HIPOTESIS[row.estado] ?? 'sin hipótesis') : undefined}>{row.estado ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtFecha(row.fecha_vencimiento)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {fmtFecha(row.fecha_saldado)}
                      {isSentinelDate(row.fecha_saldado) && (
                        <span title="Fecha centinela de ICG, no representa una fecha real">
                          <IcoAlertTriangle size={11} className="inline ml-1 text-amber-500" />
                        </span>
                      )}
                    </td>
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

      {selectedPago && (
        <PagoFichaModal
          pago={selectedPago}
          onClose={() => setSelectedPago(null)}
          estadoHipotesis={ESTADO_HIPOTESIS}
          origenHipotesis={ORIGEN_HIPOTESIS}
          tipoDocumentoHipotesis={TIPO_DOCUMENTO_HIPOTESIS}
        />
      )}
    </>
  )
}

// Vista "gemela" tipo ficha (cabecera, sin líneas — TESORERIA es un movimiento contable, no un
// documento con ítems) al hacer click en una fila — a pedido de Luis 2026-09-02, mismo criterio
// que la ficha de Historial ICG (SubClientIcgHistoryModal): sin referencia visual real de ICG,
// layout estándar de ERP-POS. No pide datos nuevos al backend — la fila ya trae todos los campos.
interface PagoFichaModalProps {
  pago: PagoRow
  onClose: () => void
  estadoHipotesis: Record<string, string>
  origenHipotesis: Record<string, string>
  tipoDocumentoHipotesis: Record<string, string>
}

function PagoFichaModal({ pago, onClose, estadoHipotesis, origenHipotesis, tipoDocumentoHipotesis }: PagoFichaModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-lg my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {pago.icg_serie}-{pago.icg_numero}-{pago.icg_n}/{pago.icg_posicion}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div data-testid="pago-ficha" className="overflow-y-auto px-5 py-4 flex-1 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          <FichaField label="Fecha del documento" value={fmtFecha(pago.fecha_documento)} />
          <FichaField label="Fecha de vencimiento" value={fmtFecha(pago.fecha_vencimiento)} />
          <FichaField label="Origen" value={`${pago.icg_origen} — ${origenHipotesis[pago.icg_origen] ?? 'sin hipótesis'}`} />
          <FichaField label="Tipo de documento" value={`${pago.icg_tipodocumento} — ${tipoDocumentoHipotesis[pago.icg_tipodocumento] ?? 'sin hipótesis'}`} />
          <FichaField label="Importe" value={`$${Number(pago.importe).toLocaleString()}`} />
          <FichaField
            label="Estado"
            value={pago.estado ? `${pago.estado} — ${estadoHipotesis[pago.estado] ?? 'sin hipótesis'}` : '—'}
          />
          <FichaField label="Forma de pago (código ICG)" value={pago.icg_codformapago} />
          <FichaField label="Fecha de saldado" value={fmtFecha(pago.fecha_saldado)} />
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </Card>
    </div>
  )
}
