import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { IcoAlertTriangle, IcoBookOpen, IcoClose, IcoSearch, IcoSettings } from '@/components/icons'
import ManualCard from '@/components/manuales/ManualCard'
import ManualesAdminPanel from '@/components/manuales/ManualesAdminPanel'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useManuales } from '@/hooks/useManuales'
import { usePermission } from '@/hooks/usePermission'
import { MANUAL_MODULES, filterManuales, sortByDateDesc } from '@/lib/manuales'
import type { ManualFilters } from '@/lib/manuales'
import type { ManualType } from '@/types/manuales'

// SCRUM-984 — Manuales de usuario. Visible a cualquier usuario autenticado; el panel Administrar
// (subir/borrar) solo se renderiza con manuales.manage (superadmin + excepción de Daniela vía
// SpecialPermissionSeeder). El catálogo se trae completo una vez y se filtra en cliente: así se
// distingue "el módulo no tiene manuales" de "no hay ninguno", y el filtro no depende del backend.
const FIELD = 'rounded-lg border border-slate-200 dark:border-slate-600 px-2 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-primary'

const TYPE_OPTIONS: ReadonlyArray<{ value: ManualType | 'all'; i18nKey: string }> = [
  { value: 'all',   i18nKey: 'typeAll' },
  { value: 'pdf',   i18nKey: 'typePdf' },
  { value: 'video', i18nKey: 'typeVideo' },
]

export default function ManualesPage() {
  const { t } = useTranslation(['manuales', 'common'])
  const canManage = usePermission('manuales.manage')
  const { data: manuales = [], isLoading, isError, refetch } = useManuales()

  const [moduleFilter, setModuleFilter] = useState<ManualFilters['module']>('all')
  const [typeFilter, setTypeFilter] = useState<ManualFilters['type']>('all')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput, 250)
  const [adminOpen, setAdminOpen] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const handleBusyChange = useCallback((busy: boolean) => setUploadBusy(busy), [])

  const filtered = sortByDateDesc(filterManuales(manuales, { module: moduleFilter, type: typeFilter, search }))
  const hasExtraFilters = typeFilter !== 'all' || search.trim() !== ''

  function clearFilters() {
    setTypeFilter('all')
    setSearchInput('')
  }

  function renderEmpty() {
    if (manuales.length === 0) {
      return (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('manuales:empty.catalog')}</p>
          {canManage && (
            <Button variant="outline" className="mt-3" onClick={() => setAdminOpen(true)}>{t('manuales:admin.upload')}</Button>
          )}
        </>
      )
    }
    if (hasExtraFilters) {
      return (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('manuales:empty.search')}</p>
          <Button variant="ghost" className="mt-3" onClick={clearFilters}>{t('manuales:filters.clear')}</Button>
        </>
      )
    }
    return <p className="text-sm text-slate-500 dark:text-slate-400">{t('manuales:empty.module')}</p>
  }

  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('manuales:title')}</h1>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">{t('manuales:subtitle')}</p>
        </div>
        {canManage && (
          <Button
            variant="outline"
            aria-expanded={adminOpen}
            aria-controls="manuales-admin-panel"
            disabled={uploadBusy && adminOpen}
            onClick={() => setAdminOpen(o => !o)}
            className="inline-flex items-center gap-1.5 self-start min-h-[40px]"
          >
            <IcoSettings size={14} />
            {t('manuales:admin.button')}
          </Button>
        )}
      </div>

      {canManage && (
        <ManualesAdminPanel
          id="manuales-admin-panel"
          open={adminOpen}
          manuales={sortByDateDesc(manuales)}
          onBusyChange={handleBusyChange}
        />
      )}

      <Card variant="panel" className="p-3 mb-3 flex flex-wrap gap-2 items-center">
        <select
          aria-label={t('manuales:filters.module')}
          value={moduleFilter}
          disabled={isLoading}
          onChange={e => setModuleFilter(e.target.value as ManualFilters['module'])}
          className={`${FIELD} w-full sm:w-auto min-h-[40px]`}
        >
          <option value="all">{t('manuales:filters.moduleAll')}</option>
          {MANUAL_MODULES.map(m => (
            <option key={m.value} value={m.value}>{t(`manuales:modules.${m.i18nKey}`)}</option>
          ))}
        </select>

        <div role="group" aria-label={t('manuales:filters.type')} className="flex gap-1 w-full sm:w-auto">
          {TYPE_OPTIONS.map(o => (
            <Button
              key={o.value}
              variant="outline"
              active={typeFilter === o.value}
              activeVariant="primary"
              aria-pressed={typeFilter === o.value}
              disabled={isLoading}
              onClick={() => setTypeFilter(o.value)}
              className="flex-1 sm:flex-none min-h-[40px]"
            >
              {t(`manuales:filters.${o.i18nKey}`)}
            </Button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[180px] w-full sm:w-auto">
          <IcoSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            type="search"
            value={searchInput}
            disabled={isLoading}
            onChange={e => setSearchInput(e.target.value)}
            placeholder={t('manuales:filters.search')}
            aria-label={t('manuales:filters.search')}
            className={`${FIELD} w-full pl-8 pr-8 min-h-[40px]`}
          />
          {searchInput !== '' && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label={t('manuales:filters.clearSearch')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <IcoClose size={12} />
            </button>
          )}
        </div>
      </Card>

      <div aria-busy={isLoading}>
        {isLoading ? (
          <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('manuales:loading')}>
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="list-none">
                <Card variant="list-item" className="flex flex-col gap-3 h-full" aria-hidden="true">
                  <div className="h-9 w-9 rounded-lg animate-pulse bg-slate-200 dark:bg-slate-700" />
                  <div className="h-4 w-3/4 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-1/3 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-1/2 rounded animate-pulse bg-slate-200 dark:bg-slate-700" />
                  <div className="h-10 w-full rounded animate-pulse bg-slate-200 dark:bg-slate-700 mt-auto" />
                </Card>
              </li>
            ))}
          </ul>
        ) : isError ? (
          <Card variant="panel" className="py-10 flex flex-col items-center text-center px-4">
            <IcoAlertTriangle size={28} className="text-slate-300 dark:text-slate-500 mb-2" />
            <p role="alert" className="text-sm text-slate-500 dark:text-slate-400">{t('manuales:error.load')}</p>
            <Button variant="outline" className="mt-3" onClick={() => void refetch()}>{t('manuales:retry')}</Button>
          </Card>
        ) : filtered.length === 0 ? (
          <Card variant="panel" className="py-10 flex flex-col items-center text-center px-4">
            <IcoBookOpen size={28} className="text-slate-300 dark:text-slate-500 mb-2" />
            {renderEmpty()}
          </Card>
        ) : (
          <>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-2" aria-live="polite">
              {t('manuales:count', { count: filtered.length })}
            </p>
            <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('manuales:listLabel')}>
              {filtered.map(m => <ManualCard key={m.id} manual={m} />)}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
