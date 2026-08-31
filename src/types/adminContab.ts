// Batch Configuración Fiscal (SCRUM-632→637, REQ-555→560) — módulo Admin&Cont, pantalla exclusiva
// de Mark. Contrato acordado con Backend Dev (implementado en paralelo sobre App\Modules\AdminCont).

export type RegimenTributario = 'general' | 'pequeno_contribuyente'
export type PacAmbiente = 'production' | 'testing'

export interface FiscalSettings {
  razon_social: string
  nombre_comercial: string
  ruc: string
  dv: string
  direccion_fiscal: string
  regimen_tributario: RegimenTributario
  pac_provider: 'digifact'
  pac_ambiente: PacAmbiente
  /** Solo lectura, SIEMPRE — nunca se habilita ni siquiera en modo edición (REQ-555 RN3). */
  pac_last_sync_at: string | null
  /** Solo lectura, SIEMPRE — informativo, mismo tratamiento que pac_last_sync_at (hallazgo Visual Review, badge del mockup ausente en la 1ra pasada). */
  pac_connection_status: string
  pac_doc_factura_habilitado: boolean
  pac_doc_nota_credito_habilitado: boolean
  retencion_proveedores_activa: boolean
  primary_approver_user_id: number | null
  /** Batch 4 de Facturación (REQ-450) — plazo de crédito que define el vencimiento de facturas
   *  para el panel de Antigüedad de Cartera. Agregado al backend en esa sesión sin campo en esta
   *  pantalla — gap real encontrado por Luis (superadmin, 2026-08-22), corregido acá. */
  dias_credito_factura: number
  /** Batch 21 de Caja Chica (SCRUM-618→623) — umbral de la regla de 2 intentos (REQ-542), movido
   *  acá desde una constante hardcodeada en el backend (regla dura del workspace sobre umbrales de
   *  negocio, ver CLAUDE.md raíz). Entero, mínimo 1. */
  petty_cash_max_intentos_rechazo: number
}

/** Campos editables desde el formulario — excluye los de solo lectura/gobernados por el backend. */
export type FiscalSettingsPayload = Omit<
  FiscalSettings,
  'pac_last_sync_at' | 'pac_connection_status' | 'pac_provider' | 'primary_approver_user_id'
>

export interface ItbmsRate {
  id: number
  /** Nullable — las 3 tasas base lo tienen fijo, una personalizada no lo pide (RN3 REQ-558 solo exige porcentaje+descripción). */
  nombre: string | null
  descripcion: string
  porcentaje: number
  /** true = una de las 3 tasas fijas del sistema (7% General, 3.5% Retención, 0% Exento) — nunca eliminable (RN1 REQ-558). */
  es_base: boolean
  activa: boolean
  created_at: string
}

export interface CreateItbmsRatePayload {
  descripcion: string
  porcentaje: number
}

// Batch Datos de la Empresa (SCRUM-638→642, REQ-561→565) — mismo módulo Admin&Cont, misma
// pantalla exclusiva de Mark (gate real en el backend, 403 en TODAS las rutas incluido GET).

export interface RedSocial {
  plataforma: string
  url: string
}

export interface CompanyProfile {
  /** Solo lectura SIEMPRE — viene de Configuración Fiscal (REQ-556), nunca un valor propio (RN1 REQ-562). */
  razon_social: string
  /** Solo lectura SIEMPRE — mismo criterio que razon_social, para no tener 2 fuentes del mismo dato. */
  nombre_comercial: string
  logo_url: string | null
  descripcion_corta: string
  sitio_web: string
  redes_sociales: RedSocial[]
  /** Solo lectura SIEMPRE — configuración base ya confirmada (RN1 REQ-565). */
  moneda: string
  /** Solo lectura SIEMPRE — configuración base ya confirmada (RN1 REQ-565). */
  anio_fiscal: string
  /** Editable en modo edición — hoy el backend solo acepta 'America/Panama' (RN2 REQ-565). */
  zona_horaria: string
}

/** Campos editables desde el formulario — excluye los de solo lectura/gobernados por otra pantalla. */
export type CompanyProfilePayload = Pick<
  CompanyProfile, 'descripcion_corta' | 'sitio_web' | 'redes_sociales' | 'zona_horaria'
>

export type LocationType = 'Bodega' | 'Showroom' | 'Oficina' | 'Otra'

export interface Location {
  id: number
  nombre: string
  tipo: LocationType
  direccion: string | null
  activa: boolean
  /** false para las 7 bodegas/showrooms oficiales — vienen en vivo del módulo Bodega, solo lectura acá (RN1 REQ-563). */
  editable: boolean
  source: 'bodega' | 'admin_contab'
}

export interface CreateLocationPayload {
  nombre: string
  /** Solo estos 2 — "Bodega"/"Showroom" son de solo lectura, sourced del módulo Bodega (RN1 REQ-563). */
  tipo: 'oficina' | 'otra'
  direccion: string
}

export interface Contact {
  id: number
  area: string
  email: string
  telefono: string
  activo: boolean
}

export interface CreateContactPayload {
  area: string
  email: string
  telefono: string
}

// Batch 1 del cuerpo principal de la épica (SCRUM-607→611, REQ-530→534) — Cuentas Bancarias.
// A diferencia de Fiscal/Empresa, NO es exclusiva de Mark: la ven varios roles (Felix, Yaneth,
// Gerencia) según gate del backend — sin estado especial de "acceso restringido" en el frontend.

export type TipoCuenta = 'corriente' | 'ahorro' | 'tarjeta_credito'
export type TipoMovimiento = 'cobro' | 'devolucion' | 'comision'

export interface BankAccount {
  id: number
  banco: string
  tipo_cuenta: TipoCuenta
  ultimos_4_digitos: string
  moneda: string
  activa: boolean
  movimientos_count: number
}

export interface CreateBankAccountPayload {
  banco: string
  ultimos_4_digitos: string
  tipo_cuenta?: TipoCuenta
  moneda?: string
}

export interface BankMovement {
  id: number
  fecha: string
  tipo: TipoMovimiento
  concepto: string
  monto: number
  /** Ya calculada por el backend — entrada=cobro (verde), salida=devolucion|comision (rojo). */
  direccion: 'entrada' | 'salida'
  bank_account_id: number | null
  /** null = "Sin cuenta asignada" (RN3 REQ-533). */
  bank_account_label: string | null
}

// Batch 2 del cuerpo principal de la épica (SCRUM-513→518, REQ-436→441) — Facturación.
//
// NOTA DE RECONCILIACIÓN (2026-08-19, cerrada): el mockup real del ticket
// (4B__Admin_Contabilidad_Facturacion.html) modela "hitos de facturación" (anticipos, entregas
// parciales — varios por proyecto, algunos sin ninguna Guía de Entrega) como unidad facturable, y
// su función generarFactura() valida "falta Guía de Entrega de Bodega" ANTES de facturar. Esto es
// un modelo de datos más rico que lo que describen los REQ de este batch (SCRUM-513→518), que solo
// hablan de "entregas" 1:1 con el pedido de Bodega (`Order`) — y el texto RN1/RN4 de REQ-441 más
// su nota RESUELTO ("Cotización → Factura → Guía de Entrega → Despacho", sin depender de ninguna
// Guía previa) contradicen directamente el orden que asume el mockup. Decisión del Arquitecto
// (aprobada por Luis): este batch implementa el modelo Order-based que describen los REQ/RESUELTO
// —la versión de "hitos" múltiples por proyecto con anticipos pre-despacho queda fuera de alcance,
// no está pedida en ningún REQ 436→441—. El tipo de acá refleja el contrato REAL que expone
// `AdminContInvoiceController`/`InvoiceService`, no la forma más rica del mockup.

// Batch 4 (SCRUM-524→528, REQ-447→451) agrega 'anulada' — fundacional, sin escritor real todavía:
// RN4 REQ-449 es explícita en que Facturación NUNCA anula una factura por sí misma, solo una Nota
// de Crédito de tipo "Anulación completa" (batch muy posterior, Notas Crédito y Devoluciones)
// puede originarlo. Ninguna factura real es 'anulada' hoy.
export type EntregaEstado = 'pendiente-facturar' | 'facturada' | 'anulada'
export type CarteraTab = 'cobrable' | 'incobrable'
export type FacturacionView = 'agrupado' | 'plana'

/** Estado de la propuesta de incobrable de una factura — REQ-448. `normal` = sin ninguna
 *  propuesta activa; `pendiente_aprobacion` = Felix/Mark/Gerencia la propuso, esperando la
 *  decisión de Mark; `incobrable` = Mark ya la aprobó (equivalente a `es_incobrable=true`). */
export type CobrabilidadEstado = 'normal' | 'pendiente_aprobacion' | 'incobrable'

export interface InvoiceSummary {
  pendientes_entrega: number
  pendientes_facturar: number
  facturadas_mes: number
  monto_facturado_mes: number
}

