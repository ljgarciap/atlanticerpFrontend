import api from './authApi'
import type {
  AdjustmentRequestLineDraft, AdjustmentRequestListResponse, AssistantLoad, KardexListResponse,
  OrderBoardFilters, OrderBoardResponse, OrderDetail,
  OrderStatusDetail, OrderStatusDocument, OrderStatusListResponse,
  PhysicalWarehouse, ProductSearchResult, ProductWarehouseStockResponse, WarehouseDetailResponse,
  RelocationRequestListResponse, RelocationRequestPayload, RelocationRequest, RelocationEstadoFilter,
  WarehouseLocationRow, WarehouseLocationMutationResponse,
  BodegaTeamMember, BodegaTeamMemberRole, BodegaHomeSummary, BodegaSettings,
  BodegaInventoryListResponse, BodegaInventoryDetail, BodegaInventoryFamilyDetail, BodegaInventoryFamilyListItem, BodegaPorServirResponse,
  BodegaEnCaminoResponse, BodegaConfirmArrivalPayload, BodegaConfirmArrivalResponse,
  OrderWarehouseBreakdownResponse, OrderConsolidatedPickingResponse, OrderInvoiceStatusResponse,
  AssignPickerResponse, StartPickingResponse, OrderPickingSheetResponse, PickingSheetItemPayload,
  UpdatePickingSheetResponse, CompletePickingResponse,
  InventoryReviewDecisionPayload, ResolveInventoryReviewResponse,
  ZonaLibreProvider, ZonaLibreRequestListResponse, ZonaLibreRequestDetail, ZonaLibreRequestPayload,
  ZonaLibreStatusFilter, ZonaLibreProductWarehouseBreakdownResponse,
  GeneralCountChip, GeneralCountCreatePayload, GeneralCountCreateResponse, GeneralCountDetail,
  GeneralCountEvaluatePayload, GeneralCountListResponse, GeneralCountRow,
  CustomerReturnStatusFilter, CustomerReturnListResponse, CustomerReturnDetail,
  ReturnSearchOrdersResponse, CreateCustomerReturnPayload, CreateCustomerReturnResponse,
  ConfirmReturnReceptionPayload, RejectCustomerReturnPayload, UploadReturnSignedDocumentResponse,
  ReturnDocumentUrlResponse,
  BodegaReportPeriodKey, BodegaProductivityReport, BodegaAdjustmentAccuracyReport,
  BodegaWarehouseCapacityReport, BodegaInventorySummaryReport,
  RegisterDeliveryPayload, RegisterDeliveryResponse, AssignCourierResponse, DispatchResponse,
  RegisterSignedGuidePayload, RegisterSignedGuideResponse,
  BodegaRutasDiaResponse,
} from '@/types/bodega'

// SCRUM-329 Batch B2 — parámetros de filtro de "Ver Inventario". Nombres verificados contra
// `BodegaInventoryController::index()` (reconciliación de contrato 2026-07-23): `family_id`/
// `rotation`/`provider_id`/`brand`, no los nombres en español usados en el batch especulativo
// original. `chip` acepta 2 valores deep-link-only además de los 4 con botón visible (mismo
// criterio que `LINKABLE_CHIPS` en `InventarioPage.tsx` de Compras, REQ-112): 'rotacion' (desde
// "Mayor rotación" de Home) y 'criticos' (desde "Artículos críticos" de Home) — ver
// `BodegaHomePage.tsx`. Ese par sigue en español porque son valores de `chip` (deep-link), no
// nombres de parámetro de filtro.
export interface BodegaInventoryListParams {
  search?:       string
  family_id?:    number
  estado?:       'disponible' | 'bajo_stock' | 'sin_stock'
  rotation?:     'alta' | 'media' | 'baja' | 'compra_unica'
  warehouse_id?: number
  provider_id?:  number
  brand?:        string
  chip?:         'todos' | 'en_atencion' | 'inactivos' | 'por_ingresar' | 'rotacion' | 'criticos'
  page?:         number
  per_page?:     number | 'all'
}
import type { OutlookCalendarEvent } from '@/types/calendar'

