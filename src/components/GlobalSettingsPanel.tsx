import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { globalSettingsApi } from '@/api/globalSettingsApi'
import { settingToBool, PASSWORD_RESET_ENABLED_KEY, PASSWORD_RESET_EXPIRATION_KEY } from '@/hooks/usePasswordResetSettings'
import type { GlobalSettingItem } from '@/types/globalSettings'
import { parseAuthError } from '@/lib/authErrors'
import { describeWait } from '@/hooks/useRetryCountdown'
import { parseApiValidationError, summaryMessage } from '@/lib/apiValidationError'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

const QUERY_KEY = ['global-settings']

/** Cierre de R3-6: guardar el interruptor del reset y su caducidad exige la contraseña del operador. */
const isCriticalSetting = (key: string): boolean =>
  [PASSWORD_RESET_ENABLED_KEY, PASSWORD_RESET_EXPIRATION_KEY].some(k => key === k || key.endsWith(`.${k}`))

/**
 * SCRUM-944/945 (Pre-QA hallazgo E) — la spec pide que los valores de `GlobalSetting` (key/value
 * transversal del backend, hasta ahora sin pantalla) aparezcan en la vista consolidada de
 * superadmin. Solo claves numéricas enteras con rango (`min`/`max` los define el backend, que es
 * quien valida): `documents.max_size_mb`, `notifications.archive_read_after_days`,
 * `audit_logs.retention_months`. Secretos como `anthropic_api_key` NO se listan acá.
 */
export default function GlobalSettingsPanel() {
  const { t } = useTranslation(['common'])

  const { data: items, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn:  () => globalSettingsApi.list(),
  })

  const groups = new Map<string, GlobalSettingItem[]>()
  for (const item of items ?? []) groups.set(item.group, [...(groups.get(item.group) ?? []), item])

  return (
    <Card variant="panel" className="p-4 mb-3">
      <h3 className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mb-1">{t('common:globalSettings.globalTab.title')}</h3>
      <p className="text-[12px] text-slate-400 mb-3">{t('common:globalSettings.globalTab.subtitle')}</p>

      {isError && <p role="alert" className="text-xs text-red-500">{t('common:globalSettings.globalTab.loadError')}</p>}
      {!isLoading && !isError && (items?.length ?? 0) === 0 && (
        <p className="text-sm text-slate-400">{t('common:globalSettings.globalTab.empty')}</p>
      )}

      {[...groups.entries()].map(([group, rows]) => (
        <section key={group} className="mb-4 last:mb-0">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
            {t(`common:globalSettings.globalTab.groups.${group}`, { defaultValue: group })}
          </h4>
          <div className="space-y-3">
            {rows.map(item => <GlobalSettingRow key={item.key} item={item} />)}
          </div>
        </section>
      ))}
    </Card>
  )
}

