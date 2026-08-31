import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bodegaApi, type BodegaInventoryListParams } from '@/api/bodegaApi'
import type {
  AdjustmentRequestLineDraft, BodegaConfirmArrivalPayload, BodegaSettings, OrderBoardFilters,
  RelocationEstadoFilter, RelocationRequestPayload, ZonaLibreRequestPayload, ZonaLibreStatusFilter,
  GeneralCountChip, GeneralCountCreatePayload, GeneralCountEvaluatePayload,
  CustomerReturnStatusFilter, CreateCustomerReturnPayload, ConfirmReturnReceptionPayload,
  PickingSheetItemPayload, InventoryReviewDecisionPayload,
  BodegaReportPeriodKey,
  RegisterDeliveryPayload, RegisterSignedGuidePayload,
  BodegaTeamMemberRole,
} from '@/types/bodega'

// SCRUM-451→456 (REQ-381→386) — pantalla "Bodegas".
export function useWarehousesList() {
  return useQuery({
    queryKey:  ['bodega/warehouses'],
    queryFn:   () => bodegaApi.warehouses.list(),
    staleTime: 60_000,
  })
}

export function useWarehouseDetail(
  id: number | null,
  params?: {
    search?: string; categoria?: number; ubicacion?: string; chip?: string
    page?: number; per_page?: number | 'all'
  },
) {
  return useQuery({
    queryKey: ['bodega/warehouses', id, params],
    queryFn:  () => bodegaApi.warehouses.show(id as number, params),
    enabled:  id !== null,
  })
}

// SCRUM-454 (REQ-384, Bloque B4) — catálogo editable de ubicaciones físicas por bodega.
export function useWarehouseLocations(warehouseId: number | null) {
  return useQuery({
    queryKey: ['bodega/warehouses', warehouseId, 'locations'],
    queryFn:  () => bodegaApi.warehouses.locations.list(warehouseId as number),
    enabled:  warehouseId !== null,
  })
}

export function useCreateWarehouseLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ warehouseId, codigo }: { warehouseId: number; codigo: string }) =>
      bodegaApi.warehouses.locations.create(warehouseId, codigo),
    onSuccess: (_data, variables) => {
      // Invalida tanto la lista de ubicaciones como el detalle de la bodega (chip "Espacio
      // libre" depende de este catálogo) — un solo invalidate por prefijo cubre ambas queries.
      qc.invalidateQueries({ queryKey: ['bodega/warehouses', variables.warehouseId] })
    },
  })
}

export function useUpdateWarehouseLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ warehouseId, id, patch }: {
      warehouseId: number; id: number; patch: { codigo?: string; is_active?: boolean }
    }) => bodegaApi.warehouses.locations.update(warehouseId, id, patch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['bodega/warehouses', variables.warehouseId] })
    },
  })
}

// SCRUM-457/458/459 (REQ-387/388/389, Bloque B4) — Reubicación entre bodegas. Mismo patrón que
// `useAdjustmentRequests`/etc arriba.
export function useRelocationRequests(params?: { estado?: RelocationEstadoFilter; page?: number; per_page?: number | 'all' }) {
  return useQuery({
    queryKey: ['bodega/relocations', params],
    queryFn:  () => bodegaApi.relocations.list(params),
  })
}

function invalidateRelocationRequests(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['bodega/relocations'] })
}

export function useCreateRelocationRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: RelocationRequestPayload) => bodegaApi.relocations.create(payload),
    onSuccess:  () => invalidateRelocationRequests(qc),
  })
}

export function useApproveRelocationRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => bodegaApi.relocations.approve(id),
    onSuccess:  () => invalidateRelocationRequests(qc),
  })
}

export function useRejectRelocationRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => bodegaApi.relocations.reject(id, motivo),
    onSuccess:  () => invalidateRelocationRequests(qc),
  })
}

// SCRUM-467→472 (REQ-397→402) — Kardex.
export function useKardex(params?: {
  search?: string; tipo?: string; warehouse_id?: number; page?: number; per_page?: number | 'all'
}) {
  return useQuery({
    queryKey: ['bodega/kardex', params],
    queryFn:  () => bodegaApi.kardex.list(params),
  })
}

// SCRUM-428/429/430/446/447/448/449/450 — Solicitud de ajuste.
export function useAdjustmentRequests(params?: { estado?: string; page?: number; per_page?: number | 'all' }) {
  return useQuery({
    queryKey: ['bodega/adjustment-requests', params],
    queryFn:  () => bodegaApi.adjustmentRequests.list(params),
  })
}

