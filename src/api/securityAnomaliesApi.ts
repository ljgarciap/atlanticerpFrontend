import api from './authApi'

export type AnomalySeverity = 'low' | 'medium' | 'high'
export type AnomalyStatus   = 'pending' | 'confirmed' | 'dismissed'

export interface SecurityAnomaly {
  id:            number
  detected_at:   string
  severity:      AnomalySeverity
  reasoning:     string
  status:        AnomalyStatus
  affected_user: { id: number; name: string } | null
  reviewer:      { id: number; name: string } | null
  reviewed_at:   string | null
}

export const securityAnomaliesApi = {
  list: (status?: AnomalyStatus): Promise<SecurityAnomaly[]> =>
    api.get('/admin/security/anomalies', { params: status ? { status } : {} })
      .then(r => (r.data as { data: SecurityAnomaly[] }).data),

  confirm: (id: number): Promise<SecurityAnomaly> =>
    api.post(`/admin/security/anomalies/${id}/confirm`)
      .then(r => (r.data as { data: SecurityAnomaly }).data),

  dismiss: (id: number): Promise<SecurityAnomaly> =>
    api.post(`/admin/security/anomalies/${id}/dismiss`)
      .then(r => (r.data as { data: SecurityAnomaly }).data),

  unblock: (userId: number): Promise<{ message: string }> =>
    api.post(`/admin/security/users/${userId}/unblock`)
      .then(r => r.data as { message: string }),

  resetMfa: (userId: number): Promise<{ message: string }> =>
    api.post(`/admin/security/users/${userId}/mfa/reset`)
      .then(r => r.data as { message: string }),
}
