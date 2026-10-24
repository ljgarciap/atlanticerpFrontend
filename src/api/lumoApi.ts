import api from './authApi'
import type { LumoBitacorasCodeResponse } from '@/types/lumo'

// SCRUM-925 — paso 1 del Identity Bridge de LUMO: AtlanticERP (server-to-server) le pide un código de
// un solo uso a lumo-backend con la LUMO_API_KEY (nunca expuesta acá) y se lo entrega fresco al
// frontend en cada carga de /lumo. El intercambio real (paso 2) es cross-origin directo contra
// LUMO — ver src/lib/lumoIdentityBridge.ts, cliente aparte sin base URL de AtlanticERP.
export const lumoApi = {
  getBitacorasCode: (): Promise<LumoBitacorasCodeResponse> =>
    api.post<LumoBitacorasCodeResponse>('/lumo/bitacoras-code').then(r => r.data),
}