export function useSearchAdjustmentProducts(search: string) {
  return useQuery({
    queryKey: ['bodega/adjustment-requests/products/search', search],
    queryFn:  () => bodegaApi.adjustmentRequests.searchProducts(search),
    enabled:  search.trim().length > 0,
  })
}

export function useProductWarehouseStock(productId: number | null) {
  return useQuery({
    queryKey: ['bodega/adjustment-requests/products', productId, 'warehouse-stock'],
    queryFn:  () => bodegaApi.adjustmentRequests.productWarehouseStock(productId as number),
    enabled:  productId !== null,
  })
}

function invalidateAdjustmentRequests(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['bodega/adjustment-requests'] })
}

export function useCreateAdjustmentRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ catalogProductId, lines, confirmReplace }: { catalogProductId: number; lines: AdjustmentRequestLineDraft[]; confirmReplace?: boolean }) =>
      bodegaApi.adjustmentRequests.create(catalogProductId, lines, confirmReplace),
    onSuccess: () => invalidateAdjustmentRequests(qc),
  })
}

export function useApproveAdjustmentLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (lineId: number) => bodegaApi.adjustmentRequests.approve(lineId),
    onSuccess:  () => invalidateAdjustmentRequests(qc),
  })
}

export function useRejectAdjustmentLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ lineId, motivo }: { lineId: number; motivo: string }) => bodegaApi.adjustmentRequests.reject(lineId, motivo),
    onSuccess:  () => invalidateAdjustmentRequests(qc),
  })
}

// SCRUM-329 Oleada A / Batch A3 (REQ-305→335) — tablero "Pedidos".
/** Tablero filtrado — search/assistant_id/cliente/chip viajan al backend (REQ-309/310), que ya
 * combina filtros+chip en la misma query (AND real). El filtro de Vendedor no tiene un endpoint
 * por id en Bodega (el board solo expone el nombre) — se aplica client-side sobre este resultado
 * ya filtrado, ver `PedidosPage.tsx`. */
export function useOrdersBoard(filters?: OrderBoardFilters) {
  return useQuery({
    queryKey: ['bodega/orders/board', filters],
    queryFn:  () => bodegaApi.orders.board(filters),
  })
}

// SCRUM-171 RN2 — ver docblock de `BodegaRutasDiaResponse` en types/bodega.ts.
export function useBodegaRutasDia() {
  return useQuery({
    queryKey: ['bodega/rutas-dia'],
    queryFn:  () => bodegaApi.rutasDia.list(),
  })
}

/** Universo completo (sin filtros) — solo para poblar dinámicamente las opciones de los
 * selectores de Cliente/Vendedor (REQ-309: "no una lista estática"), no para pintar el tablero. */
export function useOrdersBoardOptions() {
  return useQuery({
    queryKey:  ['bodega/orders/board', 'options'],
    queryFn:   () => bodegaApi.orders.board(),
    staleTime: 60_000,
  })
}

/** REQ-306 — panel de carga por asistente; también fuente de las opciones (id+nombre) del
 * selector "Asistente" en los filtros (REQ-309), que sí soporta id en el backend. */
export function useAssistantLoad() {
  return useQuery({
    queryKey: ['bodega/orders/assistant-load'],
    queryFn:  () => bodegaApi.orders.assistantLoad(),
  })
}

/** REQ-332 — modal "Ver detalle". */
export function useOrderDetail(id: number | null) {
  return useQuery({
    queryKey: ['bodega/orders', id],
    queryFn:  () => bodegaApi.orders.detail(id as number),
    enabled:  id !== null,
  })
}

/** REQ-330 — descarga/preview de un documento generado (Guía de Entrega, Estatus de Pedido). */
export function useOrderDocumentDownloadUrl() {
  return useMutation({
    mutationFn: ({ orderId, documentId }: { orderId: number; documentId: number }) =>
      bodegaApi.orders.documentDownloadUrl(orderId, documentId),
  })
}

/** SCRUM-403 (REQ-333) — modal "Ver bodegas". Se pide UNA vez a nivel del modal de detalle (no
 * por fila) — cada fila busca su propio `catalog_product_id` dentro de `products` ya resuelto. */
export function useOrderWarehouseBreakdown(orderId: number | null) {
  return useQuery({
    queryKey: ['bodega/orders', orderId, 'warehouse-breakdown'],
    queryFn:  () => bodegaApi.orders.warehouseBreakdown(orderId as number),
    enabled:  orderId !== null,
  })
}

