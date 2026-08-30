import { useQuery } from '@tanstack/react-query'
import { gerenciaApi } from '@/api/gerenciaApi'
import type { GerenciaFilters } from '@/types/gerencia'

export function useGerenciaVendors() {
  return useQuery({
    queryKey: ['gerencia/vendors'],
    queryFn: () => gerenciaApi.vendors(),
    staleTime: 300_000,
  })
}

export function useGerenciaClients() {
  return useQuery({
    queryKey: ['gerencia/clients'],
    queryFn: () => gerenciaApi.clients(),
    staleTime: 300_000,
  })
}

export function useGerenciaHome(filters?: GerenciaFilters) {
  return useQuery({
    queryKey:  ['gerencia/home', filters],
    queryFn:   () => gerenciaApi.home(filters),
    staleTime: 60_000,
  })
}
