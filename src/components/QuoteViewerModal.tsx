import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IcoClose } from '@/components/icons'

interface Props {
  quoteId: number
  onClose: () => void
}

/**
 * REQ-084: "Ver cotización" — documento de solo lectura, mismo PDF real que
 * los demás puntos de acceso (SCRUM-766, ver `QuotePdfService` en el backend
 * — una única plantilla, nunca una versión React separada que pueda divergir
 * del PDF descargado). A diferencia de la Vista Previa de Cotización-D
 * (gateada por folio), este visor se abre para cualquier fila de la tabla —
 * incluidas las que siguen en Borrador, ya que REQ-082 lista todas las
 * cotizaciones "en cualquier etapa del proceso".
 *
 * SCRUM-734 (sección 3, "quotePreviewOverlay" del ticket) — este es el modal
 * donde vive la sección "Versiones de este proyecto" y "Usar como base para
 * nueva versión" — permanecen React (nunca formaron parte del documento
 * impreso, ver §3 de SCRUM-766: la sección de Versiones no está en la spec
 * del PDF). `viewingId` es local (arranca en `quoteId`) para que "Ver esta
 * versión" navegue DENTRO del mismo modal sin cerrarlo, re-pidiendo el PDF
 * de la versión elegida.
 */
export default function QuoteViewerModal({ quoteId, onClose }: Props) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [viewingId, setViewingId] = useState(quoteId)
  const [useAsBaseError, setUseAsBaseError] = useState<string | null>(null)

  const { data: quote, isLoading } = useQuery({
    queryKey: ['ventas-diseno-quote', viewingId],
    queryFn:  () => ventasDisenoApi.quotes.get(viewingId),
  })

  const { data: pdfBlob } = useQuery({
    queryKey: ['ventas-diseno-quote-pdf', viewingId],
    queryFn:  () => ventasDisenoApi.quotes.pdf(viewingId, false),
  })
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pdfBlob])

  const { data: versionsResult } = useQuery({
    queryKey: ['ventas-diseno-quote-versions', viewingId],
    queryFn:  () => ventasDisenoApi.quotes.versions(viewingId),
    enabled:  quote?.confirmed_at != null,
  })

  // Pre-QA SCRUM-734 (hallazgo CRÍTICO, reproducido en vivo) — duplica la
  // versión de la FILA donde se clickeó "Usar como base" (versionId), nunca
  // `viewingId` a ciegas: antes de este fix, "Usar como base" de la fila de
  // v1 mientras se veía v3 en pantalla terminaba clonando v3, no v1.
  const useAsBaseMutation = useMutation({
    mutationFn: (versionId: number) => ventasDisenoApi.quotes.duplicate(versionId),
    onSuccess:  (draft) => {
      queryClient.invalidateQueries({ queryKey: ['ventas-diseno-quotes-list'] })
      onClose()
      navigate(`/ventas-diseno/quotes/${draft.id}`)
    },
    onError: (err: unknown) => {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data.message : undefined
      setUseAsBaseError(message ?? t('ventasDiseno:document.versions.useAsBaseError'))
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4 print:hidden">
      <Card variant="modal" className="w-full max-w-3xl my-4 flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {t('ventasDiseno:quotesList.viewer.title')} {quote?.folio ? `— ${quote.folio}` : ''}
          </h2>
          <Button variant="icon" onClick={onClose}><IcoClose /></Button>
        </div>

        <div className="overflow-y-auto px-5 py-4 flex-1">
          {isLoading || !quote ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : !pdfUrl ? (
            <p className="text-slate-400 text-sm">{t('common:labels.loading')}</p>
          ) : (
            <iframe
              src={pdfUrl}
              title={t('ventasDiseno:quotesList.viewer.title')}
              className="w-full h-[70vh] border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-900"
            />
          )}

          {/* SCRUM-734 (sección 3) — "Versiones de este proyecto": nunca formó parte
              del documento impreso (ver docblock del componente), se mantiene React. */}
          {versionsResult && versionsResult.versions.length >= 2 && (
            <div className="mt-4">
              <div className="text-[11px] font-bold uppercase text-slate-500 mb-2">
                {t('ventasDiseno:document.versions.title')}
              </div>
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-slate-500">
                    <th className="py-1 pr-2">{t('ventasDiseno:document.versions.version')}</th>
                    <th className="py-1 pr-2">{t('ventasDiseno:document.versions.folio')}</th>
                    <th className="py-1 pr-2">{t('ventasDiseno:document.versions.date')}</th>
                    <th className="py-1 pr-2">{t('ventasDiseno:document.versions.generatedBy')}</th>
                    <th className="py-1 pr-2 text-right">{t('ventasDiseno:document.versions.total')}</th>
                    <th className="py-1 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {versionsResult.versions.map(v => (
                    <tr key={v.id} className={`border-b border-slate-100 dark:border-slate-800 ${v.id === viewingId ? 'font-semibold' : ''}`}>
                      <td className="py-1.5 pr-2">{v.version}</td>
                      <td className="py-1.5 pr-2">{v.folio ?? '—'}</td>
                      <td className="py-1.5 pr-2">
                        {v.confirmed_at
                          ? new Date(v.confirmed_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-2">{v.generated_by}</td>
                      <td className="py-1.5 pr-2 text-right">${v.grand_total.toFixed(2)}</td>
                      <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                        {v.id !== viewingId && (
                          <button
                            type="button" className="text-xs font-semibold text-[#5BA5A0] hover:text-[#3D7E7A] mr-3"
                            onClick={() => { setUseAsBaseError(null); setViewingId(v.id) }}
                          >
                            {t('ventasDiseno:document.versions.view')}
                          </button>
                        )}
                        {/* RN2.3/2.4 — solo mientras la tarjeta siga en etapa Cotización, sobre
                            cualquier versión del historial (Pre-QA SCRUM-734: pasa v.id de esta
                            fila, nunca viewingId a ciegas). */}
                        {versionsResult.card_stage === 'quote' && (
                          <button
                            type="button" className="text-xs font-semibold text-[#5BA5A0] hover:text-[#3D7E7A] disabled:opacity-50"
                            disabled={useAsBaseMutation.isPending}
                            onClick={() => { setUseAsBaseError(null); useAsBaseMutation.mutate(v.id) }}
                          >
                            {t('ventasDiseno:document.versions.useAsBase')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {useAsBaseError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{useAsBaseError}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700 shrink-0">
          {/* SCRUM-143 — un borrador guardado no tenía forma de reabrirse: este visor
              era de solo lectura (solo "Cerrar"). Navega al mismo formulario de
              Cotización-D para continuar editando y, eventualmente, generar la
              cotización final (quitándole el estado Borrador). */}
          {quote?.document_status === 'draft' && (
            <Button variant="secondary" onClick={() => navigate(`/ventas-diseno/quotes/${viewingId}`)}>
              {t('ventasDiseno:quotesList.viewer.edit')}
            </Button>
          )}
          {/* SCRUM-796 (secc. 15) — caso especial de UNA sola versión: la sección
              "Versiones de este proyecto" de arriba no se muestra (exige >=2), así que
              acá es el único punto de entrada para crear una segunda versión. Mismo
              gate de etapa que ya usa la tabla de versiones (RN2.3/2.4) — solo mientras
              la tarjeta sigue en Cotización. Usa el id real de la única versión, nunca
              `viewingId` a ciegas (mismo cuidado que el hallazgo de Pre-QA de arriba). */}
          {quote?.confirmed_at != null && versionsResult?.versions.length === 1 && versionsResult.card_stage === 'quote' && (
            <Button
              variant="secondary"
              disabled={useAsBaseMutation.isPending}
              onClick={() => { setUseAsBaseError(null); useAsBaseMutation.mutate(versionsResult.versions[0].id) }}
            >
              {t('ventasDiseno:document.versions.newVersion')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>{t('ventasDiseno:quotesList.viewer.close')}</Button>
        </div>
      </Card>
    </div>
  )
}