/** SCRUM-391 (REQ-321) — consolidado del día por picker, solo se pide con un picker seleccionado
 * (chip único, RN de "uno a la vez").
 *
 * Pre-QA 2026-07-24 (A3-cierre) — `staleTime: 0` explícito, override del default global de
 * `queryClient` (30s, ver `src/lib/queryClient.ts`). Con el default, cerrar y reabrir el modal
 * dentro de esos 30s servía el consolidado CACHEADO (pedidos/cantidades de una tarjeta que ya
 * pudo haber salido de "En picking" mientras tanto) en vez del estado real — riesgo real para un
 * Picker físico en bodega, que podría recoger artículos de un pedido que ya no lo necesita. Este
 * hook es de las pocas pantallas de Bodega con esa consecuencia física directa (RN3 del ticket:
 * "refleja el momento en que se abre" — cada apertura debe ser una lectura fresca, no una de
 * hasta 30s de antigüedad), así que el override es local a este hook, no un cambio del default
 * global (que sí es aceptable para paneles de solo lectura/analítica).
 */
export function useConsolidatedPicking(pickerId: number | null) {
  return useQuery({
    queryKey: ['bodega/orders/consolidated-picking', pickerId],
    queryFn:  () => bodegaApi.orders.consolidatedPicking(pickerId as number),
    enabled:  pickerId !== null,
    staleTime: 0,
  })
}

/** SCRUM-401 (REQ-331) — estado de Factura, disparado solo al clic en "ver" (mismo criterio que
 * `useOrderStatusDocument`: un GET sin efecto lateral, pero consumido on-demand). */
export function useOrderInvoiceStatus() {
  return useMutation({
    mutationFn: (orderId: number) => bodegaApi.orders.invoice(orderId),
  })
}

/** SCRUM-390 (REQ-320) — descarga a Excel de la tabla de detalle de artículos. */
export function useExportOrderItemsExcel() {
  return useMutation({
    mutationFn: (orderId: number) => bodegaApi.orders.exportItemDetail(orderId),
  })
}

// SCRUM-329 Oleada A / Batch A2 (SCRUM-383→386, REQ-313→316) — flujo de picking.
function invalidateOrdersBoardAndDetail(qc: ReturnType<typeof useQueryClient>, orderId: number) {
  // Prefijo compartido por `useOrdersBoard`/`useOrdersBoardOptions` (mismo criterio que
  // `invalidateRelocationRequests` arriba) — un solo invalidate refresca el tablero y las
  // opciones de filtro a la vez.
  qc.invalidateQueries({ queryKey: ['bodega/orders/board'] })
  qc.invalidateQueries({ queryKey: ['bodega/orders', orderId] })
}

/** SCRUM-383 (REQ-313) — Asignado -> Picking pendiente. RN3 (403 rol inválido) y "picker
 * inválido" (422) los maneja el caller mostrando el mensaje real del backend. */
export function useAssignPicker() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, pickerId }: { orderId: number; pickerId: number }) =>
      bodegaApi.orders.assignPicker(orderId, pickerId),
    onSuccess: (_data, variables) => invalidateOrdersBoardAndDetail(qc, variables.orderId),
  })
}

/** SCRUM-384 (REQ-314) — Picking pendiente -> En picking. */
export function useStartPicking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderId: number) => bodegaApi.orders.startPicking(orderId),
    onSuccess: (_data, orderId) => invalidateOrdersBoardAndDetail(qc, orderId),
  })
}

/** SCRUM-385 (REQ-315) — Hoja de Picking. Sin `staleTime` corto especial: a diferencia del
 * consolidado del día (`useConsolidatedPicking`), acá cada apertura reinvalida explícitamente
 * después de cada mutación (asignar/iniciar/completar), así que el default global alcanza. */
export function useOrderPickingSheet(orderId: number | null) {
  return useQuery({
    queryKey: ['bodega/orders', orderId, 'picking-sheet'],
    queryFn:  () => bodegaApi.orders.pickingSheet(orderId as number),
    enabled:  orderId !== null,
  })
}

/** REQ-315 — guarda `qty_picked` sin completar (persistencia incremental mientras se edita). */
export function useUpdatePickingSheet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, items }: { orderId: number; items: PickingSheetItemPayload[] }) =>
      bodegaApi.orders.updatePickingSheet(orderId, items),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ['bodega/orders', variables.orderId, 'picking-sheet'] }),
  })
}

/** SCRUM-386 (REQ-316) — completa el picking; `review` no-null dispara REQ-317 (tarjeta de
 * Revisión de Inventario, resolución fuera de este batch). */
export function useCompletePicking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, items }: { orderId: number; items: PickingSheetItemPayload[] }) =>
      bodegaApi.orders.completePicking(orderId, items),
    onSuccess: (_data, variables) => {
      invalidateOrdersBoardAndDetail(qc, variables.orderId)
      qc.invalidateQueries({ queryKey: ['bodega/orders', variables.orderId, 'picking-sheet'] })
    },
  })
}

