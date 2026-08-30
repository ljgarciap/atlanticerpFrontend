// Fase 4 — Servicios (Batch 1: SCRUM-279→284, REQ-216→221).
//
// Contrato acordado con Backend Dev (trabajo en paralelo, mismo vocabulario de campos que la
// migración/API real que está construyendo sobre el modelo `tickets`, schema `servicios`) — ver
// docs/architecture/servicios-fase4-diseno.md sección 4. El backend no estaba disponible al
// terminar este batch; estos tipos son el contrato esperado, a reconciliar por
// Arquitecto/PM cuando ambos lados terminen (ver nota en el reporte de esta tarea).

export type TicketType = 'installation' | 'warranty' | 'claim' | 'retrofit'

// Solo installation/warranty tienen subtipo (REQ-279 RN4) — claim/retrofit siempre null.
export type TicketSubtype =
  | 'installation' | 'inspection'                  // tipo = installation
  | 'warranty_generic' | 'replacement_inspection'   // tipo = warranty
  | null

export type TicketInstallationKind = 'internal' | 'subcontracted' | null

export type TicketStatus = 'reported' | 'scheduled' | 'on_site' | 'resolved' | 'closed' | 'cancelled'

export const TICKET_STATUSES: TicketStatus[] = [
  'reported', 'scheduled', 'on_site', 'resolved', 'closed', 'cancelled',
]

export const TICKET_TYPES: TicketType[] = ['installation', 'warranty', 'claim', 'retrofit']

// REQ-219 — valor CRUDO que manda el backend (Ticket::QUOTE_STATUSES en
// app/Modules/Servicios/Models/Ticket.php) — reconciliado 2026-08-02 tras hallazgo de Visual
// Review: el backend nunca manda `locked` ni `null`, `pending` cubre TANTO "bloqueada por informe
// pendiente" COMO "lista para generar" — la distinción depende de `inspection_report_status`, no
// es un valor propio. Usar `deriveQuoteDisplayStatus()` (abajo) antes de pasarle esto a
// `QuoteIndicator`, nunca este tipo directo.
export type QuoteStatus = 'not_applicable' | 'pending' | 'draft' | 'sent' | 'approved' | 'rejected'

// REQ-220 — para tipo=claim el backend puede devolver cualquiera de estos 3 (Hoja de Reclamo,
// batch futuro, usa su propio indicador) — el frontend nunca hardcodea "claim => not_applicable".
export type InspectionReportStatus = 'not_applicable' | 'pending' | 'completed'

// Valor ya RESUELTO para UI — lo que `QuoteIndicator` realmente sabe renderizar. `locked` = 🔒
// (informe todavía no completado); `null` = listo para generar cotización (botón activo). Nunca
// se persiste ni viene del backend — se deriva acá mismo, en el momento de renderizar.
export type QuoteDisplayStatus = 'not_applicable' | 'locked' | 'draft' | 'sent' | 'approved' | 'rejected' | null

/**
 * REQ-219 RN1-RN4 — deriva el estado a mostrar del indicador de Cotización a partir de los 2
 * campos crudos del ticket. `quote_status === 'pending'` es ambiguo por sí solo (ver comentario
 * de `QuoteStatus` arriba): con informe todavía pendiente es "bloqueada" (🔒); con informe
 * completado o no aplica, es "lista para generar" (botón activo, `null`).
 */
export function deriveQuoteDisplayStatus(
  quoteStatus: QuoteStatus,
  inspectionReportStatus: InspectionReportStatus,
): QuoteDisplayStatus {
  if (quoteStatus === 'not_applicable') return 'not_applicable'

  if (quoteStatus === 'pending') {
    const informeListo = inspectionReportStatus === 'completed' || inspectionReportStatus === 'not_applicable'
    return informeListo ? null : 'locked'
  }

  return quoteStatus
}

export interface TicketTechnician {
  id:         number
  first_name: string
  last_name:  string
}

// REQ-247 RN1/RN6, Batch 3 parte 2 — checklist fijo de 18 requerimientos especiales, mismo
// catálogo/orden que `Ticket::REQUIREMENT_LABELS` en el backend (fuente de verdad de las claves,
// extraídas del mockup real `REQ_LABELS` en `5A__Servicios_Tickets.html`) — las etiquetas viven en
// i18n (`tickets.requirements.catalog.*`), acá solo el orden y las claves válidas.
export const REQUIREMENT_KEYS = [
  'casco', 'botas', 'guantes', 'gafas', 'chaleco', 'arnes',
  'escaleraEstandar', 'escaleraAltura', 'andamio', 'plataforma',
  'permisoAltura', 'corteEnergia', 'accesoEdificio', 'estacionamiento',
  'horarioRestringido', 'herramientaEsp', 'dosTecnicos', 'induccionSeguridad',
] as const

export type RequirementKey = typeof REQUIREMENT_KEYS[number]

// Payload que aceptan Store/UpdateTicketRequest — solo claves, sin etiquetas.
export interface RequirementsPayload {
  catalog: string[]
  otros:   string[]
}

// Forma que devuelve TicketService::detail() (y por lo tanto TicketController::store()) — el
// backend ya resuelve la etiqueta de cada clave del catálogo para que el frontend/PDF nunca
// tengan que conocer Ticket::REQUIREMENT_LABELS por su cuenta.
export interface RequirementsDetail {
  catalog: { key: string; label: string }[]
  otros:   string[]
}

export interface MasterClientOption {
  id:   number
  name: string
}

export interface SubClientOption {
  id:            number
  business_name: string
}

export interface ProjectOption {
  id:   number
  name: string
}

// REQ-247 RN3 — resultado del buscador de productos del Catálogo (GET /servicios/lookup/products),
// deliberadamente sin `cost` (esa información de margen no le corresponde a Servicios, se valida
// server-side). `price_full` (Batch 11, REQ-230) — "precio sugerido" para autocompletar el ítem
// Producto de Cotización; "Productos reclamados/afectados" (REQ-247) simplemente lo ignora.
export interface ProductOption {
  id:          number
  reference:   string
  name:        string
  description: string
  brand:       string | null
  price_full:  number
}

// REQ-247 RN5 — al crear, cada línea solo captura la cantidad reclamada.
export interface TicketProductInput {
  catalog_product_id: number
  cantidad_reclamo:   number
}

// Forma real de `detail()['productos']` una vez que existe la relación ticket↔producto.
export interface TicketProductDetail {
  id:                  number
  catalog_product_id:  number | null
  marca:               string | null
  referencia:          string | null
  descripcion:         string | null
  cantidad_reclamada:  number
  cantidad_recibida:   number
  cantidad_pendiente:  number
}

