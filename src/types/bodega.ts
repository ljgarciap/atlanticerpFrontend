// SCRUM-451→456 (REQ-381→386) — pantalla "Bodegas".

// SCRUM-425 (REQ-355) — "Ver ficha técnica" reusa el mismo tipo que Compras (mismo dato de
// `catalog_products`, mismo modal compartido — ver `components/TechnicalSpecModal.tsx`).
import type { TechnicalSpec } from './compras'

export type WarehouseModo = 'ubicacion_exacta' | 'pendiente' | 'cliente'

export interface PhysicalWarehouse {
  id:             number
  name:           string
  responsable:    string | null
  capacidad_pct:  number | null
  modo_detalle:   WarehouseModo
}

export interface WarehouseKpis {
  responsable:     string | null
  total_products:  number
  total_units:     number
  capacidad_pct:   number | null
}

export interface WarehouseProductRow {
  stock_id:           number
  catalog_product_id: number
  factory_reference:  string | null
  reference:          string
  ubicacion:          string | null
  description:        string
  categoria:          string | null
  /** Mejora SCRUM-752 RN3 (Gerencia Test 2026-08-13) — unidades REALES de esta bodega puntual,
   * a diferencia de `disponible`/`stock_total` que son globales de toda la empresa. */
  unidades_en_bodega: number
  disponible:         number
  por_servir:         number
  stock_total:        number | null
  por_ingresar:       number
  en_camino:          number
  stock_minimo:       number | null
  estado:             'disponible' | 'bajo_stock' | 'sin_stock'
  proveedor:          string | null
  cliente?:           string | null
}

/**
 * SCRUM-454 (REQ-384, Bloque B4) — fila del chip "Espacio libre": el backend ya NO responde
 * `not_implemented` (ver `WarehouseController::buildEspacioLibreResponse()`), `data` trae este
 * shape en vez de `WarehouseProductRow[]` — no hay producto en una ubicación vacía. `estado`
 * siempre `'disponible'` (nunca `bajo_stock`/`sin_stock`, esos describen inventario de producto).
 */
export interface WarehouseEmptyLocationRow {
  id:        number
  ubicacion: string
  estado:    'disponible'
}

/** Discriminador en runtime entre las 2 formas posibles de `WarehouseDetailResponse.data` — una
 * fila de producto siempre trae `stock_id` (el id de `ProductWarehouseStock`), una fila de
 * ubicación vacía nunca lo trae (no hay stock que referenciar). */
export function isWarehouseEmptyLocationRow(
  row: WarehouseProductRow | WarehouseEmptyLocationRow,
): row is WarehouseEmptyLocationRow {
  return !('stock_id' in row)
}

export interface WarehouseDetailResponse {
  warehouse:        PhysicalWarehouse
  kpis:             WarehouseKpis
  ubicaciones:      string[]
  data:             WarehouseProductRow[] | WarehouseEmptyLocationRow[]
  // SCRUM-754 (rebote 2026-08-18) — "Bodega → Bodegas" era el único listado sin paginar del
  // batch de estandarización; mismo shape de meta que el resto de listados paginados.
  meta:             { total: number; per_page: number; current_page: number; last_page: number }
  /** @deprecated el backend ya no lo manda desde SCRUM-454 (Bloque B4) — queda opcional solo para
   * no romper fixtures/tests viejos que todavía lo seteen explícitamente. */
  not_implemented?: boolean
}

// ── Bloque B4 (SCRUM-454/457/458/459, REQ-384/387/388/389) — "Reubicación entre bodegas" ───────
// Ver ADR-SCRUM454-459-reubicacion-bodegas.md. Contrato verificado contra
// `RelocationRequestController`/`WarehouseLocationController` reales, ya pusheados a `dev`
// (commit b07b9a9 de atlanticerp-backend) — no especulativo.

/** El backend usa minúsculas (`RelocationRequest::ESTADO_*`), a diferencia de `AdjustmentEstado`
 * (que usa mayúscula inicial) — NO son el mismo vocabulario, confirmado contra el modelo real. */
export type RelocationEstado = 'pendiente' | 'aprobada' | 'rechazada'
export type RelocationEstadoFilter = RelocationEstado | 'todas'

export interface RelocationRequest {
  id:               number
  producto:         { id: number | null; reference: string | null; description: string | null }
  bodega_origen:    string | null
  bodega_destino:   string | null
  cantidad:         number
  motivo:           string
  solicitado_por:   string | null
  fecha:            string
  estado:           RelocationEstado
  motivo_rechazo:   string | null
  resuelto_por:     string | null
}

