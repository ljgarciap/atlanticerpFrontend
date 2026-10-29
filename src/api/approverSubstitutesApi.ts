import api from './authApi'

export interface ApproverSubstitutes {
  titular_compras:      number | null
  titular_admin_contab: number | null
  suplentes:            { id: number; name: string; email: string }[]
}

/** Fase 12b — aprobadores suplentes (solo superadmin). El titular de cada módulo se fija en sus propios ajustes. */
export const approverSubstitutesApi = {
  get: (): Promise<ApproverSubstitutes> =>
    api.get<ApproverSubstitutes>('/admin/primary-approver-substitutes').then(r => r.data),

  save: (userIds: number[]): Promise<ApproverSubstitutes> =>
    api.put<ApproverSubstitutes>('/admin/primary-approver-substitutes', { user_ids: userIds }).then(r => r.data),
}