// REQ-245/246/247/249 — payload completo de "Nuevo ticket". `cliente`/`contacto`(nombre)/snapshot
// del cliente NO se manda: el backend lo deriva de `sales_project_id` (RN1 de REQ-246, Servicios
// nunca inventa datos de cliente, solo lee lo que ya eligió el usuario en el buscador).
export interface CreateTicketPayload {
  tipo:                       TicketType
  subtipo:                    TicketSubtype
  tipo_instalacion:           Exclude<TicketInstallationKind, null>
  descripcion:                string
  sales_project_id:           number
  contacto?:                  string | null
  telefono?:                  string | null
  email?:                     string | null
  direccion?:                 string | null
  requerimientos_especiales?: RequirementsPayload | null
  observaciones?:              string | null
  productos?:                 TicketProductInput[]
}

// REQ-248, Batch 4 — foto/video/archivo de referencia. Los adjuntos se suben con un endpoint
// aparte DESPUÉS de crear el ticket (mismo patrón que crm.ProjectDocument: el id del padre debe
// existir primero) — `serviciosApi.tickets.uploadAttachment()`.
export interface TicketAttachment {
  id:              number
  nombre_archivo:  string
  size_bytes:      number
  mime_type:       string
  created_at:      string
}

export interface Ticket {
  id:                        number
  numero:                    string   // autogenerado backend: PREFIJO-AÑO-NNNN
  tipo:                      TicketType
  subtipo:                   TicketSubtype
  tipo_instalacion:          TicketInstallationKind
  cliente:                   string | null   // nullable en StoreTicketRequest (REQ-249)
  descripcion:               string | null
  estado:                    TicketStatus
  internal_technician:       TicketTechnician | null
  quote_status:              QuoteStatus
  quote_amount:              number | null   // solo Tablero (REQ-219) — puede faltar en este batch
  inspection_report_status:  InspectionReportStatus
  scheduled_at:               string | null   // ISO — null = "Sin agendar"
  created_at:                 string          // ISO — "Reportado"
}

export interface TicketFilters {
  search?:      string
  tipo?:        TicketType
  // Nombre de query param en español, sigue el contrato real de TicketController::filtersFromRequest()
  // (routes/servicios.php) — no es una traducción de internal_technician_id.
  tecnico_id?:  number
  estado?:      TicketStatus
}

export interface TechnicianOption {
  id:         number
  first_name: string
  last_name:  string
}

// REQ-218 — respuesta 422 cuando el backend bloquea el cierre por falta de
// cotización/informe. `message` es el texto específico a mostrar (nunca genérico).
export interface TicketCloseBlockedResponse {
  message: string
}

// REQ-222 — 4 tarjetas de estadísticas, RN5: siempre el total del sistema, nunca filtradas.
export interface TicketStats {
  tickets_abiertos:          number
  total_tickets:             number
  cotizaciones_por_generar:  number
  informes_por_generar:      number
  sin_agendar:               number
  // Nunca hardcodear "3 días" en la UI — el umbral es configurable server-side (ver
  // ServiciosSettingsService en el backend), este valor viene siempre del backend.
  sin_agendar_umbral_dias:   number
}

// REQ-224 — modal de detalle. `productos` viene de `ticket_products` desde Batch 3 parte 2;
// `adjuntos` viene de `ticket_attachments` desde Batch 4 (REQ-248) — tickets creados antes de su
// batch respectivo simplemente no tienen filas.
export interface TicketDetail {
  id:                         number
  numero:                     string
  tipo:                       TicketType
  subtipo:                    TicketSubtype
  tipo_instalacion:           TicketInstallationKind
  // RN2 — siempre vienen los 2 valores; si son idénticos (no hay sales_project vinculado, o
  // Master/Subcliente son el mismo), el modal colapsa a un solo campo "Cliente".
  cliente_master:             string | null
  subcliente:                 string | null
  email:                      string | null
  // SCRUM-781 (punto 4.2) — id real del proyecto (`proyecto` abajo es solo el nombre, para
  // mostrar) — usado para filtrar el buscador de productos por proyecto al editar el ticket.
  sales_project_id:           number | null
  proyecto:                   string | null
  contacto:                   string | null
  telefono:                   string | null
  direccion:                  string | null
  scheduled_at:               string | null
  scheduled_ends_at:          string | null
  requerimientos_especiales:  RequirementsDetail
  productos:                  TicketProductDetail[]
  inspection_report_status:   InspectionReportStatus
  quote_status:                QuoteStatus
  observaciones:               string | null
  adjuntos:                    TicketAttachment[]
  estado:                      TicketStatus
  // REQ-227 RN6 — poblado solo cuando estado === 'cancelled'.
  cancellation_reason:         string | null
  internal_technician:         TicketTechnician | null
  // SCRUM-804 — más reciente primero, vacío si nunca se reagendó (el primer agendamiento no
  // genera historial, ver docblock de TicketService::schedule() en backend).
  reschedule_history:          TicketRescheduleHistoryEntry[]
  created_at:                  string
}

// REQ-225 RN2 — únicos 4 campos editables desde el detalle del ticket. `requerimientos_especiales`
// usa desde Batch 3 parte 2 el mismo formato estructurado que la creación (antes era texto libre).
export interface UpdateTicketPayload {
  tipo:                        TicketType
  subtipo:                     TicketSubtype
  tipo_instalacion:            TicketInstallationKind
  requerimientos_especiales:   RequirementsPayload | null
}

// RN5 — el backend avisa si el cambio de tipo desasignó al técnico por especialidad inválida.
export interface UpdateTicketResponse extends TicketDetail {
  technician_unassigned: boolean
}

// REQ-226 RN3/RN6 — fecha+hora combinadas en un único ISO por el frontend (selectores reales,
// nunca texto libre); ambas obligatorias. `motivo_reagendamiento` (SCRUM-804) — obligatorio solo
// al reagendar (el ticket ya tenía fecha), el backend es quien decide si aplica.
export interface ScheduleTicketPayload {
  internal_technician_id:  number
  scheduled_at:             string
  scheduled_ends_at?:       string | null
  motivo_reagendamiento?:   string
}

// SCRUM-804 — una fila del historial de reagendamientos de un ticket.
export interface TicketRescheduleHistoryEntry {
  id:                         number
  previous_scheduled_at:      string
  previous_scheduled_ends_at: string | null
  new_scheduled_at:           string
  new_scheduled_ends_at:      string | null
  motivo:                     string
  rescheduled_by:             { id: number; first_name: string; last_name: string } | null
  created_at:                 string
}

// Fase 4 — Servicios, Batch 5 (REQ-263→267). Técnico externo (empresa/persona subcontratada).
export type ExternalTechnicianStatus = 'active' | 'inactive'

// REQ-263 RN1 — fila del listado. `tarifa_dia` viene null cuando tarifa_visible=false (RN "Sin
// tarifa asignada", ver REQ-266 RN3) — el backend ya aplica el gate, el frontend no lo repite.
export interface ExternalTechnician {
  id:                 number
  nombre:             string
  empresa:            string
  especialidad:       string
  telefono:           string | null
  tarifa_dia:          number | string | null
  tarifa_visible:      boolean
  estado:              ExternalTechnicianStatus
  proyectos_activos:   number
}

