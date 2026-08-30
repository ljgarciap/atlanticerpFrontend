import { useTranslation } from 'react-i18next'
import { useGenerateMensualClienteReport, useDownloadMensualClienteExcel } from '@/hooks/useAdminContab'
import ClientCollectionReportView from './ClientCollectionReportView'

/** Batch 23 Grupo 2 (SCRUM-651→655, REQ-574→578) — "Reporte mensual por cliente" (4M1), agrupado
 *  por día. Wrapper fino sobre `ClientCollectionReportView` — ver ese archivo para el detalle. */
export default function MensualClientePage() {
  const { t } = useTranslation(['common', 'adminContab'])
  const generateMutation = useGenerateMensualClienteReport()
  const excelMutation = useDownloadMensualClienteExcel()

  return (
    <ClientCollectionReportView
      t={t}
      title={t('adminContab:reportes.mensualCliente.tituloDia')}
      subtitle={t('adminContab:reportes.mensualCliente.subtituloDia')}
      agrupacion="dia"
      generateMutation={generateMutation}
      excelMutation={excelMutation}
    />
  )
}
