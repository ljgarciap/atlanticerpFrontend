// SCRUM-183→196 (REQ-120→133) — Compras: Proveedores + Nueva Orden, sprint2.
// Espeja los contratos de atlanticerp-backend/app/Modules/Compras.

export interface PaginationMeta {
  total:        number
  per_page:     number
  current_page: number
  last_page:    number
}

export type ProviderOrigin = 'local' | 'internacional'

// REQ-126 (mockup 2G__Compras_Proveedores.html) — 5 valores fijos, no texto libre. Realineado
// 2026-07-30 (SCRUM-189, hallazgo de Daniela Amaya) — `origin` se deriva de esto server-side,
// ya no es un campo propio del form.
export type ProviderCategory = 'locales' | 'zona_libre' | 'china' | 'europa' | 'online'

export interface Provider {
  id:               number
  name:             string
  category:         ProviderCategory | null
  // REQ-141 (sprint2): decide el salto de tránsito/aduana en el ciclo de estados de sus órdenes.
  // Solo lectura — se deriva de `category` en el backend (Provider::deriveOrigin()).
  origin:           ProviderOrigin
  currency:         string
  is_active:        boolean
  // SCRUM-186 (2026-08-06): columna "Contacto" de la tabla principal.
  contact_name:     string | null
  // REQ-124/REQ-123: null = "Sin calificar" / "Sin compras registradas aún" — nunca 0/fecha inventada.
  rating:           number | null
  last_purchase_at: string | null
}

export interface ProviderDetail extends Provider {
  whatsapp:             string | null
  phone:                string | null
  email:                string | null
  address:              string | null
  country:              string | null
  bank_name:            string | null
  bank_account_number:  string | null
  bank_swift:           string | null
  bank_beneficiary:     string | null
}

export interface ProviderListResponse {
  fuzzy: boolean
  kpis: {
    total_providers:   number
    average_rating:    number | null
    low_rating_count:  number
    active_categories: number
    categories:        string[]
  }
  data: Provider[]
  meta: PaginationMeta
}

export interface ProviderPayload {
  name:                  string
  category?:             ProviderCategory | null
  currency?:             string | null
  is_active?:            boolean
  contact_name?:         string | null
  whatsapp?:             string | null
  phone?:                string | null
  email?:                string | null
  address?:              string | null
  country?:              string | null
  bank_name?:            string | null
  bank_account_number?:  string | null
  bank_swift?:           string | null
  bank_beneficiary?:     string | null
}

export type ShippingType = 'aereo' | 'maritimo' | 'terrestre'
// SCRUM-197 (REQ-134, 2026-07-30) — el mockup solo contempla Cliente/Illuminations, "proveedor"
// no existía en el requerimiento.
export type WhoPaysShipping = 'illuminations' | 'cliente'
export type Modality = 'directo' | 'zona_libre'

/** REQ-117/141 — las 7 etapas, en el orden que sigue un proveedor internacional. */
export const ORDER_STATUSES = [
  'por_aprobar', 'pendiente_liquidar', 'ordenado', 'en_transito', 'en_aduana',
  'en_transito_local', 'recibido',
] as const

export interface PurchaseOrderSummary {
  id:                        number
  provider_id:               number
  provider_name:             string | null
  // REQ-154 (SCRUM-217) — determina la secuencia del timeline (5 pasos vs. 3, ver
  // ShipmentTimeline.tsx): 'local' salta "En tránsito"/"En aduana".
  provider_origin:            ProviderOrigin | null
  // REQ-153 — "responsable" mostrado en la tarjeta de Logística.
  created_by_name:            string | null
  // REQ-274 RN3 (Servicios) — 'servicios' cuando la orden nació de una solicitud de Insumos de
  // Servicios (InsumoService::requestPurchase()); null para el resto (creadas a mano en Compras o
  // desde Ventas & Diseño). Pre-QA 2026-08-13: el backend ya guardaba este dato, faltaba
  // exponerlo — sin esto Yirena no tiene forma de diferenciar el origen (RN3 explícita).
  origin_module:               'servicios' | null
  status:                    string
  next_status:               string | null
  is_critical:                boolean
  modality:                   Modality
  // REQ-154 (SCRUM-217) — 1 fecha por etapa ya alcanzada (PurchaseOrder::STAGE_DATE_COLUMNS en
  // backend), para el timeline visual de Logística. null en cualquiera de las 4 para una orden
  // creada antes de este fix, o (en_transito_at/en_aduana_at) para cualquier orden de proveedor
  // local — esas 2 etapas no existen en su secuencia.
  ordenado_at:                string | null
  en_transito_at:              string | null
  en_aduana_at:                string | null
  en_transito_local_at:        string | null
  // REQ-153 RN3/RN4 (SCRUM-216) — etapa terminal del timeline; se auto-llena SOLO al completar
  // "Recibido" (advance()), nunca editable a mano — ver ShippingInfoPayload más abajo.
  actual_arrival_date:        string | null
  // REQ-140 (SCRUM-203) — "Tipo de envío"/"Costo de envío" de la tabla principal de Ver Órdenes;
  // ya existían en el modelo (capturados en Nueva Orden/Logística), faltaba exponerlos en el
  // listado (antes solo en PurchaseOrderDetail).
  shipping_type:               ShippingType | null
  shipping_cost:                number | null
  estimated_arrival_date:      string | null
  requires_mark_approval:      boolean
  blocked_by_mark_approval:    boolean
  approved_by:                number | null
  // SCRUM-206 — nombre real de quien aprobó, para no mostrar un texto fijo tipo "Aprobada por Mark".
  approved_by_name:            string | null
  total_amount:                number
  currency:                    string
  // REQ-140/146 (SCRUM-203/209) — resumen de proyecto(s) asignado(s) entre las líneas de la
  // orden. sales_project_summary solo viene con nombre cuando hay exactamente 1 proyecto
  // distinto; null si ninguna línea tiene proyecto O si hay 2+ (usar has_multiple_projects/
  // sales_project_count para ese caso, "Ver detalle" muestra el desglose por línea).
  sales_project_summary:       string | null
  has_multiple_projects:       boolean
  sales_project_count:         number
  created_at:                  string
  status_changed_at:           string
  // SCRUM-250→253 (REQ-187→190) — Pagos a Proveedores.
  payment_status:              'pendiente' | 'parcial' | 'completo'
  paid_amount:                 number
  payment_requested_at:        string | null
  // REQ-140 (SCRUM-203) — "Fecha de pago" de la tabla principal: fecha del pago más reciente ya
  // registrado (null si la orden todavía no tiene ningún pago) — no es un campo propio de la
  // orden, se deriva de purchase_order_payments en el backend (ver formatSummary()).
  last_payment_date:            string | null
  // REQ-140/145/158 (SCRUM-203/208/221) — "Recepción" consolidada de la orden, mismo cálculo
  // consumido por Ver Órdenes y Logística (PurchaseOrder::receptionSummary() en backend).
  reception_status:            ReceptionStatus
  // REQ-157 (SCRUM-220) — enlace "Ingreso de mercancía" en Logística.
  shows_goods_receipt_link:    boolean
  pending_remainder_status:    string | null
  // SCRUM-208 (rediseño 2026-08-15, docs/architecture/scrum208-recepcion-parcial-rediseno.md) —
  // próxima etapa del REMANENTE, análogo a `next_status` para la orden completa. Lo calcula el
  // backend (respeta provider_origin igual que `statusSequence()`, no duplicar esa lógica acá).
  // Opcional a propósito: el endpoint `advance-remainder` todavía no existe en el backend — el
  // botón de abajo cae a una etiqueta genérica mientras este campo no venga poblado.
  next_remainder_status?:      RemainderStatus | null
}