export interface ExternalTechnicianFilters {
  search?:    string
  estado?:    ExternalTechnicianStatus
  // Batch 11 — el picker de técnico externo del ítem Subcontratado pide todos los Activos de una
  // sola vez (per_page alto), no la página de 20 default del listado paginado.
  per_page?:  number
}

export interface ExternalTechnicianListResponse {
  data:   ExternalTechnician[]
  meta:   { current_page: number; last_page: number; per_page: number; total: number }
  counts: { active: number; inactive: number; total: number }
}

// REQ-264 RN1 — nombre/empresa/tarifa_dia obligatorios, el resto opcional.
export interface CreateExternalTechnicianPayload {
  nombre:        string
  empresa:       string
  especialidad?: string
  telefono?:     string
  email?:        string
  tarifa_dia:    number
}

// REQ-266 RN2 — entrada de solo consulta del historial de tarifa.
export interface ExternalTechnicianRateHistoryEntry {
  tarifa_dia:  number | string
  changed_by:  string | null
  created_at:  string
}

// REQ-267 — desde Batch 11, alimentado por ítems Subcontratado reales de Cotización
// (`ServiceQuoteItem`). SCRUM-337 (rebote QA 2026-08-13): costo_dia/margen_percent solo viajan
// cuando el actor tiene `puede_ver_costos` (ver ExternalTechnicianDetail) — ausentes del payload,
// no null, mismo criterio que `margin_percent` en el detalle de la Cotización. precio_final
// siempre viaja, no es un costo.
export interface ExternalTechnicianAssignedProject {
  ticket_id:       number
  ticket_numero:   string
  cliente:         string | null
  ticket_estado:   TicketStatus
  quote_numero:    string
  quote_estado:    ServiceQuoteStatus
  dias_cotizados:  number
  precio_final:    number
  costo_dia?:      number
  margen_percent?: number
}

// GET /servicios/external-technicians/{id} — ficha completa.
export interface ExternalTechnicianDetail extends ExternalTechnician {
  email:                string | null
  // SCRUM-337 (retest QA 2026-08-19) — ausente del payload (no []) cuando el actor no tiene
  // puede_ver_costos, mismo criterio "ausente, no oculto" que costo_dia/margen_percent.
  rate_history?:         ExternalTechnicianRateHistoryEntry[]
  puede_ver_costos:      boolean
  proyectos_asignados:   ExternalTechnicianAssignedProject[]
}

export interface UpdateExternalTechnicianRatePayload {
  tarifa_dia?:     number
  tarifa_visible?: boolean
}

// 409 — REQ-265 RN2, requiere reintentar con `confirm: true`.
export interface ExternalTechnicianDeactivationConfirmationResponse {
  message:                string
  requires_confirmation:   true
  active_projects_count:   number
}

// Fase 4 — Servicios, Batch 6 (REQ-255→260). Técnico interno.
export type InternalTechnicianStatus = 'available' | 'en_route' | 'on_site' | 'off'
export type InternalTechnicianSpecialty = 'general' | 'warranty'

// REQ-255 — tarjeta de Vista Equipo. `herramientas_asignadas`/`pct_resuelto_primera_visita`/
// `tiempo_promedio_minutos` son placeholders del backend (null/0) hasta Batch 13 / REQ-211.
export interface InternalTechnician {
  id:                          number
  // Batch 10 (REQ-258 RN8) — `null` cuando el perfil no está linkeado a una cuenta de login (ver
  // docblock de internal_technicians.user_id en el backend).
  user_id:                     number | null
  nombre:                      string
  telefono:                    string | null
  email:                       string | null
  especialidad:                InternalTechnicianSpecialty
  color:                       string
  has_bonus_plan:              boolean
  estado:                      InternalTechnicianStatus
  visitas_hoy:                 number
  herramientas_asignadas:      number
  pct_resuelto_primera_visita: number | null
  tiempo_promedio_minutos:     number | null
}

// REQ-257 — fila de "Visitas hoy". `fecha` (SCRUM-803) — solo relevante en Agenda equipo
// (REQ-260), cuyas visitas pueden caer en días distintos con las vistas Semana/Mes; en
// "Visitas hoy" siempre es la fecha de hoy, sin uso real.
export interface InternalTechnicianVisit {
  ticket_id:   number
  numero:      string
  fecha:       string | null
  hora:        string | null
  cliente:     string | null
  descripcion: string | null
}

// REQ-260 — bloque de Agenda equipo.
export interface InternalTechnicianAgendaEntry {
  id:       number
  nombre:   string
  color:    string
  visitas:  InternalTechnicianVisit[]
}

// REQ-259 RN1 — nombre/especialidad obligatorios, teléfono/correo opcionales.
export interface CreateInternalTechnicianPayload {
  nombre:        string
  telefono?:     string
  email?:        string
  especialidad:  InternalTechnicianSpecialty
}

// Fase 4 — Servicios, Batch 7 (REQ-261). 3 tarjetas resumen del equipo.
export interface InternalTechnicianTeamStats {
  activos_hoy:              number
  total_tecnicos:            number
  visitas_hoy_total:         number
  promedio_primera_visita:   number | null
}

// REQ-292 — captura mensual de comisión (hoy solo Carlos Vergara tiene plan activo). `null` =
// "Pendiente de captura" (RN6).
export interface CommissionCapture {
  year:                       number
  month:                      number
  satisfaccion_promedio:      number
  satisfaccion_pct:           number
  incidencias_puntualidad:    number
  puntualidad_pct:            number
  calificacion_actitud:       number
  actitud_pct:                number
  licencia_medica:            boolean
  // Batch 10 (REQ-258 RN2) — captura manual, `null` = todavía sin capturar este período.
  calidad_pct:                number | null
  captured_by:                string | null
  updated_by:                 string | null
  updated_at:                 string
}

export interface SaveCommissionCapturePayload {
  year:                       number
  month:                      number
  satisfaccion_promedio:      number
  incidencias_puntualidad:    number
  calificacion_actitud:       number
  licencia_medica?:           boolean
  calidad_pct?:                number | null
}

// REQ-292 RN2 — SLA (días hábiles) por tipo de ticket, ajustable por Gerencia.
export interface SlaSettings {
  claim:         number
  warranty:      number
  installation:  number
  retrofit:      number
}

// Batch 10 (REQ-258) — desglose + total ponderado, calculado en vivo (no se captura, se deriva
// de CommissionCapture + tickets reales). `null` = sin captura del período (mismo criterio que
// CommissionCapture: "Pendiente de captura").
export type CommissionCriterio = 'calidad' | 'satisfaccion' | 'sla' | 'puntualidad' | 'actitud'

export interface CommissionDesgloseItem {
  criterio:         CommissionCriterio
  peso_pct:         number
  pct_obtenido:      number
  monto_max:         number
  monto_obtenido:    number
}

export interface TechnicianCommissionResult {
  capture:   CommissionCapture
  total:     number
  desglose:  CommissionDesgloseItem[]
}

