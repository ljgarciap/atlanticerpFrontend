import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { IcoAlertTriangle, IcoCheck } from '@/components/icons'
import { useStockSyncStatus, useUpdateStockSyncSettings } from '@/hooks/useLegacyMigration'
import type { StockSyncDivergencia, StockSyncRun, StockSyncSettingsInput, SyncRunStatus } from '@/types/legacyMigration'

// SCRUM-1114 (épica SCRUM-749) — ajustes y estado de la sincronización de stock de ICG (AL4) por delta,
// mientras ICG y AtlanticERP operan en paralelo. Gate role:superadmin (misma pantalla de Migración).
// Ningún umbral vive en el código: el interruptor, los 3 topes del circuit breaker y los correos de alerta
// se editan acá y se aplican sin deploy.

const STATUS_LABEL: Record<SyncRunStatus, string> = {
  success: 'éxito', partial: 'parcial', failed: 'falló', held_for_review: 'retenida',
}
const STATUS_STYLE: Record<SyncRunStatus, string> = {
  success: 'text-teal-700 bg-teal-50 dark:text-teal-400 dark:bg-teal-900/20',
  partial: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
  failed: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
  held_for_review: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' })
}

function errorMessage(err: unknown): string {
  const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
  const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  return firstFieldError ?? data?.message ?? 'No se pudieron guardar los ajustes.'
}

// Acepta la coma decimal ("12,5"): quien escribe en español la usa y no debe quedarse sin saber por qué no guarda.
function toNumber(raw: string): number {
  return Number(raw.trim().replace(',', '.'))
}

const fmt = (n: number): string => n.toLocaleString('es-PA')

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function parseEmails(raw: string): string[] {
  return raw.split(/[\n,;]+/).map(e => e.trim()).filter(e => e !== '')
}