// SCRUM-451→456 (REQ-381→386) — pantalla "Bodegas".
export const bodegaApi = {
  // SCRUM-171 RN2 — ver docblock de `BodegaRutasDiaResponse` en types/bodega.ts.
  rutasDia: {
    // Ruta real: routes/bodega.php:33, dentro de Route::prefix('home') — confirmado en
    // Senior Review, el path asumido ('/bodega/rutas-dia') no coincidía con lo implementado.
    list: (): Promise<BodegaRutasDiaResponse> =>
      api.get<BodegaRutasDiaResponse>('/bodega/home/rutas-dia').then(r => r.data),
  },

  warehouses: {
    list: (): Promise<{ data: PhysicalWarehouse[] }> =>
      api.get<{ data: PhysicalWarehouse[] }>('/bodega/warehouses').then(r => r.data),

    show: (
      id: number,
      params?: {
        search?: string; categoria?: number; ubicacion?: string; chip?: string
        page?: number; per_page?: number | 'all'
      },
    ): Promise<WarehouseDetailResponse> =>
      api.get<WarehouseDetailResponse>(`/bodega/warehouses/${id}`, { params }).then(r => r.data),

    // SCRUM-454 (REQ-384, Bloque B4) — catálogo editable de ubicaciones físicas de una bodega,
    // base del chip "Espacio libre". Sin hard-delete (`update` con `is_active: false`).
    locations: {
      list: (warehouseId: number): Promise<{ data: WarehouseLocationRow[] }> =>
        api.get<{ data: WarehouseLocationRow[] }>(`/bodega/warehouses/${warehouseId}/locations`).then(r => r.data),

      create: (warehouseId: number, codigo: string): Promise<WarehouseLocationMutationResponse> =>
        api.post<WarehouseLocationMutationResponse>(`/bodega/warehouses/${warehouseId}/locations`, { codigo }).then(r => r.data),

      update: (
        warehouseId: number,
        id: number,
        patch: { codigo?: string; is_active?: boolean },
      ): Promise<WarehouseLocationMutationResponse> =>
        api.patch<WarehouseLocationMutationResponse>(`/bodega/warehouses/${warehouseId}/locations/${id}`, patch).then(r => r.data),
    },
  },

  // SCRUM-457/458/459 (REQ-387/388/389, Bloque B4 "Reubicación entre bodegas") — Bodega solicita
  // reubicar un producto de una bodega a otra, Mark aprueba/rechaza (mismo gate "exclusivo de
  // Mark" que `adjustmentRequests`, ver `RelocationRequestController::resolveMarkAccess()`).
  relocations: {
    list: (params?: { estado?: RelocationEstadoFilter; page?: number; per_page?: number | 'all' }): Promise<RelocationRequestListResponse> =>
      api.get<RelocationRequestListResponse>('/bodega/relocations', { params }).then(r => r.data),

    create: (payload: RelocationRequestPayload): Promise<{ id: number }> =>
      api.post<{ id: number }>('/bodega/relocations', payload).then(r => r.data),

    approve: (id: number): Promise<RelocationRequest> =>
      api.post<RelocationRequest>(`/bodega/relocations/${id}/approve`).then(r => r.data),

    reject: (id: number, motivoRechazo: string): Promise<RelocationRequest> =>
      api.post<RelocationRequest>(`/bodega/relocations/${id}/reject`, { motivo_rechazo: motivoRechazo }).then(r => r.data),
  },

  // SCRUM-467→472 (REQ-397→402) — Kardex.
  kardex: {
    list: (params?: {
      search?: string; tipo?: string; warehouse_id?: number; page?: number; per_page?: number | 'all'
    }): Promise<KardexListResponse> =>
      api.get<KardexListResponse>('/bodega/kardex', { params }).then(r => r.data),
  },

  // SCRUM-428/429/430/446/447/448/449/450 — Solicitud de ajuste.
  adjustmentRequests: {
    list: (params?: { estado?: string; page?: number; per_page?: number | 'all' }): Promise<AdjustmentRequestListResponse> =>
      api.get<AdjustmentRequestListResponse>('/bodega/adjustment-requests', { params }).then(r => r.data),

    searchProducts: (search: string): Promise<{ data: ProductSearchResult[] }> =>
      api.get<{ data: ProductSearchResult[] }>('/bodega/adjustment-requests/products/search', { params: { search } }).then(r => r.data),

    productWarehouseStock: (productId: number): Promise<ProductWarehouseStockResponse> =>
      api.get<ProductWarehouseStockResponse>(`/bodega/adjustment-requests/products/${productId}/warehouse-stock`).then(r => r.data),

    // SCRUM-797 RN7 — `confirmReplace` reintenta el mismo envío indicando que el usuario ya
    // revisó el aviso de duplicados (409, ver `AdjustmentDuplicateWarning`) y decide continuar.
    create: (catalogProductId: number, lines: AdjustmentRequestLineDraft[], confirmReplace = false): Promise<{ id: number }> => {
      const form = new FormData()
      form.append('catalog_product_id', String(catalogProductId))
      if (confirmReplace) form.append('confirm_replace', '1')
      lines.forEach((line, i) => {
        form.append(`lines[${i}][warehouse_id]`, String(line.warehouse_id))
        form.append(`lines[${i}][tipo]`, line.tipo)
        form.append(`lines[${i}][cantidad]`, String(line.cantidad))
        form.append(`lines[${i}][motivo]`, line.motivo)
        // SCRUM-428 (corrección de Daniela Amaya 2026-08-13) — ambos opcionales, solo se mandan
        // si tienen contenido (nunca un string vacío pisando algo en el backend).
        // TODO: backend batch4 — confirmar en Senior Review el nombre real de estos 2 campos
        // nuevos (worktree de Backend Dev en paralelo, ver memoria
        // project_estrategia_batch4_compras_bodega_20260815.md).
        if (line.descripcion?.trim()) form.append(`lines[${i}][descripcion]`, line.descripcion.trim())
        if (line.responsable?.trim()) form.append(`lines[${i}][responsable]`, line.responsable.trim())
        form.append(`lines[${i}][evidencia]`, line.evidencia)
      })
      return api.post<{ id: number }>('/bodega/adjustment-requests', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    approve: (lineId: number) =>
      api.post(`/bodega/adjustment-requests/lines/${lineId}/approve`).then(r => r.data),

    reject: (lineId: number, motivoRechazo: string) =>
      api.post(`/bodega/adjustment-requests/lines/${lineId}/reject`, { motivo_rechazo: motivoRechazo }).then(r => r.data),
  },

  // SCRUM-329 Oleada A / Batch A3 (REQ-305→335) — tablero "Pedidos".
  orders: {
    board: (params?: OrderBoardFilters): Promise<OrderBoardResponse> =>
      api.get<OrderBoardResponse>('/bodega/orders', { params }).then(r => r.data),

    assistantLoad: (): Promise<{ data: AssistantLoad[] }> =>
      api.get<{ data: AssistantLoad[] }>('/bodega/orders/assistant-load').then(r => r.data),

    detail: (id: number): Promise<OrderDetail> =>
      api.get<OrderDetail>(`/bodega/orders/${id}`).then(r => r.data),

    documentDownloadUrl: (orderId: number, documentId: number): Promise<{ url: string }> =>
      api.get<{ url: string }>(`/bodega/orders/${orderId}/documents/${documentId}/download`).then(r => r.data),

    // SCRUM-403 (REQ-333) — modal "Ver bodegas", desglose por bodega de TODOS los artículos del
    // pedido en una sola llamada (`WarehouseStockService::breakdownForProducts()`).
    warehouseBreakdown: (orderId: number): Promise<OrderWarehouseBreakdownResponse> =>
      api.get<OrderWarehouseBreakdownResponse>(`/bodega/orders/${orderId}/warehouse-breakdown`).then(r => r.data),

    // SCRUM-391 (REQ-321) — consolidado del día por picker (`PickingConsolidationService`).
    // `picker_id` es requerido por el backend (`Request::validate`) — no hay valor "todos".
    consolidatedPicking: (pickerId: number): Promise<OrderConsolidatedPickingResponse> =>
      api.get<OrderConsolidatedPickingResponse>('/bodega/orders/consolidated-picking', { params: { picker_id: pickerId } }).then(r => r.data),

    // SCRUM-401 (REQ-331) — alcance reducido (ver `OrderInvoiceStatusResponse`), solo
    // `invoice_ready` + `status_message`, nunca precios.
    invoice: (orderId: number): Promise<OrderInvoiceStatusResponse> =>
      api.get<OrderInvoiceStatusResponse>(`/bodega/orders/${orderId}/invoice`).then(r => r.data),

    // SCRUM-390 (REQ-320) — descarga a Excel de la tabla de detalle de artículos (el otro lugar,
    // Hoja de Picking, es un bloque separado sin pantalla en el frontend todavía). Blob (no una
    // URL directa): el endpoint exige el header `Authorization`, una navegación plana no lo manda
    // — mismo criterio que `comprasApi.orders.pdf`/`comprasApi.claims.pdf`.
    exportItemDetail: (orderId: number): Promise<Blob> =>
      api.get(`/bodega/orders/${orderId}/items/export`, { responseType: 'blob' }).then(r => r.data as Blob),

    // SCRUM-329 Oleada A / Batch A2 (SCRUM-383→386, REQ-313→316) — flujo de picking. Rutas
    // verificadas contra `OrderPickingController` real (`atlanticerp-backend`), no especulativo.
    assignPicker: (orderId: number, pickerId: number): Promise<AssignPickerResponse> =>
      api.post<AssignPickerResponse>(`/bodega/orders/${orderId}/assign-picker`, { picker_id: pickerId }).then(r => r.data),

    startPicking: (orderId: number): Promise<StartPickingResponse> =>
      api.post<StartPickingResponse>(`/bodega/orders/${orderId}/start-picking`).then(r => r.data),

    pickingSheet: (orderId: number): Promise<OrderPickingSheetResponse> =>
      api.get<OrderPickingSheetResponse>(`/bodega/orders/${orderId}/picking-sheet`).then(r => r.data),

    updatePickingSheet: (orderId: number, items: PickingSheetItemPayload[]): Promise<UpdatePickingSheetResponse> =>
      api.patch<UpdatePickingSheetResponse>(`/bodega/orders/${orderId}/picking-sheet`, { items }).then(r => r.data),

    completePicking: (orderId: number, items: PickingSheetItemPayload[]): Promise<CompletePickingResponse> =>
      api.post<CompletePickingResponse>(`/bodega/orders/${orderId}/complete-picking`, { items }).then(r => r.data),

    // Mismo patrón blob que `exportItemDetail` (el endpoint exige el header Authorization).
    exportPickingSheet: (orderId: number): Promise<Blob> =>
      api.get(`/bodega/orders/${orderId}/picking-sheet/export`, { responseType: 'blob' }).then(r => r.data as Blob),

    // SCRUM-387/388 (REQ-317/318) — resolución de la tarjeta "Revisión de Inventario". Backend ya
    // implementado y Pre-QA'd (ver `types/bodega.ts`), esta llamada es la parte que faltaba cablear.
    resolveInventoryReview: (orderId: number, decisions: InventoryReviewDecisionPayload[]): Promise<ResolveInventoryReviewResponse> =>
      api.post<ResolveInventoryReviewResponse>(`/bodega/orders/${orderId}/resolve-inventory-review`, { decisions }).then(r => r.data),

    // SCRUM-393/394/395 (REQ-323/324/325) — Packing -> Por despachar. Rutas verificadas contra
    // `OrderDeliveryController::registerDelivery()` real — el backend genera la Guía de Entrega,
    // notifica a Administración y crea la tarjeta "Faltante" si aplica, todo server-side; esta
    // llamada solo dispara la transición.
    registerDelivery: (orderId: number, payload: RegisterDeliveryPayload): Promise<RegisterDeliveryResponse> =>
      api.post<RegisterDeliveryResponse>(`/bodega/orders/${orderId}/register-delivery`, payload).then(r => r.data),

    // SCRUM-396 (REQ-326) — exclusivo del Jefe de Bodega (403 real si no); el backend propaga
    // automáticamente a los hermanos de familia en Por despachar sin repartidor propio.
    assignCourier: (orderId: number, courierId: number): Promise<AssignCourierResponse> =>
      api.post<AssignCourierResponse>(`/bodega/orders/${orderId}/assign-courier`, { courier_id: courierId }).then(r => r.data),

    // SCRUM-398 (REQ-328) — Por despachar -> Despachado. Sin payload — el backend calcula el
    // bloqueo (repartidor/factura) y despacha a los hermanos de familia que ya estén listos en la
    // MISMA llamada (`dispatched_siblings`). 422 con mensaje real si falta algo — nunca
    // pre-bloqueado client-side, el gate es siempre el del backend (`blockingReasonsForDispatch()`).
    dispatch: (orderId: number): Promise<DispatchResponse> =>
      api.post<DispatchResponse>(`/bodega/orders/${orderId}/dispatch`).then(r => r.data),

    // SCRUM-399/400 (REQ-329/330) — Despachado -> Entregado, automático al confirmar. Multipart
    // (mismo criterio que `returns.uploadSignedDocument`) — el backend exige `Authorization`.
    registerSignedGuide: (orderId: number, payload: RegisterSignedGuidePayload): Promise<RegisterSignedGuideResponse> => {
      const form = new FormData()
      form.append('delivered_by_courier_id', String(payload.delivered_by_courier_id))
      form.append('received_by_name', payload.received_by_name)
      form.append('file', payload.file)
      return api.post<RegisterSignedGuideResponse>(`/bodega/orders/${orderId}/register-signed-guide`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // Batch A4 (SCRUM-407→413) — pantalla "Status de Pedidos", solo lectura.
    status: {
      list: (params?: { search?: string }): Promise<OrderStatusListResponse> =>
        api.get<OrderStatusListResponse>('/bodega/orders/status', { params }).then(r => r.data),

      detail: (orderId: number): Promise<OrderStatusDetail> =>
        api.get<OrderStatusDetail>(`/bodega/orders/status/${orderId}`).then(r => r.data),

      // GET con efecto lateral (genera el documento en el backend) — se consume como mutation,
      // mismo criterio que `documentDownloadUrl` de arriba.
      document: (orderId: number): Promise<OrderStatusDocument> =>
        api.get<OrderStatusDocument>(`/bodega/orders/status/${orderId}/document`).then(r => r.data),
    },
  },

  // SCRUM-363→374 (REQ-293→304) — Home de Bodega. Verificado contra `BodegaHomeController`/
  // `BodegaHomeService` reales (`routes/bodega.php`): un solo endpoint de resumen, sin un
  // `/bodega/home/general` separado — `por_recibir`/`mayor_rotacion`/`articulos_criticos` (que NO
  // cambian con `scope`/`owner_id`, REQ-301/303/304 RN1) vienen en el mismo `summary()`.
  home: {
    team: (): Promise<{ data: BodegaTeamMember[] }> =>
      api.get<{ data: BodegaTeamMember[] }>('/bodega/home/team').then(r => r.data),

    summary: (filters: { scope?: 'own' | 'team'; owner_id?: number } = {}): Promise<BodegaHomeSummary> =>
      api.get<BodegaHomeSummary>('/bodega/home/summary', { params: filters }).then(r => r.data),
  },

  // Fix de regresión cruzada (2026-07-28) — `/bodega/home/team` quedó fijo a solo Asistentes
  // (`asistente_bodega`, ver arriba); este endpoint genérico es el que ahora usan los selectores
  // de Courier/Picker del tablero de Pedidos (`BodegaTeamMembersController`, fuera del namespace
  // `home` a propósito — no es un panel del Home). Mismo shape de respuesta que `home.team()`.
  teamMembers: {
    byRole: (role: BodegaTeamMemberRole): Promise<{ data: BodegaTeamMember[] }> =>
      api.get<{ data: BodegaTeamMember[] }>('/bodega/team-members', { params: { role } }).then(r => r.data),
  },

  // Mismo patrón que `ventasDisenoApi.calendar` (SCRUM-66/177) — solo lectura de Outlook real.
  calendar: {
    list: (filters: { scope?: 'own' | 'team'; owner_id?: number; from?: string; to?: string } = {}): Promise<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }> =>
      api.get<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }>('/bodega/calendar', { params: filters }).then(r => r.data),
  },

  // SCRUM-500 — mismo patrón REST que `comprasApi.settings`/`ventasDisenoApi.pricingSettings`
  // (GET/PUT sobre un solo recurso `/settings`, sin id). Ver nota de contrato en `types/bodega.ts`.
  settings: {
    get: (): Promise<BodegaSettings> =>
      api.get<BodegaSettings>('/bodega/settings').then(r => r.data),

    update: (data: Partial<BodegaSettings>): Promise<BodegaSettings> =>
      api.put<BodegaSettings>('/bodega/settings', data).then(r => r.data),
  },

  // SCRUM-329 Batch B2 (REQ-344→362, SCRUM-414→432) — "Ver Inventario". Rutas verificadas contra
  // `BodegaInventoryController`/`routes/bodega.php` reales (reconciliación de contrato 2026-07-23,
  // ver `types/bodega.ts` para el detalle de qué cambió respecto al batch especulativo original).
  inventory: {
    list: (params: BodegaInventoryListParams = {}): Promise<BodegaInventoryListResponse> =>
      api.get<BodegaInventoryListResponse>('/bodega/inventory', { params }).then(r => r.data),

    // SCRUM-425 (REQ-355) — "Ver ficha técnica". `BodegaInventoryController::show()` ya existe y
    // ya está gateado con `bodega.read` (a diferencia de `/compras/inventory/{id}`, que no acepta
    // bodega.read en su OR de permisos — ver `InventoryController::resolveAccess()`), pero el
    // frontend nunca había wireado esta ruta: `ProductDetailModal` de Bodega arma todo desde la
    // fila que ya trae la lista, sin fetch propio. Se agrega acá, fetch lazy (solo al abrir el
    // sub-modal de ficha técnica) para no pagar una llamada extra en cada "Ver Detalle".
    get: (id: number): Promise<BodegaInventoryDetail> =>
      api.get<BodegaInventoryDetail>(`/bodega/inventory/${id}`).then(r => r.data),

    families: {
      // Fix Pre-QA 2026-07-23 — la pestana "Familias" y el filtro "Categoria" usaban por error
      // `ventasDisenoApi.catalogProductFamilies.list()` (requiere `ventas_diseno.read`, que ningun
      // rol de Bodega tiene) en vez de este endpoint real ya gateado con `bodega.read`. Ver
      // `docs/pre-qa/bloque-b2-ver-inventario-20260723.md`.
      list: (): Promise<{ data: BodegaInventoryFamilyListItem[] }> =>
        api.get<{ data: BodegaInventoryFamilyListItem[] }>('/bodega/inventory/families').then(r => r.data),

      get: (id: number): Promise<BodegaInventoryFamilyDetail> =>
        api.get<BodegaInventoryFamilyDetail>(`/bodega/inventory/families/${id}`).then(r => r.data),
    },

    // SCRUM-423 (REQ-354) — modal "Por servir". Nombre de ruta real: "commitment-detail" (no
    // "por-servir") — deliberado del lado del backend para no confundirse en código con
    // `InventoryKpiService::porServirMap()` (concepto DISTINTO, reservas de Ventas & Diseño).
    porServir: (id: number): Promise<BodegaPorServirResponse> =>
      api.get<BodegaPorServirResponse>(`/bodega/inventory/${id}/commitment-detail`).then(r => r.data),

    // SCRUM-424 (REQ-355) — modal "En camino".
    enCamino: (id: number): Promise<BodegaEnCaminoResponse> =>
      api.get<BodegaEnCaminoResponse>(`/bodega/inventory/${id}/en-camino-detail`).then(r => r.data),

    // SCRUM-427 (REQ-357) — "Confirmar llegada física", acción POR PRODUCTO (ver nota de
    // reconciliación en `types/bodega.ts`: no es una acción de encabezado agrupada).
    confirmArrival: (id: number, payload: BodegaConfirmArrivalPayload): Promise<BodegaConfirmArrivalResponse> =>
      api.post<BodegaConfirmArrivalResponse>(`/bodega/inventory/${id}/confirm-arrival`, payload).then(r => r.data),

    // SCRUM-437 (REQ-367) — modal "Ver bodegas" del buscador de Zona Libre (3C). Producto-scoped,
    // no depende de que exista una orden — mismo endpoint que usaría cualquier otra pantalla de
    // Bodega que necesite desglose por bodega de un producto puntual.
    warehouseBreakdown: (catalogProductId: number): Promise<ZonaLibreProductWarehouseBreakdownResponse> =>
      api.get<ZonaLibreProductWarehouseBreakdownResponse>(`/bodega/inventory/${catalogProductId}/warehouse-breakdown`).then(r => r.data),
  },

  // Batch B3 (SCRUM-433→445, REQ-363→375) — "Zona Libre de Colón". Rutas verificadas contra
  // `routes/bodega.php` + los controllers/DTOs reales, ya pusheados a `dev` (backend completo,
  // 1251 tests verdes, PHPStan level 8 limpio) — ver `types/bodega.ts` para el detalle de contrato.
  zonaLibre: {
    provider: (): Promise<ZonaLibreProvider> =>
      api.get<ZonaLibreProvider>('/bodega/zona-libre/provider').then(r => r.data),

    requests: {
      list: (params?: { status?: ZonaLibreStatusFilter; page?: number; per_page?: number | 'all' }): Promise<ZonaLibreRequestListResponse> =>
        api.get<ZonaLibreRequestListResponse>('/bodega/zona-libre/requests', { params }).then(r => r.data),

      create: (payload: ZonaLibreRequestPayload): Promise<ZonaLibreRequestDetail> =>
        api.post<ZonaLibreRequestDetail>('/bodega/zona-libre/requests', payload).then(r => r.data),

      get: (id: number): Promise<ZonaLibreRequestDetail> =>
        api.get<ZonaLibreRequestDetail>(`/bodega/zona-libre/requests/${id}`).then(r => r.data),

      // SCRUM-797 (revierte SCRUM-440) — solo mientras la solicitud siga `pendiente`; 422/403 si no.
      update: (id: number, payload: ZonaLibreRequestPayload): Promise<ZonaLibreRequestDetail> =>
        api.put<ZonaLibreRequestDetail>(`/bodega/zona-libre/requests/${id}`, payload).then(r => r.data),

      // SCRUM-445 (REQ-375) — dispara un email real server-side (`NotificationService`); 422 si la
      // solicitud ya no está `pendiente` (ver mensaje estructurado que el frontend surface-ea).
      remind: (id: number): Promise<{ message: string }> =>
        api.post<{ message: string }>(`/bodega/zona-libre/requests/${id}/remind`).then(r => r.data),
    },
  },

  // Bloque B5 (SCRUM-460→466, REQ-390→396) — "Inventario general". Rutas verificadas contra
  // `GeneralCountController`/`routes/bodega.php` reales, ya pusheados a `dev` (atlanticerp-backend
  // commits ae1d6c0/ff3b345/a8d1b5d, 21/21 tests) — no especulativo.
  generalCounts: {
    list: (params?: { estado?: GeneralCountChip | string; page?: number; per_page?: number | 'all' }): Promise<GeneralCountListResponse> =>
      api.get<GeneralCountListResponse>('/bodega/general-counts', { params }).then(r => r.data),

    create: (payload: GeneralCountCreatePayload): Promise<GeneralCountCreateResponse> =>
      api.post<GeneralCountCreateResponse>('/bodega/general-counts', payload).then(r => r.data),

    detail: (id: number): Promise<GeneralCountDetail> =>
      api.get<GeneralCountDetail>(`/bodega/general-counts/${id}`).then(r => r.data),

    // Idempotente del lado del backend — recalcula todo de cero en cada llamada (ver nota en
    // `types/bodega.ts`), por eso siempre manda el payload completo, nunca un delta.
    evaluate: (id: number, payload: GeneralCountEvaluatePayload): Promise<GeneralCountDetail> =>
      api.post<GeneralCountDetail>(`/bodega/general-counts/${id}/evaluate`, payload).then(r => r.data),

    // Requiere estado `evaluado` (422 si no) — el frontend además gatea el botón client-side
    // (RN1 de REQ-393). El aviso de cruce (RN de REQ-393/394) se resuelve ANTES de llamar esto.
    // SCRUM-797 RN7 — `confirmReplace` reintenta indicando que el usuario ya revisó el aviso de
    // otro conteo sin resolver para la misma bodega (409, ver `GeneralCountDuplicateWarning`).
    submit: (id: number, confirmReplace = false): Promise<GeneralCountDetail> =>
      api.post<GeneralCountDetail>(`/bodega/general-counts/${id}/submit`, { confirm_replace: confirmReplace }).then(r => r.data),

    // Exclusivo de Mark (403 si no) — mismo gate que `adjustmentRequests`/`relocations`, sin gate
    // visual nuevo de verdad (los botones se muestran a todos, ver `IcoLock` en la pantalla).
    approve: (id: number): Promise<GeneralCountRow> =>
      api.post<GeneralCountRow>(`/bodega/general-counts/${id}/approve`).then(r => r.data),

    reject: (id: number, motivoRechazo: string): Promise<GeneralCountRow> =>
      api.post<GeneralCountRow>(`/bodega/general-counts/${id}/reject`, { motivo_rechazo: motivoRechazo }).then(r => r.data),

    // REQ-396 — "Realizar ajuste", solo válido si `estado=aprobada` y `aplicado_at` es `null`
    // (422 si ya se aplicó — el backend es la fuente de verdad de idempotencia).
    apply: (id: number): Promise<GeneralCountRow> =>
      api.post<GeneralCountRow>(`/bodega/general-counts/${id}/apply`).then(r => r.data),

    // SCRUM-462 (REQ-392, rebote de Daniela Amaya 2026-08-14) — "Eliminar" un conteo en borrador
    // (`pendiente_evaluacion`/`evaluado`, nunca enviado a aprobación). Solo válido en esos 2
    // estados — el frontend ya gatea qué filas ofrecen el botón (ver RowAction), pero el backend
    // es la fuente de verdad real de qué se puede borrar.
    // TODO: backend batch4 — endpoint todavía no existe en el backend real al momento de este
    // commit (worktree de Backend Dev en paralelo, ver memoria
    // project_estrategia_batch4_compras_bodega_20260815.md). Reconciliar en Senior Review.
    delete: (id: number): Promise<void> =>
      api.delete(`/bodega/general-counts/${id}`).then(() => undefined),
  },

  // Bloque B6 (SCRUM-473→489, REQ-403→419) — "Devoluciones" (customer returns). Backend ya
  // implementado localmente en `atlanticerp-backend` `dev` (commit 4ab8513), corriendo en Docker local
  // (localhost:8090) — todavía sin push a origin (pendiente Senior Review + Pre-QA). Contrato
  // tomado del brief de la tarea, no de una lectura directa del controller real.
  returns: {
    list: (params?: { status?: CustomerReturnStatusFilter; page?: number; per_page?: number | 'all' }): Promise<CustomerReturnListResponse> =>
      api.get<CustomerReturnListResponse>('/bodega/returns', { params }).then(r => r.data),

    // REQ-415 — autocompletado de Cliente/Proyecto/tabla de productos en una sola llamada.
    searchOrders: (q: string): Promise<ReturnSearchOrdersResponse> =>
      api.get<ReturnSearchOrdersResponse>('/bodega/returns/search-orders', { params: { q } }).then(r => r.data),

    create: (payload: CreateCustomerReturnPayload): Promise<CreateCustomerReturnResponse> =>
      api.post<CreateCustomerReturnResponse>('/bodega/returns', payload).then(r => r.data),

    detail: (id: number): Promise<CustomerReturnDetail> =>
      api.get<CustomerReturnDetail>(`/bodega/returns/${id}`).then(r => r.data),

    // Multipart: file jpg/jpeg/png/pdf, max 20MB (validado también client-side antes de enviar).
    uploadSignedDocument: (id: number, file: File): Promise<UploadReturnSignedDocumentResponse> => {
      const form = new FormData()
      form.append('file', file)
      return api.post<UploadReturnSignedDocumentResponse>(`/bodega/returns/${id}/signed-document`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // SCRUM-478 (rebote 2026-08-16) — a diferencia de formUrl/deliveryGuideUrl, no genera nada
    // nuevo: solo presigna el archivo que ya subió uploadSignedDocument().
    signedDocumentUrl: (id: number): Promise<ReturnDocumentUrlResponse> =>
      api.get<ReturnDocumentUrlResponse>(`/bodega/returns/${id}/signed-document`).then(r => r.data),

    // GET con efecto lateral (genera/regenera el PDF presignado) — mismo criterio que
    // `orders.status.document`, consumido como mutation on-demand.
    formUrl: (id: number): Promise<ReturnDocumentUrlResponse> =>
      api.get<ReturnDocumentUrlResponse>(`/bodega/returns/${id}/form`).then(r => r.data),

    deliveryGuideUrl: (id: number): Promise<ReturnDocumentUrlResponse> =>
      api.get<ReturnDocumentUrlResponse>(`/bodega/returns/${id}/delivery-guide`).then(r => r.data),

    confirmReception: (id: number, payload: ConfirmReturnReceptionPayload): Promise<CustomerReturnDetail> =>
      api.post<CustomerReturnDetail>(`/bodega/returns/${id}/confirm-reception`, payload).then(r => r.data),

    // REQ-411 RN2 — rechazo exclusivo de Bodega (`bodega.write`), sin gate de aprobación de Mark.
    reject: (id: number, payload: RejectCustomerReturnPayload): Promise<CustomerReturnDetail> =>
      api.post<CustomerReturnDetail>(`/bodega/returns/${id}/reject`, payload).then(r => r.data),
  },

  // SCRUM-490→495 (REQ-420→425, "Reportes de Bodega"). Las 4 rutas aceptan el mismo `period`
  // ('month'/'quarter'/'year', default 'month' si se omite) — RN1 de REQ-420: el selector de
  // período de la pantalla aplica a los 4 reportes a la vez, ver `ReportPeriodContext.tsx`.
  reports: {
    productivity: (period?: BodegaReportPeriodKey): Promise<BodegaProductivityReport> =>
      api.get<BodegaProductivityReport>('/bodega/reports/productivity', { params: { period } }).then(r => r.data),

    adjustmentAccuracy: (period?: BodegaReportPeriodKey): Promise<BodegaAdjustmentAccuracyReport> =>
      api.get<BodegaAdjustmentAccuracyReport>('/bodega/reports/adjustment-accuracy', { params: { period } }).then(r => r.data),

    warehouseCapacity: (period?: BodegaReportPeriodKey): Promise<BodegaWarehouseCapacityReport> =>
      api.get<BodegaWarehouseCapacityReport>('/bodega/reports/warehouse-capacity', { params: { period } }).then(r => r.data),

    inventorySummary: (period?: BodegaReportPeriodKey): Promise<BodegaInventorySummaryReport> =>
      api.get<BodegaInventorySummaryReport>('/bodega/reports/inventory-summary', { params: { period } }).then(r => r.data),
  },
}
