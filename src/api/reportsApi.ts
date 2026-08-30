import api from './authApi'
import type { MonthlyReport, TeamMember } from '@/types/reports'

export const reportsApi = {
  monthly: (month: string, userId?: number): Promise<MonthlyReport> =>
    api.get<MonthlyReport>('/crm/reports/monthly', {
      params: { month, user_id: userId || undefined },
    }).then(r => r.data),

  team: (): Promise<{ data: TeamMember[] }> =>
    api.get<{ data: TeamMember[] }>('/crm/reports/team').then(r => r.data),
}
