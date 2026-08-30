import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi, type CreateUserPayload, type UpdateUserPayload } from '@/api/usersApi'
import { securityAnomaliesApi } from '@/api/securityAnomaliesApi'

export function useUsers(params: { search?: string; page?: number; per_page?: number; is_active?: boolean; role_id?: number } = {}) {
  return useQuery({
    queryKey:  ['users', params],
    queryFn:   () => usersApi.list(params),
    staleTime: 10_000,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserPayload) => usersApi.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserPayload }) => usersApi.update(id, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useToggleUserStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      usersApi.toggleStatus(id, is_active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useResetUserMfa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => securityAnomaliesApi.resetMfa(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function usePendingUsers() {
  return useQuery({
    queryKey: ['users/pending'],
    queryFn:  usersApi.listPending,
    staleTime: 10_000,
  })
}

export function useApproveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role, securityLevelId }: { id: number; role: string; securityLevelId: number }) =>
      usersApi.approve(id, role, securityLevelId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users/pending'] })
      void qc.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useRejectUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => usersApi.reject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users/pending'] }),
  })
}
