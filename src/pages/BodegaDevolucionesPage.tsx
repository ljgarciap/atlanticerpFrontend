import { Fragment, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useCustomerReturns, useReturnFormUrl, useReturnDeliveryGuideUrl, useReturnSignedDocumentUrl,
} from '@/hooks/useBodega'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'
import { IcoChevronDown, IcoChevronRight } from '@/components/icons'
import CustomerReturnDetailModal, { ReasonLabel } from '@/components/bodega/CustomerReturnDetailModal'
import UploadReturnSignedDocumentModal from '@/components/bodega/UploadReturnSignedDocumentModal'
import ConfirmReturnReceptionModal from '@/components/bodega/ConfirmReturnReceptionModal'
import type { CustomerReturnRow, CustomerReturnStatus, CustomerReturnStatusFilter } from '@/types/bodega'

const CHIPS: CustomerReturnStatusFilter[] = ['todas', 'pendiente', 'esperando_nota_credito', 'finalizado', 'rechazada']

/**
 * Bloque B6 (SCRUM-473→489, REQ-403→419) — bandeja de "Devoluciones" (3J). Backend implementado
 * localmente (ver `atlanticerp-backend` commits 4ab8513/e4ab2dc, sin push a origin todavía) — este
 * frontend solo lo conecta. Reemplaza el placeholder "próximamente" que traía
 * `BodegaPlaceholderPages.tsx`.
 *
 * Columna "Proyecto" agregada 2026-07-26 tras el fix de Backend Dev (hallazgo de Visual Reviewer:
 * `GET /bodega/returns` ahora expone `project` en `CustomerReturnRow`).
 */
