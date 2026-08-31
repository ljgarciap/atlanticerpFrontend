import { useTranslation } from 'react-i18next'
import { usePurchaseOrderDocuments, useUploadPurchaseOrderDocument } from '@/hooks/useCompras'
import { Card } from '@/components/ui/Card'
import { IcoFile } from '@/components/icons'
import ProviderConfirmationPanel from '@/components/compras/ProviderConfirmationPanel'

interface Props {
  orderId: number
  // RN1 (mockup 2A__Compras_Ordenes.html, sección #od-confirmacion-wrap): la carga solo se
  // habilita cuando la orden salió de "Por aprobar".
  orderStatus: string
}

/**
 * SCRUM-211/REQ-148 (2026-08-06 — hallazgo Gerencia Test, mockup 2A__Compras_Ordenes.html
 * adjuntado el mismo día). El card de solo-lectura de SCRUM-218 (2026-08-06 temprano, "duplicar
 * sin agregar subida") resolvía el gap de VISIBILIDAD pero no el de FUNCIONALIDAD: el mockup real
 * de Ver Órdenes tiene su propia carga/reemplazo (`#oc-input`) dentro del modal de detalle, no
 * solo en Logística. Decisión de Luis (2026-08-06, tras confirmar el conflicto con la sesión de
 * esa mañana): agregar carga real acá, sin quitar el checklist de Logística (queda en paralelo).
 *
 * RN2: mismo whitelist de extensiones que el mockup (pdf/jpg/jpeg/png/xlsx/xls/csv) — subset del
 * whitelist más amplio que ya acepta el backend para REQ-155 (StorePurchaseOrderDocumentRequest),
 * no requiere cambio de validación server-side.
 * RN3: la comparación real de contenido (IA) ya existe — ver ProviderConfirmationPanel.
 * RN4: "reemplazar" es una subida más para la misma categoría — el backend NO versiona/borra el
 * documento anterior (PurchaseOrderDocumentService: "sin versionado", diseño de REQ-155), así que
 * acá se toma siempre el de `id` más alto entre los documentos de esta categoría — el más
 * reciente, sin depender del orden en que la API devuelva la lista. La validación se re-dispara
 * sola en el backend al subir (mismo mecanismo que Logística, no hace falta orquestarlo acá).
 * RN5: documento + resultado quedan accesibles vía GET .../documents y .../validation, sin volver
 * a subir nada — ya cubierto por `usePurchaseOrderDocuments`/`useProviderConfirmationValidation`.
 */
export default function ProviderConfirmationCard({ orderId, orderStatus }: Props) {
  const { t } = useTranslation(['common', 'compras'])
  const { data: documentsData } = usePurchaseOrderDocuments(orderId)
  const uploadDocument = useUploadPurchaseOrderDocument()

  const candidates = (documentsData?.data ?? []).filter(d => d.category === 'confirmacion_proveedor')
  const doc = candidates.length === 0
    ? null
    : candidates.reduce((latest, d) => (d.id > latest.id ? d : latest))

  const canUpload = orderStatus !== 'por_aprobar'

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadDocument.mutate({ orderId, category: 'confirmacion_proveedor', file })
    e.target.value = ''
  }

  return (
    <Card variant="panel" className="p-5 mb-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
        {t('compras:orders.detail.providerConfirmation.title')}
      </h2>

      {!canUpload && (
        <p className="text-xs text-slate-400 italic mb-2">
          {t('compras:orders.detail.providerConfirmation.blockedByApproval')}
        </p>
      )}

      {doc === null ? (
        <p className="text-sm text-slate-400">{t('compras:orders.detail.providerConfirmation.empty')}</p>
      ) : (
        <>
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <IcoFile size={13} />
            {t('compras:orders.detail.providerConfirmation.viewDocument')}
          </a>
          <ProviderConfirmationPanel orderId={orderId} doc={doc} />
        </>
      )}

      {canUpload && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <label className="inline-block px-3 py-1.5 border border-slate-200 rounded-lg text-xs cursor-pointer hover:bg-slate-50">
            {doc === null
              ? t('compras:orders.detail.providerConfirmation.upload')
              : t('compras:orders.detail.providerConfirmation.replace')}
            <input
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv"
              onChange={handleFileChange}
            />
          </label>
          {uploadDocument.isPending && (
            <span className="ml-2 text-xs text-slate-400">{t('compras:orders.detail.providerConfirmation.uploading')}</span>
          )}
          {uploadDocument.isError && (
            <p className="text-xs text-red-600 mt-1">{t('compras:logistics.errors.documentGeneric')}</p>
          )}
        </div>
      )}
    </Card>
  )
}