export type ReceptionStatus = 'pendiente' | 'parcial' | 'completo'

export interface PurchaseOrderLineDetail {
  id:                       number
  catalog_product_id:      number | null
  reference:                string | null
  factory_reference:        string | null
  description:              string | null
  quantity:                 number
  unit_cost:                number
  subtotal:                 number
  additional_cost_percent:  number | null
  // SCRUM-194 (REQ-131) — toggle $ monto / % del costo del mockup.
  additional_cost_amount:   number | null
  additional_cost_type:     'monto' | 'porcentaje' | null
  sales_project_id:         number | null
  sales_project_name:       string | null
  // REQ-145 (SCRUM-208) — Recepción por línea.
  received_quantity:        number
  reception_status:         ReceptionStatus
}

export interface PurchaseOrderDetail extends PurchaseOrderSummary {
  // shipping_type/shipping_cost ya vienen de PurchaseOrderSummary (REQ-140/SCRUM-203).
  who_pays_shipping:   WhoPaysShipping | null
  // SCRUM-210 (REQ-147, alcance reducido) — solo relevante para órdenes Zona Libre.
  liquidation_agency_id:   number | null
  liquidation_agency_name: string | null
  // actual_arrival_date ya viene de PurchaseOrderSummary (REQ-154) — no repetirlo acá.
  container_number:    string | null
  carrier:              string | null
  approved_at:         string | null
  // SCRUM-250→253 (REQ-187→190)
  pending_amount_change:       number | null
  amount_change_requested_by:  number | null
  notes:                string | null
  lines:                PurchaseOrderLineDetail[]
}

/** SCRUM-257→261 (REQ-194→198) — Garantías y Reclamos. */
export interface PurchaseOrderClaimSummary {
  id:                 number
  code:               string
  purchase_order_id:  number
  provider_name:      string | null
  provider_id:        number | null
  product:            string | null
  expected_resolution: string | null
  status:             'en_revision' | 'resuelto'
  status_changed_at:  string
  needs_attention:    boolean
  total_amount:       number
  created_at:         string
  // REQ-198, alcance reducido — siempre null hasta que exista el vínculo real con Servicios.
  service_ticket:     string | null
}

export type ClaimChip = 'todos' | 'atencion' | 'reportado' | 'en_revision' | 'resuelto'

export interface ClaimListParams {
  chip?:                 ClaimChip
  provider_id?:          number
  expected_resolution?:  string
  search?:                string
  page?:                 number
  per_page?:             number | 'all'
}

// SCRUM-257 (hallazgo de Daniela Amaya 2026-08-09) — 4 KPIs nuevos, reemplazan el "summary"
// anterior (Total/En revisión/Resuelto/Atención): Atención sigue existiendo como bandera por
// fila (needs_attention) y como chip de filtro, ya no como KPI aparte.
export interface PurchaseOrderClaimListResponse {
  data:    PurchaseOrderClaimSummary[]
  // SCRUM-754 (2026-08-18) — mismo shape que PaginationMeta (components/ui/Pagination.tsx).
  meta:    { total: number; per_page: number; current_page: number; last_page: number }
  kpis: {
    total:                  number
    reportados_en_revision: number
    resueltos_este_mes:     number
    disputed_amount:        number
  }
  filters: {
    providers: { id: number; name: string }[]
  }
}

