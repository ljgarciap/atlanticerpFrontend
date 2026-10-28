import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useToastStore } from '@/store/toastStore'
import { useAuthStore } from '@/store/authStore'
import { hasGerenciaScope } from '@/lib/gerenciaScope'
import { useDebouncedSearchTerm } from '@/hooks/useDebouncedValue'
import type { CatalogItem, CatalogPdfExportStatus } from '@/types/ventasDiseno'
import type { CatalogProductCategory } from '@/types/compras'
import DemoModeBadge from '@/components/DemoModeBadge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { IcoGrid, IcoList, IcoClose, IcoCheck, IcoAlertTriangle, IcoImage, IcoFileText } from '@/components/icons'
import { useProductCategories } from '@/hooks/useProductCategories'

type ViewMode = 'grid' | 'list'
type StockFilter = 'con' | 'sin' | ''

const CATALOG_QUERY_KEY = 'ventas-diseno-catalog'

function fmtMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * SCRUM-695→702 (REQ-615→622, Batch E del Epic CRM SCRUM-332) — pantalla "Catálogo": vista
 * comercial transversal (se abre desde Pipeline/Clientes, ver botones habilitados ahí — SCRUM-711
 * la dejó visual-only "hasta que se desarrolle el módulo CRM", eso es ahora). Reemplaza la
 * pantalla de "modo consulta" (SCRUM-70/92/100) que vivía en esta misma ruta — mismo archivo,
 * mismo `/ventas-diseno/catalog`, para no dejar 2 rutas de Catálogo compitiendo ni duplicar el
 * wiring ya hecho (botones/AppShell title/tests). El buscador viejo (`ventasDisenoApi.
 * catalogProducts`/`catalogProductFamilies`, namespace i18n `ventasDiseno:catalog.*`) sigue vivo
 * SIN CAMBIOS dentro de `QuotePartCard.tsx` (REQ-036/037, picker de ítems de Cotización) — por
 * eso esta pantalla usa un namespace i18n nuevo (`ventasDiseno:catalogScreen.*`) en vez de
 * reusar/pisar `catalog.*`.
 *
 * Nunca renderiza cost/import_cost/freight_cost/handling_cost/other_cost/cost_total/
 * margin_percent/por_servir/por_ingresar/estado/rotation/provider_* — el backend
 * (`CatalogController`/`CatalogService`) ya los excluye del JSON, esta pantalla ni siquiera los
 * tipa (ver `CatalogItem` en types/ventasDiseno.ts).
 */