/** Una fila de la tabla — una entrega (`Bodega\Models\Order`) facturable, no el proyecto completo. */
export interface InvoiceEntry {
  order_id: number
  order_number: string
  master_client_id: number | null
  cliente: string
  sales_project_id: number
  proyecto: string
  cotizacion_folio: string | null
  monto: number
  estado: EntregaEstado
  numero_factura: string | null
  /** true SOLO cuando Mark ya aprobó la propuesta (REQ-448 RN4) — mientras está pendiente de su
   *  decisión, esto sigue en false y `incobrable_pendiente` es el que vale true. */
  es_incobrable: boolean
  /** Batch 4 (REQ-448) — propuesta de incobrable enviada, esperando aprobar/rechazar de Mark. */
  incobrable_pendiente: boolean
}

/** Fila agrupada por proyecto — ver vista "agrupado" de `GET /admin-contab/invoices`. */
export interface InvoiceGroup {
  sales_project_id: number | null
  proyecto: string | null
  cliente: string | null
  master_client_id: number | null
  entregas: InvoiceEntry[]
}

export interface InvoiceListFilters {
  tab: CarteraTab
  view: FacturacionView
  cliente?: string
  proyecto?: string
  estado?: EntregaEstado
  desde?: string
  hasta?: string
  search?: string
}

/** `GET /admin-contab/invoices` — `total_en_tab` es el denominador real de "Mostrando X de Y"
 *  (RN4 REQ-445): cuenta de la pestaña activa SIN el resto de los filtros. */
export interface InvoiceListResult {
  rows: InvoiceEntry[]
  total_en_tab: number
}

/** Línea de desglose de una factura — Batch 3 (REQ-443), mismo formato que usará la impresión
 *  fiscal de Batch 4 (REQ-449). */
export interface InvoiceLineItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

/** Un resultado por `order_id` — REQ-441 Escenarios 1/2: ok+datos, o ok:false+missing. Batch 3
 *  (REQ-442/443) agrega saldo a favor y el desglose fiscal completo. */
export interface InvoicePreviewResult {
  order_id: number
  ok: boolean
  order_number?: string
  cotizacion_folio?: string | null
  cliente?: string
  monto?: number
  missing?: string[]
  saldo_disponible?: number
  saldo_aplicable?: number
  total_a_pagar?: number
  subtotal?: number
  descuentos?: number
  itbms?: number
  total?: number
  items?: InvoiceLineItem[]
}

/** REQ-442 RN3 — el saldo a favor de un lote de varias entregas solo se aplica a `results[0]`;
 *  `aviso_saldo_solo_primera` indica cuándo hay que avisarlo explícitamente (Escenario 2). */
export interface InvoicePreviewResponse {
  results: InvoicePreviewResult[]
  aviso_saldo_solo_primera: boolean
}

export interface CreateInvoicePayload {
  order_ids: number[]
  aplicar_saldo_favor?: boolean
}

export type InvoiceExportFormat = 'pdf' | 'excel'

export interface CreateInvoiceResult {
  invoices: { order_id: number; numero: string; saldo_aplicado?: number; total_a_pagar?: number }[]
  errors: { order_id: number; missing: string[] }[]
}

// Batch 4 del cuerpo principal (SCRUM-524→528, REQ-447→451) — modal de detalle/trazabilidad,
// cobrabilidad con aprobación de Mark, impresión fiscal, antigüedad de cartera, "Registrar cobro".

/** `GET /admin-contab/invoices/{order_id}/detail` — payload completo del modal de detalle. */
export interface InvoiceDetail {
  order_id: number
  order_number: string
  cliente: string
  /** Necesario para RN3 REQ-451 (preseleccionar el cliente al navegar a Cobros) — no estaba en
   *  el contrato original que le pasé a Backend Dev en el despacho paralelo, lo agrego acá porque
   *  es indispensable para el botón "Registrar cobro"; verificar que el backend también lo agregó. */
  master_client_id: number | null
  monto: number
  saldo_aplicado: number
  total_a_pagar: number
  cotizacion_folio: string | null
  fecha_cotizacion: string | null
  numero_factura: string | null
  fecha_factura: string | null
  estado: EntregaEstado
  es_anulada: boolean
  guia_entrega: { existe: boolean; fecha: string | null }
  cobrabilidad: CobrabilidadEstado
  motivo_incobrable: string | null
  /** Calculado server-side (`current_user_id === primary_approver_user_id`) — el frontend nunca
   *  decide por su cuenta quién es Mark, mismo criterio de fail-closed que el resto de gates
   *  exclusivos de Mark en este módulo. Undefined/false = no mostrar Aprobar/Rechazar. */
  puede_decidir_incobrable?: boolean
  puede_registrar_cobro: boolean
  /** RN1 REQ-449 — bloque de datos de pago del documento fiscal (gap real detectado en Senior
   *  Review: el backend solo exponía "Pago a" en el PDF, faltaban estos 2 campos en el contrato). */
  cuenta_pago: string | null
  responsable: string | null
  subtotal?: number
  descuentos?: number
  itbms?: number
  total?: number
  items?: InvoiceLineItem[]
}

export interface MarkUncollectiblePayload {
  motivo: string
}

export interface UncollectibleDecisionPayload {
  approve: boolean
}

/** `GET /admin-contab/invoices/aging` — REQ-450, 4 rangos fijos (0-30/31-60/61-90/+90 días desde
 *  vencimiento) sobre cartera cobrable únicamente (RN1 — incobrable aprobada queda excluida). */
export interface InvoiceAgingRange {
  desde_dias: number
  hasta_dias: number | null
  cantidad: number
  monto: number
}

export interface InvoiceAgingResult {
  ranges: InvoiceAgingRange[]
}

// Batch Home (SCRUM-503→512), Grupo 4 (SCRUM-511, REQ-434) — "Vencidos y por vencer".
export interface HomeVencidoRow {
  numero: string
  cliente: string
  dias_vencido: number
  monto: number
  fecha_vencimiento: string
}

export interface HomePorVencerRow {
  numero: string
  cliente: string
  dias_para_vencer: number
  monto: number
  fecha_vencimiento: string
}

export interface HomeVencidosPorVencer {
  vencidos: HomeVencidoRow[]
  por_vencer: HomePorVencerRow[]
}

// Batch 5 del cuerpo principal (SCRUM-539→544, REQ-462→467) — Cobros.

export type PaymentMethod =
  | 'transferencia' | 'cheque' | 'efectivo' | 'tarjeta' | 'deposito' | 'yappy'
  | 'link_pago' | 'retencion_impuestos' | 'ajuste_cuenta'

export const PAYMENT_METHODS: PaymentMethod[] = [
  'transferencia', 'cheque', 'efectivo', 'tarjeta', 'deposito', 'yappy',
  'link_pago', 'retencion_impuestos', 'ajuste_cuenta',
]

// REQ-466 RN4 — estos 2 nunca representan dinero entrando a una cuenta bancaria real.
export const PAYMENT_METHODS_SIN_CUENTA_BANCARIA: PaymentMethod[] = ['retencion_impuestos', 'ajuste_cuenta']

export type PaymentEstado = 'confirmado' | 'esperando_confirmacion'

/** `GET /admin-contab/payments/summary` — REQ-463, 4 tarjetas del mes en curso. */
export interface PaymentSummary {
  total_cobrado: number
  cantidad: number
  promedio: number
  metodo_principal: { metodo: PaymentMethod; porcentaje: number } | null
}

/** `GET /admin-contab/payments/clients?search=` — REQ-462, buscador de cliente del formulario. */
export interface PaymentClientOption {
  id: number
  name: string
}

/** `GET /admin-contab/payments/open-invoices?master_client_id=` — REQ-464 RN1. */
export interface OpenInvoice {
  id: number
  numero: string
  monto: number
  saldo_pendiente: number
}

export interface OpenInvoicesResult {
  invoices: OpenInvoice[]
  credit_balance: number
  /** REQ-462 RN2 — presente cuando el formulario llega preseleccionado desde Facturación. */
  master_client_name: string | null
}

/** `POST /admin-contab/payments` — REQ-464/465/466/467/468/469. Enviado como `FormData` cuando
 *  trae `comprobante` (multipart), `JSON` en caso contrario — ver `useRegisterPayment()`. */
export interface CreatePaymentPayload {
  master_client_id: number
  invoice_ids: number[]
  aplicar_saldo_favor?: boolean
  metodo_pago: PaymentMethod
  monto_recibido_estimado: number
  bank_account_id?: number | null
  numero_documento_retencion?: string | null
  comentario_ajuste?: string | null
  /** REQ-470/471 — "Referencia / N° de transacción" del formulario, texto libre opcional. */
  referencia?: string | null
  /** REQ-468 — comprobante de pago (JPG/PNG/PDF, máx. 10MB), opcional. */
  comprobante?: File | null
}

export interface Payment {
  id: number
  numero_recibo: string
  master_client_id: number
  monto_recibido: number
  saldo_favor_aplicado: number
  metodo_pago: PaymentMethod
  referencia: string | null
  bank_account_id: number | null
  numero_documento_retencion: string | null
  comentario_ajuste: string | null
  estado: PaymentEstado
  created_at: string
}

// Batch 6 del cuerpo principal (SCRUM-545→548, REQ-468→471) — comprobante/recibo+estado real/
// historial (filtros+búsqueda)/detalle de un cobro.

export interface PaymentHistorialFilters {
  search?: string
  cliente?: string
  metodo?: PaymentMethod | ''
  estado?: PaymentEstado | ''
  desde?: string
  hasta?: string
}