export interface PurchaseOrderClaimLineDetail {
  id:                       number
  purchase_order_line_id:   number
  description:              string | null
  affected_quantity:        number
  unit_cost:                number | null
  subtotal:                 number
}

export interface PurchaseOrderClaimPhoto {
  id:         number
  url:        string
  created_at: string
}

export interface PurchaseOrderClaimStatusChange {
  from_status: 'en_revision' | 'resuelto' | null
  to_status:   'en_revision' | 'resuelto'
  changed_by:  string | null
  changed_at:  string
}

export interface PurchaseOrderClaimDetail extends PurchaseOrderClaimSummary {
  description:          string | null
  expected_resolution:  string | null
  resolved_at:          string | null
  // REQ-198, alcance reducido — siempre [].
  service_tickets:      unknown[]
  status_history:       PurchaseOrderClaimStatusChange[]
  lines:                PurchaseOrderClaimLineDetail[]
  photos:               PurchaseOrderClaimPhoto[]
}

export interface PurchaseOrderClaimPayload {
  purchase_order_id:    number
  description?:         string | null
  expected_resolution?: string | null
  lines: {
    purchase_order_line_id: number
    affected_quantity:      number
    description?:           string | null
  }[]
}

/**
 * SCRUM-245→249 (REQ-182→186) — Sustitutos. SCRUM-247 (Oleada 2, REQ-184) agrega
 * sales_project_id/sales_project_name — antes solo se llenaban vía REQ-185/186.
 */
export interface ReplacementRequest {
  id:                    number
  original_product_id:   number
  original_product_name: string | null
  proposed_product_id:   number | null
  proposed_product_name: string | null
  sales_project_id:      number | null
  sales_project_name:    string | null
  margin_percent:        number | null
  status:                'pendiente' | 'pendiente_gerencia' | 'aprobada' | 'rechazada'
  requested_by_name:     string | null
  generated_order_id:    number | null
  created_at:            string
}

