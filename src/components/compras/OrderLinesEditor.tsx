import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { comprasApi } from '@/api/comprasApi'
import NewProductModal from '@/components/compras/NewProductModal'
import SalesProjectPicker from '@/components/compras/SalesProjectPicker'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose } from '@/components/icons'
import type {
  ComprasCatalogProduct, NewCatalogProductPayload,
  ShippingType, WhoPaysShipping, Modality, PurchaseOrderLinePayload,
} from '@/types/compras'

export interface DraftLine {
  key:                     string
  catalogProductId:        number | null
  newProduct:               NewCatalogProductPayload | null
  reference:                 string
  // REQ-130 Escenario 2 (SCRUM-193): precarga junto con la referencia pública al elegir un
  // producto existente del catálogo.
  factoryReference:          string | null
  description:               string
  unitCost:                   number
  quantity:                   number
  // SCRUM-194 (REQ-131, mockup 2H) — toggle $ monto / % del costo, sustituye el % único de antes.
  additionalCostAmount:        number | null
  additionalCostType:           'monto' | 'porcentaje' | null
  salesProjectId:               number | null
  salesProjectLabel:             string | null
}

export interface OrderDraft {
  lines:                   DraftLine[]
  // SCRUM-197 (2026-07-30): ya no admite '' — siempre uno de los 3/2 valores reales, sin estado
  // "Sin especificar" (ver emptyOrderDraft()).
  shippingType:            ShippingType
  whoPaysShipping:          WhoPaysShipping
  // SCRUM-197 (hallazgo QA 2026-07-16) — RN de REQ-134: envío aéreo captura costo y quién paga;
  // solo existía "quién paga", faltaba el monto del flete.
  shippingCost:              string
  modality:                 Modality
  estimatedArrivalDate:      string
}

export function emptyOrderDraft(): OrderDraft {
  // SCRUM-197 (REQ-134, hallazgo de Gerencia Test 2026-07-30): "Tipo de envío" no debe tener un
  // estado "Sin especificar" — siempre uno de los 3 valores reales. 'terrestre' como default más
  // conservador (no dispara el aviso de aprobación de Mark, exclusivo de Aéreo).
  return {
    lines: [], shippingType: 'terrestre', whoPaysShipping: 'cliente', shippingCost: '',
    modality: 'directo', estimatedArrivalDate: '',
  }
}

export function draftRequiresPrimaryApproval(draft: OrderDraft): boolean {
  return draft.shippingType === 'aereo' && draft.whoPaysShipping === 'atlantic'
}

export function draftTotal(draft: OrderDraft): number {
  return draft.lines.reduce((sum, l) => sum + l.unitCost * l.quantity, 0)
}

export function buildLinesPayload(draft: OrderDraft): PurchaseOrderLinePayload[] {
  return draft.lines.map(l => ({
    catalog_product_id: l.catalogProductId,
    new_product: l.newProduct,
    quantity: l.quantity,
    unit_cost: l.unitCost,
    // `additional_cost_percent` se mantiene para compatibilidad con lo que ya consume ese campo;
    // `additional_cost_amount`/`additional_cost_type` (SCRUM-194) son la fuente de verdad nueva.
    additional_cost_percent: l.additionalCostType === 'porcentaje' ? l.additionalCostAmount : null,
    additional_cost_amount: l.additionalCostType === 'monto' ? l.additionalCostAmount : null,
    additional_cost_type: l.additionalCostType,
    sales_project_id: l.salesProjectId,
  }))
}

interface Props {
  providerId:   number
  draft:        OrderDraft
  onChange:     (draft: OrderDraft) => void
  errorMessage?: string
}

/**
 * REQ-130→132/REQ-134 (wizard Nueva Orden) + REQ-144 (editar orden mientras "Por aprobar") —
 * buscador de producto + tabla de líneas + campos de envío, extraído a componente compartido
 * porque el mismo bloque se usa en ambos flujos (crear y editar una orden).
 */
