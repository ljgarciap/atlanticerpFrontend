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

export type ApprovalProcess = 'caja_chica' | 'arqueo' | 'anulacion_cobro' | 'nota_credito'

export interface ProcessApprovers {
  processes: Record<ApprovalProcess, { user_ids: number[]; sigue_al_primario: boolean }>
}

/** Fase 28 — aprobadores propios por proceso de Admin & Contab (solo superadmin). Lista vacía = sigue al aprobador primario. */
export const processApproversApi = {
  get: (): Promise<ProcessApprovers> =>
    api.get<ProcessApprovers>('/admin/process-approvers').then(r => r.data),

  save: (process: ApprovalProcess, userIds: number[]): Promise<ProcessApprovers> =>
    api.put<ProcessApprovers>(`/admin/process-approvers/${process}`, { user_ids: userIds }).then(r => r.data),
}
