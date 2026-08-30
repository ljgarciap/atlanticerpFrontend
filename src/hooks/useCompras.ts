import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { comprasApi, type ProviderListParams, type PurchaseOrderListParams, type InventoryListParams } from '@/api/comprasApi'
import type {
  ProviderPayload, PurchaseOrderPayload, ShippingInfoPayload, DocumentCategory, ComprasSettings,
  LiquidationAgencyPayload, LiquidationAgencyContactPayload, LiquidationAgencyPaymentPayload, InventoryProductPayload,
  PurchaseOrderClaimPayload, ClaimListParams, ReportGranularity, CreateReplacementRequestPayload, GoodsReceiptPayload,
} from '@/types/compras'

export function useProviders(params: ProviderListParams = {}) {
  return useQuery({
    queryKey:  ['compras/providers', params],
    queryFn:   () => comprasApi.providers.list(params),
    staleTime: 10_000,
  })
}

export function useProvider(id: number | null) {
  return useQuery({
    queryKey: ['compras/providers', id],
    queryFn:  () => comprasApi.providers.get(id as number),
    enabled:  id !== null,
  })
}

export function useCreateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ProviderPayload) => comprasApi.providers.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/providers'] }),
  })
}

export function useUpdateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ProviderPayload }) => comprasApi.providers.update(id, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/providers'] }),
  })
}

export function usePurchaseOrders(params: PurchaseOrderListParams = {}) {
  return useQuery({
    queryKey:  ['compras/orders', params],
    queryFn:   () => comprasApi.orders.list(params),
    staleTime: 10_000,
  })
}

export function usePurchaseOrder(id: number | null) {
  return useQuery({
    queryKey: ['compras/orders', id],
    queryFn:  () => comprasApi.orders.get(id as number),
    enabled:  id !== null,
  })
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PurchaseOrderPayload) => comprasApi.orders.create(data),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['compras/orders'] })
      // Una orden nueva puede haber creado un producto nuevo en el Catálogo (REQ-131) y
      // actualiza "Última compra"/KPIs de Proveedores (REQ-123) — se invalidan ambos.
      void qc.invalidateQueries({ queryKey: ['compras/providers'] })
      void qc.invalidateQueries({ queryKey: ['ventas-diseno/catalog-products'] })
      // SCRUM-695 (REQ-615 RN5) — Catálogo (Ventas & Diseño) lee el mismo CatalogProduct, se
      // refresca igual que el buscador viejo de arriba.
      void qc.invalidateQueries({ queryKey: ['ventas-diseno-catalog'] })
    },
  })
}

export function useApprovePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => comprasApi.orders.approve(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/orders'] }),
  })
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PurchaseOrderPayload }) => comprasApi.orders.update(id, data),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['compras/orders'] })
      void qc.invalidateQueries({ queryKey: ['compras/providers'] })
      void qc.invalidateQueries({ queryKey: ['ventas-diseno/catalog-products'] })
      void qc.invalidateQueries({ queryKey: ['ventas-diseno-catalog'] })
    },
  })
}

export function useAdvancePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => comprasApi.orders.advance(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/orders'] }),
  })
}

// SCRUM-208 (rediseño 2026-08-15) — avanza el remanente de una recepción parcial, independiente
// del status de la orden. Ver docs/architecture/scrum208-recepcion-parcial-rediseno.md.
export function useAdvanceRemainderPurchaseOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => comprasApi.orders.advanceRemainder(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/orders'] }),
  })
}

// SCRUM-208 (rediseño 2026-08-15) — confirma a Inventario las líneas "Por ingresar" de UNA orden.
// Invalida compras/inventory además de compras/orders — a diferencia de advanceRemainder, esto
// sí cambia stock_quantity, visible en la pantalla de Inventario.
export function useConfirmPendingOrderReceipts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => comprasApi.orders.confirmPendingReceipts(id),
    onSuccess:  () => {
      void qc.invalidateQueries({ queryKey: ['compras/orders'] })
      void qc.invalidateQueries({ queryKey: ['compras/inventory'] })
    },
  })
}

