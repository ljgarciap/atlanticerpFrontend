import { QueryClient } from '@tanstack/react-query'
import { SERVER_BUSY_CODE } from '@/lib/serverBusyRetry'

/**
 * Singleton compartido por App.tsx (QueryClientProvider) y authStore.ts
 * (clearAuth/setAuth) -- extraído a su propio módulo para que authStore
 * pueda limpiar el cache sin crear un import circular con App.tsx.
 *
 * Sin esta limpieza, un logout→login en la misma pestaña (sin recarga de
 * página) dejaba el cache de la sesión anterior intacto: las query keys
 * (ej. ['ventas-diseno-pipeline', scope, ...]) no incluyen usuario, así
 * que la nueva sesión heredaba datos de la anterior hasta el próximo
 * refetch (ver docs/specs/session-scoped-query-cache.md).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // El 503 `server_busy` ya se reintentó con espera variable en el cliente HTTP (authApi.ts): un reintento más de Query a 1 s fijo solo volvería a juntar las llamadas.
      retry: (failureCount, error) => (error as { response?: { data?: { code?: string } } })?.response?.data?.code === SERVER_BUSY_CODE ? false : failureCount < 1,
      staleTime: 30_000,
    },
  },
})