/** Botón "Descargar Excel" de la Hoja de Picking — mismo patrón on-demand que `useExportOrderItemsExcel`. */
export function useExportPickingSheetExcel() {
  return useMutation({
    mutationFn: (orderId: number) => bodegaApi.orders.exportPickingSheet(orderId),
  })
}

/** SCRUM-387/388 (REQ-317/318) — resolución de la tarjeta "Revisión de Inventario" (ver
 * `InventoryReviewModal.tsx`). Invalida tablero+detalle igual que `useCompletePicking` — la
 * tarjeta de revisión desaparece/avanza de etapa tras confirmar. */
export function useResolveInventoryReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, decisions }: { orderId: number; decisions: InventoryReviewDecisionPayload[] }) =>
      bodegaApi.orders.resolveInventoryReview(orderId, decisions),
    onSuccess: (_data, variables) => {
      invalidateOrdersBoardAndDetail(qc, variables.orderId)
      qc.invalidateQueries({ queryKey: ['bodega/orders', variables.orderId, 'picking-sheet'] })
    },
  })
}

/** SCRUM-393/394/395 (REQ-323/324/325) — "Registrar entrega y generar guía" (Packing -> Por
 * despachar). Invalida tablero+detalle: el backend genera la Guía de Entrega, notifica a
 * Administración y crea la tarjeta "Faltante" (si hubo entrega parcial) en la misma transacción —
 * un solo invalidate del tablero basta para que la nueva tarjeta "Faltante" aparezca. */
export function useRegisterDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: number; payload: RegisterDeliveryPayload }) =>
      bodegaApi.orders.registerDelivery(orderId, payload),
    onSuccess: (_data, variables) => invalidateOrdersBoardAndDetail(qc, variables.orderId),
  })
}

/** SCRUM-396 (REQ-326) — "Asignar Repartidor" (exclusivo Jefe de Bodega). El backend propaga el
 * mismo repartidor a los hermanos de familia en Por despachar — invalidar solo el tablero (no un
 * `orderId` puntual) para que esos hermanos también refresquen sin un fetch extra por cada uno. */
export function useAssignCourier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, courierId }: { orderId: number; courierId: number }) =>
      bodegaApi.orders.assignCourier(orderId, courierId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodega/orders/board'] }),
  })
}

/** SCRUM-398 (REQ-328) — "Despachar" (Por despachar -> Despachado). Mismo criterio que
 * `useAssignCourier`: el backend puede despachar hermanos de familia enteros en la misma llamada
 * (`dispatched_siblings`), así que se invalida todo el tablero, no un pedido puntual. Nombrado
 * `useDispatchOrder` (no `useDispatch`) para seguir la convención ya establecida en este archivo
 * de nombrar el hook por la entidad que muta (`useAssignPicker`, `useStartPicking`,
 * `useCompletePicking`), y para no leer como el `dispatch` genérico de un reducer. */
export function useDispatchOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderId: number) => bodegaApi.orders.dispatch(orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodega/orders/board'] }),
  })
}

/** SCRUM-399/400 (REQ-329/330) — "Confirmar Guía Firmada" (Despachado -> Entregado, automático).
 * Invalida tablero+detalle — la Guía de Entrega (`GuiaEntregaModal`) pasa a mostrar
 * `received_by_name` en el espacio de firma apenas se refetchea. */
export function useRegisterSignedGuide() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, payload }: { orderId: number; payload: RegisterSignedGuidePayload }) =>
      bodegaApi.orders.registerSignedGuide(orderId, payload),
    onSuccess: (_data, variables) => invalidateOrdersBoardAndDetail(qc, variables.orderId),
  })
}

// Batch A4 (SCRUM-407→413, REQ-337→343) — pantalla "Status de Pedidos", solo lectura, compartida
// entre Bodega (ve todo) y Ventas & Diseño (ve solo lo propio, ya filtrado por el backend).
export function useOrderStatusList(search?: string) {
  return useQuery({
    queryKey: ['bodega/orders/status', 'list', search],
    queryFn:  () => bodegaApi.orders.status.list(search ? { search } : undefined),
  })
}

/** Modal "Detalle del pedido". */
export function useOrderStatusDetail(orderId: number | null) {
  return useQuery({
    queryKey: ['bodega/orders/status', 'detail', orderId],
    queryFn:  () => bodegaApi.orders.status.detail(orderId as number),
    enabled:  orderId !== null,
  })
}

/** Botón "Ver/Descargar" del modal — genera (o regenera) el documento "Estatus de Pedido" en el
 * backend y devuelve la URL presignada; se dispara solo al clic, nunca automático. */