/**
 * REQ-149 — abre el PDF en una pestaña nueva (blob URL, no una navegación directa).
 * `targetWindow` se abre SINCRÓNICO en el propio onClick del caller (ver OrderDetailPage) — si
 * `window.open()` se llama acá adentro, después del `await` del fetch, deja de estar atado al
 * gesto del usuario y la mayoría de navegadores lo bloquea como popup (bug real encontrado en
 * el smoke test de navegador, no en code review: la pestaña nunca navegaba a la blob URL).
 */
export function useOpenPurchaseOrderPdf() {
  return useMutation({
    mutationFn: async ({ id, includeCost, targetWindow }: { id: number; includeCost: boolean; targetWindow: Window | null }) => {
      const blob = await comprasApi.orders.pdf(id, includeCost)
      const url = URL.createObjectURL(blob)
      if (targetWindow) {
        targetWindow.location.href = url
      } else {
        window.open(url, '_blank')
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    },
  })
}

// SCRUM-262→268 (REQ-199→205) — Reportes avanzados. Comparten `period` (mes/trimestre/año) —
// el selector de SCRUM-262 controla las 4 llamadas period-aware desde un solo estado en la página.
export function usePurchasedByPeriod(period: ReportGranularity) {
  return useQuery({
    queryKey: ['compras/reports/purchased-by-period', period],
    queryFn:  () => comprasApi.reports.purchasedByPeriod(period),
  })
}

export function usePurchaseOpportunityReport(period: ReportGranularity) {
  return useQuery({
    queryKey: ['compras/reports/purchase-opportunity', period],
    queryFn:  () => comprasApi.reports.purchaseOpportunity(period),
  })
}

export function useProviderRatingReport(period: ReportGranularity) {
  return useQuery({
    queryKey: ['compras/reports/provider-rating', period],
    queryFn:  () => comprasApi.reports.providerRating(period),
  })
}

export function useClaimsReport(period: ReportGranularity) {
  return useQuery({
    queryKey: ['compras/reports/claims', period],
    queryFn:  () => comprasApi.reports.claims(period),
  })
}

export function useInventoryAttentionReport() {
  return useQuery({
    queryKey: ['compras/reports/inventory-attention'],
    queryFn:  () => comprasApi.reports.inventoryAttention(),
  })
}

export function useLiquidationImportsReport(period: ReportGranularity) {
  return useQuery({
    queryKey: ['compras/reports/liquidation-imports', period],
    queryFn:  () => comprasApi.reports.liquidationImports(period),
  })
}

// SCRUM-248/249 (REQ-185/186) — Sustitutos, parte sin IA.
export function useReplacementRequests(status?: string, page = 1, perPage: number | 'all' = 20) {
  return useQuery({
    queryKey: ['compras/replacement-requests', status, page, perPage],
    queryFn:  () => comprasApi.replacementRequests.list(status, page, perPage),
  })
}

export function useGenerateReplacementOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => comprasApi.replacementRequests.generateOrder(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/replacement-requests'] }),
  })
}

/** SCRUM-247 (REQ-184) — "Generar solicitud" desde la tabla de resultados (REQ-183). */
export function useCreateReplacementRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateReplacementRequestPayload) => comprasApi.replacementRequests.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/replacement-requests'] }),
  })
}

/** SCRUM-245 (REQ-182, ADR-SCRUM245) — dispara la búsqueda de sustituto por foto/ficha técnica. */
export function useSearchSubstitutes() {
  return useMutation({
    mutationFn: ({ originalCatalogProductId, familyId, file }: { originalCatalogProductId: number; familyId: number; file: File }) =>
      comprasApi.replacementRequests.search(originalCatalogProductId, familyId, file),
  })
}

/**
 * Poll cada 3s mientras el análisis esté pending/running — mismo criterio que
 * useProviderConfirmationValidation (SCRUM-211): nunca un número fijo de intentos.
 */
export function useSubstituteSearchResult(jobId: string | null) {
  return useQuery({
    queryKey: ['compras/replacement-requests/search', jobId],
    queryFn:  () => comprasApi.replacementRequests.getSearch(jobId as string),
    enabled:  jobId !== null,
    refetchInterval: query => {
      const status = query.state.data?.status
      return status === 'pending' || status === 'running' ? 3000 : false
    },
  })
}

