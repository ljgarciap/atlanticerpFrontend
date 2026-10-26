import { useAuthStore } from '@/store/authStore'
import { DEFAULT_FISCAL_ID, type FiscalId } from '@/lib/region'

/** Fase 6c — la identificación fiscal del país de la empresa (nombre y si lleva DV). Panamá por omisión. */
export function useFiscalId(): FiscalId {
  return useAuthStore(s => s.user?.fiscal_id) ?? DEFAULT_FISCAL_ID
}

/** Patrón del DV según el país: 1 a `dv_max_length` dígitos. */
export function dvPattern(fiscalId: FiscalId): RegExp {
  return new RegExp(`^\\d{1,${Math.max(fiscalId.dv_max_length, 1)}}$`)
}