export function useOrderStatusDocument() {
  return useMutation({
    mutationFn: (orderId: number) => bodegaApi.orders.status.document(orderId),
  })
}

// SCRUM-363→374 (REQ-293→304) — Home de Bodega.
/** REQ-296 — chips de personas del equipo, solo se pide cuando el toggle Equipo está habilitado
 * y visible (gateado por `modules.bodega.view_team` en el JWT, ver BodegaHomePage). */
export function useBodegaHomeTeam(enabled: boolean) {
  return useQuery({
    queryKey: ['bodega/home/team'],
    queryFn:  () => bodegaApi.home.team(),
    enabled,
    staleTime: 60_000,
  })
}

/** Fix de regresión cruzada (2026-07-28) — hook compartido para `GET /bodega/team-members?role=`,
 * reemplaza las 3 copias que reusaban `useBodegaHomeTeam` para listar Courier/Picker (mini-form
 * "Asignar Repartidor" SCRUM-396, "Quién entregó" SCRUM-399, "Asignar Picker" SCRUM-383) tras la
 * restricción de `/bodega/home/team` a solo Asistentes (fix correcto del selector "Equipo" del
 * Home, ver `useBodegaHomeTeam` arriba — sigue sin tocar). No usar este hook para el selector del
 * Home: ese sigue en `useBodegaHomeTeam`. */
export function useTeamMembersByRole(role: BodegaTeamMemberRole, enabled: boolean) {
  return useQuery({
    queryKey: ['bodega/team-members', role],
    queryFn:  () => bodegaApi.teamMembers.byRole(role),
    enabled,
    staleTime: 60_000,
  })
}

/** REQ-294/297/299/300/302 — resumen completo de Home; incluye también los paneles que NO cambian
 * con el toggle (REQ-301/303/304, ver `types/bodega.ts`) porque el backend real los devuelve en el
 * mismo `summary()`, no en un endpoint separado. */
export function useBodegaHomeSummary(filters: { scope?: 'own' | 'team'; owner_id?: number }) {
  return useQuery({
    queryKey: ['bodega/home/summary', filters],
    queryFn:  () => bodegaApi.home.summary(filters),
  })
}

/** REQ-298 — "Mi calendario" / "Calendario del equipo", mismo patrón que
 * `ventasDisenoApi.calendar.list` (SCRUM-66/177). */
export function useBodegaCalendar(filters: { scope?: 'own' | 'team'; owner_id?: number; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['bodega/calendar', filters],
    queryFn:  () => bodegaApi.calendar.list(filters),
  })
}

// SCRUM-500 — administración de umbrales de Bodega, mismo patrón que
// `useComprasSettings`/`useUpdateComprasSettings`. `enabled` (default true) — la pantalla es
// superadmin.all estricto, la deshabilita cuando el gate de permiso falla en vez de disparar un
// request que el backend rechazaría de todas formas (mismo criterio que `useBodegaHomeTeam`).
export function useBodegaSettings(enabled = true) {
  return useQuery({
    queryKey: ['bodega/settings'],
    queryFn:  () => bodegaApi.settings.get(),
    enabled,
  })
}

export function useUpdateBodegaSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<BodegaSettings>) => bodegaApi.settings.update(data),
    onSuccess: (data) => {
      qc.setQueryData(['bodega/settings'], data)
      // Los umbrales alimentan el chip "Urgentes" del tablero de Pedidos y los paneles
      // Pendientes/Mayor rotación de Home — sin invalidar, el nuevo valor no se refleja hasta
      // un F5 manual (mismo gotcha ya conocido en `useUpdateComprasSettings`).
      qc.invalidateQueries({ queryKey: ['bodega/orders/board'] })
      qc.invalidateQueries({ queryKey: ['bodega/home/summary'] })
    },
  })
}

// SCRUM-329 Batch B2 (REQ-344→362, SCRUM-414→432) — "Ver Inventario". Ver nota de contrato
// especulativo en `types/bodega.ts`.
export function useBodegaInventory(params: BodegaInventoryListParams = {}) {
  return useQuery({
    queryKey:  ['bodega/inventory', params],
    queryFn:   () => bodegaApi.inventory.list(params),
    staleTime: 10_000,
  })
}

// SCRUM-425 (REQ-355) — "Ver ficha técnica". Fetch lazy por id (`enabled`), solo cuando se abre
// el sub-modal — `ProductDetailModal` de Bodega ya arma el resto de la vista con la fila que
// trae la lista, sin fetch propio; no vale la pena pagar esta llamada extra en cada apertura de
// "Ver Detalle" si el usuario nunca hace clic en "Ver ficha técnica".
export function useBodegaInventoryProduct(id: number | null) {
  return useQuery({
    queryKey: ['bodega/inventory', id],
    queryFn:  () => bodegaApi.inventory.get(id as number),
    enabled:  id !== null,
  })
}