// SCRUM-257→261 (REQ-194→198) — Garantías y Reclamos.
export function useClaims(params: ClaimListParams = {}) {
  return useQuery({
    queryKey: ['compras/claims', params],
    queryFn:  () => comprasApi.claims.list(params),
  })
}

export function useClaim(id: number | null) {
  return useQuery({
    queryKey: ['compras/claims', 'detail', id],
    queryFn:  () => comprasApi.claims.get(id as number),
    enabled:  id !== null,
  })
}

export function useCreateClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PurchaseOrderClaimPayload) => comprasApi.claims.create(data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/claims'] }),
  })
}

export function useUpdateClaimResolution(claimId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (expectedResolution: string) => comprasApi.claims.updateResolution(claimId, expectedResolution),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['compras/claims'] })
      qc.invalidateQueries({ queryKey: ['compras/claims', 'detail', claimId] })
    },
  })
}

export function useUpdateClaimStatus(claimId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (status: 'en_revision' | 'resuelto') => comprasApi.claims.updateStatus(claimId, status),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['compras/claims'] })
      qc.invalidateQueries({ queryKey: ['compras/claims', 'detail', claimId] })
    },
  })
}

export function useUploadClaimPhoto(claimId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (photo: File) => comprasApi.claims.uploadPhoto(claimId, photo),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/claims', 'detail', claimId] }),
  })
}

// SCRUM-259 (hallazgo de Daniela Amaya 2026-08-10) — "Descargar PDF del reclamo", no "Ver PDF":
// dispara una descarga real de archivo (backend ya manda Content-Disposition: attachment), en
// vez de abrir el PDF en una pestaña/ventana nueva.
export function useDownloadClaimPdf() {
  return useMutation({
    mutationFn: async ({ id, code }: { id: number; code: string }) => {
      const blob = await comprasApi.claims.pdf(id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reclamo-${code}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    },
  })
}

export function useSendPurchaseOrderEmail() {
  return useMutation({
    mutationFn: ({ id, includeCost }: { id: number; includeCost: boolean }) =>
      comprasApi.orders.sendEmail(id, includeCost),
  })
}

export function useUpdateShippingInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ShippingInfoPayload }) =>
      comprasApi.orders.updateShippingInfo(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compras/orders'] }),
  })
}

/** SCRUM-210 (REQ-147, alcance reducido) — asignar/cambiar la agencia de liquidación. */
export function useLiquidateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, agencyId }: { id: number; agencyId: number }) =>
      comprasApi.orders.liquidate(id, agencyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compras/orders'] }),
  })
}

// SCRUM-250→253 (REQ-187→190) — Pagos a Proveedores.
export function usePurchaseOrderPayments(orderId: number | null) {
  return useQuery({
    queryKey: ['compras/orders', orderId, 'payments'],
    queryFn:  () => comprasApi.payments.list(orderId as number),
    enabled:  orderId !== null,
  })
}

export function useRegisterPayment(orderId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ amount, proof }: { amount: number; proof: File }) => comprasApi.payments.register(orderId, amount, proof),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['compras/orders', orderId, 'payments'] })
      qc.invalidateQueries({ queryKey: ['compras/orders', orderId] })
      qc.invalidateQueries({ queryKey: ['compras/orders'] })
    },
  })
}

export function useRequestPayment(orderId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => comprasApi.orders.requestPayment(orderId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/orders', orderId] }),
  })
}

export function useRequestAmountChange(orderId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (newAmount: number) => comprasApi.orders.requestAmountChange(orderId, newAmount),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/orders', orderId] }),
  })
}

export function useApproveAmountChange(orderId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => comprasApi.orders.approveAmountChange(orderId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['compras/orders', orderId] })
      qc.invalidateQueries({ queryKey: ['compras/orders'] })
    },
  })
}