export default function VentasDisenoCatalogPage() {
  const { t }     = useTranslation(['common', 'ventasDiseno', 'compras'])
  const { label: categoryLabel } = useProductCategories()
  const navigate  = useNavigate()
  const showToast = useToastStore(s => s.show)
  const queryClient = useQueryClient()
  const user = useAuthStore(s => s.user)

  // SCRUM-739 (UAT-2) — mismo criterio que Sidebar.isMenuEntryVisible: ausencia de
  // override (undefined) significa visible, solo un `false` explícito oculta el botón.
  const canSeeInventoryCompras = user?.menuVisibility?.ventas_diseno?.catalogo_inventario_compras !== false
  // SCRUM-785 RN1 — Vendedor/Diseñador nunca ve este atajo, independiente del estado UAT: es
  // gestión interna de inventario, fuera de las acciones de su rol sobre Catálogo.
  const canSeeInventoryBodega  = user?.menuVisibility?.ventas_diseno?.catalogo_inventario_bodega !== false
    && hasGerenciaScope(user)

  const [search, setSearch]     = useState('')
  const [category, setCategory] = useState<CatalogProductCategory | ''>('')
  const [familyId, setFamilyId] = useState<number | ''>('')
  const [stock, setStock]       = useState<StockFilter>('')
  const [view, setView]         = useState<ViewMode>('grid')
  const [page, setPage]         = useState(1)
  const [perPage, setPerPage]   = useState<number | 'all'>(20)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [selectingAll, setSelectingAll] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [sendingSelected, setSendingSelected] = useState(false)
  const [sendingFull, setSendingFull]         = useState(false)

  // SCRUM-998 — catálogo grande generado en segundo plano (ZIP de volúmenes). El identificador viaja en `?export=`: lo pone
  // `handleSend()` al recibir el 202 (para ver el avance de inmediato) y el enlace del aviso in-app (para abrir la descarga).
  const [searchParams, setSearchParams] = useSearchParams()
  const exportId = searchParams.get('export')
  const { data: exportStatus, isError: exportError } = useQuery({
    queryKey: ['catalog-pdf-export', exportId],
    queryFn: () => ventasDisenoApi.catalog.pdfExport(exportId as string),
    enabled: !!exportId,
    retry: false,
    refetchInterval: q => (q.state.data?.status === 'queued' || q.state.data?.status === 'running') ? 10_000 : false,
  })

  // SCRUM-992 — el input responde al instante, pero el request solo sale tras 250 ms sin teclear
  // (mínimo 2 caracteres; vaciar restaura el listado). REQ-617 (tiempo real, sin botón) se mantiene.
  const searchTerm = useDebouncedSearchTerm(search)

  const filters = {
    search:    searchTerm || undefined,
    category:  category || undefined,
    family_id: familyId || undefined,
    stock:     stock || undefined,
  }

  const { data, isLoading } = useQuery({
    queryKey: [CATALOG_QUERY_KEY, filters, page, perPage],
    queryFn:  () => ventasDisenoApi.catalog.list({ ...filters, page, per_page: perPage }),
    placeholderData: keepPreviousData,
  })

  const items      = data?.data ?? []
  const meta       = data?.meta
  const categories = data?.categories ?? []
  const families   = data?.families ?? []

  // SCRUM-754 (2026-08-18) — esta pantalla pasó a paginar desde el backend (antes traía el
  // universo filtrado completo de una, ver docblock de CatalogService). El hallazgo de Pre-QA
  // 2026-07-31 (SCRUM-699/REQ-619, `selected` con ids fantasma tras cambiar de filtro) ya no se
  // resuelve podando contra `items` — eso ahora es solo la página actual, y podar por página
  // borraría selección de OTRAS páginas al navegar. En su lugar, la selección se limpia por
  // completo cada vez que cambia algún FILTRO (no la página) — mismo invariante de RN1
  // ("seleccionar todo" = productos que matchean el filtro actual), sin necesitar el universo
  // completo en el cliente solo para validar qué sigue siendo válido.
  useEffect(() => {
    setSelected(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, category, familyId, stock])

  // La página se reinicia cuando cambia el término efectivo (no en cada tecla), para no disparar
  // un request extra con el término viejo y page=1.
  useEffect(() => { setPage(1) }, [searchTerm])

  function goToPage(next: number) {
    setPage(next)
  }

  function changePerPage(next: number | 'all') {
    setPerPage(next)
    setPage(1)
  }

  // Checkbox de encabezado: refleja si TODA la página actual está seleccionada (no el universo
  // filtrado completo — eso solo lo sabemos tras un "Seleccionar todo" real, ver más abajo).
  const allSelected = items.length > 0 && items.every(i => selected.has(i.id))

  function toggleSelect(id: number, checked: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }

  // REQ-619 RN1 — "Seleccionar todo" sigue significando "todos los productos que matchean el
  // filtro actual", no solo la página visible. Como el listado ya pagina, se pide aparte el
  // universo filtrado completo (per_page=all, mismos filtros) en vez de leerlo de `items`.
  async function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set())
      return
    }
    setSelectingAll(true)
    try {
      const full = await ventasDisenoApi.catalog.list({ ...filters, per_page: 'all' })
      setSelected(new Set(full.data.map(i => i.id)))
    } finally {
      setSelectingAll(false)
    }
  }

  // SCRUM-702 (REQ-622) — genera y descarga el PDF real del catálogo. `mode` distingue completo
  // vs. la selección actual (`selected`, ya podada a lo visible por el efecto de arriba). Cada
  // botón tiene su propio flag de loading para no bloquear el otro durante la descarga.
  async function handleSend(mode: 'completo' | 'seleccionados') {
    const setLoading = mode === 'completo' ? setSendingFull : setSendingSelected
    setLoading(true)
    try {
      const result = await ventasDisenoApi.catalog.sendPdf(mode, mode === 'seleccionados' ? [...selected] : undefined)
      if (result.queued) {
        // SCRUM-998 — demasiado grande para un PDF plano: se genera en volúmenes en segundo plano y se avisa al terminar.
        showToast(t('ventasDiseno:catalogScreen.sendQueued', { count: result.totalProducts, volumes: result.volumes }), 'success')
        setSearchParams({ export: result.exportId }, { replace: true })
      } else {
        showToast(t('ventasDiseno:catalogScreen.sendSuccess'), 'success')
      }
    } catch {
      showToast(t('ventasDiseno:catalogScreen.sendError'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const selectClass = 'border border-slate-200 rounded-lg px-2 py-2 md:py-1.5 text-sm md:text-[12px] bg-white focus:outline-none focus:border-[#5BA5A0]'

  return (
    <>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {t('ventasDiseno:catalog.pageTitle')}
            </h1>
            <DemoModeBadge />
          </div>
          {!isLoading && meta && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              {t('ventasDiseno:catalogScreen.resultsCount', { count: meta.total })}
            </p>
          )}
        </div>
        {/* REQ-620 — atajos de navegación, cada pantalla destino ya tiene su propio gate (RN3: no
            amplía ni restringe permisos acá). */}
        <div className="flex gap-2 flex-wrap">
          {canSeeInventoryCompras && (
            <Button variant="secondary" onClick={() => navigate('/inventario')}>
              {t('ventasDiseno:catalogScreen.actions.inventoryCompras')}
            </Button>
          )}
          {canSeeInventoryBodega && (
            <Button variant="secondary" onClick={() => navigate('/bodega/inventario')}>
              {t('ventasDiseno:catalogScreen.actions.inventoryBodega')}
            </Button>
          )}
        </div>
      </div>

      {exportId && (
        <CatalogPdfExportBanner
          exportId={exportId}
          status={exportStatus}
          notFound={exportError}
          onDismiss={() => setSearchParams({}, { replace: true })}
        />
      )}

      {/* REQ-619 — selección + botones de envío */}
      <Card variant="panel" className="p-2.5 mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={selectingAll}
            onChange={e => toggleSelectAll(e.target.checked)}
            className="rounded border-slate-300"
          />
          {selectingAll ? t('common:labels.loading') : t('ventasDiseno:catalogScreen.selectAll')}
        </label>
        <span className="text-[12px] text-slate-400">
          {t('ventasDiseno:catalogScreen.selectedCount', { count: selected.size })}
        </span>

        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <Button
            variant="secondary"
            active={view === 'grid'}
            className="!rounded-none !border-0 !px-3 !py-1.5 inline-flex items-center gap-1.5"
            onClick={() => setView('grid')}
          >
            <IcoGrid size={14} /> {t('ventasDiseno:catalogScreen.view.grid')}
          </Button>
          <Button
            variant="secondary"
            active={view === 'list'}
            className="!rounded-none !border-0 !px-3 !py-1.5 inline-flex items-center gap-1.5"
            onClick={() => setView('list')}
          >
            <IcoList size={14} /> {t('ventasDiseno:catalogScreen.view.list')}
          </Button>
        </div>

        <div className="flex gap-2 ml-auto">
          <Button
            variant="secondary"
            disabled={selected.size === 0 || sendingFull}
            loading={sendingSelected}
            onClick={() => handleSend('seleccionados')}
          >
            {t('ventasDiseno:catalogScreen.actions.sendSelected')}
          </Button>
          <Button
            variant="primary"
            disabled={sendingSelected}
            loading={sendingFull}
            onClick={() => handleSend('completo')}
          >
            {t('ventasDiseno:catalogScreen.actions.sendFull')}
          </Button>
        </div>
      </Card>

      {/* REQ-617 — buscador + filtros, tiempo real (onChange directo, sin botón intermedio) */}
      <Card variant="panel" className="p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder={t('ventasDiseno:catalogScreen.filters.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 md:py-1.5 text-base md:text-[13px] w-full sm:min-w-[260px] sm:flex-1 focus:outline-none focus:border-[#5BA5A0]"
        />
        <select value={category} onChange={e => { setCategory(e.target.value as CatalogProductCategory | ''); setPage(1) }} className={selectClass}>
          <option value="">{t('ventasDiseno:catalogScreen.filters.allCategories')}</option>
          {categories.map(c => (
            <option key={c.value} value={c.value}>{categoryLabel(c.value)}</option>
          ))}
        </select>
        <select value={familyId} onChange={e => { setFamilyId(e.target.value ? Number(e.target.value) : ''); setPage(1) }} className={selectClass}>
          <option value="">{t('ventasDiseno:catalogScreen.filters.allFamilies')}</option>
          {families.map(f => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select value={stock} onChange={e => { setStock(e.target.value as StockFilter); setPage(1) }} className={selectClass}>
          <option value="">{t('ventasDiseno:catalogScreen.filters.stockAll')}</option>
          <option value="con">{t('ventasDiseno:catalogScreen.filters.stockWith')}</option>
          <option value="sin">{t('ventasDiseno:catalogScreen.filters.stockWithout')}</option>
        </select>
      </Card>

      {isLoading ? (
        <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-center text-slate-400 text-sm py-10">{t('ventasDiseno:catalogScreen.empty')}</p>
      ) : view === 'grid' ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {items.map(item => (
            <CatalogGridCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggleSelect={checked => toggleSelect(item.id, checked)}
              onOpen={() => setDetailId(item.id)}
            />
          ))}
        </div>
      ) : (
        <Card variant="panel" className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2 w-8"></th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('ventasDiseno:catalogScreen.list.photo')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('ventasDiseno:catalogScreen.list.factoryReference')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('ventasDiseno:catalogScreen.list.publicReference')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('ventasDiseno:catalogScreen.list.name')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('ventasDiseno:catalogScreen.list.category')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('ventasDiseno:catalogScreen.list.price')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('ventasDiseno:catalogScreen.list.available')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t('ventasDiseno:catalogScreen.list.technicalSheet')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {items.map(item => (
                <tr
                  key={item.id}
                  onClick={() => setDetailId(item.id)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer"
                >
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={e => toggleSelect(item.id, e.target.checked)}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 shrink-0 overflow-hidden">
                      {item.photo_url
                        ? <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover" />
                        : <IcoImage size={16} />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {item.factory_reference ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {item.reference}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{item.name}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {item.category ? categoryLabel(item.category) : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmtMoney(item.price_full)}</td>
                  <td className="px-4 py-3">
                    <StockLabel item={item} compact />
                  </td>
                  <td className="px-4 py-3">
                    <TechnicalSheetBadge hasSheet={item.has_technical_sheet} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {meta && (
        <Pagination
          meta={meta}
          perPage={perPage}
          onPageChange={goToPage}
          onPerPageChange={changePerPage}
        />
      )}

      {detailId !== null && (() => {
        const item = items.find(i => i.id === detailId)
        return item ? (
          <ProductDetailModal
            item={item}
            onClose={() => setDetailId(null)}
            onUploaded={() => queryClient.invalidateQueries({ queryKey: [CATALOG_QUERY_KEY] })}
          />
        ) : null
      })()}
    </>
  )
}

function StockLabel({ item, compact }: { item: CatalogItem; compact?: boolean }) {
  const { t } = useTranslation('ventasDiseno')
  const zero = item.disponible <= 0

  return (
    <span className={zero ? 'text-red-500' : 'text-slate-600 dark:text-slate-300'}>
      {compact
        ? (zero ? t('ventasDiseno:catalogScreen.stock.unavailableCompact') : t('ventasDiseno:catalogScreen.stock.availableCompact', { count: item.disponible }))
        : (zero ? t('ventasDiseno:catalogScreen.stock.unavailable') : t('ventasDiseno:catalogScreen.stock.available', { count: item.disponible }))}
      {item.en_camino > 0 && (
        <span className="text-slate-400"> · {t('ventasDiseno:catalogScreen.stock.incoming', { count: item.en_camino })}</span>
      )}
      {(item.stock_aparte ?? 0) > 0 && (
        <span className="text-slate-400" data-testid={`catalog-aparte-${item.id}`}> · {t('ventasDiseno:catalogScreen.stock.aparte', { count: item.stock_aparte })}</span>
      )}
    </span>
  )
}

function TechnicalSheetBadge({ hasSheet }: { hasSheet: boolean }) {
  const { t } = useTranslation('ventasDiseno')
  return (
    <span
      className={[
        'inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-1 rounded-md',
        hasSheet
          ? 'bg-[#E3F0EE] text-[#3D7E7A] dark:bg-slate-900 dark:text-[#5BA5A0]'
          : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
      ].join(' ')}
    >
      {hasSheet ? <IcoCheck size={11} /> : <IcoAlertTriangle size={11} />}
      {hasSheet ? t('ventasDiseno:catalogScreen.badge.ok') : t('ventasDiseno:catalogScreen.badge.missing')}
    </span>
  )
}

function CatalogGridCard({ item, selected, onToggleSelect, onOpen }: {
  item: CatalogItem
  selected: boolean
  onToggleSelect: (checked: boolean) => void
  onOpen: () => void
}) {
  return (
    <Card variant="panel" className="overflow-hidden relative cursor-pointer hover:shadow-md transition-shadow">
      <input
        type="checkbox"
        checked={selected}
        onClick={e => e.stopPropagation()}
        onChange={e => onToggleSelect(e.target.checked)}
        className="absolute top-2.5 left-2.5 z-10 rounded border-slate-300"
      />
      <div className="absolute top-2.5 right-2.5 z-10">
        <TechnicalSheetBadge hasSheet={item.has_technical_sheet} />
      </div>
      <div onClick={onOpen}>
        <div className="w-full h-[140px] bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400">
          {item.photo_url
            ? <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover" />
            : <IcoImage size={28} />}
        </div>
        <div className="p-3.5">
          <p className="text-[10px] text-slate-400 font-semibold tracking-wide">{item.factory_reference ?? item.reference}{item.brand ? ` · ${item.brand}` : ''}</p>
          <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100 mt-0.5 leading-snug">{item.name}</p>
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-snug min-h-[28px]">{item.description}</p>
          <p className="text-[15px] font-bold text-[#3D7E7A] mt-1.5">{fmtMoney(item.price_full)}</p>
          <p className="text-[10.5px] mt-0.5">
            <StockLabel item={item} compact />
          </p>
        </div>
      </div>
    </Card>
  )
}

function ProductDetailModal({ item, onClose, onUploaded }: {
  item: CatalogItem
  onClose: () => void
  onUploaded: () => void
}) {
  const { t } = useTranslation(['common', 'ventasDiseno', 'compras'])
  const { label: categoryLabel } = useProductCategories()
  const showToast = useToastStore(s => s.show)
  const [showUpload, setShowUpload] = useState(false)
  const [viewing, setViewing] = useState(false)

  async function handleViewDocument() {
    setViewing(true)
    try {
      const { url } = await ventasDisenoApi.catalog.technicalSheetUrl(item.id)
      window.open(url, '_blank', 'noopener')
    } catch {
      showToast(t('ventasDiseno:catalogScreen.detail.viewDocumentError'), 'error')
    } finally {
      setViewing(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {item.factory_reference ?? item.reference}{item.brand ? ` · ${item.brand}` : ''}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IcoClose />
          </button>
        </div>

        <div className="w-full h-[180px] rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 mb-4">
          {item.photo_url
            ? <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover rounded-xl" />
            : <IcoImage size={36} />}
        </div>

        <p className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1 break-words">{item.name}</p>
        <p className="text-[13.5px] text-slate-600 dark:text-slate-300 mb-3">{item.description}</p>

        <table className="w-full text-sm mb-4">
          <tbody>
            <DetailRow label={t('ventasDiseno:catalogScreen.detail.price')} value={fmtMoney(item.price_full)} />
            <DetailRow
              label={t('ventasDiseno:catalogScreen.detail.category')}
              value={item.category ? categoryLabel(item.category) : '—'}
            />
            {item.family_name && <DetailRow label={t('ventasDiseno:catalogScreen.detail.family')} value={item.family_name} />}
            <DetailRow label={t('ventasDiseno:catalogScreen.detail.available')} value={<StockLabel item={item} />} />
          </tbody>
        </table>

        <h3 className="text-[13px] font-bold text-slate-800 dark:text-slate-100 mb-2">
          {t('ventasDiseno:catalogScreen.detail.technicalSheetTitle')}
        </h3>

        {item.has_technical_sheet ? (
          <div className="flex items-center gap-3 bg-[#E3F0EE] dark:bg-slate-900 rounded-xl px-3.5 py-3">
            <IcoFileText size={22} className="text-[#3D7E7A] dark:text-[#5BA5A0] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold text-[#3D7E7A] dark:text-[#5BA5A0]">
                {t('ventasDiseno:catalogScreen.detail.technicalSheetLoaded')}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{item.technical_sheet_filename}</p>
            </div>
            <Button variant="secondary" className="!text-xs shrink-0" loading={viewing} onClick={handleViewDocument}>
              {t('ventasDiseno:catalogScreen.detail.viewDocument')}
            </Button>
          </div>
        ) : (
          <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-3.5 text-center">
            <p className="text-[12.5px] text-red-700 dark:text-red-400 mb-2.5 inline-flex items-center gap-1.5">
              <IcoAlertTriangle size={13} />
              {t('ventasDiseno:catalogScreen.detail.missingWarning')}
            </p>
            <div>
              <Button variant="secondary" className="!text-xs" onClick={() => setShowUpload(true)}>
                {t('ventasDiseno:catalogScreen.detail.uploadButton')}
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-5">
          <Button variant="outline" onClick={onClose}>{t('ventasDiseno:catalogScreen.detail.close')}</Button>
        </div>
      </Card>

      {showUpload && (
        <UploadTechnicalSheetModal
          productId={item.id}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false)
            onUploaded()
          }}
        />
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-700 last:border-0">
      <td className="py-1.5 pr-2 text-slate-400 w-1/2">{label}</td>
      <td className="py-1.5 font-semibold text-slate-800 dark:text-slate-100">{value}</td>
    </tr>
  )
}

function UploadTechnicalSheetModal({ productId, onClose, onUploaded }: {
  productId: number
  onClose: () => void
  onUploaded: () => void
}) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const showToast = useToastStore(s => s.show)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!file) {
      setError(t('ventasDiseno:catalogScreen.upload.noFile'))
      return
    }
    setUploading(true)
    setError(null)
    try {
      // REQ-618 RN4 — invalida la query del listado/detalle apenas hay éxito, sin location.reload.
      await ventasDisenoApi.catalog.uploadTechnicalSheet(productId, file)
      showToast(t('ventasDiseno:catalogScreen.upload.success'), 'success')
      onUploaded()
    } catch {
      setError(t('ventasDiseno:catalogScreen.upload.error'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <Card variant="modal" className="w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:catalogScreen.upload.title')}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        <p className="text-[11.5px] text-slate-400 mb-3">{t('ventasDiseno:catalogScreen.upload.hint')}</p>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm mb-4"
        />
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button loading={uploading} onClick={handleSave}>{t('ventasDiseno:catalogScreen.upload.save')}</Button>
        </div>
      </Card>
    </div>
  )
}


/**
 * SCRUM-998 — estado de la exportación del Catálogo en segundo plano (ZIP de volúmenes): avance mientras se genera, botón de
 * descarga cuando está lista y el motivo si falló. La URL firmada del ZIP vale solo 15 min, así que el botón vuelve a pedir el
 * estado en el momento del clic en vez de reusar la que llegó con el polling. Solo el solicitante (o un superadmin) puede
 * consultarla: para cualquier otra persona el backend responde 404 y se muestra como "no encontrada".
 */
function CatalogPdfExportBanner({ exportId, status, notFound, onDismiss }: {
  exportId: string
  status: CatalogPdfExportStatus | undefined
  notFound: boolean
  onDismiss: () => void
}) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const showToast = useToastStore(s => s.show)
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const fresh = await ventasDisenoApi.catalog.pdfExport(exportId)
      if (fresh.download_url) {
        window.location.assign(fresh.download_url)
      } else {
        showToast(t('ventasDiseno:catalogScreen.exportBanner.expired'), 'error')
      }
    } catch {
      showToast(t('ventasDiseno:catalogScreen.exportBanner.downloadError'), 'error')
    } finally {
      setDownloading(false)
    }
  }

  let body: React.ReactNode
  if (notFound) {
    body = <span>{t('ventasDiseno:catalogScreen.exportBanner.notFound')}</span>
  } else if (!status) {
    body = <span>{t('common:labels.loading')}</span>
  } else if (status.status === 'done') {
    body = (
      <>
        <span>
          {t('ventasDiseno:catalogScreen.exportBanner.done', {
            count: status.total_products, volumes: status.volumes,
            size: status.size_bytes != null ? (status.size_bytes / (1024 * 1024)).toFixed(1) : '?',
          })}
        </span>
        <Button variant="secondary" onClick={handleDownload} loading={downloading}>
          {t('ventasDiseno:catalogScreen.exportBanner.download')}
        </Button>
      </>
    )
  } else if (status.status === 'failed') {
    body = <span role="alert">{status.error_message ?? t('ventasDiseno:catalogScreen.exportBanner.failed')}</span>
  } else {
    body = (
      <span>
        {t('ventasDiseno:catalogScreen.exportBanner.generating', { count: status.total_products, volumes: status.volumes })}
      </span>
    )
  }

  return (
    <Card variant="panel" className="p-2.5 mb-3 flex flex-wrap items-center gap-3 text-[12.5px] text-slate-700 dark:text-slate-200">
      <IcoFileText size={16} />
      {body}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common:actions.close')}
        className="ml-auto text-slate-400 hover:text-slate-600"
      >
        <IcoClose size={14} />
      </button>
    </Card>
  )
}
