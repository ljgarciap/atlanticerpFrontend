import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { useAuthStore } from '@/store/authStore'
import {
  useCashPositionHeader, useCashPositionProjected, useCashPositionReal, useDailyCashCount,
  useUpdateDailyCashCountEntryObservation, useUpdateDailyCashCountGeneralObservation, useCashPositionExport,
  useCloseDailyCashCount, useDailyCashCountHistory, useDailyCashCountHistoryDetail, useApproveDailyCashCount,
  useExportDailyCashCount, useExportDailyCashCountHistory, useUploadRetentionAttachment,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  IcoTrendingUp, IcoChevronDown, IcoDownload, IcoAlertTriangle, IcoCheck, IcoClock, IcoPaperclip, IcoClose,
} from '@/components/icons'
import type {
  CashFlowExportView, CashFlowProjectedEntrada, CashFlowProjectedSalida, CashPositionWindowDays,
  DailyCashCountMovementType, DailyCashCount,
  DailyCashCountRetencion, DailyCashCountHistoryRow,
} from '@/types/adminContab'
import { formatDateShort, formatTimeShort } from '@/utils/dates'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

function mutationErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

/**
 * Batch 18 (SCRUM-597→601, REQ-520→524) — Arqueo / Flujo de Caja, parte 1. Ver
 * ADR-SCRUM597-601-batch18-arqueo-caja.md (docs/adr en atlanticerp-backend) para el contrato completo y
 * las reconciliaciones spec vs. código. Solo lo que piden estos 5 REQ — nada de Batch 19 (cerrar
 * arqueo, historial de arqueos cerrados, cola de atrasados, constancia de retención).
 *
 * Permisos (§8 del ADR, ver también tabla de rutas): REQ-520/522 (encabezado+toggle) son para los
 * 4 roles del módulo; REQ-521/523 (Proyectado, Real 30/90d) excluyen a Yaneth
 * (`asistente_administrativa`); REQ-524 (Arqueo del día) excluye a Gerencia (`management`). Esta
 * página nunca deja a un rol aterrizar en una combinación sin acceso — para Yaneth el toggle/chips
 * ni se ofrecen (siempre Real+Hoy); para Gerencia, seleccionar Real+Hoy muestra una nota en vez de
 * intentar el fetch (que 403earía).
 */