// SCRUM-252 (hallazgo de Daniela Amaya) — "Rechazar cambio", solo Mark.
export function useRejectAmountChange(orderId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => comprasApi.orders.rejectAmountChange(orderId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['compras/orders', orderId] })
      qc.invalidateQueries({ queryKey: ['compras/orders'] })
    },
  })
}

export function useLiquidationAgencies(search: string, enabled: boolean) {
  return useQuery({
    queryKey: ['compras/liquidation-agencies', search],
    queryFn:  () => comprasApi.liquidationAgencies.search(search),
    enabled,
  })
}

export function useCreateLiquidationAgency() {
  return useMutation({
    mutationFn: (data: LiquidationAgencyPayload) => comprasApi.liquidationAgencies.create(data),
  })
}

// SCRUM-254 (REQ-191)
export function useLiquidationAgenciesSummary(page = 1, perPage: number | 'all' = 20) {
  return useQuery({
    queryKey: ['compras/liquidation-agencies/summary', page, perPage],
    queryFn:  () => comprasApi.liquidationAgencies.summary(page, perPage),
  })
}

// SCRUM-256 (REQ-193)
export function useLiquidationAgency(id: number | null) {
  return useQuery({
    queryKey: ['compras/liquidation-agencies', id],
    queryFn:  () => comprasApi.liquidationAgencies.get(id as number),
    enabled:  id !== null,
  })
}

// SCRUM-254 (REQ-191) — carga manual de situación de pago (mock, ver types/compras.ts).
export function useUpdateLiquidationAgencyPayment(agencyId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: LiquidationAgencyPaymentPayload) => comprasApi.liquidationAgencies.updatePayment(agencyId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras/liquidation-agencies', agencyId] })
      qc.invalidateQueries({ queryKey: ['compras/liquidation-agencies/summary'] })
    },
  })
}

// SCRUM-255 (REQ-192)
export function useCreateLiquidationAgencyContact(agencyId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: LiquidationAgencyContactPayload) => comprasApi.liquidationAgencies.contacts.create(agencyId, data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/liquidation-agencies', agencyId] }),
  })
}

export function useUpdateLiquidationAgencyContact(agencyId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ contactId, data }: { contactId: number; data: LiquidationAgencyContactPayload }) =>
      comprasApi.liquidationAgencies.contacts.update(agencyId, contactId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compras/liquidation-agencies', agencyId] }),
  })
}

export function useRemoveLiquidationAgencyContact(agencyId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (contactId: number) => comprasApi.liquidationAgencies.contacts.remove(agencyId, contactId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/liquidation-agencies', agencyId] }),
  })
}

export function usePurchaseOrderDocuments(orderId: number | null) {
  return useQuery({
    queryKey: ['compras/orders', orderId, 'documents'],
    queryFn:  () => comprasApi.documents.list(orderId as number),
    enabled:  orderId !== null,
  })
}

export function useUploadPurchaseOrderDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, category, file }: { orderId: number; category: DocumentCategory; file: File }) =>
      comprasApi.documents.upload(orderId, category, file),
    onSuccess: (_data, { orderId }) =>
      qc.invalidateQueries({ queryKey: ['compras/orders', orderId, 'documents'] }),
  })
}

/** SCRUM-211 (ADR-SCRUM211) — dispara la validación con IA del documento de confirmación. */
export function useValidateProviderConfirmation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, documentId }: { orderId: number; documentId: number }) =>
      comprasApi.documents.validate(orderId, documentId),
    onSuccess: (_data, { orderId, documentId }) =>
      qc.invalidateQueries({ queryKey: ['compras/orders', orderId, 'documents', documentId, 'validation'] }),
  })
}

/**
 * Poll cada 3s mientras el análisis esté pending/running — se detiene solo al llegar a
 * completed/failed, nunca por un número fijo de intentos (el Job puede tardar por reintentos
 * de CircuitBreaker).
 */
export function useProviderConfirmationValidation(orderId: number | null, documentId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['compras/orders', orderId, 'documents', documentId, 'validation'],
    queryFn:  () => comprasApi.documents.getValidation(orderId as number, documentId as number),
    enabled:  enabled && orderId !== null && documentId !== null,
    refetchInterval: query => {
      const status = query.state.data?.status
      return status === 'pending' || status === 'running' ? 3000 : false
    },
  })
}

