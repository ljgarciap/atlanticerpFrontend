import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { settingsApi } from '@/api/settingsApi'
import { adminApi, type DemoCleanupResult } from '@/api/adminApi'
import { authApi } from '@/api/authApi'
import { useAuthStore } from '@/store/authStore'
import { applyTheme } from '@/hooks/useTheme'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

const LANGUAGES = [{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]
const THEMES    = [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]
// SCRUM-746 — 480/600/1440/2880 (8h/10h/24h/48h) agregados a pedido de Luis durante el desarrollo
// del ticket (aclaración directa, no quedó en Jira), default nuevo 600 min.
const TIMEOUTS  = [15, 30, 60, 120, 240, 480, 600, 1440, 2880]

export default function SettingsPage() {
  const { t }        = useTranslation(['settings', 'common'])
  const { user, updateUser } = useAuthStore()
  const qc           = useQueryClient()
  // Espeja el catálogo de permisos del backend en vez de chequear el rol —
  // superadmin.all da acceso a todo, igual que en las rutas del backend.
  const permissions   = user?.permissions ?? []
  const hasAllAccess  = permissions.includes('superadmin.all')
  const isAdmin       = hasAllAccess || permissions.includes('settings.global')
  const isSuperadmin  = hasAllAccess
  const canManageAiKey = hasAllAccess

  const [confirmingCleanup, setConfirmingCleanup] = useState(false)
  const [cleanupResult, setCleanupResult]         = useState<DemoCleanupResult | null>(null)

  const cleanupDemo = useMutation({
    mutationFn: adminApi.cleanupDemo,
    onSuccess: (data) => {
      setConfirmingCleanup(false)
      setCleanupResult(data)
    },
  })

  const MFA_MODES = [
    { value: 'disabled', label: t('settings:global.mfaModeDisabled') },
    { value: 'optional', label: t('settings:global.mfaModeOptional') },
    { value: 'required', label: t('settings:global.mfaModeRequired') },
  ]

  const { data: prefs, isLoading: loadingPrefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: settingsApi.getPreferences,
  })

  const { data: system, isLoading: loadingSystem } = useQuery({
    queryKey: ['system-settings'],
    queryFn:  settingsApi.getSystemSettings,
    enabled:  isAdmin,
  })

  const updatePrefs = useMutation({
    mutationFn: settingsApi.updatePreferences,
    onMutate: (vars) => {
      if (vars.theme) applyTheme(vars.theme)
    },
    onSuccess:  (data) => {
      qc.setQueryData(['preferences'], data)
      void i18n.changeLanguage(data.language)
      localStorage.setItem('atlanticerp_lang', data.language)
      applyTheme(data.theme)
      // Mantiene sincronizado el store de auth persistido — sin esto,
      // user.language queda desactualizado hasta el próximo login.
      if (user) updateUser({ ...user, language: data.language })
    },
  })

  const updateSystem = useMutation({
    mutationFn: settingsApi.updateSystemSettings,
    onSuccess:  (data) => qc.setQueryData(['system-settings'], data),
  })

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t('settings:title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('settings:subtitle')}</p>
      </div>

      {/* User preferences */}
      <Card variant="panel" shadow className="overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{t('settings:user.title')}</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('settings:user.subtitle')}</p>
        </div>

        {loadingPrefs
          ? <div className="px-6 py-8 text-slate-400 text-sm">{t('common:labels.loading')}</div>
          : (
            <div className="px-6 py-5 space-y-5">
              <SettingRow label={t('settings:user.language')}>
                <SegmentControl
                  value={prefs?.language ?? 'es'}
                  options={LANGUAGES}
                  onChange={v => updatePrefs.mutate({ language: v as 'es' | 'en' })}
                  disabled={updatePrefs.isPending}
                />
              </SettingRow>

              <SettingRow label={t('settings:user.theme')}>
                <SegmentControl
                  value={prefs?.theme ?? 'light'}
                  options={THEMES}
                  onChange={v => updatePrefs.mutate({ theme: v as 'light' | 'dark' })}
                  disabled={updatePrefs.isPending}
                />
              </SettingRow>

              <SettingRow label={t('settings:user.sessionTimeout')}>
                <TimeoutSelect
                  value={prefs?.session_timeout_min ?? 600}
                  onChange={v => updatePrefs.mutate({ session_timeout_min: v })}
                  disabled={updatePrefs.isPending}
                />
              </SettingRow>

              {updatePrefs.isSuccess && (
                <p className="text-xs text-[#5BA5A0] font-medium">{t('settings:saved')}</p>
              )}
            </div>
          )}
      </Card>

      {/* Personal MFA */}
      <MfaPersonalSection />

      {/* AI API Key — superadmin.all only */}
      {canManageAiKey && <AiKeySection />}

      {/* Documents max size — superadmin.all only */}
      {canManageAiKey && <DocumentsMaxSizeSection />}

      {/* Global settings — admin only */}
      {isSuperadmin && (
        <Card variant="panel" shadow className="overflow-hidden !border-red-100 dark:!border-red-900/40">
          <div className="px-6 py-4 border-b border-red-50 dark:border-red-950/40">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{t('settings:admin.title')}</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('settings:admin.subtitle')}</p>
          </div>

          <div className="px-6 py-5 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings:admin.demoCleanup.label')}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('settings:admin.demoCleanup.description')}</p>
            </div>

            {cleanupResult && !confirmingCleanup && (
              <p className="text-xs text-[#5BA5A0] font-medium">
                {t('settings:admin.demoCleanup.result', {
                  projects: cleanupResult.deleted_projects,
                  users:    cleanupResult.deleted_users,
                })}
              </p>
            )}

            {!confirmingCleanup && (
              <Button
                type="button"
                variant="danger"
                onClick={() => { setCleanupResult(null); setConfirmingCleanup(true) }}
                className="!px-4 !py-2 !text-xs">
                {t('settings:admin.demoCleanup.label')}
              </Button>
            )}

            {confirmingCleanup && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-4 py-3 space-y-3">
                <p className="text-xs text-red-700 dark:text-red-400 font-medium">{t('settings:admin.demoCleanup.confirm')}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    disabled={cleanupDemo.isPending}
                    loading={cleanupDemo.isPending}
                    onClick={() => cleanupDemo.mutate()}
                    className="!px-4 !py-1.5 !text-xs">
                    {cleanupDemo.isPending ? t('common:labels.loading') : t('settings:admin.demoCleanup.confirmBtn')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={cleanupDemo.isPending}
                    onClick={() => setConfirmingCleanup(false)}
                    className="!px-4 !py-1.5 !text-xs">
                    {t('settings:admin.demoCleanup.cancelBtn')}
                  </Button>
                </div>
              </div>
            )}

            <hr className="border-slate-100 dark:border-slate-700" />

            {/* Backup / export */}
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('settings:admin.backup.label')}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('settings:admin.backup.description')}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void adminApi.exportCrm()}
              className="!px-4 !py-2 !text-xs">
              {t('settings:admin.backup.download')}
            </Button>
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card variant="panel" shadow className="overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
            <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{t('settings:global.title')}</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('settings:global.subtitle')}</p>
          </div>

          {loadingSystem
            ? <div className="px-6 py-8 text-slate-400 text-sm">{t('common:labels.loading')}</div>
            : (
              <div className="px-6 py-5 space-y-5">
                <SettingRow label={t('settings:global.defaultLanguage')}>
                  <SegmentControl
                    value={system?.default_language ?? 'es'}
                    options={LANGUAGES}
                    onChange={v => updateSystem.mutate({ default_language: v as 'es' | 'en' })}
                    disabled={updateSystem.isPending}
                  />
                </SettingRow>

                <SettingRow label={t('settings:global.defaultTheme')}>
                  <SegmentControl
                    value={system?.default_theme ?? 'light'}
                    options={THEMES}
                    onChange={v => updateSystem.mutate({ default_theme: v as 'light' | 'dark' })}
                    disabled={updateSystem.isPending}
                  />
                </SettingRow>

                <SettingRow label={t('settings:global.sessionTimeout')}>
                  <TimeoutSelect
                    value={system?.session_timeout_min ?? 600}
                    onChange={v => updateSystem.mutate({ session_timeout_min: v })}
                    disabled={updateSystem.isPending}
                  />
                </SettingRow>

                <SettingRow label={t('settings:global.mfaMode')}>
                  <SegmentControl
                    value={system?.mfa_mode ?? 'optional'}
                    options={MFA_MODES}
                    onChange={v => updateSystem.mutate({ mfa_mode: v as 'disabled' | 'optional' | 'required' })}
                    disabled={updateSystem.isPending}
                  />
                </SettingRow>

                <SettingRow label={t('settings:global.shareLinksExpiration')}>
                  <ShareLinksExpirationInput
                    value={system?.share_links_expiration_days ?? 30}
                    onSave={days => updateSystem.mutate({ share_links_expiration_days: days })}
                    disabled={updateSystem.isPending}
                  />
                </SettingRow>

                {/* SCRUM-746 — hallazgo de Pre-QA 2026-08-13: `session_inactivity_hours` ya
                    existía en backend (auth.system_settings, validado min:1/max:720,
                    gateado por permission:settings.global) pero no tenía ningún campo acá —
                    la config quedaba en tabla paramétrica con CRUD por API pero sin "vista de
                    administración" para que superadmin la ajuste sin deploy (regla dura del
                    CLAUDE.md raíz). Mismo patrón que ShareLinksExpirationInput. */}
                <SettingRow label={t('settings:global.sessionInactivityHours')}>
                  <SessionInactivityHoursInput
                    value={system?.session_inactivity_hours ?? 10}
                    onSave={hours => updateSystem.mutate({ session_inactivity_hours: hours })}
                    disabled={updateSystem.isPending}
                  />
                </SettingRow>

                {updateSystem.isSuccess && (
                  <p className="text-xs text-[#5BA5A0] font-medium">{t('settings:saved')}</p>
                )}
              </div>
            )}
        </Card>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MfaPersonalSection() {
  const { t }    = useTranslation(['auth', 'common'])
  const qc       = useQueryClient()
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  const { data: status, isLoading } = useQuery({
    queryKey: ['mfa-personal-status'],
    queryFn:  authApi.mfaStatus,
  })

  const enable = useMutation({
    mutationFn: () => authApi.mfaEnable(password),
    onSuccess: (res) => {
      setChallengeId(res.mfa_challenge_id)
      setPassword('')
      setPasswordError('')
    },
    onError: () => setPasswordError(t('auth:mfa.passwordHint')),
  })

  const confirmEnable = useMutation({
    mutationFn: (code: string) => authApi.mfaConfirmEnable(challengeId ?? '', code),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mfa-personal-status'] })
      setChallengeId(null)
      setCode('')
      setCodeError('')
    },
    onError: () => setCodeError(t('auth:mfa.invalidCode')),
  })

  const resend = useMutation({
    mutationFn: () => authApi.mfaResend(challengeId ?? ''),
    onSuccess: (res) => { setChallengeId(res.mfa_challenge_id); setCode(''); setCodeError('') },
  })

  const disable = useMutation({
    mutationFn: authApi.mfaDisable,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['mfa-personal-status'] }),
  })

  if (isLoading || !status) return null

  if (status.mfa_mode === 'disabled') {
    return (
      <Card variant="panel" shadow className="overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{t('auth:mfa.sectionTitle')}</h2>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-slate-400 dark:text-slate-500">{t('auth:mfa.disabledByAdmin')}</p>
        </div>
      </Card>
    )
  }

  const isEnabled  = status.mfa_enabled
  const isRequired = status.mfa_mode === 'required'

  return (
    <Card variant="panel" shadow className="overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
        <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{t('auth:mfa.sectionTitle')}</h2>
      </div>

      <div className="px-6 py-5 space-y-4">
        {/* Status badge */}
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
            style={isEnabled
              ? { background: '#E3F0EE', color: '#3D7E7A' }
              : { background: '#f1f5f9', color: '#64748b' }}
          >
            {isEnabled ? t('auth:mfa.statusEnabled') : t('auth:mfa.statusDisabled')}
          </span>
          {isRequired && (
            <span className="text-xs text-amber-600 font-medium">
              {t('auth:mfa.requiredByAdmin')}
            </span>
          )}
        </div>

        {/* Confirm enrollment code — only right after requesting activation */}
        {!isRequired && !isEnabled && challengeId && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">{t('auth:mfa.enrollCodeSent')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setCodeError('') }}
                placeholder={t('auth:mfa.codePlaceholder')}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 text-center tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-[#5BA5A0]/20 text-slate-700"
              />
              <Button
                type="button"
                disabled={code.length !== 6 || confirmEnable.isPending}
                loading={confirmEnable.isPending}
                onClick={() => confirmEnable.mutate(code)}
                className="!px-4 !py-2 !text-xs"
              >
                {t('auth:mfa.submit')}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => { setChallengeId(null); setCode(''); setCodeError('') }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                {t('common:actions.cancel')}
              </button>
              <button
                type="button"
                disabled={resend.isPending}
                onClick={() => resend.mutate()}
                className="text-xs text-primary hover:text-primary-dark"
              >
                {t('auth:mfa.resend')}
              </button>
            </div>
            {codeError && <p className="text-xs text-red-500">{codeError}</p>}
          </div>
        )}

        {/* Enable form — only when optional and not yet enabled */}
        {!isRequired && !isEnabled && !challengeId && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">{t('auth:mfa.passwordHint')}</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setPasswordError('') }}
                placeholder={t('auth:labels.password')}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#5BA5A0]/20 text-slate-700"
              />
              <Button
                type="button"
                disabled={!password || enable.isPending}
                loading={enable.isPending}
                onClick={() => enable.mutate()}
                className="!px-4 !py-2 !text-xs"
              >
                {t('auth:mfa.enable')}
              </Button>
            </div>
            {passwordError && (
              <p className="text-xs text-red-500">{t('auth:validation.passwordRequired')}</p>
            )}
          </div>
        )}

        {/* Disable button — only when optional and enabled */}
        {!isRequired && isEnabled && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="danger"
              disabled={disable.isPending}
              loading={disable.isPending}
              onClick={() => disable.mutate()}
              className="!px-4 !py-2 !text-xs"
            >
              {t('auth:mfa.disable')}
            </Button>
            {disable.isSuccess && (
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('auth:mfa.disableSuccess')}</p>
            )}
            {confirmEnable.isSuccess && (
              <p className="text-xs font-medium" style={{ color: '#3D7E7A' }}>{t('auth:mfa.enableSuccess')}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

function AiKeySection() {
  const { t }  = useTranslation('settings')
  const qc     = useQueryClient()

  const [newKey,   setNewKey]   = useState('')
  const [revealed, setRevealed] = useState(false)
  const [keyError, setKeyError] = useState('')

  const { data: aiKey, isLoading } = useQuery({
    queryKey: ['ai-key'],
    queryFn:  settingsApi.getAiKey,
  })

  const update = useMutation({
    mutationFn: settingsApi.updateAiKey,
    onSuccess: (data) => {
      qc.setQueryData(['ai-key'], data)
      setNewKey('')
      setKeyError('')
    },
  })

  const handleSave = () => {
    if (!newKey.startsWith('sk-ant-') || newKey.length < 20) {
      setKeyError(t('settings:aiKey.error'))
      return
    }
    setKeyError('')
    update.mutate(newKey)
  }

  return (
    <Card variant="panel" shadow className="overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
        <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{t('settings:aiKey.title')}</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('settings:aiKey.subtitle')}</p>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Current key */}
        {!isLoading && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">{t('settings:aiKey.current')}</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex-1 font-mono text-slate-600 tracking-wide">
                {aiKey?.masked ?? '—'}
              </code>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                aiKey?.source === 'database'
                  ? 'bg-[#5BA5A0]/10 text-[#5BA5A0]'
                  : 'bg-amber-50 text-amber-600'
              }`}>
                {aiKey?.source === 'database'
                  ? t('settings:aiKey.sourceDb')
                  : t('settings:aiKey.sourceEnv')}
              </span>
            </div>
          </div>
        )}

        {/* New key input */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">{t('settings:aiKey.newKey')}</p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={revealed ? 'text' : 'password'}
                value={newKey}
                onChange={e => { setNewKey(e.target.value); setKeyError('') }}
                placeholder={t('settings:aiKey.placeholder')}
                className="w-full text-xs font-mono border border-slate-200 rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-[#5BA5A0]/20 text-slate-700"
              />
              <button
                type="button"
                onClick={() => setRevealed(r => !r)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                {revealed
                  ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
                  : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                }
              </button>
            </div>
            <Button
              type="button"
              disabled={!newKey || update.isPending}
              loading={update.isPending}
              onClick={handleSave}
              className="!px-4 !py-2 !text-xs !font-medium">
              {t('settings:aiKey.save')}
            </Button>
          </div>
          {keyError && <p className="text-xs text-red-500 mt-1">{keyError}</p>}
          {update.isSuccess && <p className="text-xs text-[#5BA5A0] font-medium mt-1">{t('settings:aiKey.saved')}</p>}
          {update.isError  && <p className="text-xs text-red-500 mt-1">{String((update.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar')}</p>}
        </div>
      </div>
    </Card>
  )
}

function DocumentsMaxSizeSection() {
  const { t } = useTranslation('settings')
  const qc    = useQueryClient()

  const [value, setValue] = useState<string>('')
  const [error, setError] = useState('')

  const { data } = useQuery({
    queryKey: ['documents-max-size'],
    queryFn:  settingsApi.getDocumentsMaxSize,
  })

  const currentMb = data?.max_size_mb ?? 500

  const update = useMutation({
    mutationFn: (mb: number) => settingsApi.updateDocumentsMaxSize(mb),
    onSuccess: (d) => { qc.setQueryData(['documents-max-size'], d); setValue(''); setError('') },
  })

  const handleSave = () => {
    const mb = Number(value)
    if (!Number.isInteger(mb) || mb < 1 || mb > 500) {
      setError(t('settings:documents.error'))
      return
    }
    update.mutate(mb)
  }

  return (
    <Card variant="panel" shadow className="overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700">
        <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{t('settings:documents.title')}</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('settings:documents.subtitle')}</p>
      </div>
      <div className="px-6 py-5 flex items-end gap-3">
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('settings:documents.label')}</p>
          <input
            type="number"
            min={1}
            max={500}
            value={value !== '' ? value : currentMb}
            onChange={e => { setValue(e.target.value); setError('') }}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-[#5BA5A0]"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          {update.isSuccess && <p className="text-xs text-[#5BA5A0] font-medium mt-1">{t('settings:documents.saved')}</p>}
        </div>
        <Button
          onClick={handleSave}
          disabled={update.isPending}
          loading={update.isPending}
          className="!px-4 !py-2 !text-sm"
        >
          {t('settings:documents.save')}
        </Button>
      </div>
    </Card>
  )
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-slate-600 font-medium">{label}</span>
      {children}
    </div>
  )
}

function SegmentControl({
  value, options, onChange, disabled,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
      {options.map(opt => (
        <Button
          key={opt.value}
          type="button"
          variant="outline"
          active={value === opt.value}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className="!rounded-none !border-0 !px-4 !py-1.5 !text-xs"
        >
          {opt.label}
        </Button>
      ))}
    </div>
  )
}

function TimeoutSelect({
  value, onChange, disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('settings')
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(Number(e.target.value))}
      className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#5BA5A0]/20 disabled:opacity-60">
      {TIMEOUTS.map(min => (
        <option key={min} value={min}>
          {min >= 60
            ? t('settings:timeoutOptionHours', { min, hours: min / 60 })
            : t('settings:timeoutOption', { min })}
        </option>
      ))}
    </select>
  )
}

function ShareLinksExpirationInput({
  value, onSave, disabled,
}: {
  value: number
  onSave: (v: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('settings')
  const [draft, setDraft] = useState<string>('')
  const [error, setError] = useState('')

  const handleSave = () => {
    // Sin editar el campo, draft sigue en '' y el input solo muestra `value` como
    // fallback visual — hay que validar/guardar ese mismo valor mostrado, no
    // Number('') (que da 0 y dispara el error aunque el valor visible sea válido).
    const days = draft !== '' ? Number(draft) : value
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError(t('settings:global.shareLinksExpirationError'))
      return
    }
    setError('')
    onSave(days)
    setDraft('')
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={365}
          value={draft !== '' ? draft : value}
          onChange={e => { setDraft(e.target.value); setError('') }}
          disabled={disabled}
          className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-[#5BA5A0] disabled:opacity-60"
        />
        <span className="text-xs text-slate-400">{t('settings:global.shareLinksExpirationSuffix')}</span>
        <Button
          type="button"
          onClick={handleSave}
          disabled={disabled}
          loading={disabled}
          className="!px-3 !py-1.5 !text-xs"
        >
          {t('settings:global.shareLinksExpirationSave')}
        </Button>
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}

// SCRUM-746 — mismo patrón que ShareLinksExpirationInput, rango 1-720 en vez de 1-365 (ver
// PreferencesService::MIN_SESSION_INACTIVITY_HOURS/MAX_SESSION_INACTIVITY_HOURS en backend).
function SessionInactivityHoursInput({
  value, onSave, disabled,
}: {
  value: number
  onSave: (v: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('settings')
  const [draft, setDraft] = useState<string>('')
  const [error, setError] = useState('')

  const handleSave = () => {
    const hours = draft !== '' ? Number(draft) : value
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      setError(t('settings:global.sessionInactivityHoursError'))
      return
    }
    setError('')
    onSave(hours)
    setDraft('')
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={720}
          value={draft !== '' ? draft : value}
          onChange={e => { setDraft(e.target.value); setError('') }}
          disabled={disabled}
          className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-[#5BA5A0] disabled:opacity-60"
        />
        <span className="text-xs text-slate-400">{t('settings:global.sessionInactivityHoursSuffix')}</span>
        <Button
          type="button"
          onClick={handleSave}
          disabled={disabled}
          loading={disabled}
          className="!px-3 !py-1.5 !text-xs"
        >
          {t('settings:global.sessionInactivityHoursSave')}
        </Button>
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
