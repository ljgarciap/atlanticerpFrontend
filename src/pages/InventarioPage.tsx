import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import {
  useInventory, useInventoryProduct, useCreateInventoryProduct, useUpdateInventoryProduct,
  useToggleInventoryProductActive, useInventoryWarehouseStock, useInventoryOrderPrefill,
  useWarehouses, useGenerateFamilyPurchase, useInventoryFamily, useInventoryFamilies,
  useConfirmPendingInventory, useUploadInventoryTechnicalSheet, useInventoryTechnicalSheetUrl,
} from '@/hooks/useCompras'
import { comprasApi } from '@/api/comprasApi'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { IcoClose, IcoCheck, IcoAlertTriangle, IcoFileText, IcoSearch, IcoChevronDown, IcoChevronRight } from '@/components/icons'
import { TechnicalSpecModal } from '@/components/TechnicalSpecModal'
import { WarehouseMultiSelect } from '@/components/WarehouseMultiSelect'
import { FamilyCombobox } from '@/components/compras/FamilyCombobox'
import WarehouseStockModal from '@/components/compras/WarehouseStockModal'
import { InventoryProductsTable } from '@/components/compras/InventoryProductsTable'
import { formatMoney, formatInt } from '@/lib/money'
import { productDisplayName } from '@/lib/catalogProduct'
import type {
  InventoryChip, InventoryProductPayload, InventoryRotation, Provider,
} from '@/types/compras'
import type { NewOrderPrefillState } from '@/pages/compras/NewPurchaseOrderPage'

/**
 * SCRUM-241 (REQ-178) — hallazgo de QA 2026-07-18: el mensaje de error solo mostraba el genérico
 * "No se pudo guardar el producto", nunca el detalle real del backend (que sí indica a qué
 * producto pertenece la referencia duplicada). Mismo patrón que
 * NewPurchaseOrderPage::createOrderErrorMessage().
 */
function createProductErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
  const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  return firstFieldError ?? data?.message ?? fallback
}

type Tab = 'products' | 'families'
const CHIPS: InventoryChip[] = ['todos', 'en_atencion', 'inactivos', 'por_ingresar']
// REQ-112 (Inicio de Compras) — 'bajo_stock'/'sin_stock' se aceptan como deep-link (ver
// initialChip) pero no tienen botón propio en el filtro visible, no están en el mockup de Inventario.
// 'bajo_stock_sin_ordenar' — SCRUM-168 RN2, mismo criterio (Gerencia → "Salud · Compras").
const LINKABLE_CHIPS: InventoryChip[] = [...CHIPS, 'bajo_stock', 'sin_stock', 'bajo_stock_sin_ordenar']
// SCRUM-240 — 'unica' agregado: antes de este ticket ningún flujo de creación exponía "Compra
// única" (el modal viejo no tenía selector de rotación), así que esta lista de 3 nunca mostraba
// el gap. El modal nuevo SÍ permite elegirla — sin este 4to valor acá, editar un producto creado
// con rotación "unica" mostraba el select vacío ("—") y lo perdía silenciosamente al guardar.
const ROTATIONS: InventoryRotation[] = ['alta', 'media', 'baja', 'unica']
// SCRUM-234/237/238/240 — mismo catálogo fijo de 8 categorías que CatalogProduct::CATEGORIES
// (backend), duplicado localmente igual que NewProductModal.tsx (sin dependencia compartida
// hoy entre esos 2 modales, mismo patrón ya usado en el resto del módulo).
const CATEGORIES: string[] = [
  'candelabros_colgantes', 'iluminacion_techo', 'apliques_pared', 'iluminacion_bano',
  'iluminacion_exterior', 'lamparas_piso_mesa', 'iluminacion_empotrada', 'bombillos',
]

export default function InventarioPage() {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('products')
  // SCRUM-243 — modo Compras/Ventas & Diseño compartido entre pestañas: antes vivía solo dentro
  // de ProductsTab, así que FamiliesTab no tenía forma de saber que el usuario estaba previsualizando
  // en modo Ventas & Diseño y nunca ocultaba "Generar compra" (hallazgo QA 2026-07-20).
  const [previewVentas, setPreviewVentas] = useState(false)
  // SCRUM-742 — "+ Crear nuevo producto" pasa a vivir en el header del padre (antes en
  // ProductsTab), visible arriba de ambas pestañas — el modal se sigue abriendo/cerrando acá.
  const [creating, setCreating] = useState(false)

  // SCRUM-742 — Toggle Compras/Ventas&Diseño y las 5 tarjetas KPI suben al padre (antes vivían
  // solo dentro de ProductsTab) para que se vean en Productos Y Familias, según el orden del
  // mockup. Llamada base sin filtros: los indicadores son del inventario completo, independiente
  // del filtro vigente de la tabla de Productos (que mantiene su propia query filtrada más abajo).
  const { data } = useInventory({})
  const kpis = data?.kpis
  const restricted = data?.restricted ?? true
  // SCRUM-773 — señal distinta de `restricted` para las acciones de escritura del header
  // (Proveedores/+Crear nuevo producto/+Nueva orden de compra); ver InventoryListResponse.can_manage.
  const canManage = data?.can_manage ?? false

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {t('compras:inventory.title', { name: user?.first_name ?? '' })}
          </h1>
          {/* SCRUM-742 — nota abierta para el Arquitecto (no bloqueante, ver spec Analista
              scrum742-743-746-747-748-analista-spec.md): "Bodega es dueño del dato, aquí no se
              edita" no es preciso para usuarios no restringidos (Compras/Gerencia) — el modal de
              detalle de producto (ProductDetailModal, más abajo en este archivo) SÍ les expone
              ediciones reales de precio/costo/información general. El texto se agrega tal cual
              por decisión explícita de Luis (el mockup manda completo, 2026-08-13) — la
              contradicción queda señalada acá para que el Arquitecto la revise, no resuelta por
              Frontend Dev ni gateada por rol/permiso. */}
          <p className="text-[12px] text-slate-500 mt-0.5">{t('compras:inventory.headerSubtitle')}</p>
        </div>
        <div className="flex gap-2 items-center">
          {/* SCRUM-773 (CA4) — Proveedores/+Crear nuevo producto/+Nueva orden de compra son
              acciones de escritura: gatean con `canManage`, no `restricted` (que solo enmascara
              costo/margen y sigue en false para Líder de Operaciones a propósito). */}
          {canManage && (
            <Button variant="outline" onClick={() => navigate('/compras/proveedores')}>
              {t('compras:inventory.actions.providers')}
            </Button>
          )}
          {canManage && !previewVentas && (
            <>
              <Button variant="outline" onClick={() => setCreating(true)}>
                {t('compras:inventory.actions.create')}
              </Button>
              <Button onClick={() => navigate('/compras/ordenes/nueva')}>
                {t('compras:inventory.actions.createOrder')}
              </Button>
            </>
          )}
        </div>
      </div>

      {data !== undefined && !restricted && (
        <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-4 w-fit">
          <Button
            variant={!previewVentas ? 'primary' : 'secondary'}
            className="!rounded-none !border-0 !text-xs !px-3 !py-1.5"
            onClick={() => setPreviewVentas(false)}
          >
            {t('compras:inventory.toggle.compras')}
          </Button>
          <Button
            variant={previewVentas ? 'primary' : 'secondary'}
            className="!rounded-none !border-0 !text-xs !px-3 !py-1.5"
            onClick={() => setPreviewVentas(true)}
          >
            {t('compras:inventory.toggle.ventas')}
          </Button>
        </div>
      )}

      {kpis && (
        <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <KpiCard label={t('compras:inventory.kpis.total')} value={formatInt(kpis.total_products)} color="#5BA5A0" />
          <KpiCard label={t('compras:inventory.kpis.lowStock')} value={formatInt(kpis.low_stock)} color="#d4a017" />
          <KpiCard label={t('compras:inventory.kpis.outOfStock')} value={formatInt(kpis.out_of_stock)} color="#dc6b6b" />
          <KpiCard label={t('compras:inventory.kpis.inAttention')} value={formatInt(kpis.in_attention)} color="#dc6b6b" />
          {!restricted && !previewVentas && (
            <KpiCard label={t('compras:inventory.kpis.totalValue')} value={`$${formatMoney(kpis.total_value)}`} color="#9fc54d" />
          )}
        </div>
      )}

      <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-4 w-fit">
        <Button
          variant={tab === 'products' ? 'primary' : 'secondary'}
          className="!rounded-none !border-0"
          onClick={() => setTab('products')}
        >
          {t('compras:inventory.tabs.products')}
        </Button>
        <Button
          variant={tab === 'families' ? 'primary' : 'secondary'}
          className="!rounded-none !border-0"
          onClick={() => setTab('families')}
        >
          {t('compras:inventory.tabs.families')}
        </Button>
      </div>

      {tab === 'products'
        ? <ProductsTab previewVentas={previewVentas} />
        : <FamiliesTab previewVentas={previewVentas} />}

      {creating && <CreateProductModal onClose={() => setCreating(false)} />}
    </div>
  )
}

