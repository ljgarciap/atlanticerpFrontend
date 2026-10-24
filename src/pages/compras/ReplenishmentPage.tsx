import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { comprasApi } from '@/api/comprasApi'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatDateFromTimestamp } from '@/utils/dates'
import type { NewOrderPrefillState } from '@/pages/compras/NewPurchaseOrderPage'
import type { ReplenishmentProduct } from '@/types/compras'

interface DisplayGroup {
  providerId:   number | null
  providerName: string | null
  products:     ReplenishmentProduct[]
}

/**
 * SCRUM-1184 — «Pendientes de reposición». Consolida lo que falta de los pedidos que están «Sin stock» (una fila por producto, con la cantidad
 * sumada y los pedidos afectados) y lo agrupa por proveedor, para marcar varios productos y abrir UNA orden de compra por proveedor con todas
 * las líneas precargadas. Solo lee: al recibirse la orden y liberarse el pedido, la fila desaparece sola.
 *
 * Un producto se agrupa por su proveedor principal; `providerOverride` lo mueve a otro de sus proveedores sin tocar el producto. Nunca se mezclan
 * proveedores en una orden: el botón «Generar orden» es de cada grupo y solo toma lo marcado dentro de él.
 */
export default function ReplenishmentPage() {
  const { t } = useTranslation(['compras', 'common'])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  // «Pedidos de venta» (donde cae el enlace, buscando por el folio de la cotización) solo lo abren estos roles; para el resto el N° queda como texto, sin enlace roto.
  const canOpenOrders = user?.role === 'lider_compras' || user?.role === 'management' || user?.role === 'superadmin'
  const { data, isLoading, isError } = useQuery({
    queryKey: ['compras', 'replenishment'],
    queryFn:  () => comprasApi.replenishment.get(),
  })

  // Solo se pide el catálogo de proveedores si hay algún producto sin proveedor que ofrecer; con compras.write ya se lista en Nueva Orden.
  const [savedProvider, setSavedProvider] = useState<Record<number, number>>({})
  const hasUnassigned = (data?.groups ?? []).some(g => g.provider === null) || Object.keys(savedProvider).length > 0
  const { data: providerList, isError: providersError, refetch: refetchProviders } = useQuery({
    queryKey: ['compras/providers/replenishment-picker'],
    // 'all' (techo 1000 del backend): per_page solo acepta 10/20/50/100/all y cualquier otro valor cae en 20 — con 118 proveedores en dev el selector perdía 98.
    queryFn:  () => comprasApi.providers.list({ per_page: 'all', sort_by: 'name', sort_dir: 'asc' }),
    enabled:  hasUnassigned,
  })
  const allProviders = useMemo(() => (providerList?.data ?? []).map(pr => ({ id: pr.id, name: pr.name })), [providerList])

  // Productos que llegaron sin proveedor, o que se asignaron desde esta pantalla: conservan el selector con todos los proveedores aunque ya hayan
  // pasado a un grupo, para poder corregir la elección mientras la pantalla esté abierta (aunque la lista se recargue y ya vengan con proveedor).
  const unassignedIds = useMemo(
    () => new Set([
      ...(data?.groups ?? []).filter(g => g.provider === null).flatMap(g => g.products.map(p => p.catalog_product_id)),
      ...Object.keys(savedProvider).map(Number),
    ]),
    [data, savedProvider],
  )

  const [checked, setChecked] = useState<Record<number, boolean>>({})
  // Texto, no número: permite vaciar el campo y escribir sin que quede un «0» delante.
  const [qtyText, setQtyText] = useState<Record<number, string>>({})
  const [providerOverride, setProviderOverride] = useState<Record<number, number>>({})
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  // `savedProvider`: proveedor que ya quedó guardado en el producto desde esta pantalla (es el «esperado» de la próxima corrección).
  // Filas guardando ahora mismo:
  const [saving, setSaving] = useState<Record<number, boolean>>({})

  const groups = useMemo<DisplayGroup[]>(() => {
    const map = new Map<number | null, DisplayGroup>()
    for (const g of data?.groups ?? []) {
      for (const p of g.products) {
        const overrideId = providerOverride[p.catalog_product_id]
        const target = overrideId !== undefined
          ? p.providers.find(x => x.id === overrideId) ?? allProviders.find(x => x.id === overrideId) ?? g.provider
          : g.provider
        const key = target?.id ?? null
        const group = map.get(key) ?? { providerId: key, providerName: target?.name ?? null, products: [] }
        group.products.push(p)
        map.set(key, group)
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.providerId === null || b.providerId === null) return Number(a.providerId === null) - Number(b.providerId === null)
      return (a.providerName ?? '').localeCompare(b.providerName ?? '')
    })
  }, [data, providerOverride, allProviders])

  const quantityOf = (p: ReplenishmentProduct) => {
    const text = qtyText[p.catalog_product_id]
    return text === undefined ? p.faltante : Math.max(0, Math.floor(Number(text) || 0))
  }

  /**
   * Elegir proveedor de un producto que llegó sin proveedor lo GUARDA en el producto (así no hay que volver a elegirlo) y, mientras la fila siga en
   * esta pantalla, se puede cambiar de nuevo: la corrección reemplaza solo al proveedor que se había guardado. Si falla o alguien lo cambió antes
   * (409) o ya no espera reposición (403), la fila vuelve a lo que estaba y se avisa; en esos dos casos además se recarga la lista.
   */
  async function chooseProvider(p: ReplenishmentProduct, providerId: number) {
    const id = p.catalog_product_id
    const previousOverride = providerOverride[id]
    setProviderOverride(prev => ({ ...prev, [id]: providerId }))
    // Al cambiar de proveedor el producto llega a otro grupo sin marcar: se elige de nuevo a propósito.
    setChecked(prev => ({ ...prev, [id]: false }))
    if (!unassignedIds.has(id)) return
    setSaving(prev => ({ ...prev, [id]: true }))
    try {
      await comprasApi.replenishment.assignProvider(id, providerId, savedProvider[id] ?? null)
      setSavedProvider(prev => ({ ...prev, [id]: providerId }))
    } catch (e) {
      const res = (e as { response?: { status?: number; data?: { code?: string } } })?.response
      const outOfScope = res?.status === 403 && res.data?.code === 'replenishment_scope'
      setProviderOverride(prev => {
        const next = { ...prev }
        if (previousOverride === undefined) delete next[id]
        else next[id] = previousOverride
        return next
      })
      useToastStore.getState().show(t(res?.status === 409 ? 'compras:replenishment.saveConflict' : outOfScope ? 'compras:replenishment.saveScope' : 'compras:replenishment.saveError'), 'error')
      if (res?.status === 409 || outOfScope) {
        // Lo que la pantalla creía de este producto ya no es cierto: se suelta el estado local y la fila vuelve a lo que diga el servidor.
        setSavedProvider(prev => { const next = { ...prev }; delete next[id]; return next })
        setProviderOverride(prev => { const next = { ...prev }; delete next[id]; return next })
        void queryClient.invalidateQueries({ queryKey: ['compras', 'replenishment'] })
      }
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }))
    }
  }

  function toggleGroup(g: DisplayGroup, value: boolean) {
    setChecked(prev => {
      const next = { ...prev }
      for (const p of g.products) next[p.catalog_product_id] = value
      return next
    })
  }

  function generate(g: DisplayGroup) {
    if (g.providerId === null) return
    const selected = g.products.filter(p => checked[p.catalog_product_id] && quantityOf(p) > 0)
    if (selected.length === 0) return
    const state: NewOrderPrefillState = {
      providerId: g.providerId,
      products: selected.map(p => ({
        id: p.catalog_product_id, reference: p.reference, description: p.name, unitCost: p.unit_cost, quantity: quantityOf(p),
      })),
    }
    navigate('/compras/ordenes/nueva', { state })
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('compras:replenishment.title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('compras:replenishment.subtitle')}</p>
      </div>

      {isLoading && <p className="text-sm text-slate-400">{t('common:labels.loading')}</p>}
      {isError && <p className="text-sm text-red-600" role="alert">{t('compras:replenishment.error')}</p>}

      {data && (data.custom_items_count ?? 0) > 0 && (
        <p className="mb-3 px-3 py-2 rounded-lg border text-xs bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-300" data-testid="custom-items-notice">
          {t('compras:replenishment.customItems', { count: data.custom_items_count })}
        </p>
      )}

      {hasUnassigned && providersError && (
        <p className="mb-3 px-3 py-2 rounded-lg border text-xs bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-300" role="alert" data-testid="providers-error">
          {t('compras:replenishment.providersError')}{' '}
          <button type="button" className="underline font-semibold" onClick={() => { void refetchProviders() }}>{t('compras:replenishment.retry')}</button>
        </p>
      )}

      {data && groups.length === 0 && (
        <Card variant="panel" className="p-6 text-sm text-slate-500" data-testid="replenishment-empty">{t('compras:replenishment.empty')}</Card>
      )}

      {groups.map(g => {
        const selectedCount = g.products.filter(p => checked[p.catalog_product_id] && quantityOf(p) > 0).length
        const allChecked = g.products.every(p => checked[p.catalog_product_id])
        const groupKey = g.providerId ?? 'none'
        return (
          <Card key={groupKey} variant="panel" className="p-0 overflow-hidden mb-4" data-testid={`group-${groupKey}`}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                {g.providerId !== null && (
                  <input
                    type="checkbox" checked={allChecked} onChange={e => toggleGroup(g, e.target.checked)}
                    aria-label={t('compras:replenishment.selectGroup', { provider: g.providerName })}
                  />
                )}
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {g.providerName ?? t('compras:replenishment.noProvider')}
                  <span className="ml-2 text-xs font-normal text-slate-400">{t('compras:replenishment.productCount', { count: g.products.length })}</span>
                </h2>
              </div>
              {g.providerId !== null ? (
                <Button className="!text-xs" disabled={selectedCount === 0} onClick={() => generate(g)}>
                  {t('compras:replenishment.generate', { count: selectedCount })}
                </Button>
              ) : (
                <span className="text-xs text-slate-400">{t('compras:replenishment.noProviderHint')}</span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2 w-8" />
                    <th className="px-3 py-2">{t('compras:replenishment.columns.product')}</th>
                    <th className="px-3 py-2 text-right">{t('compras:replenishment.columns.missing')}</th>
                    <th className="px-3 py-2 text-right">{t('compras:replenishment.columns.stock')}</th>
                    <th className="px-3 py-2 text-right">{t('compras:replenishment.columns.inTransit')}</th>
                    <th className="px-3 py-2">{t('compras:replenishment.columns.since')}</th>
                    <th className="px-3 py-2">{t('compras:replenishment.columns.orders')}</th>
                    <th className="px-3 py-2">{t('compras:replenishment.columns.provider')}</th>
                    <th className="px-3 py-2 text-right">{t('compras:replenishment.columns.quantity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.products.map(p => {
                    const id = p.catalog_product_id
                    const open = expanded[id] === true
                    return (
                      <tr key={id} className="border-b border-slate-100 dark:border-slate-800 align-top" data-testid={`row-${id}`}>
                        <td className="px-3 py-2">
                          {g.providerId !== null && (
                            <input
                              type="checkbox" checked={checked[id] === true}
                              onChange={e => setChecked(prev => ({ ...prev, [id]: e.target.checked }))}
                              aria-label={t('compras:replenishment.selectProduct', { reference: p.reference })}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800 dark:text-slate-100">{p.reference}</div>
                          <div className="text-xs text-slate-500">{p.name}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{p.faltante}</td>
                        <td className="px-3 py-2 text-right">{p.stock}</td>
                        <td className="px-3 py-2 text-right">
                          {p.en_camino > 0
                            ? <span className="text-amber-700 dark:text-amber-300" title={t('compras:replenishment.inTransitHint')} data-testid={`in-transit-${id}`}>{p.en_camino}</span>
                            : 0}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{p.since ? formatDateFromTimestamp(p.since) : '—'}</td>
                        <td className="px-3 py-2">
                          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setExpanded(prev => ({ ...prev, [id]: !open }))} aria-expanded={open}>
                            {t('compras:replenishment.ordersCount', { count: p.orders.length })}
                          </button>
                          {open && (
                            <ul className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                              {p.orders.map(o => (
                                <li key={o.order_id}>
                                  {canOpenOrders && o.quote_folio
                                    ? <Link className="text-primary hover:underline" to={`/ventas-diseno/pedidos?search=${encodeURIComponent(o.quote_folio)}`}>{o.order_number}</Link>
                                    : o.order_number}
                                  {o.quote_folio ? ` (${o.quote_folio})` : ''}
                                  {o.project ? ` · ${o.project}` : ''} · {o.qty}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {p.providers.length > 1 || unassignedIds.has(id) ? (
                            <select
                              className="px-2 py-1 border border-slate-300 rounded text-xs bg-white dark:bg-slate-900"
                              value={providerOverride[id] ?? g.providerId ?? ''}
                              disabled={saving[id] === true}
                              onChange={e => { void chooseProvider(p, Number(e.target.value)) }}
                              aria-label={t('compras:replenishment.changeProvider', { reference: p.reference })}
                            >
                              {/* Sin proveedor: se elige aquí (primero los de la relación N:M del producto, luego todos los activos) para poder ordenarlo. */}
                              {g.providerId === null && <option value="" disabled>{t('compras:replenishment.chooseProvider')}</option>}
                              {(unassignedIds.has(id) ? [...p.providers, ...allProviders.filter(a => !p.providers.some(x => x.id === a.id))] : p.providers)
                                .map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                            </select>
                          ) : <span className="text-xs text-slate-500">{g.providerName ?? '—'}</span>}
                          {unassignedIds.has(id) && savedProvider[id] !== undefined && savedProvider[id] === g.providerId && (
                            <span className="ml-2 text-[11px] text-emerald-700 dark:text-emerald-400" data-testid={`saved-${id}`}>{t('compras:replenishment.saved')}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {g.providerId !== null && (
                            <input
                              type="number" min={1} step={1} value={qtyText[id] ?? String(p.faltante)}
                              onChange={e => setQtyText(prev => ({ ...prev, [id]: e.target.value }))}
                              className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-right bg-white dark:bg-slate-900"
                              aria-label={t('compras:replenishment.quantityOf', { reference: p.reference })}
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