/** Una fila de `GET /admin-contab/payments` — REQ-470. */
export interface PaymentHistorialRow {
  id: number
  numero_recibo: string
  fecha: string
  cliente: string
  facturas: string[]
  monto_recibido: number
  metodo_pago: PaymentMethod
  estado: PaymentEstado
  referencia: string | null
  registrado_por: string
  tiene_comprobante: boolean
}

/** `total` es el conteo general SIN filtros (RN3 REQ-470 — "Mostrando X de Y cobros"). */
export interface PaymentHistorialResult {
  rows: PaymentHistorialRow[]
  total: number
}

/** Una factura cubierta por un cobro, con el monto que se le aplicó — REQ-471 RN1. */
export interface PaymentDetailFactura {
  invoice_id: number
  numero: string | null
  monto_aplicado: number
}

// Batch 7 del cuerpo principal (SCRUM-549→552, REQ-472→475) — ver comprobante/recibo formal/
// apertura automática (ya cubierta por Batch 5, ver `CobrosPage.tsx`)/confirmación manual.

/** Registro de confirmación manual de un cobro — REQ-475 Escenario 2 (trazabilidad). */
export interface PaymentConfirmation {
  numero_confirmacion: string
  confirmado_por: string | null
  confirmado_at: string
}

/** `GET /admin-contab/payments/{id}` — REQ-471, detalle completo de un cobro. `cliente`/
 *  `metodo_pago_label`/`total_facturas`/`confirmacion` agregados en Batch 7. */
export interface PaymentDetail extends Payment {
  cliente: string | null
  metodo_pago_label: string
  registrado_por: string | null
  bank_account: string | null
  tiene_comprobante: boolean
  /** Total de facturas cubiertas ANTES de aplicar el saldo a favor — REQ-473 RN1. */
  total_facturas: number
  facturas: PaymentDetailFactura[]
  confirmacion: PaymentConfirmation | null
}

/** `GET /admin-contab/payments/{id}/attachment` — REQ-472, comprobante adjunto o `null`. */
export interface PaymentAttachmentDetail {
  url: string
  nombre_archivo: string
  mime_type: string
  uploaded_by: string | null
  created_at: string
}

// Batch 8 — Estado de Cuenta (SCRUM-529→533, REQ-452→456). Solo el encabezado de resultado
// (cliente/proyecto/tarifa/régimen/términos) — tarjeta de saldo, datos de pago y la tabla de
// movimientos son Batch 9 (REQ-457→461), que extiende `AccountStatement` sin romper este contrato.

/** Mismo `PriceType` de VentasDiseno (`public|project|special|partner|premium`), sin importar ese
 *  módulo acá — AdminCont no depende de VentasDiseno en el frontend, solo traduce el string crudo
 *  que ya usa `ventasDiseno:priceType.*` (mismos i18n keys, reusados tal cual). */
export type AccountStatementTarifa = 'public' | 'project' | 'special' | 'partner' | 'premium'

export type RegimenFiscal = 'con_itbms' | 'sin_itbms'

/** `GET /admin-contab/account-statement/clients?search=` — REQ-453, mismo buscador que Cobros. */
export interface AccountStatementClientOption {
  id: number
  name: string
}

/** `GET /admin-contab/account-statement/projects?master_client_id=` — REQ-453 RN1. */
export interface AccountStatementProjectOption {
  id: number
  name: string
}

export interface AccountStatementFilters {
  masterClientId: number
  salesProjectId: number | null
  desde?: string
  hasta?: string
}

/** Una fila de `movimientos` — REQ-460. `tipo` distingue débito (factura) de crédito (cobro; a
 *  futuro también nota de crédito, mismo shape). `saldo` es el saldo CORRIDO (acumulado, RN2),
 *  no el de esta fila aislada. `guia_entrega` es booleano (existencia), no un folio — el sistema
 *  no tiene un número propio para la guía, solo existencia + fecha. */
export interface AccountStatementMovement {
  fecha: string
  tipo: 'factura' | 'cobro'
  numero_factura: string
  cotizacion_folio: string | null
  guia_entrega: boolean
  sales_project_id: number | null
  proyecto: string | null
  debito: number
  credito: number
  saldo: number
}

/** `GET /admin-contab/account-statement?master_client_id=&sales_project_id=&desde=&hasta=` —
 *  REQ-455 (Batch 8) + REQ-457→460 (Batch 9, mismo endpoint, respuesta superset). */
export interface AccountStatement {
  master_client_id: number
  cliente: string
  sales_project_id: number | null
  proyecto: string | null
  tarifa: AccountStatementTarifa | null
  regimen_fiscal: RegimenFiscal
  terminos_pago: string
  // Batch 9 (SCRUM-534→538, REQ-457→461).
  saldo: number
  saldo_a_favor: boolean
  pago_a: string | null
  cuenta_pago: string | null
  responsable: string | null
  /** REQ-459 — null cuando no aplica ninguna condición, o cuando hay filtro de proyecto (RN4). */
  nota_contexto: string | null
  /** REQ-459 RN3 — null cuando hay filtro de proyecto (RN4); si no, cantidad real de proyectos
   *  del cliente (para el aviso "este cliente tiene N proyectos", que el frontend arma con esto). */
  proyectos_count: number | null
  movimientos: AccountStatementMovement[]
}

// Batch 10 — apertura de Notas Crédito y Devoluciones (SCRUM-553→558, REQ-476→481). Construye el
// formulario dinámico completo (Anulación completa + su selección de subtipo/corrección, y el
// bloque de solo lectura de Devolución de mercancía) pero SIN submit real todavía — la factura de
// origen, el excedente, el monto/desglose ITBMS, el comprobante y el botón "Registrar nota" son
// Batch 11 (REQ-482→487). El botón queda deshabilitado a propósito en este batch, no es un bug.

export type NotaCreditoTipo = 'descuento_comercial' | 'anulacion_completa' | 'devolucion_mercancia'
export type NotaCreditoSubtipoAnulacion = 'cancelado' | 'correccion'
export type NotaCreditoMotivoCorreccion = 'itbms' | 'fecha' | 'ambos'

/** `GET /admin-contab/notas-credito/summary` — REQ-477, 5 tarjetas del mes en curso. */
export interface NotaCreditoResumenMes {
  total_acreditado: number
  numero_notas: number
  pendientes_aprobacion_monto: number
  /** Cantidad de notas pendientes de aprobación por superar el umbral (REQ-490). */
  pendientes_aprobacion_cantidad: number
  /** REQ-491 (Batch 12) — devoluciones ya confirmadas por Bodega, pendientes solo de generar la
   *  nota. Cero hasta que esa cola exista. */
  devoluciones_por_generar: number
  nota_promedio: number
  /** REQ-482 RN2/RN3 — umbral configurable ($5,000 por defecto, Configuración Fiscal) a partir del
   *  cual una nota queda pendiente de aprobación de Mark. Viaja acá para que el formulario nunca lo
   *  hardcodee. */
  primary_approval_threshold: number
}

// Batch 11 (SCRUM-559→564, REQ-482→487) — submit real del formulario: factura de origen, monto/
// desglose ITBMS, excedente, avisos, comprobante.

/** `GET /admin-contab/notas-credito/clientes/{masterClient}/facturas` — REQ-483, TODAS las facturas del
 *  cliente (incluidas las ya pagadas, saldo_pendiente 0 — a diferencia de `OpenInvoice`/Cobros, acá
 *  no se filtran). `itbms_rate` es la tasa YA aplicada a esa factura — REQ-485 la usa para el
 *  desglose en tiempo real sin otro round-trip. */
export interface NotaCreditoFacturaOrigen {
  id: number
  numero: string
  monto: number
  saldo_pendiente: number
  itbms_percentage: number
  /** Batch 12 (REQ-489) — id real de la tasa ya aplicada a esta factura, para que "Corrección de
   *  datos" pueda excluirla de las opciones de "tratamiento correcto" (mismo criterio que
   *  `facturaActualRateId` en `RegistrarNotaCreditoModal`). Contrato agregado en este batch — no
   *  estaba en el shape original de Batch 11 (que solo necesitaba el %, no el id). Verificar que
   *  el endpoint `GET .../clientes/{masterClient}/facturas` lo devuelva. */
  itbms_rate_id: number | null
}

export type NotaCreditoResultado = 'aplicado_saldo' | 'devuelto' | 'saldo_favor'

/** `POST /admin-contab/notas-credito` — REQ-482→487. Enviado siempre como `FormData` (puede traer
 *  `comprobante`), mismo criterio que `CreatePaymentPayload`. */
export interface CreateNotaCreditoPayload {
  master_client_id: number
  /** Nombre del cliente — `RegisterCreditNoteRequest` lo exige aparte del id (snapshot, mismo
   *  criterio que el resto de `credit_notes`). */
  cliente: string
  factura_origen_id: number
  tipo: NotaCreditoTipo
  subtipo_anulacion?: NotaCreditoSubtipoAnulacion | null
  mercancia_regresa_bodega?: boolean | null
  /** Ignorado por el backend cuando `tipo=anulacion_completa` (el monto siempre es el total exacto
   *  de la factura de origen) — igual se manda si está disponible, RN4 REQ-484. */
  monto: number
  motivo: string
  /** Solo cuando hay excedente (monto > saldo_pendiente de la factura elegida) — RN2 REQ-484. */
  resultado?: NotaCreditoResultado | null
  /** Solo cuando `resultado=devuelto` — RN2 REQ-484. */
  cuenta_bancaria_salida_id?: number | null
  /** Obligatorio según RN1/RN2 REQ-487 (ver `comprobanteObligatorio` en el componente). */
  comprobante?: File | null
  /** REQ-491 (Batch 12) — presente cuando la nota se registra desde la cola de devoluciones
   *  confirmadas por Bodega (`NotaCreditoDevolucionPrecargada.customer_return_id`), para que el
   *  backend cierre el círculo del lado de Bodega dentro de la misma transacción. */
  devolucion_bodega_id?: number | null
}