// Batch 10 (decisión de Luis 2026-08-11) — pantalla "Ajustes de Servicios", CRUD genérico sobre
// ServiciosSettingsService::schema(). `group` agrupa la UI (operacion/sla/comision/cotizacion), no
// tiene significado propio más allá de presentación.
//
// Batch 12 (REQ-237) — agrega `type: 'text'` (ej. `condiciones_cotizacion_servicios`) y el grupo
// `cotizacion` (ITBMS + Condiciones, ya existían en `ServiciosSettingsService::schema()` pero esta
// pantalla nunca los mostraba — `GROUP_ORDER` en ServiciosSettingsPage.tsx no incluía 'cotizacion',
// gap real cerrado en este batch, ver reporte de la tarea). `value` pasa a `number | string` para
// admitir el texto libre de Condiciones sin romper los settings numéricos existentes.
export interface ServiciosSetting {
  key:    string
  group:  'operacion' | 'sla' | 'comision' | 'cotizacion'
  label:  string
  type:   'int' | 'float' | 'text'
  value:  number | string
}

// Fase 4 — Servicios, Batch 8 (REQ-238→243). Informe de Inspección.

export type InspectionReportMode = 'formulario' | 'archivo_subido'

// REQ-239 — catálogo de campos dinámicos por tipo/subtipo/producto, servido por el backend
// (`GET .../inspection-report/fields`) para que el frontend nunca duplique la matriz de RN1-RN3 —
// una sola fuente de verdad, igual que `Ticket::REQUIREMENT_LABELS` ya reusa el mismo criterio.
export interface InspectionReportField {
  key:                   string
  label:                 string
  type:                  'text' | 'textarea' | 'select'
  options:               string[] | null
  quote_recommendation:  boolean
  ticket_product_id:     number | null
}

// Forma que manda el frontend al guardar — sin `is_quote_recommendation` (el backend lo asigna
// desde el catálogo, ver InspectionReportService::normalizeFindings(), nunca se infiere del label).
export interface InspectionReportFindingInput {
  label:               string
  value:               string
  ticket_product_id:   number | null
  is_additional:        boolean
}

// Forma que devuelve el backend (incluye is_quote_recommendation ya resuelto).
export interface InspectionReportFinding extends InspectionReportFindingInput {
  is_quote_recommendation: boolean
}

export interface InspectionReportMaterialInput {
  nombre_material:     string
  cantidad:            string
  /** SCRUM-361 (rebote QA 2026-08-14) — se setea al elegir un insumo trackeado de la Reserva
   *  Servicios desde el datalist; queda null para material de texto libre no trackeado. Sin esto
   *  el backend nunca puede generar el movimiento de Consumo automático del REQ-291. */
  catalog_product_id?: number | null
}

export interface InspectionReportMaterialDetail extends InspectionReportMaterialInput {
  id: number
}

export type InspectionReportPhotoCategoria = 'antes' | 'despues'

export interface InspectionReportPhoto {
  id:         number
  categoria:  InspectionReportPhotoCategoria
  url:        string
}

export interface InspectionReportDetail {
  id:                         number
  numero:                     string
  ticket_id:                  number
  modo:                       InspectionReportMode
  fecha_inspeccion:           string | null
  hora_inicio:                string | null
  hora_fin:                   string | null
  internal_technician_id:     number | null
  findings:                   InspectionReportFinding[]
  materiales:                 InspectionReportMaterialDetail[]
  fotos:                      InspectionReportPhoto[]
  conclusion:                 string | null
  requiere_seguimiento:       boolean
  proximos_pasos:             string | null
  firma_tecnico_nombre:       string | null
  firma_cliente_nombre:       string | null
  firma_cliente_imagen_url:   string | null
  archivo_adjunto_url:        string | null
  estado:                     'pending' | 'completed'
  created_at:                 string
}

// REQ-238→242 — modo formulario (JSON puro). El modo archivo_subido (REQ-243) usa
// `SaveInspectionReportUploadPayload` en un endpoint POST separado (ver serviciosApi — PHP no
// puebla $_FILES en un PUT multipart sin method-spoofing, evitado a propósito acá).
export interface SaveInspectionReportPayload {
  fecha_inspeccion?:        string | null
  hora_inicio?:              string | null
  hora_fin?:                 string | null
  internal_technician_id?:   number | null
  findings?:                 InspectionReportFindingInput[]
  materiales?:               InspectionReportMaterialInput[]
  conclusion:                string
  requiere_seguimiento?:     boolean
  proximos_pasos?:           string | null
  firma_tecnico_nombre?:     string | null
  firma_cliente_nombre?:     string | null
}

export interface SaveInspectionReportUploadPayload {
  archivo?:               File | null
  firma_tecnico_nombre?:  string | null
  firma_cliente_nombre?:  string | null
}

// Batch 10 (REQ-251→254) — Informe móvil. Mismo shape que SaveInspectionReportPayload
// (`firma_cliente_nombre` obligatorio, validado en el frontend antes de habilitar el lienzo de
// firma — RN1 REQ-253) + la imagen de la firma gráfica (RN5 REQ-253). Una sola llamada al
// confirmar la firma, ver docblock de InspectionReportService::save() en el backend.
export interface SaveInspectionReportMobilePayload extends Omit<SaveInspectionReportPayload, 'firma_cliente_nombre'> {
  firma_cliente_nombre:  string
  firma_cliente_imagen:  Blob
}

// Fase 4 — Servicios, Batch 9 (REQ-278/279). Hoja de Reclamo — contraparte de Informe de
// Inspección para tickets tipo=claim (REQ-220 RN1). `estado=completed` bloquea edición TOTAL
// (diverge de Informe de Inspección, que sigue editable después de Completado).
export type ClaimSheetDiagnostico = 'defectuoso' | 'no_procede' | 'uso_inadecuado' | 'pendiente_evaluacion'

// Secciones 1-2 (reclamante/producto) siempre vienen del ticket — nunca se capturan a mano.
export interface ClaimSheetReclamante {
  cliente_master:  string | null
  subcliente:      string | null
  contacto:        string | null
  telefono:        string | null
  email:           string | null
  direccion:       string | null
  proyecto:        string | null
  responsable:     string | null
}

export interface ClaimSheetDetail {
  ticket_id:              number
  reclamante:              ClaimSheetReclamante
  productos:               TicketProductDetail[]
  id:                      number | null
  descripcion_problema:    string | null
  fecha_reclamo:           string | null
  diagnostico:             ClaimSheetDiagnostico | null
  firma_responsable:       string | null
  estado:                  'pending' | 'completed'
  created_at:              string | null
}

export interface SaveClaimSheetPayload {
  descripcion_problema?:  string | null
  fecha_reclamo?:          string | null
  diagnostico:             ClaimSheetDiagnostico
  firma_responsable:       string
}

