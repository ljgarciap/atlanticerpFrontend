import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  useInvoiceSummary, useInvoiceList, useInvoicePreview, useCreateInvoice, useInvoiceExport,
  useInvoiceDetail, useMarkUncollectible, useDecideUncollectible, useInvoiceAging, useDownloadInvoicePdf,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  IcoFileText, IcoChevronRight, IcoSearch, IcoClose, IcoDownload, IcoChevronDown,
  IcoCheck, IcoBan, IcoPrinter, IcoAlertTriangle, IcoTruck, IcoClock,
} from '@/components/icons'
import { FiscalItemsTable, FiscalTotalsBlock } from '@/components/admin-contab/FiscalDocumentPreview'
import type {
  CarteraTab, EntregaEstado, FacturacionView, InvoiceEntry, InvoicePreviewResponse, InvoiceExportFormat,
  InvoiceListFilters,
} from '@/types/adminContab'

/**
 * Batch 2 del cuerpo principal de Admin&Cont (SCRUM-513→518, REQ-436→441) — Facturación.
 *
 * "Entrega" = `Bodega\Models\Order` — ver nota de reconciliación en `types/adminContab.ts` sobre
 * por qué este batch NO implementa el modelo de "hitos" múltiples por proyecto del mockup. Vista
 * siempre se pide en `plana` al backend (el agrupado por proyecto lo arma este componente en
 * memoria) — desacopla el fetch de cómo se renderiza.
 */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

function mutationErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string }>(err) ? err.response?.data : undefined
  return data?.message ?? fallback
}

function openEstadoCuenta(masterClientId: number) {
  window.open(`/admin-contab/facturacion/estado-cuenta?master_client_id=${masterClientId}`, '_blank')
}

const ESTADO_PILL_CLASSES: Record<EntregaEstado, string> = {
  facturada: 'bg-primary-soft text-primary-dark',
  'pendiente-facturar': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  anulada: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400 line-through',
}

/** Batch 4 (REQ-448) — la pastilla de una entrega depende de cobrabilidad ANTES que de `estado`:
 *  una factura "pendiente_aprobacion"/"incobrable" sigue teniendo `estado: 'facturada'`, pero la
 *  tabla debe mostrar su estado de cobrabilidad, no "Facturada" liso. */
