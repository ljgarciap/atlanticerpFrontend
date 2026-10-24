import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import { useAuthStore } from '@/store/authStore'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import QuotePartCard from '@/components/QuotePartCard'
import { QuotePartsApiContext } from '@/components/quote/QuotePartsApiContext'
import { formatMoney } from '@/lib/money'
import { formatDateFromTimestamp } from '@/utils/dates'
import { downloadCotizaYaPdf } from './cotizaYaPdf'

/**
 * SCRUM-1120 — detalle de una CotizaYA generada: solo lectura (una cotización generada queda fija) con descarga del PDF.
 * Reutiliza `QuotePartCard` en modo de solo lectura para mostrar las partidas con el mismo formato que Cotizaciones.
 */
export default function VentasDisenoCotizaYaDetailPage() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const navigate = useNavigate()
  const { id } = useParams()
  const quoteId = Number(id)
  const user = useAuthStore(s => s.user)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState(false)

  const { data: quote, isLoading, isError } = useQuery({
    queryKey: ['ventas-diseno-quote', quoteId],
    queryFn:  () => ventasDisenoApi.cotizaya.get(quoteId),
    enabled:  Number.isFinite(quoteId),
  })

  async function handlePdf() {
    if (!quote?.folio) return
    setPdfBusy(true)
    setPdfError(false)
    try {
      await downloadCotizaYaPdf(quote.id, quote.folio)
    } catch {
      setPdfError(true)
    } finally {
      setPdfBusy(false)
    }
  }

  if (isLoading) return <p className="text-slate-400 text-sm">{t('common:loading')}</p>
  if (isError || !quote) return <p role="alert" className="text-red-600 text-sm">{t('ventasDiseno:cotizaya.detail.loadError')}</p>

  const customer = quote.cotizaya?.customer_name || 'CotizaYA'

  return (
    <QuotePartsApiContext.Provider value={ventasDisenoApi.cotizaya.parts}>
      <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
        <div>
          <button onClick={() => navigate('/ventas-diseno/cotizaya')} className="text-[12px] text-[#3D7E7A] mb-1">
            ← {t('ventasDiseno:cotizaya.detail.back')}
          </button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {quote.folio ?? t('ventasDiseno:cotizaya.title')}
          </h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">{t('ventasDiseno:cotizaya.detail.fixed')}</p>
        </div>
        <Button variant="primary" data-testid="cotizaya-detail-pdf" onClick={handlePdf} disabled={pdfBusy || !quote.folio} loading={pdfBusy}>
          {t('ventasDiseno:cotizaya.detail.downloadPdf')}
        </Button>
      </div>

      {pdfError && (
        <div role="alert" data-testid="cotizaya-pdf-error" className="mb-3 px-3 py-2 rounded-lg border text-[12.5px] bg-red-50 border-red-200 text-red-700">
          {t('ventasDiseno:cotizaya.pdfError')}
        </div>
      )}

      <Card variant="panel" className="p-4 mb-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-[11px] uppercase font-bold text-slate-500">{t('ventasDiseno:cotizaya.detail.customer')}</dt><dd data-testid="cotizaya-detail-customer">{customer}</dd></div>
          <div><dt className="text-[11px] uppercase font-bold text-slate-500">{t('ventasDiseno:cotizaya.detail.phone')}</dt><dd>{quote.cotizaya?.customer_phone || '—'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-[11px] uppercase font-bold text-slate-500">{t('ventasDiseno:cotizaya.detail.description')}</dt><dd>{quote.description || '—'}</dd></div>
          <div><dt className="text-[11px] uppercase font-bold text-slate-500">{t('ventasDiseno:cotizaya.detail.designer')}</dt><dd>{quote.owner.name}</dd></div>
          <div><dt className="text-[11px] uppercase font-bold text-slate-500">{t('ventasDiseno:cotizaya.detail.date')}</dt><dd>{quote.generated_at ? formatDateFromTimestamp(quote.generated_at) : '—'}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase font-bold text-slate-500">{t('ventasDiseno:cotizaya.detail.contacts')}</dt>
            <dd>{quote.contacts.length === 0 ? t('ventasDiseno:cotizaya.form.noContacts') : quote.contacts.map(c => c.name).join(', ')}</dd>
          </div>
          {quote.observations && (
            <div className="sm:col-span-2"><dt className="text-[11px] uppercase font-bold text-slate-500">{t('ventasDiseno:cotizaya.detail.observations')}</dt><dd className="whitespace-pre-line">{quote.observations}</dd></div>
          )}
        </dl>
      </Card>

      <Card variant="panel" className="p-4 mb-4">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-3">{t('ventasDiseno:cotizaya.detail.parts')}</h2>
        {quote.parts.map(part => (
          <QuotePartCard
            key={part.id} quoteId={quote.id} part={part}
            discountMode={quote.discount_mode} canEdit={false}
            canSeeCost={user?.modules?.ventas_diseno?.view_team === true}
            minMarginPercent={quote.min_margin_percent} quotePriceType={quote.price_type}
          />
        ))}
        <dl className="max-w-xs ml-auto text-sm space-y-1 mt-3">
          <div className="flex justify-between"><dt>{t('ventasDiseno:cotizaya.form.subtotal')}</dt><dd>${formatMoney(quote.subtotal)}</dd></div>
          <div className="flex justify-between"><dt>{t('ventasDiseno:cotizaya.form.itbms')}</dt><dd>${formatMoney(quote.itbms)}</dd></div>
          <div className="flex justify-between font-bold border-t border-slate-200 dark:border-slate-700 pt-1"><dt>{t('ventasDiseno:cotizaya.form.total')}</dt><dd data-testid="cotizaya-detail-total">${formatMoney(quote.grand_total)}</dd></div>
        </dl>
      </Card>

      <Card variant="panel" className="p-4 mb-4">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-2">{t('ventasDiseno:cotizaya.detail.conditions')}</h2>
        <p className="text-sm whitespace-pre-line text-slate-700 dark:text-slate-300">{quote.conditions_text}</p>
      </Card>
    </QuotePartsApiContext.Provider>
  )
}