/** Fix Pre-QA 2026-07-23 — lista de familias real de Bodega (`bodega.read`), reemplaza el uso
 * incorrecto de `ventasDisenoApi.catalogProductFamilies.list()` (403 para cualquier rol de
 * Bodega real, ver `docs/pre-qa/bloque-b2-ver-inventario-20260723.md`). */
export function useBodegaInventoryFamiliesList() {
  return useQuery({
    queryKey:  ['bodega/inventory/families'],
    queryFn:   () => bodegaApi.inventory.families.list(),
    staleTime: 300_000,
  })
}

export function useBodegaInventoryFamily(id: number | null) {
  return useQuery({
    queryKey: ['bodega/inventory/families', id],
    queryFn:  () => bodegaApi.inventory.families.get(id as number),
    enabled:  id !== null,
  })
}

/** SCRUM-423 (REQ-354) — modal "Por servir", solo pide al abrirse (`enabled`). */
export function useBodegaPorServir(id: number | null) {
  return useQuery({
    queryKey: ['bodega/inventory', id, 'por-servir'],
    queryFn:  () => bodegaApi.inventory.porServir(id as number),
    enabled:  id !== null,
  })
}

/** SCRUM-424 (REQ-355) — modal "En camino", solo pide al abrirse (`enabled`). */
export function useBodegaEnCamino(id: number | null) {
  return useQuery({
    queryKey: ['bodega/inventory', id, 'en-camino'],
    queryFn:  () => bodegaApi.inventory.enCamino(id as number),
    enabled:  id !== null,
  })
}

/**
 * SCRUM-427 (REQ-357) — "Confirmar llegada física", acción POR PRODUCTO (reconciliado 2026-07-23
 * contra el contrato real del backend — ver nota en `types/bodega.ts`). Invalida el detalle y el
 * listado para que `arrival_confirmation.pending_bodega_action` se refresque de inmediato (RN2:
 * el botón debe desaparecer y la nota de espera aparecer sin recargar la página).
 */
export function useConfirmPhysicalArrival() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: BodegaConfirmArrivalPayload }) =>
      bodegaApi.inventory.confirmArrival(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bodega/inventory'] })
    },
  })
}

/** SCRUM-437 (REQ-367) — modal "Ver bodegas" del buscador de Zona Libre (3C), producto-scoped. */
export function useZonaLibreProductWarehouseBreakdown(catalogProductId: number | null) {
  return useQuery({
    queryKey: ['bodega/inventory', catalogProductId, 'warehouse-breakdown'],
    queryFn:  () => bodegaApi.inventory.warehouseBreakdown(catalogProductId as number),
    enabled:  catalogProductId !== null,
  })
}

// Batch B3 (SCRUM-433→445, REQ-363→375) — "Zona Libre de Colón".

/** REQ-363 — proveedor fijo, leído de `compras_settings.zona_libre_provider_id` (nunca
 * hardcodeado en el frontend). `staleTime` largo: no cambia durante una sesión de trabajo. */
export function useZonaLibreProvider() {
  return useQuery({
    queryKey:  ['bodega/zona-libre/provider'],
    queryFn:   () => bodegaApi.zonaLibre.provider(),
    staleTime: 300_000,
    retry:     false,
  })
}

/** REQ-372/373 — bandeja (3D), filtrada server-side vía `?status=` (RN1 de REQ-373: el chip
 * activo es la única fuente de verdad del filtro, sin filtrado adicional client-side). */
export function useZonaLibreRequests(status: ZonaLibreStatusFilter, page = 1, perPage: number | 'all' = 20) {
  return useQuery({
    queryKey: ['bodega/zona-libre/requests', status, page, perPage],
    queryFn:  () => bodegaApi.zonaLibre.requests.list({ status, page, per_page: perPage }),
  })
}

/** REQ-370 Escenario 1 — detalle on-demand para el modal "Ver motivo" de una solicitud rechazada. */
export function useZonaLibreRequestDetail(id: number | null) {
  return useQuery({
    queryKey: ['bodega/zona-libre/requests', id],
    queryFn:  () => bodegaApi.zonaLibre.requests.get(id as number),
    enabled:  id !== null,
  })
}

/** REQ-369 — "Guardar orden de compra" (3C). */
export function useCreateZonaLibreRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ZonaLibreRequestPayload) => bodegaApi.zonaLibre.requests.create(payload),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bodega/zona-libre/requests'] }),
  })
}

