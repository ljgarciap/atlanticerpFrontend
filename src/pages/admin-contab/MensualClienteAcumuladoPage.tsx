import { useTranslation } from 'react-i18next'
import { useGenerateMensualClienteAcumuladoReport, useDownloadMensualClienteAcumuladoExcel } from '@/hooks/useAdminContab'
import ClientCollectionReportView from './ClientCollectionReportView'

/** Batch 23 Grupo 2 (SCRUM-656→660, REQ-579→583) — "Mensual por cliente — acumulado" (4M2),
 *  agrupado por año-mes. Wrapper fino sobre `ClientCollectionReportView` — ver ese archivo para
 *  el detalle. */
export default function MensualClienteAcumuladoPage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const generateMutation = useGenerateMensualClienteAcumuladoReport()
  const excelMutation = useDownloadMensualClienteAcumuladoExcel()

  return (
    <ClientCollectionReportView
      t={t}
      title={t('adminContab:reportes.mensualCliente.tituloAcumulado')}
      subtitle={t('adminContab:reportes.mensualCliente.subtituloAcumulado')}
      agrupacion="mes"
      generateMutation={generateMutation}
      excelMutation={excelMutation}
    />
  )
}
