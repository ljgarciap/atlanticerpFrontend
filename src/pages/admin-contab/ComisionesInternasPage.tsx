import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import {
  useCommissionInternalSummary, useCommissionVendorOptions, useCommissionInternalExport,
} from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoBarChart, IcoDownload, IcoChevronDown, IcoChevronLeft, IcoChevronRight } from '@/components/icons'
import CommissionTiersModal from '@/components/admin-contab/CommissionTiersModal'
import CommissionAccountStatementModal from '@/components/admin-contab/CommissionAccountStatementModal'
import type { CommissionExportFormat, CommissionOrder, CommissionVendorSummary } from '@/types/adminContab'
import { formatDateShort } from '@/utils/dates'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-PA', { month: 'long', year: 'numeric' })
}

const ESTADO_PILL_CLASSES: Record<CommissionOrder['estado'], string> = {
  pendiente_cobro: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  por_pagar:       'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  pagado:          'bg-primary-soft text-primary-dark',
}

/** Batch 14 solo trae `null` cuando el pedido todavía no tiene factura/cobro (RN de REQ-501) —
 *  distinto del gotcha de timezone que resuelve `formatDateShort`, así que se filtra acá antes. */
function formatOptionalDate(iso: string | null, fallback: string): string {
  return iso ? formatDateShort(iso) : fallback
}

/**
 * Batch 14 del cuerpo principal (SCRUM-575→579, REQ-498→502) — Comisiones Internas. Ver
 * ADR-SCRUM575-579-batch14-comisiones-internas.md (docs/adr en atlanticerp-backend) para el alcance
 * exacto de este batch vs. lo diferido a Batch 15 (notas de crédito restando la base, agrupación
 * visual de arrastrados, proyectos compartidos, estado de cuenta imprimible).
 *
 * Permisos (§4 del ADR): `view_team` (Felix/Mark/Gerencia) ve todos los vendedores, filtra por
 * vendedor y exporta. `view` sin `view_team` (vendedor) ve solo su propia fila, sin selector de
 * vendedor ni botón de exportar — el backend ya debería devolver un único vendedor en ese caso,
 * pero la UI igual oculta los controles que no le corresponden.
 */