/** SCRUM-797 (revierte SCRUM-440) — "Editar" una solicitud mientras siga `pendiente`, disponible
 * para Líder de Bodega o Líder de Compras (gate real vive en el backend, ver
 * `BodegaZonaLibreRequestController::update()`). */
export function useUpdateZonaLibreRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ZonaLibreRequestPayload }) =>
      bodegaApi.zonaLibre.requests.update(id, payload),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['bodega/zona-libre/requests'] })
      qc.invalidateQueries({ queryKey: ['bodega/zona-libre/requests', id] })
    },
  })
}

/** REQ-375 — botón "Recordar" de una solicitud `pendiente` (3D). */
export function useRemindZonaLibreRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => bodegaApi.zonaLibre.requests.remind(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['bodega/zona-libre/requests'] }),
  })
}

// Bloque B5 (SCRUM-460→466, REQ-390→396) — "Inventario general".

/** Bandeja "Conteos generales" — `estado: undefined` = "Todas" (sin filtrar), mismo criterio que
 * `useAdjustmentRequests`/`useRelocationRequests`. */
export function useGeneralCounts(params?: { estado?: GeneralCountChip; page?: number; per_page?: number | 'all' }) {
  return useQuery({
    queryKey: ['bodega/general-counts', params],
    queryFn:  () => bodegaApi.generalCounts.list(params),
  })
}

/** Detalle con `lines[]` del panel "Nuevo conteo general" — se habilita recién cuando
 * `POST /bodega/general-counts` (creado al elegir bodega) devuelve un id. */
export function useGeneralCountDetail(id: number | null) {
  return useQuery({
    queryKey: ['bodega/general-counts', id],
    queryFn:  () => bodegaApi.generalCounts.detail(id as number),
    enabled:  id !== null,
  })
}

function invalidateGeneralCounts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['bodega/general-counts'] })
}

export function useCreateGeneralCount() {
  return useMutation({
    mutationFn: (payload: GeneralCountCreatePayload) => bodegaApi.generalCounts.create(payload),
  })
}

/** RN2 de REQ-392 — idempotente, el componente siempre manda el snapshot completo de líneas.
 * `setQueryData` (no invalidate) para reflejar la respuesta al instante sin un round-trip extra. */
export function useEvaluateGeneralCount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: GeneralCountEvaluatePayload }) =>
      bodegaApi.generalCounts.evaluate(id, payload),
    onSuccess: (data, variables) => {
      qc.setQueryData(['bodega/general-counts', variables.id], data)
    },
  })
}

export function useSubmitGeneralCount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, confirmReplace }: { id: number; confirmReplace?: boolean }) =>
      bodegaApi.generalCounts.submit(id, confirmReplace),
    onSuccess:  () => invalidateGeneralCounts(qc),
  })
}

export function useApproveGeneralCount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => bodegaApi.generalCounts.approve(id),
    onSuccess:  () => invalidateGeneralCounts(qc),
  })
}

export function useRejectGeneralCount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => bodegaApi.generalCounts.reject(id, motivo),
    onSuccess:  () => invalidateGeneralCounts(qc),
  })
}

/** REQ-396 — "Realizar ajuste". Invalida la bandeja para que `aplicado_at` (ya poblado por el
 * backend) llegue por refetch y el botón quede deshabilitado como "Ajuste aplicado" de forma
 * durable, no solo mientras dura el estado local del componente. */
export function useApplyGeneralCount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => bodegaApi.generalCounts.apply(id),
    onSuccess:  () => invalidateGeneralCounts(qc),
  })
}

/** SCRUM-462 (REQ-392, rebote de Gerencia Test 2026-08-14) — "Eliminar" un conteo en borrador
 * (pendiente_evaluacion/evaluado) desde la bandeja de "Conteos generales". */
export function useDeleteGeneralCount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => bodegaApi.generalCounts.delete(id),
    onSuccess:  () => invalidateGeneralCounts(qc),
  })
}

// Bloque B6 (SCRUM-473→489, REQ-403→419) — "Devoluciones".

/** Bandeja (3J) — filtrado server-side vía `?status=`, mismo criterio que
 * `useZonaLibreRequests`/`useAdjustmentRequests`. */
export function useCustomerReturns(status: CustomerReturnStatusFilter, page = 1, perPage: number | 'all' = 20) {
  return useQuery({
    queryKey: ['bodega/returns', status, page, perPage],
    queryFn:  () => bodegaApi.returns.list({ status, page, per_page: perPage }),
  })
}