export interface NotaCredito {
  id: number
  numero: string
  estado: 'aplicada' | 'pendiente_aprobacion' | 'rechazada'
  monto: number
  subtotal: number
  itbms: number
  resultado: NotaCreditoResultado | null
}

/** `GET /admin-contab/notas-credito/itbms-rates` — REQ-480, catálogo de tasas configuradas en
 *  Configuración Fiscal (`ItbmsRate`, mismo shape), pero por un endpoint DISTINTO al de
 *  `/admin-contab/itbms-rates`: ese es exclusivo de Mark (403 en el GET para cualquier otro rol),
 *  y Felix/Yaneth/Gerencia sí necesitan ver las 3 tasas acá para elegir el "tratamiento correcto"
 *  — contrato a confirmar con Backend Dev, no reusar el endpoint de Mark tal cual. */
export type NotaCreditoItbmsRateOption = Pick<ItbmsRate, 'id' | 'nombre' | 'descripcion' | 'porcentaje' | 'es_base'>

/** Un producto dentro de una devolución ya confirmada por Bodega — REQ-481. */
export interface NotaCreditoDevolucionProducto {
  descripcion: string
  cantidad: number
  monto_unitario: number
}

/** Datos precargados de una devolución confirmada por Bodega (`DEVOLUCION_BODEGA` del modelo de
 *  datos) — REQ-481 RN1-RN5. Batch 12 (REQ-491) conecta el entry point real desde la cola de
 *  Bodega — `customer_return_id` es lo que identifica esa devolución para que
 *  `CreateNotaCreditoPayload.devolucion_bodega_id` la referencie al registrar. */
export interface NotaCreditoDevolucionPrecargada {
  cliente_id: number
  cliente_nombre: string
  factura_origen_id: number
  /** Referencia a Guía de Entrega / Cotización (ej. "HS-3402") — RN de REQ-481. */
  referencia: string
  productos: NotaCreditoDevolucionProducto[]
  persona_devuelve: string
  proyecto: string | null
  /** Referencia al documento firmado de conformidad — RN5. */
  conformidad: string
  /** Batch 11 (REQ-483/484) — la factura de origen viene preseleccionada en este modo (RN3
   *  REQ-483), así que su monto/saldo/tasa de ITBMS viajan acá en vez de pedirse con otro fetch. */
  factura_monto: number
  factura_saldo_pendiente: number
  factura_itbms_percentage: number
  /** REQ-491 (Batch 12) — id de la devolución en `bodega.customer_returns`, viaja como
   *  `devolucion_bodega_id` al registrar para que el backend cierre el círculo del lado de Bodega. */
  customer_return_id: number
}

// Batch 12 del cuerpo principal (SCRUM-565→570, REQ-488→493) — submit real de "Corrección de
// datos" (revisión previa + vista previa de factura nueva + aprobación diferida >$5,000), cola de
// devoluciones confirmadas por Bodega (cierre real de REQ-491), historial+filtros y modal de
// detalle (endpoints/pantalla nuevos de cero — no existía ningún `index`/`show` antes de este
// batch, ver ADR-SCRUM565-570).

/** `POST /admin-contab/notas-credito/correccion/preview` — REQ-488/489. */
export interface PreviewCorreccionPayload {
  master_client_id: number
  factura_origen_id: number
  motivo_correccion: NotaCreditoMotivoCorreccion
  nuevo_tratamiento_itbms_rate_id?: number | null
  nueva_fecha?: string | null
  motivo: string
}

/** `POST /admin-contab/notas-credito/correccion` — mismo body que el preview + comprobante
 *  (multipart, mismo criterio que `CreateNotaCreditoPayload`). */
export interface RegisterCorreccionPayload extends PreviewCorreccionPayload {
  comprobante?: File | null
}

/** Tarjetas de la pantalla de revisión previa (REQ-489) — texto libre server-side, el frontend no
 *  arma ninguno de estos bloques a partir de otros datos, solo los muestra. */
export interface PreviewCorreccionTarjetas {
  factura_origen: Record<string, unknown>
  proyecto: Record<string, unknown>
  cotizacion: Record<string, unknown>
  guia_entrega: Record<string, unknown>
  nota_a_generar: Record<string, unknown>
  motivo: string
  correccion_aplicada: Record<string, unknown>
}

/** Mismo shape que ya devuelve el preview/detalle de Facturación (`items`/`subtotal`/`itbms`/
 *  `total`, ver `InvoiceLineItem`/`FiscalItemsTable`/`FiscalTotalsBlock`) — la vista previa de la
 *  factura nueva de Corrección de datos reusa el mismo renderer, no un formato propio. */
export interface PreviewCorreccionFactura {
  order_number?: string
  cotizacion_folio?: string | null
  cliente?: string
  monto?: number
  subtotal?: number
  descuentos?: number
  itbms?: number
  total?: number
  items?: InvoiceLineItem[]
  cuenta_pago?: string | null
  responsable?: string | null
}

/** `POST /admin-contab/notas-credito/correccion/preview` response — RN1 REQ-489, nada se persiste
 *  todavía en este paso. */
export interface PreviewCorreccionResponse {
  tarjetas: PreviewCorreccionTarjetas
  factura_preview: PreviewCorreccionFactura
  monto: number
  /** `monto > primaryApprovalThreshold()` — RN1 REQ-490. Determina el mensaje de confirmación
   *  ("se generó la factura nueva" vs "queda pendiente de aprobación de Mark, la original sigue
   *  activa"). */
  requiere_aprobacion: boolean
}

export type NotaCreditoHistorialEstado = 'aplicada' | 'pendiente_aprobacion' | 'pendiente_generar_nota' | 'rechazada'

export interface NotaCreditoHistorialFilters {
  search?: string
  cliente?: string
  tipo?: NotaCreditoTipo | ''
  estado?: NotaCreditoHistorialEstado | ''
}

/** Una fila de `GET /admin-contab/notas-credito` — REQ-492. `id`/`tipo` son `null` en las filas
 *  virtuales de la cola de Bodega (REQ-491, `estado = 'pendiente_generar_nota'`) — todavía no
 *  existe ninguna `AdminContCreditNote` para esa devolución. `customer_return_id` viene presente
 *  SOLO en esas filas — el detalle completo para precargar el formulario se pide aparte con
 *  `GET /admin-contab/notas-credito/devoluciones/{customerReturnId}` (`devolucionDetail()`), no
 *  viaja embebido en esta fila (reconciliado con Backend Dev — el contrato original que le pasé
 *  asumía que sí, real es un endpoint propio). Una nota real de "Corrección de datos" tiene
 *  `tipo = 'anulacion_completa'` + `subtipo_anulacion = 'correccion'` — NUNCA `tipo = 'correccion'`,
 *  ese valor no existe en el enum real. */
export interface NotaCreditoHistorialRow {
  id: number | null
  tipo: NotaCreditoTipo | null
  subtipo_anulacion: NotaCreditoSubtipoAnulacion | null
  numero: string | null
  cliente: string
  master_client_id: number
  estado: NotaCreditoHistorialEstado
  monto: number | null
  fecha: string
  factura_origen_numero: string | null
  registrado_por: string | null
  devolucion_bodega_id: number | null
  customer_return_id: number | null
}

/** Sin paginación — mismo criterio que el resto de listados de AdminCont (`InvoiceService::list()`
 *  tampoco pagina). */
export interface NotaCreditoHistorialResult {
  data: NotaCreditoHistorialRow[]
}

/** `GET /admin-contab/notas-credito/devoluciones/{customerReturnId}` — REQ-491, precarga del
 *  formulario al hacer clic en una fila de la cola. Shape real del backend (`CreditNoteService::
 *  devolucionDetail()`) — más angosto que lo que `RegistrarNotaCreditoModal` espera desde Batch 10
 *  (`NotaCreditoDevolucionPrecargada`): no trae `persona_devuelve`/`proyecto`/`conformidad` ni el
 *  precio unitario de cada producto (`CustomerReturnLine` no lo trackea). `NotasCreditoPage` mapea
 *  esto + un fetch a `facturas()` (para monto/saldo/% ITBMS de la factura) a
 *  `NotaCreditoDevolucionPrecargada` con lo disponible — gap real, documentado para Pre-QA/Senior
 *  Review, no se inventa ningún dato que el backend no tiene. */
export interface NotaCreditoDevolucionDetail {
  customer_return_id: number
  return_number: string
  master_client_id: number
  cliente: string
  factura_origen_id: number
  factura_origen_numero: string
  productos: {
    reference: string | null
    description: string
    // SCRUM-786 — null para devoluciones de pedidos creados antes del backfill de precio; el
    // formulario cae a 0 en ese caso (ver NotasCreditoPage.tsx).
    unit_price: number | null
    qty_received: number
    reason: string | null
    reason_detail: string | null
  }[]
}