export default function ComisionesInternasPage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const { user } = useAuthStore()
  const canViewTeam = user?.modules?.admin_contab?.view_team === true

  const [mes, setMes] = useState(currentMonthKey())
  const [vendedorId, setVendedorId] = useState<number | ''>('')
  const [tiersModalOpen, setTiersModalOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [expandedVendor, setExpandedVendor] = useState<number | null>(null)
  // Batch 15 (SCRUM-582/584, REQ-505/507) — abierto desde "Ver estado de cuenta" en la fila
  // expandida de un vendedor.
  const [statementVendor, setStatementVendor] = useState<{ id: number; nombre: string } | null>(null)

  const filters = { mes, vendedor_id: canViewTeam && vendedorId !== '' ? vendedorId : undefined }
  const { data: summary, isFetching } = useCommissionInternalSummary(filters)
  const { data: vendorOptions } = useCommissionVendorOptions(canViewTeam)
  const exportMutation = useCommissionInternalExport()

  // Bug real de Pre-QA (Visual Review, 2026-08-25): `admin_contab.edit` también es true para
  // Felix, que no es Mark — el CRUD de tramos (POST/PUT/DELETE .../tiers) está gateado por
  // `mark_only` en el backend, así que Felix veía editar/eliminar/agregar en el modal y se
  // encontraba con un 403 al guardar. `puede_editar_tramos` es el cómputo server-side
  // (`current_user_id === mark_approver_user_id`), mismo criterio que `puede_decidir_incobrable`
  // en Facturación — el frontend nunca decide por su cuenta quién es Mark.
  const canEditTiers = summary?.puede_editar_tramos === true
  const mesActual = currentMonthKey()

  const cards = useMemo(() => ([
    { label: t('adminContab:comisionesInternas.stats.totalPedidos'), value: summary ? formatCurrency(summary.total_pedidos_mes) : '—', sub: summary ? t('adminContab:comisionesInternas.stats.totalPedidosSub', { count: summary.vendedores_con_pedidos_mes, mes: monthLabel(mes) }) : undefined },
    { label: t('adminContab:comisionesInternas.stats.yaPagada'), value: summary ? formatCurrency(summary.ya_pagada) : '—', sub: t('adminContab:comisionesInternas.stats.yaPagadaSub') },
    { label: t('adminContab:comisionesInternas.stats.porPagar'), value: summary ? formatCurrency(summary.por_pagar) : '—', sub: t('adminContab:comisionesInternas.stats.porPagarSub') },
    { label: t('adminContab:comisionesInternas.stats.pendienteCobro'), value: summary ? formatCurrency(summary.pendiente_cobro) : '—', sub: t('adminContab:comisionesInternas.stats.pendienteCobroSub') },
  ]), [summary, mes, t])

  function doExport(format: CommissionExportFormat) {
    setExportOpen(false)
    exportMutation.mutate({ format, filters })
  }

  return (
    <div className="max-w-6xl mx-auto pb-16">
      <div className="flex items-start justify-between mb-1 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <IcoBarChart size={20} className="text-slate-500 dark:text-slate-400" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('adminContab:comisionesInternas.title')}</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('adminContab:comisionesInternas.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="!text-xs" onClick={() => setTiersModalOpen(true)}>
            {t('adminContab:comisionesInternas.verTramos')}
          </Button>
          {canViewTeam && (
            <div className="relative">
              <Button
                variant="secondary" className="!px-3 !py-1.5 !text-xs inline-flex items-center gap-1.5"
                onClick={() => setExportOpen(prev => !prev)} loading={exportMutation.isPending}
              >
                <IcoDownload size={13} /> {t('adminContab:comisionesInternas.exportar.label')} <IcoChevronDown size={12} />
              </Button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 mt-1 w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-20 py-1">
                    <button type="button" onClick={() => doExport('pdf')} className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      {t('adminContab:comisionesInternas.exportar.pdf')}
                    </button>
                    <button type="button" onClick={() => doExport('excel')} className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40">
                      {t('adminContab:comisionesInternas.exportar.excel')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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

      {summary !== undefined && summary.banner_comisiones_count > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 mt-4 text-xs text-amber-800 dark:text-amber-300">
          <span>
            {t('adminContab:comisionesInternas.banner', {
              count: summary.banner_comisiones_count, monto: formatCurrency(summary.banner_comisiones_total),
            })}
          </span>
        </div>
      )}

      <Card variant="panel" className="p-4 mt-6">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMes(m => shiftMonth(m, -1))} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800" aria-label={t('adminContab:comisionesInternas.filtros.mesAnterior')}>
              <IcoChevronLeft size={14} />
            </button>
            <select
              value={mes} onChange={e => setMes(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300"
            >
              <option value={mes}>{monthLabel(mes)}</option>
            </select>
            <button type="button" onClick={() => setMes(m => shiftMonth(m, 1))} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800" aria-label={t('adminContab:comisionesInternas.filtros.mesSiguiente')}>
              <IcoChevronRight size={14} />
            </button>
          </div>

          {canViewTeam && (
            <select
              value={vendedorId} onChange={e => setVendedorId(e.target.value === '' ? '' : Number(e.target.value))}
              className="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300"
            >
              <option value="">{t('adminContab:comisionesInternas.filtros.todosVendedores')}</option>
              {(vendorOptions ?? []).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          )}

          {mes !== mesActual && (
            <button type="button" onClick={() => setMes(mesActual)} className="text-xs font-medium text-primary-dark hover:underline ml-auto">
              {t('adminContab:comisionesInternas.filtros.volverMesActual')}
            </button>
          )}
        </div>

        {summary !== undefined && !summary.mes_cerrado && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 mb-3">
            {t('adminContab:comisionesInternas.mesEnCursoAviso')}
          </p>
        )}

        <div className="text-[11px] text-slate-400 mb-2">
          {t('adminContab:comisionesInternas.resultCount', { count: summary?.vendedores.length ?? 0 })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                <th className="py-2 pr-3 w-6" />
                <th className="py-2 pr-3">{t('adminContab:comisionesInternas.columnas.vendedor')}</th>
                <th className="py-2 pr-3">{t('adminContab:comisionesInternas.columnas.totalPedidos')}</th>
                <th className="py-2 pr-3">{t('adminContab:comisionesInternas.columnas.porcentaje')}</th>
                <th className="py-2 pr-3">{t('adminContab:comisionesInternas.columnas.pagada')}</th>
                <th className="py-2 pr-3">{t('adminContab:comisionesInternas.columnas.porPagar')}</th>
                <th className="py-2 pr-3">{t('adminContab:comisionesInternas.columnas.pendienteCobro')}</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.vendedores ?? []).map(v => (
                <VendorRow
                  key={v.vendedor_id} vendor={v} expanded={expandedVendor === v.vendedor_id}
                  onToggle={() => setExpandedVendor(prev => prev === v.vendedor_id ? null : v.vendedor_id)}
                  onOpenStatement={() => setStatementVendor({ id: v.vendedor_id, nombre: v.vendedor_nombre })}
                  t={t}
                />
              ))}
            </tbody>
          </table>
          {!isFetching && (summary?.vendedores.length ?? 0) === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">{t('adminContab:comisionesInternas.vacio')}</p>
          )}
        </div>

        <p className="text-[10.5px] text-slate-400 mt-4">{t('adminContab:comisionesInternas.footnote')}</p>
      </Card>

      {tiersModalOpen && <CommissionTiersModal editable={canEditTiers} onClose={() => setTiersModalOpen(false)} />}
      {statementVendor && (
        <CommissionAccountStatementModal
          vendedorId={statementVendor.id} vendedorNombre={statementVendor.nombre} mes={mes}
          onClose={() => setStatementVendor(null)}
        />
      )}
    </div>
  )
}

function VendorRow(
  { vendor, expanded, onToggle, onOpenStatement, t }:
  {
    vendor: CommissionVendorSummary; expanded: boolean; onToggle: () => void; onOpenStatement: () => void
    t: (key: string, opts?: Record<string, unknown>) => string
  },
) {
  return (
    <>
      <tr onClick={onToggle} className="border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <td className="py-2.5 pr-3">
          <IcoChevronDown size={13} className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </td>
        <td className="py-2.5 pr-3 font-medium text-slate-800 dark:text-slate-100">{vendor.vendedor_nombre}</td>
        <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">{formatCurrency(vendor.total_pedidos_mes)}</td>
        <td className="py-2.5 pr-3 font-semibold text-primary-dark">
          {vendor.total_pedidos_mes ? `${vendor.porcentaje}%` : '—'}
          {!vendor.porcentaje_fijo && vendor.total_pedidos_mes > 0 && (
            <span className="ml-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              {t('adminContab:comisionesInternas.provisional')}
            </span>
          )}
        </td>
        <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">{formatCurrency(vendor.pagada)}</td>
        <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">{formatCurrency(vendor.por_pagar)}</td>
        <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">{formatCurrency(vendor.pendiente_cobro)}</td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/60 dark:bg-slate-900/30">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex justify-end mb-2">
              <button
                type="button" onClick={onOpenStatement}
                className="text-xs font-medium text-primary-dark hover:underline"
              >
                {t('adminContab:comisionesInternas.verEstadoCuenta')}
              </button>
            </div>
            {vendor.groups.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">{t('adminContab:comisionesInternas.sinPedidos')}</p>
            ) : (
              vendor.groups.map(g => (
                <div key={g.mes} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    <span>{monthLabel(g.mes)}</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary-soft text-primary-dark">
                      {g.porcentaje}% {g.porcentaje_fijo ? t('adminContab:comisionesInternas.fijo') : t('adminContab:comisionesInternas.provisional')}
                    </span>
                    {g.arrastrado && <span className="text-[10px] text-slate-400">{t('adminContab:comisionesInternas.arrastrado')}</span>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[1400px]">
                      <thead>
                        <tr className="text-left text-[10px] font-medium text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.cliente')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.pedido')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.fechaPedido')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.factura')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.fechaFactura')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.fechaCobro')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.totalPedido')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.totalFacturado')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.totalCobrado')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.notaCredito')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.comision')}</th>
                          <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.estado')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.pedidos.map(p => {
                          const sinDato = t('adminContab:comisionesInternas.detalle.sinDato')
                          return (
                          <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800">
                            <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">
                              {p.cliente}
                              {p.compartido_con.length > 0 && (
                                <span className="block text-[10px] text-slate-400">
                                  ↔ {t('adminContab:comisionesInternas.detalle.compartidoCon', { nombres: p.compartido_con.join(', ') })}
                                  {p.total_pedido_completo !== null && ` · ${formatCurrency(p.total_pedido_completo)} ${t('adminContab:comisionesInternas.detalle.totalProyecto')}`}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{p.numero_pedido}</td>
                            <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{formatDateShort(p.fecha_pedido)}</td>
                            <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{p.numero_factura ?? sinDato}</td>
                            <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{formatOptionalDate(p.fecha_factura, sinDato)}</td>
                            <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{formatOptionalDate(p.fecha_cobro_completo, sinDato)}</td>
                            <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{formatCurrency(p.total_pedido)}</td>
                            <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{p.total_facturado !== null ? formatCurrency(p.total_facturado) : sinDato}</td>
                            <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">
                              {formatCurrency(p.total_cobrado)}
                              {p.es_abono_parcial && <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">{t('adminContab:comisionesInternas.detalle.abonoParcial')}</span>}
                            </td>
                            <td className="py-1.5 pr-3 text-red-700 dark:text-red-400">
                              {p.total_nota_credito > 0 ? `-${formatCurrency(p.total_nota_credito)} (${p.nota_credito_ref})` : sinDato}
                            </td>
                            <td className="py-1.5 pr-3 font-medium text-slate-800 dark:text-slate-100">
                              {formatCurrency(p.monto_comision)}
                              {p.es_estimado && <span className="ml-1 text-[10px] text-slate-400">{t('adminContab:comisionesInternas.detalle.estimado')}</span>}
                            </td>
                            <td className="py-1.5 pr-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${ESTADO_PILL_CLASSES[p.estado]}`}>
                                {t(`adminContab:comisionesInternas.estados.${p.estado}`)}
                              </span>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </td>
        </tr>
      )}
    </>
  )
}
