import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { catalogsApi } from '@/api/catalogsApi'
import { catalogQueryKey } from '@/hooks/useCatalog'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { CatalogDomain, CatalogEntry, CatalogPropDef, CatalogPropValue } from '@/types/catalogs'

const inputCls = 'border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-slate-800'

function errorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { message?: string, errors?: Record<string, string[]> } | undefined
    return data?.errors ? Object.values(data.errors).flat().join(' ') : (data?.message ?? fallback)
  }
  return fallback
}

/** Editor de una propiedad de comportamiento: casilla (bool), selector (enum), número (int), texto (string) o lista separada por comas (list). */
function PropField({ name, def, value, onChange, label, locked = false, hideValues = [] }: {
  name: string, def: CatalogPropDef, value: CatalogPropValue | undefined, onChange: (v: CatalogPropValue) => void, label: string,
  /** La propiedad no se puede cambiar (entrada de sistema, Fase 7c). */
  locked?: boolean,
  /** Valores de un enum que no se ofrecen (los `system_only` en una entrada propia). */
  hideValues?: string[],
}) {
  const current = value ?? def.default
  let control: ReactNode
  if (def.type === 'bool') {
    control = <input type="checkbox" aria-label={label} checked={current === true} disabled={locked} onChange={e => onChange(e.target.checked)} />
  } else if (def.type === 'enum') {
    control = (
      <select aria-label={label} className={inputCls} value={String(current)} disabled={locked} onChange={e => onChange(e.target.value)}>
        {def.values.filter(v => !hideValues.includes(v) || v === current).map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    )
  } else if (def.type === 'int') {
    control = (
      <input type="number" aria-label={label} className={`${inputCls} w-20`} min={def.min} max={def.max} value={String(current ?? '')} disabled={locked}
        onChange={e => onChange(Number(e.target.value))} />
    )
  } else if (def.type === 'list') {
    control = (
      <input type="text" aria-label={label} className={`${inputCls} w-48`} value={Array.isArray(current) ? current.join(', ') : ''} disabled={locked}
        onChange={e => onChange(e.target.value.split(',').map(v => v.trim()).filter(Boolean))} />
    )
  } else {
    control = (
      <input type="text" aria-label={label} className={`${inputCls} w-28`} maxLength={def.max} value={typeof current === 'string' ? current : ''} disabled={locked}
        onChange={e => onChange(e.target.value)} />
    )
  }
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      {control}
      <span className="sr-only">{name}</span>
    </label>
  )
}

function EntryRow({ domain, entry, defs, propLabel, lockedWhenSystem = [] }: {
  domain: string, entry: CatalogEntry, defs: CatalogDomain['props'], propLabel: (name: string) => string, lockedWhenSystem?: string[]
}) {
  const { t } = useTranslation('common')
  const qc = useQueryClient()
  const [label, setLabel] = useState(entry.label)
  const [sort, setSort] = useState(String(entry.sort_order))
  const [props, setProps] = useState(entry.props ?? {})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setLabel(entry.label); setSort(String(entry.sort_order)); setProps(entry.props ?? {}) }, [entry])

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['catalog-admin', domain] })
    void qc.invalidateQueries({ queryKey: catalogQueryKey(domain) })
  }
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof catalogsApi.update>[2]) => catalogsApi.update(domain, entry.id, patch),
    onSuccess: () => { setError(null); refresh() },
    onError: err => setError(errorMessage(err, t('globalSettings.catalogsTab.saveError'))),
  })
  const remove = useMutation({
    mutationFn: () => catalogsApi.remove(domain, entry.id),
    onSuccess: () => { setError(null); refresh() },
    onError: err => setError(errorMessage(err, t('globalSettings.catalogsTab.deleteError'))),
  })

  return (
    <li className="py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-[11px] text-slate-400 w-28 truncate" title={entry.key}>{entry.key}</code>
        <input aria-label={t('globalSettings.catalogsTab.label')} className={`${inputCls} flex-1 min-w-[10rem]`} value={label} onChange={e => setLabel(e.target.value)} />
        <input aria-label={t('globalSettings.catalogsTab.order')} className={`${inputCls} w-16`} type="number" min={0} value={sort}
          disabled={entry.is_system && lockedWhenSystem.includes('sort_order')} onChange={e => setSort(e.target.value)} />
        {Object.entries(defs).map(([name, def]) => (
          <PropField key={name} name={name} def={def} label={propLabel(name)} value={props[name]} onChange={v => setProps(p => ({ ...p, [name]: v }))}
            locked={entry.is_system && lockedWhenSystem.includes(name)}
            hideValues={!entry.is_system && def.type === 'enum' ? def.system_only : undefined} />
        ))}
        <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={entry.is_active} disabled={entry.is_system} onChange={e => save.mutate({ is_active: e.target.checked })} aria-label={t('globalSettings.catalogsTab.active')} />
          {t('globalSettings.catalogsTab.active')}
        </label>
        <Button variant="outline" className="!px-2.5 !py-1 !text-xs" disabled={save.isPending}
          onClick={() => save.mutate({ label, sort_order: Number(sort) || 0, props })}>
          {t('globalSettings.catalogsTab.save')}
        </Button>
        {entry.is_system
          ? <span className="text-[11px] text-slate-400">{t('globalSettings.catalogsTab.system')}</span>
          : <Button variant="outline" className="!px-2.5 !py-1 !text-xs" disabled={remove.isPending} onClick={() => remove.mutate()}>{t('globalSettings.catalogsTab.delete')}</Button>}
      </div>
      {error && <p role="alert" className="text-xs text-red-500 mt-1">{error}</p>}
    </li>
  )
}

