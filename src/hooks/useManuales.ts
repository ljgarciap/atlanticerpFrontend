import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { manualesApi } from '@/api/manualesApi'

export const MANUALES_KEY = ['manuales'] as const
export const MANUALES_CONFIG_KEY = ['manuales', 'config'] as const

export function useManuales() {
  return useQuery({ queryKey: MANUALES_KEY, queryFn: manualesApi.list })
}

// Solo se monta para quien tiene manuales.manage (el endpoint responde 403 al resto).
export function useManualesConfig(enabled: boolean) {
  return useQuery({ queryKey: MANUALES_CONFIG_KEY, queryFn: manualesApi.getConfig, enabled })
}

export function useDeleteManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => manualesApi.remove(id),
    // invalidateQueries, nunca setQueryData con la respuesta de la mutation (ver memoria del proyecto).
    onSuccess: () => qc.invalidateQueries({ queryKey: MANUALES_KEY }),
  })
}
