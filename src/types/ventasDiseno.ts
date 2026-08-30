import type { CatalogProductCategory } from '@/types/compras'

export type PipelineStage = 'lead' | 'design' | 'quote' | 'proposal' | 'approved' | 'lost'

export interface PipelineCardSalesProject {
  id:   number
  name: string
  tag:  string | null
}

export interface PipelineCardClientRef {
  id:   number
  name: string
}

export interface PipelineCardSubClientRef {
  id:            number
  business_name: string
}

export interface PipelineCardOwner {
  id:   number
  name: string
}

export interface PipelineCard {
  id:                number
  stage:             PipelineStage
  sales_project:     PipelineCardSalesProject
  master_client:     PipelineCardClientRef | null
  sub_client:        PipelineCardSubClientRef | null
  owner:             PipelineCardOwner
  amount:            number | null
  worked_area_m2:    number | null
  days_in_stage:     number
  is_stagnant:       boolean
  stage_changed_at:  string
}

// SCRUM-690/691/693 (REQ-610/611/613, Batch D) — pantalla "Lista de Proyectos". Fila propia
// (no PipelineCard): agrega days_in_stage/next_delivery_date/files_count ya resueltos por el
// backend (ProjectsListService::formatRow), sin sub_client/is_stagnant/stage_changed_at que
// esa pantalla no usa.
export interface ProjectListRow {
  id:                  number
  stage:               PipelineStage
  sales_project:       PipelineCardSalesProject
  master_client:       PipelineCardClientRef | null
  owner:               PipelineCardOwner
  amount:              number | null
  worked_area_m2:      number | null
  days_in_stage:       number
  next_delivery_date:  string | null
  files_count:         number
}

export interface ProjectListResult {
  data:          ProjectListRow[]
  // Mismo shape que PaginationMeta (src/components/ui/Pagination.tsx) — no reimportado acá
  // para no crear una dependencia circular de tipos entre components/ui y types/.
  meta:              { total: number; per_page: number; current_page: number; last_page: number }
  // RN6 (REQ-611): total dentro del mismo scope Mías/Equipo, ignorando search/stage/tag/owner_id
  // — distinto de meta.total (que sí respeta esos filtros). No confundir los dos números.
  total_unfiltered:  number
  can_view_team: boolean
  filters:       { owners: PipelineCardOwner[] }
}

export type ContactRole = 'client' | 'architect' | 'other'

export interface PipelineCardContact {
  id:    number
  name:  string
  role:  ContactRole
  phone: string | null
  email: string | null
}

export type PipelineFileType = 'design' | 'proposal' | 'signed_quote' | 'approval_proof' | 'photo'

export interface PipelineCardFile {
  id:          number
  type:        PipelineFileType
  file_name:   string
  size_bytes:  number
  /** SCRUM-767 — para decidir preview inline (PDF/imagen) vs. descarga directa, sin adivinar por extensión. */
  mime_type:   string
  created_at:  string
}

/** SCRUM-767 — respuesta de `GET /pipeline/{cardId}/files/{fileId}/url` (URL presignada de 15 min). */
export interface PipelineCardFileUrl {
  url:        string
  filename:   string
  mime_type:  string
}

export interface PipelineCardDetail extends PipelineCard {
  delivery_type:          'single' | 'partial' | null
  observations:          string | null
  delivery_dates:        string[]
  contacts:               PipelineCardContact[]
  has_architect_contact: boolean
  can_edit:               boolean
  files:                  PipelineCardFile[]
  // SCRUM-734 — id de la cotización confirmada más reciente del proyecto, o null
  // si nunca hubo ninguna. Gate + destino de "Ver cotizaciones de este proyecto".
  latest_quote_id:       number | null
}

// Grupo 1d — REQ-019/020: creación manual desde Pipeline.
export interface PipelineCardCreatePayload {
  type:           'lead' | 'design'
  name:           string
  tag?:           string | null
  observations?:  string | null
  sub_client_id?: number | null
}

