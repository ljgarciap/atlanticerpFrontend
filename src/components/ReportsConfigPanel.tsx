import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ventasDisenoApi } from '@/api/ventasDisenoApi'
import type { SalesGoalRow, ReportSettingsValue } from '@/types/ventasDiseno'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { sanitizeUnsignedDecimalInput } from '@/lib/decimalInput'

function mutationErrorMessage(err: unknown, fallback: string): string {
  const data = isAxiosError<{ message?: string; errors?: Record<string, string[]> }>(err) ? err.response?.data : undefined
  const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
  return firstFieldError ?? data?.message ?? fallback
}

function GoalRow({ row }: { row: SalesGoalRow }) {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()
  const [goal,     setGoal]     = useState(row.goal_amount != null ? String(row.goal_amount) : '')
  const [goalPlus, setGoalPlus] = useState(row.goal_plus_amount != null ? String(row.goal_plus_amount) : '')
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = goal !== (row.goal_amount != null ? String(row.goal_amount) : '')
    || goalPlus !== (row.goal_plus_amount != null ? String(row.goal_plus_amount) : '')

  const saveMutation = useMutation({
    mutationFn: () => ventasDisenoApi.reports.goals.upsert(row.user_id, {
      goal_amount: Number(goal) || 0,
      goal_plus_amount: goalPlus ? Number(goalPlus) : null,
    }),
    onSuccess: () => {
      setError(null)
      setJustSaved(true)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-reports-goals'] })
      // Bug real encontrado en verificación E2E: sin esto, el gráfico de Metas y
      // el resto de los paneles que dependen de la Meta seguían mostrando "Sin
      // Meta configurada" hasta un F5 manual — invalidateQueries usa match por
      // prefijo, así que esto alcanza a todas las variantes scope/period.
      qc.invalidateQueries({ queryKey: ['ventas-diseno-reports-summary'] })
    },
    // Pre-QA 2026-07-16: sin esto, un 422 del backend (ej. Meta que excede el
    // máximo permitido) se perdía en silencio — el botón dejaba de cargar y
    // el usuario no tenía forma de saber por qué no se guardó.
    onError: (err: unknown) => setError(mutationErrorMessage(err, t('ventasDiseno:modal.createError'))),
  })

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-1.5 pr-2 text-sm">{row.user_name}</td>
      <td className="py-1.5 pr-2">
        <input
          type="text" inputMode="decimal" value={goal}
          onChange={e => { setGoal(sanitizeUnsignedDecimalInput(e.target.value)); setJustSaved(false); setError(null) }}
          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </td>
      <td className="py-1.5 pr-2">
        <input
          type="text" inputMode="decimal" value={goalPlus}
          onChange={e => { setGoalPlus(sanitizeUnsignedDecimalInput(e.target.value)); setJustSaved(false); setError(null) }}
          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </td>
      <td className="py-1.5">
        {dirty && (
          <Button variant="secondary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            {t('ventasDiseno:reports.config.save')}
          </Button>
        )}
        {!dirty && justSaved && <span className="text-[11px] text-emerald-600">{t('ventasDiseno:reports.config.saved')}</span>}
        {error && <span className="text-[11px] text-red-500">{error}</span>}
      </td>
    </tr>
  )
}

export default function ReportsConfigPanel() {
  const { t } = useTranslation(['common', 'ventasDiseno'])
  const qc = useQueryClient()

  const { data: goals } = useQuery({
    queryKey: ['ventas-diseno-reports-goals'],
    queryFn:  () => ventasDisenoApi.reports.goals.list(),
  })

  const { data: settings } = useQuery({
    queryKey: ['ventas-diseno-report-settings'],
    queryFn:  () => ventasDisenoApi.reports.settings.get(),
  })

  const [threshold, setThreshold]       = useState('')
  const [months, setMonths]             = useState('')
  const [quoteProb, setQuoteProb]       = useState('')
  const [proposalProb, setProposalProb] = useState('')
  const [settingsError, setSettingsError] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    setThreshold(String(settings.low_sales_threshold))
    setMonths(String(settings.low_sales_months))
    setQuoteProb(String(settings.quote_probability_percent))
    setProposalProb(String(settings.proposal_probability_percent))
  }, [settings])

  const settingsMutation = useMutation({
    mutationFn: (data: Partial<ReportSettingsValue>) => ventasDisenoApi.reports.settings.update(data),
    onSuccess: () => {
      setSettingsError(null)
      qc.invalidateQueries({ queryKey: ['ventas-diseno-report-settings'] })
      // Mismo bug que en GoalRow — Top de vendedores/Forecast usan estos valores.
      qc.invalidateQueries({ queryKey: ['ventas-diseno-reports-summary'] })
      qc.invalidateQueries({ queryKey: ['ventas-diseno-commissions'] })
    },
    onError: (err: unknown) => setSettingsError(mutationErrorMessage(err, t('ventasDiseno:modal.createError'))),
  })

  const settingsDirty = settings != null && (
    threshold !== String(settings.low_sales_threshold)
    || months !== String(settings.low_sales_months)
    || quoteProb !== String(settings.quote_probability_percent)
    || proposalProb !== String(settings.proposal_probability_percent)
  )

  return (
    <Card variant="panel" className="p-4 mb-3">
      <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">
        {t('ventasDiseno:reports.config.goalsTitle')}
      </h3>
      <p className="text-[12px] text-slate-400 mb-3">{t('ventasDiseno:reports.config.goalsSub')}</p>
      <table className="w-full text-left mb-5">
        <thead>
          <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <th className="pb-1.5">{t('ventasDiseno:reports.config.vendor')}</th>
            <th className="pb-1.5">{t('ventasDiseno:reports.config.goal')}</th>
            <th className="pb-1.5">{t('ventasDiseno:reports.config.goalPlus')}</th>
            <th className="pb-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {(goals ?? []).map(row => <GoalRow key={row.user_id} row={row} />)}
        </tbody>
      </table>

      <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-3">
        {t('ventasDiseno:reports.config.settingsTitle')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('ventasDiseno:reports.config.lowSalesThreshold')}
          </label>
          <input type="number" value={threshold} onChange={e => setThreshold(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('ventasDiseno:reports.config.lowSalesMonths')}
          </label>
          <input type="number" value={months} onChange={e => setMonths(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('ventasDiseno:reports.config.quoteProbability')}
          </label>
          <input type="number" value={quoteProb} onChange={e => setQuoteProb(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
            {t('ventasDiseno:reports.config.proposalProbability')}
          </label>
          <input type="number" value={proposalProb} onChange={e => setProposalProb(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
      </div>
      {settingsDirty && (
        <Button
          onClick={() => settingsMutation.mutate({
            low_sales_threshold: Number(threshold), low_sales_months: Number(months),
            quote_probability_percent: Number(quoteProb), proposal_probability_percent: Number(proposalProb),
          })}
          loading={settingsMutation.isPending}
        >
          {t('ventasDiseno:reports.config.save')}
        </Button>
      )}
      {settingsError && <p className="text-xs text-red-500 mt-2">{settingsError}</p>}
    </Card>
  )
}