/** Un paso del timeline de `CustomerReturnService::historyPayload()` (Bodega) — `created`,
 *  `signed_document_uploaded`, `received`, `credit_note_notified`, `finalized`, `rejected`, según
 *  cuáles apliquen a esa devolución. */
export interface NotaCreditoBodegaTrazabilidadStep {
  step: string
  label: string
  at: string
  by?: string | null
  [key: string]: unknown
}

/** `bodega_trazabilidad` de `NotaCreditoDetalle` — `historial` es el payload de
 *  `CustomerReturnService::historyPayload()` del lado de Bodega, reusado tal cual. */
export interface NotaCreditoBodegaTrazabilidad {
  return_number: string
  historial: NotaCreditoBodegaTrazabilidadStep[]
}

/** `GET /admin-contab/notas-credito/{id}` — REQ-493, detalle de una nota REAL (nunca se llama con
 *  una fila virtual de la cola, `id: null`). Shape reconciliado contra `CreditNoteService::show()`
 *  real — nombres de campo distintos a los que asumí en el contrato original
 *  (`aprobado_por`/`fecha_decision`, no `aprobado_rechazado_por`/`aprobado_rechazado_at`); no
 *  incluye `cuenta_bancaria_salida` (el backend no lo expone en el detalle todavía). */
export interface NotaCreditoDetalle {
  id: number
  numero: string
  tipo: NotaCreditoTipo
  subtipo_anulacion: NotaCreditoSubtipoAnulacion | null
  cliente: string
  master_client_id: number
  monto: number
  subtotal: number
  itbms: number
  estado: NotaCreditoHistorialEstado
  resultado: NotaCreditoResultado | null
  motivo: string
  motivo_rechazo: string | null
  tiene_comprobante: boolean
  fecha: string
  registrado_por: string | null
  aprobado_por: string | null
  fecha_decision: string | null
  factura_origen_id: number
  factura_origen_numero: string | null
  /** Batch 13 (REQ-497) — id de la orden/venta que espera `invoices.downloadPdf()` para ver la
   *  factura completa. Distinto de `factura_origen_id` (PK de `AdminContInvoice`) — ese endpoint
   *  reusado de Facturación identifica la factura por su `order_id`, no por su propio id. `null`
   *  si la factura de origen no tiene una orden asociada. */
  factura_origen_order_id: number | null
  /** Presente solo en notas de "Corrección de datos" (`subtipo_anulacion = 'correccion'`). */
  factura_nueva_numero: string | null
  /** Batch 13 (REQ-497) — mismo criterio que `factura_origen_order_id`, para la factura nueva
   *  generada por una Corrección de datos ya aprobada. */
  factura_nueva_order_id: number | null
  motivo_correccion: NotaCreditoMotivoCorreccion | null
  nuevo_tratamiento_itbms: { id: number; nombre: string; porcentaje: number } | null
  nueva_fecha_factura: string | null
  /** RN4 REQ-493 — calculado server-side, el frontend nunca decide por su cuenta si mostrar
   *  Aprobar/Rechazar. */
  puede_aprobar_rechazar: boolean
  devolucion_bodega_id: number | null
  /** `null` cuando `devolucion_bodega_id` es null (RN2 REQ-493 — solo aplica a Devolución de
   *  mercancía). */
  bodega_trazabilidad: NotaCreditoBodegaTrazabilidad | null
  /** Batch 13 (SCRUM-573, REQ-496) — nombre de la cuenta de salida cuando `resultado ===
   *  'devuelto'`. `null` en cualquier otro caso (el backend ya lo agregó a `show()` en este
   *  mismo batch — el i18n de `detalle.cuentaBancariaSalida` venía sin campo que lo alimentara
   *  desde Batch 12). */
  cuenta_bancaria_salida: string | null
}

/** `PUT /admin-contab/notas-credito/{id}/decision` — REQ-494, exclusivo Mark (`primary_approver_only`).
 *  `motivo_rechazo` obligatorio cuando `approve = false` (RN4), ignorado si `approve = true`. */
export interface NotaCreditoDecisionPayload {
  approve: boolean
  motivo_rechazo?: string
}

/** `GET /admin-contab/notas-credito/{id}/comprobante` — REQ-495. Mismo shape conceptual que
 *  `PaymentAttachmentDetail` (Cobros, Batch 7), pero envuelto en `tiene_comprobante` en vez de
 *  responder `null` — RN2 exige un mensaje explícito cuando no hay comprobante, no una respuesta
 *  vacía silenciosa. */
export interface NotaCreditoComprobanteDetail {
  tiene_comprobante: boolean
  url: string | null
  mime_type: string | null
  subido_por: string | null
  fecha: string | null
}

// Batch 14 del cuerpo principal (SCRUM-575→579, REQ-498→502) — Comisiones Internas. Ver
// ADR-SCRUM575-579-batch14-comisiones-internas.md (docs/adr en atlanticerp-backend). Deliberadamente
// SIN relación de código con `CommissionCohort`/`CommissionsController` de Ventas&Diseño (REQ-073,
// `types/ventasDiseno.ts`) — coexisten a propósito, decisión de Luis, ver §1 del ADR.

/** `TRAMO_COMISION_INTERNA` — solo lectura desde esta pantalla salvo `admin_contab.edit` (CRUD,
 *  agregado en este mismo batch aunque no estaba en el mockup — regla dura de no hardcodear
 *  umbrales de negocio). `monto_maximo` nulo únicamente en el último tramo. */
export interface CommissionTier {
  id: number
  monto_minimo: number
  monto_maximo: number | null
  porcentaje: number
  orden: number
}

export type CreateCommissionTierPayload = Omit<CommissionTier, 'id'>

/** Estado calculado server-side (REQ-501, RN1-RN5) — nunca editable a mano. */
export type CommissionOrderEstado = 'pendiente_cobro' | 'por_pagar' | 'pagado'

export interface CommissionOrder {
  id: number
  cliente: string
  numero_pedido: string
  fecha_pedido: string
  numero_factura: string | null
  fecha_factura: string | null
  fecha_cobro_completo: string | null
  total_pedido: number
  total_facturado: number | null
  total_cobrado: number
  /** `true` cuando `0 < total_cobrado < total_facturado` — RN2 REQ-501, se muestra distinto en la UI. */
  es_abono_parcial: boolean
  estado: CommissionOrderEstado
  monto_comision: number
  /** `true` cuando el pedido sigue `pendiente_cobro` — el monto de comisión es una proyección, no
   *  un compromiso (REQ-499, tarjeta "Pendiente de cobro" dice "estimado"). */
  es_estimado: boolean
  // Batch 15 (SCRUM-580→584, REQ-503/506) — ver ADR-SCRUM580-584-batch15-comisiones-internas.md.
  /** Suma de notas de crédito en estado `aplicada` sobre la factura de este pedido — ya restada
   *  de `monto_comision` server-side (REQ-503 RN1), acá solo para mostrarla ("-$200 (NC-0071)"). */
  total_nota_credito: number
  /** Referencia(s) de la(s) nota(s) de crédito aplicada(s), ej. "NC-0071" — `null` si `total_nota_credito` es 0. */
  nota_credito_ref: string | null
  /** Nombres de los otros responsables del mismo proyecto compartido — vacío si no es compartido (REQ-506). */
  compartido_con: string[]
  /** Monto total del proyecto ANTES de dividir entre responsables — `null` si no es compartido.
   *  `total_pedido` ya viene dividido en partes iguales (RN1/RN2 REQ-506), este campo es solo
   *  informativo para el badge "↔ Compartido con [...] · $X total del proyecto" (RN3). */
  total_pedido_completo: number | null
}

export interface CommissionVendorMonthGroup {
  mes: string // 'YYYY-MM'
  porcentaje: number
  porcentaje_fijo: boolean
  /** `true` solo cuando `mes !== filtro.mes` — un grupo de un mes ya cerrado que arrastra pedidos
   *  sin cobrar todavía (REQ-499 RN2 / REQ-504, agregación ya incluida en este batch, la UI
   *  agrupada visual se difiere a Batch 15). */
  arrastrado: boolean
  pedidos: CommissionOrder[]
}

export interface CommissionVendorSummary {
  vendedor_id: number
  vendedor_nombre: string
  /** Total de pedidos NUEVOS del mes filtrado (RN1 REQ-499) — no incluye arrastrados. */
  total_pedidos_mes: number
  porcentaje: number
  porcentaje_fijo: boolean
  pagada: number
  por_pagar: number
  pendiente_cobro: number
  total_nota_credito: number
  groups: CommissionVendorMonthGroup[]
}