export interface PipelineCardUpdatePayload {
  name?:              string
  tag?:               string | null
  master_client_id?:  number | null
  sub_client_id?:     number | null
  worked_area_m2?:    number | null
  delivery_type?:     'single' | 'partial' | null
  delivery_dates?:    string[]
  observations?:      string | null
}

export interface MasterClientRef {
  id:                  number
  name:                string
  default_price_type?: string | null
}

export interface SubClientRef {
  id:              number
  business_name:   string
  tax_id?:         string
  category?:       string | null
  // REQ-020 (Grupo 1d): advertir antes de crear un proyecto en Diseño vinculado a un
  // Subcliente sin contactos.
  contacts_count?: number
}

// Mismos 6 colores que crm STAGES (src/types/project.ts) — reuso deliberado del
// esquema de color ya establecido en la app en vez de introducir uno nuevo (ver
// regla de color en memory/project_backlog_ventas_diseno_req.md: el mock del
// cliente es solo referencia funcional, no visual).
export const PIPELINE_STAGES: { id: PipelineStage; color: string }[] = [
  { id: 'lead',     color: '#eab308' },
  { id: 'design',   color: '#3b82f6' },
  { id: 'quote',    color: '#a855f7' },
  { id: 'proposal', color: '#f97316' },
  { id: 'approved', color: '#16a34a' },
  { id: 'lost',     color: '#64748b' },
]

// ── Grupo 2 — pantalla Clientes (REQ-063 a REQ-070) ──────────────────────────

export type SubClientCategory = 'a_walkin' | 'b_architect_designer' | 'c_bidding' | 'd_referred'

export type PriceType = 'public' | 'project' | 'special' | 'partner' | 'premium'

export interface ClientListRow {
  id:                  number
  name:                string
  default_price_type:  PriceType | null
  categories:           SubClientCategory[]
  active_projects:      number
  lost_projects:        number
  total_projects:       number
  total_amount:         number
  closed_amount:        number
  last_contact_days:    number | null
}

