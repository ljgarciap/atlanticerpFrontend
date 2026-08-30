import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  notificationRulesApi,
  type NotificationRule,
  type NotificationRulePayload,
  type Operator,
  type RecipientType,
  type Channel,
} from '@/api/notificationRulesApi'
import { usersApi } from '@/api/usersApi'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const ROLES = ['superadmin', 'management', 'designer', 'supervisor', 'electrician']
const OPERATORS_NEEDING_VALUE: Operator[] = ['changed_to', 'equals', 'gt', 'lt', 'gte', 'lte']

const EMPTY_FORM: NotificationRulePayload = {
  name: '',
  trigger_type: 'model_event',
  trigger_model: '',
  trigger_event: 'updated',
  field: null,
  operator: null,
  value: '',
  channels: ['in_app'],
  recipient_type: 'user',
  recipient_value: [],
  is_active: true,
}

interface FormProps {
  rule:    NotificationRule | null
  models:  Record<string, string[]>
  onClose: () => void
}

function RuleForm({ rule, models, onClose }: FormProps) {
  const { t } = useTranslation(['common', 'security'])
  const qc    = useQueryClient()
  const isEdit = rule !== null

  const [form, setForm] = useState<NotificationRulePayload>(
    rule ? {
      name: rule.name,
      trigger_type: rule.trigger_type,
      trigger_model: rule.trigger_model ?? '',
      trigger_event: rule.trigger_event ?? 'updated',
      field: rule.field,
      operator: rule.operator,
      value: rule.value ?? '',
      channels: rule.channels,
      recipient_type: rule.recipient_type,
      recipient_value: rule.recipient_value ?? [],
      is_active: rule.is_active,
    } : EMPTY_FORM,
  )

  const { data: usersResp } = useQuery({
    queryKey: ['users', 'for-rule-picker'],
    queryFn:  () => usersApi.list({ per_page: 100, is_active: true }),
    enabled:  form.recipient_type === 'user',
  })
  const users = usersResp?.data ?? []

  const save = useMutation({
    mutationFn: () => isEdit
      ? notificationRulesApi.update(rule.id, form)
      : notificationRulesApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-rules'] }); onClose() },
  })

  const fields = models[form.trigger_model] ?? []

  const toggleChannel = (ch: Channel) => {
    setForm(f => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter(c => c !== ch) : [...f.channels, ch],
    }))
  }

  const toggleRecipientValue = (v: string) => {
    const current = Array.isArray(form.recipient_value) ? form.recipient_value as (string | number)[] : []
    const exists  = current.includes(v)
    setForm(f => ({ ...f, recipient_value: exists ? current.filter(x => x !== v) : [...current, v] }))
  }

  return (
    <Card variant="panel" className="p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            {t('security:notificationRules.form.name')}
          </label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder={t('security:notificationRules.form.namePlaceholder')}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            {t('security:notificationRules.form.model')}
          </label>
          <select
            value={form.trigger_model}
            onChange={e => setForm(f => ({ ...f, trigger_model: e.target.value, field: null, operator: null }))}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800">
            <option value="">{t('common:labels.selectOption')}</option>
            {Object.keys(models).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            {t('security:notificationRules.form.event')}
          </label>
          <select
            value={form.trigger_event}
            onChange={e => setForm(f => ({ ...f, trigger_event: e.target.value as 'created' | 'updated' }))}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800">
            <option value="created">{t('security:notificationRules.events.created')}</option>
            <option value="updated">{t('security:notificationRules.events.updated')}</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            {t('security:notificationRules.form.field')}
          </label>
          <select
            value={form.field ?? ''}
            onChange={e => setForm(f => ({ ...f, field: e.target.value || null, operator: e.target.value ? f.operator : null }))}
            disabled={!form.trigger_model}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 disabled:opacity-50">
            <option value="">{t('security:notificationRules.form.anyEvent')}</option>
            {fields.map(fld => <option key={fld} value={fld}>{fld}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            {t('security:notificationRules.form.operator')}
          </label>
          <select
            value={form.operator ?? ''}
            onChange={e => setForm(f => ({ ...f, operator: (e.target.value || null) as Operator | null }))}
            disabled={!form.field}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 disabled:opacity-50">
            <option value="">{t('common:labels.selectOption')}</option>
            <option value="changed">changed</option>
            <option value="changed_to">changed_to</option>
            <option value="equals">equals</option>
            <option value="gt">gt</option>
            <option value="lt">lt</option>
            <option value="gte">gte</option>
            <option value="lte">lte</option>
          </select>
        </div>

        {form.operator && OPERATORS_NEEDING_VALUE.includes(form.operator) && (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t('security:notificationRules.form.value')}
            </label>
            <input
              value={String(form.value ?? '')}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            {t('security:notificationRules.form.recipientType')}
          </label>
          <select
            value={form.recipient_type}
            onChange={e => setForm(f => ({ ...f, recipient_type: e.target.value as RecipientType, recipient_value: [] }))}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800">
            <option value="user">{t('security:notificationRules.recipientTypes.user')}</option>
            <option value="role">{t('security:notificationRules.recipientTypes.role')}</option>
            <option value="project_assignees">{t('security:notificationRules.recipientTypes.projectAssignees')}</option>
          </select>
        </div>

        {form.recipient_type === 'role' && (
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t('security:notificationRules.form.recipientValue')}
            </label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map(r => (
                <button type="button" key={r} onClick={() => toggleRecipientValue(r)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    Array.isArray(form.recipient_value) && (form.recipient_value as string[]).includes(r)
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                  }`}>
                  {t(`common:roles.${r}`, { defaultValue: r })}
                </button>
              ))}
            </div>
          </div>
        )}

        {form.recipient_type === 'user' && (
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              {t('security:notificationRules.form.recipientValue')}
            </label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {users.map(u => (
                <button type="button" key={u.id} onClick={() => toggleRecipientValue(String(u.id))}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    Array.isArray(form.recipient_value) && (form.recipient_value as string[]).includes(String(u.id))
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                  }`}>
                  {u.first_name} {u.last_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
            {t('security:notificationRules.form.channels')}
          </label>
          <div className="flex gap-3">
            {(['in_app', 'email'] as Channel[]).map(ch => (
              <label key={ch} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={form.channels.includes(ch)} onChange={() => toggleChannel(ch)} />
                {t(`security:notificationRules.channels.${ch}`)}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <Button
          variant="primary"
          disabled={save.isPending || !form.name || !form.trigger_model || form.channels.length === 0}
          onClick={() => save.mutate()}
          className="!px-3 !py-1.5 !text-xs">
          {save.isPending ? '…' : t('common:actions.save')}
        </Button>
        <Button variant="secondary" onClick={onClose} className="!px-3 !py-1.5 !text-xs">
          {t('common:actions.cancel')}
        </Button>
        {save.isError && <span className="text-red-500 text-xs">{t('common:messages.saveError')}</span>}
      </div>
    </Card>
  )
}

export default function NotificationRulesPage() {
  const { t } = useTranslation(['common', 'security'])
  const qc    = useQueryClient()
  const [form, setForm] = useState<NotificationRule | null | false>(false)

  const { data, isFetching } = useQuery({
    queryKey: ['notification-rules'],
    queryFn:  notificationRulesApi.list,
  })

  const remove = useMutation({
    mutationFn: (id: number) => notificationRulesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-rules'] }),
  })

  const rules  = data?.data ?? []
  const models = data?.registry.models ?? {}

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('security:notificationRules.title')}</h1>
        <Button onClick={() => setForm(null)}>{t('security:notificationRules.actions.create')}</Button>
      </div>

      {form !== false && <RuleForm rule={form === null ? null : form} models={models} onClose={() => setForm(false)} />}

      <Card variant="panel" className="overflow-hidden">
        {isFetching && !data && (
          <div className="p-10 text-center text-slate-400 text-sm">{t('common:labels.loading')}</div>
        )}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/40 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <th className="px-4 py-3">{t('security:notificationRules.table.name')}</th>
              <th className="px-4 py-3">{t('security:notificationRules.table.trigger')}</th>
              <th className="px-4 py-3">{t('security:notificationRules.table.channels')}</th>
              <th className="px-4 py-3">{t('security:notificationRules.table.status')}</th>
              <th className="px-4 py-3">{t('security:departments.table.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && !isFetching && (
              <tr><td colSpan={5} className="text-center py-10 text-slate-400 text-sm">{t('security:notificationRules.table.empty')}</td></tr>
            )}
            {rules.map(rule => (
              <tr key={rule.id} className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100">{rule.name}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                  {rule.trigger_model}.{rule.field ?? '*'} {rule.operator ?? ''} {rule.trigger_event}
                </td>
                <td className="px-4 py-3 text-xs">{rule.channels.join(', ')}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    rule.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {rule.is_active ? t('common:labels.active') : t('common:labels.inactive')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setForm(rule)} className="!px-2 !py-1 !text-xs">
                      {t('common:actions.edit')}
                    </Button>
                    <Button variant="danger-text" onClick={() => remove.mutate(rule.id)} className="!px-2 !py-1 !text-xs">
                      {t('common:actions.delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
