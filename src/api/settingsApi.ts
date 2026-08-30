import api from './authApi'

export interface UserPreferences {
  language:            'es' | 'en'
  theme:               'light' | 'dark'
  session_timeout_min: number
}

export interface SystemSettings {
  default_language:            'es' | 'en'
  default_theme:               'light' | 'dark'
  session_timeout_min:         number
  mfa_mode:                    'disabled' | 'optional' | 'required'
  share_links_expiration_days: number
  session_inactivity_hours:    number
}

export interface AiKeyResponse {
  masked:  string | null
  source:  'database' | 'env'
}

export const settingsApi = {
  getPreferences: (): Promise<UserPreferences> =>
    api.get('/settings/preferences').then(r => r.data as UserPreferences),

  updatePreferences: (data: Partial<UserPreferences>): Promise<UserPreferences> =>
    api.patch('/settings/preferences', data).then(r => r.data as UserPreferences),

  getSystemSettings: (): Promise<SystemSettings> =>
    api.get('/settings/system').then(r => r.data as SystemSettings),

  updateSystemSettings: (data: Partial<SystemSettings>): Promise<SystemSettings> =>
    api.patch('/settings/system', data).then(r => r.data as SystemSettings),

  getAiKey: (): Promise<AiKeyResponse> =>
    api.get('/settings/ai-key').then(r => r.data as AiKeyResponse),

  updateAiKey: (value: string): Promise<AiKeyResponse> =>
    api.put('/settings/ai-key', { value }).then(r => r.data as AiKeyResponse),

  getDocumentsMaxSize: (): Promise<{ max_size_mb: number }> =>
    api.get('/settings/documents/max-size').then(r => r.data as { max_size_mb: number }),

  updateDocumentsMaxSize: (max_size_mb: number): Promise<{ max_size_mb: number }> =>
    api.put('/settings/documents/max-size', { max_size_mb }).then(r => r.data as { max_size_mb: number }),
}