// SCRUM-754 (2026-08-18) — mismo shape que PaginationMeta (components/ui/Pagination.tsx).
export interface ReplacementRequestListResponse {
  data: ReplacementRequest[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

/** SCRUM-247 (REQ-184) — payload de "Generar solicitud" desde la tabla de resultados (REQ-183). */
export interface CreateReplacementRequestPayload {
  original_catalog_product_id: number
  proposed_catalog_product_id: number
  sales_project_id:            number
}

/**
 * SCRUM-245 (REQ-182/183, ADR-SCRUM245) — resultado de comparación visual: datos reales de
 * Inventario (stock/precio) unidos al ranking devuelto por la IA — nunca solo el % de similitud
 * sin contexto de negocio.
 */
export interface SubstituteSearchResult {
  catalog_product_id: number
  reference:            string
  name:                  string
  description:           string
  photo_url:              string | null
  price_full:              number
  cost:                    number | null
  stock_quantity:          number | null
  similarity_percent:      number
  reasoning:                string
  // SCRUM-246 (rebote de Daniela Amaya 2026-08-09) — Categoría, columna nueva en la tabla de
  // resultados de Sustitutos (mismo campo que ComprasCatalogProduct.category). Confirmado en
  // Lote 4 (2026-08-17): `ReplacementSearchController::show()` ya lo expone.
  category?:                CatalogProductCategory | null
}

export interface SubstituteSearchPoll {
  id:      string | null
  status:  'pending' | 'running' | 'completed' | 'failed' | null
  error:   string | null
  results: SubstituteSearchResult[] | null
}

/** SCRUM-253 (REQ-190) */
export interface PurchaseOrderPayment {
  id:                  number
  amount:              number
  proof_url:           string
  registered_by:       number | null
  registered_by_name:  string | null
  created_at:          string
}

export interface PurchaseOrderListResponse {
  data: PurchaseOrderSummary[]
  meta: PaginationMeta
  // SCRUM-201/250 — responsables/proveedores reales para los filtros, independiente de los
  // filtros ya aplicados. `providers`/`payment_kpis` opcionales a nivel de tipo (el backend
  // real SIEMPRE los manda) solo para no forzar a todos los fixtures de test de las otras
  // pantallas que comparten este mismo endpoint (Ver Órdenes, Logística) a rellenarlos.
  filters: { creators: { id: number; name: string }[]; providers?: { id: number; name: string }[] }
  // SCRUM-250 (hallazgo de Daniela Amaya) — solo viene con `payment_pending=1`; null en el resto
  // de pantallas que comparten este mismo endpoint (Ver Órdenes, Logística).
  payment_kpis?: PaymentKpis | null
}

// SCRUM-250 — 5 KPIs de "Pagos a Proveedores", calculados sobre el universo completo (no la
// página visible ni el chip de estado de pago activo).
export interface PaymentKpis {
  total_pending_balance: number
  sin_enviar:              number
  por_pagar:                number
  parcial:                  number
  completo:                 number
}

// SCRUM-194 (REQ-131, mockup 2H__Compras_NuevaOrden.html) — 8 valores fijos de Categoría de
// producto, distinto de `ProviderCategory` (proveedores) y de `catalog_product_families`
// (combos que se cotizan juntos, REQ-037 — concepto no relacionado).
export type CatalogProductCategory =
  | 'candelabros_colgantes' | 'iluminacion_techo' | 'apliques_pared' | 'iluminacion_bano'
  | 'iluminacion_exterior' | 'lamparas_piso_mesa' | 'iluminacion_empotrada' | 'bombillos'

export type CatalogProductRotation = 'alta' | 'media' | 'baja' | 'unica'

export interface NewCatalogProductPayload {
  reference:          string
  factory_reference?: string | null
  name:                string
  description:        string
  brand?:              string | null
  price_full:          number
  cost:                number
  reorder_point?:      number | null
  category?:           CatalogProductCategory | null
  rotation?:           CatalogProductRotation | null
}

export interface PurchaseOrderLinePayload {
  catalog_product_id?:      number | null
  new_product?:              NewCatalogProductPayload | null
  quantity:                  number
  // REQ-130 Escenario 2 (SCRUM-193) — costo precargado del catálogo pero editable por línea.
  unit_cost?:                number | null
  additional_cost_percent?:  number | null
  // SCRUM-194 (REQ-131) — toggle $ monto / % del costo del mockup.
  additional_cost_amount?:   number | null
  additional_cost_type?:     'monto' | 'porcentaje' | null
  sales_project_id?:         number | null
}

export interface PurchaseOrderPayload {
  provider_id:              number
  shipping_type?:           ShippingType | null
  who_pays_shipping?:       WhoPaysShipping | null
  shipping_cost?:            number | null
  modality?:                 Modality | null
  estimated_arrival_date?:   string | null
  notes?:                    string | null
  lines:                     PurchaseOrderLinePayload[]
}

/**
 * REQ-130 — producto del Catálogo tal como lo expone el buscador de Compras (CON costo, a
 * diferencia de CatalogProductRef de Ventas & Diseño — ver docblock de
 * CatalogProductSearchController en el backend).
 */
export interface ComprasCatalogProduct {
  id:                  number
  reference:            string
  factory_reference:    string | null
  name:                  string
  description:          string
  brand:                string | null
  photo_url:            string | null
  price_full:            number
  cost:                  number | null
  stock_quantity:        number | null
  reorder_point:          number | null
  // SCRUM-246 (rebote de Daniela Amaya 2026-08-09) — Categoría, columna nueva en la tabla de
  // resultados de Sustitutos. Confirmado en Lote 4 (2026-08-17): `CatalogProductSearchController::
  // format()` ya lo expone.
  category?:              CatalogProductCategory | null
  // Lote 4 (SCRUM-246, 2026-08-17) — solo presente cuando la búsqueda se hizo con
  // `original_catalog_product_id` (método "Buscar en catálogo" de Comparación de Referencias);
  // en el resto de los consumidores de este endpoint (Nueva Orden) siempre viene `null`.
  similarity_percent?:   number | null
}

/** REQ-133 — buscador de Pedidos Aprobados. */
export interface ApprovedProject {
  sales_project_id: number
  folio:              string | null
  project_name:        string
  client_name:          string | null
}

export interface ComprasSettings {
  low_rating_threshold: number
  // SCRUM-206 — quién es "Mark" para el gate de aprobación (REQ-143), configurable.
  mark_approver_user_id: number | null
  // SCRUM-257 (REQ-194) — días "En revisión" antes de marcar un reclamo con la bandera de atención.
  claim_attention_days: number
  // SCRUM-247 (REQ-184) — margen del sustituto propuesto por debajo del cual la solicitud escala a Mark.
  replacement_margin_threshold: number
  // Lote 4 (SCRUM-246) — pesos de la fórmula de "% de similitud" de "Buscar en catálogo"
  // (deben sumar 100) y umbral mínimo para mostrar un candidato. Existían en el backend desde
  // 2026-08-17 sin ningún campo acá — gap real encontrado por Luis (superadmin, 2026-08-22).
  similarity_weight_text: number
  similarity_weight_price: number
  similarity_weight_margin: number
  similarity_other_category_penalty: number
  similarity_min_threshold: number
}

/**
 * SCRUM-210 (REQ-147, alcance reducido) — agencia de liquidación Zona Libre.
 * SCRUM-254 (REQ-191) — `pending_payment_amount`/`paid_amount`/`last_payment_date`/
 * `next_payment_date` son carga MANUAL de Compras (mock sin RN aprobada, ver nota de alcance en
 * LiquidationAgencyController::class) — no un historial de pagos con comprobante.
 */
export interface LiquidationAgency {
  id:                      number
  name:                    string
  contact_name:            string | null
  phone:                   string | null
  email:                   string | null
  notes:                   string | null
  pending_payment_amount:  number
  paid_amount:             number
  last_payment_date:       string | null
  next_payment_date:       string | null
}

export interface LiquidationAgencyPayload {
  name:           string
  contact_name?:  string | null
  phone?:         string | null
  email?:         string | null
  notes?:         string | null
}

/** SCRUM-254 (REQ-191) — carga manual de "situación de pago" (ver docblock en LiquidationAgency). */
export interface LiquidationAgencyPaymentPayload {
  pending_payment_amount: number
  paid_amount:            number
  last_payment_date:      string | null
  next_payment_date:      string | null
}

/** SCRUM-254 (REQ-191) — fila de la tabla resumen, incl. situación de pago (mock, ver LiquidationAgency). */
export interface LiquidationAgencySummaryRow {
  id:                      number
  name:                    string
  liquidated_count:        number
  pending_count:           number
  pending_payment_amount:  number
  paid_amount:             number
  last_payment_date:       string | null
  next_payment_date:       string | null
}

/** SCRUM-254 (REQ-191) — KPIs agregados del panel de Pagos Operativos. */
export interface LiquidationAgencySummaryKpis {
  agencies_with_pending_balance: number
  total_pending_amount:          number
  total_paid_amount:             number
  projects_pending_liquidation:  number
}

// SCRUM-754 (2026-08-18) — mismo shape que PaginationMeta (components/ui/Pagination.tsx).
export interface LiquidationAgencySummaryResponse {
  data: LiquidationAgencySummaryRow[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
  kpis: LiquidationAgencySummaryKpis
}

/** SCRUM-255 (REQ-192) */
export interface LiquidationAgencyContact {
  id:     number
  name:   string
  phone:  string | null
  email:  string | null
}

export interface LiquidationAgencyContactPayload {
  name:   string
  phone?: string | null
  email?: string | null
}

/** SCRUM-256 (REQ-193) — orden asociada a una agencia, con su estado de liquidación derivado. */
export interface LiquidationAgencyOrderRow {
  id:                 number
  provider_name:      string | null
  status:             string
  total_amount:       number
  currency:           string
  liquidation_status: 'liquidada' | 'por_liquidar'
}

export interface LiquidationAgencyDetail extends LiquidationAgency {
  contacts:         LiquidationAgencyContact[]
  purchase_orders:  LiquidationAgencyOrderRow[]
}

/**
 * REQ-156 — editable sin importar el estado de la orden (a diferencia de PurchaseOrderPayload).
 * `actual_arrival_date` ("Llegada real") YA NO forma parte de este payload (REQ-153 RN3/RN4,
 * corrección 2026-08-05) — se auto-llena solo desde `advance()` al alcanzar "Recibido", nunca
 * editable a mano.
 */
export interface ShippingInfoPayload {
  container_number?:    string | null
  carrier?:              string | null
}

export type DocumentCategory =
  | 'factura_comercial' | 'declaracion_nacionalizacion' | 'permiso_importacion' | 'bl'
  | 'confirmacion_proveedor' | 'otro'

/** REQ-155 — checklist de documentos del envío. */
export interface PurchaseOrderDocument {
  id:                  number
  category:            DocumentCategory
  original_filename:   string
  url:                  string
  created_at:           string
}

/** SCRUM-211 (ADR-SCRUM211) — validación con IA del documento de confirmación de proveedor. */
export interface ProviderConfirmationDiscrepancy {
  campo:      'producto' | 'cantidad' | 'costo_unitario' | 'costo_total'
  esperado:   string
  encontrado: string
}

export interface ProviderConfirmationResult {
  matches_order: boolean
  discrepancies: ProviderConfirmationDiscrepancy[]
  confidence:    'alta' | 'media' | 'baja'
}

export interface ProviderConfirmationValidation {
  id:     string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | null
  result: ProviderConfirmationResult | null
  error:  string | null
}

// ── SCRUM-231→244 (REQ-168→181) — Inventario ────────────────────────────────

// SCRUM-240 — 'unica' ("Compra única") agregado: el backend (CatalogProduct::ROTATIONS) siempre
// tuvo las 4 opciones, pero este tipo compartido solo tenía 3 (los chips de filtro de la tabla de
// Inventario no la usan, pero el formulario de creación/edición de producto sí debe poder elegirla).
export type InventoryRotation = 'alta' | 'media' | 'baja' | 'unica'
export type InventoryEstado = 'disponible' | 'bajo_stock' | 'sin_stock'
// 'bajo_stock'/'sin_stock' no son botones visibles del filtro (no estan en el mockup) -- solo se
// aceptan como deep-link desde Inicio de Compras (REQ-112, "Bajo stock"/"Sin stock").
// 'bajo_stock_sin_ordenar' — SCRUM-168 RN2 (Gerencia, "Salud · Compras"), deep-link-only, mismo
// criterio: reusa InventoryKpiService::isLowStockWithoutOpenOrder() vía InventoryController.
export type InventoryChip = 'todos' | 'en_atencion' | 'inactivos' | 'por_ingresar' | 'bajo_stock' | 'sin_stock' | 'bajo_stock_sin_ordenar'

export interface InventoryWarehouseRow {
  warehouse_id:   number
  warehouse_name: string | null
  quantity:       number
}

/** Campos comunes a ambos modos (restringido y completo). */
interface InventoryProductBase {
  id:              number
  reference:       string
  // SCRUM-237/240 (rebote de Daniela Amaya 2026-08-12) — columna nueva, separada de
  // `description`: antes `description` hacía doble función de "nombre visible" y "descripción",
  // así que editar la Descripción cambiaba el nombre del producto en toda la app. Opcional en el
  // tipo mientras el backend del batch no esté desplegado — usar `productDisplayName()`
  // (src/lib/catalogProduct.ts) en vez de leer `name`/`description` directo.
  // TODO: backend batch4 — confirmar en Senior Review que siempre viene poblado.
  name?:           string
  description:     string
  brand:           string | null
  photo_url:       string | null
  // SCRUM-234/238 (hallazgo de Daniela Amaya 2026-08-09) — Categoría, Rotación, Stock mínimo y
  // Bodega(s) pasan a ser visibles en AMBOS modos (antes solo en modo Compras completo).
  category:        string | null
  rotation:        InventoryRotation | null
  reorder_point:   number | null
  warehouses:      InventoryWarehouseRow[]
  price_full:      number
  stock_quantity:  number | null
  por_servir:      number
  disponible:      number
  estado:          InventoryEstado
  is_active:       boolean
  has_technical_sheet?:         boolean
  technical_sheet_filename?:    string | null
  technical_sheet_uploaded_at?: string | null
}

/**
 * SCRUM-425/426 (REQ-355/356) — ficha técnica: 12 campos de texto libre, mismo set del mockup
 * del cliente (`3B__Bodega_Inventario.html#modal-ficha-tecnica`) tal cual, aprobado por Luis
 * pese a la nota de "pendientes de validar" del mockup. Solo de lectura para Bodega (RN1
 * SCRUM-425); obligatorios los 12 al crear un producto nuevo (SCRUM-426).
 */
export interface TechnicalSpec {
  voltage:             string
  power:               string
  socket_type:         string
  color_temperature:   string
  luminous_flux:       string
  dimensions:          string
  weight:              string
  material_finish:     string
  ip_rating:           string
  estimated_lifespan:  string
  warranty:            string
  certifications:      string
}

/**
 * Solo presentes en modo completo (Compras/Gerencia) — nunca llegan en modo restringido.
 * REQ-172 PERMISOS ("Ver: todos en Compras y Gerencia") — a diferencia del resto de
 * InventoryProductBase, por_ingresar/en_camino tampoco llegan a Ventas & Diseño restringido.
 */
export interface InventoryProduct extends InventoryProductBase {
  por_ingresar?:       number
  en_camino?:          number
  factory_reference?: string | null
  barcode?:            string | null
  cost?:               number | null
  import_cost?:        number
  freight_cost?:       number
  handling_cost?:      number
  other_cost?:         number
  cost_total?:         number
  margin_percent?:     number | null
  provider_id?:        number | null
  provider_name?:      string | null
  family_id?:           number | null
  family_name?:         string | null
  // SCRUM-425 — solo viene en el detalle (GET /compras/inventory/{id}); productos creados antes
  // de esta feature responden `null`, nunca 12 campos vacíos.
  technical_spec?:      TechnicalSpec | null
  /** Rebote REQ-427 (Daniela Amaya 2026-08-13) — estado de "Confirmar llegada física" de Bodega
   * para este producto. Solo viene en el detalle (`show()`), igual que `technical_spec` arriba;
   * `undefined`/`null` en el listado (`index()`) — nunca se pide ahí para no pagar 1 query extra
   * por fila. */
  bodega_confirmation?: {
    awaiting_compras:   boolean
    confirmed_quantity: number
    confirmed_by_name:  string | null
  } | null
}

export interface InventoryKpis {
  total_products: number
  low_stock:      number
  out_of_stock:   number
  in_attention:   number
  total_value:    number
}

export interface InventoryListResponse {
  fuzzy:      boolean
  restricted: boolean
  // SCRUM-773 — señal distinta de `restricted`: `restricted` enmascara costo/margen,
  // `can_manage` gatea si se muestran acciones de escritura (Proveedores, +Crear nuevo producto,
  // +Nueva orden de compra, Generar orden). compras.limited.view (Líder de Operaciones) trae
  // restricted=false (ve costos) pero can_manage siempre false (no puede escribir).
  can_manage: boolean
  kpis:       InventoryKpis
  data:       InventoryProduct[]
  meta:       PaginationMeta
}

/**
 * SCRUM-243 (REQ-180) — detalle de familia en Inventario, CON costo/valor total en modo Compras.
 * Endpoint propio (no el de VentasDiseno Catálogo, que nunca expone `cost` a propósito).
 */
export interface InventoryFamilyDetail {
  id:             number
  name:           string
  description:    string | null
  restricted:     boolean
  // SCRUM-773 — ver InventoryListResponse.can_manage.
  can_manage:     boolean
  total_value:    number | null
  product_count:  number
  // Lote 4 (SCRUM-243, 2026-08-17) — antes un shape mínimo propio (`InventoryFamilyProductRow`,
  // eliminado); el mockup pide la misma tabla completa de 21 columnas que "Productos"
  // (`InventoryProduct`, ya usado por `ProductsTab`) al expandir una familia, no un resumen aparte.
  products:       InventoryProduct[]
}

/** SCRUM-764 — item de la lista de familias para el tab "Familias" y el desplegable "Familia" de
 * Inventario (`GET /compras/families`, mismo `resolveAccess()` que el detalle: compras.read
 * completo o ventas_diseno.read restringido). Mismo bug que ya se había corregido en Bodega
 * (`BodegaInventoryFamilyListItem`, Pre-QA 2026-07-23): el tab de Compras seguía apuntando a
 * `ventasDisenoApi.catalogProductFamilies.list()` (`ventas_diseno.read`), permiso que ningún rol
 * real de Compras tiene — 403 en silencio para `lider_compras`, confirmado en vivo en
 * test.atlanticerp.ai. */
export interface InventoryFamilyListItem {
  id:            number
  name:          string
  description:   string | null
  product_count: number
  // Lote 4 (SCRUM-243, 2026-08-17) — antes solo viajaba en el detalle; el mockup nuevo lo pide en
  // cada card colapsada del listado. `null` en modo restringido (Ventas & Diseño).
  total_value:   number | null
}

// SCRUM-754 (2026-08-18) — mismo shape que PaginationMeta (components/ui/Pagination.tsx).
export interface InventoryFamilyListResponse {
  restricted: boolean
  // SCRUM-773 — ver InventoryListResponse.can_manage.
  can_manage: boolean
  data:       InventoryFamilyListItem[]
  meta:       { total: number; per_page: number; current_page: number; last_page: number }
}

export interface InventoryProductPayload {
  reference:          string
  factory_reference?: string | null
  // SCRUM-237/240 — ver nota en InventoryProductBase.name. Opcional a nivel de tipo (transición
  // del batch); CreateProductModal/ProductDetailModal ya lo mandan siempre poblado.
  name?:               string
  description:        string
  brand?:              string | null
  photo_url?:           string | null
  price_full:          number
  cost:                 number
  import_cost?:         number
  freight_cost?:        number
  handling_cost?:       number
  other_cost?:          number
  reorder_point?:       number | null
  provider_id?:          number | null
  rotation?:             InventoryRotation | null
  // SCRUM-240 (corrección de Daniela Amaya, 2026-08-12) — "Stock inicial (opcional)" reemplaza
  // stock_quantity/warehouse_id (una sola bodega) por una entrada opcional POR bodega. Los 2
  // campos viejos se mantienen para no romper otros consumidores del tipo, pero
  // CreateProductModal ya no los usa.
  stock_quantity?:       number
  warehouse_id?:         number | null
  initial_stock?:        { warehouse_id: number; quantity: number }[]
  family_id?:            number | null
  category?:             string | null
  barcode?:              string | null
  // SCRUM-426 (REQ-356) — ya NO obligatorio al crear desde este modal (ver docblock de
  // StoreInventoryProductRequest, backend) — la ficha técnica estructurada de 12 campos se
  // reemplazó por el documento/link de SCRUM-237 (`uploadTechnicalSheet`, llamada aparte tras
  // crear el producto). El campo se mantiene opcional en el tipo por si algún otro flujo lo
  // sigue enviando (ninguno hoy).
  technical_spec?:        TechnicalSpec
}

export interface Warehouse {
  id:   number
  name: string
}

export interface WarehouseStockRow {
  warehouse_id:   number
  warehouse_name: string | null
  quantity:       number
}

export interface OrderPrefill {
  provider_id:          number | null
  catalog_product_id:   number
  suggested_quantity:   number
  has_pending_shipment: boolean
  pending_quantity:     number
}

// SCRUM-236 (REQ-173) — botón "Ingresar a Inventario", detalle del producto.
export interface ConfirmPendingResponse {
  confirmed_lines: number[]
  confirmed_units: number
}

// SCRUM-237 (REQ-174, hallazgo de Daniela Amaya) — "Ficha técnica" como documento (archivo o
// link externo), distinto de `TechnicalSpec` (12 campos estructurados, SCRUM-425/426).
export interface InventoryTechnicalSheetResponse {
  id:                            number
  has_technical_sheet:          boolean
  technical_sheet_filename:     string | null
  technical_sheet_uploaded_at:  string | null
}

// SCRUM-262→268 (REQ-199→205) — Reportes avanzados. REQ-202 fuera de este batch.
export type ReportGranularity = 'month' | 'quarter' | 'year'

export interface ReportPeriodInfo {
  granularity: ReportGranularity
  label:       string
  start:       string
  end:         string
  is_current:  boolean
}

export interface PurchasedByPeriodBucket {
  label:        string
  start:        string
  end:          string
  total_amount: number
  is_current:   boolean
}

export interface PurchasedByPeriodResponse {
  granularity: ReportGranularity
  buckets:     PurchasedByPeriodBucket[]
}

export interface ProviderRatingRow {
  provider_id:       number
  provider_name:     string
  purchased_amount:  number
  claims_count:      number
  rating:            number | null
  // SCRUM-264 — mismos componentes que arman `rating` (REQ-124: 40% + 35% + 25%).
  // complete_percent siempre null hasta que exista Ingreso de Mercancía.
  on_time_percent:   number | null
  complete_percent:  number | null
}

export interface ProviderRatingResponse {
  period: ReportPeriodInfo
  data:   ProviderRatingRow[]
}

export interface ClaimsReportProviderRow {
  provider_id:   number
  provider_name: string | null
  claims_count:  number
}

export interface ClaimsReportResponse {
  period:           ReportPeriodInfo
  open_count:       number
  resolved_count:   number
  claim_rate:       number | null
  provider_ranking: ClaimsReportProviderRow[]
}

export interface LiquidationImportsAgencyRow {
  agency_id:        number
  agency_name:      string | null
  liquidated_count: number
}

export interface PurchaseOpportunityResponse {
  period:             ReportPeriodInfo
  classified_orders:  number
  a_tiempo_percent:   number | null
  a_demanda_percent:  number | null
  tarde_percent:      number | null
  show_warning:       boolean
}

// SCRUM-268 (corrección de Daniela Amaya, 2026-08-11) — `total_imports` desaparece (el panel ya
// no muestra un indicador de "Importaciones" total); `por_liquidar_count` es nuevo. Ver docblock
// de `ComprasReportsController::liquidationImports()` para el universo (excluye órdenes que no
// llegaron a "Ordenado") y la ambigüedad documentada sobre la definición exacta de "Liquidado".
export interface LiquidationImportsResponse {
  period:              ReportPeriodInfo
  liquidated_count:    number
  por_liquidar_count:  number
  liquidated_percent:  number | null
  agency_ranking:      LiquidationImportsAgencyRow[]
}

// ── SCRUM-220→230 (REQ-157/159/162→167) — Ingreso de Mercancía ────────────────

// `ordenado` agregado 2026-08-07 (Pre-QA, SCRUM-208 — hallazgo real del rebote de Daniela Amaya):
// las etapas del remanente deben cubrir "desde ordenado en adelante", ver nota en
// atlanticerp-backend PurchaseOrder::REMAINDER_STATUSES.
export const REMAINDER_STATUSES = ['ordenado', 'salio_de_origen', 'en_transito', 'en_aduana', 'en_transito_local'] as const
export type RemainderStatus = typeof REMAINDER_STATUSES[number]

/** REQ-162 — buscador de órdenes elegibles (excluye "Recibido"). */
export interface GoodsReceiptEligibleOrder {
  id:            number
  provider_name: string | null
  status:        string
}

export interface GoodsReceiptExpectedProduct {
  catalog_product_id: number
  reference:           string | null
  description:         string | null
  unit_cost:            number
  expected_quantity:    number
  // Lo que ya se recibió antes (confirmado o no) para esta orden/producto, sumando ingresos previos.
  remaining:            number
}

/** REQ-162 — orden vinculada, con sus productos esperados ya precargados. */
export interface GoodsReceiptOrderProducts {
  id:               number
  provider_id:      number
  provider_name:    string | null
  provider_origin:  ProviderOrigin
  status:           string
  products:         GoodsReceiptExpectedProduct[]
}

// SCRUM-754 (2026-08-18) — mismo shape que PaginationMeta (components/ui/Pagination.tsx).
export interface GoodsReceiptListResponse {
  data: GoodsReceiptSummary[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

/** REQ-159 — fila del listado "Ver registros de ingreso". */
export interface GoodsReceiptSummary {
  id:                 number
  purchase_order_id:  number
  provider_name:       string | null
  order_status:        string
  lines_count:         number
  total_units:         number
  // false si la orden ya llegó a "Recibido" — REQ-159/167.
  editable:             boolean
  created_at:           string
}

export interface GoodsReceiptLine {
  id:                  number
  catalog_product_id:  number
  reference:            string | null
  description:          string | null
  quantity:             number
  unit_cost:            number
  itbms_amount:         number | null
  import_cost_share:    number | null
  freight_cost_share:   number | null
  handling_cost_share:  number | null
  other_cost_share:     number | null
  cost_total:           number
  warehouse_id:         number
  warehouse_name:       string | null
  is_pending:           boolean
}

export interface GoodsReceiptDetail extends GoodsReceiptSummary {
  invoice_storage_key:        string | null
  invoice_original_filename:  string | null
  import_cost_total:          number | null
  freight_total:               number | null
  handling_total:              number | null
  other_costs_total:           number | null
  lines:                        GoodsReceiptLine[]
}

export interface GoodsReceiptLinePayload {
  catalog_product_id: number
  quantity:            number
  unit_cost:            number
  warehouse_id:         number
}

export interface GoodsReceiptPayload {
  purchase_order_id?:  number
  lines:                GoodsReceiptLinePayload[]
  import_cost_total?:   number
  freight_total?:        number
  handling_total?:       number
  other_costs_total?:    number
  invoice_storage_key?:  string | null
  invoice_original_filename?: string | null
  pending_remainder_status?:  RemainderStatus
}

/** SCRUM-224 (REQ-161, ADR-SCRUM224) — resultado de la detección automática de factura. */
export interface GoodsReceiptInvoiceMatchLine {
  catalog_product_id: number
  quantity:             number | null
  unit_cost:             number | null
}

export interface GoodsReceiptInvoiceMatchResult {
  matched_order_id:          number | null
  matched_provider_id:        number | null
  lines:                       GoodsReceiptInvoiceMatchLine[]
  unmatched_count:             number
  confidence:                  'alta' | 'media' | 'baja' | null
  detected_order_reference:    string | null
  detected_provider_name:      string | null
  // Presente solo cuando la misma factura ya se había procesado antes y su orden ya no es
  // elegible (llegó a "Recibido") — ver punto 4 de ADR-SCRUM224.
  already_processed?:          boolean
}

export interface GoodsReceiptInvoiceMatchPoll {
  id:      string | null
  status:  'pending' | 'running' | 'completed' | 'failed' | null
  error:   string | null
  result:  GoodsReceiptInvoiceMatchResult | null
}

/** REQ-165 — cuando alguna línea no cubre lo esperado, el backend devuelve esto en vez de guardar. */
export interface GoodsReceiptPartialInfo {
  requires_pending_status: true
  partial: {
    catalog_product_id: number
    received:            number
    expected:            number
    missing:              number
  }[]
}

// ── SCRUM-175→182 (REQ-111→118) — Inicio de Compras ──────────────────────────

export interface ComprasHomePendiente {
  type:       'orden_sin_aprobar' | 'llegada_vencida'
  priority:   'alta' | 'media'
  order_id:   number
  provider:   string | null
  amount:     number
  days:       number
  suggestion: string
}

export interface ComprasHomeOrdenCritica {
  order_id: number
  motivo:   string | null
  provider: string | null
  amount:   number
}

export interface ComprasHomeEstadoStage {
  stage:  string
  count:  number
  amount: number
}

export interface ComprasHomeReorderItem {
  catalog_product_id: number
  reference:           string
  description:         string
  stock_quantity:      number | null
  disponible:          number
  reorder_point:       number | null
  provider_id:         number | null
  provider_name:       string | null
  suggested_quantity:  number
  unit_cost:           number
}

export interface ComprasHomeSummary {
  resumen_mes: {
    comprado_mes:               number
    entregado_a_tiempo_percent: number | null
    productos_retrasados:       number
    bajo_stock:                  number
    sin_stock:                   number
  }
  pendientes:          ComprasHomePendiente[]
  ordenes_criticas:    ComprasHomeOrdenCritica[]
  estado_compras:      ComprasHomeEstadoStage[]
  por_reordenar:       ComprasHomeReorderItem[]
  // REQ-113, desbloqueado 2026-07-21 — reuniones de hoy vía Outlook (OutlookCalendarService)
  events_today_count:  number
}
