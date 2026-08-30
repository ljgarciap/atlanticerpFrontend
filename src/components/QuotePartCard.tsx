import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type {
  QuotePartRef, QuoteItemRef, QuoteItemPayload, QuoteItemPriceTypeOverride, QuoteDiscountMode, QuotePriceType,
  CatalogProductRef, CatalogProductFamilyRef, CatalogProductFamilyDetail, QuoteItemPricePreview,
} from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'
import { sanitizeUnsignedDecimalInput, clampPercentInput } from '@/lib/decimalInput'
import { formatMoney } from '@/lib/money'

interface ItemDraft {
  catalog_product_id: number | null
  reference:           string
  description:         string
  quantity:            string
  unit_price:          string
  cost:                string
  discount_percent:    string
  price_type_override: QuoteItemPriceTypeOverride | ''
  // REQ-039 — stock del producto de catálogo seleccionado, solo para comparar contra
  // `quantity` en el cliente y mostrar el mensaje; nunca viaja en el payload (toPayload()
  // no lo incluye, el backend sigue sin bloquear nada por esto).
  stock_quantity:      number | null
}

function emptyDraft(): ItemDraft {
  return {
    catalog_product_id: null,
    reference: '', description: '', quantity: '1', unit_price: '', cost: '', discount_percent: '', price_type_override: '',
    stock_quantity: null,
  }
}

function draftFromItem(item: QuoteItemRef): ItemDraft {
  return {
    catalog_product_id: item.catalog_product_id,
    reference: item.reference,
    description: item.description,
    quantity: String(item.quantity),
    unit_price: String(item.unit_price),
    cost: item.cost != null ? String(item.cost) : '',
    discount_percent: item.discount_percent != null ? String(item.discount_percent) : '',
    price_type_override: item.price_type_override ?? '',
    stock_quantity: item.stock_quantity,
  }
}

// REQ-039: null = sin control de stock (no alerta); solo aplica a productos de catálogo.
function stockShortage(draft: ItemDraft): number | null {
  if (draft.catalog_product_id == null || draft.stock_quantity == null) return null
  const quantity = Number(draft.quantity)
  if (!Number.isFinite(quantity) || quantity <= draft.stock_quantity) return null
  return quantity - draft.stock_quantity
}

