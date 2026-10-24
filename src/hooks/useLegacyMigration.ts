import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { legacyMigrationApi, legacyPagosApi, legacyStockSyncApi } from '@/api/legacyMigrationApi'
import type { StockSyncSettingsInput } from '@/types/legacyMigration'

export function useLegacyMigrationRuns(params: { entidad?: string; page?: number; per_page?: number }) {
  return useQuery({
    queryKey: ['legacy-migracion/runs', params],
    queryFn:  () => legacyMigrationApi.runs(params),
    staleTime: 30_000,
  })
}

export function useLegacyMigrationCounts() {
  return useQuery({
    queryKey: ['legacy-migracion/counts'],
    queryFn:  () => legacyMigrationApi.counts(),
    staleTime: 30_000,
  })
}

export function useLegacyMigrationExcluded(params: { entidad?: string; status?: string; page?: number; per_page?: number }) {
  return useQuery({
    queryKey: ['legacy-migracion/excluded', params],
    queryFn:  () => legacyMigrationApi.excluded(params),
    staleTime: 30_000,
  })
}

export function useLegacyPagos(params: {
  estado?: string
  icg_origen?: string
  icg_tipodocumento?: string
  fecha_desde?: string
  fecha_hasta?: string
  page?: number
  per_page?: number
}) {
  return useQuery({
    queryKey: ['legacy-migracion/pagos', params],
    queryFn:  () => legacyPagosApi.list(params),
    staleTime: 30_000,
  })
}

// SCRUM-1114 — ajustes + últimas corridas de la sincronización de stock.
export function useStockSyncStatus() {
  return useQuery({
    queryKey: ['legacy-migracion/stock-sync'],
    queryFn:  () => legacyStockSyncApi.get(),
    staleTime: 30_000,
  })
}

export function useUpdateStockSyncSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: StockSyncSettingsInput) => legacyStockSyncApi.update(payload),
    // No `setQueryData` con la respuesta: se invalida y se vuelve a pedir (la respuesta del PUT es el mismo
    // shape, pero la lista de corridas y el resumen deben salir siempre de una sola fuente).
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['legacy-migracion/stock-sync'] })
      void qc.invalidateQueries({ queryKey: ['legacy-migracion/runs'] })
    },
  })
}