function NewEntryForm({ domain, defs, propLabel }: { domain: string, defs: CatalogDomain['props'], propLabel: (name: string) => string }) {
  const { t } = useTranslation('common')
  const qc = useQueryClient()
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [props, setProps] = useState<CatalogEntry['props']>({})
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => catalogsApi.create(domain, { key, label, props }),
    onSuccess: () => {
      setKey(''); setLabel(''); setProps({}); setError(null)
      void qc.invalidateQueries({ queryKey: ['catalog-admin', domain] })
      void qc.invalidateQueries({ queryKey: catalogQueryKey(domain) })
    },
    onError: err => setError(errorMessage(err, t('globalSettings.catalogsTab.saveError'))),
  })

  return (
    <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); create.mutate() }}>
      <input aria-label={t('globalSettings.catalogsTab.newKey')} placeholder={t('globalSettings.catalogsTab.newKey')} className={`${inputCls} w-36`} value={key} onChange={e => setKey(e.target.value)} />
      <input aria-label={t('globalSettings.catalogsTab.newLabel')} placeholder={t('globalSettings.catalogsTab.newLabel')} className={`${inputCls} flex-1 min-w-[10rem]`} value={label} onChange={e => setLabel(e.target.value)} />
      {Object.entries(defs).map(([name, def]) => (
        <PropField key={name} name={name} def={def} label={propLabel(name)} value={props[name]} onChange={v => setProps(p => ({ ...p, [name]: v }))}
          hideValues={def.type === 'enum' ? def.system_only : undefined} />
      ))}
      <Button type="submit" variant="outline" className="!px-3 !py-1.5 !text-sm" disabled={create.isPending || key === '' || label === ''}>{t('globalSettings.catalogsTab.add')}</Button>
      {error && <p role="alert" className="w-full text-xs text-red-500">{error}</p>}
    </form>
  )
}

/**
 * Fase 7a — administración (solo superadmin) de los catálogos de vocabulario de la empresa: categorías de proveedor, tipos de asociado…
 * Las entradas «de sistema» (las que el código todavía usa) se renombran y reordenan pero no se borran ni se desactivan.
 */
export default function CatalogsPanel() {
  const { t } = useTranslation('common')
  const [domain, setDomain] = useState<string | null>(null)

  const domains = useQuery({ queryKey: ['catalog-domains'], queryFn: () => catalogsApi.domains() })
  const active = domain ?? domains.data?.[0]?.domain ?? null
  const def = domains.data?.find(d => d.domain === active)

  const entries = useQuery({
    queryKey: ['catalog-admin', active],
    queryFn: () => catalogsApi.adminList(active as string),
    enabled: active !== null,
  })

  const propLabel = (name: string) => t(`globalSettings.catalogsTab.props.${name}`, { defaultValue: name })

  return (
    <Card variant="panel" className="p-4 mb-3">
      <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">{t('globalSettings.catalogsTab.title')}</h3>
      <p className="text-[12px] text-slate-400 mb-3">{t('globalSettings.catalogsTab.subtitle')}</p>

      {(domains.isError || entries.isError) && <p role="alert" className="text-xs text-red-500">{t('globalSettings.catalogsTab.loadError')}</p>}

      <div className="flex flex-wrap gap-2 mb-3">
        {(domains.data ?? []).map(d => (
          <Button key={d.domain} variant="outline" active={d.domain === active} className="!px-3 !py-1.5 !text-xs" onClick={() => setDomain(d.domain)}>{d.label}</Button>
        ))}
      </div>

      {active && def && (
        <>
          <ul>
            {(entries.data ?? []).map(e => <EntryRow key={e.id} domain={active} entry={e} defs={def.props} propLabel={propLabel} lockedWhenSystem={def.locked_when_system} />)}
          </ul>
          <NewEntryForm domain={active} defs={def.props} propLabel={propLabel} />
        </>
      )}
    </Card>
  )
}