export default function ArqueoCajaPage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const { user } = useAuthStore()

  const isYaneth        = user?.role === 'asistente_administrativa'
  // Aclarado por Luis 2026-08-25 (Pre-QA Batch 18): REQ-521 le veda a Yaneth el PANEL de detalle
  // (facturas/comisiones línea por línea) y la Vista real 30/90d — no los 3 totales agregados del
  // encabezado, que REQ-520 sí le da. `canProjectedReal` sigue gateando toggle/chips + ambos
  // paneles de detalle + la Vista real; el fetch de `projected` para las tarjetas ya no depende de
  // esta flag (ver abajo).
  const canProjectedReal = !isYaneth
  const canDailyCount    = user?.role === 'superadmin' || user?.role === 'lider_admin_contab' || user?.role === 'asistente_administrativa'
  // REQ-528/529 — el historial (y su "Ver"/"Descargar resumen") es para los 4 roles del módulo,
  // a diferencia del Arqueo del día (`canDailyCount`), que excluye a Mark/Gerencia (`management`).
  const canViewHistorial = canDailyCount || user?.role === 'management'

  const [view, setView]             = useState<'proyectado' | 'real'>(isYaneth ? 'real' : 'proyectado')
  const [windowDays, setWindowDays] = useState<CashPositionWindowDays>(isYaneth ? 0 : 30)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  const isDailyCountView = view === 'real' && windowDays === 0

  const { data: header } = useCashPositionHeader()
  // Pre-QA Batch 18 (SCRUM-597, CRÍTICO) — las 3 tarjetas de encabezado "Entradas/Salidas/Saldo
  // proyectados" (REQ-520 RN2) dependen solo de la ventana elegida, no de qué pestaña (Proyectado/
  // Real) esté activa NI del rol — el backend siempre responde a los 4 roles del módulo, solo que
  // a Yaneth le devuelve entradas/salidas vacíos (ver AdminContCashPositionController::projected()
  // — su detalle sigue vedado por REQ-521, sus totales no).
  const { data: projected, isFetching: isFetchingProjected } = useCashPositionProjected(windowDays)
  const { data: real, isFetching: isFetchingReal } = useCashPositionReal(
    windowDays === 0 ? 30 : windowDays, canProjectedReal && view === 'real' && windowDays !== 0,
  )
  const { data: dailyCount, isFetching: isFetchingDailyCount } = useDailyCashCount(
    canDailyCount && isDailyCountView,
  )

  const updateEntryObservation   = useUpdateDailyCashCountEntryObservation()
  const updateGeneralObservation = useUpdateDailyCashCountGeneralObservation()
  const exportMutation           = useCashPositionExport()

  // Batch 19 (REQ-526/529) — cerrar el arqueo activo y descargar su resumen. `closeMutation`
  // invalida la query del activo (ver useCloseDailyCashCount) — al re-fetchear, `dailyCount` ya
  // trae la siguiente fecha pendiente (REQ-527 RN3), sin lógica extra acá.
  const closeMutation        = useCloseDailyCashCount()
  const exportActiveMutation = useExportDailyCashCount()
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const cards = useMemo(() => ([
    {
      label: t('adminContab:arqueoCaja.cards.saldoHoy'),
      value: header ? formatCurrency(header.saldo_disponible_hoy) : '—',
      sub: header ? t('adminContab:arqueoCaja.cards.saldoHoyBreakdown', {
        bancos: formatCurrency(header.saldo_bancos), cajaMenuda: formatCurrency(header.saldo_caja_menuda),
      }) : undefined,
    },
    {
      label: t('adminContab:arqueoCaja.cards.entradasProyectadas'),
      value: projected ? formatCurrency(projected.total_entradas) : '—',
      sub: windowDays === 0 ? t('adminContab:arqueoCaja.cards.hoy') : t('adminContab:arqueoCaja.cards.proximosDias', { dias: windowDays }),
    },
    {
      label: t('adminContab:arqueoCaja.cards.salidasProyectadas'),
      value: projected ? formatCurrency(projected.total_salidas) : '—',
    },
    {
      label: t('adminContab:arqueoCaja.cards.saldoProyectado'),
      value: header && projected ? formatCurrency(header.saldo_disponible_hoy + projected.neto) : '—',
      sub: windowDays === 0 ? t('adminContab:arqueoCaja.cards.aHoy') : t('adminContab:arqueoCaja.cards.aDias', { dias: windowDays }),
    },
  ]), [t, header, projected, windowDays])

  const showExport = !isDailyCountView

  function handleExport(format: 'pdf' | 'excel') {
    const exportView: CashFlowExportView = view
    exportMutation.mutate({ view: exportView, windowDays, format })
    setExportMenuOpen(false)
  }

  function handleEntryObservationSave(movementType: DailyCashCountMovementType, movementId: number, observacion: string) {
    updateEntryObservation.mutate({ movement_type: movementType, movement_id: movementId, observacion: observacion.trim() === '' ? null : observacion })
  }

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <IcoTrendingUp size={20} className="text-slate-500 dark:text-slate-400" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:arqueoCaja.title')}</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('adminContab:arqueoCaja.subtitle')}</p>
          </div>
        </div>

        {showExport && (
          <div className="relative">
            <button
              type="button" onClick={() => setExportMenuOpen(o => !o)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <IcoDownload size={13} /> {t('adminContab:arqueoCaja.exportButton')} <IcoChevronDown size={11} />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 z-10">
                <button type="button" onClick={() => handleExport('pdf')} className="w-full text-left px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                  {t('adminContab:arqueoCaja.exportPdf')}
                </button>
                <button type="button" onClick={() => handleExport('excel')} className="w-full text-left px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                  {t('adminContab:arqueoCaja.exportExcel')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {cards.map(c => (
          <Card key={c.label} variant="panel" className="p-3.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{c.label}</div>
            <div className="text-xl font-bold text-primary-dark">{c.value}</div>
            {c.sub && <div className="text-[10.5px] text-slate-400 mt-1">{c.sub}</div>}
          </Card>
        ))}
      </div>

      <Card variant="panel" className="p-4 mt-6">
        {canProjectedReal ? (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
              <button
                type="button" onClick={() => setView('proyectado')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${view === 'proyectado' ? 'bg-primary text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {t('adminContab:arqueoCaja.toggle.proyectado')}
              </button>
              <button
                type="button" onClick={() => setView('real')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${view === 'real' ? 'bg-primary text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {t('adminContab:arqueoCaja.toggle.real')}
              </button>
            </div>
            <div className="flex gap-1.5">
              {([0, 30, 90] as CashPositionWindowDays[]).map(d => (
                <button
                  key={d} type="button" onClick={() => setWindowDays(d)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full border ${windowDays === d ? 'bg-primary-soft border-primary text-primary-dark' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}
                >
                  {d === 0 ? t('adminContab:arqueoCaja.chips.hoy') : d === 30 ? t('adminContab:arqueoCaja.chips.dias30') : t('adminContab:arqueoCaja.chips.dias90')}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 mb-4">{t('adminContab:arqueoCaja.restricted.yaneth')}</p>
        )}

        {view === 'proyectado' && canProjectedReal && (
          <ProyectadoView projected={projected} isFetching={isFetchingProjected} t={t} />
        )}

        {view === 'real' && windowDays !== 0 && canProjectedReal && (
          <RealHistoricoView real={real} isFetching={isFetchingReal} t={t} />
        )}

        {isDailyCountView && (
          canDailyCount ? (
            <ArqueoDelDiaView
              dailyCount={dailyCount} isFetching={isFetchingDailyCount} t={t}
              onSaveEntryObservation={handleEntryObservationSave}
              onSaveGeneralObservation={obs => updateGeneralObservation.mutate(obs.trim() === '' ? null : obs)}
              onOpenCloseModal={() => setCloseModalOpen(true)}
              onExport={() => exportActiveMutation.mutate(dailyCount?.numero ?? null)}
              isExporting={exportActiveMutation.isPending}
            />
          ) : (
            <p className="text-[11px] text-slate-400 py-6 text-center">{t('adminContab:arqueoCaja.restricted.dailyCount')}</p>
          )
        )}
      </Card>

      {canViewHistorial && <HistorialArqueosPanel t={t} />}

      {closeModalOpen && dailyCount && (
        <CerrarArqueoModal
          dailyCount={dailyCount} t={t} loading={closeMutation.isPending} error={closeError}
          onClose={() => { setCloseModalOpen(false); setCloseError(null) }}
          onConfirm={() => {
            closeMutation.mutate(undefined, {
              onSuccess: () => { setCloseModalOpen(false); setCloseError(null) },
              onError: err => setCloseError(mutationErrorMessage(err, t('adminContab:arqueoCaja.arqueoDelDia.cerrar.error'))),
            })
          }}
        />
      )}
    </div>
  )
}

function vencimientoTag(dias: number | null, vencimiento: 'atrasado' | 'proximo' | null, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (vencimiento === 'atrasado' && dias !== null) {
    return <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 text-[9.5px] font-medium text-red-700 dark:text-red-400">{t('adminContab:arqueoCaja.proyectado.vencidoHace', { dias: Math.abs(dias) })}</span>
  }
  if (vencimiento === 'proximo' && dias !== null) {
    return <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-700 dark:text-amber-400">{t('adminContab:arqueoCaja.proyectado.vencePronto', { dias })}</span>
  }
  return null
}

function ProyectadoView(
  { projected, isFetching, t }:
  { projected: { entradas: CashFlowProjectedEntrada[]; salidas: CashFlowProjectedSalida[]; total_entradas: number; total_salidas: number; neto: number } | undefined
    isFetching: boolean; t: (key: string, opts?: Record<string, unknown>) => string },
) {
  if (!projected) return isFetching ? <p className="text-xs text-slate-400 text-center py-8">…</p> : null

  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-3">{t('adminContab:arqueoCaja.proyectado.panelSubtitle')}</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-primary-dark uppercase tracking-wide mb-2">
            <span>{t('adminContab:arqueoCaja.proyectado.entradasTitle')}</span>
            <span>{formatCurrency(projected.total_entradas)}</span>
          </div>
          {projected.entradas.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">{t('adminContab:arqueoCaja.proyectado.sinEntradas')}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {projected.entradas.map((e, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-100">{e.nombre}</div>
                    <div className="text-[10.5px] text-slate-400">{e.referencia} {vencimientoTag(e.dias, e.vencimiento, t)}</div>
                  </div>
                  <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(e.monto)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide mb-2">
            <span>{t('adminContab:arqueoCaja.proyectado.salidasTitle')}</span>
            <span>{formatCurrency(projected.total_salidas)}</span>
          </div>
          {projected.salidas.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">{t('adminContab:arqueoCaja.proyectado.sinSalidas')}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {projected.salidas.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-100">{s.nombre}</div>
                    <div className="text-[10.5px] text-slate-400">
                      {s.referencia} {vencimientoTag(s.dias, s.vencimiento, t)}{' '}
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9.5px] text-slate-500 dark:text-slate-400">
                        {t(`adminContab:arqueoCaja.proyectado.tipos.${s.tipo}`)}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-red-600 dark:text-red-400">{formatCurrency(s.monto)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('adminContab:arqueoCaja.proyectado.netoLabel')}</span>
        <span className={`text-sm font-bold ${projected.neto >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {projected.neto >= 0 ? '+' : '-'}{formatCurrency(Math.abs(projected.neto))}
        </span>
      </div>
      <p className="text-[10.5px] text-slate-400 mt-4">{t('adminContab:arqueoCaja.proyectado.footnote')}</p>
    </div>
  )
}

function RealHistoricoView(
  { real, isFetching, t }:
  { real: { movimientos: { fecha: string; concepto: string; origen: 'cobro' | 'devolucion' | 'comision'; entrada: number; salida: number; saldo_acumulado: number }[] } | undefined
    isFetching: boolean; t: (key: string, opts?: Record<string, unknown>) => string },
) {
  if (!real) return isFetching ? <p className="text-xs text-slate-400 text-center py-8">…</p> : null

  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-3">{t('adminContab:arqueoCaja.real.panelSubtitle')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.real.columnas.fecha')}</th>
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.real.columnas.concepto')}</th>
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.real.columnas.origen')}</th>
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.real.columnas.entrada')}</th>
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.real.columnas.salida')}</th>
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.real.columnas.saldoAcumulado')}</th>
            </tr>
          </thead>
          <tbody>
            {real.movimientos.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-slate-400 py-6">{t('adminContab:arqueoCaja.real.sinMovimientos')}</td></tr>
            ) : real.movimientos.map((m, i) => (
              <tr key={i} className="border-b border-slate-50 dark:border-slate-800">
                <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{formatDateShort(m.fecha)}</td>
                <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{m.concepto}</td>
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9.5px] text-slate-500 dark:text-slate-400">
                    {t(`adminContab:arqueoCaja.real.origenes.${m.origen}`)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-emerald-600 dark:text-emerald-400">{m.entrada ? formatCurrency(m.entrada) : '—'}</td>
                <td className="py-2 pr-3 text-red-600 dark:text-red-400">{m.salida ? formatCurrency(m.salida) : '—'}</td>
                <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">{formatCurrency(m.saldo_acumulado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ArqueoDelDiaView(
  { dailyCount, isFetching, t, onSaveEntryObservation, onSaveGeneralObservation, onOpenCloseModal, onExport, isExporting }:
  {
    dailyCount: DailyCashCount | undefined
    isFetching: boolean; t: (key: string, opts?: Record<string, unknown>) => string
    onSaveEntryObservation: (movementType: DailyCashCountMovementType, movementId: number, observacion: string) => void
    onSaveGeneralObservation: (observacion: string) => void
    onOpenCloseModal: () => void
    onExport: () => void
    isExporting: boolean
  },
) {
  const [generalObs, setGeneralObs] = useState(dailyCount?.observacion_general ?? '')

  // QA SCRUM-601 (2026-08-29) — el estado local quedaba "pegado" al texto del arqueo anterior: el
  // valor inicial de useState solo corre una vez, y este componente no se desmonta al avanzar de
  // arqueo (cerrar el atrasado → activo pasa al de hoy sin cambiar de vista). Resincronizar cuando
  // cambia el arqueo activo (id), no en cada cambio de observacion_general (eso pisaría lo que el
  // usuario está tipeando).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setGeneralObs(dailyCount?.observacion_general ?? '') }, [dailyCount?.id])

  if (!dailyCount) return isFetching ? <p className="text-xs text-slate-400 text-center py-8">…</p> : null

  const rows = [...dailyCount.cobros, ...dailyCount.notas_credito]
  const isAbierto = dailyCount.estado === 'abierto'

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('adminContab:arqueoCaja.arqueoDelDia.title')}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button" onClick={onExport} disabled={isExporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <IcoDownload size={13} /> {t('adminContab:arqueoCaja.arqueoDelDia.descargarResumen')}
          </button>
          {isAbierto && (
            <Button variant="primary" className="!text-xs !py-1.5" onClick={onOpenCloseModal}>
              {t('adminContab:arqueoCaja.arqueoDelDia.cerrar.boton')}
            </Button>
          )}
        </div>
      </div>

      {/* REQ-527 — el arqueo activo no siempre es hoy; el bloqueo secuencial obliga a cerrar el más
          antiguo pendiente antes de poder avanzar. */}
      {dailyCount.es_atrasado && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 mb-3">
          <IcoAlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-[11.5px] text-amber-800 dark:text-amber-300">
            {t('adminContab:arqueoCaja.arqueoDelDia.atrasadoAviso', { fecha: formatDateShort(dailyCount.fecha), fechaHoy: formatDateShort(dailyCount.fecha_real_hoy) })}
          </p>
        </div>
      )}

      {!isAbierto && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 mb-3">
          <IcoClock size={14} className="text-slate-400 flex-shrink-0" />
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
            {t('adminContab:arqueoCaja.arqueoDelDia.cerradoAviso', { estado: t(`adminContab:arqueoCaja.estados.${dailyCount.estado}`) })}
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.arqueoDelDia.columnas.concepto')}</th>
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.arqueoDelDia.columnas.monto')}</th>
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.arqueoDelDia.columnas.observaciones')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="text-center text-slate-400 py-6">{t('adminContab:arqueoCaja.arqueoDelDia.sinMovimientos')}</td></tr>
            ) : rows.map(row => {
              const isCredit = row.movement_type === 'credit_note'
              return (
                <tr key={`${row.movement_type}-${row.movement_id}`} className="border-b border-slate-50 dark:border-slate-800">
                  <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{row.concepto}</td>
                  <td className={`py-2 pr-3 font-medium ${isCredit ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {isCredit ? '-' : ''}{formatCurrency(row.monto)}
                  </td>
                  <td className="py-2 pr-3">
                    <ObservationInput
                      value={row.observacion ?? ''} placeholder={t('adminContab:arqueoCaja.arqueoDelDia.observacionPlaceholder')}
                      onSave={value => onSaveEntryObservation(row.movement_type, row.movement_id, value)}
                      disabled={!isAbierto}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">{t('adminContab:arqueoCaja.arqueoDelDia.totalCobrado')}</span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">+{formatCurrency(dailyCount.total_cobrado)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">{t('adminContab:arqueoCaja.arqueoDelDia.totalNotasCredito')}</span>
          <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(dailyCount.total_notas_credito)}</span>
        </div>
        <div className="flex items-center justify-between text-sm font-bold pt-1">
          <span className="text-slate-700 dark:text-slate-200">{t('adminContab:arqueoCaja.arqueoDelDia.totalNeto')}</span>
          <span className="text-slate-900 dark:text-slate-100">{formatCurrency(dailyCount.total_neto)}</span>
        </div>
      </div>
      <p className="text-[10.5px] text-slate-400 mt-2">{t('adminContab:arqueoCaja.arqueoDelDia.conciliacionNote')}</p>

      {/* REQ-525 RN1 — la sección solo aparece si hay al menos un cobro con retención. */}
      {dailyCount.retenciones.length > 0 && (
        <RetencionesSection retenciones={dailyCount.retenciones} t={t} />
      )}

      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('adminContab:arqueoCaja.arqueoDelDia.observacionGeneralTitle')}</div>
        <textarea
          rows={2} value={generalObs} onChange={e => setGeneralObs(e.target.value)} disabled={!isAbierto}
          onBlur={() => { if (generalObs !== (dailyCount.observacion_general ?? '')) onSaveGeneralObservation(generalObs) }}
          placeholder={t('adminContab:arqueoCaja.arqueoDelDia.observacionGeneralPlaceholder')}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 disabled:opacity-60"
        />
      </div>
    </div>
  )
}

function ObservationInput(
  { value, placeholder, onSave, disabled }: { value: string; placeholder: string; onSave: (value: string) => void; disabled?: boolean },
) {
  const [local, setLocal] = useState(value)
  return (
    <input
      type="text" value={local} placeholder={placeholder} disabled={disabled}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onSave(local) }}
      className="w-full min-w-[160px] rounded-md border border-slate-200 dark:border-slate-700 dark:bg-slate-900 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 disabled:opacity-60"
    />
  )
}

/** REQ-525 — cobros pagados con "Retención de impuestos", estado de la constancia fiscal que el
 *  cliente debe entregar. Se reusa tal cual dentro de `DetalleArqueoModal` (RN4 — la constancia se
 *  puede subir/reemplazar incluso sobre un arqueo ya cerrado del historial). */
function RetencionesSection({ retenciones, t }: { retenciones: DailyCashCountRetencion[]; t: (key: string, opts?: Record<string, unknown>) => string }) {
  return (
    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">{t('adminContab:arqueoCaja.retenciones.title')}</div>
      <p className="text-[10.5px] text-slate-400 mb-2">{t('adminContab:arqueoCaja.retenciones.subtitle')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.retenciones.columnas.cliente')}</th>
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.retenciones.columnas.motivo')}</th>
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.retenciones.columnas.monto')}</th>
              <th className="py-2 pr-3">{t('adminContab:arqueoCaja.retenciones.columnas.constancia')}</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {retenciones.map(r => <RetencionRow key={r.payment_id} retencion={r} t={t} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RetencionRow({ retencion, t }: { retencion: DailyCashCountRetencion; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadMutation = useUploadRetentionAttachment()

  function handleFileChange(file: File | undefined) {
    if (!file) return
    uploadMutation.mutate({ paymentId: retencion.payment_id, file })
  }

  return (
    <tr className="border-b border-slate-50 dark:border-slate-800">
      <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{retencion.cliente}</td>
      <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{retencion.motivo || '—'}</td>
      <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">{formatCurrency(retencion.monto)}</td>
      <td className="py-2 pr-3">
        {retencion.constancia ? (
          <a
            href={retencion.constancia.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-1.5 py-0.5 text-[9.5px] font-medium text-primary-dark"
          >
            <IcoCheck size={10} /> {retencion.constancia.nombre_archivo}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-700 dark:text-amber-400">
            <IcoClock size={10} /> {t('adminContab:arqueoCaja.retenciones.pendiente')}
          </span>
        )}
      </td>
      <td className="py-2 pr-3">
        <button
          type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}
          className="inline-flex items-center gap-1 text-primary-dark hover:underline disabled:opacity-50"
        >
          <IcoPaperclip size={11} />
          {retencion.constancia
            ? t('adminContab:arqueoCaja.retenciones.reemplazar')
            : t('adminContab:arqueoCaja.retenciones.subir')}
        </button>
        <input
          ref={fileInputRef} type="file" accept="image/jpeg,image/png,.pdf" className="hidden"
          onChange={e => handleFileChange(e.target.files?.[0])}
        />
      </td>
    </tr>
  )
}

/** REQ-526 — confirmación de cierre. El backend recién asigna `numero` al cerrar (ver ADR §8), así
 *  que el modal muestra `numero_preview` (mismo cálculo que `close()`, sin persistir — QA
 *  SCRUM-603, 2026-08-29 RN1) en vez del `numero` real, que acá siempre es `null`. */
function CerrarArqueoModal(
  { dailyCount, t, loading, error, onClose, onConfirm }:
  {
    dailyCount: DailyCashCount; t: (key: string, opts?: Record<string, unknown>) => string
    loading: boolean; error: string | null; onClose: () => void; onConfirm: () => void
  },
) {
  const retencionesPendientes = dailyCount.retenciones.filter(r => r.constancia === null).length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('adminContab:arqueoCaja.arqueoDelDia.cerrar.modalTitle')}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><IcoClose size={16} /></button>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">{t('adminContab:arqueoCaja.arqueoDelDia.cerrar.numero')}</span>
            <span className="font-medium text-slate-800 dark:text-slate-100">{dailyCount.numero_preview}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">{t('adminContab:arqueoCaja.arqueoDelDia.cerrar.fecha')}</span>
            <span className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(dailyCount.fecha)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-bold pt-1">
            <span className="text-slate-700 dark:text-slate-200">{t('adminContab:arqueoCaja.arqueoDelDia.totalNeto')}</span>
            <span className="text-slate-900 dark:text-slate-100">{formatCurrency(dailyCount.total_neto)}</span>
          </div>
        </div>

        {retencionesPendientes > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 mb-3">
            <IcoAlertTriangle size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-[11.5px] text-amber-800 dark:text-amber-300">
              {t('adminContab:arqueoCaja.arqueoDelDia.cerrar.avisoRetenciones', { count: retencionesPendientes })}
            </p>
          </div>
        )}

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <p className="text-[11px] text-slate-400 mb-4">{t('adminContab:arqueoCaja.arqueoDelDia.cerrar.confirmBody')}</p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" onClick={onConfirm} loading={loading}>{t('adminContab:arqueoCaja.arqueoDelDia.cerrar.confirmar')}</Button>
        </div>
      </Card>
    </div>
  )
}

/** REQ-528 — panel de solo lectura de arqueos ya cerrados, disponible para los 4 roles del módulo
 *  (Felix/Yaneth/Mark/Gerencia) sin importar la pestaña activa (a diferencia del Arqueo del día,
 *  que Mark/Gerencia nunca ven) — por eso vive fuera del `Card` de toggle/chips, siempre visible. */
function HistorialArqueosPanel({ t }: { t: (key: string, opts?: Record<string, unknown>) => string }) {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data, isFetching } = useDailyCashCountHistory(page)

  if (!data && !isFetching) return null

  return (
    <Card variant="panel" className="p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('adminContab:arqueoCaja.historial.title')}</h2>
        {data && data.pendientes_aprobacion > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-1 text-[10.5px] font-medium text-amber-700 dark:text-amber-400">
            <IcoAlertTriangle size={11} />
            {t('adminContab:arqueoCaja.historial.pendientesAviso', { count: data.pendientes_aprobacion })}
          </span>
        )}
      </div>

      {!data ? (
        <p className="text-xs text-slate-400 text-center py-6">…</p>
      ) : data.data.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">{t('adminContab:arqueoCaja.historial.sinArqueos')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 pr-3">{t('adminContab:arqueoCaja.historial.columnas.numero')}</th>
                <th className="py-2 pr-3">{t('adminContab:arqueoCaja.historial.columnas.fecha')}</th>
                <th className="py-2 pr-3">{t('adminContab:arqueoCaja.historial.columnas.totalNeto')}</th>
                <th className="py-2 pr-3">{t('adminContab:arqueoCaja.historial.columnas.aprobacion')}</th>
                <th className="py-2 pr-3">{t('adminContab:arqueoCaja.historial.columnas.realizadoPor')}</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {data.data.map((row: DailyCashCountHistoryRow) => (
                <tr key={row.id} className="border-b border-slate-50 dark:border-slate-800">
                  <td className="py-2 pr-3 text-slate-700 dark:text-slate-200">{row.numero ?? '—'}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{formatDateShort(row.fecha)}</td>
                  <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-100">{formatCurrency(row.total_neto)}</td>
                  <td className="py-2 pr-3">
                    {row.estado === 'aprobado' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-1.5 py-0.5 text-[9.5px] font-medium text-primary-dark">
                        <IcoCheck size={10} /> {t('adminContab:arqueoCaja.historial.aprobadoPor', { nombre: row.aprobado_por })}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-700 dark:text-amber-400">
                        <IcoClock size={10} /> {t('adminContab:arqueoCaja.historial.pendiente')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                    {row.realizado_por ?? '—'}
                    {row.realizado_por && row.cerrado_at && (
                      <span className="text-slate-400 dark:text-slate-500"> · {formatTimeShort(row.cerrado_at)}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <button type="button" onClick={() => setSelectedId(row.id)} className="text-primary-dark hover:underline">
                      {t('adminContab:arqueoCaja.historial.ver')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.meta.last_page > 1 && (
            <div className="flex items-center justify-end gap-2 mt-3">
              <button
                type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="text-xs text-slate-500 dark:text-slate-400 disabled:opacity-40 hover:text-primary-dark"
              >
                {t('adminContab:arqueoCaja.historial.anterior')}
              </button>
              <span className="text-[11px] text-slate-400">{page} / {data.meta.last_page}</span>
              <button
                type="button" disabled={page >= data.meta.last_page} onClick={() => setPage(p => p + 1)}
                className="text-xs text-slate-500 dark:text-slate-400 disabled:opacity-40 hover:text-primary-dark"
              >
                {t('adminContab:arqueoCaja.historial.siguiente')}
              </button>
            </div>
          )}
        </div>
      )}

      {selectedId !== null && <DetalleArqueoModal id={selectedId} t={t} onClose={() => setSelectedId(null)} />}
    </Card>
  )
}

/** REQ-528/529 — detalle de solo lectura de un arqueo del historial: mismos totales/movimientos/
 *  retenciones que el arqueo activo (RN1 REQ-528 — inmutable salvo la constancia, RN4 REQ-525), más
 *  "Aprobar" (gate `puede_aprobar`, exclusivo Mark) y "Descargar resumen". */
function DetalleArqueoModal({ id, t, onClose }: { id: number; t: (key: string, opts?: Record<string, unknown>) => string; onClose: () => void }) {
  const { data: detail, isFetching } = useDailyCashCountHistoryDetail(id)
  const approveMutation = useApproveDailyCashCount()
  const exportMutation  = useExportDailyCashCountHistory()
  const [approveError, setApproveError] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-xl max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {detail ? t('adminContab:arqueoCaja.historial.detalleTitle', { numero: detail.numero ?? '—' }) : '…'}
            </h2>
            {detail && <p className="text-xs text-slate-400">{formatDateShort(detail.fecha)}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><IcoClose size={16} /></button>
        </div>

        {!detail ? (
          <p className="text-xs text-slate-400 py-4 text-center">{isFetching ? '…' : t('adminContab:arqueoCaja.historial.detalleError')}</p>
        ) : (
          <div className="space-y-3">
            {detail.observacion_general && (
              <p className="text-xs text-slate-600 dark:text-slate-300 italic">{detail.observacion_general}</p>
            )}

            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">{t('adminContab:arqueoCaja.arqueoDelDia.totalCobrado')}</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">+{formatCurrency(detail.total_cobrado)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">{t('adminContab:arqueoCaja.arqueoDelDia.totalNotasCredito')}</span>
                <span className="font-medium text-red-600 dark:text-red-400">-{formatCurrency(detail.total_notas_credito)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-bold pt-1">
                <span className="text-slate-700 dark:text-slate-200">{t('adminContab:arqueoCaja.arqueoDelDia.totalNeto')}</span>
                <span className="text-slate-900 dark:text-slate-100">{formatCurrency(detail.total_neto)}</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {detail.cerrado_por && t('adminContab:arqueoCaja.historial.cerradoPor', { nombre: detail.cerrado_por })}
            </div>

            {detail.retenciones.length > 0 && <RetencionesSection retenciones={detail.retenciones} t={t} />}

            <div className="rounded-lg p-3 bg-slate-50 dark:bg-slate-800/60">
              {detail.estado === 'aprobado' ? (
                <p className="text-xs font-medium text-primary-dark inline-flex items-center gap-1.5">
                  <IcoCheck size={13} /> {t('adminContab:arqueoCaja.historial.aprobadoPor', { nombre: detail.aprobado_por })}
                </p>
              ) : (
                <div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">{t('adminContab:arqueoCaja.historial.pendiente')}</p>
                  {detail.puede_aprobar === true && (
                    <Button
                      variant="primary" className="!text-xs inline-flex items-center gap-1.5" loading={approveMutation.isPending}
                      onClick={() => {
                        approveMutation.mutate(id, {
                          onError: err => setApproveError(mutationErrorMessage(err, t('adminContab:arqueoCaja.historial.aprobarError'))),
                        })
                      }}
                    >
                      <IcoCheck size={13} /> {t('adminContab:arqueoCaja.historial.aprobar')}
                    </Button>
                  )}
                  {approveError && <p className="text-xs text-red-500 mt-2">{approveError}</p>}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button" onClick={() => exportMutation.mutate({ id, numero: detail.numero })} disabled={exportMutation.isPending}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-primary-dark disabled:opacity-50"
              >
                <IcoDownload size={13} /> {t('adminContab:arqueoCaja.arqueoDelDia.descargarResumen')}
              </button>
              <Button variant="secondary" onClick={onClose}>{t('adminContab:facturacion.detalle.cerrar')}</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
