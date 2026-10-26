import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  useInvoiceSummary, useInvoiceList, useInvoiceSellers, useInvoicePreview, useCreateInvoice, useInvoiceExport, useInvoiceAging,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import {
  IcoFileText, IcoChevronRight, IcoSearch, IcoClose, IcoDownload, IcoChevronDown,
} from '@/components/icons'
import { FiscalItemsTable, FiscalTotalsBlock } from '@/components/admin-contab/FiscalDocumentPreview'
import InvoiceDetailModal from '@/components/admin-contab/InvoiceDetailModal'
import ReceptorGuardNotice from '@/components/admin-contab/ReceptorGuardNotice'
import type {
  CarteraTab, EntregaEstado, FacturacionView, InvoiceEntry, InvoiceModo, InvoicePreviewResponse, InvoiceExportFormat,
  InvoiceListFilters,
} from '@/types/adminContab'
import { UserMultiSelect } from '@/components/UserMultiSelect'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'
import { getRegion } from '@/lib/region'

/**
 * Batch 2 del cuerpo principal de Admin&Cont (SCRUM-513→518, REQ-436→441) — Facturación.
 *
 * "Entrega" = `Bodega\Models\Order` — ver nota de reconciliación en `types/adminContab.ts` sobre
 * por qué este batch NO implementa el modelo de "hitos" múltiples por proyecto del mockup. Vista
 * siempre se pide en `plana` al backend (el agrupado por proyecto lo arma este componente en
 * memoria) — desacopla el fetch de cómo se renderiza.
 */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(getRegion().locale, { style: 'currency', currency: getRegion().currency }).format(value)
}

function mutationErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string; errors?: unknown }>(err) ? err.response?.data : undefined
  // Guardado en lote rechazado (422): además del mensaje general, el motivo de cada pedido (p. ej. el RUC que no validó).
  const detalle = Array.isArray(data?.errors)
    ? (data.errors as { missing?: string[] }[]).flatMap(e => e.missing ?? []).filter(Boolean)
    : []
  const motivos = [...new Set(detalle)].join('\n')
  return motivos !== '' ? `${data?.message ?? fallback}\n${motivos}` : (data?.message ?? fallback)
}