/**
 * REQ-121/SCRUM-184 (hallazgo MEDIO Pre-QA 2026-07-16): umbral de "calificación baja"
 * (`low_rating_threshold`), mismo patrón que useCompras's ventasDisenoApi.pricingSettings.
 */
export function useComprasSettings() {
  return useQuery({
    queryKey: ['compras/settings'],
    queryFn:  () => comprasApi.settings.get(),
  })
}

export function useUpdateComprasSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ComprasSettings>) => comprasApi.settings.update(data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['compras/settings'] })
      // El umbral se usa para calcular el chip/columna "Calificación baja" (REQ-122) en el
      // listado de Proveedores — sin esto, el nuevo valor no se refleja hasta un F5 manual.
      qc.invalidateQueries({ queryKey: ['compras/providers'] })
    },
  })
}

// ── SCRUM-231→244 (REQ-168→181) — Inventario ────────────────────────────────

export function useInventory(params: InventoryListParams = {}) {
  return useQuery({
    queryKey:  ['compras/inventory', params],
    queryFn:   () => comprasApi.inventory.list(params),
    staleTime: 10_000,
  })
}

export function useInventoryProduct(id: number | null) {
  return useQuery({
    queryKey: ['compras/inventory', id],
    queryFn:  () => comprasApi.inventory.get(id as number),
    enabled:  id !== null,
  })
}

function invalidateInventory(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['compras/inventory'] })
}

export function useCreateInventoryProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ data, technicalSheet }: { data: InventoryProductPayload; technicalSheet: { file: File } | { link: string } }) =>
      comprasApi.inventory.create(data, technicalSheet),
    onSuccess:  () => invalidateInventory(qc),
  })
}

export function useUpdateInventoryProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InventoryProductPayload> }) =>
      comprasApi.inventory.update(id, data),
    onSuccess: () => invalidateInventory(qc),
  })
}

export function useToggleInventoryProductActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => comprasApi.inventory.toggleActive(id),
    onSuccess:  () => invalidateInventory(qc),
  })
}

export function useInventoryWarehouseStock(id: number | null) {
  return useQuery({
    queryKey: ['compras/inventory', id, 'warehouse-stock'],
    queryFn:  () => comprasApi.inventory.warehouseStock(id as number),
    enabled:  id !== null,
  })
}

export function useInventoryOrderPrefill() {
  return useMutation({
    mutationFn: (id: number) => comprasApi.inventory.orderPrefill(id),
  })
}

export function useConfirmPendingInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => comprasApi.inventory.confirmPending(id),
    onSuccess:  () => invalidateInventory(qc),
  })
}

// SCRUM-237 (REQ-174, hallazgo de Daniela Amaya) — "Ficha técnica" como documento.
export function useUploadInventoryTechnicalSheet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { file: File } | { link: string } }) =>
      comprasApi.inventory.uploadTechnicalSheet(id, payload),
    onSuccess: () => invalidateInventory(qc),
  })
}

export function useInventoryTechnicalSheetUrl() {
  return useMutation({
    mutationFn: (id: number) => comprasApi.inventory.technicalSheetUrl(id),
  })
}

export function useWarehouses() {
  return useQuery({
    queryKey:  ['compras/warehouses'],
    queryFn:   () => comprasApi.warehouses.list(),
    staleTime: 60_000,
  })
}

// SCRUM-764 — listado propio de Compras (mismo resolveAccess() que el detalle de abajo), reemplaza
// las 3 llamadas directas a ventasDisenoApi.catalogProductFamilies.list() que devolvían 403 para
// cualquier rol real de Compras (lider_compras no tiene ventas_diseno.read).
export function useInventoryFamilies(page = 1, perPage: number | 'all' = 20) {
  return useQuery({
    queryKey:  ['compras/families', page, perPage],
    queryFn:   () => comprasApi.families.list(page, perPage),
    staleTime: 300_000,
  })
}

