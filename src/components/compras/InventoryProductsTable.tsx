import { useTranslation } from 'react-i18next'
import type { InventoryProduct } from '@/types/compras'
import { formatMoney } from '@/lib/money'
import { productDisplayName } from '@/lib/catalogProduct'

/**
 * Lote 4 (SCRUM-243, 2026-08-17) — tabla de 21 columnas extraída de `ProductsTab`
 * (`InventarioPage.tsx`) para reusarla tal cual en el detalle expandido de una familia
 * (`FamiliesTab`): el mockup del ticket pide la MISMA tabla, no un resumen aparte. Sin Card ni
 * paginación propias — el llamador decide el contenedor (Productos pagina, Familias no).
 */
export function InventoryProductsTable({
  products, restricted, canManage, previewVentas, isLoading, onRowClick, onGenerateOrder, onViewWarehouses,
}: {
  products:          InventoryProduct[]
  restricted:        boolean
  // SCRUM-773 — antes "Generar orden" (columna de acciones) reusaba `restricted` igual que las
  // columnas de costo/margen; se separa porque compras.limited.view (Líder de Operaciones) trae
  // restricted=false (ve costos) pero nunca debe poder generar una orden de compra.
  canManage:         boolean
  previewVentas:     boolean
  isLoading?:        boolean
  onRowClick:        (id: number) => void
  onGenerateOrder?:  (id: number) => void
  // SCRUM-244 (rebote 2026-08-16) — "N Bodegas" abre WarehouseStockModal, dedicado y compacto,
  // separado del detalle general (onRowClick). Opcional con fallback a onRowClick para no romper
  // llamadores que todavía no tengan ese modal cableado.
  onViewWarehouses?: (id: number) => void
}) {
  const { t } = useTranslation(['common', 'compras'])
  const showFinancial = !restricted && !previewVentas
  const showManageActions = canManage && !previewVentas

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <Th>{t('compras:inventory.table.image')}</Th>
            <Th>{t('compras:inventory.table.reference')}</Th>
            <Th>{t('compras:inventory.table.description')}</Th>
            <Th>{t('compras:inventory.table.category')}</Th>
            <Th>{t('compras:inventory.table.rotation')}</Th>
            <Th>{t('compras:inventory.table.warehouses')}</Th>
            <Th>{t('compras:inventory.table.disponible')}</Th>
            <Th>{t('compras:inventory.table.porServir')}</Th>
            <Th>{t('compras:inventory.table.stock')}</Th>
            <Th>{t('compras:inventory.table.porIngresar')}</Th>
            <Th>{t('compras:inventory.table.enCamino')}</Th>
            <Th>{t('compras:inventory.table.reorderPoint')}</Th>
            <Th>{t('compras:inventory.table.estado')}</Th>
            <Th>{t('compras:inventory.table.provider')}</Th>
            {showFinancial && <Th>{t('compras:inventory.table.cost')}</Th>}
            {showFinancial && <Th>{t('compras:inventory.table.importCost')}</Th>}
            {showFinancial && <Th>{t('compras:inventory.table.freightCost')}</Th>}
            {showFinancial && <Th>{t('compras:inventory.table.handlingCost')}</Th>}
            {showFinancial && <Th>{t('compras:inventory.table.otherCost')}</Th>}
            {showFinancial && <Th>{t('compras:inventory.table.costTotal')}</Th>}
            <Th>{t('compras:inventory.table.price')}</Th>
            {showFinancial && <Th>{t('compras:inventory.table.margin')}</Th>}
            {showManageActions && <Th>{t('compras:inventory.table.actions')}</Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.length === 0 && !isLoading && (
            <tr>
              {/* Mismo colSpan fijo que ProductsTab original — puramente cosmético (fila vacía),
                  no afecta el ancho real de las filas con datos, cada una con su propio <td>. */}
              <td colSpan={21} className="px-4 py-10 text-center text-slate-400 text-sm">
                {t('compras:inventory.table.empty')}
              </td>
            </tr>
          )}
          {products.map(p => (
            <tr
              key={p.id}
              onClick={() => onRowClick(p.id)}
              className={`hover:bg-slate-50 transition-colors cursor-pointer ${!p.is_active ? 'opacity-50' : ''}`}
            >
              <td className="px-4 py-3">
                {p.photo_url
                  ? <img src={p.photo_url} alt={p.reference} className="w-8 h-8 rounded object-cover" />
                  : <span className="text-slate-300 text-xs">—</span>}
              </td>
              <td className="px-4 py-3 font-semibold text-slate-800">{p.reference}</td>
              <td className="px-4 py-3 text-slate-600">{productDisplayName(p)}</td>
              <td className="px-4 py-3 text-slate-600">
                {p.category ? t(`compras:newOrder.newProduct.categories.${p.category}`) : '—'}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {p.rotation ? t(`compras:inventory.rotation.${p.rotation}`) : '—'}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {p.warehouses.length > 0 ? (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); (onViewWarehouses ?? onRowClick)(p.id) }}
                    className="text-primary underline decoration-dotted text-xs font-medium"
                  >
                    {t('compras:inventory.table.warehousesCount', { count: p.warehouses.length })}
                  </button>
                ) : '—'}
              </td>
              <td className="px-4 py-3 text-slate-600">{p.disponible}</td>
              <td className="px-4 py-3 text-slate-600">{p.por_servir > 0 ? p.por_servir : '—'}</td>
              <td className="px-4 py-3 text-slate-600">{p.stock_quantity ?? '—'}</td>
              <td className="px-4 py-3 text-slate-600">{(p.por_ingresar ?? 0) > 0 ? p.por_ingresar : '—'}</td>
              <td className="px-4 py-3 text-slate-600">{(p.en_camino ?? 0) > 0 ? p.en_camino : '—'}</td>
              <td className="px-4 py-3 text-slate-600">{p.reorder_point ?? '—'}</td>
              <td className="px-4 py-3">
                <EstadoBadge estado={p.estado} />
              </td>
              <td className="px-4 py-3 text-slate-600">{p.provider_name ?? '—'}</td>
              {showFinancial && (
                <td className="px-4 py-3 text-slate-600">{p.cost != null ? `$${formatMoney(p.cost)}` : '—'}</td>
              )}
              {showFinancial && (
                <td className="px-4 py-3 text-slate-600">${formatMoney(p.import_cost ?? 0)}</td>
              )}
              {showFinancial && (
                <td className="px-4 py-3 text-slate-600">${formatMoney(p.freight_cost ?? 0)}</td>
              )}
              {showFinancial && (
                <td className="px-4 py-3 text-slate-600">${formatMoney(p.handling_cost ?? 0)}</td>
              )}
              {showFinancial && (
                <td className="px-4 py-3 text-slate-600">${formatMoney(p.other_cost ?? 0)}</td>
              )}
              {showFinancial && (
                <td className="px-4 py-3 font-medium text-slate-700">{p.cost_total != null ? `$${formatMoney(p.cost_total)}` : '—'}</td>
              )}
              <td className="px-4 py-3 text-slate-600">${formatMoney(p.price_full)}</td>
              {showFinancial && (
                <td className="px-4 py-3 text-slate-600">
                  {p.margin_percent !== null && p.margin_percent !== undefined ? `${p.margin_percent}%` : '—'}
                </td>
              )}
              {showManageActions && onGenerateOrder && (
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onGenerateOrder(p.id) }}
                    className="text-xs px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-50"
                  >
                    {t('compras:inventory.actions.generateOrder')}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
      {children}
    </th>
  )
}

function EstadoBadge({ estado }: { estado: InventoryProduct['estado'] }) {
  const { t } = useTranslation('compras')
  const colors = {
    disponible: 'bg-emerald-50 text-emerald-700',
    bajo_stock: 'bg-amber-50 text-amber-700',
    sin_stock: 'bg-red-50 text-red-700',
  } as const
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colors[estado]}`}>
      {t(`inventory.estado.${estado}`)}
    </span>
  )
}
