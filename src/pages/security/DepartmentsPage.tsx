import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { departmentsApi, type DepartmentItem } from '@/api/departmentsApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoChevronLeft, IcoChevronRight } from '@/components/icons'

const schema = z.object({ name: z.string().min(1).max(100) })
type FormData = z.infer<typeof schema>

interface InlineFormProps {
  dept:    DepartmentItem | null
  onClose: () => void
}

function DepartmentForm({ dept, onClose }: InlineFormProps) {
  const { t }   = useTranslation(['common', 'security'])
  const qc      = useQueryClient()
  const isEdit  = dept !== null

  const save = useMutation({
    mutationFn: (data: FormData) =>
      isEdit && dept
        ? departmentsApi.update(dept.id, data.name)
        : departmentsApi.create(data.name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); onClose() },
  })

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: dept?.name ?? '' },
  })

  return (
    <form onSubmit={handleSubmit(d => save.mutate(d))}
      className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700">
      <input
        {...register('name')}
        autoFocus
        placeholder={t('security:departments.form.name')}
        className={`flex-1 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition
          ${errors.name ? 'border-red-400' : 'border-slate-300 focus:ring-primary/20 focus:border-primary'}`}
      />
      <Button type="submit" variant="primary" disabled={save.isPending} className="!px-3 !py-1.5 !text-xs">
        {save.isPending ? '…' : t('common:actions.save')}
      </Button>
      <Button type="button" variant="secondary" onClick={onClose} className="!px-3 !py-1.5 !text-xs">
        {t('common:actions.cancel')}
      </Button>
      {save.isError && (
        <span className="text-red-500 text-xs">{t('common:messages.saveError')}</span>
      )}
    </form>
  )
}

export default function DepartmentsPage() {
  const { t }  = useTranslation(['common', 'security'])
  const qc     = useQueryClient()
  const [search,  setSearch]  = useState('')
  const [query,   setQuery]   = useState('')
  const [page,    setPage]    = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [form,    setForm]    = useState<DepartmentItem | null | false>(false)

  const { data, isFetching } = useQuery({
    queryKey: ['departments', { page, perPage, query }],
    queryFn:  () => departmentsApi.list({ page, per_page: perPage, search: query }),
  })

  const toggleStatus = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      departmentsApi.toggleStatus(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  })

  const departments = data?.data ?? []
  const meta        = data?.meta
  const lastPage    = meta?.last_page ?? 1

  const handleSearch = () => { setQuery(search); setPage(1) }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-slate-900">{t('security:departments.title')}</h1>
        <Button onClick={() => setForm(null)}>
          {t('security:departments.actions.create')}
        </Button>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t('common:labels.searchByName')}
          className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <Button variant="outline" onClick={handleSearch}>
          {t('common:actions.search')}
        </Button>
      </div>

      {/* Table */}
      <Card variant="panel" className="overflow-hidden">
        {form === null && (
          <DepartmentForm dept={null} onClose={() => setForm(false)} />
        )}

        {isFetching && !data && (
          <div className="p-10 text-center text-slate-400 text-sm">{t('common:labels.loading')}</div>
        )}

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/40 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="px-4 py-3">{t('security:departments.table.columns.name')}</th>
              <th className="px-4 py-3">{t('security:departments.table.columns.status')}</th>
              <th className="px-4 py-3">{t('security:departments.table.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {departments.length === 0 && !isFetching && (
              <tr><td colSpan={3} className="text-center py-10 text-slate-400 text-sm">{t('security:departments.table.empty')}</td></tr>
            )}
            {departments.map(dept => (
              <>
                <tr key={dept.id} className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{dept.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      dept.is_active
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      {dept.is_active ? t('common:labels.active') : t('common:labels.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="!px-2.5 !py-1 !text-xs"
                        onClick={() => setForm(form !== false && form !== null && form.id === dept.id ? false : dept)}
                      >
                        {t('common:actions.edit')}
                      </Button>
                      <button
                        onClick={() => toggleStatus.mutate({ id: dept.id, is_active: !dept.is_active })}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                          dept.is_active
                            ? 'border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                            : 'border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                        }`}>
                        {dept.is_active ? t('common:actions.deactivate') : t('common:actions.activate')}
                      </button>
                    </div>
                  </td>
                </tr>
                {form !== false && form !== null && form.id === dept.id && (
                  <tr key={`edit-${dept.id}`}>
                    <td colSpan={3} className="p-0">
                      <DepartmentForm dept={dept} onClose={() => setForm(false)} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Pagination */}
      {meta && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {t('common:pagination.showing', {
                from:  meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1,
                to:    Math.min(meta.current_page * meta.per_page, meta.total),
                total: meta.total,
              })}
            </span>
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1) }}
              className="px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white">
              {[5, 10, 20, 50].map(n => (
                <option key={n} value={n}>{n} {t('common:pagination.perPage')}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              className="!px-3 !py-1.5 !text-xs"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <IcoChevronLeft size={13} />
            </Button>
            {Array.from({ length: Math.min(lastPage, 7) }, (_, i) => {
              const pg = page <= 4 ? i + 1 : page - 3 + i
              if (pg < 1 || pg > lastPage) return null
              return (
                <Button
                  key={pg}
                  variant="outline"
                  active={pg === page}
                  className="!px-3 !py-1.5 !text-xs"
                  onClick={() => setPage(pg)}
                >
                  {pg}
                </Button>
              )
            })}
            <Button
              variant="outline"
              className="!px-3 !py-1.5 !text-xs"
              disabled={page >= lastPage}
              onClick={() => setPage(p => Math.min(lastPage, p + 1))}
            >
              <IcoChevronRight size={13} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
