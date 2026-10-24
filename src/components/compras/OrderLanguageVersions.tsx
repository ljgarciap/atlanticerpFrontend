import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useOpenPurchaseOrderPdf, useTranslatePurchaseOrder } from '@/hooks/useCompras'
import { formatDateFromTimestamp } from '@/utils/dates'
import type { OrderTranslationStatus, OrderDocLang } from '@/types/compras'

interface Props {
  orderId:     number
  includeCost: boolean
  /** Estado de la versión en inglés (viene en el detalle de la orden). */
  english:     OrderTranslationStatus | undefined
  /** Generar la versión en inglés llama a la IA: solo quien puede escribir en Compras. */
  canGenerate: boolean
}

/**
 * SCRUM-1127 — las dos versiones de la orden de compra. El español es el documento de siempre; el inglés NO es una regla de la orden: se
 * genera a pedido, queda guardado y se puede ver o descargar cuando se quiera. El idioma del correo se elige aparte, al enviar.
 */
export function OrderLanguageVersions({ orderId, includeCost, english, canGenerate }: Props) {
  const { t } = useTranslation()
  const openPdf = useOpenPurchaseOrderPdf()
  const translate = useTranslatePurchaseOrder()

  const hasEnglish = english?.exists === true
  const stale = hasEnglish && english?.stale === true
  const englishReady = hasEnglish && !stale

  function open(lang: OrderDocLang, mode: 'view' | 'download') {
    // Abrir la ventana sincrónico, atado al click (si no, el navegador bloquea el popup). La descarga no necesita ventana.
    const targetWindow = mode === 'view' ? window.open('', '_blank') : null
    openPdf.mutate({ id: orderId, includeCost, lang, mode, targetWindow })
  }

  // El backend responde con un mensaje apto para el usuario (409 sin versión/desactualizada, 503 si la IA falló o tardó).
  const translateError = translate.isError
    ? (isAxiosError(translate.error) && typeof translate.error.response?.data?.message === 'string'
        ? (translate.error.response.data.message as string)
        : t('compras:orders.languages.generateFailed'))
    : null

  return (
    <Card variant="panel" className="p-5 mb-6" data-testid="order-language-versions">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">{t('compras:orders.languages.title')}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('compras:orders.languages.spanish')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => open('es', 'view')}>{t('compras:orders.languages.view')}</Button>
            <Button variant="outline" onClick={() => open('es', 'download')}>{t('compras:orders.languages.download')}</Button>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('compras:orders.languages.english')}</p>
          {englishReady && (
            <p className="text-xs text-slate-500 mb-2">
              {t('compras:orders.languages.generatedAt', { date: english?.generated_at ? formatDateFromTimestamp(english.generated_at) : '' })}
            </p>
          )}
          {stale && <p className="text-xs text-amber-600 mb-2">{t('compras:orders.languages.stale')}</p>}
          {!hasEnglish && <p className="text-xs text-slate-500 mb-2">{t('compras:orders.languages.notGenerated')}</p>}

          <div className="flex flex-wrap gap-2">
            {englishReady && (
              <>
                <Button variant="outline" onClick={() => open('en', 'view')}>{t('compras:orders.languages.view')}</Button>
                <Button variant="outline" onClick={() => open('en', 'download')}>{t('compras:orders.languages.download')}</Button>
              </>
            )}
            {canGenerate && (
              <Button
                variant={englishReady ? 'ghost' : 'primary'}
                loading={translate.isPending}
                disabled={translate.isPending}
                onClick={() => translate.mutate(orderId)}
              >
                {translate.isPending
                  ? t('compras:orders.languages.translating')
                  : englishReady || stale
                    ? t('compras:orders.languages.regenerate')
                    : t('compras:orders.languages.generate')}
              </Button>
            )}
          </div>

          {translateError && (
            <p role="alert" className="text-xs text-red-600 mt-2">
              {translateError} {t('compras:orders.languages.useSpanishInstead')}
            </p>
          )}
          {openPdf.isError && (
            <p role="alert" className="text-xs text-red-600 mt-2">{t('compras:orders.languages.openFailed')}</p>
          )}
        </div>
      </div>
    </Card>
  )
}