export default function BodegaDevolucionesPage() {
  const { t } = useTranslation(['common', 'bodega'])
  const navigate = useNavigate()
  const [chip, setChip] = useState<CustomerReturnStatusFilter>('todas')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const [detailId, setDetailId] = useState<number | null>(null)
  const [uploadId, setUploadId] = useState<number | null>(null)
  const [receptionId, setReceptionId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data, isFetching } = useCustomerReturns(chip, page, perPage)
  const rows = data?.data ?? []

  function toggleExpanded(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('bodega:returns.title')}</h1>
          <p className="text-[12px] text-slate-500">{t('bodega:returns.subtitle')}</p>
        </div>
        <Button onClick={() => navigate('/bodega/devoluciones/nueva')}>
          {t('bodega:returns.newReturn')}
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
            {t(`bodega:returns.chips.${c}`)}
          </Button>
        ))}
      </div>

      <Card variant="panel" className="overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <Th>{t('bodega:returns.table.order')}</Th>
              <Th>{t('bodega:returns.table.client')}</Th>
              <Th>{t('bodega:returns.table.project')}</Th>
              <Th>{t('bodega:returns.table.products')}</Th>
              <Th>{t('bodega:returns.table.date')}</Th>
              <Th>{t('bodega:returns.table.status')}</Th>
              <Th>{t('bodega:returns.table.signedDocument')}</Th>
              <Th>{t('bodega:returns.table.actionsDetail')}</Th>
              <Th>{t('bodega:returns.table.actionsForm')}</Th>
              <Th>{t('bodega:returns.table.actionsGuide')}</Th>
              <Th>{t('bodega:returns.table.actionsDocument')}</Th>
              <Th>{t('bodega:returns.table.actionsReception')}</Th>
              <Th>{t('bodega:returns.table.actionsFinalize')}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.length === 0 && !isFetching && (
              <tr>
                <td colSpan={13} className="px-4 py-10 text-center text-slate-400 text-sm">
                  {t('bodega:returns.empty')}
                </td>
              </tr>
            )}
            {rows.map(row => (
              <Fragment key={row.id}>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors align-top">
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">#{row.order_number}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.customer_name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.project ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    <ProductsCell row={row} expanded={expandedIds.has(row.id)} onToggle={() => toggleExpanded(row.id)} />
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3"><EstadoBadge status={row.status} /></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${row.has_signed_document ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {row.has_signed_document ? t('bodega:returns.signedDocument.yes') : t('bodega:returns.signedDocument.no')}
                    </span>
                  </td>
                  <RowActionCells
                    row={row}
                    onViewDetail={() => setDetailId(row.id)}
                    onUpload={() => setUploadId(row.id)}
                    onConfirmReception={() => setReceptionId(row.id)}
                  />
                </tr>
                {expandedIds.has(row.id) && row.products.length > 1 && (
                  <tr>
                    <td />
                    <td colSpan={12} className="px-4 pb-3">
                      <table className="w-full text-xs bg-slate-50 dark:bg-slate-900 rounded-lg">
                        <thead>
                          <tr>
                            <Th>{t('bodega:returns.expandedTable.product')}</Th>
                            <Th>{t('bodega:returns.expandedTable.quantity')}</Th>
                            <Th>{t('bodega:returns.expandedTable.reason')}</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                          {row.products.map(p => (
                            <tr key={p.id}>
                              <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{p.description ?? p.reference ?? '—'}</td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.qty_requested}</td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                <ReasonLabel reason={p.reason} detail={p.reason_detail} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
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

      {detailId !== null && <CustomerReturnDetailModal id={detailId} onClose={() => setDetailId(null)} />}
      {uploadId !== null && <UploadReturnSignedDocumentModal id={uploadId} onClose={() => setUploadId(null)} />}
      {receptionId !== null && <ConfirmReturnReceptionModal id={receptionId} onClose={() => setReceptionId(null)} />}
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

/** SCRUM-474 (REQ-404) — celda "Producto(s)": nombre directo si hay 1 solo, "N productos" con
 * flecha si hay más de uno, sin modal (expande una fila debajo con el detalle). */
function ProductsCell({ row, expanded, onToggle }: { row: CustomerReturnRow; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation('bodega')
  if (row.products.length <= 1) {
    return <span>{row.products[0]?.description ?? row.products[0]?.reference ?? '—'}</span>
  }
  return (
    <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 text-primary hover:underline">
      {expanded ? <IcoChevronDown size={13} /> : <IcoChevronRight size={13} />}
      {t('returns.productsCell.count', { count: row.products.length })}
    </button>
  )
}

function EstadoBadge({ status }: { status: CustomerReturnStatus }) {
  const { t } = useTranslation('bodega')
  const colors: Record<CustomerReturnStatus, string> = {
    pendiente:               'bg-amber-50 text-amber-700',
    esperando_nota_credito:  'bg-amber-50 text-amber-700',
    finalizado:              'bg-emerald-50 text-emerald-700',
    rechazada:               'bg-red-50 text-red-700',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${colors[status]}`}>
      {t(`returns.status.${status}`)}
    </span>
  )
}

/**
 * SCRUM-769 (REQ-419, rebote 2026-08-16) — cada acción de la fila en su propia columna, en vez de
 * apiladas dentro de una sola celda "Acciones" (más difícil de escanear con varios botones
 * juntos). Devuelve un Fragment de `<td>`s, un elemento por acción — cada `<td>` muestra "—"
 * cuando esa acción no aplica al estado de la fila, la columna nunca se oculta (RN2).
 *
 * SCRUM-483 (REQ-413) — reglas de aplicabilidad sin cambios respecto a antes de este ticket:
 * - `finalizado`/`rechazada` → sin acción contextual, solo "Ver detalle".
 * - sin `has_signed_document` → "Cargar documento firmado".
 * - con documento pero sin `received_at` → "Confirmar recepción física".
 *
 * SCRUM-482 (REQ-412, rebote 2026-08-17) — "Simular finalización" eliminado por completo: el
 * propio REQ-412 ya la marcaba exclusiva del mockup ("en el sistema real, este paso lo completa
 * Administración & Contabilidad desde su propio módulo"), nunca debió construirse como
 * funcionalidad real. La columna "Nota de crédito" para `esperando_nota_credito` queda siempre
 * vacía hasta que exista esa integración real — Bodega no tiene ninguna acción disponible ahí.
 *
 * Nota de alcance (no resuelta en este ticket): el mockup de SCRUM-769 también lista columnas
 * "Rechazar" y "Ver motivo" como acciones independientes — hoy "Rechazar" solo existe DENTRO del
 * modal de "Confirmar recepción física" (`ConfirmReturnReceptionModal`, botón "Rechazar
 * devolución"), y el motivo de rechazo solo se ve en el historial del modal "Ver detalle", no como
 * columna propia. Convertirlas en botones de fila independientes es una decisión de flujo (saltear
 * el paso de confirmar recepción para rechazar directo), no una reorganización visual pura — queda
 * fuera de este ticket, señalado para que Luis confirme si corresponde.
 */
function RowActionCells({ row, onViewDetail, onUpload, onConfirmReception }: {
  row: CustomerReturnRow
  onViewDetail: () => void
  onUpload: () => void
  onConfirmReception: () => void
}) {
  const { t } = useTranslation(['common', 'bodega'])
  const formUrl = useReturnFormUrl()
  const guideUrl = useReturnDeliveryGuideUrl()
  const signedDocumentUrl = useReturnSignedDocumentUrl()
  const [error, setError] = useState<{ cell: 'form' | 'guide' | 'document'; message: string } | null>(null)

  const isResolved = row.status === 'finalizado' || row.status === 'rechazada'
  const showReception = !isResolved && row.has_signed_document && !row.received_at

  function handleViewForm() {
    setError(null)
    formUrl.mutate(row.id, {
      onSuccess: ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
      onError:   () => setError({ cell: 'form', message: t('bodega:returns.errors.openFormFailed') }),
    })
  }

  function handleViewGuide() {
    setError(null)
    guideUrl.mutate(row.id, {
      onSuccess: ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
      onError:   () => setError({ cell: 'guide', message: t('bodega:returns.errors.openGuideFailed') }),
    })
  }

  // SCRUM-478 (rebote de Daniela Amaya 2026-08-16) — el documento firmado se podía subir pero no
  // había forma de verlo/descargarlo después.
  function handleViewSignedDocument() {
    setError(null)
    signedDocumentUrl.mutate(row.id, {
      onSuccess: ({ url }) => window.open(url, '_blank', 'noopener,noreferrer'),
      onError:   () => setError({ cell: 'document', message: t('bodega:returns.errors.openSignedDocumentFailed') }),
    })
  }

  const Empty = <span className="text-slate-300 dark:text-slate-600">—</span>

  function CellError({ cell }: { cell: 'form' | 'guide' | 'document' }) {
    if (error?.cell !== cell) return null
    return <p className="text-red-600 text-[11px] max-w-[160px] mt-1">{error.message}</p>
  }

  return (
    <>
      <td className="px-4 py-3">
        <button type="button" className="text-primary text-xs underline" onClick={onViewDetail}>
          {t('bodega:returns.actions.viewDetail')}
        </button>
      </td>
      <td className="px-4 py-3">
        {!isResolved ? (
          <button type="button" className="text-primary text-xs underline" onClick={handleViewForm} disabled={formUrl.isPending}>
            {t('bodega:returns.actions.viewForm')}
          </button>
        ) : Empty}
        <CellError cell="form" />
      </td>
      <td className="px-4 py-3">
        {!isResolved ? (
          <button type="button" className="text-primary text-xs underline" onClick={handleViewGuide} disabled={guideUrl.isPending}>
            {t('bodega:returns.actions.viewDeliveryGuide')}
          </button>
        ) : Empty}
        <CellError cell="guide" />
      </td>
      <td className="px-4 py-3">
        {isResolved ? Empty : row.has_signed_document ? (
          <button
            type="button" className="text-primary text-xs underline"
            onClick={handleViewSignedDocument} disabled={signedDocumentUrl.isPending}
          >
            {t('bodega:returns.actions.viewSignedDocument')}
          </button>
        ) : (
          <Button variant="outline" className="!text-xs !px-2 !py-1" onClick={onUpload}>
            {t('bodega:returns.actions.uploadSigned')}
          </Button>
        )}
        <CellError cell="document" />
      </td>
      <td className="px-4 py-3">
        {showReception ? (
          <Button variant="outline" className="!text-xs !px-2 !py-1" onClick={onConfirmReception}>
            {t('bodega:returns.actions.confirmReception')}
          </Button>
        ) : Empty}
      </td>
      <td className="px-4 py-3">{Empty}</td>
    </>
  )
}
