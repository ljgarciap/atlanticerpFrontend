import api from './authApi'
import type { SoporteWidgetCodeResponse } from '@/types/soporte'

// SCRUM-923 — AtlanticERP pide un código de un solo uso a tickets-backend (server-to-server, API key
// nunca expuesta acá) y se lo entrega fresco al widget en cada carga de /soporte, nunca cacheado.
export const soporteApi = {
  getWidgetCode: (): Promise<SoporteWidgetCodeResponse> =>
    api.post<SoporteWidgetCodeResponse>('/soporte/widget-code').then(r => r.data),
}