function pillFor(entry: InvoiceEntry, t: (key: string) => string): { label: string; className: string } {
  if (entry.incobrable_pendiente) {
    return { label: t('adminContab:facturacion.estados.pendienteAprobacion'), className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' }
  }
  if (entry.es_incobrable) {
    return { label: t('adminContab:facturacion.estados.incobrable'), className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
  }
  return { label: t(`adminContab:facturacion.estados.${entry.estado}`), className: ESTADO_PILL_CLASSES[entry.estado] }
}

export default function FacturacionPage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const [searchParams] = useSearchParams()

  const [cartera, setCartera] = useState<CarteraTab>('cobrable')
  const [view, setView] = useState<FacturacionView>('agrupado')
  const [search, setSearch] = useState('')
  const [cliente, setCliente] = useState('')
  const [proyecto, setProyecto] = useState('')
  const [estado, setEstado] = useState<EntregaEstado | ''>('')
  // SCRUM-156/159 (Gerencia → "Variación margen"/panel Facturación): la tarjeta y
  // el clic en barra navegan acá con ?desde=&hasta= — antes se ignoraba, esta
  // pantalla nunca leía la URL al montar.
  const [desde, setDesde] = useState(() => searchParams.get('desde') ?? '')
  const [hasta, setHasta] = useState(() => searchParams.get('hasta') ?? '')
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({})
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [previewOrderIds, setPreviewOrderIds] = useState<number[] | null>(null)
  const [previewFromWizard, setPreviewFromWizard] = useState(false)
  // Estado del wizard "+ Crear Factura" subido a este nivel (RN3 REQ-443 — "Editar" desde la
  // vista previa vuelve al formulario sin perder cliente/proyecto/selección ya elegidos).
  const [wizardCliente, setWizardCliente] = useState('')
  const [wizardProyecto, setWizardProyecto] = useState('')
  const [wizardSelected, setWizardSelected] = useState<number[]>([])
  // Batch 4 (REQ-447) — modal de detalle/trazabilidad, se abre al hacer clic en cualquier fila.
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null)

  const listFilters = {
    tab: cartera,
    view: 'plana' as const, // el agrupado lo arma este componente — el fetch siempre trae la lista plana
    cliente: cliente || undefined,
    proyecto: proyecto || undefined,
    estado: estado || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    search: search || undefined,
  }
  const { data: listResult, isLoading } = useInvoiceList(listFilters)

  const list = listResult?.rows ?? []
  const totalEnTab = listResult?.total_en_tab ?? list.length

  function resetWizard() {
    setWizardCliente(''); setWizardProyecto(''); setWizardSelected([])
  }

  function openWizard() {
    resetWizard()
    setCreatingInvoice(true)
  }

  function openPreviewFromWizard(orderIds: number[]) {
    setCreatingInvoice(false)
    setPreviewFromWizard(true)
    setPreviewOrderIds(orderIds)
  }

  function openPreviewSingle(orderId: number) {
    setPreviewFromWizard(false)
    setPreviewOrderIds([orderId])
  }

  function backToWizard() {
    setPreviewOrderIds(null)
    setCreatingInvoice(true)
  }

  function closePreview() {
    setPreviewOrderIds(null)
    setPreviewFromWizard(false)
  }

  function handleInvoiceConfirmed() {
    setPreviewOrderIds(null)
    setPreviewFromWizard(false)
    resetWizard()
  }

  const clientesOptions = useMemo(() => Array.from(new Set(list.map(e => e.cliente))).sort(), [list])
  const proyectosOptions = useMemo(() => Array.from(new Set(list.map(e => e.proyecto))).sort(), [list])

  const groups = useMemo(() => {
    const map = new Map<number, { proyecto: string; cliente: string; master_client_id: number | null; cotizacion_folio: string | null; entries: InvoiceEntry[] }>()
    for (const e of list) {
      if (!map.has(e.sales_project_id)) {
        map.set(e.sales_project_id, { proyecto: e.proyecto, cliente: e.cliente, master_client_id: e.master_client_id, cotizacion_folio: e.cotizacion_folio, entries: [] })
      }
      map.get(e.sales_project_id)!.entries.push(e)
    }
    return Array.from(map.entries())
  }, [list])

  function clearFilters() {
    setSearch(''); setCliente(''); setProyecto(''); setEstado(''); setDesde(''); setHasta('')
  }

  const hasFilters = !!(search || cliente || proyecto || estado || desde || hasta)

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <IcoFileText size={20} className="text-slate-500 dark:text-slate-400" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:facturacion.title')}</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">{t('adminContab:facturacion.subtitle')}</p>
          </div>
        </div>
        <Button onClick={openWizard}>{t('adminContab:facturacion.crearFactura')}</Button>
      </div>

      <StatCards t={t} />

      <Card variant="panel" shadow className="p-4 mt-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('adminContab:facturacion.panel.title')}</div>
            <div className="text-[11px] text-slate-400">
              {view === 'agrupado' ? t('adminContab:facturacion.panel.subAgrupado') : t('adminContab:facturacion.panel.subPlano')}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
              <Button variant="secondary" active={cartera === 'cobrable'} className="!px-3 !py-1.5 !text-xs" onClick={() => setCartera('cobrable')}>
                {t('adminContab:facturacion.cartera.cobrable')}
              </Button>
              <Button variant="secondary" active={cartera === 'incobrable'} className="!px-3 !py-1.5 !text-xs" onClick={() => setCartera('incobrable')}>
                {t('adminContab:facturacion.cartera.incobrable')}
              </Button>
            </div>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
              <Button variant="secondary" active={view === 'agrupado'} className="!px-3 !py-1.5 !text-xs" onClick={() => setView('agrupado')}>
                {t('adminContab:facturacion.vista.agrupado')}
              </Button>
              <Button variant="secondary" active={view === 'plana'} className="!px-3 !py-1.5 !text-xs" onClick={() => setView('plana')}>
                {t('adminContab:facturacion.vista.plano')}
              </Button>
            </div>
            <ExportMenu t={t} filters={listFilters} />
          </div>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          <div className="relative">
            <IcoSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('adminContab:facturacion.filtros.buscarPlaceholder')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={cliente} onChange={e => setCliente(e.target.value)} className={selectClass}>
              <option value="">{t('adminContab:facturacion.filtros.todosClientes')}</option>
              {clientesOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={proyecto} onChange={e => setProyecto(e.target.value)} className={selectClass}>
              <option value="">{t('adminContab:facturacion.filtros.todosProyectos')}</option>
              {proyectosOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={estado} onChange={e => setEstado(e.target.value as EntregaEstado | '')} className={selectClass}>
              <option value="">{t('adminContab:facturacion.filtros.todosEstados')}</option>
              {(['pendiente-facturar', 'facturada'] as const).map(s => (
                <option key={s} value={s}>{t(`adminContab:facturacion.estados.${s}`)}</option>
              ))}
            </select>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={selectClass} title="Desde" />
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={selectClass} title="Hasta" />
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2">
                <IcoClose size={13} />{t('adminContab:facturacion.filtros.limpiar')}
              </button>
            )}
          </div>
        </div>

        <div className="text-[11px] text-slate-400 mb-2">
          {t('adminContab:facturacion.resultCount', { visible: list.length, total: totalEnTab })}
        </div>

        {isLoading ? (
          <p className="text-xs text-slate-400 py-6 text-center">{t('common:labels.loading')}</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">{t('adminContab:facturacion.empty')}</p>
        ) : view === 'agrupado' ? (
          <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            {groups.map(([projectId, group]) => (
              <FactGroup
                key={projectId}
                open={!!openGroups[projectId]}
                onToggle={() => setOpenGroups(prev => ({ ...prev, [projectId]: !prev[projectId] }))}
                group={group}
                t={t}
                onOpenPreview={openPreviewSingle}
                onOpenDetail={setDetailOrderId}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
            {list.map(entry => (
              <FactRow key={entry.order_id} entry={entry} flat t={t} onGenerarFactura={openPreviewSingle} onOpenDetail={setDetailOrderId} />
            ))}
          </div>
        )}
      </Card>

      <AgingPanel t={t} />

      {detailOrderId !== null && (
        <InvoiceDetailModal orderId={detailOrderId} t={t} onClose={() => setDetailOrderId(null)} />
      )}

      {previewOrderIds && (
        <PreviewModal
          orderIds={previewOrderIds}
          fromWizard={previewFromWizard}
          t={t}
          onClose={closePreview}
          onEdit={backToWizard}
          onConfirmed={handleInvoiceConfirmed}
        />
      )}

      {creatingInvoice && (
        <CrearFacturaModal
          t={t}
          cliente={wizardCliente} setCliente={setWizardCliente}
          proyecto={wizardProyecto} setProyecto={setWizardProyecto}
          selected={wizardSelected} setSelected={setWizardSelected}
          onClose={() => setCreatingInvoice(false)}
          onPreview={openPreviewFromWizard}
        />
      )}
    </div>
  )
}

const selectClass = 'rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

function StatCards({ t }: { t: (key: string, opts?: Record<string, unknown>) => string }) {
  const { data: summary } = useInvoiceSummary()
  const cards = [
    { label: t('adminContab:facturacion.stats.pendientesEntrega'), value: summary?.pendientes_entrega ?? '—', sub: t('adminContab:facturacion.stats.pendientesEntregaSub') },
    { label: t('adminContab:facturacion.stats.pendientesFacturar'), value: summary?.pendientes_facturar ?? '—', sub: t('adminContab:facturacion.stats.pendientesFacturarSub'), warn: true },
    { label: t('adminContab:facturacion.stats.facturadasMes'), value: summary?.facturadas_mes ?? '—', good: true },
    { label: t('adminContab:facturacion.stats.montoFacturadoMes'), value: summary ? formatCurrency(summary.monto_facturado_mes) : '—', good: true },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
      {cards.map(c => (
        <Card key={c.label} variant="panel" className="p-3.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{c.label}</div>
          <div className={`text-xl font-bold ${c.warn ? 'text-amber-700 dark:text-amber-400' : c.good ? 'text-primary-dark' : 'text-slate-900 dark:text-slate-100'}`}>
            {c.value}
          </div>
          {c.sub && <div className="text-[10px] text-slate-400 mt-1">{c.sub}</div>}
        </Card>
      ))}
    </div>
  )
}

function FactGroup(
  { open, onToggle, group, t, onOpenPreview, onOpenDetail }:
  {
    open: boolean
    onToggle: () => void
    group: { proyecto: string; cliente: string; master_client_id: number | null; cotizacion_folio: string | null; entries: InvoiceEntry[] }
    t: (key: string, opts?: Record<string, unknown>) => string
    onOpenPreview: (orderId: number) => void
    onOpenDetail: (orderId: number) => void
  },
) {
  return (
    <div className="border-t border-slate-100 dark:border-slate-700 first:border-t-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-900/40 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900/70" onClick={onToggle}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`transition-transform text-slate-400 ${open ? 'rotate-90' : ''}`}><IcoChevronRight size={14} /></span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{group.proyecto}</div>
            <div className="text-[11px] text-slate-400">
              {group.master_client_id !== null ? (
                <button
                  type="button"
                  className="text-primary-dark underline decoration-transparent hover:decoration-primary-dark transition"
                  onClick={e => { e.stopPropagation(); openEstadoCuenta(group.master_client_id!) }}
                  title={t('adminContab:facturacion.clienteClickHint')}
                >
                  {group.cliente}
                </button>
              ) : (
                <span>{group.cliente}</span>
              )}
              {group.cotizacion_folio && <> · {group.cotizacion_folio}</>}
            </div>
          </div>
        </div>
      </div>
      {open && (
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {group.entries.map(entry => (
            <FactRow key={entry.order_id} entry={entry} t={t} onGenerarFactura={onOpenPreview} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      )}
    </div>
  )
}

function FactRow(
  { entry, flat, t, onGenerarFactura, onOpenDetail }:
  {
    entry: InvoiceEntry
    flat?: boolean
    t: (key: string, opts?: Record<string, unknown>) => string
    onGenerarFactura: (orderId: number) => void
    /** REQ-447 — clic en cualquier fila abre el modal de detalle/trazabilidad. */
    onOpenDetail: (orderId: number) => void
  },
) {
  const pill = pillFor(entry, t)
  return (
    <div
      className="grid grid-cols-[1.6fr_0.9fr_0.9fr_0.9fr_1fr] gap-3 items-center px-4 py-2.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30"
      onClick={() => onOpenDetail(entry.order_id)}
    >
      <div className="min-w-0">
        <div className="font-medium text-slate-800 dark:text-slate-100 truncate">{entry.order_number}</div>
        {flat && <div className="text-[10.5px] text-slate-400 truncate">{entry.cliente} · {entry.proyecto}</div>}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-300">{entry.numero_factura ?? '—'}</div>
      <div className="text-xs text-slate-500 dark:text-slate-300">{entry.cotizacion_folio ?? '—'}</div>
      <div className="text-xs font-medium text-slate-800 dark:text-slate-100">{formatCurrency(entry.monto)}</div>
      <div className="flex items-center justify-end gap-2">
        {entry.estado === 'pendiente-facturar' ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onGenerarFactura(entry.order_id) }}
            className="text-[11px] font-medium text-primary-dark bg-primary-soft rounded-md px-2.5 py-1.5 hover:brightness-95"
          >
            {t('adminContab:facturacion.generarFactura')}
          </button>
        ) : (
          <span className={`text-[10.5px] font-semibold px-2 py-1 rounded-md whitespace-nowrap ${pill.className}`}>
            {pill.label}
          </span>
        )}
      </div>
    </div>
  )
}

function PreviewModal(
  { orderIds, fromWizard, t, onClose, onEdit, onConfirmed }:
  {
    orderIds: number[]
    fromWizard: boolean
    t: (key: string, opts?: Record<string, unknown>) => string
    onClose: () => void
    onEdit: () => void
    onConfirmed: () => void
  },
) {
  const previewMutation = useInvoicePreview()
  const createMutation = useCreateInvoice()
  const [preview, setPreview] = useState<InvoicePreviewResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  // RN1 REQ-442 — marcada por defecto cuando el cliente tiene saldo a favor.
  const [aplicarSaldoFavor, setAplicarSaldoFavor] = useState(true)

  useEffect(() => {
    setPreview(null)
    previewMutation.mutate({ orderIds, aplicarSaldoFavor }, {
      onSuccess: setPreview,
      onError: err => setError(mutationErrorMessage(err, t('adminContab:facturacion.preview.error'))),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orderIds es estable por identidad del modal; re-dispara solo al togglear el saldo
  }, [aplicarSaldoFavor])

  function confirm() {
    createMutation.mutate({ order_ids: orderIds, aplicar_saldo_favor: aplicarSaldoFavor }, {
      onSuccess: onConfirmed,
      onError: err => setError(mutationErrorMessage(err, t('adminContab:facturacion.confirmError'))),
    })
  }

  const results = preview?.results ?? []
  const hasErrors = results.some(r => !r.ok)
  const primerResultado = results[0]
  // RN1/RN3 REQ-442 — el saldo a favor solo puede venir en el primer resultado del lote.
  const saldoDisponible = primerResultado?.ok ? (primerResultado.saldo_disponible ?? 0) : 0
  const totalFactura = results.filter(r => r.ok).reduce((sum, r) => sum + (r.total ?? r.monto ?? 0), 0)
  const totalAPagar = results.filter(r => r.ok).reduce((sum, r) => sum + (r.total_a_pagar ?? r.total ?? r.monto ?? 0), 0)
  const saldoAplicado = aplicarSaldoFavor ? Math.max(0, totalFactura - totalAPagar) : 0

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-xl max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('adminContab:facturacion.preview.title')}</h2>
            <p className="text-xs text-slate-400">{t('adminContab:facturacion.preview.subtitle')}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><IcoClose size={16} /></button>
        </div>

        {error && <p className="text-xs text-red-500 mb-3 whitespace-pre-line">{error}</p>}

        {!preview && !error && <p className="text-xs text-slate-400 py-4">{t('common:labels.loading')}</p>}

        {preview && (
          <div className="space-y-3 mb-4">
            {saldoDisponible > 0 && (
              <div className="bg-primary-soft/60 dark:bg-primary-dark/10 rounded-lg p-3">
                <label className="flex items-center gap-2 text-xs font-medium text-primary-dark cursor-pointer">
                  <input
                    type="checkbox" checked={aplicarSaldoFavor}
                    onChange={e => setAplicarSaldoFavor(e.target.checked)}
                  />
                  {t('adminContab:facturacion.preview.aplicarSaldo', { monto: formatCurrency(saldoDisponible) })}
                </label>
                {preview.aviso_saldo_solo_primera && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
                    {t('adminContab:facturacion.preview.avisoSaldoSoloPrimera')}
                  </p>
                )}
              </div>
            )}

            {results.map(r => (
              <div key={r.order_id} className="border-b border-slate-100 dark:border-slate-700 pb-3">
                {r.ok ? (
                  <>
                    <div className="flex justify-between items-baseline mb-1.5">
                      <div>
                        <div className="font-medium text-slate-800 dark:text-slate-100">{r.order_number}</div>
                        {r.cliente && <div className="text-[10.5px] text-slate-400">{r.cliente}</div>}
                        {r.cotizacion_folio && <div className="text-[10.5px] text-slate-400">{r.cotizacion_folio}</div>}
                      </div>
                    </div>

                    <FiscalItemsTable items={r.items} t={t} />
                    <FiscalTotalsBlock
                      subtotal={r.subtotal} descuentos={r.descuentos} itbms={r.itbms}
                      total={r.total} monto={r.monto}
                      saldoAplicable={aplicarSaldoFavor ? r.saldo_aplicable : undefined}
                      totalAPagar={r.total_a_pagar}
                      t={t}
                    />
                  </>
                ) : (
                  <div className="text-red-500 text-xs">
                    {t('adminContab:facturacion.preview.faltan', { campos: (r.missing ?? []).join(', ') })}
                  </div>
                )}
              </div>
            ))}

            {!hasErrors && results.length > 1 && (
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-3 text-sm">
                <div className="flex justify-between font-bold text-primary-dark">
                  <span>{saldoAplicado > 0 ? t('adminContab:facturacion.preview.totalAPagar') : t('adminContab:facturacion.preview.total')}</span>
                  <span>{formatCurrency(totalAPagar)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('adminContab:facturacion.preview.cancelar')}</Button>
          {fromWizard && (
            <Button variant="secondary" onClick={onEdit}>{t('adminContab:facturacion.preview.editar')}</Button>
          )}
          <Button onClick={confirm} disabled={!preview || hasErrors} loading={createMutation.isPending}>{t('adminContab:facturacion.preview.guardar')}</Button>
        </div>
      </Card>
    </div>
  )
}

function CrearFacturaModal(
  { t, cliente, setCliente, proyecto, setProyecto, selected, setSelected, onClose, onPreview }:
  {
    t: (key: string, opts?: Record<string, unknown>) => string
    cliente: string
    setCliente: (v: string) => void
    proyecto: string
    setProyecto: (v: string) => void
    selected: number[]
    setSelected: (v: number[]) => void
    onClose: () => void
    onPreview: (orderIds: number[]) => void
  },
) {
  const [selectionError, setSelectionError] = useState<string | null>(null)

  // RN1 REQ-444 — el selector de cliente/proyecto es independiente de los filtros de la tabla
  // (búsqueda/estado/fechas de la pantalla principal): siempre pide la cartera cobrable completa,
  // sin filtros, para no restringir incorrectamente qué clientes aparecen (bug real corregido acá
  // — antes se derivaba de la lista ya filtrada de la tabla).
  const { data: listResult } = useInvoiceList({ tab: 'cobrable', view: 'plana' })
  const entries = listResult?.rows ?? []

  const pendientes = entries.filter(e => e.estado === 'pendiente-facturar')
  const clientes = Array.from(new Set(pendientes.map(e => e.cliente))).sort()
  const proyectosDeCliente = Array.from(new Set(pendientes.filter(e => e.cliente === cliente).map(e => e.proyecto))).sort()
  const entregasDeProyecto = pendientes.filter(e => e.cliente === cliente && e.proyecto === proyecto)

  function toggle(orderId: number) {
    setSelected(selected.includes(orderId) ? selected.filter(id => id !== orderId) : [...selected, orderId])
  }

  function selectProyecto(newProyecto: string) {
    setProyecto(newProyecto)
    // RN2 REQ-444 — todas marcadas por defecto al elegir el proyecto.
    const pend = pendientes.filter(e => e.cliente === cliente && e.proyecto === newProyecto)
    setSelected(pend.map(e => e.order_id))
    setSelectionError(null)
  }

  function submit() {
    if (selected.length === 0) {
      // RN5 REQ-444 — mensaje inline, nunca window.alert() (bloquea el navegador y rompe Playwright).
      setSelectionError(t('adminContab:facturacion.crear.seleccionaEntrega'))
      return
    }
    onPreview(selected)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('adminContab:facturacion.crear.title')}</h2>
            <p className="text-xs text-slate-400">{t('adminContab:facturacion.crear.subtitle')}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><IcoClose size={16} /></button>
        </div>

        <label className="block text-sm mb-3">
          <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('adminContab:facturacion.crear.clienteLabel')}</span>
          <select
            value={cliente}
            onChange={e => { setCliente(e.target.value); setProyecto(''); setSelected([]); setSelectionError(null) }}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">{t('adminContab:facturacion.crear.clienteSelect')}</option>
            {clientes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {cliente === '' && clientes.length === 0 && (
            <p className="text-[11px] text-slate-400 mt-1">{t('adminContab:facturacion.crear.sinClientesPendientes')}</p>
          )}
        </label>

        <label className="block text-sm mb-3">
          <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t('adminContab:facturacion.crear.proyectoLabel')}</span>
          <select
            value={proyecto}
            disabled={!cliente}
            onChange={e => selectProyecto(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm disabled:opacity-60"
          >
            <option value="">{cliente ? t('adminContab:facturacion.crear.proyectoSelect') : t('adminContab:facturacion.crear.proyectoSelectFirst')}</option>
            {proyectosDeCliente.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>

        {proyecto && (
          <div className="mb-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">{t('adminContab:facturacion.crear.entregasLabel')}</div>
            {entregasDeProyecto.length === 0 ? (
              <p className="text-xs text-slate-400">{t('adminContab:facturacion.crear.sinPendientes')}</p>
            ) : (
              <div className="space-y-2">
                {entregasDeProyecto.map(e => (
                  <label key={e.order_id} className="flex items-center gap-2.5 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={selected.includes(e.order_id)} onChange={() => toggle(e.order_id)} />
                    <span className="flex-1">{e.order_number}{e.cotizacion_folio && <> · {e.cotizacion_folio}</>}</span>
                    <span className="font-semibold">{formatCurrency(e.monto)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {selectionError && <p className="text-xs text-red-500 mb-2">{selectionError}</p>}

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('adminContab:facturacion.crear.cancelar')}</Button>
          <Button onClick={submit}>{t('adminContab:facturacion.crear.verVistaPrevia')}</Button>
        </div>
      </Card>
    </div>
  )
}

function ExportMenu(
  { t, filters }:
  { t: (key: string, opts?: Record<string, unknown>) => string; filters: Omit<InvoiceListFilters, 'view'> },
) {
  const [open, setOpen] = useState(false)
  const exportMutation = useInvoiceExport()

  function doExport(format: InvoiceExportFormat) {
    setOpen(false)
    exportMutation.mutate({ format, filters })
  }

  return (
    <div className="relative">
      <Button
        variant="secondary" className="!px-3 !py-1.5 !text-xs inline-flex items-center gap-1.5"
        onClick={() => setOpen(prev => !prev)}
        loading={exportMutation.isPending}
      >
        <IcoDownload size={13} /> {t('adminContab:facturacion.exportar.label')} <IcoChevronDown size={12} />
      </Button>
      {open && (
        <>
          {/* Overlay para cerrar al hacer clic afuera — mismo patrón liviano que el resto de menús desplegables de la app. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-20 py-1">
            <button
              type="button" onClick={() => doExport('pdf')}
              className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            >
              {t('adminContab:facturacion.exportar.pdf')}
            </button>
            <button
              type="button" onClick={() => doExport('excel')}
              className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            >
              {t('adminContab:facturacion.exportar.excel')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function AgingPanel({ t }: { t: (key: string, opts?: Record<string, unknown>) => string }) {
  const { data } = useInvoiceAging()
  const ranges = data?.ranges ?? []
  if (ranges.length === 0) return null

  return (
    <Card variant="panel" shadow className="p-4 mt-5">
      <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">{t('adminContab:facturacion.aging.title')}</div>
      <div className="text-[11px] text-slate-400 mb-3">{t('adminContab:facturacion.aging.subtitle')}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ranges.map(r => (
          <div key={r.desde_dias} className="rounded-lg border border-slate-100 dark:border-slate-700 p-3">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              {r.hasta_dias === null
                ? t('adminContab:facturacion.aging.masDe', { desde: r.desde_dias })
                : t('adminContab:facturacion.aging.rango', { desde: r.desde_dias, hasta: r.hasta_dias })}
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{formatCurrency(r.monto)}</div>
            <div className="text-[10.5px] text-slate-400 mt-0.5">{t('adminContab:facturacion.aging.cantidad', { cantidad: r.cantidad })}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function InvoiceDetailModal(
  { orderId, t, onClose }:
  { orderId: number; t: (key: string, opts?: Record<string, unknown>) => string; onClose: () => void },
) {
  const { data: detail, isLoading } = useInvoiceDetail(orderId)
  const navigate = useNavigate()
  const markMutation = useMarkUncollectible()
  const decideMutation = useDecideUncollectible()
  const pdfMutation = useDownloadInvoicePdf()
  const [motivo, setMotivo] = useState('')
  const [proposingUncollectible, setProposingUncollectible] = useState(false)
  const [motivoError, setMotivoError] = useState<string | null>(null)

  function submitMotivo() {
    if (motivo.trim() === '') {
      // RN2 REQ-448 — motivo obligatorio, mensaje inline (nunca window.alert()).
      setMotivoError(t('adminContab:facturacion.detalle.motivoRequerido'))
      return
    }
    markMutation.mutate({ orderId, motivo }, {
      onSuccess: () => { setProposingUncollectible(false); setMotivo(''); setMotivoError(null) },
    })
  }

  function decide(approve: boolean) {
    decideMutation.mutate({ orderId, approve })
  }

  function verPdf() {
    if (!detail) return
    pdfMutation.mutate({ orderId, orderNumber: detail.order_number })
  }

  function registrarCobro() {
    if (!detail || detail.master_client_id === null) return
    onClose() // cerramos el modal antes de salir de la pantalla, mismo criterio que confirmar/cancelar
    navigate(`/admin-contab/cobros?master_client_id=${detail.master_client_id}&accion=nuevo-cobro`)
  }

  const facturaCompleta = !!detail?.numero_factura
  // RN2/Escenario 3 REQ-447 — defensa doble: la Guía de Entrega nunca se muestra completa si
  // todavía no hay factura, sin importar lo que diga `guia_entrega.existe`.
  const guiaCompleta = facturaCompleta && (detail?.guia_entrega.existe ?? false)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-xl max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('adminContab:facturacion.detalle.title')}</h2>
            {detail && <p className="text-xs text-slate-400">{detail.order_number} · {detail.cliente}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><IcoClose size={16} /></button>
        </div>

        {isLoading && <p className="text-xs text-slate-400 py-4">{t('common:labels.loading')}</p>}

        {detail && (
          <div className="space-y-4">
            {/* REQ-447 — trazabilidad Cotización → Factura → Guía de Entrega, en ese orden fijo. */}
            <div className="flex items-center gap-2">
              <TrazabilidadStep label={t('adminContab:facturacion.detalle.pasoCotizacion')} done={!!detail.cotizacion_folio} sub={detail.cotizacion_folio} t={t} />
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <TrazabilidadStep label={t('adminContab:facturacion.detalle.pasoFactura')} done={facturaCompleta} sub={detail.numero_factura} t={t} />
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
              <TrazabilidadStep label={t('adminContab:facturacion.detalle.pasoGuiaEntrega')} done={guiaCompleta} sub={detail.guia_entrega.fecha} t={t} icon={<IcoTruck size={13} />} />
            </div>

            {detail.es_anulada && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg p-3 text-xs font-medium">
                <IcoAlertTriangle size={15} /> {t('adminContab:facturacion.detalle.anuladaAviso')}
              </div>
            )}

            {(detail.estado === 'facturada' || detail.estado === 'anulada') && (
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                <FiscalItemsTable items={detail.items} t={t} />
                <FiscalTotalsBlock
                  subtotal={detail.subtotal} descuentos={detail.descuentos} itbms={detail.itbms}
                  total={detail.total} monto={detail.monto}
                  saldoAplicable={detail.saldo_aplicado > 0 ? detail.saldo_aplicado : undefined}
                  totalAPagar={detail.total_a_pagar}
                  t={t}
                />
                {(detail.cuenta_pago || detail.responsable) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                    <div className="text-[10px] font-medium uppercase text-slate-400">{t('adminContab:facturacion.detalle.datosPago')}</div>
                    {detail.cuenta_pago && <div>{t('adminContab:facturacion.detalle.cuentaPago')}: {detail.cuenta_pago}</div>}
                    {detail.responsable && <div>{t('adminContab:facturacion.detalle.responsable')}: {detail.responsable}</div>}
                  </div>
                )}
                <Button
                  variant="secondary" className="!text-xs mt-3 inline-flex items-center gap-1.5"
                  onClick={verPdf} loading={pdfMutation.isPending}
                >
                  <IcoPrinter size={13} /> {t('adminContab:facturacion.detalle.verPdf')}
                </Button>
              </div>
            )}

            {/* REQ-448 — cobrabilidad, exclusiva de facturas en estado 'facturada'. */}
            {detail.estado === 'facturada' && (
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                {detail.cobrabilidad === 'normal' && !proposingUncollectible && (
                  <button
                    type="button" onClick={() => setProposingUncollectible(true)}
                    className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
                  >
                    {t('adminContab:facturacion.detalle.marcarIncobrable')}
                  </button>
                )}

                {detail.cobrabilidad === 'normal' && proposingUncollectible && (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                      {t('adminContab:facturacion.detalle.motivoLabel')}
                    </label>
                    <textarea
                      value={motivo} onChange={e => { setMotivo(e.target.value); setMotivoError(null) }}
                      placeholder={t('adminContab:facturacion.detalle.motivoPlaceholder')}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-sm"
                      rows={2}
                    />
                    {motivoError && <p className="text-xs text-red-500">{motivoError}</p>}
                    <div className="flex gap-2">
                      <Button variant="secondary" className="!text-xs" onClick={() => { setProposingUncollectible(false); setMotivo(''); setMotivoError(null) }}>
                        {t('adminContab:facturacion.crear.cancelar')}
                      </Button>
                      <Button className="!text-xs" onClick={submitMotivo} loading={markMutation.isPending}>
                        {t('adminContab:facturacion.detalle.enviarPropuesta')}
                      </Button>
                    </div>
                  </div>
                )}

                {detail.cobrabilidad === 'pendiente_aprobacion' && (
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-medium text-orange-800 dark:text-orange-300">
                      {t('adminContab:facturacion.detalle.pendienteAprobacionAviso')}
                    </p>
                    {detail.motivo_incobrable && <p className="text-xs text-slate-500 dark:text-slate-400">{detail.motivo_incobrable}</p>}
                    {detail.puede_decidir_incobrable && (
                      <div className="flex gap-2">
                        <Button variant="secondary" className="!text-xs inline-flex items-center gap-1.5" onClick={() => decide(false)} loading={decideMutation.isPending}>
                          <IcoBan size={13} /> {t('adminContab:facturacion.detalle.rechazar')}
                        </Button>
                        <Button className="!text-xs inline-flex items-center gap-1.5" onClick={() => decide(true)} loading={decideMutation.isPending}>
                          <IcoCheck size={13} /> {t('adminContab:facturacion.detalle.aprobar')}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {detail.cobrabilidad === 'incobrable' && (
                  <span className="text-[10.5px] font-semibold px-2 py-1 rounded-md bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {t('adminContab:facturacion.estados.incobrable')}
                  </span>
                )}
              </div>
            )}

            {detail.puede_registrar_cobro && (
              <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
                <Button onClick={registrarCobro}>{t('adminContab:facturacion.detalle.registrarCobro')}</Button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-700 mt-4">
          <Button variant="secondary" onClick={onClose}>{t('adminContab:facturacion.detalle.cerrar')}</Button>
        </div>
      </Card>
    </div>
  )
}

function TrazabilidadStep(
  { label, done, sub, icon, t }:
  { label: string; done: boolean; sub?: string | null; icon?: React.ReactNode; t: (key: string) => string },
) {
  return (
    <div className="flex flex-col items-center gap-1 text-center min-w-[72px]">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${done ? 'bg-primary-soft text-primary-dark' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
        {done ? <IcoCheck size={14} /> : (icon ?? <IcoClock size={14} />)}
      </div>
      <div className="text-[10.5px] font-medium text-slate-600 dark:text-slate-300">{label}</div>
      <div className="text-[9.5px] text-slate-400">{done ? sub : t('adminContab:facturacion.detalle.pendiente')}</div>
    </div>
  )
}
