import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { useZonaLibreRequests, useZonaLibreRequestDetail, useRemindZonaLibreRequest } from '@/hooks/useBodega'
import { useApproveZonaLibreRequest, useRejectZonaLibreRequest } from '@/hooks/useCompras'
import { usePermission } from '@/hooks/usePermission'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { IcoBell, IcoClose } from '@/components/icons'
import { formatMoney, formatInt } from '@/lib/money'
import type { ZonaLibreRequestRow, ZonaLibreStatus, ZonaLibreStatusFilter } from '@/types/bodega'

const CHIPS: ZonaLibreStatusFilter[] = ['todas', 'pendiente', 'aprobada', 'rechazada']

/**
 * SCRUM-442→445 (REQ-372→375) — "Órdenes de Zona Libre" (3D), bandeja de seguimiento. Misma
 * pantalla para Bodega (solo lectura) y Compras (Yirena, vía el grant `bodega.read` de
 * `SpecialPermissionSeeder.php`, SCRUM-440) — `RowAction` decide qué mostrar según el permiso
 * `compras.zona-libre.approve`, no hay una pantalla separada del lado de Compras.
 */
export default function BodegaOrdenesZonaLibrePage() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()
  const [chip, setChip] = useState<ZonaLibreStatusFilter>('todas')
  const [detailRowId, setDetailRowId] = useState<number | null>(null)
  const [rejectingRowId, setRejectingRowId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  // REQ-373 RN1 — filtrado server-side vía `?status=`, chips mutuamente excluyentes (un solo
  // estado de `chip` a la vez, nunca combinables).
  const { data, isFetching } = useZonaLibreRequests(chip, page, perPage)
  const rows = data?.data ?? []

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{t('bodega:zonaLibre.orders.title')}</h1>
          <p className="text-[12px] text-slate-500">{t('bodega:zonaLibre.orders.subtitle')}</p>
        </div>
        <Button onClick={() => navigate('/bodega/ordenes-zona-libre/nueva')}>
          {t('bodega:zonaLibre.orders.newOrder')}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {CHIPS.map(c => (
          <Button
            key={c}
            variant="outline"
            active={chip === c}
            activeVariant="primary"
            className="!text-xs !px-3 !py-1.5"
            onClick={() => { setChip(c); setPage(1) }}
          >
            {t(`bodega:zonaLibre.orders.chips.${c}`)}
          </Button>
        ))}
      </div>

      <Card variant="panel" className="overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <Th>{t('bodega:zonaLibre.orders.table.orderNumber')}</Th>
              <Th>{t('bodega:zonaLibre.orders.table.provider')}</Th>
              <Th>{t('bodega:zonaLibre.orders.table.createdAt')}</Th>
              <Th>{t('bodega:zonaLibre.orders.table.products')}</Th>
              <Th>{t('bodega:zonaLibre.orders.table.amount')}</Th>
              <Th>{t('bodega:zonaLibre.orders.table.estimatedArrival')}</Th>
              <Th>{t('bodega:zonaLibre.orders.table.status')}</Th>
              <Th>{t('bodega:zonaLibre.orders.table.action')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('bodega:zonaLibre.orders.empty')}
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">#{row.order_number}</td>
                <td className="px-4 py-3 text-slate-600">{row.provider_name}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                  {new Date(row.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-slate-600">{row.products_summary}</td>
                {/* SCRUM-442 (rebote de Daniela Amaya 2026-08-13) — separador de miles con el
                    mismo helper compartido (`formatMoney`, ya usado en el resto del sistema) en
                    vez de `toFixed(2)` directo, mismo gap que la columna Monto del carrito de
                    Nueva Orden Zona Libre (SCRUM-436). */}
                <td className="px-4 py-3 text-slate-600">${formatMoney(row.total_amount)}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                  {row.estimated_arrival_date ? new Date(row.estimated_arrival_date).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3"><EstadoBadge status={row.status} /></td>
                <td className="px-4 py-3">
                  <RowAction
                    row={row}
                    onViewDetail={() => setDetailRowId(row.id)}
                    onReject={() => setRejectingRowId(row.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data?.meta && (
        <Pagination
          meta={data.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={p => { setPerPage(p); setPage(1) }}
        />
      )}

      {detailRowId !== null && <DetailModal id={detailRowId} onClose={() => setDetailRowId(null)} />}
      {rejectingRowId !== null && (
        <RejectModal id={rejectingRowId} onClose={() => setRejectingRowId(null)} />
      )}
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

function EstadoBadge({ status }: { status: ZonaLibreStatus }) {
  const { t } = useTranslation('bodega')
  const colors: Record<ZonaLibreStatus, string> = {
    pendiente: 'bg-amber-50 text-amber-700',
    aprobada:  'bg-emerald-50 text-emerald-700',
    rechazada: 'bg-red-50 text-red-700',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${colors[status]}`}>
      {t(`zonaLibre.orders.status.${status}`)}
    </span>
  )
}

/** REQ-374 + SCRUM-797 (RN9/RN10, CA6/CA7) — la acción disponible depende del estado Y del rol/
 * permiso del actor: pendiente + `compras.zona-libre.approve` (Líder de Compras) → Aprobar/
 * Rechazar; pendiente sin ese permiso (resto de Bodega) → "Recordar"; rechazada/aprobada → sin
 * botón primario, solo texto/estado. "Ver detalle" (CA6) y, mientras siga pendiente, "Editar"
 * (CA7 — Líder de Bodega o Líder de Compras) están SIEMPRE disponibles además de la acción de
 * arriba, sin importar el estado. */
function RowAction({ row, onViewDetail, onReject }: {
  row: ZonaLibreRequestRow
  onViewDetail: () => void
  onReject: () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canApprove = usePermission('compras.zona-libre.approve')
  // SCRUM-797 RN10 — `user.role` es el role_key de negocio en runtime (ver auth_roles.key), mismo
  // criterio que `BodegaZonaLibreRequestController::update()` en el backend.
  const canEdit = row.status === 'pendiente' && (user?.role === 'lider_bodega' || canApprove)
  const remind = useRemindZonaLibreRequest()
  const approve = useApproveZonaLibreRequest()
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const secondaryLinks = (
    <div className="flex gap-3 mt-1">
      {canEdit && (
        <button
          type="button"
          className="text-primary text-[11px] underline"
          onClick={() => navigate(`/bodega/ordenes-zona-libre/${row.id}/editar`)}
        >
          {t('bodega:zonaLibre.orders.actions.edit')}
        </button>
      )}
      <button type="button" className="text-slate-500 text-[11px] underline" onClick={onViewDetail}>
        {t('bodega:zonaLibre.orders.actions.viewDetail')}
      </button>
    </div>
  )

  if (row.status === 'pendiente' && canApprove) {
    return (
      <div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            className="!text-xs !px-2 !py-1"
            loading={approve.isPending}
            onClick={() => {
              setFeedback(null)
              approve.mutate(row.id, {
                onSuccess: () => setFeedback('success'),
                onError: (err) => {
                  setFeedback('error')
                  const msg = isAxiosError(err) && err.response?.status === 422
                    ? (err.response.data as { message?: string } | undefined)?.message
                    : undefined
                  setErrorMessage(msg ?? t('bodega:zonaLibre.orders.actions.approveError'))
                },
              })
            }}
          >
            {t('bodega:zonaLibre.orders.actions.approve')}
          </Button>
          <Button variant="outline" className="!text-xs !px-2 !py-1" onClick={onReject}>
            {t('bodega:zonaLibre.orders.actions.reject')}
          </Button>
        </div>
        {feedback === 'error' && (
          <p className="text-red-600 text-[11px] mt-1 max-w-[160px]">{errorMessage}</p>
        )}
        {secondaryLinks}
      </div>
    )
  }

  if (row.status === 'pendiente') {
    return (
      <div>
        <Button
          variant="outline"
          className="!text-xs !px-2 !py-1 inline-flex items-center gap-1"
          loading={remind.isPending}
          onClick={() => {
            setFeedback(null)
            remind.mutate(row.id, {
              onSuccess: () => setFeedback('success'),
              onError: (err) => {
                setFeedback('error')
                // REQ-375 — 422 "ya no está pendiente" tiene mensaje propio del backend, no un
                // error genérico.
                const msg = isAxiosError(err) && err.response?.status === 422
                  ? (err.response.data as { message?: string } | undefined)?.message
                  : undefined
                setErrorMessage(msg ?? t('bodega:zonaLibre.orders.actions.reminderError'))
              },
            })
          }}
        >
          <IcoBell size={13} />
          {t('bodega:zonaLibre.orders.actions.remind')}
        </Button>
        {feedback === 'success' && (
          <p className="text-emerald-600 text-[11px] mt-1">{t('bodega:zonaLibre.orders.actions.reminderSent')}</p>
        )}
        {feedback === 'error' && (
          <p className="text-red-600 text-[11px] mt-1 max-w-[160px]">{errorMessage}</p>
        )}
        {secondaryLinks}
      </div>
    )
  }

  if (row.status === 'rechazada') {
    return <div>{secondaryLinks}</div>
  }

  return (
    <div>
      <span className="text-xs text-slate-400">{t('bodega:zonaLibre.orders.actions.followsNormalFlow')}</span>
      {secondaryLinks}
    </div>
  )
}

/** SCRUM-797 CA6/CA8/CA9 — reemplaza el antiguo "Ver motivo" (solo rechazada): ahora es "Ver
 * detalle" para cualquier estado, mostrando todo lo que `formatDetail()` ya devuelve del backend
 * (antes se pedía pero casi todo se descartaba sin renderizar). */
function DetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const { data, isLoading } = useZonaLibreRequestDetail(id)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">
            {t('bodega:zonaLibre.orders.detailModal.title', { number: data?.order_number ?? id })}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>

        {isLoading || !data ? (
          <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <EstadoBadge status={data.status} />
              <span className="text-xs text-slate-400">
                {t('bodega:zonaLibre.orders.detailModal.createdAt')}: {new Date(data.created_at).toLocaleDateString()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-400 uppercase tracking-wide mb-0.5">
                  {t('bodega:zonaLibre.orders.detailModal.requestedBy')}
                </p>
                <p className="text-slate-700 font-medium">{data.requested_by_name ?? '—'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wide mb-0.5">
                  {t('bodega:zonaLibre.orders.detailModal.shippingType')}
                </p>
                <p className="text-slate-700 font-medium">
                  {data.shipping_type ? t(`bodega:zonaLibre.newOrder.shipping.${data.shipping_type}`) : '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-400 uppercase tracking-wide mb-0.5">
                  {t('bodega:zonaLibre.orders.detailModal.estimatedArrival')}
                </p>
                <p className="text-slate-700 font-medium">
                  {data.estimated_arrival_date ? new Date(data.estimated_arrival_date).toLocaleDateString() : '—'}
                </p>
              </div>
              {data.status === 'aprobada' && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wide mb-0.5">
                    {t('bodega:zonaLibre.orders.detailModal.approvedBy')}
                  </p>
                  <p className="text-slate-700 font-medium">{data.approved_by_name ?? '—'}</p>
                </div>
              )}
              {data.status === 'rechazada' && (
                <div>
                  <p className="text-slate-400 uppercase tracking-wide mb-0.5">
                    {t('bodega:zonaLibre.orders.detailModal.rejectedBy')}
                  </p>
                  <p className="text-slate-700 font-medium">{data.rejected_by_name ?? '—'}</p>
                </div>
              )}
            </div>

            {data.status === 'rechazada' && (
              <div>
                <p className="text-slate-400 uppercase tracking-wide text-xs mb-0.5">
                  {t('bodega:zonaLibre.orders.detailModal.rejectionReason')}
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{data.rejection_reason ?? '—'}</p>
              </div>
            )}

            <div>
              <p className="text-slate-400 uppercase tracking-wide text-xs mb-0.5">
                {t('bodega:zonaLibre.orders.detailModal.notes')}
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {data.notes ?? t('bodega:zonaLibre.orders.detailModal.notesEmpty')}
              </p>
            </div>

            <div>
              <p className="text-slate-400 uppercase tracking-wide text-xs mb-2">
                {t('bodega:zonaLibre.orders.detailModal.lines')}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-1.5 font-semibold text-slate-500 uppercase">
                        {t('bodega:zonaLibre.newOrder.lines.product')}
                      </th>
                      <th className="text-left py-1.5 font-semibold text-slate-500 uppercase">
                        {t('bodega:zonaLibre.newOrder.lines.publicRef')}
                      </th>
                      <th className="text-left py-1.5 font-semibold text-slate-500 uppercase">
                        {t('bodega:zonaLibre.newOrder.lines.quantity')}
                      </th>
                      <th className="text-left py-1.5 font-semibold text-slate-500 uppercase">
                        {t('bodega:zonaLibre.newOrder.lines.unitCost')}
                      </th>
                      <th className="text-left py-1.5 font-semibold text-slate-500 uppercase">
                        {t('bodega:zonaLibre.newOrder.lines.subtotal')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.lines.map(line => (
                      <tr key={line.id}>
                        <td className="py-1.5 font-medium text-slate-800">{line.description ?? '—'}</td>
                        <td className="py-1.5 text-slate-600">{line.reference ?? '—'}</td>
                        <td className="py-1.5 text-slate-600">{formatInt(line.quantity)}</td>
                        <td className="py-1.5 text-slate-600">${formatMoney(line.unit_cost_snapshot)}</td>
                        <td className="py-1.5 font-semibold text-slate-800">${formatMoney(line.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end font-bold text-slate-800 text-sm mt-2">
                {t('bodega:zonaLibre.orders.detailModal.total')}: ${formatMoney(data.total_amount)}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>{t('common:actions.close')}</Button>
        </div>
      </Card>
    </div>
  )
}

/** SCRUM-440 (REQ-370 Escenario 1) — motivo obligatorio, validado client-side antes de enviar
 * (mismo patrón que el 422 del backend, que también lo exige). */
function RejectModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation(['common', 'bodega'])
  const reject = useRejectZonaLibreRequest()
  const [reason, setReason] = useState('')
  const [showRequiredError, setShowRequiredError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = () => {
    if (reason.trim() === '') {
      setShowRequiredError(true)
      return
    }
    setErrorMessage(null)
    reject.mutate({ id, rejectionReason: reason.trim() }, {
      onSuccess: onClose,
      onError: (err) => {
        const msg = isAxiosError(err) && err.response?.status === 422
          ? (err.response.data as { message?: string } | undefined)?.message
          : undefined
        setErrorMessage(msg ?? t('bodega:zonaLibre.orders.actions.rejectError'))
      },
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card variant="modal" className="w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('bodega:zonaLibre.orders.rejectModal.title')}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><IcoClose /></button>
        </div>
        <label htmlFor="zona-libre-reject-reason" className="block text-xs font-semibold text-slate-500 uppercase mb-1">
          {t('bodega:zonaLibre.orders.rejectModal.reasonLabel')}
        </label>
        <textarea
          id="zona-libre-reject-reason"
          value={reason}
          onChange={e => { setReason(e.target.value); setShowRequiredError(false) }}
          rows={4}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        {showRequiredError && (
          <p className="text-red-600 text-[11px] mt-1">{t('bodega:zonaLibre.orders.rejectModal.reasonRequired')}</p>
        )}
        {errorMessage && <p className="text-red-600 text-[11px] mt-1">{errorMessage}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" loading={reject.isPending} onClick={handleSubmit}>
            {t('bodega:zonaLibre.orders.actions.reject')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
