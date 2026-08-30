import { useTranslation } from 'react-i18next'
import { useValidateProviderConfirmation, useProviderConfirmationValidation } from '@/hooks/useCompras'
import { Button } from '@/components/ui/Button'
import { IcoAlertTriangle, IcoCheck } from '@/components/icons'
import type { PurchaseOrderDocument } from '@/types/compras'

/**
 * SCRUM-211 (ADR-SCRUM211) — validación con IA del documento de confirmación de proveedor.
 * El resultado SIEMPRE se muestra como sugerencia editable, nunca aprueba la orden por sí solo
 * (ver "UI: mostrar discrepancias como sugerencia editable, nunca como aprobación automática"
 * en el ADR) — este panel es de solo lectura, cualquier ajuste a la orden lo hace el usuario a
 * mano en el resto del formulario.
 *
 * Extraído de LogisticsPage a componente compartido (SCRUM-218, hallazgo Pre-QA/Visual Reviewer
 * 2026-08-05: REQ-148 declara su ubicación como el detalle de la orden en Ver Órdenes, donde
 * nunca se implementó) para reusarlo tal cual también en OrderDetailPage — la subida del
 * documento sigue siendo exclusiva del checklist de Logística (decisión de Luis 2026-08-06),
 * este panel nunca tuvo UI de subida, solo de validación/resultado.
 */
export default function ProviderConfirmationPanel({ orderId, doc }: { orderId: number; doc: PurchaseOrderDocument }) {
  const { t } = useTranslation(['common', 'compras'])
  const validate = useValidateProviderConfirmation()
  const { data: validation } = useProviderConfirmationValidation(orderId, doc.id, true)

  const status = validation?.status ?? null

  return (
    <div className="ml-4 mt-1 mb-1.5">
      {(status === null || status === 'failed') && (
        <Button
          variant="outline"
          className="!text-[11px] !px-2 !py-1"
          loading={validate.isPending}
          onClick={() => validate.mutate({ orderId, documentId: doc.id })}
        >
          {t('compras:logistics.providerConfirmation.validate')}
        </Button>
      )}

      {(status === 'pending' || status === 'running') && (
        <p className="text-[11px] text-slate-400">{t('compras:logistics.providerConfirmation.validating')}</p>
      )}

      {status === 'failed' && (
        <p className="text-[11px] text-red-600 mt-1">
          {validation?.error ?? t('compras:logistics.providerConfirmation.errorGeneric')}
        </p>
      )}

      {validate.isError && (
        <p className="text-[11px] text-red-600 mt-1">{t('compras:logistics.providerConfirmation.errorGeneric')}</p>
      )}

      {status === 'completed' && validation?.result && (
        <div className="mt-1 p-2 rounded bg-slate-50 border border-slate-200">
          {validation.result.matches_order ? (
            <p className="text-[11px] text-emerald-700 flex items-center gap-1">
              <IcoCheck size={11} />
              {t('compras:logistics.providerConfirmation.matches')}
            </p>
          ) : (
            <>
              <p className="text-[11px] text-amber-700 font-medium mb-1 flex items-center gap-1">
                <IcoAlertTriangle size={11} />
                {t('compras:logistics.providerConfirmation.discrepanciesTitle')}
              </p>
              <ul className="space-y-0.5">
                {validation.result.discrepancies.map((d, i) => (
                  <li key={i} className="text-[11px] text-slate-600">
                    <span className="font-medium">{t(`compras:logistics.providerConfirmation.field.${d.campo}`)}:{' '}</span>
                    {t('compras:logistics.providerConfirmation.expectedVsFound', { expected: d.esperado, found: d.encontrado })}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-[10px] text-slate-400 mt-1">
            {t('compras:logistics.providerConfirmation.confidence')}: {t(`compras:logistics.providerConfirmation.confidenceLevel.${validation.result.confidence}`)}
          </p>
          <Button
            variant="outline"
            className="!text-[11px] !px-2 !py-1 mt-1.5"
            loading={validate.isPending}
            onClick={() => validate.mutate({ orderId, documentId: doc.id })}
          >
            {t('compras:logistics.providerConfirmation.revalidate')}
          </Button>
        </div>
      )}
    </div>
  )
}