export interface RelocationRequestListResponse {
  data: RelocationRequest[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

/** `POST /bodega/relocations` — RN1: `destination_warehouse_id != origin_warehouse_id`
 * (validado server-side vía `different:`, el frontend además excluye la bodega actual del
 * selector). RN2: cantidad/motivo obligatorios. */
export interface RelocationRequestPayload {
  catalog_product_id:       number
  origin_warehouse_id:      number
  destination_warehouse_id: number
  cantidad:                 number
  motivo:                   string
}

/** SCRUM-454 (REQ-384) — catálogo editable de ubicaciones físicas por bodega, base del chip
 * "Espacio libre". Shape de `GET .../locations` (`index()` real, con `warehouse_id`). */
export interface WarehouseLocationRow {
  id:           number
  warehouse_id: number
  codigo:       string
  is_active:    boolean
}

/** `POST`/`PATCH .../locations` devuelven este shape más chico (sin `warehouse_id` — ya lo sabe
 * quien llama, es parte de la URL). */
export interface WarehouseLocationMutationResponse {
  id:        number
  codigo:    string
  is_active: boolean
}

// SCRUM-467→472 (REQ-397→402) — Kardex.
export type KardexTipo = 'Entrada' | 'Salida' | 'Ajuste' | 'Reubicación' | 'Devolución'

export interface KardexMovement {
  id:                number
  fecha:             string
  producto:          { id: number | null; reference: string | null; description: string | null }
  bodega:            string | null
  tipo:              KardexTipo
  cantidad:          number
  referencia:        string
  realizado_por:     string
  saldo_inicial:     number
  saldo_resultante:  number
}

export interface KardexListResponse {
  data: KardexMovement[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

// SCRUM-428/429/430/446/447/448/449/450 (REQ-358/359/360/376/377/378/379/380) — Solicitud de ajuste.
export type AdjustmentTipo = 'Sumar' | 'Restar'
/** SCRUM-797 RN7 — `Reemplazada` cuando el usuario confirma reemplazarla por una línea nueva
 * sobre el mismo producto+bodega (ver `AdjustmentRequestController::store()`). */
export type AdjustmentEstado = 'Pendiente' | 'Aprobada' | 'Rechazada' | 'Reemplazada'

/**
 * SCRUM-428 (corrección de Gerencia Test 2026-08-13) — Motivo pasa de texto libre a un
 * desplegable con exactamente estas 6 opciones (texto literal del comentario de Jira, ver
 * i18n bodega.adjustments.newModal.reasons.* para la etiqueta mostrada). `OTRO_ESPECIFICAR`
 * habilita el uso del campo Descripción para especificar, pero Descripción sigue sin ser
 * obligatorio ni siquiera en ese caso (criterio de aceptación explícito).
 *
 * SCRUM-429 (rebote 2026-08-17→18) — estos valores deben ser EXACTAMENTE los de
 * `AdjustmentRequestLine::MOTIVOS` en el backend (`Rule::in(...)` en
 * `AdjustmentRequestController::store()`); antes tenían un vocabulario propio en minúsculas
 * abreviado (`conteo_no_coincide`, `producto_danado`, ...) que nunca coincidió con el enum real
 * del backend — toda solicitud fallaba en validación ("El lines.0.motivo seleccionado no es
 * válido"), regresión introducida junto con SCRUM-428.
 */
export const ADJUSTMENT_MOTIVOS = [
  'CONTEO_FISICO_NO_COINCIDE', 'PRODUCTO_DANADO_ROTO', 'PRODUCTO_VENCIDO_OBSOLETO',
  'ERROR_DE_REGISTRO', 'ROBO_O_PERDIDA', 'OTRO_ESPECIFICAR',
] as const
export type AdjustmentMotivo = typeof ADJUSTMENT_MOTIVOS[number]

export interface AdjustmentRequestLine {
  id:              number
  producto:        { id: number | null; reference: string | null; description: string | null }
  bodega:          string | null
  tipo:            AdjustmentTipo
  cantidad:        number
  motivo:          string
  /** SCRUM-797 (Ver detalle) — el backend ya los devolvía en `formatLine()`, pero el tipo del
   * frontend no los declaraba y la tabla nunca los mostraba. */
  descripcion:     string | null
  responsable:     string | null
  evidencia_url:   string | null
  solicitado_por:  string | null
  fecha:           string
  estado:          AdjustmentEstado
  motivo_rechazo:  string | null
  resuelto_por:    string | null
}

export interface AdjustmentRequestListResponse {
  data: AdjustmentRequestLine[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
  // SCRUM-429 — si el usuario actual es "Mark" (primary_approver_user_id) para Aprobar/Rechazar.
  // El frontend no puede derivarlo solo (es una persona configurable, no un rol en el JWT).
  can_approve: boolean
}

/** 409 de `POST /adjustment-requests` (SCRUM-797 RN5→RN7) — una entrada por cada línea del
 * borrador que colisiona, `adjustment` (mismo producto+bodega, se reemplaza al confirmar) y/o
 * `general_count` (bodega completa cubierta por un conteo sin resolver, solo informativo — nunca
 * se reemplaza un conteo por un ajuste puntual). */
export interface AdjustmentDuplicateWarning {
  warehouse_id:    number
  warehouse_name:  string | null
  adjustment:      { id: number; fecha: string } | null
  general_count:   { id: number; fecha: string; estado: GeneralCountEstado } | null
}

export interface AdjustmentRequestLineDraft {
  warehouse_id: number
  tipo:         AdjustmentTipo
  cantidad:     number
  motivo:       AdjustmentMotivo | ''
  // SCRUM-428 (corrección de Gerencia Test 2026-08-13) — 2 campos nuevos, ambos opcionales:
  // Descripción (texto libre, también usado para detallar cuando motivo="otro") y Responsable
  // (texto libre, persona relacionada con el ajuste). Ninguno bloquea el envío de la solicitud.
  descripcion?: string
  responsable?: string
  evidencia:    File
}

export interface ProductWarehouseStockRow {
  warehouse_id: number
  name:         string
  quantity:     number
}

export interface ProductWarehouseStockResponse {
  por_servir: number
  warehouses: ProductWarehouseStockRow[]
}

export interface ProductSearchResult {
  id:          number
  reference:   string
  description: string
}

// SCRUM-329 Oleada A / Batch A3 (REQ-305→335, HU-335) — tablero "Pedidos".
export type OrderType  = 'pedido' | 'revision_inventario' | 'faltante'
export type OrderStage =
  | 'asignado' | 'picking_pendiente' | 'en_picking' | 'packing'
  | 'por_despachar' | 'despachado' | 'entregado'

/** REQ-311 — orden fijo del flujo Kanban, igual a `Order::STAGE_ORDER` en el backend. */
export const ORDER_STAGE_ORDER: OrderStage[] = [
  'asignado', 'picking_pendiente', 'en_picking', 'packing',
  'por_despachar', 'despachado', 'entregado',
]

/** Colores categóricos por etapa — mismo criterio que `STAGES`/`PIPELINE_STAGES` (CRM/Ventas &
 * Diseño): un color arbitrario por columna del Kanban, no un token de marca. */
export const ORDER_STAGE_COLORS: Record<OrderStage, string> = {
  asignado:          '#94a3b8',
  picking_pendiente: '#eab308',
  en_picking:        '#3b82f6',
  packing:           '#a855f7',
  por_despachar:     '#f97316',
  despachado:        '#5BA5A0',
  entregado:         '#16a34a',
}

export type OrderFamilyBadge = 'entrega_completa' | 'pendiente_falta_parte' | null

export interface OrderFamily {
  sequence_in_family: number | null
  total_in_family:    number | null
  badge:               OrderFamilyBadge
}

/** Forma de cada tarjeta devuelta por `GET /bodega/orders` y por `cardPayload()` en el detalle. */
export interface OrderCard {
  id:                          number
  order_number:                string
  order_type:                  OrderType
  stage:                       OrderStage
  proyecto:                    string | null
  cliente:                     string | null
  vendedor:                    string | null
  asistente:                   string | null
  picker:                      string | null
  repartidor:                  string | null
  fecha_entrega_comprometida:  string | null
  is_atrasado:                 boolean
  is_sin_stock:                boolean
  /** SCRUM-406 (REQ-336) — ya viaja en TODA tarjeta "sin stock" desde `cardPayload()` (Senior
   * Review 2026-07-23 la movió del `detail()` al board para no obligar a abrir el modal); `null`
   * para cualquier tarjeta que no está `is_sin_stock`. */
  eta_proveedor:                string | null
  invoice_ready:                boolean
  family:                      OrderFamily
  /** SCRUM-382 (REQ-312, corrección 2026-08-11) — "resumen de productos y cantidades" de la
   * tarjeta ("X productos y Y unidades"). */
  items_summary:                { product_count: number; unit_count: number }
}

export interface OrderBoardResponse {
  cards:            OrderCard[]
  counts_by_stage:  Partial<Record<OrderStage, number>>
  total:            number
}

/** REQ-306 — panel de carga por asistente. */
export interface AssistantLoad {
  assistant_id:      number
  assistant_name:    string | null
  orders_count:      number
  percent_of_total:  number
}

export interface OrderItemDetail {
  id:                  number
  catalog_product_id:  number | null
  reference:           string | null
  factory_reference:   string | null
  description:         string | null
  location:            string | null
  qty_requested:       number
  qty_reserved:        number
  qty_picked:          number
  qty_delivered:       number
  shortage_reason:     string | null
}

export type OrderDocumentTipo = 'guia_entrega' | 'estatus_pedido'

export interface OrderDocumentRef {
  id:                 number
  tipo:               OrderDocumentTipo
  created_at:         string
  /** REQ-330 — nombre de quien recibió/firmó, solo poblado en la guía ya firmada (REQ-329). */
  received_by_name:   string | null
}

/** REQ-332 — modal "Ver detalle". `contacto_cliente`/`direccion_entrega` vienen de
 * `Order.customer_contact`/`Order.delivery_address` (poblados desde `OrderService::
 * createFromApprovedQuote()`) — el backend los serializa con estos nombres en español, no en
 * inglés, para consistencia con el resto del payload de este endpoint (`cliente`, `vendedor`,
 * `asistente`, etc., todos en español). */
export interface OrderDetail extends OrderCard {
  items:              OrderItemDetail[]
  documents:          OrderDocumentRef[]
  contacto_cliente:   string | null
  /** Lote 4 (SCRUM-395/402, 2026-08-17) — teléfono/correo del contacto primario, separados de
   * `contacto_cliente` (que sigue siendo el string combinado "Nombre (teléfono)"). Mismo contacto,
   * re-derivado server-side de `pipelineCard.contacts` — ver `OrderBoardService::detail()`. */
  contacto_telefono:  string | null
  contacto_correo:    string | null
  direccion_entrega:  string | null
  /** SCRUM-385 (REQ-315, corrección 2026-08-11) — Cliente Master y Subcliente como campos
   * independientes (distinto de `cliente`, que es solo el Subcliente — ver docblock de
   * `OrderBoardService::detail()`), usados en el encabezado de la Hoja de Picking. */
  cliente_master:     string | null
  subcliente:         string | null
}

export interface OrderBoardFilters {
  search?:       string
  assistant_id?: number
  seller_id?:    number
  cliente?:      string
  chip?:         'urgentes' | 'atrasados' | 'sin_stock'
}

// SCRUM-329 Oleada A / Batch A2 (SCRUM-393→400, REQ-323→330) — Packing -> Por despachar ->
// Despachado -> Entregado. Contrato verificado contra `OrderDeliveryController`/`DeliveryService`
// reales (`atlanticerp-backend`), no especulativo — ver docblocks de esos archivos para el detalle de
// cada regla de negocio (RN) ya aplicada server-side.

/** REQ-324 RN1 — catálogo fijo de motivos de faltante, igual a `OrderItem::SHORTAGE_REASONS` en
 * el backend. `otra` exige `motivo_detalle` (texto libre) — el backend lo persiste concatenado
 * (`"otra:<texto>"`), el frontend siempre manda los 2 campos por separado. */
export type OrderShortageReason =
  | 'sin_stock' | 'no_encontrado' | 'danado' | 'reservado_otro_pedido' | 'referencia_equivocada' | 'otra'

export const ORDER_SHORTAGE_REASONS: OrderShortageReason[] = [
  'sin_stock', 'no_encontrado', 'danado', 'reservado_otro_pedido', 'referencia_equivocada', 'otra',
]

export interface RegisterDeliveryItemPayload {
  order_item_id:  number
  qty_delivered:  number
  motivo?:        OrderShortageReason
  motivo_detalle?: string
}

/** REQ-323/324/325 — `POST /bodega/orders/{id}/register-delivery`. `items` debe incluir TODOS los
 * ítems del pedido (el backend rechaza con 422 si falta alguno, ver `DeliveryService::
 * registerDelivery()`), no solo los que cambiaron. */
export interface RegisterDeliveryPayload {
  items:                RegisterDeliveryItemPayload[]
  observacion_general?: string
}

export interface RegisterDeliveryResponse {
  id:    number
  stage: OrderStage
}

/** REQ-326 — `POST /bodega/orders/{id}/assign-courier`. */
export interface AssignCourierResponse {
  id:         number
  courier_id: number
}

/** REQ-328 — `POST /bodega/orders/{id}/dispatch`. `dispatched_siblings` son los hermanos de
 * familia que además avanzaron en la MISMA llamada (RN3: solo los que ya tenían su propio
 * repartidor+factura listos) — un hermano que se queda esperando simplemente no aparece acá ni
 * cambia de etapa, se ve reflejado al refrescar el tablero. */
export interface DispatchResponse {
  order:               { id: number; stage: OrderStage }
  dispatched_siblings: { id: number; stage: OrderStage }[]
}

/** REQ-329/330 — `POST /bodega/orders/{id}/register-signed-guide` (multipart). `receivedByName`
 * es quien RECIBIÓ/firmó (Pre-QA 2026-07-23 CRÍTICO, distinto del repartidor que lo entregó) —
 * ver `OrderDocumentRef.received_by_name` y `DeliveryService::registerSignedGuide()`. */
export interface RegisterSignedGuidePayload {
  delivered_by_courier_id: number
  received_by_name:        string
  file:                     File
}

export interface RegisterSignedGuideResponse {
  id:    number
  stage: OrderStage
}

// Batch A4 (SCRUM-407→413, REQ-337→343) — pantalla "Status de Pedidos". Solo lectura, compartida
// entre Bodega (ve todo) y Ventas & Diseño (ve solo lo propio) — el filtro por rol ya lo aplica
// el backend (`GET /bodega/orders/status`), estos tipos reflejan el payload tal cual llega, sin
// traducir nombres de campo (mismatch ES/EN ya causó un bug real en este mismo batch, ver spec).
/** Una fila por pedido REAL — el backend ya consolida la familia, nunca llegan filas duplicadas
 * de un mismo pedido dividido. "Subcliente" y "Vendedor" reusan el mismo dato que "Cliente"/
 * "Diseñador" del detalle (ver `OrderStatusDetail`) — no son campos distintos. */
export interface OrderStatusRow {
  order_id:     number
  order_number: string
  quote_number: string | null
  subcliente:   string | null
  fecha_pedido: string | null
  vendedor:     string | null
}

export interface OrderStatusListResponse {
  data:  OrderStatusRow[]
  total: number
}

/** Ítems del detalle — ya consolidados por producto a través de toda la familia por el backend
 * (`solicitada`/`entregado`/`pendiente` vienen sumados, el frontend no recalcula nada). */
export interface OrderStatusItem {
  catalog_product_id: number | null
  reference:          string | null
  factory_reference:  string | null
  description:         string | null
  imagen:              string | null
  solicitada:          number
  entregado:           number
  pendiente:           number
}

/** Modal "Detalle del pedido". `disenador`/`cliente` son el mismo dato que `vendedor`/
 * `subcliente` de `OrderStatusRow`, con etiqueta distinta según el contexto — no hay 2 campos
 * separados en el backend. `fecha_estatus` viene server-computed; el frontend la usa tal cual. */
export interface OrderStatusDetail {
  order_id:      number
  order_number:  string
  quote_number:  string | null
  proyecto:      string | null
  disenador:     string | null
  cliente:       string | null
  contacto:      string | null
  telefono:      string | null
  fecha_estatus: string
  items:         OrderStatusItem[]
}

export interface OrderStatusDocument {
  document_id: number
  order_id:    number
  url:         string
}

// SCRUM-363→374 (REQ-293→304) — Home de Bodega. Contrato verificado contra
// `atlanticerp-backend/app/Modules/Bodega/Http/Controllers/BodegaHomeController.php` +
// `Services/BodegaHomeService.php` (Batch B1, construido en paralelo a esta pantalla) — nombres de
// campo tal cual el `summary()` real del backend, no la primera adivinanza de este batch.

export interface BodegaTeamMember {
  id:   number
  name: string
}

/** Fix de regresión cruzada (2026-07-28) — valores públicos que acepta `GET
 * /bodega/team-members?role=`, uno por cada selector real de personas del tablero de Pedidos
 * (`BodegaRoles::TEAM_MEMBERS_QUERY_MAP` en el backend es la fuente de verdad). `/bodega/home/team`
 * (`useBodegaHomeTeam`) sigue existiendo aparte, fijo a `asistente_bodega`, solo para el selector
 * "Equipo" del Home (REQ-296) — no reusar ese hook para listar Courier/Picker. */
export type BodegaTeamMemberRole = 'asistente_bodega' | 'courier' | 'picker'

/** REQ-294 — el backend ya resuelve nombre + resumen de una línea del usuario/equipo objetivo
 * (`BodegaHomeService::saludo()`), server-computed según `scope`/`owner_id`. */
export interface BodegaSaludo {
  nombre:  string
  fecha:   string
  resumen: string
}

/** REQ-297 — panel "Mi día" / "Día del equipo". `percent_despachado_hoy` alimenta la barra de
 * progreso, `percent_a_tiempo` el dato aparte — ambos ya vienen redondeados por el backend
 * (`round(..., 1)`), null cuando no hay base para calcularlos (evita división por cero). */
export interface BodegaMiDia {
  asignados_hoy:           number
  despachados_hoy:         number
  percent_despachado_hoy:  number | null
  percent_a_tiempo:        number | null
}

/** REQ-299 — el backend NO expone una prioridad por ítem ni un texto ya formateado, solo datos
 * crudos por tipo (`BodegaHomeService::pendientes()`); el mapeo tipo→prioridad y tipo→texto es
 * una decisión de este batch (ver `pendienteMeta()` en `BodegaHomePage.tsx` — a confirmar con
 * Luis/Analista si no era la intención). Campos opcionales porque varían según `type`. */
export type BodegaPendienteTipo = 'picking_no_iniciado' | 'guia_sin_subir' | 'ajuste_inventario_pendiente'

export interface BodegaPendienteItem {
  type:                         BodegaPendienteTipo
  order_id?:                    number
  order_number?:                string
  cliente?:                     string | null
  horas?:                       number
  dias?:                        number
  suggestion:                   string
  adjustment_request_line_id?:  number
  producto?:                    string | null
  bodega?:                      string | null
  solicitante?:                 string | null
}

export interface BodegaPendientes {
  count: number
  items: BodegaPendienteItem[]
}

/** REQ-300 — panel "Despachos urgentes" (entrega hoy o mañana, mismo criterio que el chip
 * `urgentes` del tablero de Pedidos). */
export interface BodegaDespachoUrgente {
  order_id:                    number
  order_number:                string
  cliente:                     string | null
  stage:                       OrderStage
  fecha_entrega_comprometida:  string | null
}

/** REQ-302 — `stages` es una lista (no un mapa) en el payload real; `urgentes_count` es un total
 * agregado, sin desglose por etapa — el desglose por etapa del chip "⚠️ Urgentes" se deriva
 * client-side de `despachos_urgentes` (mismo criterio, RN4), no de este campo. */
export interface BodegaEstadoPedidosStage {
  stage: OrderStage
  count: number
}

export interface BodegaEstadoPedidos {
  stages:          BodegaEstadoPedidosStage[]
  urgentes_count:  number
}

/** REQ-301 — panel "Por recibir" (no cambia con el toggle). Una fila por línea de la orden de
 * compra, no por orden — `is_zona_libre` es la `PurchaseOrder.modality`, no un recurso separado
 * (ver reporte de la tarea: "Órdenes Zona Libre" es la MISMA entidad `PurchaseOrder`, así que "Ver
 * orden" navega siempre a Compras, con o sin ese distintivo). */
export interface BodegaPorRecibirRow {
  purchase_order_id:       number
  factory_reference:       string | null
  reference:               string | null
  description:             string | null
  quantity:                number
  status:                  string
  estimated_arrival_date:  string | null
  provider_name:           string | null
  is_zona_libre:           boolean
}

/** REQ-303 — panel "Mayor rotación" (no cambia con el toggle). El array ya viene limitado a un
 * top-N configurable (`BodegaSettingsService::rotacionTopN()`) — no hay un campo de total
 * distinto del tamaño del array, así que "Ver los N artículos" usa `.length` (ver reporte). */
export interface BodegaRotacionItem {
  catalog_product_id:  number
  factory_reference:   string | null
  reference:           string | null
  description:         string | null
  total_salidas:       number
}

/** REQ-304 — panel "Artículos críticos" (no cambia con el toggle). A diferencia de
 * `mayor_rotacion`, el backend NO limita este array a un top-N — `.length` sí es el total real. */
export type BodegaCriticoEstado = 'bajo_stock' | 'sin_stock'

export interface BodegaCriticoItem {
  catalog_product_id:  number
  factory_reference:   string | null
  reference:           string | null
  description:         string | null
  disponible:          number
  reorder_point:       number | null
  estado:              BodegaCriticoEstado
}

// SCRUM-500 — pantalla de administración de umbrales de Bodega (hallazgo de Senior Review en
// Batch B1: regla dura del proyecto, "todo umbral de negocio va en tabla paramétrica configurable
// con CRUD/vista de admin" — ver CLAUDE.md § "Nunca"). Los 5 campos existen ya como filas
// key/value en `bodega_settings` (tabla genérica `key`/`value`, no columnas tipadas como
// `compras_settings`) — nombres tomados de las constantes `KEY_*` de
// `BodegaSettingsService` (`atlanticerp-backend/app/Modules/Bodega/Services/BodegaSettingsService.php`),
// la única fuente real disponible al momento de este batch: el Backend Dev construía el
// controlador/rutas REST en paralelo y todavía no existían commiteados en `dev` cuando se verificó
// (a diferencia de Home de Bodega, SCRUM-363→374, donde sí hubo un controlador real contra el cual
// verificar). Si el contrato final expone nombres distintos, el único ajuste necesario es este
// tipo + `bodegaApi.settings`/`useBodega.ts` — el resto de la pantalla no depende del nombre exacto.
export interface BodegaSettings {
  /** REQ-310 RN1 — ventana de días para el chip "🔥 Urgentes" del tablero de Pedidos (0 = solo hoy). */
  urgente_ventana_dias:          number
  /** REQ-299 — horas en "Asignado" sin iniciar picking antes de aparecer en "Pendientes". */
  pendientes_picking_horas: number
  /** REQ-299 — días en "Despachado" sin guía de entrega subida antes de aparecer en "Pendientes". */
  pendientes_guia_dias:     number
  /** REQ-303 — ventana de días del Kardex considerada para "Mayor rotación". */
  rotacion_ventana_dias:    number
  /** REQ-303 — tamaño del top-N de "Mayor rotación". */
  rotacion_top_n:           number
  /** REQ-423 RN1 — % de concentración que dispara el aviso de "Capacidad por bodega" (default 75). */
  capacidad_concentracion_pct: number
}

export interface BodegaHomeSummary {
  saludo:              BodegaSaludo
  mi_dia:              BodegaMiDia
  /** REQ-298 — solo el conteo de hoy (usado por `HomeService`/`ComprasHomeService` análogos para
   * el subtítulo de la tarjeta); los eventos reales de "Mi calendario" vienen de
   * `bodegaApi.calendar.list()` (`GET /bodega/calendar`, mismo `OutlookCalendarController`
   * compartido con Ventas & Diseño/Compras), no de este campo. */
  mi_calendario:       { events_today_count: number }
  pendientes:          BodegaPendientes
  despachos_urgentes:  BodegaDespachoUrgente[]
  estado_pedidos:      BodegaEstadoPedidos
  por_recibir:         BodegaPorRecibirRow[]
  mayor_rotacion:      BodegaRotacionItem[]
  articulos_criticos:  BodegaCriticoItem[]
}

// ── SCRUM-329 Batch B2 (REQ-344→362, SCRUM-414→432) — pantalla "Ver Inventario" de Bodega ──────
//
// Solo lectura, agregada POR PRODUCTO a través de TODAS las bodegas (a diferencia de "Bodegas"
// arriba, `WarehouseDetailResponse`, que es por bodega física puntual). Gateado por `bodega.read`
// (visible para todos los perfiles de Bodega, sin excepción de superadmin) — nunca reusa
// `InventoryController` de Compras (gateado `compras.*`, ver docblock de ese controller).
//
// CONTRATO ESPECULATIVO: al momento de este batch el Backend Dev construía en paralelo el
// controlador/endpoint real de este bloque (no existía commiteado en `dev` cuando se armó esta
// pantalla — mismo gap que ya documentó `BodegaSettings` arriba para SCRUM-500). Los nombres de
// campo siguen la MISMA convención ya usada y verificada en `WarehouseProductRow`/
// `InventoryProduct` (reference/factory_reference/categoria/disponible/por_servir/stock_total/
// por_ingresar/en_camino/stock_minimo/estado/proveedor) — si el contrato final del backend difiere,
// el único ajuste necesario es este bloque + `bodegaApi.inventory`/los hooks correspondientes en
// `useBodega.ts`, no el resto de `BodegaInventarioPage.tsx`.
//
// "Por servir" AQUÍ es un concepto DISTINTO al `por_servir` que ya expone `WarehouseProductRow`/
// `InventoryProduct` (que es la reserva de Ventas & Diseño al momento de comprar, ver
// `InventoryKpiService::porServirMap()`) — Bodega necesita clientes/pedidos comprometidos
// reales, endpoint nuevo (`BodegaPorServirResponse` abajo), NO el mismo dato re-etiquetado.

export type BodegaInventoryChip = 'todos' | 'en_atencion' | 'inactivos' | 'por_ingresar'
export type BodegaInventoryEstado = 'disponible' | 'bajo_stock' | 'sin_stock'

/**
 * REQ-419 — el mockup pide un 4to valor de Rotación, "Compra única", que NO existe como valor de
 * `rotation` en el backend (columna nullable string(10), solo alta/media/baja — ver migración
 * `2026_07_20_100015_add_rotation_to_ventas_diseno_catalog_products_table.php`). Se interpreta
 * client-side como "rotation === null" (producto sin clasificar / comprado una sola vez, nunca
 * se espera reponer) — a confirmar con Analista si la intención real era otra (ej. agregar un
 * valor nuevo al enum del backend). Ver `matchesRotationFilter()` en `BodegaInventarioPage.tsx`.
 */
export type BodegaInventoryRotationFilter = 'alta' | 'media' | 'baja' | 'compra_unica'

export interface BodegaInventoryKpis {
  total_products:    number
  low_stock:         number
  out_of_stock:      number
  in_attention:      number
  /** REQ-416 — "Total por servir", suma de unidades comprometidas (concepto Bodega, no el de
   * Ventas & Diseño) a través de todos los productos listados. */
  total_por_servir:  number
}

/**
 * REQ-427 RN2 — estado de "Confirmar llegada física" para un producto puntual, tal como lo
 * calcula `ArrivalConfirmationService::pendingSummary()`/`bulkPendingSummary()` (backend):
 * `pending_bodega_action` gatea si se muestra el botón, `awaiting_compras` gatea la nota de
 * espera (ambos pueden ser true a la vez con un reparto parcial).
 */
export interface BodegaArrivalConfirmation {
  pending_bodega_action: boolean
  awaiting_compras:      boolean
  /** Rebote REQ-427 (Gerencia Test 2026-08-13) — cantidad y usuario reales de la confirmación,
   * para que la nota de espera no sea un genérico "esperando a Compras". `confirmed_by_name` es
   * `null` cuando `awaiting_compras` es `false` (nadie confirmó todavía). */
  confirmed_quantity:    number
  confirmed_by_name:     string | null
}

export interface BodegaInventoryRow {
  id:                  number
  /**
   * SCRUM-421 (REQ-351) — columna de imagen del catálogo. `BodegaInventoryController::format()`
   * (backend, reusado por `index()` y `show()`) ya devuelve este campo — el tipo simplemente
   * nunca lo había declarado. `null` cuando el producto no tiene foto cargada; la celda cae al
   * placeholder (`IcoImage`) en ese caso.
   */
  photo_url:           string | null
  factory_reference:   string | null
  /** Rebote REQ-361/SCRUM-431 (Gerencia Test 2026-08-13) — el backend ya distingue `name` (nombre
   * real del producto, SCRUM-237/240) de `description` (texto libre aparte); el tipo nunca había
   * declarado `name`, así que el modal terminaba mostrando `description` como si fuera el nombre. */
  name:                string
  reference:           string
  description:         string
  /** Rebote REQ-361/SCRUM-431 — agregado a `BodegaInventoryController::format()` junto con el
   * resto del rebote (mismo campo que Compras ya expone desde 2026-08-11). */
  barcode:             string | null
  category:            string | null
  brand:               string | null
  family_id:           number | null
  family_name:         string | null
  rotation:            'alta' | 'media' | 'baja' | null
  /** Conteo liviano para la columna "Bodega(s)" — el desglose completo (REQ-422/SCRUM-422) se
   * pide on-demand vía `useProductWarehouseStock` (ya real, `bodega.read`), no un array acá para
   * no duplicar la misma fuente en 2 formas distintas. */
  warehouse_count:     number
  disponible:          number
  por_servir:          number
  stock_total:         number | null
  por_ingresar:        number
  en_camino:           number
  reorder_point:       number | null
  estado:              BodegaInventoryEstado
  provider_id:         number | null
  provider_name:       string | null
  is_active:           boolean
  arrival_confirmation: BodegaArrivalConfirmation
}

/**
 * SCRUM-425 (REQ-355) — respuesta de `GET /bodega/inventory/{id}`. Mismo shape que
 * `BodegaInventoryRow` (el backend reusa el mismo `format()` para `index()` y `show()`) más
 * `technical_spec`, que solo se pide vía este fetch por id, nunca en el listado.
 *
 * `technical_spec` opcional/nullable a propósito: `BodegaInventoryController::format()` (backend)
 * todavía NO incluye este campo aunque `Compras\Http\Controllers\InventoryController::format()`
 * (mismo `CatalogProduct`) sí lo expone — hallazgo de esta tarea (SCRUM-425), pendiente de que
 * Backend agregue `'technical_spec' => $product->technical_spec` a `BodegaInventoryController::
 * format()`. Hasta entonces el modal de Bodega siempre cae al estado vacío ("ficha técnica no
 * disponible"), nunca a un dato inventado.
 */
export interface BodegaInventoryDetail extends BodegaInventoryRow {
  technical_spec?: TechnicalSpec | null
}

export interface BodegaInventoryListResponse {
  fuzzy:      boolean
  kpis:       BodegaInventoryKpis
  data:       BodegaInventoryRow[]
  meta:       { total: number; per_page: number; current_page: number; last_page: number }
  /**
   * Facetas calculadas server-side sobre el universo completo activo (no solo la página actual
   * ya filtrada) — mismo patrón que `WarehouseDetailResponse.ubicaciones`. Agregadas por
   * `BodegaInventoryController::distinctActiveProviders()/distinctActiveBrands()` (SCRUM-419,
   * 2026-07-24).
   *
   * `providers` trae `{id, name}` (no solo el nombre, fix SCRUM-419/422 2026-07-28): el filtro
   * real (`provider_id` en `listParams`) es por id porque un producto se asocia por FK, un
   * selector solo-nombre no tenía forma de armarlo. `brands` sí sigue siendo `string[]` — se
   * filtra por el mismo string que se muestra, no por id.
   */
  providers?: Array<{ id: number; name: string }>
  brands?:    string[]
}

/** REQ-347/417 — item de la lista de familias para el toggle "Familias" y el filtro "Categoría"
 * de Bodega (`GET /bodega/inventory/families`, `bodega.read`). Fix Pre-QA 2026-07-23: el batch
 * original apuntaba por error a `ventasDisenoApi.catalogProductFamilies.list()`
 * (`ventas_diseno.read`, permiso que ningun rol de Bodega tiene) -- devolvia 403 en silencio para
 * cualquier usuario real de Bodega, dejando la pestana "Familias" y el dropdown "Categoria"
 * completamente vacios. Ver `docs/pre-qa/bloque-b2-ver-inventario-20260723.md`. */
export interface BodegaInventoryFamilyListItem {
  id:            number
  name:          string
  description:   string | null
  product_count: number
}

/**
 * REQ-418 (rebote de Gerencia Test 2026-08-12) — antes solo traía 4 campos livianos
 * (id/reference/description/stock_quantity), insuficiente para el criterio de aceptación: "el
 * detalle expandido de una familia debe mostrar la MISMA tabla de 14 columnas que la vista
 * Productos". Se amplía a la forma completa de `BodegaInventoryRow` — mismo shape, para que
 * `BodegaInventoryProductsTable` (BodegaInventarioPage.tsx) se reuse tal cual entre "Productos" y
 * el acordeón de "Familias", sin una segunda implementación de tabla que pueda desincronizarse.
 * // TODO: backend batch4 — `GET /bodega/inventory/families/{id}` todavía devuelve el shape viejo
 * (4 campos) al momento de este commit (worktree de Backend Dev en paralelo, ver memoria
 * project_estrategia_batch4_compras_bodega_20260815.md). Reconciliar en Senior Review.
 */
export type BodegaInventoryFamilyProductRow = BodegaInventoryRow

/** REQ-418 — SIN "Generar compra" (a diferencia de `InventoryFamilyDetail` de Compras): Bodega
 * nunca tiene `compras.edit`, y el propio ticket pide la vista de Familias sin ese botón. Tampoco
 * expone costo/valor total en ningún caso — Bodega no ve costo, nunca (a diferencia del modo
 * `restricted` opcional de Compras). */
export interface BodegaInventoryFamilyDetail {
  id:           number
  name:         string
  description:  string | null
  products:     BodegaInventoryFamilyProductRow[]
}

/**
 * SCRUM-423 (REQ-354) — modal "Por servir": pedidos de Bodega con unidades comprometidas de este
 * producto puntual (`OrderCommitmentService::committedDetail()`, verificado contra el backend
 * real 2026-07-23 — reconciliación post-batch). Mensaje explicativo cuando `data` viene vacío (RN
 * del ticket), nunca la nota de "data de ejemplo" del mockup — ver `BodegaInventarioPage.tsx`.
 */
export interface BodegaPorServirLine {
  order_id:      number
  order_number:  string
  customer_name: string | null
  project_name:  string | null
  stage:         string
  quantity:      number
}

export interface BodegaPorServirResponse {
  data: BodegaPorServirLine[]
}

/**
 * SCRUM-424 (REQ-355) — modal "En camino": proveedor + fecha real de la orden, para un producto
 * puntual (`InventoryKpiService::enCaminoDetail()`, verificado contra el backend real 2026-07-23).
 * Shape propio, NO `BodegaPorRecibirRow` — ese tipo trae columnas de producto (`reference`,
 * `description`, `status`, `is_zona_libre`) que no aplican acá, ya filtrado a un solo producto.
 */
export interface BodegaEnCaminoLine {
  purchase_order_id:      number
  provider_name:          string | null
  quantity:               number
  estimated_arrival_date: string | null
}

export interface BodegaEnCaminoResponse {
  data: BodegaEnCaminoLine[]
}

/**
 * SCRUM-427 (REQ-357) — "Confirmar llegada física". Verificado contra el mockup real
 * (`3B__Bodega_Inventario.html`) y el texto del ticket ("artículo por artículo", "el botón
 * desaparece") en la reconciliación de contrato del 2026-07-23: es una acción POR PRODUCTO,
 * disparada desde el detalle de ESE producto (`pd-confirmar-llegada-btn` en el mockup) — no una
 * acción de encabezado que agrupe todos los productos "en camino" del sistema (esa lectura inicial
 * del batch quedó descartada, no había endpoint de backend ni base en el mockup para ella).
 * `ArrivalConfirmationService::confirmArrival()` reparte `cantidad_entregada` FIFO entre las
 * líneas `purchase_order_receipt_lines` pendientes de ESE producto — granularidad por producto,
 * no por línea de compra individual.
 */
export interface BodegaConfirmArrivalPayload {
  cantidad_entregada: number
}

export interface BodegaConfirmArrivalResponse {
  confirmed_lines:    number[]
  confirmed_quantity: number
}

// ── Batch A3 wiring (2026-07-24) — SCRUM-403/391/401/390/406, backend ya completo y con Senior
// Review 🟢 (commits 6b0a47f/5959264/904a16a/f3ad374/b249a58/c729c3f), este frontend solo lo
// conecta. Ver `atlanticerp-backend/app/Modules/Bodega/Http/Controllers/OrderBoardController.php`,
// `OrderPickingController.php`, `OrderInvoiceController.php`, `OrderExportController.php`.

/**
 * SCRUM-403 (REQ-333) — modal "Ver bodegas" del pedido: desglose por bodega para TODOS los
 * artículos del pedido en una sola llamada (`WarehouseStockService::breakdownForProducts()`),
 * evita N requests (uno por línea) al abrir el modal. `products` es un array PHP asociativo
 * keyed por `catalog_product_id` — PHP lo serializa como objeto JSON con claves numéricas, no
 * como array secuencial (los ids no son consecutivos desde 0). Mismo shape por producto que
 * `ProductWarehouseStockResponse` (`AdjustmentRequestController::productWarehouseStock()`), la
 * misma fuente (`WarehouseStockService`) resuelve ambos endpoints.
 */
export interface OrderWarehouseBreakdownResponse {
  order_id: number
  products: Record<number, ProductWarehouseStockResponse>
}

/**
 * SCRUM-391 (REQ-321) — consolidado del día por picker (`PickingConsolidationService::
 * consolidatedForPicker()`). RN1: solo pedidos en `en_picking` cuentan del lado del backend.
 * RN2: solo lectura, sin mutación de cantidades acá.
 */
export interface OrderConsolidatedPickingOrderRef {
  order_id:      number
  order_number:  string
  qty_requested: number
}

export interface OrderConsolidatedPickingItem {
  catalog_product_id: number | null
  reference:          string | null
  description:        string | null
  /** Corrección 2026-08-11 (Gerencia Test, SCRUM-391) — columna obligatoria agregada tanto en
   * pantalla como en impresión (ver `PickingConsolidationService`). */
  location:           string | null
  qty_requested:       number
  orders:              OrderConsolidatedPickingOrderRef[]
}

export interface OrderConsolidatedPickingResponse {
  picker_id:    number
  orders_count: number
  items:        OrderConsolidatedPickingItem[]
}

/**
 * SCRUM-401 (REQ-331) — ALCANCE REDUCIDO a propósito (decisión de Luis, ver docblock de
 * `OrderInvoiceController` en el backend): Bodega nunca genera la Factura real (Subtotal/ITBMS/
 * Total), solo expone si está lista y un mensaje de estado — depende de un módulo de
 * Administración & Contabilidad que todavía no existe.
 */
export interface OrderInvoiceStatusResponse {
  order_id:       number
  order_number:   string
  invoice_ready:  boolean
  status_message: string
}

// SCRUM-329 Oleada A / Batch A2 (SCRUM-383→386, REQ-313→316) — flujo de picking. Contrato
// verificado contra `OrderPickingController` real (`atlanticerp-backend`, no especulativo).
export interface AssignPickerResponse {
  id:         number
  stage:      OrderStage
  picker_id:  number
}

export interface StartPickingResponse {
  id:    number
  stage: OrderStage
}

/**
 * REQ-315 — fila de la Hoja de Picking. `factory_reference` y `picking_notes` (Pre-QA
 * 2026-07-27, backend `d6555a2`) cierran el gap de contrato que este mismo docblock documentaba
 * antes: `OrderPickingController::pickingSheet()` ahora expone ambos campos (factory_reference
 * desde `catalog_products`, picking_notes desde la nueva columna nullable en
 * `bodega.order_items`). `picking_notes` respeta el mismo gate de "editable" que `qty_picked`
 * (solo mientras `stage === 'en_picking'`) — ver `PickingService::updatePickingSheet()`.
 */
export interface PickingSheetItem {
  id:                number
  reference:         string | null
  factory_reference: string | null
  description:       string | null
  /** Ubicación ORIGINAL — nunca sobrescrita por la Revisión de Inventario (corrección 2026-08-11,
   * SCRUM-388, ver `OrderItem::foundNote()` en el backend). */
  location:          string | null
  found_at:          boolean | null
  /** Ubicación nueva/confirmada durante la Revisión de Inventario, cruda (sin la nota ya armada) —
   * `null` si el ítem nunca pasó por una revisión resuelta como "Sí hay". */
  found_location:    string | null
  /** Nota ya armada por el backend: "Nueva ubicación: X — Confirmado por Y" — usar esto para la
   * columna "Encontrado en", no `found_location` suelto (ver `OrderItem::foundNote()`). */
  found_note:        string | null
  qty_requested:     number
  qty_picked:        number
  picking_notes:     string | null
}

export interface OrderPickingSheetResponse {
  order_id: number
  /** RN3 (REQ-315) — `true` solo si `order.stage === 'en_picking'`; en cualquier otra etapa la
   * hoja es de solo consulta. */
  editable: boolean
  items:    PickingSheetItem[]
}

export interface PickingSheetItemPayload {
  order_item_id: number
  qty_picked:    number
  /** Opcional — solo se manda cuando la fila tiene una Observación cargada (backend valida
   * `nullable|string|max:500`, ver `OrderPickingController::updatePickingSheet()`). */
  picking_notes?: string | null
}

export interface UpdatePickingSheetResponse {
  id:    number
  stage: OrderStage
}

export interface CompletePickingResponse {
  order:  { id: number; stage: OrderStage }
  /** `null` si el picking se completó al 100% (avanza directo a Packing); no-null cuando quedó
   * corto (REQ-317) — la tarjeta original igual avanza a Packing, pero además se creó esta
   * segunda tarjeta de Revisión de Inventario (etapa Picking pendiente, mismo `order_number`,
   * ver `PickingService::createInventoryReviewCard()`). La UI de resolución de esa tarjeta
   * (REQ-317/318) es un ticket propio, fuera de este batch — acá solo se informa que se generó. */
  review: { id: number; order_number: string } | null
}

// SCRUM-387/388 (REQ-317/318) — resolución de la tarjeta "Revisión de Inventario" generada por
// `CompletePickingResponse.review`. Backend ya implementado y Pre-QA'd desde 2026-07-22 (ver
// CLAUDE.md), este frontend nunca terminó de cablearlo. Sin endpoint GET dedicado — reusa
// `GET .../picking-sheet` (`PickingSheetItem`/`OrderPickingSheetResponse` arriba) para listar los
// ítems, no filtra por `order_type`.

/** `POST /bodega/orders/{id}/resolve-inventory-review` — una decisión por ítem de la hoja.
 * `location` obligatorio (422 si falta) solo cuando `found === true`; se omite para `found === false`. */
export interface InventoryReviewDecisionPayload {
  order_item_id: number
  found:          boolean
  location?:      string
}

export interface ResolveInventoryReviewPayload {
  decisions: InventoryReviewDecisionPayload[]
}

/** Confirmado contra `OrderPickingController::resolveInventoryReview()` (Batch A2, 2026-07-22) —
 * no es plano como `StartPickingResponse`: `review` es la misma tarjeta ya resuelta (RN1/RN2) y
 * `new_order` solo existe en el desenlace mixto (RN3, dos tarjetas separadas). Ninguno de los dos
 * se lee hoy en `InventoryReviewModal` (el refresh del tablero sale de invalidar la query, no de
 * este payload) — se deja tipado correcto igual, para que el día que alguien sí necesite leerlo
 * (ej. mostrar el número del pedido nuevo en el banner de confirmación) no arrastre el shape
 * plano equivocado. */
export interface ResolveInventoryReviewResponse {
  review:    { id: number; stage: OrderStage; order_type: OrderType }
  new_order: { id: number; stage: OrderStage } | null
}

// ── Batch B3 (SCRUM-433→445, REQ-363→375) — "Zona Libre de Colón" ────────────────────────────
//
// Bodega genera órdenes de compra directas al proveedor fijo "Zona Libre de Colón"; Compras
// (Yirena) las aprueba o rechaza por fuera de este alcance
// (`POST /compras/zona-libre/requests/{id}/approve|reject`, ver
// `atlanticerp-backend/docs/adr/ADR-SCRUM433-445-zona-libre-colon.md`). Contrato verificado contra el
// backend ya implementado y pusheado a `dev` (commits e2e1b83/ea82918/1f72ce4, 1251 tests verdes)
// — no especulativo, a diferencia de otros bloques de este mismo épico.

export type ZonaLibreShippingType = 'aereo' | 'maritimo' | 'terrestre'
export type ZonaLibreStatus       = 'pendiente' | 'aprobada' | 'rechazada'
export type ZonaLibreStatusFilter = ZonaLibreStatus | 'todas'

/** `GET /bodega/zona-libre/provider` — 422 si `compras_settings.zona_libre_provider_id` no está
 * configurado (el proveedor vive en tabla paramétrica, nunca hardcodeado — ver ADR § 2). El 422
 * se propaga como error de la query, ver `BodegaNuevaOrdenZonaLibrePage.tsx`. */
export interface ZonaLibreProvider {
  id:   number
  name: string
}

/** Fila de la bandeja (3D) — también la base de `ZonaLibreRequestDetail`. */
export interface ZonaLibreRequestRow {
  id:                      number
  order_number:            string
  provider_name:           string
  created_at:              string
  /** Nombre del producto si la solicitud tiene 1 sola línea, "N productos" si son varias — ya
   * calculado server-side (REQ-372), no se recalcula acá. */
  products_summary:        string
  total_amount:            number
  estimated_arrival_date:  string | null
  shipping_type:           ZonaLibreShippingType | null
  status:                  ZonaLibreStatus
  requested_by_name:       string | null
  /** FK al `PurchaseOrder` real, solo poblado una vez `aprobada` — sin pantalla propia en este
   * batch (Bodega solo consulta el resultado, REQ-370 RN1/Escenario 2, sin acción de
   * aprobar/rechazar acá). */
  generated_order_id:      number | null
}

export interface ZonaLibreRequestLine {
  id:                  number
  catalog_product_id:  number
  reference:           string | null
  /** SCRUM-797 — el formulario de "Editar" precarga el carrito desde estas líneas. */
  factory_reference:   string | null
  description:         string | null
  quantity:            number
  unit_cost_snapshot:  number
  subtotal:            number
}

/** `GET /bodega/zona-libre/requests/{id}` — detalle, incluye motivo de rechazo (REQ-370
 * Escenario 1) — pedido on-demand desde la bandeja, no viaja en `ZonaLibreRequestRow`. */
export interface ZonaLibreRequestDetail extends ZonaLibreRequestRow {
  notes:             string | null
  rejection_reason:  string | null
  approved_by_name:  string | null
  rejected_by_name:  string | null
  lines:              ZonaLibreRequestLine[]
}

export interface ZonaLibreRequestListResponse {
  data: ZonaLibreRequestRow[]
  // SCRUM-754 (2026-08-18) — mismo shape que PaginationMeta (components/ui/Pagination.tsx).
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

export interface ZonaLibreRequestLinePayload {
  catalog_product_id: number
  quantity:            number
}

/** `POST /bodega/zona-libre/requests` — 422 si `lines` viene vacío (REQ-369 RN1), replicado
 * también client-side (el botón "Guardar orden" nunca se renderiza con el carrito vacío) antes de
 * disparar el request. */
export interface ZonaLibreRequestPayload {
  shipping_type?:           ZonaLibreShippingType
  estimated_arrival_date?:  string
  notes?:                    string
  lines:                      ZonaLibreRequestLinePayload[]
}

/** `GET /bodega/inventory/{catalog_product_id}/warehouse-breakdown` (SCRUM-437/REQ-367) — mismo
 * shape por fila que `ProductWarehouseStockRow` (warehouse_id/name/quantity), pero envuelto en
 * `data`, no en `{por_servir, warehouses}` como `ProductWarehouseStockResponse` (endpoint
 * distinto, sin concepto de "por servir" acá, producto-scoped y NO depende de que exista una
 * orden) — ya viene filtrado a quantity > 0 en el backend (RN1). */
export interface ZonaLibreProductWarehouseBreakdownResponse {
  data: ProductWarehouseStockRow[]
}

// ── Bloque B5 (SCRUM-460→466, REQ-390→396) — "Inventario general" (conteos físicos completos por
// bodega, con doble aprobación: Mark aprueba el conteo y luego Bodega confirma "Realizar ajuste"
// antes de que se aplique al inventario real — excepción intencional al patrón de Ajustes/
// Reubicación, donde la aprobación de Mark ya aplica el cambio sola, ver REQ-396 RN1). Contrato
// verificado contra `GeneralCountController` real, ya pusheado a `dev` (atlanticerp-backend commits
// ae1d6c0/ff3b345/a8d1b5d, 21/21 tests) — no especulativo.

/** SCRUM-797 RN7 — `reemplazada` cuando el usuario confirma reemplazarlo por un conteo nuevo
 * sobre la misma bodega (ver `GeneralCountController::store()`/`submit()`). */
export type GeneralCountEstado = 'pendiente_evaluacion' | 'evaluado' | 'pendiente_aprobacion' | 'aprobada' | 'rechazada' | 'reemplazada'

/** Chips de la bandeja (RN4 de REQ-395): solo 4, "Pendientes" filtra específicamente
 * `pendiente_aprobacion` (conteo ya evaluado y enviado a Mark) — `pendiente_evaluacion`/`evaluado`
 * son estados transitorios del panel "Nuevo conteo general" mientras Bodega todavía lo está
 * armando, no filas relevantes de la bandeja/historial. */
export type GeneralCountChip = 'todas' | 'pendiente_aprobacion' | 'aprobada' | 'rechazada'

export interface GeneralCountRow {
  id:               number
  warehouse_id:     number
  bodega:           string
  realizado_por:    string | null
  estado:           GeneralCountEstado
  total_productos:  number
  /** RN3 (REQ-395) — columna "Diferencias encontradas". Agregado por Pre-QA 2026-07-25:
   * `GeneralCountController::index()` no lo exponía y el frontend fabricaba un "—" fijo en
   * vez del número real que pide el mockup (ver `docs/pre-qa/bloque-b5-inventario-general-2026-07-25.md`). */
  diferencias_encontradas: number
  fecha:            string
  /** SCRUM-797 (RN8, "Ver detalle") — momento en que `submit()` pidió la aprobación de Mark,
   * distinto de `fecha` (creación del borrador). `null` mientras el conteo sigue en borrador. */
  fecha_solicitud_aprobacion: string | null
  motivo_rechazo:   string | null
  resuelto_por:     string | null
  resuelto_at:      string | null
  /** `POST .../apply` (REQ-396) — `null` hasta que Bodega confirma "Realizar ajuste" tras la
   * aprobación de Mark. Fuente de verdad de si el botón debe verse deshabilitado como
   * "Ajuste aplicado". */
  aplicado_at:      string | null
}

export interface GeneralCountListResponse {
  data: GeneralCountRow[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
  // SCRUM-463 — si el usuario actual es "Mark" (primary_approver_user_id) para Aprobar/Rechazar.
  // El frontend no puede derivarlo solo (es una persona configurable, no un rol en el JWT).
  can_approve: boolean
}

/** Fila de `lines[]` en el detalle — `cantidad_sistema`/`cantidad_contada`/`diferencia` vienen
 * `null` hasta el primer `POST .../evaluate` (REQ-392). `tiene_cruce_pendiente`+`cruce_fecha`
 * (REQ-391) señalan que ese producto ya tiene una solicitud de ajuste cíclico pendiente en
 * Solicitud de ajuste (3E) — la advertencia se muestra junto al producto, antes de evaluar/enviar. */
export interface GeneralCountLine {
  id:                     number
  producto:               { id: number; reference: string; description: string }
  cantidad_sistema:       number | null
  cantidad_contada:       number | null
  diferencia:             number | null
  tiene_cruce_pendiente:  boolean
  cruce_fecha:            string | null
}

export interface GeneralCountDetail extends GeneralCountRow {
  lines: GeneralCountLine[]
}

export interface GeneralCountCreatePayload {
  warehouse_id: number
  /** SCRUM-797 (rebote 2026-08-27) — confirma reemplazar la(s) línea(s) puntual(es) con conflicto
   * real (ver `GeneralCountDuplicateWarning`), nunca el conteo/bodega completa. */
  confirm_replace?: boolean
}

/** 409 de `POST /general-counts` o `POST /general-counts/{id}/submit` (SCRUM-797, rebote de
 * Gerencia Test 2026-08-27) — un elemento por PRODUCTO en conflicto (ya no un conteo único por
 * bodega completa), para que el frontend arme el modal de confirmación con la lista real. */
export interface GeneralCountDuplicateWarning {
  catalog_product_id: number
  product_reference:  string | null
  product_name:        string | null
  general_count:       { id: number; fecha: string; estado: GeneralCountEstado }
}

/** `POST /bodega/general-counts` — respuesta mínima (sin `lines[]`); el detalle completo se pide
 * aparte con `GET /{id}` una vez creado. */
export interface GeneralCountCreateResponse {
  id:               number
  total_productos:  number
}

/** `POST .../evaluate` — TODAS las líneas del conteo, sin excepción (422 si falta alguna o sobra
 * alguna con id ajeno, RN1 de REQ-392). Idempotente: recalcula todo de cero en cada llamada, así
 * que si el usuario edita `cantidad_contada` después de evaluar, el frontend oculta la columna
 * Diferencia (RN2) y vuelve a mandar el payload COMPLETO en el siguiente click de "Evaluar" (no
 * un delta). */
export interface GeneralCountEvaluatePayload {
  lines: Array<{ id: number; cantidad_contada: number }>
}

// ── Bloque B6 (SCRUM-473→489, REQ-403→419) — "Devoluciones" (customer returns): seguimiento desde
// la solicitud hasta la nota de crédito. Backend ya implementado localmente en `atlanticerp-backend`
// (`dev`, commit 4ab8513 "feat(bodega): add customer returns backend (Bloque B6, SCRUM-473->489)")
// y corriendo en Docker local — todavía NO pusheado a origin (pendiente Senior Review + Pre-QA).
// Contrato tomado del brief de la tarea, no de una lectura directa del controller real — reconciliar
// si Pre-QA encuentra discrepancias, mismo criterio que otros bloques "especulativos" del épico.

export type CustomerReturnStatus = 'pendiente' | 'esperando_nota_credito' | 'finalizado' | 'rechazada'
export type CustomerReturnStatusFilter = CustomerReturnStatus | 'todas'

export type CustomerReturnReason =
  | 'danado_defectuoso'
  | 'no_corresponde'
  | 'cliente_cambio_opinion'
  | 'excedente'
  | 'error_instalacion'
  | 'otra'

/** Línea de producto de una devolución — ya viene con todo el detalle en `CustomerReturnRow.products`
 * (a diferencia de `ZonaLibreRequestRow`, que solo trae un resumen calculado server-side), lo que
 * permite armar la fila expandida de SCRUM-474 sin una llamada extra. `reason_detail` — corregido
 * 2026-07-26 (hallazgo de Senior Reviewer): el backend ahora separa el código de motivo del texto
 * libre en `CustomerReturnController::formatLine()`/`CustomerReturnLine::reasonDetail()`, siempre
 * presente (no opcional) en la respuesta. */
export interface CustomerReturnProduct {
  id:              number
  order_item_id:   number
  reference:       string | null
  description:     string | null
  qty_requested:   number
  qty_received:    number | null
  reason:          CustomerReturnReason
  reason_detail:   string | null
}

/** `project` — agregado 2026-07-26 (hallazgo de Visual Reviewer: columna "Proyecto" del mockup
 * 3J ausente pese a que el dato ya estaba disponible vía `order.pipelineCard.salesProject`). */
export interface CustomerReturnRow {
  id:                     number
  return_number:          string
  order_id:               number
  order_number:           string
  customer_name:          string
  project:                string | null
  status:                 CustomerReturnStatus
  has_signed_document:    boolean
  contact_name:           string
  contact_phone:          string
  destination_warehouse:  string | null
  created_at:             string
  received_at:            string | null
  finalized_at:           string | null
  rejected_at:            string | null
  products:               CustomerReturnProduct[]
}

export interface CustomerReturnListResponse {
  data: CustomerReturnRow[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

/** SCRUM-475 (REQ-405) — el backend ya arma el historial cronológico completo (creación/doc.
 * firmado/recepción/nota de crédito/rechazo); el frontend solo lo pinta tal cual, sin recalcular
 * nada a partir de las demás fechas del recurso. */
export interface CustomerReturnHistoryEntry {
  step:                    string
  label:                   string
  at:                      string | null
  by?:                     string | null
  /** Solo presente en el paso "received". */
  destination_warehouse?:  string | null
  /** Solo presente en el paso "rejected". */
  reason?:                 string | null
}

export interface CustomerReturnDetail extends CustomerReturnRow {
  rejection_reason:  string | null
  history:           CustomerReturnHistoryEntry[]
}

/** `GET /bodega/returns/search-orders?q=` (REQ-415) — solo Order en stage
 * por_despachar|despachado|entregado; ya trae Cliente/Proyecto/productos entregados en una sola
 * llamada para autocompletar sin un segundo request. */
export interface ReturnSearchOrderItem {
  order_item_id:      number
  reference:          string | null
  /** Agregado 2026-07-26 (hallazgo de Visual Reviewer: "Ref. fábrica" ausente pese a existir en CatalogProduct). */
  factory_reference:  string | null
  description:        string | null
  qty_delivered:      number
}

export interface ReturnSearchOrderResult {
  order_id:                  number
  order_number:              string
  customer_name:             string
  project:                   string | null
  committed_delivery_date:   string | null
  vendedor:                  string | null
  items:                     ReturnSearchOrderItem[]
}

export interface ReturnSearchOrdersResponse {
  data: ReturnSearchOrderResult[]
}

export interface CreateCustomerReturnLinePayload {
  order_item_id:   number
  qty_requested:   number
  reason:          CustomerReturnReason
  /** Requerido solo cuando `reason === 'otra'` (REQ-418). */
  reason_detail?:  string
}

export interface CreateCustomerReturnPayload {
  order_id:       number
  contact_name:   string
  contact_phone:  string
  items:          CreateCustomerReturnLinePayload[]
}

export interface CreateCustomerReturnResponse {
  id:             number
  return_number:  string
}

export interface ConfirmReturnReceptionLinePayload {
  customer_return_line_id: number
  qty_received:            number
}

/** `POST /bodega/returns/{id}/confirm-reception` — 422 si falta la firma cargada o si la
 * devolución ya está resuelta (RN de SCRUM-483). */
export interface ConfirmReturnReceptionPayload {
  destination_warehouse_id:  number
  lines:                     ConfirmReturnReceptionLinePayload[]
}

/** `POST /bodega/returns/{id}/reject` (REQ-411 RN2) — el rechazo NO requiere el permiso de
 * aprobación de Mark, es exclusivo de Bodega (`bodega.write`), a diferencia de
 * `relocations.reject`/`generalCounts.reject`. */
export interface RejectCustomerReturnPayload {
  rejection_reason: string
}

export interface UploadReturnSignedDocumentResponse {
  id:                            number
  signed_document_uploaded_at:   string
}

/** `GET .../form` y `GET .../delivery-guide` — mismo shape de respuesta que
 * `OrderStatusDocument`/`documentDownloadUrl` (URL presignada de 15 min), mismo criterio de
 * "GET con efecto lateral consumido como mutation" ya usado en el resto de Bodega. */
export interface ReturnDocumentUrlResponse {
  url: string
}

// ── SCRUM-490→495 (REQ-420→425, "Reportes de Bodega") ──────────────────────────────────────────
// Mismas claves 'month'/'quarter'/'year' que `ventasDiseno`'s `ReportPeriod` (ver
// `types/ventasDiseno.ts`) — el selector de período (SCRUM-490, RN1: aplica a los 4 reportes a la
// vez) vive como contexto compartido en `ReportPeriodContext.tsx`, consumido por las 4 tarjetas.

export type BodegaReportPeriodKey = 'month' | 'quarter' | 'year'

export interface BodegaReportPeriod {
  key:  BodegaReportPeriodKey
  from: string
  to:   string
}

/** REQ-421 — `GET /bodega/reports/productivity`. `has_data=false` (Escenario 2) — ningún
 * asistente gestionó ningún pedido en el período — antes que un ranking vacío sin explicación. */
export interface BodegaProductivityRow {
  assistant_id:    number
  assistant_name:  string
  orders_count:    number
  percent_of_top:  number
}
export interface BodegaProductivityReport {
  period:   BodegaReportPeriod
  has_data: boolean
  data:     BodegaProductivityRow[]
}

/** REQ-422 — `GET /bodega/reports/adjustment-accuracy`. RN1: aprobadas+rechazadas+pendientes ==
 * total. RN2: `motivos` agrupa el campo `motivo` REAL de cada solicitud, nunca una lista fija. */
export interface BodegaAdjustmentMotiveRow {
  motivo: string
  count:  number
}
export interface BodegaAdjustmentAccuracyReport {
  period:      BodegaReportPeriod
  total:       number
  aprobadas:   number
  rechazadas:  number
  pendientes:  number
  motivos:     BodegaAdjustmentMotiveRow[]
}

/** REQ-423 — `GET /bodega/reports/warehouse-capacity`. Snapshot del inventario actual (no
 * filtra por período, ver docblock de `BodegaReportsService` en el backend).
 * `concentration_alert` es `null` cuando ninguna bodega concentra >= el umbral configurable
 * (`BodegaSettings.capacidad_concentracion_pct`). */
export interface BodegaWarehouseCapacityRow {
  warehouse_id:      number
  name:              string
  products_count:    number
  units_count:       number
  percent_of_total:  number
}
export interface BodegaConcentrationAlert {
  warehouse_id:        number
  warehouse_name:      string
  percent:             number
  threshold_pct:       number
  suggested_targets:   string[]
}
export interface BodegaWarehouseCapacityReport {
  period:               BodegaReportPeriod
  warehouses:           BodegaWarehouseCapacityRow[]
  total_units:          number
  concentration_alert:  BodegaConcentrationAlert | null
}

/** REQ-424 — `GET /bodega/reports/inventory-summary`. RN1: reusa el MISMO cálculo de "Ver
 * Inventario" (`BodegaInventoryKpiService::kpis()`) — estos 3 números deben coincidir exacto con
 * los KPIs de esa pantalla para el mismo momento (AC del ticket). */
export interface BodegaInventorySummaryReport {
  period:            BodegaReportPeriod
  total_products:    number
  in_attention:      number
  committed_units:   number
}

/**
 * SCRUM-171 RN2 (Gerencia → panel "Agenda de Bodega — hoy", botón "Ver detalle") —
 * `GET /bodega/rutas-dia`. A diferencia de `agendas.bodega` de Gerencia (mismo shape,
 * `GerenciaHomeResponse`), este endpoint devuelve TODAS las entregas/recolecciones de
 * hoy, no solo las primeras 5 del panel resumen — mismo patrón que Servicios
 * (`HomeService::rutasDia()` + `?view=agenda` en InternalTechniciansPage.tsx).
 * Contrato confirmado en Senior Review contra `BodegaHomeService::rutasDia()` (backend).
 */
export interface BodegaRutaDiaItem {
  id:                 number
  order_number:       string
  stage:              string
  customer:           string
  customer_contact:   string | null
  project:            string | null
  address:            string | null
  repartidor:         string | null
}

export interface BodegaRutasDiaResponse {
  data: BodegaRutaDiaItem[]
}