function ProductsTab({ previewVentas }: {
  previewVentas: boolean
}) {
  const { t } = useTranslation(['common', 'compras'])
  const [searchParams] = useSearchParams()
  // REQ-204 (Reportes) — la tarjeta "⚠️ En atención" navega acá con ?chip=en_atencion y debe
  // llegar ya filtrado, no solo aterrizar en la pantalla con el chip "Todos" por default.
  // REQ-112 (Inicio de Compras) — "Bajo stock"/"Sin stock" navegan igual, aunque no tengan botón
  // propio en el filtro visible (LINKABLE_CHIPS acepta el deep-link sin agregar un botón nuevo).
  const initialChip = LINKABLE_CHIPS.includes(searchParams.get('chip') as InventoryChip)
    ? (searchParams.get('chip') as InventoryChip)
    : 'todos'
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<InventoryChip>(initialChip)
  // SCRUM-743 — filtro multiselección de Bodegas. [] = sin selección = todas las bodegas
  // (RN6/criterio 6 del ticket) — se omite `warehouse_ids` en la llamada a useInventory cuando
  // está vacío, nunca se manda un array vacío al backend.
  const [warehouseIds, setWarehouseIds] = useState<number[]>([])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)
  const [detailId, setDetailId] = useState<number | null>(null)
  // SCRUM-234 — botón "Generar orden" por fila (columna "Acción"): abre el detalle y dispara el
  // prefill de orden de una, sin reimplementar la lógica ya existente dentro del modal.
  const [autoPrefillId, setAutoPrefillId] = useState<number | null>(null)
  // SCRUM-244 — "N Bodegas" abre su propio modal compacto (WarehouseStockModal), separado de
  // ProductDetailModal (detailId) — antes ambos compartían el mismo modal general.
  const [warehouseModalId, setWarehouseModalId] = useState<number | null>(null)

  const { data, isFetching } = useInventory({
    search: query || undefined,
    chip: chip === 'todos' ? undefined : chip,
    warehouse_ids: warehouseIds.length > 0 ? warehouseIds : undefined,
    page, per_page: perPage,
  })

  const products = data?.data ?? []
  const restricted = data?.restricted ?? true
  const canManage = data?.can_manage ?? false

  const handleSearch = () => { setQuery(search); setPage(1) }
  const handleWarehouseFilterChange = (ids: number[]) => { setWarehouseIds(ids); setPage(1) }
  const hasActiveFilters = search !== '' || query !== '' || chip !== 'todos' || warehouseIds.length > 0
  const handleClearFilters = () => {
    setSearch('')
    setQuery('')
    setChip('todos')
    setWarehouseIds([])
    setPage(1)
  }

  return (
    <div>
      {/* SCRUM-742 — título, subtítulo, acciones, toggle Compras/Ventas&Diseño y las 5 tarjetas
          KPI se movieron al padre InventarioPage (se ven arriba de ambas pestañas, no solo acá) —
          ver comentario en InventarioPage() más arriba en este archivo. */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('compras:inventory.filters.searchPlaceholder')}
          className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <Button variant="outline" onClick={handleSearch}>{t('common:actions.search')}</Button>
        {/* SCRUM-743 — filtro multiselección de Bodegas, junto a los filtros existentes (no los
            reemplaza). Posición consistente con el dropdown "Todas las bodegas" del mockup de
            SCRUM-742, aunque ese sea single-select — ver nota en la spec del Analista. */}
        <WarehouseMultiSelect selectedIds={warehouseIds} onChange={handleWarehouseFilterChange} />
        {CHIPS.map(c => (
          <Button
            key={c}
            variant="outline"
            active={chip === c}
            activeVariant="primary"
            className="!text-xs !px-3 !py-1.5"
            onClick={() => { setChip(c); setPage(1) }}
          >
            {t(`compras:inventory.chips.${c}`)}
          </Button>
        ))}
        {hasActiveFilters && (
          <Button variant="outline" onClick={handleClearFilters}>
            {t('compras:inventory.filters.clear')}
          </Button>
        )}
      </div>

      {/* SCRUM-234/238 (hallazgo de Gerencia Test 2026-08-09) — estructura de columnas completa
          del mockup, en el orden que pide el requerimiento. Categoría/Rotación/Bodega(s)/Stock
          mínimo/Proveedor/Por ingresar/En camino pasan a verse en AMBOS modos (decisión de Luis
          2026-08-14, revierte la lectura de REQ-172 PERMISOS del 2026-08-11 — esos 3 campos no son
          información financiera); costo/precio de compra/margen siguen exclusivos de modo Compras.
          Tabla extraída a `InventoryProductsTable` (Lote 4, SCRUM-243) — reusada tal cual en el
          detalle expandido de una familia (`FamiliesTab` más abajo). */}
      <Card variant="panel" className="overflow-hidden">
        <InventoryProductsTable
          products={products}
          restricted={restricted}
          canManage={canManage}
          previewVentas={previewVentas}
          isLoading={isFetching}
          onRowClick={setDetailId}
          onGenerateOrder={id => { setDetailId(id); setAutoPrefillId(id) }}
          onViewWarehouses={setWarehouseModalId}
        />
      </Card>

      {data?.meta && (
        <Pagination
          meta={data.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={pp => { setPerPage(pp); setPage(1) }}
        />
      )}

      {detailId !== null && (
        <ProductDetailModal
          id={detailId}
          restricted={restricted || previewVentas}
          canManage={canManage && !previewVentas}
          autoTriggerPrefill={autoPrefillId === detailId}
          onClose={() => { setDetailId(null); setAutoPrefillId(null) }}
        />
      )}

      {warehouseModalId !== null && (
        <WarehouseStockModal
          productId={warehouseModalId}
          onClose={() => setWarehouseModalId(null)}
        />
      )}
    </div>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: `${color}18` }}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold leading-none" style={{ color }}>{value}</div>
    </div>
  )
}

