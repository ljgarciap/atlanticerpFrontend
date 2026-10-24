import api from './authApi'
import type {
  CountsResponse, ExcludedResponse, PagosResponse, SyncRunsResponse,
  VistaIcgDocumentoEntidad, VistaIcgDocumentoListResult,
  VistaIcgClienteListResult, VistaIcgClienteDetail,
  VistaIcgProveedorListResult, VistaIcgProveedorDetail,
  VistaIcgProductoListResult, VistaIcgProductoDetail,
  StockSyncSettingsInput, StockSyncStatusResponse,
} from '@/types/legacyMigration'
import type { LegacyDocumentResult } from '@/types/ventasDiseno'

// SCRUM-816 — dashboard de migración ICG, gate role:superadmin,management (bootstrap/app.php →
// routes/legacy.php).
export const legacyMigrationApi = {
  runs: (params: { entidad?: string; page?: number; per_page?: number } = {}): Promise<SyncRunsResponse> =>
    api.get<SyncRunsResponse>('/legacy/migracion/dashboard/runs', { params }).then(r => r.data),

  counts: (): Promise<CountsResponse> =>
    api.get<CountsResponse>('/legacy/migracion/dashboard/counts').then(r => r.data),

  excluded: (params: { entidad?: string; status?: string; page?: number; per_page?: number } = {}): Promise<ExcludedResponse> =>
    api.get<ExcludedResponse>('/legacy/migracion/dashboard/excluded', { params }).then(r => r.data),
}

// SCRUM-1114 — ajustes y estado de la sincronización de stock por delta (gate role:superadmin).
export const legacyStockSyncApi = {
  get: (): Promise<StockSyncStatusResponse> =>
    api.get<StockSyncStatusResponse>('/legacy/migracion/stock-sync').then(r => r.data),

  update: (payload: StockSyncSettingsInput): Promise<StockSyncStatusResponse> =>
    api.put<StockSyncStatusResponse>('/legacy/migracion/stock-sync', payload).then(r => r.data),
}

// SCRUM-827 — legacy.pagos, gate role:superadmin exclusivo (audiencia solo equipo técnico,
// más restrictivo que el dashboard de arriba).
export const legacyPagosApi = {
  list: (params: {
    estado?: string
    icg_origen?: string
    icg_tipodocumento?: string
    fecha_desde?: string
    fecha_hasta?: string
    page?: number
    per_page?: number
  } = {}): Promise<PagosResponse> =>
    api.get<PagosResponse>('/legacy/migracion/pagos', { params }).then(r => r.data),
}

// "Vista ICG" (SCRUM-749, 2026-09-03) — pantalla propia bajo Migración, gate role:superadmin
// exclusivo (mismo criterio que legacyPagosApi arriba). Cotizaciones/Pedidos/Albaranes/Facturas
// reusan LegacyDocumentResult de types/ventasDiseno.ts para el show — mismo LegacyDocumentPresenter
// del lado del backend que ya consume SubClientIcgHistoryModal.tsx.
export const legacyVistaIcgApi = {
  documentos: {
    list: (entidad: VistaIcgDocumentoEntidad, params: {
      fecha_desde?: string
      fecha_hasta?: string
      q?: string
      page?: number
      per_page?: number
    } = {}): Promise<VistaIcgDocumentoListResult> =>
      api.get<VistaIcgDocumentoListResult>(`/legacy/migracion/vista/${entidad}`, { params }).then(r => r.data),

    show: (entidad: VistaIcgDocumentoEntidad, id: number): Promise<LegacyDocumentResult> =>
      api.get<LegacyDocumentResult>(`/legacy/migracion/vista/${entidad}/${id}`).then(r => r.data),
  },

  clientes: {
    list: (params: { q?: string; page?: number; per_page?: number } = {}): Promise<VistaIcgClienteListResult> =>
      api.get<VistaIcgClienteListResult>('/legacy/migracion/vista/clientes', { params }).then(r => r.data),

    show: (id: number): Promise<VistaIcgClienteDetail> =>
      api.get<VistaIcgClienteDetail>(`/legacy/migracion/vista/clientes/${id}`).then(r => r.data),
  },

  proveedores: {
    list: (params: { q?: string; page?: number; per_page?: number } = {}): Promise<VistaIcgProveedorListResult> =>
      api.get<VistaIcgProveedorListResult>('/legacy/migracion/vista/proveedores', { params }).then(r => r.data),

    show: (id: number): Promise<VistaIcgProveedorDetail> =>
      api.get<VistaIcgProveedorDetail>(`/legacy/migracion/vista/proveedores/${id}`).then(r => r.data),
  },

  productos: {
    list: (params: { q?: string; page?: number; per_page?: number } = {}): Promise<VistaIcgProductoListResult> =>
      api.get<VistaIcgProductoListResult>('/legacy/migracion/vista/productos', { params }).then(r => r.data),

    show: (id: number): Promise<VistaIcgProductoDetail> =>
      api.get<VistaIcgProductoDetail>(`/legacy/migracion/vista/productos/${id}`).then(r => r.data),
  },
}
