import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { impersonationApi, type ImpersonationSessionsQuery } from '@/api/impersonationApi'

/** SCRUM-1158 — la contraseña del operador viaja en las variables: `gcTime: 0` evita que el MutationCache la conserve. */
export function useStartImpersonation() {
  return useMutation({
    gcTime: 0,
    mutationFn: ({ userId, reason, operatorPassword }: { userId: number; reason: string; operatorPassword: string }) =>
      impersonationApi.start(userId, { reason, operatorPassword }),
  })
}

export function useImpersonationSessions(query: ImpersonationSessionsQuery) {
  return useQuery({
    queryKey:  ['impersonation-sessions', query.status ?? 'all', query.page ?? 1, query.per_page ?? 20],
    queryFn:   () => impersonationApi.listSessions(query),
    staleTime: 5_000,
    placeholderData: prev => prev,
  })
}

export function useRevokeImpersonation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => impersonationApi.revoke(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['impersonation-sessions'] }),
  })
}
