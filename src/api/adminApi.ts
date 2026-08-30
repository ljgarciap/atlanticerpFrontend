import api from './authApi'

export interface DemoCleanupResult {
  message:          string
  deleted_projects: number
  deleted_users:    number
}

export const adminApi = {
  cleanupDemo: (): Promise<DemoCleanupResult> =>
    api.post('/admin/demo/cleanup').then(r => r.data as DemoCleanupResult),

  exportCrm: async (): Promise<void> => {
    const res = await api.get('/admin/export/crm', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a   = document.createElement('a')
    a.href     = url
    a.download = `atlanticerp-crm-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  },
}