export default function OrderLinesEditor({ providerId, draft, onChange, errorMessage }: Props) {
  const { t } = useTranslation(['common', 'compras'])

  const [productSearch, setProductSearch] = useState('')
  const [showNewProductModal, setShowNewProductModal] = useState(false)

  const { data: productResults } = useQuery({
    queryKey: ['compras/products/picker', providerId, productSearch],
    queryFn:  () => comprasApi.products.search(providerId, productSearch),
  })

  const addExistingProduct = (p: ComprasCatalogProduct) => {
    onChange({
      ...draft,
      lines: [...draft.lines, {
        key: `existing-${p.id}-${Date.now()}`,
        catalogProductId: p.id,
        newProduct: null,
        reference: p.reference,
        factoryReference: p.factory_reference,
        description: p.description,
        unitCost: p.cost ?? 0,
        quantity: 1,
        additionalCostAmount: null,
        additionalCostType: null,
        salesProjectId: null,
        salesProjectLabel: null,
      }],
    })
    setProductSearch('')
  }

  const addNewProduct = (
    product: NewCatalogProductPayload,
    additionalCostAmount: number | null,
    additionalCostType: 'monto' | 'porcentaje' | null,
  ) => {
    onChange({
      ...draft,
      lines: [...draft.lines, {
        key: `new-${Date.now()}`,
        catalogProductId: null,
        newProduct: product,
        reference: product.reference,
        factoryReference: product.factory_reference ?? null,
        description: product.description,
        unitCost: product.cost,
        quantity: 1,
        additionalCostAmount,
        additionalCostType,
        salesProjectId: null,
        salesProjectLabel: null,
      }],
    })
    setShowNewProductModal(false)
  }

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    onChange({ ...draft, lines: draft.lines.map(l => l.key === key ? { ...l, ...patch } : l) })
  }
  const removeLine = (key: string) => onChange({ ...draft, lines: draft.lines.filter(l => l.key !== key) })

  const total = draftTotal(draft)
  const requiresPrimaryApproval = draftRequiresPrimaryApproval(draft)

  return (
    <>
      {/* Productos */}
      <Card variant="panel" className="p-5 mb-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
          {t('compras:newOrder.steps.products')}
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            placeholder={t('compras:newOrder.products.searchPlaceholder')}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <Button variant="outline" onClick={() => setShowNewProductModal(true)}>
            {t('compras:newOrder.products.newProduct')}
          </Button>
        </div>
        {productResults && productResults.data.length > 0 ? (
          <ul className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
            {productResults.data.map(p => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50">
                <div>
                  <span className="font-medium text-slate-800">{p.description}</span>
                  <span className="text-slate-400 ml-2">{p.reference}</span>
                </div>
                <Button variant="outline" className="!text-xs !px-3 !py-1" onClick={() => addExistingProduct(p)}>
                  {t('compras:newOrder.products.add')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          productResults && <p className="text-slate-400 text-xs mt-2">{t('compras:newOrder.products.empty')}</p>
        )}
      </Card>

      {/* Líneas de la orden */}
      {draft.lines.length > 0 && (
        <Card variant="panel" className="p-5 mb-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
            {t('compras:newOrder.steps.lines')}
          </h2>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.product')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.factoryRef')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.publicRef')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.quantity')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.unitCost')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.subtotal')}</th>
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase">{t('compras:newOrder.lines.project')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.lines.map(l => (
                <LineRow key={l.key} line={l} onUpdate={patch => updateLine(l.key, patch)} onRemove={() => removeLine(l.key)} />
              ))}
            </tbody>
          </table>
          <div className="flex justify-end font-bold text-slate-800 text-sm">
            {t('compras:newOrder.lines.total')}: ${total.toFixed(2)}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:newOrder.modality.label')}</label>
              <select
                value={draft.modality}
                onChange={e => onChange({ ...draft, modality: e.target.value as Modality })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="directo">{t('compras:newOrder.modality.directo')}</option>
                <option value="zona_libre">{t('compras:newOrder.modality.zonaLibre')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:newOrder.shipping.estimatedArrival')}</label>
              <input
                type="date"
                value={draft.estimatedArrivalDate}
                onChange={e => onChange({ ...draft, estimatedArrivalDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:newOrder.shipping.type')}</label>
              <select
                value={draft.shippingType}
                onChange={e => onChange({ ...draft, shippingType: e.target.value as ShippingType })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="aereo">{t('compras:newOrder.shipping.typeAereo')}</option>
                <option value="maritimo">{t('compras:newOrder.shipping.typeMaritimo')}</option>
                <option value="terrestre">{t('compras:newOrder.shipping.typeTerrestre')}</option>
              </select>
            </div>
            {/* SCRUM-197 (REQ-134, 2026-07-30): "¿Quién paga el envío?" solo aplica a envío aéreo —
                con cualquier otro tipo de envío, permanece oculto y no aplica. */}
            {draft.shippingType === 'aereo' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('compras:newOrder.shipping.whoPays')}</label>
                <select
                  value={draft.whoPaysShipping}
                  onChange={e => onChange({ ...draft, whoPaysShipping: e.target.value as WhoPaysShipping })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="cliente">{t('compras:newOrder.shipping.whoPaysCliente')}</option>
                  <option value="atlantic">{t('compras:newOrder.shipping.whoPaysAtlantic')}</option>
                </select>
              </div>
            )}
            {draft.shippingType === 'aereo' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {t('compras:newOrder.shipping.cost')}
                </label>
                <input
                  type="number" min={0} step="0.01"
                  value={draft.shippingCost}
                  onChange={e => onChange({ ...draft, shippingCost: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            )}
          </div>

          {requiresPrimaryApproval && (
            <p className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs">
              {t('compras:newOrder.shipping.approvalNotice')}
            </p>
          )}

          {errorMessage && (
            <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">
              {errorMessage}
            </div>
          )}
        </Card>
      )}

      {showNewProductModal && (
        <NewProductModal
          providerId={providerId}
          onClose={() => setShowNewProductModal(false)}
          onAdd={addNewProduct}
        />
      )}
    </>
  )
}

function LineRow({ line, onUpdate, onRemove }: {
  line: DraftLine
  onUpdate: (patch: Partial<DraftLine>) => void
  onRemove: () => void
}) {
  const subtotal = line.unitCost * line.quantity

  return (
    <tr>
      <td className="py-2">
        <div className="font-medium text-slate-800">{line.description}</div>
      </td>
      <td className="py-2 text-slate-600">{line.factoryReference ?? '—'}</td>
      <td className="py-2 text-slate-600">{line.reference}</td>
      <td className="py-2">
        <input
          type="number"
          min={1}
          value={line.quantity}
          onChange={e => onUpdate({ quantity: Math.max(1, Number(e.target.value)) })}
          className="w-16 px-2 py-1 border border-slate-200 rounded text-sm"
        />
      </td>
      <td className="py-2">
        {/* REQ-130 Escenario 2 (SCRUM-193) — el costo precargado es editable, no de solo lectura. */}
        <input
          type="number"
          min={0}
          step="0.01"
          value={line.unitCost}
          onChange={e => onUpdate({ unitCost: Math.max(0, Number(e.target.value)) })}
          className="w-24 px-2 py-1 border border-slate-200 rounded text-sm"
        />
      </td>
      <td className="py-2 font-semibold text-slate-800">${subtotal.toFixed(2)}</td>
      <td className="py-2">
        <SalesProjectPicker
          projectId={line.salesProjectId}
          projectLabel={line.salesProjectLabel}
          onChange={(id, label) => onUpdate({ salesProjectId: id, salesProjectLabel: label })}
        />
      </td>
      <td className="py-2 text-right">
        <Button type="button" variant="icon" onClick={onRemove}><IcoClose size={14} /></Button>
      </td>
    </tr>
  )
}