export interface CommissionInternalSummary {
  mes: string // 'YYYY-MM' filtrado
  mes_cerrado: boolean
  total_pedidos_mes: number
  vendedores_con_pedidos_mes: number
  ya_pagada: number
  por_pagar: number
  pendiente_cobro: number
  /** Independiente del mes filtrado — RN3 REQ-499. */
  banner_comisiones_count: number
  banner_comisiones_total: number
  vendedores: CommissionVendorSummary[]
  /** Calculado server-side (`current_user_id === primary_approver_user_id`) — mismo criterio que
   *  `puede_decidir_incobrable` en Facturación, el frontend nunca decide por su cuenta quién es
   *  Mark. Gatea los botones editar/eliminar/agregar tramo del modal "Tabla de comisión
   *  escalonada" — el CRUD real (`POST/PUT/DELETE .../tiers`) está gateado por `primary_approver_only` en el
   *  backend sin importar lo que muestre la UI. */
  puede_editar_tramos: boolean
}

export interface CommissionInternalFilters {
  mes: string
  vendedor_id?: number
}

/** Meses con al menos un pedido — acota la navegación de flechas (RN2 REQ-500). */
export interface CommissionMonthOption {
  mes: string
  label: string
}

export interface CommissionVendorOption {
  id: number
  nombre: string
}

export type CommissionExportFormat = 'pdf' | 'excel'

// Batch 15 (SCRUM-580→584, REQ-507) — estado de cuenta de comisiones por vendedor, ver
// ADR-SCRUM580-584-batch15-comisiones-internas.md §5. Reusa la forma de `CommissionOrder` para
// cada pedido, agrupado por mes de cierre igual que `CommissionVendorMonthGroup`, pero sin
// `arrastrado` (el documento ya filtra según RN1/RN2, no hace falta distinguir visualmente).
export interface CommissionAccountStatementGroup {
  mes: string // 'YYYY-MM'
  porcentaje: number
  porcentaje_fijo: boolean
  pedidos: CommissionOrder[]
}

export interface CommissionAccountStatement {
  vendedor_id: number
  vendedor_nombre: string
  mes: string // 'YYYY-MM' consultado
  /** Determina el modo del documento — RN1 (cerrado, solo lo pagado ese mes) vs RN2 (en curso,
   *  3 totales + arrastre). */
  mes_cerrado: boolean
  porcentaje: number
  porcentaje_fijo: boolean
  total_pedidos_mes: number
  /** Suma de NC de todos los pedidos mostrados — línea "Descuento total por notas crédito" (RN3),
   *  ya expresada en dinero de comisión (NC × %), no el monto bruto de la nota. */
  descuento_nota_credito: number
  pagada: number
  por_pagar: number
  pendiente_cobro: number
  groups: CommissionAccountStatementGroup[]
  emitido: string // fecha ISO de generación del documento
}

// Batch 16 (SCRUM-585→590, REQ-508→513) — Comisiones Externas (arquitectos). Ver
// ADR-SCRUM585-590-batch16-comisiones-externas.md (docs/adr en atlanticerp-backend). Deliberadamente
// independiente de los tipos de Comisiones Internas de arriba — 10% fijo (sin tiers), sin
// snapshot de mes cerrado, "Pagada" siempre manual (Batch 17), impuesto según régimen fiscal en
// vez de notas de crédito.

export type ArchitectCommissionRegimen = 'exento' | 'con_itbms' | 'retencion_50'

export type ArchitectCommissionEstado = 'aun_no_generada' | 'pendiente_factura_arquitecto' | 'pagada'

export interface ArchitectCommissionProject {
  pipeline_card_id: number
  numero_pedido: string | null
  cliente: string | null
  fecha_pedido: string | null // 'YYYY-MM-DD'
  monto_proyecto: number
  total_facturado: number | null
  total_cobrado: number
  /** Batch 17 (REQ-516) — % vigente de este proyecto puntual: el aprobado por Mark si existe,
   *  si no el default global (`AdminContFiscalSettings.comision_externa_default_percent`). */
  porcentaje: number
  comision: number
  /** `null` cuando el arquitecto no tiene régimen fiscal configurado (RN6 REQ-511) — nunca se
   *  asume "Exento" por defecto, la UI debe mostrar "—", no $0. */
  impuesto: number | null
  total: number | null
  estado: ArchitectCommissionEstado
  cuenta_cobro: { nombre_archivo: string; uploaded_at: string } | null
  /** Batch 17 (REQ-514) — solo relevante para régimen "Retención del 50%"; el frontend decide si
   *  mostrar la zona de carga según `regimen_fiscal` de la fila padre. */
  comprobante_retencion: { nombre_archivo: string; uploaded_at: string } | null
  fecha_pago: string | null // 'YYYY-MM-DD'
  /** Batch 17 (REQ-516) — % propuesto por Felix/Yaneth/Mark/Gerencia, pendiente de la decisión de
   *  Mark. `null` si no hay ninguna propuesta activa. */
  porcentaje_pendiente: number | null
  porcentaje_pendiente_motivo: string | null
  /** Batch 17 (REQ-517) — cuenta de pago resuelta (explícita del proyecto o el default "Banco
   *  General — Cuenta Corriente"). `null` solo si ni el proyecto ni el default existen todavía. */
  bank_account: { id: number; label: string } | null
}

export interface ArchitectCommissionRow {
  architect_id: number
  nombre: string
  empresa: string | null
  ruc: string | null
  regimen_fiscal: ArchitectCommissionRegimen | null
  /** `false` → fila con aviso "Completar datos fiscales" (RN4 REQ-510); los montos de sus
   *  proyectos (salvo "Aún no generada") no se pueden calcular. */
  datos_fiscales_completos: boolean
  /** Desglose de la fila (mockup del ticket) — pagada + pendiente = generada, acotado a los
   *  proyectos ya filtrados de este arquitecto (no a su universo completo). */
  generada: number
  pagada: number
  pendiente: number
  proyectos: ArchitectCommissionProject[]
}

export interface CommissionExternalSummary {
  comision_generada: number
  pagada_total: number
  pagado_este_mes: number
  pendiente_factura: number
  aun_no_generada: number
  /** Meses con al menos un proyecto, más reciente primero (RN de REQ-509). */
  meses_disponibles: string[]
  arquitectos: ArchitectCommissionRow[]
  /** Batch 17 (REQ-516 RN4) — calculado server-side (`current_user_id === primary_approver_user_id`),
   *  mismo criterio que `puede_editar_tramos`/`puede_decidir_incobrable` en el resto del módulo:
   *  el frontend nunca decide por su cuenta quién es Mark. Gatea Aprobar/Rechazar en el modal de
   *  detalle — el endpoint real (`percent/decide`) está gateado por `primary_approver_only` de todos modos. */
  puede_decidir_porcentaje: boolean
}

export interface CommissionExternalFilters {
  search?: string
  mes?: string
  architect_id?: number
  estado?: ArchitectCommissionEstado
}

export interface ArchitectOption {
  id: number
  nombre: string
}

export interface ArchitectFiscalProfilePayload {
  empresa: string
  ruc: string
  regimen_fiscal: ArchitectCommissionRegimen
}

// Batch 17 (SCRUM-591→596, REQ-514→519) — comprobante de retención, "Marcar como pagado", % de
// comisión por proyecto (propuesta + aprobación de Mark), cuenta de pago editable, recordatorio
// por correo, y el modal de detalle por proyecto que consolida todo lo de arriba.

export interface BankAccountOption {
  id: number
  label: string
}

export interface ProposePercentPayload {
  porcentaje: number
  motivo: string
}

export interface DecidePercentPayload {
  approve: boolean
  motivo_rechazo?: string
}

export interface UpdateCuentaPagoPayload {
  bank_account_id: number | null
}

// Batch 18 (SCRUM-597→601, REQ-520→524) — Arqueo / Flujo de Caja, parte 1. Ver
// ADR-SCRUM597-601-batch18-arqueo-caja.md (atlanticerp-backend) para el contrato JSON completo.

export type CashPositionWindowDays = 0 | 30 | 90

export interface CashPositionHeader {
  saldo_disponible_hoy: number
  saldo_bancos: number
  saldo_caja_menuda: number
}

export type CashFlowVencimiento = 'atrasado' | 'proximo' | null

export interface CashFlowProjectedEntrada {
  nombre: string
  referencia: string
  monto: number
  dias: number | null
  vencimiento: CashFlowVencimiento
}

export type CashFlowSalidaTipo = 'comision_interna' | 'comision_externa' | 'nota_credito'

export interface CashFlowProjectedSalida {
  nombre: string
  referencia: string
  monto: number
  dias: number | null
  vencimiento: CashFlowVencimiento
  tipo: CashFlowSalidaTipo
}

export interface CashPositionProjected {
  window_days: CashPositionWindowDays
  entradas: CashFlowProjectedEntrada[]
  salidas: CashFlowProjectedSalida[]
  total_entradas: number
  total_salidas: number
  neto: number
}

export type BankMovementOrigen = 'cobro' | 'devolucion' | 'comision'

export interface CashFlowRealMovimiento {
  fecha: string
  concepto: string
  origen: BankMovementOrigen
  entrada: number
  salida: number
  saldo_acumulado: number
}

export interface CashPositionReal {
  window_days: 30 | 90
  saldo_actual: number
  movimientos: CashFlowRealMovimiento[]
}

export type DailyCashCountMovementType = 'payment' | 'credit_note'

export interface DailyCashCountCobro {
  movement_type: 'payment'
  movement_id: number
  concepto: string
  metodo_pago: PaymentMethod
  monto: number
  observacion: string | null
}

export interface DailyCashCountNotaCredito {
  movement_type: 'credit_note'
  movement_id: number
  concepto: string
  monto: number
  observacion: string | null
}