function GlobalSettingRow({ item }: { item: GlobalSettingItem }) {
  const { t } = useTranslation(['common', 'auth'])
  const qc = useQueryClient()

  const isBoolean = item.type === 'boolean' || typeof item.value === 'boolean'
  const min = item.min ?? 0
  const max = item.max ?? 0

  const [value, setValue] = useState(String(item.value))
  const [checked, setChecked] = useState(settingToBool(item.value))
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => { setValue(String(item.value)); setChecked(settingToBool(item.value)) }, [item.value])

  // SCRUM-1158: el backend marca con `requires_reauth` las claves que piden la contraseña; las del reset de contraseñas siguen siendo críticas por clave.
  const reauthRequired = item.requires_reauth === true
  const critical = reauthRequired || isCriticalSetting(item.key)
  const [operatorPassword, setOperatorPassword] = useState('')
  const [reauthError, setReauthError] = useState<string | null>(null)

  const mutation = useMutation({
    gcTime: 0, // la contraseña del operador viaja en las variables: no se conserva en el MutationCache
    mutationFn: (vars: { next: number | boolean; password?: string }) =>
      globalSettingsApi.update(item.key, vars.next, vars.password),
    onSuccess:  () => { setOperatorPassword(''); setReauthError(null); qc.invalidateQueries({ queryKey: QUERY_KEY }) },
    onError: (err: unknown) => {
      setOperatorPassword('')
      const parsed = parseAuthError(err)
      if (parsed.status === 422 && (parsed.rawCode === 'operator_reauth_failed' || parsed.rawCode === 'operator_password_required')) {
        setReauthError(t(parsed.rawCode === 'operator_reauth_failed'
          ? 'common:globalSettings.globalTab.reauthFailed'
          : 'common:globalSettings.globalTab.passwordRequired'))
      } else if (parsed.status === 429 && reauthRequired) {
        // SCRUM-1158 — tope de intentos de contraseña de las claves impersonation_*. Solo para ellas: el resto conserva su mensaje genérico.
        // parseAuthError asume 60 s si el 429 no trae `retry_after`, así que siempre hay una espera que mostrar.
        const { unit, count } = describeWait(parsed.retryAfter ?? 60)
        setReauthError(t('common:globalSettings.globalTab.throttledWait', { time: t(`auth:errors.wait.${unit}`, { count }) }))
      }
    },
  })

  // Texto de ayuda opcional por clave (ej. el interruptor del reset de contraseñas explica que en
  // producción arranca apagado). Si no hay clave i18n, no se muestra nada.
  const helpText = t(`common:globalSettings.globalTab.help.${item.key.replace(/\./g, '_')}`, { defaultValue: '' })

  const dirty = isBoolean ? checked !== settingToBool(item.value) : value !== String(item.value)
  const label = t(item.label_key, { defaultValue: item.key })

  const apiError = mutation.isError ? parseApiValidationError(mutation.error) : null
  const backendMessage = mutation.isError
    ? (reauthError ?? summaryMessage(apiError, t('common:globalSettings.globalTab.saveError')))
    : null
  const errorText = localError ?? backendMessage

  const passwordField = critical && dirty && (
    <div className="mt-2">
      <label htmlFor={`global-setting-pw-${item.key}`} className="block text-[11px] font-bold text-slate-500 mb-1">
        {t('common:globalSettings.globalTab.operatorPasswordLabel')}
      </label>
      <input
        id={`global-setting-pw-${item.key}`} type="password" autoComplete="current-password"
        value={operatorPassword}
        onChange={e => { setOperatorPassword(e.target.value); setReauthError(null) }}
        className="w-60 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
    </div>
  )

  function edit(next: string) {
    if (mutation.isError) mutation.reset()
    setLocalError(null)
    setValue(next)
  }

  function toggle(next: boolean) {
    if (mutation.isError) mutation.reset()
    setLocalError(null)
    setChecked(next)
  }

  function submit() {
    const password = critical ? operatorPassword : undefined
    if (isBoolean) {
      if (critical && operatorPassword === '') { setLocalError(t('common:globalSettings.globalTab.passwordRequired')); return }
      setLocalError(null); mutation.mutate({ next: checked, password }); return
    }
    const n = Number(value)
    // Misma regla que aplica el backend (entero dentro de [min, max]); el 422 sigue siendo la autoridad.
    if (value.trim() === '' || !Number.isInteger(n) || n < min || n > max) {
      setLocalError(t('common:globalSettings.globalTab.rangeError', { min, max }))
      return
    }
    if (critical && operatorPassword === '') {
      setLocalError(t('common:globalSettings.globalTab.passwordRequired'))
      return
    }
    setLocalError(null)
    mutation.mutate({ next: n, password })
  }

  if (isBoolean) {
    return (
      <div>
        <div className="flex items-center gap-3">
          <input
            id={`global-setting-${item.key}`}
            type="checkbox" role="switch" checked={checked}
            aria-checked={checked}
            onChange={e => toggle(e.target.checked)}
            className="h-4 w-4"
          />
          <label className="text-[13px] font-semibold text-slate-700 dark:text-slate-200" htmlFor={`global-setting-${item.key}`}>
            {label}
          </label>
          {dirty && (
            <Button className="!text-xs !py-1.5" onClick={submit} loading={mutation.isPending}>
              {t('common:actions.save')}
            </Button>
          )}
        </div>
        {passwordField}
        {helpText && <p className="mt-1 ml-7 text-[11px] text-slate-500">{helpText}</p>}
        {errorText && <p role="alert" className="mt-1 ml-7 text-xs text-red-500">{errorText}</p>}
      </div>
    )
  }

  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1" htmlFor={`global-setting-${item.key}`}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={`global-setting-${item.key}`}
          type="number" step={1} min={min} max={max} value={value}
          aria-invalid={errorText ? true : undefined}
          onChange={e => edit(e.target.value)}
          className={`w-40 rounded-md border px-3 py-1.5 text-sm ${errorText ? 'border-red-400' : 'border-slate-300'}`}
        />
        <span className="text-[11px] text-slate-400">
          {t('common:globalSettings.globalTab.range', { min, max })}
        </span>
        {dirty && (
          <Button className="!text-xs !py-1.5" onClick={submit} loading={mutation.isPending}>
            {t('common:actions.save')}
          </Button>
        )}
      </div>
      {passwordField}
      {helpText && <p className="mt-1 text-[11px] text-slate-500">{helpText}</p>}
      {errorText && <p role="alert" className="mt-1 text-xs text-red-500">{errorText}</p>}
    </div>
  )
}