function ProductDetailModal({ id, restricted, canManage, autoTriggerPrefill, onClose }: {
  id: number
  restricted: boolean
  // SCRUM-773 — señal distinta de `restricted`: gatea edición de precio/info general, "ficha
  // técnica" (documento) y "Acciones finales" (inactivar/confirmar pendiente/generar orden).
  // `restricted` sigue enmascarando solo costo/margen, sin cambios.
  canManage: boolean
  autoTriggerPrefill?: boolean
  onClose: () => void
}) {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()
  const { data: product } = useInventoryProduct(id)
  const update = useUpdateInventoryProduct()
  const toggleActive = useToggleInventoryProductActive()
  const { data: warehouseStock } = useInventoryWarehouseStock(id)
  const orderPrefill = useInventoryOrderPrefill()
  const confirmPending = useConfirmPendingInventory()
  const uploadTechnicalSheet = useUploadInventoryTechnicalSheet()
  const technicalSheetUrl = useInventoryTechnicalSheetUrl()

  // SCRUM-754 — este `families` alimenta el <select> de filtro por familia en ProductsTab
  // (necesita el universo completo, no una página) — distinto del `useInventoryFamilies()` sin
  // argumentos dentro de FamiliesTab más abajo, que sí pagina de verdad.
  const { data: families } = useInventoryFamilies(1, 'all')

  // SCRUM-425 (REQ-355) — sub-modal aparte, mismo patrón del mockup (#modal-ficha-tecnica),
  // siempre de solo lectura (RN1) y visible tanto en modo completo como restringido: son datos
  // técnicos del producto (voltaje, dimensiones, etc.), no información comercial sensible como
  // costo/margen, así que no hay motivo para gatearlo detrás de `!restricted`. Distinto del
  // "documento" de ficha técnica de más abajo (SCRUM-237, ver nota ahí).
  const [showTechnicalSpec, setShowTechnicalSpec] = useState(false)

  const [editing, setEditing] = useState(false)
  const [cost, setCost] = useState('')
  const [importCost, setImportCost] = useState('')
  const [freightCost, setFreightCost] = useState('')
  const [handlingCost, setHandlingCost] = useState('')
  const [otherCost, setOtherCost] = useState('')
  const [priceFull, setPriceFull] = useState('')
  // SCRUM-237 (hallazgo de Gerencia Test 2026-08-09) — Stock mínimo/Rotación se MUESTRAN ahora en
  // "Datos generales" (solo lectura, sin botón de editar propio, tal como pide el mockup), pero
  // se mantienen editables acá, dentro del formulario de Precios — no existe hoy ninguna otra
  // pantalla que los edite ("se alimenta de otras pantallas" en la spec no tiene una pantalla real
  // detrás todavía). Resolución documentada explícitamente en el comentario de Jira del ticket
  // para que Luis confirme o pida mover el control de edición a otro lado más adelante.
  const [reorderPoint, setReorderPoint] = useState('')
  const [rotation, setRotation] = useState<InventoryRotation | ''>('')
  const [pricingError, setPricingError] = useState<string | null>(null)

  // RN4 (REQ-174) — "Información del producto" y "Precios" son 2 secciones independientes, cada
  // una con su propio Editar/Cancelar/Guardar y su propia confirmación antes de aplicar.
  const [editingGeneral, setEditingGeneral] = useState(false)
  // SCRUM-237 (rebote de Gerencia Test 2026-08-12) — "Nombre del producto" y "Descripción" pasan
  // a ser 2 campos totalmente independientes: antes de este ticket ambos leían/escribían la
  // misma columna (`description`), así que editar la Descripción cambiaba el nombre visible del
  // producto en toda la app (tablas, título de este mismo modal, etc.). Ver
  // src/lib/catalogProduct.ts (productDisplayName) para el fallback mientras el backend no
  // despliegue la columna `name` nueva.
  const [name, setName] = useState('')
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [factoryReference, setFactoryReference] = useState('')
  const [brand, setBrand] = useState('')
  const [familyId, setFamilyId] = useState('')
  const [category, setCategory] = useState('')
  const [barcode, setBarcode] = useState('')
  const [generalError, setGeneralError] = useState<string | null>(null)
  // SCRUM-237 — validación de unicidad de Referencia pública EN VIVO (REQ-178), mismo criterio
  // que crear un producto nuevo.
  const [referenceCheck, setReferenceCheck] = useState<{ checking: boolean; message: string | null }>({
    checking: false, message: null,
  })

  // SCRUM-237 — "Ficha técnica" como DOCUMENTO (archivo o link externo), Caso A/B del ticket.
  const [fichaMode, setFichaMode] = useState<'form' | null>(null)
  const [fichaLink, setFichaLink] = useState('')
  const [fichaError, setFichaError] = useState<string | null>(null)

  // SCRUM-234 — "Generar orden" desde la tabla dispara el prefill una sola vez al abrir.
  const [prefillTriggered, setPrefillTriggered] = useState(false)

  // SCRUM-237 Escenario 2 — el resumen de confirmación se muestra in-app, no con window.confirm():
  // el diálogo nativo era invisible para la automatización de QA (Playwright lo cancela por
  // default) y el ticket pide *ver* un resumen con costo/precio/margen antes de aplicar.
  const [confirming, setConfirming] = useState<'pricing' | 'general' | null>(null)

  const startEdit = () => {
    if (!product) return
    setCost(String(product.cost ?? ''))
    setImportCost(String(product.import_cost ?? 0))
    setFreightCost(String(product.freight_cost ?? 0))
    setHandlingCost(String(product.handling_cost ?? 0))
    setOtherCost(String(product.other_cost ?? 0))
    setPriceFull(String(product.price_full))
    setReorderPoint(String(product.reorder_point ?? ''))
    setRotation(product.rotation ?? '')
    setPricingError(null)
    setEditing(true)
  }

  const startEditGeneral = () => {
    if (!product) return
    setName(productDisplayName(product))
    setReference(product.reference)
    setDescription(product.description)
    setFactoryReference(product.factory_reference ?? '')
    setBrand(product.brand ?? '')
    setFamilyId(product.family_id != null ? String(product.family_id) : '')
    setCategory(product.category ?? '')
    setBarcode(product.barcode ?? '')
    setGeneralError(null)
    setReferenceCheck({ checking: false, message: null })
    setEditingGeneral(true)
  }

  useEffect(() => {
    if (autoTriggerPrefill && product && !prefillTriggered) {
      setPrefillTriggered(true)
      orderPrefill.mutate(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTriggerPrefill, product, prefillTriggered])

  useEffect(() => {
    if (!editingGeneral || !canManage || !product) return
    if (reference.trim() === '' || reference === product.reference) {
      setReferenceCheck({ checking: false, message: null })
      return
    }
    setReferenceCheck({ checking: true, message: null })
    const handle = setTimeout(() => {
      comprasApi.inventory.checkReference(reference, id)
        .then(res => setReferenceCheck({ checking: false, message: res.available ? null : (res.message ?? null) }))
        .catch(() => setReferenceCheck({ checking: false, message: null }))
    }, 400)

    return () => clearTimeout(handle)
  }, [reference, editingGeneral, canManage, product, id])

  // SCRUM-237 — Costo Total = cost + desglose (import/flete/manejo/otros); el margen en vivo se
  // calcula sobre ese total, no solo sobre `cost` (mismo criterio que CatalogProduct::costTotal()).
  const liveCostTotal = Number(cost || 0) + Number(importCost || 0) + Number(freightCost || 0)
    + Number(handlingCost || 0) + Number(otherCost || 0)
  const liveMargin = (() => {
    const p = Number(priceFull)
    if (!p) return null
    return (((p - liveCostTotal) / p) * 100).toFixed(2)
  })()

  const handleSave = () => {
    const priceNum = Number(priceFull)
    setConfirming(null)
    setPricingError(null)
    update.mutate({
      id,
      data: {
        cost: Number(cost || 0), price_full: priceNum,
        import_cost: Number(importCost || 0),
        freight_cost: Number(freightCost || 0),
        handling_cost: Number(handlingCost || 0),
        other_cost: Number(otherCost || 0),
        reorder_point: reorderPoint !== '' ? Number(reorderPoint) : null,
        rotation: rotation || null,
      },
    }, {
      onSuccess: () => setEditing(false),
      onError:   err => setPricingError(createProductErrorMessage(err, t('compras:inventory.errors.generic'))),
    })
  }

  const handleSaveGeneral = () => {
    setConfirming(null)
    setGeneralError(null)
    update.mutate({
      id,
      data: {
        reference, name, description,
        factory_reference: factoryReference || null,
        brand: brand || null,
        family_id: familyId !== '' ? Number(familyId) : null,
        category: category || null,
        barcode: barcode || null,
      },
    }, {
      onSuccess: () => setEditingGeneral(false),
      onError:   err => setGeneralError(createProductErrorMessage(err, t('compras:inventory.errors.generic'))),
    })
  }

  // SCRUM-237 — Caso A/B: subir un archivo O guardar un link externo, nunca ambos.
  const handleFichaFile = (file: File) => {
    setFichaError(null)
    uploadTechnicalSheet.mutate({ id, payload: { file } }, {
      onSuccess: () => setFichaMode(null),
      onError:   err => setFichaError(createProductErrorMessage(err, t('compras:inventory.errors.generic'))),
    })
  }

  const handleFichaLink = () => {
    if (fichaLink.trim() === '') return
    setFichaError(null)
    uploadTechnicalSheet.mutate({ id, payload: { link: fichaLink.trim() } }, {
      onSuccess: () => { setFichaMode(null); setFichaLink('') },
      onError:   err => setFichaError(createProductErrorMessage(err, t('compras:inventory.errors.generic'))),
    })
  }

  const handleViewFichaDocument = () => {
    technicalSheetUrl.mutate(id, {
      onSuccess: res => window.open(res.url, '_blank', 'noopener'),
    })
  }

  if (!product) return null

  const categoryLabel = product.category ? t(`compras:newOrder.newProduct.categories.${product.category}`) : null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            {/* SCRUM-237/238 — nombre del producto como título + categoría como subtítulo
                (hallazgo de Gerencia Test 2026-08-09). `detail.title` se mantiene como texto
                accesible (sr-only) — varios tests/QA ya lo usan como señal de "el modal abrió". */}
            <h2 className="text-base font-bold text-slate-900">
              <span className="sr-only">{t('compras:inventory.detail.title')}</span>
              {productDisplayName(product)}
            </h2>
            {categoryLabel && <p className="text-xs text-slate-500 mt-0.5">{categoryLabel}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IcoClose />
          </button>
        </div>

        {/* SCRUM-237/238 — sección "Datos generales": 9 campos de solo lectura, sin botón de editar
            propio (se alimentan de otras pantallas/procesos, no se editan acá). Visible en AMBOS
            modos desde 2026-08-14 (decisión de Luis, rebote de Daniela sobre el mockup de
            SCRUM-238) — Proveedor/Por ingresar/En camino no son información financiera; costo/
            margen/precio de compra siguen exclusivos de la sección Precios más abajo. */}
        <h3 className="text-xs font-bold uppercase text-slate-400 mb-2">{t('compras:inventory.detail.generalDataSection')}</h3>
        <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
          <Field label={t('compras:inventory.detail.rotation')} value={product.rotation ? t(`compras:inventory.rotation.${product.rotation}`) : '—'} />
          <Field label={t('compras:inventory.table.estado')} value={t(`compras:inventory.estado.${product.estado}`)} />
          <Field label={t('compras:inventory.table.provider')} value={product.provider_name ?? '—'} />
          <Field label={t('compras:inventory.detail.reorderPoint')} value={product.reorder_point ?? '—'} />
          <Field label={t('compras:inventory.table.disponible')} value={product.disponible} />
          <Field label={t('compras:inventory.table.porServir')} value={product.por_servir} />
          <Field label={t('compras:inventory.table.stock')} value={product.stock_quantity ?? '—'} />
          <Field label={t('compras:inventory.table.porIngresar')} value={product.por_ingresar ?? 0} />
          <Field label={t('compras:inventory.table.enCamino')} value={product.en_camino ?? 0} />
        </div>

        {/* SCRUM-238 (rebote de Gerencia Test 2026-08-12, comparado contra el mockup real
            "Detalle mockup.png" adjunto al ticket) — en modo restringido "Información del
            producto" va ANTES que "Precios", con "Ver ficha técnica" agrupado dentro de esa
            sección (no flotando debajo). El código de las 2 secciones no cambia, solo el orden en
            que se renderizan — se arman como fragments y se intercalan según `restricted` para no
            duplicar el JSX de cada modo. */}
        {(() => {
          const pricingSection = (
            <>
              <h3 className="text-xs font-bold uppercase text-slate-400 mb-2">{t('compras:inventory.detail.pricingSection')}</h3>
              {!editing ? (
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <Field label={t('compras:inventory.detail.priceFull')} value={`$${product.price_full.toFixed(2)}`} />
                  {!restricted && <Field label={t('compras:inventory.detail.cost')} value={product.cost != null ? `$${product.cost.toFixed(2)}` : '—'} />}
                  {!restricted && <Field label={t('compras:inventory.detail.importCost')} value={`$${(product.import_cost ?? 0).toFixed(2)}`} />}
                  {!restricted && <Field label={t('compras:inventory.detail.freightCost')} value={`$${(product.freight_cost ?? 0).toFixed(2)}`} />}
                  {!restricted && <Field label={t('compras:inventory.detail.handlingCost')} value={`$${(product.handling_cost ?? 0).toFixed(2)}`} />}
                  {!restricted && <Field label={t('compras:inventory.detail.otherCost')} value={`$${(product.other_cost ?? 0).toFixed(2)}`} />}
                  {!restricted && <Field label={t('compras:inventory.detail.costTotal')} value={product.cost_total != null ? `$${product.cost_total.toFixed(2)}` : '—'} />}
                  {!restricted && <Field label={t('compras:inventory.detail.margin')} value={product.margin_percent !== null && product.margin_percent !== undefined ? `${product.margin_percent}%` : '—'} />}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <label className="flex flex-col gap-1">
                    {t('compras:inventory.detail.priceFull')}
                    <input type="number" step="0.01" value={priceFull} onChange={e => setPriceFull(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
                  </label>
                  <label className="flex flex-col gap-1">
                    {t('compras:inventory.detail.cost')}
                    <input type="number" step="0.01" value={cost} onChange={e => setCost(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
                  </label>
                  <label className="flex flex-col gap-1">
                    {t('compras:inventory.detail.importCost')}
                    <input type="number" step="0.01" value={importCost} onChange={e => setImportCost(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
                  </label>
                  <label className="flex flex-col gap-1">
                    {t('compras:inventory.detail.freightCost')}
                    <input type="number" step="0.01" value={freightCost} onChange={e => setFreightCost(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
                  </label>
                  <label className="flex flex-col gap-1">
                    {t('compras:inventory.detail.handlingCost')}
                    <input type="number" step="0.01" value={handlingCost} onChange={e => setHandlingCost(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
                  </label>
                  <label className="flex flex-col gap-1">
                    {t('compras:inventory.detail.otherCost')}
                    <input type="number" step="0.01" value={otherCost} onChange={e => setOtherCost(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
                  </label>
                  <label className="flex flex-col gap-1">
                    {t('compras:inventory.detail.reorderPoint')}
                    <input type="number" value={reorderPoint} onChange={e => setReorderPoint(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
                  </label>
                  <label className="flex flex-col gap-1">
                    {t('compras:inventory.detail.rotation')}
                    <select value={rotation} onChange={e => setRotation(e.target.value as InventoryRotation)}
                      className="px-2 py-1.5 border border-slate-200 rounded text-sm bg-white">
                      <option value="">—</option>
                      {ROTATIONS.map(r => <option key={r} value={r}>{t(`compras:inventory.rotation.${r}`)}</option>)}
                    </select>
                  </label>
                  <div className="col-span-2 text-xs text-slate-500">
                    {t('compras:inventory.detail.costTotal')}: ${liveCostTotal.toFixed(2)} — {t('compras:inventory.detail.margin')}: {liveMargin ?? '—'}%
                  </div>
                </div>
              )}

              {canManage && confirming === 'pricing' && (
                <div className="mb-4 p-3 rounded border border-amber-200 bg-amber-50">
                  <p className="text-xs text-slate-700 mb-2">
                    {t('compras:inventory.detail.confirmSave', {
                      cost: liveCostTotal.toFixed(2), price: Number(priceFull).toFixed(2), margin: liveMargin ?? '0',
                    })}
                  </p>
                  <div className="flex gap-2">
                    <Button className="!text-xs" loading={update.isPending} onClick={handleSave}>{t('compras:inventory.actions.confirm')}</Button>
                    <Button variant="outline" className="!text-xs" onClick={() => setConfirming(null)}>{t('compras:inventory.actions.cancel')}</Button>
                  </div>
                </div>
              )}
              {canManage && confirming !== 'pricing' && (
                <div className="flex gap-2 mb-4">
                  {!editing ? (
                    <Button variant="outline" className="!text-xs" onClick={startEdit}>{t('compras:inventory.actions.editPricing')}</Button>
                  ) : (
                    <>
                      <Button className="!text-xs" onClick={() => setConfirming('pricing')}>{t('compras:inventory.actions.save')}</Button>
                      <Button variant="outline" className="!text-xs" onClick={() => { setEditing(false); setPricingError(null) }}>{t('compras:inventory.actions.cancel')}</Button>
                    </>
                  )}
                </div>
              )}
              {pricingError && <p className="text-xs text-red-500 mb-4">{pricingError}</p>}
            </>
          )

          const productInfoSection = (
            <>
              {/* SCRUM-237 (hallazgo de Gerencia Test 2026-08-09) — sección "Información del producto"
                  (antes "Información general"): Categoría/Código de barras nuevos, orden de campos del
                  mockup, Ficha técnica (documento) al final de la sección. Modo restringido conserva la
                  estructura simple ya validada por QA (SCRUM-238): solo lectura, sin Categoría/Código
                  de barras/Familia (no forman parte del mockup de Ventas & Diseño). */}
              <h3 className="text-xs font-bold uppercase text-slate-400 mb-2">
                {t(restricted ? 'compras:inventory.detail.generalSection' : 'compras:inventory.detail.productInfoSection')}
              </h3>
              {restricted ? (
                <div className="grid grid-cols-2 gap-3 mb-2 text-sm">
                  {/* SCRUM-237 — Nombre y Descripción son campos independientes desde este ticket
                      (antes compartían la misma columna `description`, ver productDisplayName). */}
                  <Field label={t('compras:inventory.detail.name')} value={productDisplayName(product)} />
                  <Field label={t('compras:inventory.detail.reference')} value={product.reference} />
                  <Field label={t('compras:inventory.detail.description')} value={product.description} />
                  <Field label={t('compras:inventory.detail.brand')} value={product.brand ?? '—'} />
                </div>
              ) : !editingGeneral ? (
          <div className="grid grid-cols-2 gap-3 mb-2 text-sm">
            <div className="col-span-2">
              <Field label={t('compras:inventory.detail.name')} value={productDisplayName(product)} />
            </div>
            <Field label={t('compras:inventory.detail.category')} value={categoryLabel ?? '—'} />
            <Field label={t('compras:inventory.detail.factoryReference')} value={product.factory_reference ?? '—'} />
            <Field label={t('compras:inventory.detail.reference')} value={product.reference} />
            <Field label={t('compras:inventory.detail.brand')} value={product.brand ?? '—'} />
            <Field label={t('compras:inventory.detail.barcode')} value={product.barcode ?? '—'} />
            <Field label={t('compras:inventory.detail.family')} value={product.family_name ?? t('compras:inventory.detail.familyNone')} />
            <div className="col-span-2">
              <Field label={t('compras:inventory.detail.description')} value={product.description} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mb-2 text-sm">
            <label className="flex flex-col gap-1 col-span-2">
              {t('compras:inventory.detail.name')}
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              {t('compras:inventory.detail.category')}
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded text-sm bg-white">
                <option value="">—</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{t(`compras:newOrder.newProduct.categories.${c}`)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              {t('compras:inventory.detail.factoryReference')}
              <input type="text" value={factoryReference} onChange={e => setFactoryReference(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              {t('compras:inventory.detail.reference')}
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
              {referenceCheck.checking && <span className="text-[11px] text-slate-400">{t('compras:inventory.detail.checkingReference')}</span>}
              {referenceCheck.message && <span className="text-[11px] text-red-500">{referenceCheck.message}</span>}
            </label>
            <label className="flex flex-col gap-1">
              {t('compras:inventory.detail.brand')}
              <input type="text" value={brand} onChange={e => setBrand(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              {t('compras:inventory.detail.barcode')}
              <input type="text" value={barcode} onChange={e => setBarcode(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
            </label>
            {/* SCRUM-237 — combobox de Familia compartido con CreateProductModal (SCRUM-240):
                permite elegir una familia existente o escribir un nombre nuevo y crearla de una. */}
            <FamilyCombobox
              id="cp-edit-family"
              value={familyId === '' ? '' : Number(familyId)}
              onChange={id => setFamilyId(id === '' ? '' : String(id))}
            />
            <label className="flex flex-col gap-1 col-span-2">
              {t('compras:inventory.detail.description')}
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
            </label>
          </div>
        )}
              {canManage && confirming === 'general' && (
                <div className="mb-2 p-3 rounded border border-amber-200 bg-amber-50">
                  <p className="text-xs text-slate-700 mb-2">
                    {t('compras:inventory.detail.confirmSaveGeneral', {
                      name,
                      reference,
                      description,
                      brand: brand || '—',
                      family: familyId !== ''
                        ? families?.data.find(f => f.id === Number(familyId))?.name ?? '—'
                        : t('compras:inventory.detail.familyNone'),
                    })}
                  </p>
                  <div className="flex gap-2">
                    <Button className="!text-xs" loading={update.isPending} onClick={handleSaveGeneral}>{t('compras:inventory.actions.confirm')}</Button>
                    <Button variant="outline" className="!text-xs" onClick={() => setConfirming(null)}>{t('compras:inventory.actions.cancel')}</Button>
                  </div>
                </div>
              )}
              {canManage && confirming !== 'general' && (
                <div className="flex gap-2 mb-2">
                  {!editingGeneral ? (
                    <Button variant="outline" className="!text-xs" onClick={startEditGeneral}>{t('compras:inventory.actions.editGeneral')}</Button>
                  ) : (
                    <>
                      <Button className="!text-xs" disabled={referenceCheck.message !== null} onClick={() => setConfirming('general')}>{t('compras:inventory.actions.save')}</Button>
                      <Button variant="outline" className="!text-xs" onClick={() => { setEditingGeneral(false); setGeneralError(null) }}>{t('compras:inventory.actions.cancel')}</Button>
                    </>
                  )}
                </div>
              )}
              {generalError && <p className="text-xs text-red-500 mb-4">{generalError}</p>}

              {/* SCRUM-238 — "Ver ficha técnica" agrupado dentro de esta sección (antes flotaba
                  debajo, fuera de cualquier encabezado) para que el mockup de Ventas & Diseño
                  ("Información general" con el botón como último campo listado) quede reflejado
                  también en modo Compras, sin cambiar su comportamiento. */}
              <div className="mb-4">
                <Button
                  variant="outline" className="!text-xs inline-flex items-center gap-1.5"
                  onClick={() => setShowTechnicalSpec(true)}
                >
                  <IcoFileText size={14} />
                  {t('compras:inventory.technicalSpec.button')}
                </Button>
              </div>
            </>
          )

          return restricted
            ? <>{productInfoSection}{pricingSection}</>
            : <>{pricingSection}{productInfoSection}</>
        })()}

        {/* SCRUM-237 (hallazgo de Gerencia Test) — "Ficha técnica" como DOCUMENTO (archivo o
            link), distinta del bloque de 12 campos estructurados de arriba (ver comentario del
            ticket sobre esta ambigüedad de nombres: 2 conceptos llamados "ficha técnica" en el
            mismo modal). Solo modo Compras — el mockup de Ventas & Diseño no la pide.
            SCRUM-773 — "Reemplazar"/"Subir" son acciones de escritura (canManage); ver el
            documento ya subido sigue siendo "consultar información" (restricted), sin cambios. */}
        {!restricted && (canManage || product.has_technical_sheet) && (
          <div className="mb-4">
            <h4 className="text-[11px] font-bold uppercase text-slate-400 mb-1.5">{t('compras:inventory.detail.technicalSheetDocSection')}</h4>
            {product.has_technical_sheet ? (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <button
                  type="button" onClick={handleViewFichaDocument}
                  className="text-primary underline decoration-dotted"
                >
                  {product.technical_sheet_filename}
                </button>
                {canManage && (
                  <Button variant="outline" className="!text-xs" onClick={() => setFichaMode('form')}>
                    {t('compras:inventory.detail.technicalSheetDoc.replace')}
                  </Button>
                )}
              </div>
            ) : fichaMode !== 'form' && (
              <Button variant="outline" className="!text-xs inline-flex items-center gap-1.5" onClick={() => setFichaMode('form')}>
                <IcoFileText size={14} />
                {t('compras:inventory.detail.technicalSheetDoc.upload')}
              </Button>
            )}
            {fichaMode === 'form' && (
              <div className="mt-2 flex flex-col gap-2 p-2 rounded border border-slate-200 bg-slate-50">
                <label className="text-xs text-slate-600">
                  {t('compras:inventory.detail.technicalSheetDoc.fileLabel')}
                  <input
                    type="file" accept=".pdf,.png,.jpg,.jpeg" className="block mt-1 text-xs"
                    onChange={e => { const file = e.target.files?.[0]; if (file) handleFichaFile(file) }}
                  />
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url" value={fichaLink} onChange={e => setFichaLink(e.target.value)}
                    placeholder={t('compras:inventory.detail.technicalSheetDoc.linkPlaceholder') ?? ''}
                    className="px-2 py-1.5 border border-slate-200 rounded text-xs flex-1"
                  />
                  <Button className="!text-xs" loading={uploadTechnicalSheet.isPending} onClick={handleFichaLink}>
                    {t('compras:inventory.detail.technicalSheetDoc.saveLink')}
                  </Button>
                </div>
                <Button variant="outline" className="!text-xs w-fit" onClick={() => setFichaMode(null)}>
                  {t('compras:inventory.actions.cancel')}
                </Button>
              </div>
            )}
            {fichaError && <p className="text-xs text-red-500 mt-1">{fichaError}</p>}
          </div>
        )}

        {/* SCRUM-237 — "Acciones finales" (una sola fila, al final del modal): Marcar como
            inactivo / Ingresar a Inventario (solo si hay unidades "Por ingresar", RN5 sigue
            vigente — no hay forma manual de marcar "Por ingresar" desde acá, ver nota del ticket)
            / Generar orden. SCRUM-773 — las 3 son acciones de escritura, gatean con canManage. */}
        {canManage && (
          <div className="flex flex-wrap gap-2 mb-2">
            <Button
              variant="outline" className="!text-xs" loading={toggleActive.isPending}
              disabled={product.is_active && (product.por_ingresar ?? 0) > 0}
              onClick={() => toggleActive.mutate(id)}
            >
              {product.is_active ? t('compras:inventory.actions.deactivate') : t('compras:inventory.actions.activate')}
            </Button>
            {(product.por_ingresar ?? 0) > 0 && (
              <Button
                className="!text-xs" loading={confirmPending.isPending}
                onClick={() => confirmPending.mutate(id)}
              >
                {t('compras:inventory.actions.confirmPending')}
              </Button>
            )}
            <Button
              variant="outline" className="!text-xs" loading={orderPrefill.isPending}
              onClick={() => orderPrefill.mutate(id)}
            >
              {t('compras:inventory.actions.generateOrder')}
            </Button>
          </div>
        )}
        {!restricted && (product.por_ingresar ?? 0) > 0 && (
          <p className="mb-4 text-xs text-amber-700 flex items-center gap-1">
            <IcoAlertTriangle size={12} />
            {t('compras:inventory.pendingInventory.warning', { quantity: product.por_ingresar })}
          </p>
        )}
        {/* Rebote REQ-427 (Gerencia Test 2026-08-13) — el detalle de Compras debe reflejar si
            Bodega ya reportó la llegada física, con cantidad y usuario, o si sigue pendiente. */}
        {!restricted && (product.por_ingresar ?? 0) > 0 && (
          product.bodega_confirmation?.awaiting_compras ? (
            <p className="mb-4 text-xs text-slate-600 flex items-center gap-1">
              <IcoCheck size={12} className="text-emerald-600" />
              {t('compras:inventory.pendingInventory.bodegaConfirmed', {
                count: product.bodega_confirmation.confirmed_quantity,
                user: product.bodega_confirmation.confirmed_by_name,
              })}
            </p>
          ) : (
            <p className="mb-4 text-xs text-slate-500 flex items-center gap-1">
              <IcoAlertTriangle size={12} />
              {t('compras:inventory.pendingInventory.bodegaPending')}
            </p>
          )
        )}
        {confirmPending.isError && <p className="text-xs text-red-500 mb-4">{t('compras:inventory.pendingInventory.confirmError')}</p>}

        {orderPrefill.data && (() => {
          const prefill = orderPrefill.data

          return (
            <div className="mb-4 p-2 rounded bg-slate-50 border border-slate-200 text-xs text-slate-600">
              {prefill.has_pending_shipment && (
                <p className="text-amber-700 flex items-center gap-1 mb-1">
                  <IcoAlertTriangle size={12} />
                  {t('compras:inventory.orderPrefill.pendingWarning', { quantity: prefill.pending_quantity })}
                </p>
              )}
              <p className="mb-2">{t('compras:inventory.orderPrefill.suggestedQuantity', { quantity: prefill.suggested_quantity })}</p>
              {prefill.provider_id !== null ? (
                <Button
                  className="!text-xs"
                  onClick={() => {
                    const state: NewOrderPrefillState = {
                      providerId: prefill.provider_id as number,
                      product: {
                        id: prefill.catalog_product_id,
                        reference: product.reference,
                        description: productDisplayName(product),
                        unitCost: product.cost_total ?? product.cost ?? 0,
                        quantity: prefill.suggested_quantity,
                      },
                    }
                    navigate('/compras/ordenes/nueva', { state })
                  }}
                >
                  {t('compras:inventory.orderPrefill.continue')}
                </Button>
              ) : (
                <p className="text-slate-400">{t('compras:inventory.orderPrefill.noProvider')}</p>
              )}
            </div>
          )
        })()}

        {!restricted && (
          <>
            <h3 className="text-xs font-bold uppercase text-slate-400 mb-2">{t('compras:inventory.warehouseStock.title')}</h3>
            <ul className="text-sm mb-2">
              {(warehouseStock?.data ?? []).map(w => (
                <li key={w.warehouse_id} className="flex justify-between py-1 border-b border-slate-100">
                  <span>{w.warehouse_name}</span>
                  <span className="font-medium">{w.quantity}</span>
                </li>
              ))}
              {warehouseStock && warehouseStock.data.length === 0 && (
                <li className="text-slate-400 text-xs">{t('compras:inventory.warehouseStock.empty')}</li>
              )}
            </ul>
          </>
        )}

        <div className="flex justify-end mt-2">
          <Button variant="outline" onClick={onClose}>{t('compras:inventory.actions.close')}</Button>
        </div>
      </Card>

      {showTechnicalSpec && (
        <TechnicalSpecModal
          reference={product.reference}
          spec={product.technical_spec}
          title={t('compras:inventory.technicalSpec.title')}
          fieldLabel={key => t(`compras:inventory.technicalSpec.fields.${key}`)}
          emptyText={t('compras:inventory.technicalSpec.empty')}
          closeLabel={t('compras:inventory.actions.close')}
          onClose={() => setShowTechnicalSpec(false)}
        />
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-400 font-bold">{label}</div>
      <div className="text-slate-700">{value}</div>
    </div>
  )
}

// SCRUM-240 — 4 opciones de Rotación esperada (incl. "Compra única"), distinto del `ROTATIONS`
// de arriba (3 valores, solo para los chips de filtro de la tabla — no incluye "unica" porque
// no es un filtro que exista hoy en el mockup de la tabla).
const PRODUCT_ROTATIONS: InventoryRotation[] = ['alta', 'media', 'baja', 'unica']

/**
 * SCRUM-240 (REQ-177) — reescritura completa (corrección de Gerencia Test 2026-08-09/mockup
 * `2C__Compras_Inventario.html#modal-crear-producto`), actualizada 2026-08-15 tras el rebote del
 * 2026-08-12 (ver memoria `project_estrategia_batch4_compras_bodega_20260815.md`). Decisiones de
 * alcance documentadas acá y en el comentario de Jira del ticket, no resueltas en silencio:
 *
 * 1. "Nombre del producto" vs. "Descripción" — RESUELTO 2026-08-15 (decisión del Arquitecto): los
 *    2 campos del mockup ahora persisten de verdad, `catalog_products` gana una columna `name`
 *    propia (antes solo existía `description`, que hacía doble función de nombre y descripción —
 *    ver `src/lib/catalogProduct.ts`). Ambos se mandan por separado en el payload.
 *    // TODO: backend batch4 — worktree de Backend Dev en paralelo, columna `name` todavía no
 *    desplegada acá al momento de este commit; reconciliar en Senior Review.
 * 2. "Familia" — RESUELTO 2026-08-15: el rebote de Gerencia Test en 237/240 confirmó que sí hace
 *    falta poder crear una familia escribiendo un nombre nuevo — `FamilyCombobox`
 *    (`src/components/compras/FamilyCombobox.tsx`, compartido con la edición en
 *    ProductDetailModal más arriba) ofrece "+ Crear familia" cuando el texto no matchea ninguna
 *    existente, vía el endpoint nuevo de creación-por-nombre.
 *    // TODO: backend batch4 — mismo endpoint, ver nota de FamilyCombobox.
 * 3. "Stock inicial" — el mockup hardcodea 5 bodegas por nombre (Atlantic/Mermas/Préstamo
 *    Zona Libre/Reserva/Llano Bonito), pero esos nombres NO existen en las bodegas reales del
 *    sistema (`useWarehouses()` día de hoy: Bodega Central/Bodega Zona Libre/Showroom
 *    Cliente/Obarrio/SM/Merma/Reclamos y Devoluciones) — hardcodear los nombres del mockup
 *    literalmente dejaría el formulario escribiendo contra bodegas que no existen. Se implementa
 *    dinámico: un campo por cada bodega real (`useWarehouses()`), nunca una lista fija (regla
 *    global del CLAUDE.md raíz: no hardcodear valores de negocio que deberían salir de una tabla
 *    configurable — acá la "tabla configurable" ya existe, es `warehouses`).
 */
function CreateProductModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(['common', 'compras'])
  const create = useCreateInventoryProduct()
  const { data: warehousesData } = useWarehouses()

  // ── Proveedor: buscador + desplegable (mismo patrón que NewPurchaseOrderPage) ──
  const [providerId, setProviderId] = useState<number | null>(null)
  const [providerName, setProviderName] = useState('')
  const [providerSearch, setProviderSearch] = useState('')
  const [providerListOpen, setProviderListOpen] = useState(false)
  const { data: providerResults } = useQuery({
    queryKey: ['compras/providers/picker', providerSearch],
    queryFn:  () => comprasApi.providers.list({ search: providerSearch || undefined, per_page: 20 }),
    enabled:  providerId === null,
  })

  // ── Datos generales ──
  const [name, setName] = useState('')
  // SCRUM-240 (rebote de Gerencia Test 2026-08-12) — "Descripción" pasa a ser un campo propio,
  // independiente de "Nombre del producto" (antes el modal solo tenía el campo Nombre, que
  // escribía a la única columna `description` existente — ver docblock de este componente).
  const [description, setDescription] = useState('')
  const [factoryReference, setFactoryReference] = useState('')
  const [reference, setReference] = useState('')
  const [brand, setBrand] = useState('')
  const [barcode, setBarcode] = useState('')
  const [familyId, setFamilyId] = useState<number | ''>('')
  const [category, setCategory] = useState('')

  // ── Costos ──
  const [cost, setCost] = useState('')
  const [additionalCostAmount, setAdditionalCostAmount] = useState('')
  const [additionalCostType, setAdditionalCostType] = useState<'monto' | 'porcentaje'>('monto')
  const [priceFull, setPriceFull] = useState('')

  // SCRUM-194 (REQ-131) — mismo patrón que Nueva Orden/NewProductModal: si el tipo es
  // "porcentaje", el monto real en $ se resuelve sobre `cost` antes de enviarlo — el backend solo
  // conoce el resultado (`other_cost`), no el toggle.
  const resolvedAdditionalCost = additionalCostAmount === ''
    ? null
    : additionalCostType === 'porcentaje'
      ? (Number(cost || 0) * Number(additionalCostAmount) / 100)
      : Number(additionalCostAmount)

  // Rotación/Stock mínimo — "obligatorio" con default sensato (mismo criterio que el mockup:
  // rotación arranca en "media", stock mínimo en 10).
  const [rotation, setRotation] = useState<InventoryRotation>('media')
  const [reorderPoint, setReorderPoint] = useState('10')

  // ── Stock inicial (opcional), dinámico por bodega real ──
  const [warehouseStocks, setWarehouseStocks] = useState<Record<number, string>>({})

  // ── Ficha técnica como documento (SCRUM-237) — se sube DESPUÉS de crear el producto, no hay
  //    id todavía acá. Se guarda localmente ("staged") hasta el submit. ──
  const [fichaMode, setFichaMode] = useState<'form' | null>(null)
  const [fichaFile, setFichaFile] = useState<File | null>(null)
  const [fichaLink, setFichaLink] = useState('')

  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const selectProvider = (p: Provider) => {
    setProviderId(p.id); setProviderName(p.name); setProviderSearch(''); setProviderListOpen(false)
  }

  const hasAnyData = [
    name, description, factoryReference, reference, brand, barcode, cost, additionalCostAmount, priceFull, providerName,
  ].some(v => v.trim() !== '') || fichaFile !== null || fichaLink.trim() !== ''
    || Object.values(warehouseStocks).some(v => v.trim() !== '' && v !== '0')

  const requestClose = () => { if (hasAnyData) setConfirmDiscard(true); else onClose() }

  // SCRUM-426 (rebote de Gerencia Test 2026-08-13) — la ficha técnica (archivo O link) vuelve a
  // ser obligatoria para poder crear el producto, ahora forzada también en backend (ver
  // StoreInventoryProductRequest) — esto ya no es solo un candado de UI.
  const hasTechnicalSheet = fichaFile !== null || fichaLink.trim() !== ''
  const canSubmit = providerId !== null && name.trim() !== '' && factoryReference.trim() !== ''
    && reference.trim() !== '' && brand.trim() !== '' && barcode.trim() !== '' && category !== ''
    && cost !== '' && resolvedAdditionalCost !== null && priceFull !== '' && reorderPoint !== ''
    && hasTechnicalSheet

  const handleSubmit = () => {
    if (!canSubmit || providerId === null) return
    setFormError(null)

    const initialStock = Object.entries(warehouseStocks)
      .map(([warehouseId, quantity]) => ({ warehouse_id: Number(warehouseId), quantity: Number(quantity || 0) }))
      .filter(entry => entry.quantity > 0)

    const payload: InventoryProductPayload = {
      reference, factory_reference: factoryReference, name, description, brand, barcode,
      price_full: Number(priceFull), cost: Number(cost), other_cost: resolvedAdditionalCost ?? 0,
      reorder_point: Number(reorderPoint), provider_id: providerId,
      family_id: familyId === '' ? null : familyId,
      category, rotation,
      initial_stock: initialStock,
    }

    // canSubmit ya garantiza hasTechnicalSheet — este check es solo para que TypeScript vea la
    // unión no-nula antes de armar el objeto que espera create().
    const technicalSheet = fichaFile !== null ? { file: fichaFile } : { link: fichaLink.trim() }

    create.mutate({ data: payload, technicalSheet }, {
      onSuccess: () => onClose(),
      onError: err => setFormError(createProductErrorMessage(err, t('compras:inventory.errors.generic'))),
    })
  }

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm'

  if (confirmDiscard) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <Card variant="modal" className="w-full max-w-sm p-5">
          <p className="text-sm text-slate-700 mb-4">{t('compras:inventory.create.discardWarning')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>{t('compras:inventory.actions.cancel')}</Button>
            <Button onClick={onClose}>{t('compras:inventory.actions.close')}</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{t('compras:inventory.create.title')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('compras:inventory.create.subtitle')}</p>
          </div>
          <button onClick={requestClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>

        <h3 className="text-xs font-bold uppercase text-slate-400 mb-2">{t('compras:inventory.create.generalSection')}</h3>
        <div className="space-y-3 text-sm mb-4">
          <div>
            <label htmlFor="cp-name" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:inventory.create.name')} *</label>
            <input id="cp-name" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>

          {/* SCRUM-240 (rebote de Gerencia Test 2026-08-12) — "Descripción" propia, independiente
              del Nombre (mismo mockup que pedía un textarea largo aparte, ver docblock arriba). */}
          <div>
            <label htmlFor="cp-description" className="block text-xs font-semibold text-slate-600 mb-1">
              {t('compras:inventory.detail.description')} <span className="font-normal text-slate-400">({t('compras:inventory.create.optional')})</span>
            </label>
            <textarea id="cp-description" value={description} onChange={e => setDescription(e.target.value)} rows={3} className={inputCls} />
          </div>

          <div className="relative">
            <label htmlFor="cp-provider-search" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:inventory.detail.provider')} *</label>
            {providerId !== null ? (
              <div className="flex items-center justify-between px-3 py-2 border border-slate-300 rounded-lg bg-slate-50">
                <span className="font-medium text-slate-800">{providerName}</span>
                <button type="button" className="text-xs text-primary underline" onClick={() => { setProviderId(null); setProviderName('') }}>
                  {t('compras:newOrder.provider.change')}
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <IcoSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="cp-provider-search"
                    value={providerSearch}
                    onChange={e => { setProviderSearch(e.target.value); setProviderListOpen(true) }}
                    onFocus={() => setProviderListOpen(true)}
                    onBlur={() => setTimeout(() => setProviderListOpen(false), 150)}
                    placeholder={t('compras:newOrder.provider.searchPlaceholder') ?? ''}
                    className={inputCls + ' pl-8'}
                  />
                </div>
                {providerListOpen && (providerResults?.data.length ?? 0) > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {providerResults!.data.map(p => (
                      <li key={p.id}>
                        <button
                          type="button" onMouseDown={() => selectProvider(p)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cp-factory-reference" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:inventory.detail.factoryReference')} *</label>
              <input id="cp-factory-reference" value={factoryReference} onChange={e => setFactoryReference(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="cp-reference" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:inventory.detail.reference')} *</label>
              <input id="cp-reference" value={reference} onChange={e => setReference(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cp-brand" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:inventory.detail.brand')} *</label>
              <input id="cp-brand" value={brand} onChange={e => setBrand(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="cp-barcode" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:inventory.detail.barcode')} *</label>
              <input id="cp-barcode" value={barcode} onChange={e => setBarcode(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* SCRUM-240 (rebote de Gerencia Test 2026-08-12) — combobox de Familia compartido con
              la edición (ProductDetailModal): permite crear una familia nueva escribiendo su
              nombre, no solo elegir entre las ya existentes. */}
          <FamilyCombobox id="cp-family" value={familyId} onChange={setFamilyId} />

          <div>
            <label htmlFor="cp-category" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:inventory.detail.category')} *</label>
            <select id="cp-category" value={category} onChange={e => setCategory(e.target.value)} className={inputCls + ' bg-white'}>
              <option value="">—</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{t(`compras:newOrder.newProduct.categories.${c}`)}</option>)}
            </select>
          </div>
        </div>

        <h3 className="text-xs font-bold uppercase text-slate-400 mb-2">{t('compras:inventory.create.costsSection')}</h3>
        <div className="space-y-3 text-sm mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cp-rotation" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:newOrder.newProduct.rotation')} *</label>
              <select id="cp-rotation" value={rotation} onChange={e => setRotation(e.target.value as InventoryRotation)} className={inputCls + ' bg-white'}>
                {PRODUCT_ROTATIONS.map(r => <option key={r} value={r}>{t(`compras:newOrder.newProduct.rotations.${r}`)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="cp-reorder-point" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:inventory.detail.reorderPoint')} *</label>
              <input id="cp-reorder-point" type="number" min="0" value={reorderPoint} onChange={e => setReorderPoint(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label htmlFor="cp-cost" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:inventory.detail.cost')} *</label>
            <input id="cp-cost" type="number" step="0.01" min="0" value={cost} onChange={e => setCost(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label htmlFor="cp-additional-cost" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:newOrder.newProduct.additionalCost')} *</label>
            <div className="flex gap-2">
              <input
                id="cp-additional-cost" type="number" step="0.01" min="0" value={additionalCostAmount}
                onChange={e => setAdditionalCostAmount(e.target.value)}
                className={inputCls + ' flex-1'}
              />
              <select
                aria-label={t('compras:newOrder.newProduct.additionalCost') ?? ''}
                value={additionalCostType} onChange={e => setAdditionalCostType(e.target.value as 'monto' | 'porcentaje')}
                className="w-32 shrink-0 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
              >
                <option value="monto">{t('compras:newOrder.newProduct.additionalCostMonto')}</option>
                <option value="porcentaje">{t('compras:newOrder.newProduct.additionalCostPorcentaje')}</option>
              </select>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t('compras:inventory.create.additionalCostHint')}</p>
          </div>

          <div>
            <label htmlFor="cp-price-full" className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:inventory.detail.priceFull')} *</label>
            <input id="cp-price-full" type="number" step="0.01" min="0" value={priceFull} onChange={e => setPriceFull(e.target.value)} className={inputCls} />
          </div>
        </div>

        <h3 className="text-xs font-bold uppercase text-slate-400 mb-2">
          {t('compras:inventory.create.initialStock')} <span className="font-normal normal-case text-slate-400">({t('compras:inventory.create.optional')})</span>
        </h3>
        <div className="grid grid-cols-3 gap-3 mb-1 text-sm">
          {(warehousesData?.data ?? []).map(w => (
            <div key={w.id}>
              <label htmlFor={`cp-stock-${w.id}`} className="block text-xs font-semibold text-slate-600 mb-1">{w.name}</label>
              <input
                id={`cp-stock-${w.id}`}
                type="number" min="0" value={warehouseStocks[w.id] ?? '0'}
                onChange={e => setWarehouseStocks(prev => ({ ...prev, [w.id]: e.target.value }))}
                className={inputCls}
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mb-4">{t('compras:inventory.create.initialStockHint')}</p>

        {/* SCRUM-237/426 — mismo mecanismo de documento/link que la edición (ProductDetailModal
            más arriba), pero staged localmente hasta el submit — ahora enviado en el MISMO POST
            de creación (ver comprasApi.inventory.create), no en una llamada aparte. */}
        <h3 className="text-xs font-bold uppercase text-slate-400 mb-2">{t('compras:inventory.detail.technicalSheetDocSection')} *</h3>
        <div className="mb-4">
          {fichaFile === null && fichaLink.trim() === '' && fichaMode !== 'form' && (
            <>
              <Button type="button" variant="outline" className="!text-xs inline-flex items-center gap-1.5" onClick={() => setFichaMode('form')}>
                <IcoFileText size={14} />
                {t('compras:inventory.detail.technicalSheetDoc.upload')}
              </Button>
              <p className="text-[11px] text-slate-400 mt-1">{t('compras:inventory.create.technicalSheetRequiredHint')}</p>
            </>
          )}
          {(fichaFile !== null || fichaLink.trim() !== '') && fichaMode !== 'form' && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-slate-600">{fichaFile?.name ?? fichaLink}</span>
              <Button type="button" variant="outline" className="!text-xs" onClick={() => setFichaMode('form')}>
                {t('compras:inventory.detail.technicalSheetDoc.replace')}
              </Button>
            </div>
          )}
          {fichaMode === 'form' && (
            <div className="mt-2 flex flex-col gap-2 p-2 rounded border border-slate-200 bg-slate-50">
              <label className="text-xs text-slate-600">
                {t('compras:inventory.detail.technicalSheetDoc.fileLabel')}
                <input
                  type="file" accept=".pdf,.png,.jpg,.jpeg" className="block mt-1 text-xs"
                  onChange={e => { const file = e.target.files?.[0]; if (file) { setFichaFile(file); setFichaLink(''); setFichaMode(null) } }}
                />
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url" value={fichaLink} onChange={e => setFichaLink(e.target.value)}
                  placeholder={t('compras:inventory.detail.technicalSheetDoc.linkPlaceholder') ?? ''}
                  className="px-2 py-1.5 border border-slate-200 rounded text-xs flex-1"
                />
                <Button type="button" className="!text-xs" disabled={fichaLink.trim() === ''} onClick={() => { setFichaFile(null); setFichaMode(null) }}>
                  {t('compras:inventory.detail.technicalSheetDoc.saveLink')}
                </Button>
              </div>
              <Button type="button" variant="outline" className="!text-xs w-fit" onClick={() => setFichaMode(null)}>
                {t('compras:inventory.actions.cancel')}
              </Button>
            </div>
          )}
        </div>

        {formError && <p className="text-xs text-red-600 mb-3">{formError}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={requestClose}>{t('compras:inventory.actions.cancel')}</Button>
          <Button loading={create.isPending} disabled={!canSubmit} onClick={handleSubmit}>
            {t('compras:inventory.create.submit')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/**
 * Lote 4 (SCRUM-243, 2026-08-17) — rediseño completo contra mockup: de lista de texto plana con
 * drill-down a otra vista, a cards expandibles INLINE (chevron, sin navegar) con la tabla completa
 * de 21 columnas de `ProductsTab` al expandir (`InventoryProductsTable`, extraída para esto). Solo
 * una familia expandida a la vez — mismo criterio que el mockup, y evita pedir el detalle
 * (`useInventoryFamily`) de más de una familia simultáneamente.
 */
function FamiliesTab({ previewVentas }: { previewVentas: boolean }) {
  const { t } = useTranslation(['common', 'compras'])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [autoPrefillId, setAutoPrefillId] = useState<number | null>(null)
  // SCRUM-244 — mismo WarehouseStockModal dedicado que ProductsTab (rebote 2026-08-16).
  const [warehouseModalId, setWarehouseModalId] = useState<number | null>(null)
  const generatePurchase = useGenerateFamilyPurchase()
  const [famPage, setFamPage] = useState(1)
  const [famPerPage, setFamPerPage] = useState<number | 'all'>(20)

  const { data: families } = useInventoryFamilies(famPage, famPerPage)
  // SCRUM-243 (REQ-180) — endpoint propio de Compras (no el de VentasDiseno Catálogo), expone
  // costo/valor total y viene `restricted`-aware: RN exige que "Generar compra" no esté
  // disponible en modo Ventas & Diseño.
  const { data: detail, isFetching: isFetchingDetail } = useInventoryFamily(expandedId)

  function toggle(id: number) {
    setExpandedId(current => (current === id ? null : id))
    generatePurchase.reset()
  }

  const items = families?.data ?? []
  // Lote 4 — valor total oculto si el actor está en modo restringido (Ventas & Diseño con solo
  // `ventas_diseno.read`) O eligió el preview manual del toggle.
  const showFinancial = !(families?.restricted ?? true) && !previewVentas
  // SCRUM-773 (CA4, mismo bug que "+ Nueva orden de compra" del header) — "Generar compra" es una
  // acción de escritura y NO debe reusar `restricted` (compras.limited.view/Líder de Operaciones
  // trae restricted=false para ver el valor total, pero jamás debe poder generar una orden).
  const canManage = (families?.can_manage ?? false) && !previewVentas

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4 max-w-3xl">{t('compras:inventory.families.subtitle')}</p>

      {items.length === 0 && (
        <p className="text-slate-400 text-sm">{t('compras:inventory.families.emptyList')}</p>
      )}

      <div className="space-y-3">
        {items.map(f => {
          const isExpanded = expandedId === f.id
          return (
            <Card key={f.id} variant="panel" className="overflow-hidden">
              {/* 2 elementos hermanos, no un botón anidado dentro de otro (HTML inválido) — el
                  toggle cubre chevron+nombre+contador, "Generar compra" queda aparte a la derecha. */}
              <div className="w-full flex items-center justify-between gap-4 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggle(f.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  data-testid={`family-toggle-${f.id}`}
                >
                  {isExpanded ? <IcoChevronDown size={16} className="shrink-0 text-slate-400" /> : <IcoChevronRight size={16} className="shrink-0 text-slate-400" />}
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{f.name}</p>
                    <p className="text-xs text-slate-400">{t('compras:inventory.families.productCount', { count: f.product_count })}</p>
                  </div>
                </button>
                <div className="flex items-center gap-4 shrink-0">
                  {showFinancial && f.total_value !== null && (
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {t('compras:inventory.families.totalValueLabel')}
                      </p>
                      <p className="text-sm font-semibold text-slate-700">${formatMoney(f.total_value)}</p>
                    </div>
                  )}
                  {canManage && (
                    <Button
                      variant="secondary"
                      className="!text-xs !px-3 !py-1.5"
                      loading={isExpanded && generatePurchase.isPending}
                      disabled={f.product_count === 0}
                      onClick={() => { setExpandedId(f.id); generatePurchase.mutate(f.id) }}
                    >
                      {t('compras:inventory.families.generatePurchase')}
                    </Button>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div>
                  {isExpanded && generatePurchase.isSuccess && (
                    <p className="text-xs text-emerald-700 flex items-center gap-1 px-4 pt-2">
                      <IcoCheck size={12} />
                      {t('compras:inventory.families.generated', { count: generatePurchase.data.order_ids.length })}
                    </p>
                  )}
                  {isExpanded && generatePurchase.isError && (
                    <p className="text-xs text-red-600 px-4 pt-2">
                      {createProductErrorMessage(generatePurchase.error, t('compras:inventory.families.generateError'))}
                    </p>
                  )}
                  {detail && detail.id === f.id ? (
                    <InventoryProductsTable
                      products={detail.products}
                      restricted={detail.restricted}
                      canManage={detail.can_manage}
                      previewVentas={previewVentas}
                      isLoading={isFetchingDetail}
                      onRowClick={setDetailId}
                      onGenerateOrder={id => { setDetailId(id); setAutoPrefillId(id) }}
                      onViewWarehouses={setWarehouseModalId}
                    />
                  ) : (
                    <p className="text-slate-400 text-sm px-4 py-6">{t('common:labels.loading')}</p>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {families?.meta && (
        <Pagination
          meta={families.meta}
          perPage={famPerPage}
          onPageChange={setFamPage}
          onPerPageChange={p => { setFamPerPage(p); setFamPage(1) }}
        />
      )}

      {detailId !== null && (
        <ProductDetailModal
          id={detailId}
          restricted={(detail?.restricted ?? true) || previewVentas}
          canManage={(detail?.can_manage ?? false) && !previewVentas}
          autoTriggerPrefill={autoPrefillId === detailId}
          onClose={() => { setDetailId(null); setAutoPrefillId(null) }}
        />
      )}

      {warehouseModalId !== null && (
        <WarehouseStockModal
          productId={warehouseModalId}
          onClose={() => setWarehouseModalId(null)}
        />
      )}
    </div>
  )
}