export interface UpdateDailyCashCountEntryPayload {
  movement_type: DailyCashCountMovementType
  movement_id: number
  observacion: string | null
}

export type CashFlowExportView = 'proyectado' | 'real'

// Batch 19 (SCRUM-602→606, REQ-525→529) — Arqueo / Flujo de Caja, parte 2. Ver
// ADR-SCRUM602-606-batch19-arqueo-caja-parte2.md (atlanticerp-backend) para el contrato JSON completo.

export type DailyCashCountEstado = 'abierto' | 'pendiente_aprobacion' | 'aprobado'

/** Constancia de retención — `payment_retention_attachments`, RN4 REQ-525: se puede subir/reemplazar
 *  incluso sobre un pago de un arqueo ya cerrado. */
export interface DailyCashCountRetencionConstancia {
  nombre_archivo: string
  url: string
  uploaded_at: string
}

export interface DailyCashCountRetencion {
  payment_id: number
  cliente: string
  referencia: string
  /** = `AdminContPayment.numero_documento_retencion` (ver ADR §7) — texto libre capturado al
   *  registrar el cobro, no un campo nuevo. */
  motivo: string
  monto: number
  constancia: DailyCashCountRetencionConstancia | null
}

/** `GET /cash-position/daily-count` (arqueo ACTIVO) y `GET /cash-position/history/{id}` (detalle
 *  de uno cerrado) devuelven el mismo shape — ver ADR §2/§5. `es_atrasado`/`fecha_real_hoy` solo
 *  tienen sentido en el arqueo activo (REQ-527); en el detalle de un arqueo del historial vienen
 *  `es_atrasado: false` (ya no aplica, es un registro fijo del pasado). */
export interface DailyCashCount {
  id: number
  numero: number | null
  estado: DailyCashCountEstado
  fecha: string
  es_atrasado: boolean
  fecha_real_hoy: string
  cobros: DailyCashCountCobro[]
  notas_credito: DailyCashCountNotaCredito[]
  retenciones: DailyCashCountRetencion[]
  total_cobrado: number
  total_notas_credito: number
  total_neto: number
  observacion_general: string | null
  cerrado_por: string | null
  cerrado_at: string | null
  aprobado_por: string | null
  aprobado_at: string | null
  /** Calculado server-side (`current_user_id === primary_approver_user_id`), mismo criterio que
   *  `puede_decidir_incobrable`/`puede_editar_tramos` en el resto del módulo — el frontend nunca
   *  decide por su cuenta quién es Mark. NO estaba en el contrato original del ADR (§ Contrato
   *  JSON exacto); se agrega acá por consistencia con el patrón ya establecido en todo el resto de
   *  AdminCont — verificar con Backend Dev que el endpoint lo agregue. Ausente/`false` = no
   *  mostrar "Aprobar". */
  puede_aprobar?: boolean
  /** Solo presente en el arqueo ACTIVO (`estado: 'abierto'`) — preview de lo que `numero`
   *  pasará a valer al cerrar (QA SCRUM-603, 2026-08-29 RN1). */
  numero_preview?: number
}

/** Una fila de `GET /cash-position/history`. */
export interface DailyCashCountHistoryRow {
  id: number
  numero: number | null
  fecha: string
  total_neto: number
  estado: DailyCashCountEstado
  aprobado_por: string | null
  aprobado_at: string | null
  realizado_por: string | null
  /** QA SCRUM-603 (2026-08-29 RN4) — hora de cierre junto a `realizado_por`. */
  cerrado_at: string | null
}

export interface DailyCashCountHistoryResult {
  data: DailyCashCountHistoryRow[]
  meta: { current_page: number; last_page: number }
  pendientes_aprobacion: number
}

export interface UploadRetentionAttachmentResult {
  nombre_archivo: string
  url: string
  uploaded_at: string
}

// Batch 20 (SCRUM-612→617, REQ-535→540) — Caja Chica. Batch 21 (rechazo/reapertura de líneas) no
// está implementado todavía — `estado` de línea puede en teoría llegar como 'rechazado_temporal'/
// 'reabierto' (la columna ya existe en backend), pero ningún flujo genera esos valores aún; hoy
// toda línea nueva llega como 'pendiente'.
export type PettyCashFormaPago = 'transferencia' | 'efectivo' | 'cheque' | 'yappy'

export const PETTY_CASH_FORMAS_PAGO: PettyCashFormaPago[] = ['transferencia', 'efectivo', 'cheque', 'yappy']

// 'rechazado_permanente' — línea con intentos_rechazo >= 2 (backend, fix Senior Review Batch 21:
// `estado()` caía mal a 'pendiente' para este caso). No tiene lugar propio en la UI todavía (las
// líneas en "Rechazados" ya se identifican por estar en esa pestaña, no por este valor) — el tipo
// queda completo igual, para no mentir el shape real que devuelve el backend.
export type PettyCashEstadoLinea = 'pendiente' | 'rechazado_temporal' | 'reabierto' | 'rechazado_permanente'
// Batch 21 (SCRUM-618→623) — 'rechazado' = reporte rechazado completo/disuelto (RN3/RN4 REQ-541),
// la fila se conserva por trazabilidad de folio, nunca vuelve a aparecer como pendiente_aprobacion.
export type PettyCashEstadoReporte = 'pendiente_aprobacion' | 'finalizado' | 'rechazado'

export interface PettyCashSummary {
  pendientes_count: number
  reportes_count: number
  reportes_sin_aprobar_count: number
  rechazados_count: number
  pendientes_total: number
}

export interface PettyCashAttachment {
  id: number
  nombre_archivo: string
  mime_type: string
}

export interface PettyCashExpenseLine {
  id: number
  fecha: string
  proveedor: string
  descripcion: string
  monto_bruto: number
  itbms: number
  total: number
  estado: PettyCashEstadoLinea
  intentos_rechazo: number
  attachments: PettyCashAttachment[]
}

// Batch 21 (SCRUM-618→623) — REQ-545, modal unificado de detalle de línea. `ubicacion` decide qué
// acciones tienen sentido; los flags `puede_*` son calculados server-side (mismo criterio que
// `puede_aprobar` de PettyCashReportDetail) — el frontend nunca decide por su cuenta quién es Mark
// ni en qué estado está la línea.
export type PettyCashUbicacionLinea = 'pendientes' | 'reporte' | 'rechazados'

export interface PettyCashHistorialEntry {
  accion: 'rechazo' | 'reapertura'
  motivo: string
  fecha: string
  actor_nombre: string
}

export interface PettyCashExpenseDetail {
  id: number
  fecha: string
  solicitante_id: number
  solicitante_nombre: string
  proveedor: string
  descripcion: string
  monto_bruto: number
  itbms: number
  total: number
  estado: PettyCashEstadoLinea
  intentos_rechazo: number
  ubicacion: PettyCashUbicacionLinea
  reporte_numero: string | null
  reporte_estado: PettyCashEstadoReporte | null
  editable: boolean
  puede_agregar_soporte: boolean
  puede_rechazar: boolean
  puede_reabrir: boolean
  attachments: PettyCashAttachment[]
  historial: PettyCashHistorialEntry[]
}

// Respuesta angosta a propósito (RN5 REQ-541/542) — el rechazo de una línea individual se dispara
// desde el detalle de un REPORTE, no desde el detalle de la línea, así que lo que el frontend
// necesita invalidar es el reporte/las listas, no un objeto de línea. Nunca usar setQueryData con
// esto (mismo criterio que PettyCashApproveResponse, ver feedback_tanstack_query_setquerydata_
// narrow_mutation_response).
export interface RejectPettyCashExpenseResponse {
  destino: 'pendientes' | 'permanente'
  reporte_disuelto: boolean
}

export interface RejectPettyCashReportResponse {
  a_pendientes: number
  a_rechazados: number
}

export interface UpdatePettyCashExpensePayload {
  fecha: string
  proveedor: string
  descripcion: string
  monto_bruto: string
  itbms: string
}

// REQ-543 — GET /rejected devuelve líneas sueltas (no agrupadas por solicitante como Pendientes),
// así que necesita el nombre del solicitante embebido en la propia línea.
export interface PettyCashRejectedLine extends PettyCashExpenseLine {
  solicitante_nombre: string
}

export interface PettyCashGrupo {
  solicitante_id: number
  solicitante_nombre: string
  subtotal: number
  lineas: PettyCashExpenseLine[]
}

export interface PettyCashPendingResult {
  grupos: PettyCashGrupo[]
  total_general: number
}

/** Borrador de línea del formulario "Nuevo gasto" — `monto_bruto`/`itbms` quedan como string
 *  mientras se edita (RN1: ITBMS debe escribirse explícito, nunca queda vacío ni default a 0). */
export interface PettyCashNewExpenseLine {
  fecha: string
  solicitante_id: number | null
  proveedor: string
  descripcion: string
  monto_bruto: string
  itbms: string
  foto: File | null
}

export interface PettyCashReportListItem {
  numero: string
  fecha_creacion: string
  total: number
  estado: PettyCashEstadoReporte
  forma_pago: PettyCashFormaPago
  realizado_por_nombre: string
}

