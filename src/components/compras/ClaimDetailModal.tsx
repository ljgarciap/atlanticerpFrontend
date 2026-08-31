import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useClaim, useUpdateClaimStatus, useUpdateClaimResolution, useUploadClaimPhoto, useDownloadClaimPdf,
} from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoClose, IcoAlertTriangle } from '@/components/icons'
import { formatMoney } from '@/lib/money'

interface Props {
  claimId: number
  onClose: () => void
}

const RESOLUTION_TYPES = [
  'reposicion', 'nota_credito_favor', 'nota_credito_reembolso', 'envio_repuestos', 'negado',
] as const

/**
 * SCRUM-259 (REQ-196, hallazgo de Gerencia Test 2026-08-10) — ficha completa del reclamo,
 * reorganizada según el mockup: encabezado (producto + cantidad afectada), info principal en 2
 * filas, sección Unidades afectadas/Monto en disputa, descripción, fotos, historial de 3 etapas
 * fijas (Reportado/En revisión/Resuelto, futuras atenuadas "Pendiente"), Ver orden asociada y
 * Descargar PDF.
 */
export default function ClaimDetailModal({ claimId, onClose }: Props) {
  const { t } = useTranslation(['common', 'compras'])
  const navigate = useNavigate()

  const { data: claim, isLoading } = useClaim(claimId)
  const updateStatus = useUpdateClaimStatus(claimId)
  const updateResolution = useUpdateClaimResolution(claimId)
  const uploadPhoto = useUploadClaimPhoto(claimId)
  const downloadPdf = useDownloadClaimPdf()

  const [photo, setPhoto] = useState<File | null>(null)

  const totalAffectedQty = claim ? claim.lines.reduce((sum, l) => sum + l.affected_quantity, 0) : 0
  const firstLine = claim?.lines[0]
  const headerSubtitle = firstLine
    ? t('compras:claims.detail.headerSubtitle', { product: firstLine.description, qty: totalAffectedQty })
    : null

  // SCRUM-259 — 3 etapas fijas del mockup. El sistema hoy solo tiene 2 estados reales
  // (en_revision, resuelto — Daniela lo reconoce explícitamente en su comentario), así que
  // "Reportado" y "En revisión" comparten la fecha de creación (un reclamo nace directamente en
  // "en_revision", nunca hay un estado intermedio real entre ambos). "Resuelto" solo se muestra
  // activo si el estado actual es resuelto; de lo contrario queda atenuado como "Pendiente".
  const historyStages = claim ? [
    { key: 'reportado', active: true, date: claim.created_at },
    { key: 'en_revision', active: true, date: claim.created_at },
    { key: 'resuelto', active: claim.status === 'resuelto', date: claim.resolved_at },
  ] : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <Card variant="modal" className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[15px] font-bold text-slate-800">
              {claim ? claim.code : t('compras:claims.detail.title')}
            </h2>
            {headerSubtitle && <p className="text-xs text-slate-500 mt-0.5">{headerSubtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0">
            <IcoClose size={16} />
          </button>
        </div>

        {isLoading || !claim ? (
          <div className="text-slate-400 text-sm">{t('common:status.loading')}</div>
        ) : (
          <>
            {claim.needs_attention && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs mb-3">
                <IcoAlertTriangle size={12} /> {t('compras:claims.table.attention')}
              </span>
            )}

            {/* Fila 1 — Orden asociada / Proveedor / Fecha reportado */}
            <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-bold">{t('compras:claims.detail.order')}</div>
                <div className="text-slate-700">#{claim.purchase_order_id}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-bold">{t('compras:claims.table.provider')}</div>
                <div className="text-slate-700">{claim.provider_name ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-bold">{t('compras:claims.detail.reportedDate')}</div>
                <div className="text-slate-700">{new Date(claim.created_at).toLocaleDateString()}</div>
              </div>
            </div>

            {/* Fila 2 — Tipo de resolución (editable) / Estado / Ticket Servicios */}
            <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-slate-400 font-bold">{t('compras:claims.new.expectedResolution')}</span>
                <select
                  value={claim.expected_resolution ?? ''}
                  onChange={e => updateResolution.mutate(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="" disabled>{t('compras:claims.new.expectedResolutionPlaceholder')}</option>
                  {RESOLUTION_TYPES.map(r => (
                    <option key={r} value={r}>{t(`compras:claims.resolutionTypes.${r}`)}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-slate-400 font-bold">{t('compras:claims.table.status')}</span>
                <select
                  value={claim.status}
                  onChange={e => updateStatus.mutate(e.target.value as 'en_revision' | 'resuelto')}
                  className="px-2 py-1 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="en_revision">{t('compras:claims.status.en_revision')}</option>
                  <option value="resuelto">{t('compras:claims.status.resuelto')}</option>
                </select>
              </label>
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-bold">{t('compras:claims.detail.serviceTicket')}</div>
                <div className="text-slate-400 text-xs mt-1.5">{t('compras:claims.detail.noServiceTickets')}</div>
              </div>
            </div>

            {/* Unidades afectadas / Monto en disputa */}
            <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-bold">{t('compras:claims.new.affectedQuantity')}</div>
                <div className="text-slate-800 font-semibold">{t('compras:claims.detail.unitsCount', { qty: totalAffectedQty })}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-bold">{t('compras:claims.new.disputedAmount')}</div>
                <div className="text-slate-800 font-semibold">${formatMoney(claim.total_amount)}</div>
              </div>
            </div>

            {/* Descripción del problema */}
            <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t('compras:claims.new.description')}</p>
            <p className="text-sm text-slate-700 mb-4 p-2 bg-slate-50 rounded-lg min-h-[2.5rem]">
              {claim.description || <span className="text-slate-400">—</span>}
            </p>

            {/* Fotos adjuntas */}
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('compras:claims.detail.photos')}</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {claim.photos.map(p => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                  {t('compras:claims.detail.viewPhoto')}
                </a>
              ))}
              {claim.photos.length === 0 && <span className="text-sm text-slate-400">{t('compras:claims.detail.photosEmpty')}</span>}
            </div>
            <div className="flex items-center gap-2 mb-4">
              <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] ?? null)} className="text-sm" />
              <Button
                variant="outline" className="!text-xs !px-2 !py-1"
                disabled={photo === null} loading={uploadPhoto.isPending}
                onClick={() => { if (photo) uploadPhoto.mutate(photo, { onSuccess: () => setPhoto(null) }) }}
              >
                {t('compras:claims.detail.uploadPhoto')}
              </Button>
            </div>

            {/* Historial de estado — 3 etapas fijas, futuras atenuadas */}
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('compras:claims.detail.statusHistory')}</p>
            <ul className="flex flex-col gap-1.5 mb-4">
              {historyStages.map(stage => (
                <li
                  key={stage.key}
                  className={`flex items-center justify-between text-xs rounded-lg px-3 py-1.5 ${
                    stage.active ? 'bg-slate-50 text-slate-700' : 'bg-slate-50/50 text-slate-400'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${stage.active ? 'bg-primary' : 'bg-slate-300'}`} />
                    {t(`compras:claims.detail.stages.${stage.key}`)}
                  </span>
                  <span>
                    {stage.active && stage.date ? new Date(stage.date).toLocaleDateString() : t('compras:claims.detail.pending')}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate(`/compras/ordenes/${claim.purchase_order_id}`)}>
                {t('compras:claims.detail.viewOrder')}
              </Button>
              <Button
                variant="outline" loading={downloadPdf.isPending}
                onClick={() => downloadPdf.mutate({ id: claim.id, code: claim.code })}
              >
                {t('compras:claims.detail.downloadPdf')}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