// REQ-036: con catalog_product_id, reference/description/unit_price/cost se
// resuelven server-side desde el producto real — no hace falta mandarlos.
function toPayload(draft: ItemDraft): QuoteItemPayload {
  if (draft.catalog_product_id != null) {
    return {
      catalog_product_id: draft.catalog_product_id,
      quantity: Number(draft.quantity),
      // SCRUM-725 — precio de venta modificable SOLO dentro de esta cotización
      // (nunca toca CatalogProduct::price_full, ver QuoteItemController); siempre
      // se manda el valor actual del campo, coincida o no con el del catálogo.
      unit_price_override: draft.unit_price === '' ? null : Number(draft.unit_price),
      discount_percent: draft.discount_percent === '' ? null : Number(draft.discount_percent),
      price_type_override: draft.price_type_override || null,
    }
  }

  return {
    reference: draft.reference,
    description: draft.description,
    quantity: Number(draft.quantity),
    unit_price: Number(draft.unit_price),
    cost: draft.cost === '' ? null : Number(draft.cost),
    discount_percent: draft.discount_percent === '' ? null : Number(draft.discount_percent),
    price_type_override: draft.price_type_override || null,
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return (isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined) ?? fallback
}

const inputCls = 'rounded-md border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400'

// SCRUM-796 (secc. 5) — badge de disponibilidad por color (verde/ámbar/rojo), mismo
// criterio visual del mockup adjunto al ticket.
function StockBadge({ stock }: { stock: number | null }) {
  if (stock == null) return null
  const cls = stock === 0
    ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
    : stock <= 3
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
  return <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{stock} disp.</span>
}

/**
 * REQ-036: buscador de productos del Catálogo — referencia/descripción con
 * tolerancia a tipeo (banner de aproximados, mismo mecanismo que REQ-081/
 * SCRUM-103), y ficha técnica (foto/marca/descripción/disponible/precio,
 * REQ-036 AC2 — a propósito nunca `cost`) antes de confirmar la selección.
 * REQ-037: tab "Familias" — selecciona todos los productos de una familia de
 * una sola vez (ver onSelectFamily, que dispara el alta en lote directo, sin
 * pasar por el draft de "nuevo ítem" — a diferencia de onSelect, que solo
 * precarga el draft para que el usuario confirme cantidad/precio).
 */
function CatalogProductPicker({ onSelect, onSelectFamily, onCancel }: {
  onSelect: (product: CatalogProductRef) => void
  onSelectFamily: (catalogProductIds: number[]) => void
  onCancel: () => void
}) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const [mode, setMode] = useState<'search' | 'families'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogProductRef[]>([])
  const [searched, setSearched] = useState(false)
  const [preview, setPreview] = useState<CatalogProductRef | null>(null)

  const [families, setFamilies] = useState<CatalogProductFamilyRef[]>([])
  const [familiesLoaded, setFamiliesLoaded] = useState(false)
  const [familyDetail, setFamilyDetail] = useState<CatalogProductFamilyDetail | null>(null)

  function runSearch(q: string) {
    setQuery(q)
    // SCRUM-796 (secc. 6) — el backend ya no busca por heurística (FuzzySearchService),
    // solo coincidencia exacta/parcial — `fuzzy` en la respuesta quedó fijo en `false`
    // por compatibilidad de shape con otros buscadores del módulo, así que el banner de
    // "resultado aproximado" que existía acá ya no aplica nunca, se retira.
    ventasDisenoApi.catalogProducts.search(q).then(res => {
      setResults(res.data); setSearched(true)
    }).catch(() => { setResults([]); setSearched(true) })
  }

  // SCRUM-734 (sección 9) — catálogo completo visible al abrir la lupa sin
  // escribir nada, en vez de una lista vacía hasta el primer tipeo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { runSearch('') }, [])

  function openFamiliesTab() {
    setMode('families')
    if (!familiesLoaded) {
      ventasDisenoApi.catalogProductFamilies.list().then(res => {
        setFamilies(res.data); setFamiliesLoaded(true)
      }).catch(() => { setFamilies([]); setFamiliesLoaded(true) })
    }
  }

  function openFamily(id: number) {
    ventasDisenoApi.catalogProductFamilies.get(id).then(setFamilyDetail).catch(() => setFamilyDetail(null))
  }

  if (familyDetail) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
        <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{familyDetail.name}</p>
        {familyDetail.description && <p className="text-xs text-slate-500 mt-0.5">{familyDetail.description}</p>}
        <ul className="max-h-48 overflow-auto divide-y divide-slate-100 dark:divide-slate-700 mt-2">
          {familyDetail.products.map(product => (
            <li key={product.id} className="px-2 py-1.5 text-xs flex justify-between gap-2">
              <span>
                <span className="font-semibold">{product.factory_reference ?? product.reference}</span> — {product.description}
              </span>
              <span className="shrink-0 text-slate-500">${formatMoney(product.price_full)}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-3">
          <Button variant="secondary" onClick={() => setFamilyDetail(null)}>{t('common:actions.cancel')}</Button>
          <Button
            disabled={familyDetail.products.length === 0}
            onClick={() => onSelectFamily(familyDetail.products.map(p => p.id))}
          >
            {t('ventasDiseno:catalog.selectAllProducts')}
          </Button>
        </div>
      </div>
    )
  }

  if (preview) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
        <div className="flex gap-3">
          {preview.photo_url && (
            <img src={preview.photo_url} alt={preview.description} className="w-20 h-20 object-cover rounded-md shrink-0" />
          )}
          <div className="text-xs space-y-1">
            <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{preview.description}</p>
            <p className="text-slate-500">{t('ventasDiseno:quote.item.reference')}: {preview.factory_reference ?? preview.reference}</p>
            {preview.brand && <p className="text-slate-500">{t('ventasDiseno:catalog.brand')}: {preview.brand}</p>}
            <p className="text-slate-500">
              {t('ventasDiseno:catalog.available')}: {preview.stock_quantity ?? t('ventasDiseno:catalog.unlimited')}
            </p>
            <p className="font-semibold text-slate-900 dark:text-slate-100">${formatMoney(preview.price_full)}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button variant="secondary" onClick={() => setPreview(null)}>{t('common:actions.cancel')}</Button>
          <Button onClick={() => onSelect(preview)}>{t('ventasDiseno:catalog.selectProduct')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
      <div className="flex gap-2 mb-2 items-center">
        <button
          onClick={() => setMode('search')}
          className={`text-xs font-semibold px-2 py-1 rounded-md ${mode === 'search' ? 'bg-[#5BA5A0]/10 text-[#5BA5A0]' : 'text-slate-500'}`}
        >
          {t('ventasDiseno:catalog.tabSearch')}
        </button>
        <button
          onClick={openFamiliesTab}
          className={`text-xs font-semibold px-2 py-1 rounded-md ${mode === 'families' ? 'bg-[#5BA5A0]/10 text-[#5BA5A0]' : 'text-slate-500'}`}
        >
          {t('ventasDiseno:catalog.tabFamilies')}
        </button>
        <span className="flex-1" />
        <Button variant="secondary" onClick={onCancel}>{t('common:actions.cancel')}</Button>
      </div>

      {mode === 'search' ? (
        <>
          <input
            autoFocus placeholder={t('ventasDiseno:catalog.searchPlaceholder')} value={query}
            onChange={e => runSearch(e.target.value)}
            className={`${inputCls} w-full mb-2`}
          />
          {searched && results.length === 0 && (
            <p className="text-xs text-slate-400">{t('ventasDiseno:catalog.empty')}</p>
          )}
          <ul className="max-h-48 overflow-auto divide-y divide-slate-100 dark:divide-slate-700">
            {results.map(product => (
              <li key={product.id}>
                <button
                  onClick={() => setPreview(product)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 flex justify-between gap-2"
                >
                  <span>
                    <span className="font-semibold">{product.factory_reference ?? product.reference}</span> — {product.description}
                  </span>
                  <span className="shrink-0 text-slate-500">${formatMoney(product.price_full)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {familiesLoaded && families.length === 0 && (
            <p className="text-xs text-slate-400">{t('ventasDiseno:catalog.familiesEmpty')}</p>
          )}
          <ul className="max-h-48 overflow-auto divide-y divide-slate-100 dark:divide-slate-700">
            {families.map(family => (
              <li key={family.id}>
                <button
                  onClick={() => openFamily(family.id)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 flex justify-between gap-2"
                >
                  <span className="font-semibold">{family.name}</span>
                  <span className="shrink-0 text-slate-500">
                    {t('ventasDiseno:catalog.familyProductsCount', { count: family.products_count })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

interface Props {
  quoteId:          number
  part:             QuotePartRef
  discountMode:     QuoteDiscountMode
  canEdit:          boolean
  // SCRUM-725 (decisión de Luis, 2026-08-05) — porcentaje real, ya no oculto.
  minMarginPercent: number
  // SCRUM-725 (fix 2026-08-06) — necesario para saber si el tipo de precio EFECTIVO
  // de cada ítem es "premium" (override propio, o "usar general" heredando este
  // valor) y así deshabilitar el precio manual, que esa fórmula ignora por completo.
  quotePriceType:   QuotePriceType
}

export default function QuotePartCard({ quoteId, part, discountMode, canEdit, minMarginPercent, quotePriceType }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['ventas-diseno-quote', quoteId] })

  const [name, setName] = useState(part.name)
  const [showNewItem, setShowNewItem] = useState(false)
  const [showCatalogPicker, setShowCatalogPicker] = useState(false)
  const [newItem, setNewItem] = useState<ItemDraft>(emptyDraft())
  const [error, setError] = useState<string | null>(null)

  // SCRUM-796 (secc. 5) — búsqueda dinámica mientras se escribe en Referencia, alternativa
  // adicional al botón "Buscar en catálogo" (que sigue intacto). Debounce simple (300ms) —
  // no existe ningún hook reusable de debounce hoy en el repo.
  const [refResults, setRefResults] = useState<CatalogProductRef[]>([])
  const [refDropdownOpen, setRefDropdownOpen] = useState(false)
  useEffect(() => {
    const q = newItem.reference.trim()
    if (newItem.catalog_product_id != null || q === '') {
      setRefResults([]); setRefDropdownOpen(false)
      return
    }
    const timer = setTimeout(() => {
      ventasDisenoApi.catalogProducts.search(q).then(res => {
        setRefResults(res.data); setRefDropdownOpen(res.data.length > 0)
      }).catch(() => { setRefResults([]); setRefDropdownOpen(false) })
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newItem.reference, newItem.catalog_product_id])

  const renameMutation = useMutation({
    mutationFn: (newName: string) => ventasDisenoApi.quotes.parts.update(quoteId, part.id, newName),
    onSuccess: invalidate,
  })
  const deletePartMutation = useMutation({
    mutationFn: () => ventasDisenoApi.quotes.parts.remove(quoteId, part.id),
    onSuccess: invalidate,
  })
  const createItemMutation = useMutation({
    mutationFn: (draft: ItemDraft) => ventasDisenoApi.quotes.parts.items.create(quoteId, part.id, toPayload(draft)),
    onSuccess: () => { setShowNewItem(false); setShowCatalogPicker(false); setNewItem(emptyDraft()); setError(null); invalidate() },
    onError: (err: unknown) => setError(errorMessage(err, t('ventasDiseno:modal.createError'))),
  })
  // REQ-037: alta en lote — a diferencia de createItemMutation, no pasa por el
  // draft de "nuevo ítem" (no hay cantidad/precio que confirmar por producto).
  const bulkCreateItemMutation = useMutation({
    mutationFn: (catalogProductIds: number[]) => ventasDisenoApi.quotes.parts.items.bulkCreate(quoteId, part.id, catalogProductIds),
    onSuccess: () => { setShowNewItem(false); setShowCatalogPicker(false); setError(null); invalidate() },
    onError: (err: unknown) => setError(errorMessage(err, t('ventasDiseno:modal.createError'))),
  })

  // REQ-036: un ítem de catálogo ya trae reference/description/unit_price
  // resueltos server-side — solo falta la cantidad para poder agregarlo.
  const newItemValid = newItem.catalog_product_id != null
    ? newItem.quantity !== ''
    : newItem.reference.trim() !== '' && newItem.description.trim() !== ''
      && newItem.quantity !== '' && newItem.unit_price !== ''

  function selectCatalogProduct(product: CatalogProductRef) {
    setNewItem(d => ({
      ...d, catalog_product_id: product.id, reference: product.factory_reference ?? product.reference,
      description: product.description, unit_price: String(product.price_full),
      stock_quantity: product.stock_quantity,
    }))
    setShowCatalogPicker(false)
  }

  const newItemShortage = stockShortage(newItem)

  function selectFamily(catalogProductIds: number[]) {
    bulkCreateItemMutation.mutate(catalogProductIds)
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 mb-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <input
          type="text" value={name} disabled={!canEdit}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== part.name) renameMutation.mutate(name) }}
          className="font-semibold text-sm rounded-md border border-transparent hover:border-slate-300 focus:border-[#5BA5A0] px-2 py-1 bg-transparent focus:outline-none disabled:text-slate-400"
        />
        {canEdit && (
          <button onClick={() => deletePartMutation.mutate()} className="text-red-500 hover:text-red-700 text-xs font-semibold shrink-0">
            {t('common:actions.delete')}
          </button>
        )}
      </div>

      {part.items.length > 0 && (
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                <th className="py-1 pr-2">{t('ventasDiseno:quote.item.reference')}</th>
                <th className="py-1 pr-2">{t('ventasDiseno:quote.item.description')}</th>
                <th className="py-1 pr-2">{t('ventasDiseno:quote.item.quantity')}</th>
                <th className="py-1 pr-2">{t('ventasDiseno:quote.item.unitPrice')}</th>
                <th className="py-1 pr-2">{t('ventasDiseno:quote.item.cost')}</th>
                {discountMode === 'line' && <th className="py-1 pr-2">{t('ventasDiseno:quote.item.discount')}</th>}
                <th className="py-1 pr-2">{t('ventasDiseno:quote.item.priceType')}</th>
                <th className="py-1 pr-2 text-right">{t('ventasDiseno:quote.item.total')}</th>
                {canEdit && <th className="py-1"></th>}
              </tr>
            </thead>
            <tbody>
              {part.items.map(item => (
                <QuoteItemRow
                  key={item.id} quoteId={quoteId} partId={part.id} item={item}
                  discountMode={discountMode} canEdit={canEdit} onSaved={invalidate}
                  minMarginPercent={minMarginPercent} quotePriceType={quotePriceType}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        showNewItem ? (
          showCatalogPicker ? (
            <CatalogProductPicker onSelect={selectCatalogProduct} onSelectFamily={selectFamily} onCancel={() => setShowCatalogPicker(false)} />
          ) : (
          <div className="flex flex-wrap gap-2 items-end bg-white dark:bg-slate-800 rounded-lg p-2">
            {newItem.catalog_product_id != null ? (
              <div className="w-full flex items-center justify-between text-xs bg-[#5BA5A0]/10 rounded-md px-2 py-1.5 mb-1">
                <span>
                  <span className="font-semibold">{newItem.reference}</span> — {newItem.description}
                </span>
                <button
                  onClick={() => setNewItem(d => ({ ...d, catalog_product_id: null, reference: '', description: '', unit_price: '' }))}
                  className="text-red-500 hover:text-red-700 font-semibold shrink-0 ml-2"
                >
                  {t('ventasDiseno:catalog.remove')}
                </button>
              </div>
            ) : (
              <>
                <div className="relative w-28">
                  <input
                    placeholder={t('ventasDiseno:quote.item.reference')} value={newItem.reference}
                    onChange={e => setNewItem(d => ({ ...d, reference: e.target.value }))}
                    onFocus={() => refResults.length > 0 && setRefDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setRefDropdownOpen(false), 150)}
                    className={`${inputCls} w-full`}
                  />
                  {/* SCRUM-796 (secc. 5.2) — mismas 4 columnas del mockup adjunto: referencia,
                      nombre+descripción, disponible, precio. Seleccionar autocompleta igual
                      que el botón "Buscar en catálogo" (mismo selectCatalogProduct). */}
                  {refDropdownOpen && (
                    <ul className="absolute z-20 top-full left-0 mt-1 w-72 max-h-56 overflow-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg divide-y divide-slate-100 dark:divide-slate-700">
                      {refResults.map(product => (
                        <li key={product.id}>
                          <button
                            type="button"
                            onMouseDown={() => selectCatalogProduct(product)}
                            className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-between gap-2"
                          >
                            <span className="min-w-0">
                              <span className="font-semibold">{product.factory_reference ?? product.reference}</span>
                              {' — '}{product.description}
                            </span>
                            <span className="shrink-0 flex items-center gap-1.5">
                              <StockBadge stock={product.stock_quantity} />
                              <span className="text-slate-500">${formatMoney(product.price_full)}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <input
                  placeholder={t('ventasDiseno:quote.item.description')} value={newItem.description}
                  onChange={e => setNewItem(d => ({ ...d, description: e.target.value }))}
                  className={`${inputCls} flex-1 min-w-[120px]`}
                />
              </>
            )}
            <input
              type="number" placeholder={t('ventasDiseno:quote.item.quantity')} value={newItem.quantity}
              onChange={e => setNewItem(d => ({ ...d, quantity: e.target.value }))}
              className={`${inputCls} w-16`}
            />
            {/* SCRUM-725 — editable también con un producto de catálogo elegido (se manda
                como unit_price_override); ya no se deshabilita por catalog_product_id. */}
            <input
              type="number" placeholder={t('ventasDiseno:quote.item.unitPrice')} value={newItem.unit_price}
              onChange={e => setNewItem(d => ({ ...d, unit_price: e.target.value }))}
              className={`${inputCls} w-24`}
            />
            {newItem.catalog_product_id == null && (
              <input
                type="number" placeholder={t('ventasDiseno:quote.item.cost')} value={newItem.cost}
                onChange={e => setNewItem(d => ({ ...d, cost: e.target.value }))}
                title={t('ventasDiseno:quote.item.costHint')}
                className={`${inputCls} w-24`}
              />
            )}
            {discountMode === 'line' && (
              <input
                type="text" inputMode="decimal" placeholder="%" value={newItem.discount_percent}
                onChange={e => setNewItem(d => ({ ...d, discount_percent: sanitizeUnsignedDecimalInput(e.target.value) }))}
                onBlur={e => setNewItem(d => ({ ...d, discount_percent: clampPercentInput(e.target.value) }))}
                className={`${inputCls} w-16`}
              />
            )}
            <select
              value={newItem.price_type_override}
              onChange={e => setNewItem(d => ({ ...d, price_type_override: e.target.value as QuoteItemPriceTypeOverride | '' }))}
              className={inputCls}
            >
              <option value="">{t('ventasDiseno:quote.item.useGeneral')}</option>
              <option value="public">{t('ventasDiseno:priceType.public')}</option>
              <option value="project">{t('ventasDiseno:priceType.project')}</option>
              <option value="special">{t('ventasDiseno:priceType.special')}</option>
              <option value="premium">{t('ventasDiseno:priceType.premium')}</option>
            </select>
            {newItem.catalog_product_id == null && (
              <Button variant="secondary" onClick={() => setShowCatalogPicker(true)}>
                {t('ventasDiseno:catalog.searchButton')}
              </Button>
            )}
            <Button variant="secondary" onClick={() => { setShowNewItem(false); setNewItem(emptyDraft()) }}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              onClick={() => createItemMutation.mutate(newItem)}
              disabled={!newItemValid || createItemMutation.isPending}
              loading={createItemMutation.isPending}
            >
              {t('common:actions.add')}
            </Button>
            {newItemShortage !== null && (
              <p className="w-full text-[11px] text-amber-600">
                {t('ventasDiseno:catalog.insufficientStock', { count: newItemShortage })}
              </p>
            )}
          </div>
          )
        ) : (
          <button onClick={() => setShowNewItem(true)} className="text-[12px] font-semibold text-[#5BA5A0]">
            {t('ventasDiseno:quote.item.addItem')}
          </button>
        )
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      <p className="text-right text-xs font-semibold text-slate-600 dark:text-slate-300 mt-2">
        {t('ventasDiseno:quote.item.subtotal')}: ${formatMoney(part.subtotal)}
      </p>
    </div>
  )
}

/**
 * SCRUM-734 (sección 9, RN9.1) — "Editar precio": el precio de un ítem ya no se
 * edita escribiendo directo en la fila, sino en este modal — Precio de catálogo
 * de referencia (solo informativo), Nuevo precio, validación de margen EN VIVO
 * (debounced contra QuoteItemController::previewPrice(), sin persistir), y
 * Guardar/Cancelar. Cancelar cierra sin llamar a ningún endpoint — el precio del
 * ítem queda exactamente igual que antes de abrir el modal, porque este modal
 * nunca toca el `draft` de la fila (opera sobre el ítem YA persistido en el
 * servidor, no sobre ediciones sin guardar de otros campos de esa misma fila).
 */
function PriceEditModal({ quoteId, partId, item, onClose, onSaved }: {
  quoteId: number
  partId:  number
  item:    QuoteItemRef
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const [priceDraft, setPriceDraft] = useState(String(item.unit_price))
  const [preview, setPreview] = useState<QuoteItemPricePreview | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // RN9.1 — "Precio de catálogo" de referencia, solo informativo; se resuelve acá
  // (no lo pasa el padre) porque solo hace falta mientras el modal está abierto.
  const [catalogPrice, setCatalogPrice] = useState<number | null>(null)

  useEffect(() => {
    if (item.catalog_product_id === null) return
    ventasDisenoApi.catalogProducts.get(item.catalog_product_id)
      .then(p => setCatalogPrice(p.price_full))
      .catch(() => setCatalogPrice(null))
  }, [item.catalog_product_id])

  useEffect(() => {
    const price = Number(priceDraft)
    if (priceDraft.trim() === '' || !Number.isFinite(price) || price < 0) {
      setPreview(null)
      return
    }

    const handle = setTimeout(() => {
      ventasDisenoApi.quotes.parts.items.previewPrice(quoteId, partId, item.id, price)
        .then(setPreview)
        .catch(() => setPreview(null))
    }, 300)

    return () => clearTimeout(handle)
  }, [priceDraft, quoteId, partId, item.id])

  const saveMutation = useMutation({
    mutationFn: () => ventasDisenoApi.quotes.parts.items.update(
      quoteId, partId, item.id, toPayload({ ...draftFromItem(item), unit_price: priceDraft }),
    ),
    onSuccess: () => onSaved(),
    onError: (err: unknown) => setSaveError(errorMessage(err, t('ventasDiseno:modal.createError'))),
  })

  // RN9.1 — "Guardar" bloqueado mientras haya una violación vigente que el
  // usuario actual no pueda pasar por alto (Mark/David sí pueden, con
  // confirmación implícita del propio botón — no hay modal de advertencia acá,
  // a diferencia de confirm(), porque acá todavía no se está generando nada).
  const blocked = preview?.violates_margin === true && !preview.can_override

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <Card variant="modal" className="w-full max-w-sm my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{t('ventasDiseno:quote.item.editPrice')}</h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          {catalogPrice !== null && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {t('ventasDiseno:quote.item.catalogPriceReference')}
              </label>
              <p className="text-sm text-slate-700 dark:text-slate-200 py-1.5">${formatMoney(catalogPrice)}</p>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
              {t('ventasDiseno:quote.item.newPrice')}
            </label>
            <input
              type="number" autoFocus value={priceDraft}
              onChange={e => setPriceDraft(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-50"
            />
            {preview?.violates_margin && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{preview.message}</p>
            )}
          </div>

          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={blocked || saveMutation.isPending || priceDraft.trim() === ''}
            loading={saveMutation.isPending}
          >
            {t('ventasDiseno:quote.save')}
          </Button>
        </div>
      </Card>
    </div>
  )
}

function QuoteItemRow({
  quoteId, partId, item, discountMode, canEdit, onSaved, minMarginPercent, quotePriceType,
}: {
  quoteId:          number
  partId:           number
  item:             QuoteItemRef
  discountMode:     QuoteDiscountMode
  canEdit:          boolean
  onSaved:          () => void
  minMarginPercent: number
  quotePriceType:   QuotePriceType
}) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const [draft, setDraft] = useState<ItemDraft>(draftFromItem(item))
  const [error, setError] = useState<string | null>(null)
  const [showPriceModal, setShowPriceModal] = useState(false)

  // SCRUM-133 (REQ-041): cuando el servidor cambia el ítem por una vía indirecta
  // — ej. cambiar el modo de descuento a "Global" resetea discount_percent a 0
  // en TODOS los ítems (QuoteService::resetDiscountsForModeSwitch) — la fila no
  // remonta (misma key={item.id}), así que su estado local `draft` quedaba con
  // el valor viejo y el botón "Guardar" reaparecía; un click ahí re-enviaba el
  // valor viejo y deshacía el reset. Resincronizamos `draft` con el ítem fresco
  // cuando cambian los valores que vienen del servidor (firma serializada, no la
  // identidad del objeto — así un refetch que no cambió nada no pisa lo que el
  // usuario esté tipeando en este momento).
  const serverSignature = JSON.stringify([
    item.reference, item.description, item.quantity, item.unit_price, item.cost,
    item.discount_percent, item.price_type_override, item.stock_quantity, item.catalog_product_id,
  ])
  useEffect(() => {
    setDraft(draftFromItem(item))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSignature])

  const original = draftFromItem(item)
  const isDirty = Object.keys(draft).some(key => draft[key as keyof ItemDraft] !== original[key as keyof ItemDraft])

  const updateMutation = useMutation({
    mutationFn: () => ventasDisenoApi.quotes.parts.items.update(quoteId, partId, item.id, toPayload(draft)),
    onSuccess: () => { setError(null); onSaved() },
    onError: (err: unknown) => setError(errorMessage(err, t('ventasDiseno:modal.createError'))),
  })
  const deleteMutation = useMutation({
    mutationFn: () => ventasDisenoApi.quotes.parts.items.remove(quoteId, partId, item.id),
    onSuccess: onSaved,
  })

  // REQ-035: reference/description/unit_price/cost de un ítem de catálogo
  // quedan bloqueados incluso al editar — no se puede "desvincular" tipeando
  // encima, hay que borrar el ítem y agregarlo de nuevo como personalizado.
  const locked = !item.is_custom
  const shortage = stockShortage(draft)
  // SCRUM-725 (fix 2026-08-06) — bajo "Tarifa Premium" (override del ítem, o "usar
  // general" heredando el tipo de la cotización), effectiveUnitPrice() ignora
  // unit_price por completo (usa costo/premium_divisor) — el campo manual quedaba
  // editable pero sin ningún efecto real, lo que confundió a un usuario real que
  // pensó que había fijado un precio (Daniela, SCRUM-725, 2026-08-05).
  const effectivePriceType = draft.price_type_override || quotePriceType
  const priceOverrideDisabled = !canEdit || effectivePriceType === 'premium'

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-1 pr-2">
        <input value={draft.reference} disabled={!canEdit || locked} onChange={e => setDraft(d => ({ ...d, reference: e.target.value }))} className={`${inputCls} w-24`} />
      </td>
      <td className="py-1 pr-2">
        <input value={draft.description} disabled={!canEdit || locked} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} className={`${inputCls} w-32`} />
      </td>
      <td className="py-1 pr-2">
        <input type="number" value={draft.quantity} disabled={!canEdit} onChange={e => setDraft(d => ({ ...d, quantity: e.target.value }))} className={`${inputCls} w-14`} />
        {shortage !== null && (
          <div className="text-[10px] text-amber-600 mt-0.5 whitespace-nowrap">
            {t('ventasDiseno:catalog.insufficientStock', { count: shortage })}
          </div>
        )}
      </td>
      <td className="py-1 pr-2">
        {/* SCRUM-734 (sección 9, RN9.1) — el precio ya no se edita escribiendo
            directo, abre el modal dedicado (Precio de catálogo + Nuevo precio +
            validación en vivo + Guardar/Cancelar). Viaja como unit_price_override
            para un ítem de catálogo, nunca toca CatalogProduct::price_full. */}
        <button
          type="button"
          disabled={priceOverrideDisabled}
          title={effectivePriceType === 'premium' ? t('ventasDiseno:quote.item.premiumIgnoresManualPrice') : undefined}
          onClick={() => setShowPriceModal(true)}
          className={`${inputCls} w-20 text-left ${item.below_min_margin ? 'border-red-400 dark:border-red-700 text-red-700 dark:text-red-400' : ''}`}
        >
          ${formatMoney(draft.unit_price === '' ? 0 : Number(draft.unit_price))}
        </button>
        {effectivePriceType === 'premium' ? (
          <div className="text-[10px] text-slate-400 mt-0.5 max-w-[140px]">
            {t('ventasDiseno:quote.item.premiumIgnoresManualPrice')}
          </div>
        ) : item.effective_unit_price !== item.unit_price && (
          <div className="text-[10px] text-slate-500 mt-0.5">→ ${formatMoney(item.effective_unit_price)}</div>
        )}
        {item.below_min_margin && (
          <div className="text-[10px] text-red-600 dark:text-red-400 mt-0.5 max-w-[140px]">
            {t('ventasDiseno:quote.belowMinMargin.item', { percent: minMarginPercent })}
          </div>
        )}
        {showPriceModal && (
          <PriceEditModal
            quoteId={quoteId} partId={partId} item={item}
            onClose={() => setShowPriceModal(false)}
            onSaved={() => { setShowPriceModal(false); setError(null); onSaved() }}
          />
        )}
      </td>
      <td className="py-1 pr-2">
        <input
          type="number" value={draft.cost} disabled={!canEdit || locked}
          onChange={e => setDraft(d => ({ ...d, cost: e.target.value }))}
          title={t('ventasDiseno:quote.item.costHint')}
          className={`${inputCls} w-20`}
        />
      </td>
      {discountMode === 'line' && (
        <td className="py-1 pr-2">
          <input
            type="text" inputMode="decimal" value={draft.discount_percent} disabled={!canEdit}
            onChange={e => setDraft(d => ({ ...d, discount_percent: sanitizeUnsignedDecimalInput(e.target.value) }))}
            onBlur={e => setDraft(d => ({ ...d, discount_percent: clampPercentInput(e.target.value) }))}
            className={`${inputCls} w-14`}
          />
        </td>
      )}
      <td className="py-1 pr-2">
        <select
          value={draft.price_type_override} disabled={!canEdit}
          onChange={e => setDraft(d => ({ ...d, price_type_override: e.target.value as QuoteItemPriceTypeOverride | '' }))}
          className={inputCls}
        >
          <option value="">{t('ventasDiseno:quote.item.useGeneral')}</option>
          <option value="public">{t('ventasDiseno:priceType.public')}</option>
          <option value="project">{t('ventasDiseno:priceType.project')}</option>
          <option value="special">{t('ventasDiseno:priceType.special')}</option>
          <option value="premium">{t('ventasDiseno:priceType.premium')}</option>
        </select>
      </td>
      <td className="py-1 pr-2 text-right whitespace-nowrap">${formatMoney(item.line_total)}</td>
      {canEdit && (
        <td className="py-1 whitespace-nowrap">
          {isDirty && (
            <button
              onClick={() => updateMutation.mutate()}
              className="text-[#5BA5A0] hover:underline text-xs font-semibold mr-2"
            >
              {t('common:actions.save')}
            </button>
          )}
          <button onClick={() => deleteMutation.mutate()} className="text-red-500 hover:text-red-700 text-xs font-semibold">
            {t('common:actions.delete')}
          </button>
        </td>
      )}
      {error && (
        <td colSpan={8}>
          <p className="text-xs text-red-500">{error}</p>
        </td>
      )}
    </tr>
  )
}