export interface PettyCashReportDetail {
  numero: string
  estado: PettyCashEstadoReporte
  forma_pago: PettyCashFormaPago
  fecha_creacion: string
  realizado_por_nombre: string
  aprobado_por_nombre: string | null
  fecha_aprobacion: string | null
  grupos: PettyCashGrupo[]
  total_general: number
  /** Calculado server-side (actor === primary_approver_user_id), mismo criterio que
   *  `DailyCashCount.puede_aprobar` — el frontend nunca decide por su cuenta quién es Mark.
   *  Ausente/`false` = no mostrar "Aprobar reporte". */
  puede_aprobar?: boolean
}

/** Shape real de PUT /petty-cash/reports/{numero}/approve — a propósito angosto, distinto de
 *  PettyCashReportDetail (ver hallazgo Pre-QA Batch 20, SCRUM-617: el hook ya no asume que esta
 *  respuesta trae `grupos`/`total_general`). */
export interface PettyCashApproveResponse {
  numero: string
  estado: PettyCashEstadoReporte
}

export interface CreatePettyCashReportPayload {
  expense_ids: number[]
  forma_pago: PettyCashFormaPago
}

// Batch 22 (SCRUM-643→647, REQ-566→570) — home de Reportes. `ReportsPeriodo` es el selector de
// encabezado (RN1 REQ-566); solo Ventas y Arqueo de Caja lo consumen — Comisión Felix y Cartera
// nunca reciben período (RN4 REQ-567/RN3 REQ-568).
export type ReportsPeriodo = 'hoy' | '3m' | '6m' | 'anio'

export interface ReportsCarteraCommissionTier {
  monto_minimo: number
  monto_maximo: number | null
  porcentaje: number
  orden: number
  es_actual: boolean
}

export interface ReportsFelixCommission {
  cobrado_mes: number
  rango_actual: string
  porcentaje: number
  comision: number
  tiers: ReportsCarteraCommissionTier[]
}

export interface ReportsCarteraAgingRange {
  desde_dias: number
  hasta_dias: number | null
  cantidad: number
  monto: number
}

export interface ReportsCartera {
  aging: { ranges: ReportsCarteraAgingRange[] }
  cobrado_90: { cobrado_mes: number; pendiente: number }
}

export type ReportsVentas =
  | { periodo: 'hoy'; tipo: 'hoy'; hoy: number; promedio_diario_mes_anterior: number }
  | { periodo: string; tipo: 'meses'; meses: { mes: string; anio: number; total: number }[] }

export interface ReportsFlujoCaja {
  saldo_disponible_hoy: number
  saldo_proyectado_30_dias: number
  periodo: string
  tipo: 'hoy' | 'meses'
  hoy?: { entradas: number; salidas: number; neto: number }
  meses?: { mes: string; anio: number; entradas: number; salidas: number; neto: number }[]
}

/** CRUD de tramos de comisión de cartera (uso admin futuro, sin pantalla propia en este batch —
 *  decisión confirmada con Luis, regla dura de "nunca hardcodear umbrales de negocio"). */
export interface CarteraCommissionTier {
  id: number
  monto_minimo: number
  monto_maximo: number | null
  porcentaje: number
  orden: number
}

export interface CreateCarteraCommissionTierPayload {
  monto_minimo: number
  monto_maximo: number | null
  porcentaje: number
  orden: number
}

// Batch 23 (SCRUM-648/649, REQ-571/572) — 2 tarjetas más en la misma grilla de Reportes.
// Comisiones SÍ depende del selector de período (a diferencia de Felix/Cartera del Batch 22);
// Notas de Crédito nunca depende de él (mismo criterio que Felix/Cartera).
export type ReportsComisiones =
  | { periodo: 'hoy'; tipo: 'hoy'; hoy: { internas: number; externas: number } }
  | { periodo: string; tipo: 'meses'; meses: { mes: string; anio: number; internas: number; externas: number }[] }

export interface ReportsNotasCreditoMotivo {
  motivo: string
  monto: number
}

export interface ReportsNotasCredito {
  motivos: ReportsNotasCreditoMotivo[]
}

// Batch 23 Grupo 2 (SCRUM-651→660, REQ-574→583) — "Reporte mensual por cliente" (4M1, agrupado
// por día) y "Mensual por cliente — acumulado" (4M2, agrupado por año-mes). Mismo shape de
// respuesta para ambas pantallas — `fecha` solo aplica a 4M1, `anio`/`mes` solo a 4M2.
export interface ClientCollectionRow {
  fecha?: string
  anio?: number
  mes?: string
  num: number
  importe: number
  media: number
  transferencia: number
  cheque: number
  efectivo: number
  yappy: number
  otros: number
  total_caja: number
}

export interface ClientCollectionPendiente {
  fecha: string
  factura: string
  proyecto: string
  monto: number
}

export interface ClientCollectionResumen {
  registros: number
  total_facturado: number
  total_cobrado: number
  total_pendiente: number
}

export type ClientCollectionReport =
  | { estado: 'sin_cliente' }
  | { estado: 'ok'; resumen: ClientCollectionResumen; filas: ClientCollectionRow[]; totales: ClientCollectionRow; pendientes: ClientCollectionPendiente[] }

export interface ClientCollectionReportParams {
  masterClientId: number | 'todos'
  desde?: string
  hasta?: string
}

// Batch 23 Grupo 3 (SCRUM-661→664, REQ-584→587) — "Libro de facturas" (4M3). RN4: `motivo` solo
// aplica a notas de crédito, `null` en facturas. RN2/RN3: notas de crédito ya vienen con
// base_imponible/itbms/total NEGATIVOS y con el % real de impuesto de ese documento — nunca
// recalcular el signo ni el % en el frontend.
export interface InvoiceBookDocument {
  fecha: string
  ruc: string
  cliente: string
  tipo: 'Factura' | 'Nota de Crédito'
  motivo: string | null
  documento: string
  base_imponible: number
  porcentaje: number
  itbms: number
  total: number
}

export interface InvoiceBookResumen {
  facturas: number
  notas_credito: number
  base_imponible: number
  itbms: number
  total: number
}

export interface InvoiceBookReport {
  resumen: InvoiceBookResumen
  documentos: InvoiceBookDocument[]
}

export type InvoiceBookTipo = 'factura' | 'nota_credito'

export interface InvoiceBookReportParams {
  desde?: string
  hasta?: string
  tipo?: InvoiceBookTipo
}

// Batch 23 Grupo 3 (SCRUM-665→669, REQ-588→592) — "Ventas por medio de pago" (4M4). 9 columnas
// reales de método de pago (decisión confirmada con Luis — el mockup real muestra 7 porque quedó
// desactualizado, `AdminContPayment::METODOS` ya tiene 9).
export interface PaymentMethodSalesRow {
  fecha: string
  cliente: string
  documento: string
  base_imponible: number
  itbms: number
  total: number
  transferencia: number
  cheque: number
  efectivo: number
  tarjeta: number
  deposito: number
  yappy: number
  link_pago: number
  retencion_impuestos: number
  ajuste_cuenta: number
}

export interface PaymentMethodSalesPendiente {
  fecha: string
  documento: string
  proyecto: string | null
  monto: number
}

export interface PaymentMethodSalesResumen {
  facturas_cobradas: number
  base_imponible: number
  itbms: number
  total: number
}

export interface PaymentMethodSalesReport {
  resumen: PaymentMethodSalesResumen
  filas: PaymentMethodSalesRow[]
  pendientes: PaymentMethodSalesPendiente[]
}

export interface PaymentMethodSalesReportParams {
  masterClientId?: number
  desde?: string
  hasta?: string
}

// Batch Home (SCRUM-503→512, REQ-426→435) — "Inicio" del módulo Admin & Contab, épica completa.
// Grupo 1: "Resumen del mes" (REQ-427→431). Sin parámetros — siempre mes en curso a la fecha.
// Shape real de GET /admin-contab/home/resumen-mes (AdminContHomeController::resumenMes(),
// verificado contra el backend real 2026-08-27) — anidado por grupo de tarjeta, no un objeto
// plano. Corregido tras Senior Review: el primer intento del frontend (aplanado) no matcheaba
// la respuesta real del backend, mismo patrón de shape-mismatch ya documentado varias veces en
// este proyecto — ver memoria `feedback_shape_mismatch_bugs_only_caught_by_preqa_gate.md`.
export interface HomeResumenMes {
  mes_label: string
  total_cobrado_mes: number
  cuentas_al_dia: {
    porcentaje: number
    monto_al_dia: number
    monto_con_mora: number
  }
  cartera_por_cobrar: {
    monto: number
    monto_incobrable_excluido: number
  }
  ventas_de_ayer: {
    monto: number
    cantidad: number
    fecha: string
  }
  comisiones_por_pagar: {
    internas: number
    externas: number
  }
}

// Grupo 3 (SCRUM-510, REQ-433) — panel "Pendientes": alertas auto-generadas (facturas vencidas
// sin pago, pagos parciales sin completar, comisiones pendientes hace +10 días).
export interface HomePendientesAlert {
  tipo: 'factura_vencida_sin_pago' | 'pago_parcial_incompleto' | 'comision_pendiente'
  severidad: 'alta' | 'media'
  titulo: string
  detalle: string
  monto: number
  fecha_referencia: string
}

export interface HomePendientes {
  count: number
  items: HomePendientesAlert[]
}
