import { useTranslation } from 'react-i18next'
import { useCommissionAccountStatement, useCommissionAccountStatementPdf } from '@/hooks/useAdminContab'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose, IcoPrinter } from '@/components/icons'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

function monthLabel(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-PA', { month: 'long', year: 'numeric' })
}

interface Props {
  vendedorId: number
  vendedorNombre: string
  mes: string
  onClose: () => void
}

/**
 * REQ-507 — documento de estado de cuenta por vendedor, abierto desde el botón "Ver estado de
 * cuenta" en la fila expandida (`ComisionesInternasPage.tsx`). Ver ADR-SCRUM580-584-batch15 §5:
 * mes cerrado → solo lo efectivamente pagado ese mes (RN1); mes en curso → 3 totales + arrastre
 * (RN2); línea de descuento por NC (RN3); pedidos compartidos identificados (RN4). Mismo diseño de
 * referencia que `openEstadoCuenta()` del mockup adjunto a SCRUM-575.
 */
export default function CommissionAccountStatementModal({ vendedorId, vendedorNombre, mes, onClose }: Props) {
  const { t } = useTranslation(['common', 'adminContab'])
  const { data: statement, isLoading } = useCommissionAccountStatement(vendedorId, mes, true)
  const pdfMutation = useCommissionAccountStatementPdf()

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <Card variant="modal" className="w-full max-w-2xl p-6 my-8" data-testid="account-statement-modal">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('adminContab:comisionesInternas.estadoCuenta.title')}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label={t('common:actions.close')}>
            <IcoClose />
          </button>
        </div>

        {isLoading || !statement ? (
          <p className="text-sm text-slate-400 py-8 text-center">{t('common:labels.loading')}</p>
        ) : (
          <>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
              {monthLabel(statement.mes)}
              {statement.mes_cerrado ? ` — ${t('adminContab:comisionesInternas.estadoCuenta.liquidado')}` : ` — ${t('adminContab:comisionesInternas.estadoCuenta.enCurso')}`}
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs mb-4">
              <div>
                <div className="text-slate-400 text-[10.5px]">{t('adminContab:comisionesInternas.columnas.vendedor')}</div>
                <div className="font-medium text-slate-800 dark:text-slate-100">{statement.vendedor_nombre}</div>
              </div>
              <div>
                <div className="text-slate-400 text-[10.5px]">{t('adminContab:comisionesInternas.estadoCuenta.pedidosNuevos', { mes: monthLabel(statement.mes) })}</div>
                <div className="font-medium text-slate-800 dark:text-slate-100">{formatCurrency(statement.total_pedidos_mes)}</div>
              </div>
              <div>
                <div className="text-slate-400 text-[10.5px]">{t('adminContab:comisionesInternas.estadoCuenta.porcentajeAplicado', { mes: monthLabel(statement.mes) })}</div>
                <div className="font-medium text-primary-dark">
                  {statement.porcentaje}% {statement.porcentaje_fijo ? t('adminContab:comisionesInternas.fijo') : t('adminContab:comisionesInternas.provisional')}
                </div>
              </div>
            </div>

            {statement.mes_cerrado && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 rounded-lg px-3 py-2 mb-4">
                {t('adminContab:comisionesInternas.estadoCuenta.notaMesCerrado')}
              </p>
            )}

            {statement.groups.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">{t('adminContab:comisionesInternas.sinPedidos')}</p>
            ) : (
              statement.groups.map(g => (
                <div key={g.mes} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                    <span>{monthLabel(g.mes)}</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary-soft text-primary-dark">
                      {g.porcentaje}% {g.porcentaje_fijo ? t('adminContab:comisionesInternas.fijo') : t('adminContab:comisionesInternas.provisional')}
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] font-medium text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                        <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.cliente')}</th>
                        <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.pedido')}</th>
                        <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.totalCobrado')}</th>
                        <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.notaCredito')}</th>
                        <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.estado')}</th>
                        <th className="py-1.5 pr-3">{t('adminContab:comisionesInternas.detalle.comision')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.pedidos.map(p => (
                        <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800">
                          <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">
                            {p.cliente}
                            {p.compartido_con.length > 0 && (
                              <span className="block text-[10px] text-slate-400">
                                {t('adminContab:comisionesInternas.detalle.compartidoCon', { nombres: p.compartido_con.join(', ') })}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{p.numero_pedido}</td>
                          <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{formatCurrency(p.total_cobrado)}</td>
                          <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">
                            {p.total_nota_credito > 0 ? `-${formatCurrency(p.total_nota_credito)} (${p.nota_credito_ref})` : '—'}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-300">{t(`adminContab:comisionesInternas.estados.${p.estado}`)}</td>
                          <td className="py-1.5 pr-3 font-medium text-slate-800 dark:text-slate-100">{formatCurrency(p.monto_comision)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}

            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 mt-4 text-xs space-y-1">
              <div className="flex justify-between text-red-700 dark:text-red-400">
                <span>{t('adminContab:comisionesInternas.estadoCuenta.descuentoNc')}</span>
                <span>-{formatCurrency(statement.descuento_nota_credito)}</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-800 dark:text-slate-100">
                <span>{statement.mes_cerrado ? t('adminContab:comisionesInternas.estadoCuenta.totalPagadoMes') : t('adminContab:comisionesInternas.stats.yaPagada')}</span>
                <span>{formatCurrency(statement.pagada)}</span>
              </div>
              {!statement.mes_cerrado && (
                <>
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>{t('adminContab:comisionesInternas.stats.porPagar')}</span>
                    <span>{formatCurrency(statement.por_pagar)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>{t('adminContab:comisionesInternas.stats.pendienteCobro')}</span>
                    <span>{formatCurrency(statement.pendiente_cobro)}</span>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-slate-100 dark:border-slate-700">
          <Button
            variant="secondary" className="!text-xs inline-flex items-center gap-1.5"
            loading={pdfMutation.isPending}
            onClick={() => pdfMutation.mutate({ vendedorId, vendedorNombre, mes })}
          >
            <IcoPrinter size={13} /> {t('adminContab:comisionesInternas.estadoCuenta.verImprimir')}
          </Button>
          <Button variant="secondary" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