// SCRUM-243 (REQ-180) — detalle de familia con costo/valor total (restricted-aware).
export function useInventoryFamily(id: number | null) {
  return useQuery({
    queryKey: ['compras/families', id],
    queryFn:  () => comprasApi.families.get(id as number),
    enabled:  id !== null,
  })
}

export function useGenerateFamilyPurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (familyId: number) => comprasApi.families.generatePurchase(familyId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['compras/orders'] }),
  })
}

// ── SCRUM-220→230 (REQ-157/159/162→167) — Ingreso de Mercancía ────────────────

export function useGoodsReceiptEligibleOrders(search: string) {
  return useQuery({
    queryKey: ['compras/goods-receipts/eligible-orders', search],
    queryFn:  () => comprasApi.goodsReceipts.eligibleOrders(search),
  })
}

export function useGoodsReceiptOrderProducts(orderId: number | null) {
  return useQuery({
    queryKey: ['compras/goods-receipts/orders', orderId],
    queryFn:  () => comprasApi.goodsReceipts.orderProducts(orderId as number),
    enabled:  orderId !== null,
  })
}

export function useGoodsReceipts(search: string, page = 1, perPage: number | 'all' = 20) {
  return useQuery({
    queryKey: ['compras/goods-receipts', search, page, perPage],
    queryFn:  () => comprasApi.goodsReceipts.list(search, page, perPage),
  })
}

export function useGoodsReceipt(id: number | null) {
  return useQuery({
    queryKey: ['compras/goods-receipts', 'detail', id],
    queryFn:  () => comprasApi.goodsReceipts.get(id as number),
    enabled:  id !== null,
  })
}

export function useCreateGoodsReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: GoodsReceiptPayload) => comprasApi.goodsReceipts.create(payload),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['compras/goods-receipts'] })
      qc.invalidateQueries({ queryKey: ['compras/orders'] })
      qc.invalidateQueries({ queryKey: ['compras/inventory'] })
    },
  })
}

export function useUpdateGoodsReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<GoodsReceiptPayload> }) =>
      comprasApi.goodsReceipts.update(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['compras/goods-receipts'] })
      qc.invalidateQueries({ queryKey: ['compras/goods-receipts', 'detail', id] })
      qc.invalidateQueries({ queryKey: ['compras/orders'] })
      qc.invalidateQueries({ queryKey: ['compras/inventory'] })
    },
  })
}

/** SCRUM-224 (REQ-161, ADR-SCRUM224) — Paso 0: sube la factura y dispara la detección con IA. */
export function useUploadGoodsReceiptInvoice() {
  return useMutation({
    mutationFn: (file: File) => comprasApi.goodsReceipts.uploadInvoice(file),
  })
}

/**
 * Poll cada 3s mientras el análisis esté pending/running — mismo criterio que
 * useSubstituteSearchResult/useProviderConfirmationValidation: nunca un número fijo de intentos.
 */
export function useGoodsReceiptInvoiceMatch(jobId: string | null) {
  return useQuery({
    queryKey: ['compras/goods-receipts/invoice', jobId],
    queryFn:  () => comprasApi.goodsReceipts.getInvoiceMatch(jobId as string),
    enabled:  jobId !== null,
    refetchInterval: query => {
      const status = query.state.data?.status
      return status === 'pending' || status === 'running' ? 3000 : false
    },
  })
}

// SCRUM-175→182 (REQ-111→118) — Inicio de Compras.
export function useComprasHomeSummary() {
  return useQuery({
    queryKey:  ['compras/home/summary'],
    queryFn:   () => comprasApi.home.summary(),
    staleTime: 10_000,
  })
}

// SCRUM-440 (REQ-370) — invalida la misma queryKey que `useZonaLibreRequests` (useBodega.ts):
// la bandeja es la misma pantalla para Bodega y Compras, aprobar/rechazar debe refrescar esa fila.
export function useApproveZonaLibreRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => comprasApi.zonaLibre.approve(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bodega/zona-libre/requests'] }),
  })
}

export function useRejectZonaLibreRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, rejectionReason }: { id: number; rejectionReason: string }) =>
      comprasApi.zonaLibre.reject(id, rejectionReason),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bodega/zona-libre/requests'] }),
  })
}
