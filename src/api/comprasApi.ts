import api from './authApi'
import type {
  ProviderListResponse, ProviderDetail, ProviderPayload,
  PurchaseOrderListResponse, PurchaseOrderDetail, PurchaseOrderPayload,
  ApprovedProject, ComprasSettings, ComprasCatalogProduct,
  ShippingInfoPayload, PurchaseOrderDocument, DocumentCategory,
  LiquidationAgency, LiquidationAgencyPayload, ProviderConfirmationValidation,
  LiquidationAgencySummaryResponse, LiquidationAgencyDetail,
  LiquidationAgencyContact, LiquidationAgencyContactPayload, LiquidationAgencyPaymentPayload,
  PurchaseOrderPayment,
  PurchaseOrderClaimListResponse, PurchaseOrderClaimDetail, PurchaseOrderClaimPayload, PurchaseOrderClaimPhoto,
  ClaimListParams,
  ReplacementRequest, ReplacementRequestListResponse, CreateReplacementRequestPayload, SubstituteSearchPoll,
  ReportGranularity, PurchasedByPeriodResponse, ProviderRatingResponse, ClaimsReportResponse,
  InventoryKpis, LiquidationImportsResponse, PurchaseOpportunityResponse,
  InventoryListResponse, InventoryProduct, InventoryProductPayload, InventoryChip,
  Warehouse, WarehouseStockRow, OrderPrefill, InventoryFamilyDetail, InventoryFamilyListResponse, ConfirmPendingResponse,
  InventoryTechnicalSheetResponse,
  GoodsReceiptEligibleOrder, GoodsReceiptOrderProducts, GoodsReceiptDetail, GoodsReceiptListResponse,
  GoodsReceiptPayload, GoodsReceiptPartialInfo, GoodsReceiptInvoiceMatchPoll,
  ComprasHomeSummary,
} from '@/types/compras'
import type { OutlookCalendarEvent } from '@/types/calendar'

export interface ProviderListParams {
  search?:       string
  category?:     string
  rating_range?: 'low'
  rating_min?:   number
  rating_max?:   number
  page?:         number
  per_page?:     number | 'all'
  sort_by?:      string
  sort_dir?:     'asc' | 'desc'
}

export interface PurchaseOrderListParams {
  search?:            string
  provider_id?:      number
  status?:            string
  created_by?:        number
  sales_project_id?:  number
  // REQ-139: 'critical' | 'zona_libre' — REQ-138 dice "Todas" cuando no se manda chip.
  // REQ-152 (Logística) reusa 'critical' como "Retrasados", mismo criterio.
  chip?:               'critical' | 'zona_libre'
  // REQ-151 — solo envíos "en movimiento" (Ordenado→Recibido), usado por la pantalla Logística.
  active_shipments?:    boolean
  // REQ-187 (SCRUM-250, hallazgo de Gerencia Test) — pantalla Pagos a Proveedores. 'pendiente' se
  // dividió en 'sin_enviar'/'por_pagar'.
  payment_pending?:     boolean
  payment_status?:      'sin_enviar' | 'por_pagar' | 'parcial' | 'completo'
  page?:                number
  per_page?:            number | 'all'
  sort_by?:             string
  sort_dir?:            'asc' | 'desc'
}

export interface InventoryListParams {
  search?:        string
  chip?:          InventoryChip
  page?:          number
  per_page?:      number | 'all'
  sort_by?:       string
  sort_dir?:      'asc' | 'desc'
  // SCRUM-743 — filtro multiselección de Bodegas. Ausente/vacío = sin filtro (todas las
  // bodegas, nunca tabla vacía por default); 2+ IDs = unión/OR, resuelto en el backend. Axios
  // serializa el array como `warehouse_ids[]=<id>&warehouse_ids[]=<id>...` (default, sin
  // paramsSerializer custom) — forma que el backend ya espera, ver diseño técnico del batch.
  warehouse_ids?: number[]
}

