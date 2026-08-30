import { QueryClient } from '@tanstack/react-query'

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
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})
