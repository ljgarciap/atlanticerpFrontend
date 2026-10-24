import axios from 'axios'
import type {
  LumoBitacorasResponse,
  LumoExchangeResponse,
  LumoBitacorasSortField,
  LumoVendedorOption,
} from '@/types/lumo'

// SCRUM-925 — cliente cross-origin directo hacia lumo.atlanticerp.ai (pasos 2/3 del Identity Bridge).
// Primer precedente en el repo de un cliente HTTP que NO apunta a la base de AtlanticERP (`/api` de
// authApi.ts) — a propósito separado, para que no se confunda con el cliente `api` normal ni
// herede su interceptor de Authorization (ese manda el JWT de AtlanticERP, acá va el access token de
// LUMO). Hoy solo funciona contra atlanticerp.ai/www.atlanticerp.ai (CORS de LUMO), no dev/test.
const lumoClient = axios.create({
  baseURL: 'https://lumo.atlanticerp.ai/api',
  headers: { Accept: 'application/json' },
})

export interface LumoBitacorasParams {
  vendedor?:  number
  fecha?:     string
  desde?:     string
  hasta?:     string
  ordering?:  string
  page?:      number
  page_size?: number
}

export const lumoIdentityBridge = {
  exchange: (code: string): Promise<LumoExchangeResponse> =>
    lumoClient.post<LumoExchangeResponse>('/identity-bridge/exchange/', { code }).then(r => r.data),

  bitacoras: (accessToken: string, params: LumoBitacorasParams): Promise<LumoBitacorasResponse> =>
    lumoClient
      .get<LumoBitacorasResponse>('/admin/bitacoras/', {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
      })
      .then(r => r.data),

  // SCRUM-946 — opciones del filtro "Vendedor". Endpoint aparte del CRUD de vendedores de LUMO
  // (ese sigue vedado al rol viewer_externo): solo lectura, id + nombre, sin paginar.
  vendedores: (accessToken: string): Promise<LumoVendedorOption[]> =>
    lumoClient
      .get<LumoVendedorOption[]>('/admin/bitacoras/vendedores/', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .then(r => r.data),
}

export function buildOrdering(field: LumoBitacorasSortField, dir: 'asc' | 'desc'): string {
  return dir === 'desc' ? `-${field}` : field
}
