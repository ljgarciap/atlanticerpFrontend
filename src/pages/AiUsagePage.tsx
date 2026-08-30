import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAiUsage } from '@/hooks/useAiUsage'
import { Card } from '@/components/ui/Card'
import { Pagination } from '@/components/ui/Pagination'

function formatCost(value: number | null): string {
  if (value === null) return '—'
  return `$${value.toFixed(4)}`
}

function formatTokens(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString()
}

export default function AiUsagePage() {
  const { t } = useTranslation(['aiUsage', 'common'])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number | 'all'>(20)

  const { data, isFetching } = useAiUsage({ page, per_page: perPage })
  const entries = data?.data ?? []
  const totals  = data?.totals

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('aiUsage:title')}</h1>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('aiUsage:subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <Card variant="panel" className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
            {t('aiUsage:totals.currentMonth')}
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatCost(totals?.current_month.estimated_cost_usd ?? null)}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {t('aiUsage:totals.tokens', {
                input:  formatTokens(totals?.current_month.input_tokens ?? null),
                output: formatTokens(totals?.current_month.output_tokens ?? null),
              })}
            </span>
          </div>
        </Card>
        <Card variant="panel" className="p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
            {t('aiUsage:totals.allTime')}
          </p>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatCost(totals?.all_time.estimated_cost_usd ?? null)}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {t('aiUsage:totals.tokens', {
                input:  formatTokens(totals?.all_time.input_tokens ?? null),
                output: formatTokens(totals?.all_time.output_tokens ?? null),
              })}
            </span>
          </div>
        </Card>
      </div>

      <Card variant="panel" className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-700 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <th className="px-4 py-2 font-semibold">{t('aiUsage:table.date')}</th>
              <th className="px-4 py-2 font-semibold">{t('aiUsage:table.requestedBy')}</th>
              <th className="px-4 py-2 font-semibold">{t('aiUsage:table.module')}</th>
              <th className="px-4 py-2 font-semibold">{t('aiUsage:table.document')}</th>
              <th className="px-4 py-2 font-semibold">{t('aiUsage:table.model')}</th>
              <th className="px-4 py-2 font-semibold text-right">{t('aiUsage:table.tokens')}</th>
              <th className="px-4 py-2 font-semibold text-right">{t('aiUsage:table.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {!isFetching && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500 text-sm">
                  {t('aiUsage:empty')}
                </td>
              </tr>
            )}
            {entries.map(entry => (
              <tr key={entry.id} className="border-b border-slate-50 dark:border-slate-700/60 last:border-0">
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">
                  {new Date(entry.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">
                  {entry.requested_by?.name ?? t('aiUsage:unknownUser')}
                </td>
                <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{entry.analysis_label}</td>
                <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 truncate max-w-[180px]" title={entry.document_name ?? undefined}>
                  {entry.document_name ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">{entry.model}</td>
                <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400 font-mono text-xs">
                  {formatTokens(entry.input_tokens)} / {formatTokens(entry.output_tokens)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200">
                  {formatCost(entry.estimated_cost_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data?.meta && (
        <Pagination
          meta={data.meta}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={value => { setPerPage(value); setPage(1) }}
        />
      )}
    </div>
  )
}