// Fase 4 — Servicios, Batch 11 (REQ-229→234, SCRUM-292→297). Cotización de Servicio.
//
// `ServiceQuoteStatus` reusa exactamente los mismos 4 valores crudos que `QuoteStatus` puede tomar
// una vez que el informe ya no bloquea (draft/sent/approved/rejected) — mismo vocabulario que
// `Ticket::QUOTE_STATUS_*` en el backend, a propósito (así `ticket.quote_status` y
// `quote.estado` nunca divergen de nombre).
export type ServiceQuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected'

export type ServiceQuoteItemType = 'product' | 'labor' | 'subcontracted'

// `cost_reference` solo viene poblado cuando `can_view_cost_breakdown` es true (Aaron/Mark/David/
// Whil, `servicios.quotes.view_cost_breakdown`) — el resto de roles ni siquiera recibe la clave,
// nunca `null` como valor "oculto" (evita filtrar por inspección de red que el dato existe).
export interface ServiceQuoteItem {
  id:                       number
  tipo:                     ServiceQuoteItemType
  catalog_product_id:       number | null
  is_custom:                boolean
  external_technician_id:   number | null
  description:              string
  quantity:                 number
  unit_price:               number
  // Solo tiene sentido para tipo=subcontracted (RN — editable por línea); null en product/labor.
  // También `null` cuando `can_view_cost_breakdown` es false, aunque la línea SÍ tenga un margen
  // guardado — mismo gate que `cost_reference` arriba: con `unit_price` siempre visible, exponer
  // el margen le permitiría a cualquiera recalcular `cost_reference` (tarifa_dia = unit_price /
  // (1 + margen/100)), sorteando el gate. Hallazgo de Senior Review (Batch 11), corregido acá.
  margin_percent:           number | null
  subtotal:                 number
  cost_reference?:          number | null
}

export interface ServiceQuoteData {
  id:                number
  // SCRUM-292 (rebote QA 2026-08-13) — null hasta el primer guardado real (agregar un ítem o
  // Guardar), no al solo abrir "Generar cotización" — ver
  // ServiceQuoteService::ensureFolioAssigned() en el backend. El frontend muestra
  // "(se asigna al guardar)" mientras sea null.
  numero:            string | null
  estado:            ServiceQuoteStatus
  subtotal:          number
  discount_percent:  number
  itbms:             number
  total:             number
  observations:      string | null
  // REQ-237 (Batch 12) — texto de Condiciones CONGELADO al enviar (`ServiceQuoteService::send()`),
  // `null` mientras está en Borrador (todavía no se congeló) — el frontend usa
  // `ServiceQuoteDetail.conditions_preview` hasta que exista este valor.
  conditions:        string | null
  sent_at:           string | null
  decided_at:        string | null
  created_at:        string
  // REQ-229 RN — precarga de solo lectura, siempre la snapshot del ticket.
  cliente:           string | null
  contacto:          string | null
  telefono:          string | null
  direccion:         string | null
  // Permisos ya resueltos por el backend para ESTE usuario — el frontend nunca reimplementa
  // `ServiceQuoteService::assertCanEdit()` (mismo criterio que `canEditInspectionReport` en
  // TicketDetailModal, que sí lo reimplementa para el gate del botón — acá el backend ya lo hizo
  // por nosotros dentro del propio detalle, no hace falta duplicarlo).
  can_edit:          boolean
  can_send:          boolean
  can_decide:        boolean
  items:             ServiceQuoteItem[]
}

// GET /servicios/tickets/{id}/quote — precarga + cotización más reciente (null si nunca se generó).
export interface ServiceQuoteDetail {
  ticket_id:                number
  // REQ-229 RN — notas informativas (productos a reemplazar / instalación subcontratada), no
  // persistidas, solo para mostrar debajo del formulario.
  notes:                    string[]
  min_margin_percent:       number
  itbms_percent:            number
  can_view_cost_breakdown:  boolean
  // "Generar cotización" (sin cotización previa) o "Generar nueva cotización" (la más reciente
  // está Rechazada) — un solo flag, el texto del botón lo decide el frontend según `quote` exista.
  can_generate:             boolean
  // REQ-237 — texto VIGENTE de Condiciones (precarga/preview antes de enviar, nunca se persiste
  // hasta `send()` — ver docblock de `quote.conditions` arriba).
  conditions_preview:       string
  quote:                    ServiceQuoteData | null
}

export interface SaveServiceQuotePayload {
  discount_percent?: number
  observations?:     string | null
}

export interface ServiceQuoteItemPayload {
  tipo:                      ServiceQuoteItemType
  catalog_product_id?:       number | null
  is_custom?:                boolean
  external_technician_id?:   number | null
  description?:              string | null
  quantity:                  number
  unit_price?:               number | null
  margin_percent?:           number | null
  // SCRUM-781 (punto 3) — override de costo/día por ítem, solo aplica a tipo=subcontracted.
  cost_reference?:           number | null
}

// Batch 12 (REQ-236, SCRUM-299) — historial completo del ticket, TODAS las versiones (incluidas
// las reemplazadas), más reciente primero. Fila liviana (sin `items` — abrir una versión puntual
// usa `document()`, ver docblock de `ServiceQuoteController::history()` en el backend).
export interface ServiceQuoteHistoryEntry {
  id:          number
  numero:      string
  estado:      ServiceQuoteStatus
  total:       number
  created_at:  string
  sent_at:     string | null
  decided_at:  string | null
}

// Batch 12 (REQ-250, SCRUM-313) — historial global transversal a todo el equipo (`GET
// /servicios/quotes`), mismo criterio de "todas las versiones" que el historial por ticket.
export interface ServiceQuoteGlobalHistoryEntry {
  id:          number
  numero:      string
  estado:      ServiceQuoteStatus
  total:       number
  created_at:  string
  sent_at:     string | null
  ticket:      { id: number; numero: string; cliente: string | null } | null
}

// `counts` SIEMPRE refleja el total sin filtrar (mismo criterio que REQ-222 RN5 — las tarjetas de
// estadísticas de Tickets nunca se filtran por lo que el usuario esté viendo en la tabla).
export type ServiceQuoteCounts = Record<'all' | ServiceQuoteStatus, number>

export interface ServiceQuoteGlobalHistoryResponse {
  data:    ServiceQuoteGlobalHistoryEntry[]
  counts:  ServiceQuoteCounts
}

// Fase 4 — Servicios, Batch 15 (REQ-207/208/210/211). Pantalla "Inicio". REQ-206 (saludo dinámico,
// SCRUM-269) y REQ-209 (Mi calendario, SCRUM-272) quedan fuera de este batch — ver reporte.

// REQ-208 — fila de "Rutas del día". `tecnico.color` es LITERALMENTE `internal_technicians.color`
// (RN3: mismo color en toda la app), nunca un esquema derivado aparte como el que usa
// `TechnicianBadge` en Tickets — ver nota en HomeRoutesPanel.
export interface HomeRouteVisitTechnician {
  id:     number
  nombre: string
  color:  string
}