// SCRUM-183→196 (REQ-120→133) — mismo patrón anidado por sub-recurso que ventasDisenoApi.
export const comprasApi = {
  providers: {
    list: (params: ProviderListParams = {}): Promise<ProviderListResponse> =>
      api.get<ProviderListResponse>('/compras/providers', { params }).then(r => r.data),

    get: (id: number): Promise<ProviderDetail> =>
      api.get<ProviderDetail>(`/compras/providers/${id}`).then(r => r.data),

    create: (data: ProviderPayload): Promise<ProviderDetail> =>
      api.post<ProviderDetail>('/compras/providers', data).then(r => r.data),

    update: (id: number, data: ProviderPayload): Promise<ProviderDetail> =>
      api.put<ProviderDetail>(`/compras/providers/${id}`, data).then(r => r.data),
  },

  orders: {
    list: (params: PurchaseOrderListParams = {}): Promise<PurchaseOrderListResponse> =>
      api.get<PurchaseOrderListResponse>('/compras/orders', { params }).then(r => r.data),

    get: (id: number): Promise<PurchaseOrderDetail> =>
      api.get<PurchaseOrderDetail>(`/compras/orders/${id}`).then(r => r.data),

    create: (data: PurchaseOrderPayload): Promise<PurchaseOrderDetail> =>
      api.post<PurchaseOrderDetail>('/compras/orders', data).then(r => r.data),

    // REQ-144 — solo permitido mientras la orden está "Por aprobar" (el backend lo valida).
    update: (id: number, data: PurchaseOrderPayload): Promise<PurchaseOrderDetail> =>
      api.put<PurchaseOrderDetail>(`/compras/orders/${id}`, data).then(r => r.data),

    approve: (id: number): Promise<PurchaseOrderDetail> =>
      api.patch<PurchaseOrderDetail>(`/compras/orders/${id}/approve`).then(r => r.data),

    // REQ-142/143 — avanza al siguiente estado; 422 si falta la aprobación de Mark.
    advance: (id: number): Promise<PurchaseOrderDetail> =>
      api.patch<PurchaseOrderDetail>(`/compras/orders/${id}/advance`).then(r => r.data),

    // SCRUM-208 (rediseño 2026-08-15) — avanza el REMANENTE de una recepción parcial por sus
    // propias etapas, independiente del `status` de la orden. Backend ya implementado (ver
    // docs/architecture/scrum208-recepcion-parcial-rediseno.md), expone `next_remainder_status`.
    advanceRemainder: (id: number): Promise<PurchaseOrderDetail> =>
      api.patch<PurchaseOrderDetail>(`/compras/orders/${id}/advance-remainder`).then(r => r.data),

    // SCRUM-208 (rediseño 2026-08-15) — confirma a Inventario TODAS las líneas "Por ingresar" de
    // ESTA orden puntual, sin esperar a que `status` llegue a "Recibido". Root cause real del
    // reporte de Daniela: la capacidad manual ya existía (`inventory.confirmPending` abajo) pero
    // acotada por PRODUCTO en TODAS las órdenes y solo alcanzable desde /inventario, desconectada
    // del contexto de la orden — este endpoint la acota a la orden puntual.
    confirmPendingReceipts: (id: number): Promise<PurchaseOrderDetail> =>
      api.patch<PurchaseOrderDetail>(`/compras/orders/${id}/confirm-pending-receipts`).then(r => r.data),

    // REQ-149/136 — PDF real (dompdf) en 2 versiones. Blob (no una URL directa): el endpoint
    // exige JWT vía header Authorization, que una navegación de browser plana (<a href>,
    // window.open) no puede mandar — se pide con axios y se abre desde un object URL.
    pdf: (id: number, includeCost: boolean): Promise<Blob> =>
      api.get(`/compras/orders/${id}/pdf`, {
        params: { include_cost: includeCost ? '1' : '0' },
        responseType: 'blob',
      }).then(r => r.data as Blob),

    // REQ-136 — envío por correo al proveedor (encolado, no síncrono).
    sendEmail: (id: number, includeCost: boolean): Promise<{ message: string }> =>
      api.post<{ message: string }>(`/compras/orders/${id}/send-email`, { include_cost: includeCost })
        .then(r => r.data),

    // REQ-156 — contenedor/naviera/llegada real, editable sin importar el estado de la orden.
    updateShippingInfo: (id: number, data: ShippingInfoPayload): Promise<PurchaseOrderDetail> =>
      api.patch<PurchaseOrderDetail>(`/compras/orders/${id}/shipping-info`, data).then(r => r.data),

    // SCRUM-210 (REQ-147, alcance reducido) — solo órdenes Zona Libre (el backend lo valida).
    liquidate: (id: number, agencyId: number): Promise<PurchaseOrderDetail> =>
      api.patch<PurchaseOrderDetail>(`/compras/orders/${id}/liquidate`, { agency_id: agencyId }).then(r => r.data),

    // SCRUM-250→253 (REQ-187→190) — Pagos a Proveedores.
    requestPayment: (id: number): Promise<{ payment_requested_at: string }> =>
      api.patch<{ payment_requested_at: string }>(`/compras/orders/${id}/request-payment`).then(r => r.data),

    requestAmountChange: (id: number, newAmount: number): Promise<{ pending_amount_change: number; amount_change_requested_by: number }> =>
      api.patch<{ pending_amount_change: number; amount_change_requested_by: number }>(
        `/compras/orders/${id}/request-amount-change`, { new_amount: newAmount }
      ).then(r => r.data),

    approveAmountChange: (id: number): Promise<{ total_amount: number }> =>
      api.patch<{ total_amount: number }>(`/compras/orders/${id}/approve-amount-change`).then(r => r.data),

    // SCRUM-252 (hallazgo de Gerencia Test) — "Rechazar cambio", solo Mark.
    rejectAmountChange: (id: number): Promise<{ total_amount: number }> =>
      api.patch<{ total_amount: number }>(`/compras/orders/${id}/reject-amount-change`).then(r => r.data),
  },

  payments: {
    list: (orderId: number): Promise<{ data: PurchaseOrderPayment[] }> =>
      api.get<{ data: PurchaseOrderPayment[] }>(`/compras/orders/${orderId}/payments`).then(r => r.data),

    // REQ-189 Escenario 1 — comprobante obligatorio.
    register: (orderId: number, amount: number, proof: File): Promise<PurchaseOrderPayment> => {
      const form = new FormData()
      form.append('amount', String(amount))
      form.append('proof', proof)
      return api.post<PurchaseOrderPayment>(`/compras/orders/${orderId}/payments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },
  },

  liquidationAgencies: {
    search: (search = ''): Promise<{ data: LiquidationAgency[] }> =>
      api.get<{ data: LiquidationAgency[] }>('/compras/liquidation-agencies', { params: { search } }).then(r => r.data),

    create: (data: LiquidationAgencyPayload): Promise<LiquidationAgency> =>
      api.post<LiquidationAgency>('/compras/liquidation-agencies', data).then(r => r.data),

    // SCRUM-254 (REQ-191)
    summary: (page?: number, per_page?: number | 'all'): Promise<LiquidationAgencySummaryResponse> =>
      api.get<LiquidationAgencySummaryResponse>('/compras/liquidation-agencies/summary', { params: { page, per_page } }).then(r => r.data),

    // SCRUM-256 (REQ-193)
    get: (id: number): Promise<LiquidationAgencyDetail> =>
      api.get<LiquidationAgencyDetail>(`/compras/liquidation-agencies/${id}`).then(r => r.data),

    // SCRUM-254 (REQ-191) — carga manual de situación de pago (mock, ver types/compras.ts).
    updatePayment: (id: number, data: LiquidationAgencyPaymentPayload): Promise<LiquidationAgency> =>
      api.put<LiquidationAgency>(`/compras/liquidation-agencies/${id}`, data).then(r => r.data),

    // SCRUM-255 (REQ-192)
    contacts: {
      create: (agencyId: number, data: LiquidationAgencyContactPayload): Promise<LiquidationAgencyContact> =>
        api.post<LiquidationAgencyContact>(`/compras/liquidation-agencies/${agencyId}/contacts`, data).then(r => r.data),

      update: (agencyId: number, contactId: number, data: LiquidationAgencyContactPayload): Promise<LiquidationAgencyContact> =>
        api.put<LiquidationAgencyContact>(`/compras/liquidation-agencies/${agencyId}/contacts/${contactId}`, data).then(r => r.data),

      // 422 {message} si es el único contacto de la agencia — RN2 (REQ-192).
      remove: (agencyId: number, contactId: number): Promise<void> =>
        api.delete(`/compras/liquidation-agencies/${agencyId}/contacts/${contactId}`).then(() => undefined),
    },
  },

  documents: {
    // REQ-155 — checklist de documentos del envío.
    list: (orderId: number): Promise<{ data: PurchaseOrderDocument[] }> =>
      api.get<{ data: PurchaseOrderDocument[] }>(`/compras/orders/${orderId}/documents`).then(r => r.data),

    upload: (orderId: number, category: DocumentCategory, file: File): Promise<PurchaseOrderDocument> => {
      const form = new FormData()
      form.append('category', category)
      form.append('file', file)
      return api.post<PurchaseOrderDocument>(`/compras/orders/${orderId}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    // SCRUM-211 (ADR-SCRUM211) — validación con IA del documento de confirmación de proveedor.
    validate: (orderId: number, documentId: number): Promise<{ job_id: string }> =>
      api.post<{ job_id: string }>(`/compras/orders/${orderId}/documents/${documentId}/validate`).then(r => r.data),

    getValidation: (orderId: number, documentId: number): Promise<ProviderConfirmationValidation> =>
      api.get<ProviderConfirmationValidation>(`/compras/orders/${orderId}/documents/${documentId}/validation`).then(r => r.data),
  },

  approvedProjects: {
    search: (search = ''): Promise<{ data: ApprovedProject[] }> =>
      api.get<{ data: ApprovedProject[] }>('/compras/approved-projects', { params: { search } }).then(r => r.data),
  },

  // REQ-151 (SCRUM-214, hallazgo Pre-QA 2026-08-05) — el "Filtro de Proyecto" de Logística NO
  // puede reusar approvedProjects.search() de arriba: ese endpoint solo devuelve proyectos con
  // una cotización en documentStatus()==='approved' (semántica de REQ-133/Nueva Orden), y un
  // envío activo puede pertenecer a un proyecto sin cotización vigente en ese estado exacto —
  // invisible ahí pero perfectamente real. Ver docblock de
  // PurchaseOrderController::searchShipmentProjects() en el backend.
  // SCRUM-733 — mismo endpoint también sirve al filtro de Proyecto de Ver Órdenes (OrdersPage),
  // que a diferencia de Logística NO debe acotar a "envíos en movimiento": una orden "Por
  // aprobar" es perfectamente visible en la tabla de Ver Órdenes, así que su proyecto tiene que
  // aparecer en el filtro también. `activeShipmentsOnly` (default false) controla el query param
  // `active_shipments` del backend — Logística lo pasa `true`, Ver Órdenes lo deja en default.
  shipmentProjects: {
    search: (search = '', activeShipmentsOnly = false): Promise<{ data: ApprovedProject[] }> =>
      api.get<{ data: ApprovedProject[] }>('/compras/orders/shipment-projects', {
        params: { search, active_shipments: activeShipmentsOnly || undefined },
      }).then(r => r.data),
  },

  products: {
    // REQ-130 — CON costo (a diferencia de ventasDisenoApi.catalogProducts.search).
    // providerId es opcional (SCRUM-245): el buscador de "producto original" de sustitutos
    // busca en todo el catálogo activo, no acotado a un proveedor.
    // originalCatalogProductId (Lote 4, SCRUM-246) — cuando viene presente, el backend decora
    // cada resultado con similarity_percent (método "Buscar en catálogo" de Comparación de
    // Referencias) y descarta los que no alcanzan el umbral mínimo — Nueva Orden nunca lo manda.
    search: (providerId?: number, search = '', originalCatalogProductId?: number): Promise<{ data: ComprasCatalogProduct[]; fuzzy: boolean }> =>
      api.get<{ data: ComprasCatalogProduct[]; fuzzy: boolean }>('/compras/products', {
        params: { provider_id: providerId, search, original_catalog_product_id: originalCatalogProductId },
      }).then(r => r.data),
  },

  settings: {
    get: (): Promise<ComprasSettings> =>
      api.get<ComprasSettings>('/compras/settings').then(r => r.data),

    update: (data: Partial<ComprasSettings>): Promise<ComprasSettings> =>
      api.put<ComprasSettings>('/compras/settings', data).then(r => r.data),
  },

  // SCRUM-231→244 (REQ-168→181) — Inventario.
  inventory: {
    list: (params: InventoryListParams = {}): Promise<InventoryListResponse> =>
      api.get<InventoryListResponse>('/compras/inventory', { params }).then(r => r.data),

    get: (id: number): Promise<InventoryProduct> =>
      api.get<InventoryProduct>(`/compras/inventory/${id}`).then(r => r.data),

    // SCRUM-426 — la ficha técnica (documento/link, Caso A/B de SCRUM-237) ahora es obligatoria
    // y viaja en el MISMO request que crea el producto (backend la procesa dentro de la misma
    // transacción) — multipart en vez de JSON porque puede incluir un archivo real.
    create: (data: InventoryProductPayload, technicalSheet: { file: File } | { link: string }): Promise<InventoryProduct> => {
      const formData = new FormData()
      Object.entries(data).forEach(([key, value]) => {
        if (value === undefined || value === null) return
        if (key === 'initial_stock' && Array.isArray(value)) {
          value.forEach((entry: { warehouse_id: number; quantity: number }, i: number) => {
            formData.append(`initial_stock[${i}][warehouse_id]`, String(entry.warehouse_id))
            formData.append(`initial_stock[${i}][quantity]`, String(entry.quantity))
          })
          return
        }
        formData.append(key, String(value))
      })
      if ('file' in technicalSheet) formData.append('file', technicalSheet.file)
      else formData.append('link', technicalSheet.link)

      return api.post<InventoryProduct>('/compras/inventory', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    update: (id: number, data: Partial<InventoryProductPayload>): Promise<InventoryProduct> =>
      api.put<InventoryProduct>(`/compras/inventory/${id}`, data).then(r => r.data),

    toggleActive: (id: number): Promise<InventoryProduct> =>
      api.patch<InventoryProduct>(`/compras/inventory/${id}/toggle-active`).then(r => r.data),

    warehouseStock: (id: number): Promise<{ data: WarehouseStockRow[] }> =>
      api.get<{ data: WarehouseStockRow[] }>(`/compras/inventory/${id}/warehouse-stock`).then(r => r.data),

    orderPrefill: (id: number): Promise<OrderPrefill> =>
      api.get<OrderPrefill>(`/compras/inventory/${id}/order-prefill`).then(r => r.data),

    // SCRUM-236 (REQ-173) — botón "Ingresar a Inventario", confirma TODAS las líneas "Por
    // ingresar" del producto de una vez (cada una a la bodega ya elegida al ingresar).
    confirmPending: (id: number): Promise<ConfirmPendingResponse> =>
      api.post<ConfirmPendingResponse>(`/compras/goods-receipts/products/${id}/confirm-pending`).then(r => r.data),

    // SCRUM-237 (REQ-174, hallazgo de Gerencia Test) — validación de unicidad de referencia
    // pública EN VIVO, mientras se escribe.
    checkReference: (reference: string, excludeId?: number): Promise<{ available: boolean; message?: string }> =>
      api.get<{ available: boolean; message?: string }>('/compras/inventory/check-reference', {
        params: { reference, exclude_id: excludeId },
      }).then(r => r.data),

    technicalSheetUrl: (id: number): Promise<{ url: string }> =>
      api.get<{ url: string }>(`/compras/inventory/${id}/technical-sheet`).then(r => r.data),

    uploadTechnicalSheet: (id: number, payload: { file: File } | { link: string }): Promise<InventoryTechnicalSheetResponse> => {
      const formData = new FormData()
      if ('file' in payload) formData.append('file', payload.file)
      else formData.append('link', payload.link)

      return api.post<InventoryTechnicalSheetResponse>(`/compras/inventory/${id}/technical-sheet`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },
  },

  warehouses: {
    list: (): Promise<{ data: Warehouse[] }> =>
      api.get<{ data: Warehouse[] }>('/compras/warehouses').then(r => r.data),
  },

  reports: {
    purchasedByPeriod: (period: ReportGranularity): Promise<PurchasedByPeriodResponse> =>
      api.get<PurchasedByPeriodResponse>('/compras/reports/purchased-by-period', { params: { period } }).then(r => r.data),

    purchaseOpportunity: (period: ReportGranularity, anchor?: string): Promise<PurchaseOpportunityResponse> =>
      api.get<PurchaseOpportunityResponse>('/compras/reports/purchase-opportunity', { params: { period, anchor } }).then(r => r.data),

    providerRating: (period: ReportGranularity, anchor?: string): Promise<ProviderRatingResponse> =>
      api.get<ProviderRatingResponse>('/compras/reports/provider-rating', { params: { period, anchor } }).then(r => r.data),

    claims: (period: ReportGranularity, anchor?: string): Promise<ClaimsReportResponse> =>
      api.get<ClaimsReportResponse>('/compras/reports/claims', { params: { period, anchor } }).then(r => r.data),

    inventoryAttention: (): Promise<InventoryKpis> =>
      api.get<InventoryKpis>('/compras/reports/inventory-attention').then(r => r.data),

    liquidationImports: (period: ReportGranularity, anchor?: string): Promise<LiquidationImportsResponse> =>
      api.get<LiquidationImportsResponse>('/compras/reports/liquidation-imports', { params: { period, anchor } }).then(r => r.data),
  },

  replacementRequests: {
    list: (status?: string, page?: number, per_page?: number | 'all'): Promise<ReplacementRequestListResponse> =>
      api.get<ReplacementRequestListResponse>('/compras/replacement-requests', { params: { status, page, per_page } }).then(r => r.data),

    // SCRUM-247 (REQ-184) — "Generar solicitud" desde la tabla de resultados (REQ-183).
    create: (data: CreateReplacementRequestPayload): Promise<ReplacementRequest> =>
      api.post<ReplacementRequest>('/compras/replacement-requests', data).then(r => r.data),

    generateOrder: (id: number): Promise<{ order_id: number }> =>
      api.post<{ order_id: number }>(`/compras/replacement-requests/${id}/generate-order`).then(r => r.data),

    // SCRUM-245 (REQ-182/183, ADR-SCRUM245) — búsqueda por foto/ficha técnica con IA.
    search: (originalCatalogProductId: number, familyId: number, file: File): Promise<{ job_id: string }> => {
      const form = new FormData()
      form.append('original_catalog_product_id', String(originalCatalogProductId))
      form.append('family_id', String(familyId))
      form.append('file', file)
      return api.post<{ job_id: string }>('/compras/replacement-requests/search', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    getSearch: (jobId: string): Promise<SubstituteSearchPoll> =>
      api.get<SubstituteSearchPoll>(`/compras/replacement-requests/search/${jobId}`).then(r => r.data),
  },

  claims: {
    // SCRUM-257 (hallazgo de Gerencia Test) — chip de estado, proveedor, tipo de resolución y
    // búsqueda de texto libre, combinables.
    list: (params: ClaimListParams = {}): Promise<PurchaseOrderClaimListResponse> =>
      api.get<PurchaseOrderClaimListResponse>('/compras/claims', { params }).then(r => r.data),

    get: (id: number): Promise<PurchaseOrderClaimDetail> =>
      api.get<PurchaseOrderClaimDetail>(`/compras/claims/${id}`).then(r => r.data),

    create: (data: PurchaseOrderClaimPayload): Promise<PurchaseOrderClaimDetail> =>
      api.post<PurchaseOrderClaimDetail>('/compras/claims', data).then(r => r.data),

    updateStatus: (id: number, status: 'en_revision' | 'resuelto'): Promise<{ status: string }> =>
      api.patch<{ status: string }>(`/compras/claims/${id}/status`, { status }).then(r => r.data),

    // SCRUM-259 (REQ-196, hallazgo de Gerencia Test) — "Tipo de resolución" editable desde el detalle.
    updateResolution: (id: number, expectedResolution: string): Promise<PurchaseOrderClaimDetail> =>
      api.patch<PurchaseOrderClaimDetail>(`/compras/claims/${id}/resolution`, { expected_resolution: expectedResolution }).then(r => r.data),

    uploadPhoto: (id: number, photo: File): Promise<PurchaseOrderClaimPhoto> => {
      const form = new FormData()
      form.append('photo', photo)
      return api.post<PurchaseOrderClaimPhoto>(`/compras/claims/${id}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    pdf: (id: number): Promise<Blob> =>
      api.get(`/compras/claims/${id}/pdf`, { responseType: 'blob' }).then(r => r.data as Blob),
  },

  families: {
    // SCRUM-764 — listado propio de Compras, no el 403 de ventasDisenoApi.catalogProductFamilies.
    // `restricted` (Lote 4, 2026-08-17) — para ocultar "Generar compra" sin depender de mirar
    // `total_value` fila por fila.
    list: (page?: number, per_page?: number | 'all'): Promise<InventoryFamilyListResponse> =>
      api.get<InventoryFamilyListResponse>('/compras/families', { params: { page, per_page } }).then(r => r.data),

    // SCRUM-243 (REQ-180) — detalle con costo/valor total, restricted-aware.
    get: (id: number): Promise<InventoryFamilyDetail> =>
      api.get<InventoryFamilyDetail>(`/compras/families/${id}`).then(r => r.data),

    // SCRUM-237/240 — find-or-create por nombre (InventoryController::storeFamily, batch4
    // backend). Usado por FamilyCombobox — reemplaza el ventasDisenoApi.catalogProductFamilies.
    // create() que se usaba como placeholder mientras este endpoint no existía.
    create: (name: string): Promise<{ id: number; name: string; description: string | null }> =>
      api.post<{ id: number; name: string; description: string | null }>('/compras/families', { name }).then(r => r.data),

    // SCRUM-243 (REQ-180) — crea 1 orden "Por aprobar" por proveedor distinto de la familia.
    generatePurchase: (id: number): Promise<{ order_ids: number[] }> =>
      api.post<{ order_ids: number[] }>(`/compras/families/${id}/generate-purchase`).then(r => r.data),
  },

  // SCRUM-220→230 (REQ-157/159/162→167) — Ingreso de Mercancía.
  goodsReceipts: {
    eligibleOrders: (search?: string): Promise<{ data: GoodsReceiptEligibleOrder[] }> =>
      api.get<{ data: GoodsReceiptEligibleOrder[] }>('/compras/goods-receipts/eligible-orders', {
        params: { search },
      }).then(r => r.data),

    orderProducts: (orderId: number): Promise<GoodsReceiptOrderProducts> =>
      api.get<GoodsReceiptOrderProducts>(`/compras/goods-receipts/orders/${orderId}`).then(r => r.data),

    list: (search?: string, page?: number, per_page?: number | 'all'): Promise<GoodsReceiptListResponse> =>
      api.get<GoodsReceiptListResponse>('/compras/goods-receipts', { params: { search, page, per_page } }).then(r => r.data),

    get: (id: number): Promise<GoodsReceiptDetail> =>
      api.get<GoodsReceiptDetail>(`/compras/goods-receipts/${id}`).then(r => r.data),

    // REQ-165 — puede devolver el detalle guardado (201) o, si alguna línea quedó incompleta y
    // no se mandó pending_remainder_status, un aviso para mostrar el modal de "estado de lo
    // pendiente" en vez de persistir (200, sin guardar).
    create: (payload: GoodsReceiptPayload): Promise<GoodsReceiptDetail | GoodsReceiptPartialInfo> =>
      api.post<GoodsReceiptDetail | GoodsReceiptPartialInfo>('/compras/goods-receipts', payload).then(r => r.data),

    // REQ-167 — corregir un ingreso ya guardado (mismo registro, sin versionado).
    update: (id: number, payload: Partial<GoodsReceiptPayload>): Promise<GoodsReceiptDetail | GoodsReceiptPartialInfo> =>
      api.put<GoodsReceiptDetail | GoodsReceiptPartialInfo>(`/compras/goods-receipts/${id}`, payload).then(r => r.data),

    // REQ-173 — confirma TODAS las líneas "Por ingresar" de un producto, cada una a su bodega ya elegida.
    confirmLine: (lineId: number): Promise<void> =>
      api.post(`/compras/goods-receipts/lines/${lineId}/confirm`).then(() => undefined),

    // SCRUM-224 (REQ-161, ADR-SCRUM224) — Paso 0: adjuntar factura y disparar la detección automática.
    uploadInvoice: (file: File): Promise<{ job_id: string }> => {
      const form = new FormData()
      form.append('file', file)
      return api.post<{ job_id: string }>('/compras/goods-receipts/invoice', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },

    getInvoiceMatch: (jobId: string): Promise<GoodsReceiptInvoiceMatchPoll> =>
      api.get<GoodsReceiptInvoiceMatchPoll>(`/compras/goods-receipts/invoice/${jobId}`).then(r => r.data),
  },

  // SCRUM-175→182 (REQ-111→118) — Inicio de Compras.
  home: {
    summary: (): Promise<ComprasHomeSummary> =>
      api.get<ComprasHomeSummary>('/compras/home/summary').then(r => r.data),
  },

  // REQ-113 — panel "Mi calendario", solo lectura de Outlook (desbloqueado 2026-07-21).
  calendar: {
    list: (filters: { from?: string; to?: string } = {}): Promise<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }> =>
      api.get<{ data: OutlookCalendarEvent[]; source_unavailable: boolean }>('/compras/calendar', { params: filters }).then(r => r.data),
  },

  // SCRUM-440 (REQ-370) — decisión de Yirena sobre una solicitud de Zona Libre generada por
  // Bodega. La bandeja (`/bodega/ordenes-zona-libre`) es la misma para Bodega y Compras — el
  // permiso `compras.zona-libre.approve` decide si se ven estos botones o el "Recordar" de Bodega.
  zonaLibre: {
    approve: (id: number): Promise<{ order_id: number }> =>
      api.post<{ order_id: number }>(`/compras/zona-libre/requests/${id}/approve`).then(r => r.data),

    reject: (id: number, rejectionReason: string): Promise<{ message: string }> =>
      api.post<{ message: string }>(`/compras/zona-libre/requests/${id}/reject`, { rejection_reason: rejectionReason }).then(r => r.data),
  },
}
