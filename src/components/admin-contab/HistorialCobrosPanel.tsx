import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePaymentHistorial } from '@/hooks/useAdminContab'
import { PAYMENT_METHODS } from '@/types/adminContab'
import type { PaymentEstado, PaymentMethod } from '@/types/adminContab'
import { Card } from '@/components/ui/Card'
import { IcoSearch, IcoClose } from '@/components/icons'
import { formatDateShort } from '@/utils/dates'

const selectClass = 'rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

const ESTADO_PILL_CLASSES: Record<PaymentEstado, string> = {
  confirmado: 'bg-primary-soft text-primary-dark',
  esperando_confirmacion: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-PA', { style: 'currency', currency: 'USD' }).format(value)
}

// SCRUM-787 — `formatDate()` local eliminado, reemplazado por `formatDateShort()` compartido
// (`@/utils/dates`), mismo criterio ya aplicado en Notas Crédito.

interface Props {
  onSelectPayment: (id: number) => void
  // SCRUM-167 (Gerencia → Salud Admin&Contab): "CxC Total" navega acá con
  // ?estado=esperando_confirmacion — antes se descartaba porque CobrosPage.tsx
  // solo leía master_client_id/accion, nunca pasaba el estado a este panel.
  initialEstado?: PaymentEstado
}

/**
 * Batch 6 del cuerpo principal (SCRUM-547, REQ-470) — "Historial de cobros": tabla + búsqueda +
 * filtros combinados (AND). La tabla en sí (columnas Comprobante/Recibo incluidas) es artefacto
 * nuevo de este batch — REQ-472/473 (Batch 7, "Ver comprobante"/"Ver recibo") agregan la acción de
 * esas 2 columnas más adelante; acá solo se muestra si el cobro tiene comprobante y su N° de
 * recibo, sin acción todavía.
 */
export default function HistorialCobrosPanel({ onSelectPayment, initialEstado }: Props) {
  const { t } = useTranslation('adminContab')

  const [search, setSearch]   = useState('')
  const [cliente, setCliente] = useState('')
  const [metodo, setMetodo]   = useState<PaymentMethod | ''>('')
  const [estado, setEstado]   = useState<PaymentEstado | ''>(initialEstado ?? '')
  const [desde, setDesde]     = useState('')
  const [hasta, setHasta]     = useState('')

  const { data, isFetching } = usePaymentHistorial({
    search: search || undefined,
    cliente: cliente || undefined,
    metodo: metodo || undefined,
    estado: estado || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  })

  const rows  = data?.rows ?? []
  const total = data?.total ?? 0
  const hasFilters = !!(search || cliente || metodo || estado || desde || hasta)
  // Filtro backend es exacto (no parcial) — un <select> de valores reales evita que el usuario
  // escriba un nombre parcial y el filtro devuelva 0 resultados en silencio. Mismo patrón que
  // `clientesOptions` en FacturacionPage.tsx.
  const clientesOptions = useMemo(() => Array.from(new Set(rows.map(r => r.cliente))).sort(), [rows])

  function clearFilters() {
    setSearch(''); setCliente(''); setMetodo(''); setEstado(''); setDesde(''); setHasta('')
  }

  return (
    <Card variant="panel" className="p-4 mt-6">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t('cobros.historial.title')}</h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t('cobros.historial.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-2 mb-3">
        <div className="relative">
          <IcoSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('cobros.historial.searchPlaceholder')}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={cliente} onChange={e => setCliente(e.target.value)} className={selectClass}>
            <option value="">{t('cobros.historial.filtroCliente')}</option>
            {clientesOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={metodo} onChange={e => setMetodo(e.target.value as PaymentMethod | '')} className={selectClass}>
            <option value="">{t('cobros.historial.filtroMetodo')}</option>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`cobros.metodos.${m}`)}</option>)}
          </select>
          <select value={estado} onChange={e => setEstado(e.target.value as PaymentEstado | '')} className={selectClass}>
            <option value="">{t('cobros.historial.filtroEstado')}</option>
            <option value="confirmado">{t('cobros.historial.estados.confirmado')}</option>
            <option value="esperando_confirmacion">{t('cobros.historial.estados.esperando_confirmacion')}</option>
          </select>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={selectClass} title={t('cobros.historial.desde')} />
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={selectClass} title={t('cobros.historial.hasta')} />
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2">
              <IcoClose size={13} />{t('cobros.historial.limpiarFiltros')}
            </button>
          )}
        </div>
      </div>

      <div className="text-[11px] text-slate-400 mb-2">
        {t('cobros.historial.resultCount', { mostrados: rows.length, total })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
              <th className="py-2 pr-3">{t('cobros.historial.columnas.fecha')}</th>
              <th className="py-2 pr-3">{t('cobros.historial.columnas.cliente')}</th>
              <th className="py-2 pr-3">{t('cobros.historial.columnas.facturas')}</th>
              <th className="py-2 pr-3">{t('cobros.historial.columnas.monto')}</th>
              <th className="py-2 pr-3">{t('cobros.historial.columnas.metodo')}</th>
              <th className="py-2 pr-3">{t('cobros.historial.columnas.estado')}</th>
              <th className="py-2 pr-3">{t('cobros.historial.columnas.registradoPor')}</th>
              <th className="py-2 pr-3">{t('cobros.historial.columnas.comprobante')}</th>
              <th className="py-2 pr-3">{t('cobros.historial.columnas.recibo')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.id}
                onClick={() => onSelectPayment(r.id)}
                className="border-b border-slate-50 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <td className="py-2 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDateShort(r.fecha)}</td>
                <td className="py-2 pr-3 text-slate-800 dark:text-slate-100">{r.cliente}</td>
                <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{r.facturas.join(', ')}</td>
                <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{formatCurrency(r.monto_recibido)}</td>
                <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{t(`cobros.metodos.${r.metodo_pago}`)}</td>
                <td className="py-2 pr-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_PILL_CLASSES[r.estado]}`}>
                    {t(`cobros.historial.estados.${r.estado}`)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{r.registrado_por}</td>
                <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
                  {r.tiene_comprobante ? t('cobros.historial.conComprobante') : t('cobros.historial.sinComprobante')}
                </td>
                <td className="py-2 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.numero_recibo}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isFetching && rows.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">{t('cobros.historial.vacio')}</p>
        )}
      </div>
    </Card>
  )
}
