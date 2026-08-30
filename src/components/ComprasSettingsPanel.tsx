import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { useComprasSettings, useUpdateComprasSettings } from '@/hooks/useCompras'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

function mutationErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
  const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  return firstFieldError ?? data?.message ?? fallback
}

/**
 * SCRUM-184 (REQ-121) — hallazgo MEDIO de Pre-QA 2026-07-16: `low_rating_threshold` ya era
 * paramétrico en el backend (`compras_settings`) y el permiso `compras.settings.configure` ya
 * estaba concedido de verdad a Yirena Teng vía SpecialPermissionSeeder, pero no existía ninguna
 * pantalla para usarlo — solo API a mano. Mismo patrón que
 * `PricingSettingsPanel`/`ReportsConfigPanel` (Ventas & Diseño): panel colapsable dentro de la
 * página, gateado por permiso, sin ruta nueva.
 */
export default function ComprasSettingsPanel() {
  const { t } = useTranslation(['common', 'compras'])

  const { data: settings } = useComprasSettings()
  const mutation = useUpdateComprasSettings()

  const [threshold, setThreshold] = useState('')
  // SCRUM-257 (REQ-194) — hallazgo de QA: `claim_attention_days` ya era paramétrico en el
  // backend (`compras_settings`) pero no tenía ninguna pantalla para verlo/ajustarlo, mismo gap
  // que `low_rating_threshold` tenía antes de este panel.
  const [attentionDays, setAttentionDays] = useState('')
  // SCRUM-247 (REQ-184) — umbral de margen del sustituto, mismo patrón que los 2 de arriba.
  const [marginThreshold, setMarginThreshold] = useState('')
  // Lote 4 (SCRUM-246) — pesos de la fórmula de "% de similitud" y umbral mínimo de candidato.
  // Existían en el backend desde 2026-08-17 sin ningún campo acá — gap real encontrado por Luis
  // (superadmin, 2026-08-22), mismo patrón que los 3 campos de arriba.
  const [weightText, setWeightText] = useState('')
  const [weightPrice, setWeightPrice] = useState('')
  const [weightMargin, setWeightMargin] = useState('')
  const [otherCategoryPenalty, setOtherCategoryPenalty] = useState('')
  const [minThreshold, setMinThreshold] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    setThreshold(String(settings.low_rating_threshold))
    setAttentionDays(String(settings.claim_attention_days))
    setMarginThreshold(String(settings.replacement_margin_threshold))
    setWeightText(String(settings.similarity_weight_text))
    setWeightPrice(String(settings.similarity_weight_price))
    setWeightMargin(String(settings.similarity_weight_margin))
    setOtherCategoryPenalty(String(settings.similarity_other_category_penalty))
    setMinThreshold(String(settings.similarity_min_threshold))
  }, [settings])

  const dirty = settings != null && (
    threshold !== String(settings.low_rating_threshold)
    || attentionDays !== String(settings.claim_attention_days)
    || marginThreshold !== String(settings.replacement_margin_threshold)
    || weightText !== String(settings.similarity_weight_text)
    || weightPrice !== String(settings.similarity_weight_price)
    || weightMargin !== String(settings.similarity_weight_margin)
    || otherCategoryPenalty !== String(settings.similarity_other_category_penalty)
    || minThreshold !== String(settings.similarity_min_threshold)
  )

  const parsed = Number(threshold)
  // Validación básica en el cliente — el backend exige numeric|min:0|max:100 (mismo rango que la
  // calificación de proveedores, 0-100), esto solo evita un roundtrip inútil para el caso obvio.
  const invalid = threshold.trim() === '' || Number.isNaN(parsed) || parsed < 0 || parsed > 100

  const parsedDays = Number(attentionDays)
  const daysInvalid = attentionDays.trim() === '' || !Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365

  const parsedMargin = Number(marginThreshold)
  const marginInvalid = marginThreshold.trim() === '' || Number.isNaN(parsedMargin) || parsedMargin < 0 || parsedMargin > 100

  const parsedWeightText = Number(weightText)
  const parsedWeightPrice = Number(weightPrice)
  const parsedWeightMargin = Number(weightMargin)
  const parsedOtherCategoryPenalty = Number(otherCategoryPenalty)
  const parsedMinThreshold = Number(minThreshold)
  const similarityFieldInvalid = (v: number, raw: string) => raw.trim() === '' || Number.isNaN(v) || v < 0 || v > 100
  const similarityInvalid = similarityFieldInvalid(parsedWeightText, weightText)
    || similarityFieldInvalid(parsedWeightPrice, weightPrice)
    || similarityFieldInvalid(parsedWeightMargin, weightMargin)
    || similarityFieldInvalid(parsedOtherCategoryPenalty, otherCategoryPenalty)
    || similarityFieldInvalid(parsedMinThreshold, minThreshold)
  // Los 3 pesos deben sumar 100 (ver docblock de la migración) — aviso, no bloquea el guardado:
  // el backend tampoco lo exige a nivel de validación, así que no se inventa acá un gate más
  // estricto que el que ya existe.
  const weightsSum = parsedWeightText + parsedWeightPrice + parsedWeightMargin
  const weightsSumOffBy100 = !similarityInvalid && Math.round(weightsSum) !== 100

  const handleSave = () => {
    if (invalid || daysInvalid || marginInvalid || similarityInvalid) {
      setError(t('compras:settings.invalid'))
      return
    }
    setError(null)
    mutation.mutate({
      low_rating_threshold: parsed, claim_attention_days: parsedDays,
      replacement_margin_threshold: parsedMargin,
      similarity_weight_text: parsedWeightText, similarity_weight_price: parsedWeightPrice,
      similarity_weight_margin: parsedWeightMargin,
      similarity_other_category_penalty: parsedOtherCategoryPenalty,
      similarity_min_threshold: parsedMinThreshold,
    }, {
      onError: (err: unknown) => setError(mutationErrorMessage(err, t('compras:settings.saveError'))),
    })
  }

  return (
    <Card variant="panel" className="p-4 mb-3">
      <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
        {t('compras:settings.title')}
      </h3>
      <p className="text-[12px] text-slate-400 mb-3">{t('compras:settings.subtitle')}</p>

      <div className="max-w-xs mb-3">
        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
          {t('compras:settings.lowRatingThreshold')}
        </label>
        <input
          type="number"
          min={0}
          max={100}
          value={threshold}
          onChange={e => { setThreshold(e.target.value); setError(null) }}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="max-w-xs mb-3">
        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
          {t('compras:settings.claimAttentionDays')}
        </label>
        <input
          type="number"
          min={1}
          max={365}
          value={attentionDays}
          onChange={e => { setAttentionDays(e.target.value); setError(null) }}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="max-w-xs mb-3">
        <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
          {t('compras:settings.replacementMarginThreshold')}
        </label>
        <input
          type="number"
          min={0}
          max={100}
          value={marginThreshold}
          onChange={e => { setMarginThreshold(e.target.value); setError(null) }}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="mb-3 pt-2 border-t border-slate-100 dark:border-slate-700">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
          {t('compras:settings.similarityFormula')}
        </h4>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">{t('compras:settings.similarityWeightText')}</label>
            <input type="number" min={0} max={100} value={weightText}
              onChange={e => { setWeightText(e.target.value); setError(null) }}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">{t('compras:settings.similarityWeightPrice')}</label>
            <input type="number" min={0} max={100} value={weightPrice}
              onChange={e => { setWeightPrice(e.target.value); setError(null) }}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">{t('compras:settings.similarityWeightMargin')}</label>
            <input type="number" min={0} max={100} value={weightMargin}
              onChange={e => { setWeightMargin(e.target.value); setError(null) }}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">{t('compras:settings.similarityOtherCategoryPenalty')}</label>
            <input type="number" min={0} max={100} value={otherCategoryPenalty}
              onChange={e => { setOtherCategoryPenalty(e.target.value); setError(null) }}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">{t('compras:settings.similarityMinThreshold')}</label>
            <input type="number" min={0} max={100} value={minThreshold}
              onChange={e => { setMinThreshold(e.target.value); setError(null) }}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
        </div>
        {weightsSumOffBy100 && (
          <p className="text-[11px] text-amber-600 mt-2">{t('compras:settings.similarityWeightsSumWarning', { sum: weightsSum })}</p>
        )}
      </div>

      {dirty && (
        <Button onClick={handleSave} loading={mutation.isPending} disabled={invalid || daysInvalid || marginInvalid || similarityInvalid}>
          {t('common:actions.save')}
        </Button>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </Card>
  )
}