export interface HomeRouteVisit {
  ticket_id:    number
  numero:       string
  hora:         string | null
  tipo:         TicketType
  cliente:      string | null
  descripcion:  string | null
  direccion:    string | null
  contacto:     string | null
  telefono:     string | null
  tecnico:      HomeRouteVisitTechnician
}

// RN2 — máximo 5, con `has_more`/`total` para el enlace "Ver agenda completa".
export interface HomeRutasDia {
  visitas:  HomeRouteVisit[]
  total:    number
  has_more: boolean
}

// REQ-210 — RN3 ("Repuesto sin llegar") queda vacío a propósito hasta que exista el vínculo real
// ticket↔orden de compra (Batch 13/14) — ver docblock de HomeService::pendientes() en el backend.
export type HomePendingType = 'ticket_sin_agendar' | 'repuesto_sin_llegar'

export interface HomePendingItem {
  type:       HomePendingType
  ticket_id:  number
  numero:     string
  dias?:      number
  message:    string
}

export interface HomePendientes {
  count: number
  items: HomePendingItem[]
}

// REQ-211 RN2a — de dónde sale la meta mostrada, para que el frontend pueda explicar el número
// ("valor manual" vs "calculado automáticamente" vs "ajustado por Gerencia") sin adivinar.
export type InstallationGoalSource = 'manual_override' | 'manual_default' | 'calculated'

export interface HomeIndicadoresMes {
  instalaciones: {
    completadas:   number
    meta:          number
    meta_source:   InstallationGoalSource
    progreso_pct:  number
  }
  resuelto_primera_visita_pct:      number | null
  tiempo_promedio_resolucion_dias:  number | null
  // RN5 — suma de cotizaciones aprobadas de tickets de Instalación cerrados en el mes. `available`
  // se mantiene en el shape por si en el futuro vuelve a haber un escenario sin dato real
  // (nunca $0 disfrazado de dato real) — reconciliado 2026-08-12, ver HomeService::ingresosInstalaciones().
  ingresos_instalaciones: {
    value:      number | null
    available:  boolean
  }
}

// REQ-212 — "Servicios sin responder" de Inicio (Grupo C, SCRUM-275). `dias` es SIEMPRE
// "días desde reportado" (ya calculado por el backend, nunca derivado acá de `created_at`).
export interface HomeSinResponderItem {
  ticket_id:    number
  numero:       string
  cliente:      string
  descripcion:  string
  tipo:         TicketType
  tipo_label:   string
  dias:         number
}

// RN4 (mismo criterio que HomePendientes arriba) — `count` es siempre el total real del backend,
// nunca `items.length` calculado en el cliente.
export interface HomeSinResponder {
  count: number
  items: HomeSinResponderItem[]
}

// REQ-213 — "Insumos y herramientas pendientes" de Inicio (Grupo C, SCRUM-276). `producto.*` es
// un snapshot, puede venir con campos en null (mismo criterio que `ticket_products` en el backend).
export interface HomeInsumoPendienteProducto {
  marca:        string | null
  referencia:   string | null
  descripcion:  string | null
}

export interface HomeInsumoPendienteItem {
  ticket_id:              number
  numero:                 string
  cliente:                string
  producto:                HomeInsumoPendienteProducto
  solicitado_hace_dias:    number
  // RN2 — `null` = "Por confirmar", NUNCA una fecha inventada del lado del frontend.
  llegada_estimada:        string | null
}

export interface HomeInsumosPendientes {
  count: number
  items: HomeInsumoPendienteItem[]
}

export interface HomeSummary {
  rutas_dia:           HomeRutasDia
  pendientes:          HomePendientes
  indicadores_mes:     HomeIndicadoresMes
  sin_responder:       HomeSinResponder
  insumos_pendientes:  HomeInsumosPendientes
}

// REQ-211 RN2a(c) — override manual de Gerencia para un mes puntual.
export interface UpdateInstallationGoalPayload {
  year:   number
  month:  number
  value:  number
}

// REQ-215 — "Estado de tickets" de Inicio (Grupo C, SCRUM-278). Endpoint separado del summary
// (GET /servicios/home/estado-tickets) para que el chip de tipo re-consulte sin recargar el resto
// de la pantalla. Escenario 3 del criterio de aceptación agrega `cancelled` — el mockup del
// cliente (anterior a que existiera ese estado) solo muestra 5, la UI real agrega la 6ta tarjeta.
export interface HomeEstadoTicketsCounts {
  reported:   number
  scheduled:  number
  on_site:    number
  resolved:   number
  closed:     number
  cancelled:  number
}

export interface HomeEstadoTicketsResponse {
  counts: HomeEstadoTicketsCounts
  tipo:   TicketType | null
}

export interface InstallationGoalResult {
  value:   number
  source:  InstallationGoalSource
}

// Fase 4 — Servicios, Batch 17/18 (REQ-280→286, SCRUM-350→356). Página "Reportes". Selector de
// período: mes concreto + año (mes actual + 5 anteriores) — NUNCA la opción "Últimos 3 meses" del
// mockup viejo, sin regla de negocio definida (backlog explícito, decisión de producto ya tomada).
export interface ReportsPeriodParams {
  year:   number
  month:  number
}

// REQ-280/281 — "Panorama del mes". El backend no expone el desglose crudo detrás de cada %
// (ej. "34 de 52" del mockup viejo) — el frontend muestra el % con un subtítulo genérico, ver
// ReportsPanoramaCards.tsx. `tiempo_promedio_resolucion_todos_los_tipos` es siempre `true`: el
// backend nunca filtra este promedio por tipo de ticket, el campo existe para que el frontend
// nunca lo de a entender con un subtítulo que sugiera lo contrario.
export interface ReportsPanoramaMes {
  // REQ-280 Escenario 1 — la tarjeta muestra el conteo crudo ("13 de 21 tickets del mes"), no el
  // porcentaje; `_pct` se mantiene por si otra vista lo necesita, pero no es lo que se renderiza.
  servicios_completados:                       number
  servicios_completados_total:                 number
  servicios_completados_pct:                  number | null
  resuelto_primera_visita_pct:                number | null
  tiempo_promedio_resolucion_dias:             number | null
  tiempo_promedio_resolucion_todos_los_tipos:  true
  informes_pendientes:                         number
}

// REQ-282 — "Instalaciones cotizadas vs. realizadas".
export interface ReportsInstalacionesCotizadasVsRealizadas {
  cotizadas:   { cantidad: number; total: number }
  realizadas:  { cantidad: number; total: number }
}

// REQ-283 — distribución del mes por tipo, siempre los 4 tipos (`color` ya resuelto por el
// backend, mismos hex que TYPE_COLORS en TicketBoard.tsx).
export interface ReportsDistribucionTipoItem {
  tipo:   TicketType
  count:  number
  color:  string
}

// REQ-284 — distribución del mes por técnico interno (`color` = mismo color con el que ese
// técnico aparece en Agenda equipo / InternalTechnicianCard).
export interface ReportsDistribucionTecnicoItem {
  id:      number
  nombre:  string
  color:   string
  count:   number
}

