import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { aiUsageApi } from '@/api/aiUsageApi'

export function useAiUsage(params: { page?: number; per_page?: number | 'all'; analysis_type?: string } = {}) {
  return useQuery({
    queryKey:  ['ai-usage', params],
    queryFn:   () => aiUsageApi.list(params),
    staleTime: 10_000,
  })
}

export function useAiModelPricing() {
  return useQuery({
    queryKey: ['ai-model-pricing'],
    queryFn:  aiUsageApi.pricing,
    staleTime: 10_000,
  })
}

export function useUpdateAiModelPricing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ model, data }: { model: string; data: { input_price_per_million_usd: number; output_price_per_million_usd: number } }) =>
      aiUsageApi.updatePricing(model, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-model-pricing'] }),
  })
}