// AtlanticERP manda: la diferencia con ICG no se corrige sola, solo se muestra para que se vea cuánto se aleja AtlanticERP de ICG.
// Cada diferencia se contrasta con el kardex propio de AtlanticERP: "explicada" si es igual a la suma de sus movimientos.
function DivergenciaAtlanticERP({ d }: { d: StockSyncDivergencia }) {
  if (d.total === 0) {
    return <p className="mt-3 text-xs text-teal-700 dark:text-teal-400" data-testid="stock-sync-sin-divergencia">Bodega Central de AtlanticERP coincide con ICG en todos los productos.</p>
  }
  return (
    <div className="mt-3 border-t border-slate-200 dark:border-slate-600 pt-3" data-testid="stock-sync-divergencia">
      <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">AtlanticERP difiere de ICG en {fmt(d.total)} producto(s)</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
        AtlanticERP tiene más en {fmt(d.atlanticerp_con_mas)} (+{fmt(d.unidades_mas)} u.) y menos en {fmt(d.atlanticerp_con_menos)} ({fmt(d.unidades_menos)} u.).
        AtlanticERP es la fuente de verdad: no se corrige, solo se informa.
      </p>
      <ul className="text-xs text-slate-500 dark:text-slate-400 mb-2 list-disc pl-4">
        <li>{fmt(d.explicados_por_kardex)} se explican por el kardex de AtlanticERP (la suma de sus movimientos iguala la diferencia).</li>
        <li>{fmt(d.con_residuo)} tienen movimientos de AtlanticERP que no alcanzan a explicarla.</li>
        <li>{fmt(d.sin_movimientos)} no tienen ningún movimiento de kardex de AtlanticERP (origen desconocido).</li>
        <li className="font-medium text-slate-700 dark:text-slate-200">{fmt(d.unidades_sin_explicar)} unidades quedan sin explicar.</li>
      </ul>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <th className="py-1 pr-3">Artículo ICG</th>
            <th className="py-1 pr-3 text-right">ICG</th>
            <th className="py-1 pr-3 text-right">AtlanticERP</th>
            <th className="py-1 pr-3 text-right">Diferencia</th>
            <th className="py-1 pr-3 text-right">Kardex de AtlanticERP</th>
            <th className="py-1 text-right">Sin explicar</th>
          </tr>
        </thead>
        <tbody>
          {d.mayores.slice(0, 10).map(m => (
            <tr key={m.catalog_product_id} className="border-t border-slate-100 dark:border-slate-700">
              <td className="py-1 pr-3 font-mono">{m.icg_codarticulo}</td>
              <td className="py-1 pr-3 text-right">{fmt(m.icg)}</td>
              <td className="py-1 pr-3 text-right">{fmt(m.atlanticerp)}</td>
              <td className="py-1 pr-3 text-right font-medium">{m.diferencia > 0 ? '+' : ''}{fmt(m.diferencia)}</td>
              <td className="py-1 pr-3 text-right">{m.con_movimientos_atlanticerp ? fmt(m.kardex_atlanticerp) : 'sin movimientos'}</td>
              <td className="py-1 text-right font-medium">{m.sin_explicar > 0 ? '+' : ''}{fmt(m.sin_explicar)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.total > 10 && <p className="mt-1 text-[11px] text-slate-400">Se muestran los 10 con más unidades sin explicar.</p>}
    </div>
  )
}

function LastRunSummary({ run }: { run: StockSyncRun }) {
  const r = run.resumen
  if (!r) return null
  const rows: Array<[string, string]> = []
  if (r.unidades_positivas !== undefined) rows.push(['Unidades que entraron en ICG', `+${fmt(r.unidades_positivas)}`])
  if (r.unidades_negativas !== undefined) rows.push(['Unidades que salieron en ICG', fmt(r.unidades_negativas)])
  if (r.desde_cero) rows.push(['Productos que parten de 0 (sin stock en AtlanticERP)', fmt(r.desde_cero)])
  if (r.retenidos) rows.push(['Retenidos (sin base y con stock en AtlanticERP)', fmt(r.retenidos)])
  if (r.aplicado) rows.push(['Quedaron en negativo', fmt(r.aplicado.negativos)])
  if (r.no_cuadran !== undefined) rows.push(['No cuadran (desglose por bodega vs stock total)', fmt(r.no_cuadran)])

  return (
    <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-700/40 p-3.5">
      <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">Informe de la última corrida</p>
      {r.circuit_breaker && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5 mb-2">
          <IcoAlertTriangle size={12} className="shrink-0 mt-0.5" />
          Retenida por el circuit breaker: {r.circuit_breaker}. No se aplicó nada.
        </p>
      )}
      {r.error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{r.error}</p>}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
            <dd className="font-medium text-slate-700 dark:text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>
      {r.divergencia_atlanticerp && <DivergenciaAtlanticERP d={r.divergencia_atlanticerp} />}
    </div>
  )
}

export default function StockSyncPanel() {
  const { data, isLoading } = useStockSyncStatus()
  const mutation = useUpdateStockSyncSettings()

  const [activo, setActivo] = useState(false)
  const [pct, setPct] = useState('')
  const [porProducto, setPorProducto] = useState('')
  const [total, setTotal] = useState('')
  const [minFilas, setMinFilas] = useState('')
  const [horasApagado, setHorasApagado] = useState('')
  const [correos, setCorreos] = useState('')
  const [error, setError] = useState<string | null>(null)

  const settings = data?.settings

  useEffect(() => {
    if (!settings) return
    setActivo(settings.activo)
    setPct(String(settings.max_productos_con_delta_pct))
    setPorProducto(String(settings.max_unidades_abs_por_producto))
    setTotal(String(settings.max_unidades_abs_total))
    setMinFilas(String(settings.min_filas_icg_pct))
    setHorasApagado(String(settings.horas_aviso_apagado))
    setCorreos(settings.correos_alerta.join('\n'))
  }, [settings])

  if (isLoading || !settings) {
    return <Card className="p-5"><p className="text-sm text-slate-400 py-6 text-center">Cargando...</p></Card>
  }

  const pctN = toNumber(pct)
  const porProductoN = toNumber(porProducto)
  const totalN = toNumber(total)
  const minFilasN = toNumber(minFilas)
  const horasN = toNumber(horasApagado)
  const emails = parseEmails(correos)

  // Mismos topes que el backend (StockSyncSettingsRequest): un umbral sin techo real dejaría el circuit breaker sin
  // efecto. Cada campo inválido muestra su propio mensaje: un botón deshabilitado sin explicación no dice qué corregir.
  const errores: Partial<Record<'pct' | 'porProducto' | 'total' | 'minFilas' | 'horas' | 'correos', string>> = {}
  if (pct.trim() === '' || Number.isNaN(pctN) || pctN < 0 || pctN > 50) errores.pct = 'Debe ser un número entre 0 y 50.'
  if (!Number.isInteger(porProductoN) || porProductoN < 1 || porProductoN > 50000) errores.porProducto = 'Debe ser un entero entre 1 y 50.000.'
  if (!Number.isInteger(totalN) || totalN < 1 || totalN > 500000) errores.total = 'Debe ser un entero entre 1 y 500.000.'
  if (minFilas.trim() === '' || Number.isNaN(minFilasN) || minFilasN < 1 || minFilasN > 100) errores.minFilas = 'Debe ser un número entre 1 y 100.'
  if (!Number.isInteger(horasN) || horasN < 1 || horasN > 720) errores.horas = 'Debe ser un entero entre 1 y 720.'
  const malos = emails.filter(e => !EMAIL_RE.test(e))
  if (emails.length > 20) errores.correos = 'Máximo 20 correos.'
  else if (malos.length > 0) errores.correos = `Correo inválido: ${malos[0]}`
  else if (new Set(emails.map(e => e.toLowerCase())).size !== emails.length) errores.correos = 'Hay correos repetidos.'
  const invalid = Object.keys(errores).length > 0

  const cambios = {
    activo: activo !== settings.activo,
    max_productos_con_delta_pct: pctN !== settings.max_productos_con_delta_pct,
    max_unidades_abs_por_producto: porProductoN !== settings.max_unidades_abs_por_producto,
    max_unidades_abs_total: totalN !== settings.max_unidades_abs_total,
    min_filas_icg_pct: minFilasN !== settings.min_filas_icg_pct,
    horas_aviso_apagado: horasN !== settings.horas_aviso_apagado,
    correos_alerta: emails.join('|') !== settings.correos_alerta.join('|'),
  }
  const dirty = Object.values(cambios).some(Boolean)

  const sinBase = settings.baseline_inicializada_at === null
  const inputClass = 'w-full rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500'

  // Solo se envía lo que cambió: un guardado no debe pisar un campo que otro superadmin acaba de editar.
  const save = () => {
    setError(null)
    const payload: StockSyncSettingsInput = {}
    if (cambios.activo) payload.activo = activo
    if (cambios.max_productos_con_delta_pct) payload.max_productos_con_delta_pct = pctN
    if (cambios.max_unidades_abs_por_producto) payload.max_unidades_abs_por_producto = porProductoN
    if (cambios.max_unidades_abs_total) payload.max_unidades_abs_total = totalN
    if (cambios.min_filas_icg_pct) payload.min_filas_icg_pct = minFilasN
    if (cambios.horas_aviso_apagado) payload.horas_aviso_apagado = horasN
    if (cambios.correos_alerta) payload.correos_alerta = emails
    mutation.mutate(payload, { onError: err => setError(errorMessage(err)) })
  }

  const ultima = data?.ultimas_corridas[0]

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sincronización de stock (AL4)</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          AtlanticERP es la fuente de verdad: de ICG solo se suma la variación de AL4 desde la última lectura (entradas y salidas).
        </p>
      </div>

      {sinBase ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5 mb-4" data-testid="stock-sync-sin-base">
          <IcoAlertTriangle size={12} className="shrink-0 mt-0.5" />
          La línea base de stock no está inicializada: la sincronización no puede correr. Ejecute legacy:init-stock-baseline en el servidor.
        </p>
      ) : (
        <p className="text-xs text-teal-700 dark:text-teal-400 flex items-center gap-1.5 mb-4">
          <IcoCheck size={12} className="shrink-0" />
          Línea base inicializada el {fmtDate(settings.baseline_inicializada_at as string)}
        </p>
      )}

      <div className="flex items-center gap-3 mb-4">
        <Toggle checked={activo} onChange={setActivo} disabled={sinBase && !settings.activo} label="Corridas programadas activas" />
        <span className="text-sm text-slate-700 dark:text-slate-200">Corridas programadas {activo ? 'activas' : 'apagadas'}</span>
        <span className="text-[11px] text-slate-400">(una corrida manual supervisada corre aunque esté apagado)</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Máx. % de productos con delta
          <input aria-label="Máx. % de productos con delta" aria-invalid={!!errores.pct} className={inputClass} inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} />
          {errores.pct && <span className="block mt-0.5 text-[11px] text-red-600 dark:text-red-400">{errores.pct}</span>}
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Máx. unidades por producto
          <input aria-label="Máx. unidades por producto" aria-invalid={!!errores.porProducto} className={inputClass} inputMode="numeric" value={porProducto} onChange={e => setPorProducto(e.target.value)} />
          {errores.porProducto && <span className="block mt-0.5 text-[11px] text-red-600 dark:text-red-400">{errores.porProducto}</span>}
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Máx. unidades absolutas en total
          <input aria-label="Máx. unidades absolutas en total" aria-invalid={!!errores.total} className={inputClass} inputMode="numeric" value={total} onChange={e => setTotal(e.target.value)} />
          {errores.total && <span className="block mt-0.5 text-[11px] text-red-600 dark:text-red-400">{errores.total}</span>}
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Mín. % de filas de ICG vs la última corrida buena
          <input aria-label="Mín. % de filas de ICG" aria-invalid={!!errores.minFilas} className={inputClass} inputMode="decimal" value={minFilas} onChange={e => setMinFilas(e.target.value)} />
          {errores.minFilas && <span className="block mt-0.5 text-[11px] text-red-600 dark:text-red-400">{errores.minFilas}</span>}
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Horas apagado antes de avisar (producción)
          <input aria-label="Horas apagado antes de avisar" aria-invalid={!!errores.horas} className={inputClass} inputMode="numeric" value={horasApagado} onChange={e => setHorasApagado(e.target.value)} />
          {errores.horas && <span className="block mt-0.5 text-[11px] text-red-600 dark:text-red-400">{errores.horas}</span>}
        </label>
      </div>

      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-3">
        Correos adicionales de alerta (uno por línea; los superadmins siempre reciben el aviso)
        <textarea aria-label="Correos adicionales de alerta" aria-invalid={!!errores.correos} className={`${inputClass} mt-0.5`} rows={3} value={correos} onChange={e => setCorreos(e.target.value)} />
        {errores.correos && <span className="block mt-0.5 text-[11px] text-red-600 dark:text-red-400">{errores.correos}</span>}
      </label>

      {invalid && <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Corrija los campos marcados para poder guardar.</p>}
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={save} disabled={!dirty || invalid || mutation.isPending}>Guardar ajustes</Button>
      </div>

      {data && data.ultimas_corridas.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Origen</th>
                <th className="px-3 py-2 text-right">Con delta</th>
                <th className="px-3 py-2 text-right">Aplicados</th>
                <th className="px-3 py-2 text-right">Errores</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.ultimas_corridas.map(run => (
                <tr key={run.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(run.started_at)}</td>
                  <td className="px-3 py-2 text-xs">{run.origen === 'manual' ? 'manual' : 'programada'}</td>
                  <td className="px-3 py-2 text-right text-xs">{fmt(run.con_delta)}</td>
                  <td className="px-3 py-2 text-right text-xs">{fmt(run.aplicados)}</td>
                  <td className="px-3 py-2 text-right text-xs">{fmt(run.errores)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[run.status]}`}>{STATUS_LABEL[run.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ultima && <LastRunSummary run={ultima} />}
    </Card>
  )
}