// REQ-285 — "Servicios completados en el año", siempre desde enero, independiente del mes elegido
// en el period-select (solo depende del año).
export interface ReportsCompletadosAnioItem {
  mes:       number
  por_tipo:  Record<TicketType, number>
  total:     number
}

// REQ-286 — comisión de Carlos Vergara en Reportes, SOLO LECTURA. Reusa el tipo ya existente de
// Batch 10 (`TechnicianCommissionResult`) — mismo shape que devuelve
// GET /internal-technicians/{id}/commission, este endpoint solo evita exponer el id del técnico
// en la URL. `null` = sin captura del período (mismo criterio que TechnicianCommissionResult).
export type ReportsComisionCarlosVergara = TechnicianCommissionResult | null

// REQ-280 — "Biblioteca de documentos" (informes de inspección + hojas de reclamo). Nunca
// "documentos de satisfacción" (texto del mockup viejo que no existe en el dominio real, ver
// docblock de ReportsPage.tsx) — solo estos 2 tipos de documento.
export type ReportsBibliotecaTipoDocumento = 'inspection_report' | 'claim_sheet'

// Mismo enum que InspectionReportDetail.estado / ClaimSheetDetail.estado.
export type ReportsBibliotecaEstado = 'pending' | 'completed'

export interface ReportsBibliotecaItem {
  id:              number
  tipo_documento:  ReportsBibliotecaTipoDocumento
  ticket_id:       number
  ticket_numero:   string
  cliente:         string | null
  tecnico:         string | null
  fecha:           string   // ISO8601
  estado:          ReportsBibliotecaEstado
}

export interface ReportsBibliotecaFilters {
  search?:          string
  tipo_documento?:  ReportsBibliotecaTipoDocumento
  estado?:          ReportsBibliotecaEstado
  per_page?:        number
  page?:            number
}

// Shape estructuralmente compatible con PaginationMeta (src/components/ui/Pagination.tsx) — se
// pasa directo a <Pagination meta={...} />, mismo criterio que ExternalTechnicianListResponse.meta.
export interface ReportsBibliotecaMeta {
  current_page:  number
  last_page:     number
  per_page:      number
  total:         number
}

export interface ReportsBibliotecaResponse {
  data:  ReportsBibliotecaItem[]
  meta:  ReportsBibliotecaMeta
}

// Fase 4 — Servicios, Batch 13 Grupo D parte 1 (REQ-268→272, SCRUM-338→342). Herramientas.
// Contrato RECONCILIADO 2026-08-12 contra el `ToolController.php`/`ToolService.php` reales de
// Backend Dev (worktree atlanticerp-backend, commit 3fb46bb) — difiere en 3 puntos del contrato
// asumido originalmente (ver commit de reconciliación de esta tarea): sin `pending_requests`
// embebido en el listado, nombres de campo distintos, y el shape real de la respuesta de
// `.../recibir`. Ver docs/architecture/servicios-fase4-diseno.md.

// CRÍTICO Pre-QA 2026-08-13 (SCRUM-339/338) — estos 4 valores DEBEN coincidir literal con
// Tool::ESTADOS en el backend (app/Modules/Servicios/Models/Tool.php: good|damaged|worn|lost,
// persistidos en inglés ASCII a propósito, ver docblock de la migración
// ..._create_servicios_tools_table.php). Antes tenían las claves en español
// (buen_estado|danada|desgaste|perdida), que Rule::in(Tool::ESTADOS) siempre rechazaba con 422 —
// ningún cambio de estado (REQ-269) ni filtro por estado (REQ-268 RN3) funcionaba nunca contra el
// backend real, y el <select> de estado mostraba "Buen estado" para CUALQUIER herramienta
// (Dañada/Desgaste/Perdida incluidas) porque el value real nunca matcheaba ningún <option>.
export type ToolEstado = 'good' | 'damaged' | 'worn' | 'lost'

export const TOOL_ESTADOS: ToolEstado[] = ['good', 'damaged', 'worn', 'lost']

// REQ-272 RN — cuando ESTA unidad puntual disparó una solicitud de reposición todavía sin
// recibir (el payload de creación manda `tool_id` = el id de la unidad que dispara el pedido, ver
// CreateToolPurchaseRequestPayload). El backend nunca reutiliza el código de esta unidad en las
// unidades nuevas que genera al recibir — solo referencia el nombre.
export interface ToolPendingReplacementRequest {
  id:         number
  cantidad:   number
  created_at: string
}

// REQ-268 RN2 — unidad individual identificada por su código único (`codigo_unico`).
// `assigned_to` viaja YA RESUELTO por el backend (nombre del técnico o "En bodega de
// herramientas") — `assigned_to_technician_id` es el FK crudo, el único campo que alimenta el
// `value` real del select de reasignación (REQ-270). `responsable_incidente` — REQ-269, resuelto
// server-side al cambiar de estado, el frontend nunca lo pide ni lo calcula, solo lo muestra.
export interface Tool {
  id:                          number
  nombre:                      string
  codigo_unico:                string
  estado:                      ToolEstado
  assigned_to_technician_id:   number | null
  assigned_to:                 string          // ya resuelto — nombre del técnico o "En bodega de herramientas"
  assigned_since:              string          // ISO — fecha desde la que está en este estado/asignación
  responsable_incidente:       string | null
  pending_replacement_request: ToolPendingReplacementRequest | null
}

export interface ToolFilters {
  search?:      string
  estado?:      ToolEstado
  assigned_to?: number | 'bodega'
}

export type ToolPurchaseRequestStatus = 'solicitado' | 'recibida'

// REQ-271 (alta, `source_tool_id` null) / REQ-272 (reposición, `source_tool_id` de la unidad
// existente que disparó el pedido, mismo `nombre` que esa unidad). Asimetría real confirmada con
// Backend Dev: el body del POST manda `tool_id` (ver CreateToolPurchaseRequestPayload) pero la
// RESPUESTA — acá y en GET .../purchase-requests — usa `source_tool_id`, nunca `tool_id`.
export interface ToolPurchaseRequest {
  id:              number
  nombre:          string
  cantidad:        number
  estado:          ToolPurchaseRequestStatus
  source_tool_id:  number | null
  requested_by:    string | null
  received_at:     string | null
  created_at:      string
}

export interface CreateToolPurchaseRequestPayload {
  nombre?:  string   // solo alta nueva (REQ-271) — sin tool_id
  tool_id?: number   // solo reposición (REQ-272) — sin nombre, el backend lo deriva de la unidad
  cantidad: number
}

// GET /servicios/tools/purchase-requests — TODAS las solicitudes (pendientes Y ya recibidas,
// created_at desc), no solo las pendientes. El cliente filtra `estado === 'solicitado' &&
// source_tool_id === null` para armar las filas de grupo "pendiente de recibir" de REQ-271 (ver
// ToolTable.tsx) — las de reposición (source_tool_id no null) NO se muestran desde acá, viajan
// embebidas en la unidad correspondiente vía `Tool.pending_replacement_request`.
export interface ToolPurchaseRequestsResponse {
  data: ToolPurchaseRequest[]
}

