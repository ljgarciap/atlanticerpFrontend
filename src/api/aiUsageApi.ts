import api from './authApi'
import type { PaginationMeta } from '@/components/ui/Pagination'

export interface AiUsageEntry {
  id:                  string
  created_at:          string
  analysis_type:       string
  analysis_label:      string
  model:               string
  input_tokens:        number | null
  output_tokens:       number | null
  estimated_cost_usd:  number | null
  document_name:       string | null
  status:              string
  requested_by:        { id: number; name: string } | null
}

export interface AiUsageTotals {
  input_tokens:       number
  output_tokens:      number
  estimated_cost_usd: number
}

export interface AiUsageResponse {
  data:   AiUsageEntry[]
  meta:   PaginationMeta
  totals: { current_month: AiUsageTotals; all_time: AiUsageTotals }
}

export interface AiModelPricing {
  model:                          string
  input_price_per_million_usd:    number
  output_price_per_million_usd:   number
}

export const aiUsageApi = {
  list: (params: { page?: number; per_page?: number | 'all'; analysis_type?: string; from?: string; to?: string } = {}): Promise<AiUsageResponse> =>
    api.get('/admin/ai/usage', { params }).then(r => r.data as AiUsageResponse),

  pricing: (): Promise<AiModelPricing[]> =>
    api.get('/admin/ai/pricing').then(r => (r.data as { data: AiModelPricing[] }).data),

  updatePricing: (model: string, data: { input_price_per_million_usd: number; output_price_per_million_usd: number }): Promise<AiModelPricing> =>
    api.put(`/admin/ai/pricing/${model}`, data).then(r => (r.data as { data: AiModelPricing }).data),
}