// SCRUM-856 — acceso directo sin cliente preseleccionado (mismo mecanismo de ventana/pestaña
// nueva que el acceso por proyecto de más abajo, para consistencia con el patrón ya existente).
function openEstadoCuenta(masterClientId?: number) {
  const query = masterClientId !== undefined ? `?master_client_id=${masterClientId}` : ''
  window.open(`/admin-contab/facturacion/estado-cuenta${query}`, '_blank')
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

// SCRUM-929 — una fila ya NO es 1:1 con `order_id` (la raíz puede tener su parcial y el completo,
// ambas con el mismo `order_id`): la clave real es `invoice_id` (facturada) o `order_id` (pendiente,
// a lo sumo una por entrega). Ver ADR §4.3.
function rowKey(entry: InvoiceEntry): string {
  return entry.invoice_id !== null ? `inv-${entry.invoice_id}` : `pending-${entry.order_id}`
}

// SCRUM-929 — agrupa las filas de un PEDIDO (varias facturas y/o entregas pendientes pueden
// compartir `pedido_id`) para renderizar el botón "Facturar pedido completo" una sola vez por
// pedido, no una vez por fila.
function groupByPedido(entries: InvoiceEntry[]): [number, InvoiceEntry[]][] {
  const map = new Map<number, InvoiceEntry[]>()
  for (const e of entries) {
    if (!map.has(e.pedido_id)) map.set(e.pedido_id, [])
    map.get(e.pedido_id)!.push(e)
  }
  return Array.from(map.entries())
}

export default function FacturacionPage() {
  const { t } = useTranslation(['common', 'adminContab', 'bodega'])
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [cartera, setCartera] = useState<CarteraTab>('cobrable')
  const [view, setView] = useState<FacturacionView>('agrupado')
  const [search, setSearch] = useState('')
  // SCRUM-1176 — el campo responde al instante; la consulta sale tras 250 ms sin teclear (mínimo 2 caracteres; vaciar restaura el listado).
  const searchTerm = useDebouncedSearchTerm(search)
  const [cliente, setCliente] = useState('')
  const [proyecto, setProyecto] = useState('')
  // SCRUM-1175 — vendedores elegidos: el pedido entra si cualquiera de sus responsables está entre ellos (en todas las páginas, no solo la visible).
  const [vendedorIds, setVendedorIds] = useState<number[]>([])
  const { data: vendedoresOpciones } = useInvoiceSellers()
  const [estado, setEstado] = useState<EntregaEstado | ''>('')
  // SCRUM-1147 — Cobradas / Por cobrar ('' = todas).
  const [cobro, setCobro] = useState<'cobradas' | 'por_cobrar' | ''>('')
  // SCRUM-156/159 (Gerencia → "Variación margen"/panel Facturación): la tarjeta y
  // el clic en barra navegan acá con ?desde=&hasta= — antes se ignoraba, esta
  // pantalla nunca leía la URL al montar.
  const [desde, setDesde] = useState(() => searchParams.get('desde') ?? '')
  const [hasta, setHasta] = useState(() => searchParams.get('hasta') ?? '')
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({})
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [previewOrderIds, setPreviewOrderIds] = useState<number[] | null>(null)
  const [previewModo, setPreviewModo] = useState<InvoiceModo | undefined>(undefined)
  const [previewFromWizard, setPreviewFromWizard] = useState(false)
  // Estado del wizard "+ Crear Factura" subido a este nivel (RN3 REQ-443 — "Editar" desde la
  // vista previa vuelve al formulario sin perder cliente/proyecto/selección ya elegidos).
  const [wizardCliente, setWizardCliente] = useState('')
  const [wizardProyecto, setWizardProyecto] = useState('')
  const [wizardSelected, setWizardSelected] = useState<number[]>([])
  // Batch 4 (REQ-447) — modal de detalle/trazabilidad, se abre al hacer clic en cualquier fila.
  // SCRUM-929 — `invoiceId` acompaña a `orderId` para elegir la factura exacta cuando la tarjeta
  // tiene más de una activa (la raíz con su parcial y el completo).
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null)
  const [detailInvoiceId, setDetailInvoiceId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const listFilters = {
    tab: cartera,
    view: 'plana' as const, // el agrupado lo arma este componente — el fetch siempre trae la lista plana
    cliente: cliente || undefined,
    proyecto: proyecto || undefined,
    vendedor_ids: vendedorIds.length > 0 ? vendedorIds : undefined,
    estado: estado || undefined,
    cobro: cobro || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    search: searchTerm || undefined,
  }
  // SCRUM-947 — page/per_page NO viajan en ExportMenu (usa `listFilters` tal cual, ver abajo): un
  // export debe traer TODO lo que matchea el filtro, nunca una sola página.
  const { data: listResult, isLoading } = useInvoiceList({ ...listFilters, page, per_page: perPage })

  const list = listResult?.rows ?? []
  const totalEnTab = listResult?.total_en_tab ?? list.length
  const meta = listResult?.meta

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
    setPreviewModo(undefined) // el wizard solo ofrece pedidos "completo" (ver CrearFacturaModal) — sin ambigüedad de modo por id.
    setPreviewOrderIds(orderIds)
  }

  // SCRUM-929 — `modo` ausente = 'completo' (comportamiento de siempre, un pedido/entrega única).
  function openPreviewSingle(orderId: number, modo?: InvoiceModo) {
    setPreviewFromWizard(false)
    setPreviewModo(modo)
    setPreviewOrderIds([orderId])
  }

  function backToWizard() {
    setPreviewOrderIds(null)
    setCreatingInvoice(true)
  }

  function closePreview() {
    setPreviewOrderIds(null)
    setPreviewModo(undefined)
    setPreviewFromWizard(false)
  }

  function handleInvoiceConfirmed() {
    setPreviewOrderIds(null)
    setPreviewModo(undefined)
    setPreviewFromWizard(false)
    resetWizard()
  }

  function openDetail(orderId: number, invoiceId: number | null) {
    setDetailOrderId(orderId)
    setDetailInvoiceId(invoiceId)
  }

  function closeDetail() {
    setDetailOrderId(null)
    setDetailInvoiceId(null)
  }

  const clientesOptions = useMemo(() => Array.from(new Set(list.map(e => e.cliente))).sort(), [list])
  // SCRUM-980 — un pedido sin proyecto real (`proyecto === null`, ver InvoiceEntry) nunca puede
  // facturarse (RN2 REQ-441 lo rechaza server-side por falta de Cotización/Monto/Cliente) — no
  // tiene sentido ofrecerlo como opción de filtro.
  const proyectosOptions = useMemo(
    () => Array.from(new Set(list.flatMap(e => e.proyecto !== null ? [e.proyecto] : []))).sort(),
    [list],
  )

  const groups = useMemo(() => {
    const map = new Map<number | null, { proyecto: string | null; cliente: string; master_client_id: number | null; cotizacion_folio: string | null; entries: InvoiceEntry[] }>()
    for (const e of list) {
      if (!map.has(e.sales_project_id)) {
        map.set(e.sales_project_id, { proyecto: e.proyecto, cliente: e.cliente, master_client_id: e.master_client_id, cotizacion_folio: e.cotizacion_folio, entries: [] })
      }
      map.get(e.sales_project_id)!.entries.push(e)
    }
    return Array.from(map.entries())
  }, [list])

  function clearFilters() {
    setSearch(''); setCliente(''); setProyecto(''); setVendedorIds([]); setEstado(''); setCobro(''); setDesde(''); setHasta(''); setPage(1)
  }

  const hasFilters = !!(search || cliente || proyecto || vendedorIds.length > 0 || estado || cobro || desde || hasta)

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
        <div className="flex gap-2">
          {/* SCRUM-897 — mismo botón/pantalla de Bodega→Pedidos, reusado tal cual (misma ruta,
              misma key de traducción) — Admin&Cont ya tiene acceso vía `admin_contab.view` al
              permiso de la ruta (ver App.tsx), sin necesidad de duplicar el componente. */}
          <Button variant="secondary" onClick={() => navigate('/bodega/pedidos/status')}>
            {t('bodega:pedidos.actions.orderStatus')}
          </Button>
          {/* SCRUM-856 — acceso directo a Estado de Cuenta, sin filtros preseleccionados. */}
          <Button variant="secondary" onClick={() => openEstadoCuenta()}>
            {t('adminContab:facturacion.estadoCuenta')}
          </Button>
          <Button onClick={openWizard}>{t('adminContab:facturacion.crearFactura')}</Button>
        </div>
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
              <Button variant="secondary" active={cartera === 'cobrable'} className="!px-3 !py-1.5 !text-xs" onClick={() => { setCartera('cobrable'); setPage(1) }}>
                {t('adminContab:facturacion.cartera.cobrable')}
              </Button>
              <Button variant="secondary" active={cartera === 'incobrable'} className="!px-3 !py-1.5 !text-xs" onClick={() => { setCartera('incobrable'); setPage(1) }}>
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
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder={t('adminContab:facturacion.filtros.buscarPlaceholder')}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={cliente} onChange={e => { setCliente(e.target.value); setPage(1) }} className={selectClass}>
              <option value="">{t('adminContab:facturacion.filtros.todosClientes')}</option>
              {clientesOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={proyecto} onChange={e => { setProyecto(e.target.value); setPage(1) }} className={selectClass}>
              <option value="">{t('adminContab:facturacion.filtros.todosProyectos')}</option>
              {proyectosOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <UserMultiSelect
              users={vendedoresOpciones ?? []} selectedIds={vendedorIds}
              onChange={ids => { setVendedorIds(ids); setPage(1) }}
              placeholder={t('adminContab:facturacion.filtros.vendedor')}
            />
            <select value={estado} onChange={e => { setEstado(e.target.value as EntregaEstado | ''); setPage(1) }} className={selectClass}>
              <option value="">{t('adminContab:facturacion.filtros.todosEstados')}</option>
              {(['pendiente-facturar', 'facturada'] as const).map(s => (
                <option key={s} value={s}>{t(`adminContab:facturacion.estados.${s}`)}</option>
              ))}
            </select>
            {/* SCRUM-1147 — identifica de un vistazo qué facturas tienen cobro pendiente. */}
            <select
              value={cobro}
              aria-label={t('adminContab:facturacion.filtros.cobro')}
              onChange={e => { setCobro(e.target.value as 'cobradas' | 'por_cobrar' | ''); setPage(1) }}
              className={selectClass}
            >
              <option value="">{t('adminContab:facturacion.filtros.todasCobro')}</option>
              <option value="cobradas">{t('adminContab:facturacion.filtros.cobradas')}</option>
              <option value="por_cobrar">{t('adminContab:facturacion.filtros.porCobrar')}</option>
            </select>
            <input type="date" value={desde} onChange={e => { setDesde(e.target.value); setPage(1) }} className={selectClass} title="Desde" />
            <input type="date" value={hasta} onChange={e => { setHasta(e.target.value); setPage(1) }} className={selectClass} title="Hasta" />
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
            {groups.map(([projectId, group]) => {
              // SCRUM-980 — projectId es null cuando el pedido no tiene PipelineCard/SalesProject
              // real (mismo caso raíz que el wizard "+ Crear Factura"); -1 nunca es un id real de
              // sales_project (autoincrement de Postgres), sirve de key/toggle-state estable.
              const key = projectId ?? -1
              return (
                <FactGroup
                  key={key}
                  open={!!openGroups[key]}
                  onToggle={() => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))}
                  group={group}
                  t={t}
                  onOpenPreview={openPreviewSingle}
                  onOpenDetail={openDetail}
                />
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            {groupByPedido(list).map(([pedidoId, entries]) => (
              <PedidoBlock key={pedidoId} entries={entries} flat t={t} onOpenPreview={openPreviewSingle} onOpenDetail={openDetail} />
            ))}
          </div>
        )}

        {meta && (
          <Pagination
            meta={meta}
            perPage={perPage}
            onPageChange={setPage}
            onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
          />
        )}
      </Card>

      <AgingPanel t={t} />

      {detailOrderId !== null && (
        <InvoiceDetailModal orderId={detailOrderId} invoiceId={detailInvoiceId} t={t} onClose={closeDetail} />
      )}

      {previewOrderIds && (
        <PreviewModal
          orderIds={previewOrderIds}
          modo={previewModo}
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
    group: { proyecto: string | null; cliente: string; master_client_id: number | null; cotizacion_folio: string | null; entries: InvoiceEntry[] }
    t: (key: string, opts?: Record<string, unknown>) => string
    onOpenPreview: (orderId: number, modo?: InvoiceModo) => void
    onOpenDetail: (orderId: number, invoiceId: number | null) => void
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
          {/* SCRUM-929 — un proyecto puede tener más de un pedido; cada uno arma su propio bloque
              (sus filas + el botón "Facturar pedido completo" cuando aplica). */}
          {groupByPedido(group.entries).map(([pedidoId, entries]) => (
            <PedidoBlock key={pedidoId} entries={entries} t={t} onOpenPreview={onOpenPreview} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * SCRUM-929 — un PEDIDO puede tener varias filas (una por factura + una por cada entrega pendiente).
 * Renderiza cada fila y, si el pedido se factura por entrega y todavía admite un `completo` (cubre
 * lo que falta), un único botón "Facturar pedido completo" al final — no uno por fila, el dato
 * (`puede_facturar_completo`/`restante`) viene repetido en cada fila del mismo pedido.
 */
function PedidoBlock(
  { entries, flat, t, onOpenPreview, onOpenDetail }:
  {
    entries: InvoiceEntry[]
    flat?: boolean
    t: (key: string, opts?: Record<string, unknown>) => string
    onOpenPreview: (orderId: number, modo?: InvoiceModo) => void
    onOpenDetail: (orderId: number, invoiceId: number | null) => void
  },
) {
  const primera = entries[0]
  const ofrecerCompleto = primera.facturacion_por_entrega && primera.puede_facturar_completo
  return (
    <div className={flat ? 'divide-y divide-slate-100 dark:divide-slate-700' : undefined}>
      {entries.map(entry => (
        <FactRow key={rowKey(entry)} entry={entry} flat={flat} t={t} onGenerarFactura={onOpenPreview} onOpenDetail={onOpenDetail} />
      ))}
      {ofrecerCompleto && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-primary-soft/30 dark:bg-primary/5">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {t('adminContab:facturacion.facturarCompleto.restante', { monto: formatCurrency(primera.restante) })}
          </span>
          <button
            type="button"
            onClick={() => onOpenPreview(primera.order_id, 'completo')}
            className="text-[11px] font-medium text-primary-dark bg-primary-soft rounded-md px-2.5 py-1.5 hover:brightness-95 whitespace-nowrap"
          >
            {t('adminContab:facturacion.facturarCompleto.boton')}
          </button>
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
    onGenerarFactura: (orderId: number, modo?: InvoiceModo) => void
    /** REQ-447 — clic en cualquier fila abre el modal de detalle/trazabilidad. */
    onOpenDetail: (orderId: number, invoiceId: number | null) => void
  },
) {
  const pill = pillFor(entry, t)
  const porEntrega = entry.facturacion_por_entrega && !!entry.entrega
  return (
    <div
      className="grid grid-cols-[1.5fr_1fr_0.9fr_0.9fr_0.9fr_1fr] gap-3 items-center px-4 py-2.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30"
      onClick={() => onOpenDetail(entry.order_id, entry.invoice_id)}
    >
      <div className="min-w-0">
        <div className="font-medium text-slate-800 dark:text-slate-100 truncate">{entry.order_number}</div>
        {flat && <div className="text-[10.5px] text-slate-400 truncate">{entry.cliente} · {entry.proyecto}</div>}
        {/* SCRUM-929 — con facturación por entrega, cada fila es SU entrega ("Entrega 2 de 3"); en
            un pedido de entrega única / solo-completo se conserva el aviso agregado de siempre. */}
        {porEntrega ? (
          <div className="text-[10.5px] text-slate-400">
            {t('adminContab:facturacion.entregaSecuencia', { seq: entry.entrega!.sequence_in_family, total: entry.entrega!.total_in_family })}
          </div>
        ) : entry.entregas_del_pedido && entry.entregas_del_pedido.length > 1 && (
          <div className="text-[10.5px] text-slate-400">
            {t('adminContab:facturacion.entregasParciales', { count: entry.entregas_del_pedido.length })}
          </div>
        )}
      </div>
      {/* SCRUM-1175 — vendedores responsables del pedido; «—» si no tiene. */}
      <div className="min-w-0 text-xs text-slate-500 dark:text-slate-300 truncate" data-testid="fila-vendedor" title={(entry.vendedores ?? []).join(', ')}>
        {(entry.vendedores ?? []).length > 0 ? entry.vendedores!.join(', ') : '—'}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-300">
        {entry.numero_factura ?? '—'}
        {entry.tipo_factura === 'parcial' && <span className="text-slate-400"> · {t('adminContab:facturacion.tipoFactura.parcial')}</span>}
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-300">{entry.cotizacion_folio ?? '—'}</div>
      <div className="text-xs font-medium text-slate-800 dark:text-slate-100">
        {entry.monto !== null ? formatCurrency(entry.monto) : '—'}
        {/* SCRUM-1147 — saldo a favor aplicable (informativo), en rojo; sin saldo no se muestra nada. */}
        {entry.saldo_a_favor != null && entry.saldo_a_favor > 0 && (
          <span className="ml-1.5 text-red-600 dark:text-red-400" title={t('adminContab:facturacion.saldoAFavorTitulo')}>
            {t('adminContab:facturacion.saldoAFavor', { monto: formatCurrency(entry.saldo_a_favor) })}
          </span>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        {entry.estado === 'pendiente-facturar' ? (
          porEntrega ? (
            <button
              type="button"
              disabled={!entry.puede_facturar_entrega}
              title={entry.motivo_entrega_no_disponible ?? undefined}
              onClick={e => { e.stopPropagation(); onGenerarFactura(entry.order_id, 'entrega') }}
              className="text-[11px] font-medium text-primary-dark bg-primary-soft rounded-md px-2.5 py-1.5 hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100"
            >
              {t('adminContab:facturacion.generarFacturaEntrega')}
            </button>
          ) : (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onGenerarFactura(entry.order_id) }}
              className="text-[11px] font-medium text-primary-dark bg-primary-soft rounded-md px-2.5 py-1.5 hover:brightness-95"
            >
              {t('adminContab:facturacion.generarFactura')}
            </button>
          )
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
  { orderIds, modo, fromWizard, t, onClose, onEdit, onConfirmed }:
  {
    orderIds: number[]
    modo?: InvoiceModo
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
  // SCRUM-1140 — clientes (sub_client_id) cuya factura se emite a Consumidor final por decisión de quien factura. La decisión
  // es por cliente en pantalla y se traduce a los pedidos del lote que cuelgan de él al guardar.
  const [consumidorFinal, setConsumidorFinal] = useState<number[]>([])

  // También se vuelve a llamar tras corregir un RUC desde el aviso de la guarda: la vista previa se recalcula
  // (y la DGI se vuelve a consultar) con los datos ya guardados.
  function loadPreview() {
    setPreview(null)
    setError(null)
    previewMutation.mutate({ orderIds, modo }, {
      onSuccess: setPreview,
      onError: err => setError(mutationErrorMessage(err, t('adminContab:facturacion.preview.error'))),
    })
  }

  useEffect(() => {
    loadPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orderIds/modo son estables por identidad del modal, corre una sola vez al abrir
  }, [])

  function confirm() {
    if (createMutation.isPending) return // doble clic: el segundo POST daba "ya tiene una factura" tras un éxito real
    const consumidorFinalOrderIds = (preview?.results ?? [])
      .filter(r => r.ok && r.receptor_validacion?.sub_client_id != null && consumidorFinal.includes(r.receptor_validacion.sub_client_id))
      .map(r => r.order_id)
    createMutation.mutate({ order_ids: orderIds, modo, ...(consumidorFinalOrderIds.length > 0 ? { consumidor_final_order_ids: consumidorFinalOrderIds } : {}) }, {
      onSuccess: onConfirmed,
      onError: err => setError(mutationErrorMessage(err, t('adminContab:facturacion.confirmError'))),
    })
  }

  const results = preview?.results ?? []
  const hasErrors = results.some(r => !r.ok)
  // Guarda de RUC: mientras algún receptor no valide contra la DGI no se puede guardar ninguna factura del lote.
  // Un cliente marcado como Consumidor final deja de bloquear: sale sin documento.
  const esConsumidorFinal = (subId: number | null | undefined) => subId != null && consumidorFinal.includes(subId)
  const receptorBloquea = results.some(r => r.ok && r.receptor_validacion?.bloquea === true && !esConsumidorFinal(r.receptor_validacion.sub_client_id))
  // Un mismo cliente puede aparecer en varias facturas del lote: su aviso/formulario se muestra una sola vez.
  const receptoresMostrados = new Set<number>()
  // SCRUM-902 §4.3 — el saldo a favor ya no se aplica al generar la factura (siempre se genera
  // por su monto completo); se retiró `aplicar_saldo_favor`/`saldo_disponible`/`saldo_aplicable`/
  // `total_a_pagar`/`aviso_saldo_solo_primera` de este flujo por completo.
  const totalFactura = results.filter(r => r.ok).reduce((sum, r) => sum + (r.total ?? r.monto ?? 0), 0)

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
            {results.map(r => (
              <div key={r.order_id} className="border-b border-slate-100 dark:border-slate-700 pb-3">
                {r.ok ? (
                  <>
                    <div className="flex justify-between items-baseline mb-1.5">
                      <div>
                        <div className="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          {r.order_number}
                          {r.tipo === 'parcial' && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary-soft text-primary-dark">
                              {t('adminContab:facturacion.tipoFactura.parcial')}
                            </span>
                          )}
                        </div>
                        {r.cliente && <div className="text-[10.5px] text-slate-400">{r.cliente}</div>}
                        {r.cotizacion_folio && <div className="text-[10.5px] text-slate-400">{r.cotizacion_folio}</div>}
                      </div>
                    </div>

                    {r.receptor_validacion && (() => {
                      const subId = r.receptor_validacion.sub_client_id
                      if (subId !== null) {
                        if (receptoresMostrados.has(subId)) return null
                        receptoresMostrados.add(subId)
                      }
                      return (
                        <ReceptorGuardNotice
                          receptor={r.receptor_validacion}
                          cliente={r.cliente}
                          onCorrected={loadPreview}
                          consumidorFinal={esConsumidorFinal(subId)}
                          onConsumidorFinalChange={subId === null ? undefined : (v: boolean) => setConsumidorFinal(prev => v ? [...new Set([...prev, subId])] : prev.filter(id => id !== subId))}
                        />
                      )
                    })()}

                    {/* SCRUM-929 — una parcial que no cierra el pedido deja saldo; se avisa cuánto en vez
                        del viejo mensaje genérico "una sola factura por el total" (ya no aplica: facturar
                        por entrega es una opción de primera clase, no un caso a advertir). */}
                    {r.tipo === 'parcial' && !r.cierra_pedido && r.restante_despues !== undefined && r.restante_despues > 0 && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                        {t('adminContab:facturacion.preview.restanteDespues', { monto: formatCurrency(r.restante_despues) })}
                      </p>
                    )}

                    {/* Advertencias REALES del backend (F6/F7 del ADR) — descuadres contra la
                        cotización recalculada hoy, nunca un mensaje inventado en el frontend. */}
                    {r.advertencias && r.advertencias.length > 0 && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 mb-1.5 space-y-1">
                        {r.advertencias.map((a, i) => (
                          <p key={i} className="text-[11px] text-amber-800 dark:text-amber-300">{a}</p>
                        ))}
                      </div>
                    )}

                    <FiscalItemsTable items={r.items} t={t} />
                    <FiscalTotalsBlock
                      subtotal={r.subtotal} descuentos={r.descuentos} itbms={r.itbms}
                      total={r.total} monto={r.monto}
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
                  <span>{t('adminContab:facturacion.preview.total')}</span>
                  <span>{formatCurrency(totalFactura)}</span>
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
          <Button onClick={confirm} disabled={!preview || hasErrors || receptorBloquea} loading={createMutation.isPending}>{t('adminContab:facturacion.preview.guardar')}</Button>
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

  // SCRUM-980 — un pedido sin proyecto real (`proyecto === null`) nunca tuvo un PipelineCard con
  // Cotización/Monto/Cliente detrás y jamás va a poder facturarse (RN2 REQ-441 lo rechaza
  // server-side) — excluirlo acá, no solo dejar que la Vista previa lo rechace después de que el
  // usuario ya recorrió el wizard entero. El type predicate narrea `proyecto`/`sales_project_id`
  // a no-null para el resto del wizard (clientes/proyectosDeCliente/entregasDeProyecto).
  const pendientes = entries.filter(
    (e): e is InvoiceEntry & { proyecto: string; sales_project_id: number } =>
      e.estado === 'pendiente-facturar' && e.proyecto !== null,
  )
  const clientes = Array.from(new Set(pendientes.map(e => e.cliente))).sort()
  const proyectosDeCliente = Array.from(new Set(pendientes.filter(e => e.cliente === cliente).map(e => e.proyecto))).sort()
  // SCRUM-929 — este wizard solo batchea PEDIDOS enteros (`modo` es a nivel de llamada, ver ADR
  // §4.1: no se puede mezclar en un mismo submit una entrega puntual con un pedido completo). Un
  // pedido que se factura por entrega tiene su propio botón "Generar factura de esta entrega" y
  // "Facturar pedido completo" directamente en la tabla — no entra a este selector.
  const entregasDeProyecto = pendientes.filter(e => e.cliente === cliente && e.proyecto === proyecto && !e.facturacion_por_entrega)
  const soloPorEntrega = proyecto !== '' && entregasDeProyecto.length === 0
    && pendientes.some(e => e.cliente === cliente && e.proyecto === proyecto && e.facturacion_por_entrega)

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
            {soloPorEntrega ? (
              // SCRUM-929 — este pedido se factura por entrega: sus botones viven en la tabla principal.
              <p className="text-xs text-slate-400">{t('adminContab:facturacion.crear.soloPorEntrega')}</p>
            ) : entregasDeProyecto.length === 0 ? (
              <p className="text-xs text-slate-400">{t('adminContab:facturacion.crear.sinPendientes')}</p>
            ) : (
              <div className="space-y-2">
                {entregasDeProyecto.map(e => (
                  <label key={e.order_id} className="flex items-center gap-2.5 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={selected.includes(e.order_id)} onChange={() => toggle(e.order_id)} />
                    <span className="flex-1">{e.order_number}{e.cotizacion_folio && <> · {e.cotizacion_folio}</>}</span>
                    <span className="font-semibold">{e.monto !== null ? formatCurrency(e.monto) : '—'}</span>
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