// SCRUM-754 (2026-08-18) — paginación real de backend, un Cliente Master por fila.
export interface ClientListResult {
  data: ClientListRow[]
  // Mismo shape que PaginationMeta (src/components/ui/Pagination.tsx) — no reimportado acá
  // para no crear una dependencia circular de tipos entre components/ui y types/ (mismo
  // criterio que ProjectListResult, ver arriba).
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

export interface SubClientContact {
  id:    number
  name:  string
  role:  ContactRole
  phone: string | null
  email: string | null
}

export interface SubClientDetail {
  id:                number
  master_client_id:  number
  business_name:     string
  tax_id:            string
  delivery_address:  string | null
  category:          SubClientCategory | null
  contacts:           SubClientContact[]
}

export interface ClientDetail {
  id:                  number
  name:                string
  default_price_type:  PriceType | null
  sub_clients:          SubClientDetail[]
}

export interface ClientProjectRow {
  id:          number
  sub_client:  { id: number; business_name: string } | null
  project:     { id: number; name: string }
  stage:       PipelineStage
  amount:      number | null
}

export interface CreateClientPayload {
  name:                string
  default_price_type?: PriceType | null
  business_name:       string
  tax_id:              string
  delivery_address?:   string | null
  category?:           SubClientCategory | null
  contacts:            { name: string; role: ContactRole; phone?: string | null; email?: string | null }[]
}

export interface CreateSubClientPayload {
  business_name:      string
  tax_id:             string
  delivery_address?:  string | null
  category?:          SubClientCategory | null
  contacts:           { name: string; role: ContactRole; phone?: string | null; email?: string | null }[]
}

// ── Grupo 3 — pantalla Inicio (REQ-056 a REQ-062) ────────────────────────────
// REQ-057 (Mi desempeño/comisiones) es un shell de UI puro, sin datos de backend
// (depende de Cotización, fuera de alcance — decisión de Luis 2026-07-13).

export interface Vendor {
  id:   number
  name: string
}

export type PendienteType = 'no_contact' | 'missing_architect'
export type PendientePriority = 'high' | 'medium'

export interface Pendiente {
  type:       PendienteType
  priority:   PendientePriority
  card_id:    number
  client:     string | null
  project:    string
  assignee:   string
  days:       number
  suggestion: string
}

export interface FinalStageItem {
  id:            number
  project_name:  string
  client_name:   string | null
  notes:         string | null
  days_in_stage: number
  amount:        number | null
}

export interface HomePerformance {
  goal_amount:       number | null
  current_amount:    number
  progress_percent:  number | null
  commission_amount: number
}

export interface HomeSummary {
  final_stage:        FinalStageItem[]
  pendientes:          Pendiente[]
  events_today_count: number
  performance:         HomePerformance
}

// SCRUM-796 (secc. 3/4) — cada alerta trae `card_id` navegable, no solo el nombre para
// mostrar: sin esto "Ver más"/selección de un ítem no puede llevar al Pipeline con la
// tarjeta filtrada/identificada, que es justamente lo que pide el ticket.
export interface DashboardAlertItem {
  card_id:      number
  project_name: string
  client_name?: string | null
  days:         number
}

// SCRUM-684→689 (REQ-604→609, Batch C) — Dashboard CRM, exclusivo de Gerencia.
export interface DashboardAlert {
  count: number
  items: DashboardAlertItem[]
}

// SCRUM-796 (secc. 4, corrección) — ya NO colapsa por cliente: viene 1 fila por tarjeta
// estancada (un mismo cliente puede tener más de una), el frontend las agrupa visualmente
// por `client_name` cuando corresponde.
export interface DashboardColdClientsAlert {
  count: number
  items: DashboardAlertItem[]
}

export interface DashboardAlerts {
  overdue_proposals: DashboardAlert | null
  cold_clients:      DashboardColdClientsAlert | null
}

export type DashboardStageCounts = Record<PipelineStage, number>

export interface DashboardTotals {
  active_pipeline: number
  closed_won:      number
}

export interface DashboardByTag {
  tagged:         Record<'design' | 'quote' | 'both', number>
  untagged_count: number
}

export interface DashboardSummary {
  alerts:       DashboardAlerts
  stage_counts: DashboardStageCounts
  totals:       DashboardTotals
  by_tag:       DashboardByTag
}

// El endpoint puede responder solo `message` (200) cuando todos los responsables de las
// propuestas vencidas ya recibieron su recordatorio hoy — ver hallazgo de Pre-QA 2026-07-31
// en DashboardController::remind() (idempotencia diaria por owner, antes duplicaba el email).
export interface DashboardRemindResult {
  notified?: { owner_id: number; owner_name: string; projects_count: number }[]
  message?: string
  already_sent_today?: number[]
}

export interface CalendarEventOwner {
  id:   number
  name: string
}

export interface CalendarEvent {
  id:          number
  owner:       CalendarEventOwner
  title:       string
  description: string | null
  start_at:    string
  end_at:      string | null
  all_day:     boolean
}

// CalendarEvent/CalendarEventPayload (abajo) quedan solo por los endpoints legacy
// /calendar-events, sin uso desde el frontend — ver OutlookCalendarEvent en
// @/types/calendar para la fuente de datos real de la tarjeta "Mi calendario" (SCRUM-66/177).
export interface CalendarEventPayload {
  owner_id?:    number | null
  title:        string
  description?: string | null
  start_at:     string
  end_at?:      string | null
  all_day?:     boolean
}

// ── Cotización-A (REQ-024 a 032) ─────────────────────────────────────────────
// El resto del ciclo de vida (partidas/precios, totales, condiciones, folio,
// vista previa, borrador) llega en Cotización-B/C/D — ver
// memory/project_backlog_ventas_diseno_req.md.

export interface Architect {
  id:     number
  name:   string
  phone:  string | null
  email:  string | null
}

export interface SalesProjectRef {
  id:   number
  name: string
  tag:  string | null
}

export type QuoteStatus = 'draft' | 'sent' | 'approved'

export interface QuoteContactRef {
  pivot_id: number
  id:       number
  name:     string
  role:     ContactRole
  phone:    string | null
  email:    string | null
}

// Cotización-B (REQ-033/034/035/038/040/041/042). Sin Catálogo real todavía (REQ-036/
// 037/039 diferidos): todo ítem es personalizado, pero las fórmulas de tipo de precio
// (REQ-033) sí se aplican sobre `unit_price`/`cost` tecleados a mano — ver
// memory/project_backlog_ventas_diseno_req.md.
export type QuotePriceType = 'public' | 'project' | 'special' | 'partner' | 'premium'
export type QuoteItemPriceTypeOverride = 'public' | 'project' | 'special' | 'premium'
export type QuoteDiscountMode = 'line' | 'global'

export interface QuoteItemRef {
  id:                   number
  catalog_product_id:   number | null
  is_custom:            boolean
  reference:            string
  description:          string
  quantity:             number
  unit_price:           number
  cost:                 number | null
  price_type_override:  QuoteItemPriceTypeOverride | null
  discount_percent:     number | null
  effective_unit_price: number
  line_total:           number
  // REQ-039 — null = sin control de stock para este producto (no dispara alerta),
  // número = stock real contra el que se compara `quantity` para mostrar el mensaje.
  stock_quantity:       number | null
  // SCRUM-725 — true si este ítem, con el precio/descuento/tipo de precio
  // resultantes, cae por debajo del margen mínimo (nunca se expone el % real).
  below_min_margin:     boolean
}

// REQ-036 (2026-07-12): ficha técnica del buscador de Catálogo — a propósito
// nunca incluye `cost` (información de margen interna, se resuelve
// server-side recién al seleccionar el producto — ver QuoteItemPayload).
export interface CatalogProductRef {
  id:                 number
  reference:          string
  factory_reference:  string | null
  description:        string
  brand:              string | null
  photo_url:          string | null
  price_full:         number
  stock_quantity:     number | null
}

// REQ-037 (2026-07-13): tab "Familias" del buscador de Catálogo.
export interface CatalogProductFamilyRef {
  id:              number
  name:            string
  description:     string | null
  products_count:  number
}

export interface CatalogProductFamilyDetail {
  id:          number
  name:        string
  description: string | null
  products:    CatalogProductRef[]
}

export interface QuoteItemBulkResult {
  created:                      QuoteItemRef[]
  skipped_catalog_product_ids: number[]
}

// SCRUM-734 (RN9.1) — validación de margen en vivo para el modal de precio, sin
// persistir nada (a propósito nunca trae `cost`, ver QuoteItemController::previewPrice()).
export interface QuoteItemPricePreview {
  violates_margin:    boolean
  can_override:        boolean
  message:             string | null
  min_margin_percent: number
}

// SCRUM-695→701 (REQ-615→622, Batch E del Epic CRM SCRUM-332) — pantalla "Catálogo": vista
// comercial transversal (Pipeline/Clientes), distinta de CatalogProductRef de arriba (ese es el
// buscador REQ-036 dentro de Cotización). A propósito nunca incluye cost/import_cost/freight_cost/
// handling_cost/other_cost/cost_total/margin_percent/por_servir/por_ingresar/estado/rotation/
// provider_* — ver docblock de CatalogService (backend) para el detalle del criterio.
export interface CatalogItem {
  id:                             number
  reference:                      string
  factory_reference:              string | null
  name:                           string
  description:                    string
  brand:                          string | null
  photo_url:                      string | null
  price_full:                     number
  category:                       CatalogProductCategory | null
  family_id:                      number | null
  family_name:                    string | null
  disponible:                     number
  en_camino:                      number
  has_technical_sheet:            boolean
  technical_sheet_filename:       string | null
  technical_sheet_uploaded_at:    string | null
}

export interface CatalogListResult {
  data:       CatalogItem[]
  // SCRUM-754 (2026-08-18) — mismo shape que PaginationMeta (components/ui/Pagination.tsx).
  meta:       { total: number; per_page: number; current_page: number; last_page: number }
  categories: { value: CatalogProductCategory; count: number }[]
  families:   { id: number; name: string }[]
}

export interface CatalogTechnicalSheetUploadResult {
  id:                          number
  has_technical_sheet:        boolean
  technical_sheet_filename:   string | null
  technical_sheet_uploaded_at: string | null
}

export interface QuotePartRef {
  id:       number
  name:     string
  position: number
  subtotal: number
  items:    QuoteItemRef[]
}

export type QuoteDiscountTotalsType = 'percent' | 'amount'

// REQ-083: Estado del documento — deriva de folio + etapa de la tarjeta de
// Pipeline vinculada (ver Quote::documentStatus() en el backend). Supersede el
// campo `status` de abajo (heredado de Cotización-A, sin uso real).
export type QuoteDocumentStatus = 'draft' | 'sent' | 'approved'

export interface QuoteDetail {
  id:                        number
  status:                    QuoteStatus
  // Cotización-D (REQ-048/051): folio/generated_at quedan null mientras la
  // cotización siga siendo un borrador sin generar — ese es el gate que habilita
  // las pestañas de Vista Previa/Externa en el frontend.
  folio:                     string | null
  generated_at:               string | null
  // SCRUM-723 — generate() solo asigna folio/valida; confirm() es lo que registra
  // oficialmente la cotización (Pipeline/Cotizaciones/Reportes/Dashboard).
  confirmed_at:                string | null
  pipeline_card_id:           number | null
  document_status:            QuoteDocumentStatus
  master_client:             PipelineCardClientRef | null
  sub_client:                PipelineCardSubClientRef | null
  sales_project:             SalesProjectRef | null
  ruc:                       string | null
  description:               string | null
  owner:                     PipelineCardOwner
  architect:                 Architect | null
  delivery_type:             'single' | 'partial' | 'tbd' | null
  delivery_dates:            string[]
  contacts:                  QuoteContactRef[]
  price_type:                QuotePriceType
  discount_mode:              QuoteDiscountMode
  global_discount_percent:   number
  // SCRUM-725 — margen a nivel de Totales (no por producto, ver
  // QuoteItemRef.below_min_margin) + si el usuario actual puede guardar/confirmar
  // igual pese a la violación (Mark/David, ventas_diseno.override_min_margin).
  global_below_min_margin:   boolean
  can_override_min_margin:   boolean
  min_margin_percent:        number
  parts:                     QuotePartRef[]
  subtotal:                  number
  observations:               string | null
  includes_installation:      boolean
  discount_totals_type:       QuoteDiscountTotalsType
  discount_totals_value:      number
  discount_totals_amount:     number
  net_total:                   number
  itbms:                       number
  grand_total:                 number
  conditions_text:             string | null
  observations_preview:        string
  can_edit:                  boolean
  created_at:                string
}

export interface QuoteValidationResult {
  valid:   boolean
  missing: string[]
}

// SCRUM-734 — historial de versiones (cotizaciones confirmadas) del proyecto al
// que pertenece una cotización, más la etapa actual de la tarjeta vinculada
// (determina si "Usar como base para nueva versión" debe mostrarse: solo con
// card_stage === 'quote').
export interface QuoteVersionRow {
  id:           number
  version:      number
  folio:        string | null
  confirmed_at: string | null
  generated_by: string
  grand_total:  number
}

export interface QuoteVersionsResult {
  card_stage: PipelineStage | null
  versions:   QuoteVersionRow[]
}

// SCRUM-725 — shape del 422 de POST /quotes/:id/confirm cuando hay violaciones de
// margen y el usuario tiene ventas_diseno.override_min_margin: el frontend debe
// mostrar el modal de advertencia en vez de un error genérico.
export interface QuoteMarginWarning {
  margin_warning:          true
  below_min_margin_items: number[]
  global_below_minimum:    boolean
  min_margin_percent:      number
}

export interface QuotePayload {
  master_client_id?:          number | null
  sub_client_id?:              number | null
  sales_project_id?:           number | null
  ruc?:                        string | null
  description?:                string | null
  architect_id?:               number | null
  delivery_type?:              'single' | 'partial' | 'tbd' | null
  delivery_dates?:             string[]
  price_type?:                 QuotePriceType
  discount_mode?:               QuoteDiscountMode
  global_discount_percent?:     number
  observations?:                string | null
  includes_installation?:       boolean
  discount_totals_type?:        QuoteDiscountTotalsType
  discount_totals_value?:       number
  conditions_text?:             string | null
}

// REQ-050: precarga opcional al crear — solo se usa en ventasDisenoApi.quotes.create().
export interface QuoteCreatePayload extends QuotePayload {
  from_pipeline_card_id?: number | null
  from_sub_client_id?:    number | null
}

// ── Grupo 4 — pantalla Reportes (REQ-071 a 079) ──────────────────────────────

export type ReportPeriod = 'month' | 'quarter' | 'year'

export interface ReportsBestClient {
  client_name: string
  client_id:   number
  client_type: 'master' | 'sub'
  amount:      number
}

export interface ReportsMetaMonth {
  month:  string
  amount: number
}

export interface ReportsMeta {
  monthly_history: ReportsMetaMonth[]
  goal_amount:     number | null
}

export interface ReportsTopVendor {
  user_id:              number
  user_name:            string
  total_current_month:  number
  low_sales_alert:      boolean
}

export interface ReportsForecastStage {
  stage:                 'quote' | 'proposal'
  projects:              number
  open_amount:            number
  probability_percent:    number
  weighted_amount:        number
}

export interface ReportsForecast {
  closed:                        number
  best_case:                     number
  weighted_pipeline:              number
  committed:                     number
  meta_amount:                   number | null
  remaining:                     number | null
  meta_reached:                  boolean | null
  pct_closed:                    number | null
  pct_projected:                 number | null
  pipeline_covers_gap:           boolean | null
  quote_probability_percent:     number
  proposal_probability_percent:  number
  stage_breakdown:               ReportsForecastStage[]
}

export interface ReportsSummary {
  scope:        'own' | 'team'
  period:       ReportPeriod
  surface_m2:   number
  best_clients: ReportsBestClient[]
  meta:         ReportsMeta
  top_vendors?: ReportsTopVendor[]
  forecast?:    ReportsForecast
}

// Reportes-D (REQ-073) — panel Comisiones.
export interface CommissionCohortRow {
  id:                  number | null
  owner_id:            number
  owner_name:          string
  month:               string
  total_amount:        number
  commission_percent:  number
  commission_amount:   number
  paid_at:             string | null
}

export interface CommissionsSummary {
  paid:        number
  pending:     number
  final_stage: number
  cohorts:     CommissionCohortRow[]
}

// Reportes-B (REQ-072/075/076/SCRUM-146) — sección "Configuración".
export interface SalesGoalRow {
  user_id:           number
  user_name:         string
  goal_amount:       number | null
  goal_plus_amount:  number | null
}

export interface SalesGoalPayload {
  goal_amount:       number
  goal_plus_amount?: number | null
}

export interface ReportSettingsValue {
  low_sales_threshold:          number
  low_sales_months:             number
  quote_probability_percent:    number
  proposal_probability_percent: number
}

// REQ-033 (2026-07-12): porcentajes/divisores de las fórmulas de Tipo de
// Precio, configurables sin deploy — ver PricingSettingsPanel.tsx.
export interface PricingSettingsValue {
  project_discount_percent:            number
  special_additional_discount_percent: number
  partner_divisor:                     number
  premium_divisor:                     number
  // REQ-040/045 (SCRUM-132/137): margen mínimo por debajo del cual el backend
  // revierte cualquier cambio de precio/descuento/tipo de precio.
  min_margin_percent:                  number
}

// SCRUM-138 — texto global de Condiciones (REQ-046), aplicado a toda cotización nueva.
// Ver ConditionsSettingsPanel.tsx.
export interface QuoteConditionsSettingsValue {
  text: string
}

export interface QuotePartPayload {
  name: string
}

// REQ-036: con `catalog_product_id`, reference/description/unit_price/cost se
// resuelven server-side desde el producto real — no hace falta (ni sirve)
// mandarlos. Sin catalog_product_id, son requeridos (ítem personalizado).
export interface QuoteItemPayload {
  catalog_product_id?:    number | null
  reference?:             string
  description?:           string
  quantity:               number
  unit_price?:            number
  // SCRUM-725 — único canal para pisar el precio de un ítem de CATÁLOGO dentro de
  // esta cotización (nunca toca el precio maestro); `unit_price` de arriba sigue
  // siendo solo para ítems personalizados, se ignora si hay catalog_product_id.
  unit_price_override?:   number | null
  cost?:                  number | null
  price_type_override?:   QuoteItemPriceTypeOverride | null
  discount_percent?:      number | null
}

// ── Grupo 5 — pantalla Cotizaciones (listado, REQ-079 a 085) ─────────────────

export interface QuoteListRow {
  id:               number
  folio:            string | null
  master_client:    PipelineCardClientRef | null
  sub_client:       PipelineCardSubClientRef | null
  sales_project:    SalesProjectRef | null
  amount:           number
  stage:            PipelineStage | null
  price_type:       QuotePriceType
  owner:            PipelineCardOwner
  quote_date:       string
  document_status:  QuoteDocumentStatus
}

export interface QuoteListSummary {
  pending_amount:   number
  approved_amount:  number
  approved_count:   number
  lost_amount:      number
  lost_count:       number
  conversion_rate:  number
}

export interface QuoteListResult {
  summary: QuoteListSummary
  fuzzy:   boolean
  data:    QuoteListRow[]
  // SCRUM-754 (2026-08-18) — mismo shape que PaginationMeta (components/ui/Pagination.tsx).
  meta:    { total: number; per_page: number; current_page: number; last_page: number }
}

// ── REQ-053 — Historial y auditoría de cambios ────────────────────────────────

export type AuditAction = 'created' | 'updated' | 'deleted'

export interface AuditLogEntry {
  id:          number
  action:      string
  entity_type: string | null
  entity_id:   string | null
  old_values:  Record<string, unknown> | null
  new_values:  Record<string, unknown> | null
  user:        { id: number; name: string } | null
  created_at:  string
}

export interface AuditLogResult {
  data:         AuditLogEntry[]
  current_page: number
  last_page:    number
  total:        number
}

// ── SCRUM-703→710 (REQ-623→630, Epic CRM Batch F) — "Pedidos" ────────────────

export type OrderStatus = 'pendiente' | 'igual' | 'bajo' | 'mejoro'

export interface OrderRow {
  id:               number // id de la Quote, usado para el detalle
  folio:            string | null
  master_client:    { id: number; name: string } | null
  sales_project:    { id: number; name: string } | null
  amount:           number
  approved_at:      string
  quoted_margin:    number | null
  invoiced_margin:  number | null
  invoiced_partial: boolean
  estado:           OrderStatus
  owner:            { id: number; name: string }
}

export interface OrderSummary {
  total_orders:         number
  with_margin_variance: number
  avg_quoted_margin:    number | null
  avg_invoiced_margin:  number | null
  fully_invoiced_count: number
}

export interface OrderListResult {
  summary: OrderSummary
  fuzzy:   boolean
  data:    OrderRow[]
  // SCRUM-754 (2026-08-18) — mismo shape que PaginationMeta (components/ui/Pagination.tsx).
  meta:    { total: number; per_page: number; current_page: number; last_page: number }
}

export interface OrderItemDetail {
  reference:        string
  brand:            string | null
  description:      string
  quantity:         number
  unit_price:       number
  quoted_cost:      number | null
  quoted_margin:    number | null
  invoiced_cost:    number | null
  invoiced_margin:  number | null
  margin_diff_pts:  number | null
  pending_purchase: boolean
}

export interface OrderDetail extends OrderRow {
  items:               OrderItemDetail[]
  quoted_cost_total:   number
  invoiced_cost_total: number
  pending_count:       number
  item_count:          number
}

export interface OrdersSettingsValue {
  margin_drop_threshold_pts: number
}
