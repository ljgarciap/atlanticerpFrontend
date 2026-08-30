import api from './authApi'

export interface AiAnalysisResponse {
  id:            string
  status:        'pending' | 'running' | 'completed' | 'failed'
  result:        string | null
  error:         string | null
  analysis_type: string
}

export const aiApi = {
  summarize: (projectId: number): Promise<{ job_id: string }> =>
    api.post('/ai/summarize', { project_id: projectId }).then(r => r.data as { job_id: string }),

  suggestActions: (projectId: number): Promise<{ job_id: string }> =>
    api.post('/ai/suggest-actions', { project_id: projectId }).then(r => r.data as { job_id: string }),

  draftMessage: (
    projectId: number,
    messageType: 'email' | 'whatsapp' | 'llamada',
    intent: string,
  ): Promise<{ job_id: string }> =>
    api.post('/ai/draft-message', {
      project_id:   projectId,
      message_type: messageType,
      intent,
    }).then(r => r.data as { job_id: string }),

  monthlyAnalysis: (month: string): Promise<{ job_id: string }> =>
    api.post('/ai/monthly-analysis', { month }).then(r => r.data as { job_id: string }),

  getAnalysis: (id: string): Promise<AiAnalysisResponse> =>
    api.get(`/ai/analyses/${id}`).then(r => r.data as AiAnalysisResponse),
}