// Respuesta real de POST .../purchase-requests/{id}/recibir: la purchase request ya actualizada
// (estado 'recibida'), spreadeada, MÁS las unidades reales generadas.
export interface ReceiveToolPurchaseResponse extends ToolPurchaseRequest {
  tools: Tool[]
}

export type ToolMovementTipo = 'estado' | 'asignacion'

// REQ-269/270 — historial de cambios de estado/asignación de una unidad. Sin endpoint de
// consulta propio en este batch (el listado ya devuelve `assigned_since` resuelto por el
// backend) — se modela igual para el día que exista `GET /servicios/tools/{id}/movements`, a
// pedido del Arquitecto en el brief de esta tarea.
export interface ToolMovement {
  id:          number
  tool_id:     number
  tipo:        ToolMovementTipo
  valor:       string   // ToolEstado si tipo=estado; id de técnico o "bodega" si tipo=asignacion
  changed_by:  string | null
  created_at:  string
}

// ---------------------------------------------------------------------------
// Fase 4 — Servicios, Batch Grupo D parte 2 (REQ-273→276, SCRUM-343→346). Insumos + Kardex de
// Herramientas. Backend construido EN PARALELO por otro agente sobre un worktree separado —
// RECONCILIADO 2026-08-13 por el Arquitecto contra InsumoController/InsumoService/ToolMovement
// reales — ver los 5 puntos de ajuste en la sesión que cerró este batch.

export type InsumoEstado = 'ok' | 'bajo_minimo'

// RECONCILIADO 2026-08-13 — `InsumoPurchaseRequest` (abajo) solo tiene 2 estados reales
// (`pendiente`/`recibida`), nunca los 4 pasos de compras.ORDER_STATUSES asumidos originalmente
// (esos 4 pasos existen en `PurchaseOrder`, pero `InsumoService::formatSetting()` no los expone
// en la fila). `estado_solicitud` en `Insumo` solo puede ser 'pendiente' o null — una vez recibida
// la solicitud, la fila vuelve a null (ya se reflejó en `disponible`).
export type InsumoEstadoSolicitud = 'pendiente'

// REQ-273 — fila de insumo trackeado por Servicios, forma real de `InsumoService::formatSetting()`
// (RECONCILIADO 2026-08-13 — `referencia`/`nombre` en español, NO `factory_reference`/
// `description` como se asumió originalmente). `catalog_product_id` referencia el catálogo real
// de Compras (mismo concepto que ProductOption arriba) — Servicios nunca es dueño del producto,
// solo trackea disponible/mínimo/estado sobre él.
export interface Insumo {
  id:                 number
  catalog_product_id: number
  referencia:         string | null
  nombre:             string | null
  disponible:         number
  minimo:             number
  estado:             InsumoEstado
  estado_solicitud:   InsumoEstadoSolicitud | null
}

export interface CreateInsumoSolicitudPayload {
  cantidad: number
}

// RECONCILIADO 2026-08-13 — resource real devuelto por POST /servicios/insumos/{id}/solicitar,
// distinto de `Insumo` (asumido originalmente que la respuesta era el `Insumo` actualizado, no lo
// es). `estado` acá SÍ tiene 2 valores reales — 'pendiente' (recién creada) / 'recibida' (ya
// resuelta) — a diferencia de `estado_solicitud` en `Insumo`, que solo viaja como 'pendiente' o
// null. El caller (InsumoRequestModal) no necesita mergear esta forma en la fila — solo invalida
// `insumos.list()` y deja que el backend recalcule `estado_solicitud`.
export type InsumoPurchaseRequestEstado = 'pendiente' | 'recibida'

export interface InsumoPurchaseRequest {
  id:                  number
  catalog_product_id:  number
  cantidad_solicitada: number
  estado:              InsumoPurchaseRequestEstado
  purchase_order_id:   number | null
  received_at:         string | null
  created_at:          string
}

// REQ-275 — RECONCILIADO 2026-08-13: REQ-275 NO tiene endpoint de catálogo propio.
// `InsumoController` reusa `GET /servicios/lookup/products` (mismo `ProductOption` de arriba,
// `serviciosApi.lookup.products()`, ya usado en TicketCreateModal) — se elimina el tipo
// `InsumoCatalogOption` que se había asumido (dead code).

export interface CreateInsumoPayload {
  catalog_product_id: number
  minimo:             number
  cantidad_inicial:   number
}

// REQ-276 — libro mayor (kardex) de movimientos de HERRAMIENTAS. CONCEPTO DISTINTO de
// `ToolMovement` de arriba — pero RECONCILIADO 2026-08-13: GET /servicios/tools/movements termina
// siendo, de hecho, una CONSULTA sobre esa misma tabla `ToolMovement` (auditoría por unidad física,
// `tool_codigo_unico` propio), no un libro mayor agregado como se asumió originalmente (mismo
// shape que KardexEntry de Bodega).
//
// SCRUM-779 (decisión de Luis 2026-08-23) — `cantidad`/`saldo_inicial`/`saldo_resultante` de la
// spec original SÍ se implementaron, resolviendo la pregunta de producto que el Arquitecto había
// dejado abierta: "saldo" = unidades EN BUEN ESTADO agrupadas por `tool_nombre` (Ingreso suma,
// Dañada/Perdida/Desgaste resta), calculado sobre el historial completo en orden cronológico —
// ver `ToolService::listMovements()` en el backend para el detalle y su limitación conocida
// (restaurar una unidad a Buen estado no genera movimiento, así que ese evento es invisible acá).
// `cantidad` es siempre 1 (cada fila es una unidad física puntual).
//
// 'ingreso' (RECONCILIADO — no 'received' como se asumió) es el único valor en español;
// 'damaged'/'worn'/'lost' sí coinciden con `ToolEstado` (arriba), confirmado real.
export type ToolKardexTipo = 'ingreso' | 'damaged' | 'worn' | 'lost'

export interface ToolKardexEntry {
  id:                number
  tool_id:           number
  tool_nombre:       string
  tool_codigo_unico: string
  tipo:              ToolKardexTipo
  cantidad:          number
  detalle:           string | null
  saldo_inicial:     number
  saldo_resultante:  number
  user_id:           number | null
  user_nombre:       string | null
  created_at:        string   // ISO
}

// RECONCILIADO 2026-08-13 — filtros reales son numéricos (`tool_id`/`user_id`), no texto libre
// (`herramienta`/`realizado_por` como se asumió originalmente) — la UI pasa a 2 selects (uno de
// herramienta vía `serviciosApi.tools.list()`, otro de técnico interno vía
// `serviciosApi.internalTechnicians.list()`) en vez de 2 inputs de búsqueda.
export interface ToolKardexFilters {
  tool_id?: number
  tipo?:    ToolKardexTipo
  user_id?: number
}