/** REQ-415 — buscador de guías de entrega (3K), solo pide con texto (mismo criterio que el
 * buscador de "Ver motivo" de Zona Libre: search-as-you-type por diseño, sin debounce). */
export function useSearchReturnOrders(q: string) {
  return useQuery({
    queryKey: ['bodega/returns/search-orders', q],
    queryFn:  () => bodegaApi.returns.searchOrders(q),
    enabled:  q.trim().length > 0,
  })
}

/** Modal "Ver detalle" (REQ-405) y modal "Confirmar recepción física" (REQ-479/480) — ambos piden
 * el mismo detalle on-demand. */
export function useCustomerReturnDetail(id: number | null) {
  return useQuery({
    queryKey: ['bodega/returns', id],
    queryFn:  () => bodegaApi.returns.detail(id as number),
    enabled:  id !== null,
  })
}

function invalidateCustomerReturns(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['bodega/returns'] })
}

/** REQ-419 — "Guardar" de "Nueva devolución" (3K). */
export function useCreateCustomerReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateCustomerReturnPayload) => bodegaApi.returns.create(payload),
    onSuccess:  () => invalidateCustomerReturns(qc),
  })
}

/** SCRUM-478 — "Cargar documento firmado". Invalida la bandeja para que el botón de la fila pase
 * de "Cargar documento firmado" a "Confirmar recepción física" sin recargar. */
export function useUploadReturnSignedDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => bodegaApi.returns.uploadSignedDocument(id, file),
    onSuccess:  () => invalidateCustomerReturns(qc),
  })
}

/** SCRUM-476 — "Ver formulario", GET con efecto lateral consumido on-demand (mismo criterio que
 * `useOrderStatusDocument`). */
export function useReturnFormUrl() {
  return useMutation({ mutationFn: (id: number) => bodegaApi.returns.formUrl(id) })
}

// SCRUM-478 (rebote 2026-08-16) — "Ver documento firmado" para un `has_signed_document: true`.
export function useReturnSignedDocumentUrl() {
  return useMutation({ mutationFn: (id: number) => bodegaApi.returns.signedDocumentUrl(id) })
}

/** SCRUM-477 — "Ver guía de entrega original". */
export function useReturnDeliveryGuideUrl() {
  return useMutation({ mutationFn: (id: number) => bodegaApi.returns.deliveryGuideUrl(id) })
}

/** SCRUM-479/480 — "Confirmar recepción física", suma de vuelta al inventario y pasa a
 * `esperando_nota_credito`. */
export function useConfirmReturnReception() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ConfirmReturnReceptionPayload }) =>
      bodegaApi.returns.confirmReception(id, payload),
    onSuccess:  () => invalidateCustomerReturns(qc),
  })
}

/** SCRUM-481 (REQ-411 RN2) — rechazo con doble confirmación, exclusivo de Bodega. */
export function useRejectCustomerReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, rejection_reason }: { id: number; rejection_reason: string }) =>
      bodegaApi.returns.reject(id, { rejection_reason }),
    onSuccess:  () => invalidateCustomerReturns(qc),
  })
}

// SCRUM-490→495 (REQ-420→425, "Reportes de Bodega") — 4 tarjetas independientes, cada una con su
// propio endpoint, todas parametrizadas por el mismo `period` compartido (`ReportPeriodContext`).
export function useBodegaProductivityReport(period: BodegaReportPeriodKey) {
  return useQuery({
    queryKey: ['bodega/reports/productivity', period],
    queryFn:  () => bodegaApi.reports.productivity(period),
  })
}

export function useBodegaAdjustmentAccuracyReport(period: BodegaReportPeriodKey) {
  return useQuery({
    queryKey: ['bodega/reports/adjustment-accuracy', period],
    queryFn:  () => bodegaApi.reports.adjustmentAccuracy(period),
  })
}

// REQ-423 — snapshot del inventario actual (no varía con el período, ver docblock del backend),
// pero igual se refetchea con `period` en la queryKey para que "recalcular los 4 reportes a la
// vez" (RN1 de REQ-420) sea un comportamiento uniforme entre las 4 tarjetas.
export function useBodegaWarehouseCapacityReport(period: BodegaReportPeriodKey) {
  return useQuery({
    queryKey: ['bodega/reports/warehouse-capacity', period],
    queryFn:  () => bodegaApi.reports.warehouseCapacity(period),
  })
}

// REQ-424 — snapshot, mismo criterio que warehouseCapacity de arriba.
export function useBodegaInventorySummaryReport(period: BodegaReportPeriodKey) {
  return useQuery({
    queryKey: ['bodega/reports/inventory-summary', period],
    queryFn:  () => bodegaApi.reports.inventorySummary(period),
  })
}
