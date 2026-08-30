import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { securityAnomaliesApi, type AnomalyStatus } from '@/api/securityAnomaliesApi'

export function useSecurityAnomalies(status?: AnomalyStatus) {
  return useQuery({
    queryKey: ['security-anomalies', status ?? 'all'],
    queryFn:  () => securityAnomaliesApi.list(status),
    staleTime: 10_000,
  })
}

export function useConfirmAnomaly() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => securityAnomaliesApi.confirm(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['security-anomalies'] }),
  })
}

export function useDismissAnomaly() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => securityAnomaliesApi.dismiss(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['security-anomalies'] }),
  })
}

export function useUnblockUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => securityAnomaliesApi.unblock(userId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['security-anomalies'] }),
  })
}
