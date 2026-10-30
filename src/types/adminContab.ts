// Batch Configuración Fiscal (SCRUM-632→637, REQ-555→560) — módulo Admin&Cont, pantalla exclusiva
// de Gerencia. Contrato acordado con Backend Dev (implementado en paralelo sobre App\Modules\AdminCont).

export type RegimenTributario = 'general' | 'pequeno_contribuyente'
export type PacAmbiente = 'apagado' | 'production' | 'testing'
/** `none` = país sin paquete fiscal (Fase 6b): documentos internos, nada viaja a ningún PAC. */
export type PacProvider = 'digifact' | 'msl' | 'none'
/** SCRUM-943 — estado real de Facturación Electrónica de una factura o Nota de Crédito puntual.
 *  `null` = certificación nunca corrida (factura previa a esta feature). `error_configuracion`
 *  NUNCA se muestra como "rechazado" — es un problema de configuración nuestro, no un rechazo de
 *  la DGI (ver `FiscalDocumentResult` en el backend). */
// `en_espera_nc` (SCRUM-1009): factura de REEMPLAZO de una "Corrección de datos" retenida hasta que la nota de
// anulación se certifique ante la DGI. No es un rechazo ni un envío: el reemplazo todavía no se mandó.
export type FiscalElectronicStatus = 'no_aplica' | 'pendiente' | 'certificado' | 'rechazado' | 'error_configuracion' | 'en_espera_nc'
/** SCRUM-1007 — acción fiscal manual sobre un documento electrónico. */
export type FeAccionFiscal = 'reintentar' | 'actualizar_estado'
/** SCRUM-1019 — `reconciliar` se ofrece por separado (`puede_reconciliar_fe`), no vía `accion_fe`. */
export type FeAccionBoton = FeAccionFiscal | 'reconciliar'
/** SCRUM-1007 — resultado de `POST .../fe-reintentar` y `.../fe-actualizar-estado` (200 aunque la DGI vuelva a rechazar). */
export interface FeAccionResultado {
  accion: 'reenviado' | 'resuelto' | 'sigue_en_cola' | 'sin_cambios'
  fe_estado: FiscalElectronicStatus | null
  fe_detalle: string | null
  cufe: string | null
  mensaje: string
  /** `ya_certificado_9022` cuando MSL indica que el número ya estaba certificado y el CUFE no se puede recuperar por API. */
  codigo: string | null
}
/** SCRUM-987 — un intento de transmisión al PAC: payload enviado + respuesta recibida (evidencia fiscal). */
export interface FeTransmision {
  id: number
  created_at: string
  provider: string
  ambiente: string | null
  operacion: 'certificar' | 'consultar_estado'
  origen: 'certificacion' | 'polling'
  endpoint: string | null
  serie: string | null
  numero_fiscal: string | null
  resultado: 'certificado' | 'rechazado' | 'pendiente' | 'error_configuracion' | 'sin_respuesta'
  http_status: number | null
  duracion_ms: number | null
  request_id: string | null
  request_payload: Record<string, unknown> | null
  response_body: Record<string, unknown> | null
}
/** SCRUM-943 — `GET .../fe-preview`: JSON que se armaría para el PAC, sin certificar nada. */
export interface FiscalDocumentPreviewResult {
  ok: boolean
  payload?: Record<string, unknown>
  error?: string
}

// REQ-635 (SCRUM-811) — umbrales configurables de alertas de fraude, consumidos por
// SecurityAnalysisJob (backend). Ver docs/security/THREAT-MODEL-bodega-admincont-fraude.md.
export interface FraudSettings {
  /** Cuántas desviaciones estándar sobre la media móvil disparan la alerta de monto (default 3). */
  fraude_monto_desviaciones: number
  /** Ventana (días) de la media móvil usada para calibrar el umbral de monto (default 90). */
  fraude_monto_ventana_dias: number
  /** Cantidad de aprobaciones del mismo actor que dispara la alerta (default 5). */
  fraude_aprobaciones_repetidas_n: number
  /** Ventana en minutos para contar aprobaciones repetidas (default 10). */
  fraude_aprobaciones_repetidas_minutos: number
  /** Días de antigüedad (estrictamente mayores) a partir de los que una comisión pendiente genera alerta en Inicio (default 10). */
  comision_pendiente_dias: number
}

export interface FiscalSettings {
  razon_social: string
  nombre_comercial: string
  ruc: string
  dv: string
  direccion_fiscal: string
  regimen_tributario: RegimenTributario
  pac_provider: PacProvider
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
  /** SCRUM-1019 — horas máximas para reintentar un documento electrónico antes de requerir acción manual. Entero 1–720, obligatorio (default 24 en el backend). */
  fe_reintento_max_horas: number
  /** Fase 6b — ¿la empresa envía documentos a una autoridad fiscal? `false` con el proveedor `none` o el ambiente apagado. */
  facturacion_electronica_activa?: boolean
  /** Fase 6b — nombre legible del proveedor activo y país de la empresa; proveedores que sirven en ese país. */
  pac_provider_label?: string
  pais?: string
  pac_providers_disponibles?: { key: PacProvider; label: string }[]
}

/** Campos editables desde el formulario — excluye los de solo lectura/gobernados por el backend. */
export type FiscalSettingsPayload = Omit<
  FiscalSettings,
  'pac_last_sync_at' | 'pac_connection_status' | 'pac_provider' | 'primary_approver_user_id'
  | 'facturacion_electronica_activa' | 'pac_provider_label' | 'pais' | 'pac_providers_disponibles'
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
// pantalla exclusiva de Gerencia (gate real en el backend, 403 en TODAS las rutas incluido GET).

export interface RedSocial {
  plataforma: string
  url: string
}

export interface RegionCountry {
  code:     string
  name:     string
  currency: string
  timezone: string
  locale:   string
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
  /** País, moneda, zona y locale son del tenant (Fase 6a): editables en modo edición. */
  pais: string
  moneda: string
  locale: string
  /** Catálogo de países con su contexto regional por omisión (`config/regions.php` del backend). */
  paises: RegionCountry[]
  /** Solo lectura SIEMPRE — configuración base ya confirmada (RN1 REQ-565). */
  anio_fiscal: string
  /** Editable en modo edición — zona IANA válida del tenant (Fase 6a; antes solo America/Panama, RN2 REQ-565). */
  zona_horaria: string
}

/** Campos editables desde el formulario — excluye los de solo lectura/gobernados por otra pantalla. */
export type CompanyProfilePayload = Pick<
  CompanyProfile, 'descripcion_corta' | 'sitio_web' | 'redes_sociales' | 'zona_horaria' | 'pais' | 'moneda' | 'locale'
>

export type LocationType = 'Bodega' | 'Exhibicion' | 'Oficina' | 'Otra'

export interface Location {
  id: number
  nombre: string
  tipo: LocationType
  direccion: string | null
  activa: boolean
  /** false para las 7 bodegas/exhibiciones oficiales — vienen en vivo del módulo Bodega, solo lectura acá (RN1 REQ-563). */
  editable: boolean
  source: 'bodega' | 'admin_contab'
}

export interface CreateLocationPayload {
  nombre: string
  /** Solo estos 2 — "Bodega"/"Exhibición" son de solo lectura, sourced del módulo Bodega (RN1 REQ-563). */
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
// A diferencia de Fiscal/Empresa, NO es exclusiva de Gerencia: la ven varios roles (Contabilidad, Asistente Administrativa,
// Gerencia) según gate del backend — sin estado especial de "acceso restringido" en el frontend.

export type TipoCuenta = 'corriente' | 'ahorro' | 'tarjeta_credito'
export type TipoMovimiento = 'cobro' | 'devolucion' | 'comision'

export interface BankAccount {
  id: number
  banco: string
  tipo_cuenta: TipoCuenta
  ultimos_4_digitos: string
  // SCRUM-857 (REQ-458) — excepción deliberada a RN4 ("nunca el número completo"): el Estado de
  // Cuenta es un documento que el CLIENTE necesita para pagar por transferencia. Null hasta que
  // alguien lo completa vía BankAccountDetailModal; el resto del sistema sigue mostrando
  // ultimos_4_digitos, nunca este campo.
  numero_cuenta_completo: string | null
  moneda: string
  activa: boolean
  movimientos_count: number
}

export interface CreateBankAccountPayload {
  banco: string
  ultimos_4_digitos: string
  tipo_cuenta?: TipoCuenta
  moneda?: string
  numero_cuenta_completo?: string | null
}

// SCRUM-857 — antes no existía ningún update parcial (solo activar/desactivar).
export interface UpdateBankAccountPayload {
  banco?: string
  ultimos_4_digitos?: string
  tipo_cuenta?: TipoCuenta
  moneda?: string
  numero_cuenta_completo?: string | null
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

/** SCRUM-947 — mismo shape que expone `Pagination::meta()` en el backend. */
export interface BankMovementListResponse {
  data: BankMovement[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
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
//
// SCRUM-929 (B4, 2026-09-19) — "un pedido, una sola factura" dejó de ser cierto: un pedido con
// varias entregas de Bodega puede facturarse ENTREGA POR ENTREGA (`modo:'entrega'`, una factura
// `parcial` por entrega) o de una sola vez (`modo:'completo'`), y ambas formas coexisten — un
// pedido puede terminar con una `parcial` y además el `completo` que cubre el resto. Ver
// `docs/adr/ADR-SCRUM929-facturacion-parcial-o-completa.md` §4 (backend) para el contrato
// completo. Cambio de clave más importante: **una fila de `GET /invoices` ya NO es 1:1 con
// `order_id`** — es 1:1 con `invoice_id` (facturada) o con `order_id` (pendiente, a lo sumo una
// pendiente por entrega). La raíz de un pedido puede tener DOS filas activas (su parcial y el
// completo que cubre el resto), distinguibles solo por `invoice_id`/`tipo_factura`.

// Batch 4 (SCRUM-524→528, REQ-447→451) agrega 'anulada' — fundacional, sin escritor real todavía:
// RN4 REQ-449 es explícita en que Facturación NUNCA anula una factura por sí misma, solo una Nota
// de Crédito de tipo "Anulación completa" (batch muy posterior, Notas Crédito y Devoluciones)
// puede originarlo. Ninguna factura real es 'anulada' hoy.
export type EntregaEstado = 'pendiente-facturar' | 'facturada' | 'anulada'
export type CarteraTab = 'cobrable' | 'incobrable'
export type FacturacionView = 'agrupado' | 'plana'

/** Estado de la propuesta de incobrable de una factura — REQ-448. `normal` = sin ninguna
 *  propuesta activa; `pendiente_aprobacion` = Contabilidad/Aprobador/Gerencia la propuso, esperando la
 *  decisión de Gerencia; `incobrable` = Gerencia ya la aprobó (equivalente a `es_incobrable=true`). */
export type CobrabilidadEstado = 'normal' | 'pendiente_aprobacion' | 'incobrable'

export interface InvoiceSummary {
  pendientes_entrega: number
  pendientes_facturar: number
  facturadas_mes: number
  monto_facturado_mes: number
}

/** Modo de facturación — ver ADR §4.1. `entrega`: solo lo que salió de ESA entrega. `completo`:
 *  el pedido entero (o lo que falta, si ya hay parciales); default del backend si se omite. */
export type InvoiceModo = 'entrega' | 'completo'
export type InvoiceTipo = 'parcial' | 'completo'

/** SCRUM-876/929 — una entrega del pedido (miembro de la familia de `Bodega\Models\Order`). Un
 *  pedido de entrega única trae una sola. Campos ampliados en B4 (ADR §4.5) para saber, por
 *  entrega, si ya tiene SU PROPIA factura o está cubierta por el `completo`. */
export interface EntregaDelPedido {
  order_id: number
  sequence_in_family: number | null
  total_in_family: number | null
  stage: string
  /** SCRUM-929 — `pedido` | `faltante` | `revision_inventario`. */
  order_type?: string
  /** SCRUM-929 — llegó a "Por despachar" o después. */
  facturable?: boolean
  factura_numero?: string | null
  factura_tipo?: InvoiceTipo | null
  factura_anulada?: boolean
  /** SCRUM-929 — esta entrega no tiene factura propia, la cubre el `completo` del pedido. */
  cubierta_por_completo?: boolean
}

/**
 * SCRUM-929 (B4) — una fila es UNA FACTURA o UNA ENTREGA PENDIENTE, no un pedido: un pedido con
 * varias entregas puede tener varias filas (una por factura emitida + una por cada entrega
 * facturable sin la suya). **La clave única de una fila es `invoice_id` (facturada) o `order_id`
 * cuando `invoice_id` es null (pendiente) — NUNCA `order_id` a secas**, la raíz de un pedido puede
 * tener dos filas activas (su parcial y el `completo` que cubre el resto), ambas con el mismo
 * `order_id`. Ver ADR §4.3 para el ejemplo completo fila por fila.
 */
export interface InvoiceEntry {
  /** Tarjeta de ESTA fila (la entrega, o la raíz si es un `completo`). */
  order_id: number
  order_number: string
  master_client_id: number | null
  cliente: string
  /** SCRUM-1175 — responsables del pedido (dueño de la tarjeta y compartidos); vacío en facturas migradas o de venta chica. */
  vendedores?: string[]
  // SCRUM-980 — `null` cuando el pedido nunca tuvo un PipelineCard/SalesProject real detrás (ej.
  // fixtures sembrados directo como Order para probar Bodega, sin pasar por Cotización). El tipo
  // decía `number`/`string` sin serlo de verdad — el backend siempre pudo mandar null acá
  // (`InvoiceService::pedidoRows()`: `$card?->sales_project_id`), TypeScript nunca lo marcó.
  sales_project_id: number | null
  proyecto: string | null
  cotizacion_folio: string | null
  /** Facturada: monto de SU factura. Pendiente: lo que se facturaría de facturarse ahora. */
  monto: number | null
  estado: EntregaEstado
  numero_factura: string | null
  /** SCRUM-929 — null en una fila pendiente. Junto con `order_id` es la clave real de la fila. */
  invoice_id: number | null
  tipo_factura: InvoiceTipo | null
  /** SCRUM-876 — avance de las entregas parciales del pedido (1 elemento si es entrega única). */
  entregas_del_pedido?: EntregaDelPedido[]
  /** true SOLO cuando Gerencia ya aprobó la propuesta (REQ-448 RN4) — mientras está pendiente de su
   *  decisión, esto sigue en false y `incobrable_pendiente` es el que vale true. */
  es_incobrable: boolean
  /** Batch 4 (REQ-448) — propuesta de incobrable enviada, esperando aprobar/rechazar de Gerencia. */
  incobrable_pendiente: boolean
  /** SCRUM-1147 — `cobrada` (el cobro cubre el monto), `por_cobrar` (con saldo pendiente, incluye
   *  cobros parciales) o null (pendiente de facturar, anulada o incobrable). */
  cobro_estado?: CobroEstado | null
  /** SCRUM-1147 — saldo a favor disponible (nivel más específico: factura > proyecto > cliente) que
   *  podría aplicarse a esta factura; informativo. null/ausente = no hay. Solo en filas por cobrar. */
  saldo_a_favor?: number | null
  /** SCRUM-929 — datos de ESTA tarjeta dentro de la familia (secuencia/etapa/tipo de Bodega). */
  entrega?: { sequence_in_family: number | null; total_in_family: number | null; stage: string; order_type: string }
  /** SCRUM-929 — nivel PEDIDO, repetido en cada fila del mismo pedido (ver ADR §4.3). */
  pedido_id: number
  es_entrega_unica: boolean
  /** Se puede ofrecer `modo:'entrega'` en este pedido (varias entregas, todo vinculado a la cotización). */
  facturacion_por_entrega: boolean
  monto_total_pedido: number
  facturado_pedido: number
  restante: number
  puede_facturar_completo: boolean
  motivo_completo_no_disponible: string | null
  /** SCRUM-929 — nivel ENTREGA: esta tarjeta admite `modo:'entrega'` hoy (ya corrió el plan). */
  puede_facturar_entrega: boolean
  motivo_entrega_no_disponible: string | null
}

/** Fila agrupada por proyecto — ver vista "agrupado" de `GET /admin-contab/invoices`. */
export interface InvoiceGroup {
  sales_project_id: number | null
  proyecto: string | null
  cliente: string | null
  master_client_id: number | null
  entregas: InvoiceEntry[]
}

/** SCRUM-1147 — estado de cobro de una fila de Facturación. */
export type CobroEstado = 'cobrada' | 'por_cobrar'

export interface InvoiceListFilters {
  tab: CarteraTab
  view: FacturacionView
  cliente?: string
  proyecto?: string
  /** SCRUM-1175 — ids de vendedor; el pedido entra si CUALQUIERA de sus responsables está entre ellos (omitido = todos). */
  vendedor_ids?: number[]
  estado?: EntregaEstado
  /** SCRUM-1147 — filtro Cobradas / Por cobrar (el valor que viaja al API: `cobradas` | `por_cobrar`). */
  cobro?: 'cobradas' | 'por_cobrar'
  desde?: string
  hasta?: string
  search?: string
  // SCRUM-947 — paginación estándar, solo aplica a `view: 'plana'` (la única que consume
  // FacturacionPage.tsx — `agrupado` sigue sin paginar en el backend, sin consumidor real).
  page?: number
  per_page?: number | 'all'
}

/** `GET /admin-contab/invoices` — `total_en_tab` es el denominador real de "Mostrando X de Y"
 *  (RN4 REQ-445): cuenta de la pestaña activa SIN el resto de los filtros, no cambia con la
 *  paginación. `meta` (SCRUM-947) es la paginación real sobre `rows`, ausente si `view` no fue
 *  `'plana'` (la vista `agrupado` no pagina). */
export interface InvoiceListResult {
  rows: InvoiceEntry[]
  total_en_tab: number
  meta?: { total: number; per_page: number; current_page: number; last_page: number }
}

/** Línea de desglose de una factura — Batch 3 (REQ-443), mismo formato que usará la impresión
 *  fiscal de Batch 4 (REQ-449). */
export interface InvoiceLineItem {
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

/** Un resultado por `order_id` normalizado — REQ-441 Escenarios 1/2: ok+datos, o ok:false+missing.
 *  Batch 3 (REQ-442/443) agrega el desglose fiscal completo. SCRUM-929 (ADR §4.2) agrega `modo`
 *  (el EFECTIVO, una entrega única con `entrega` vuelve `completo`), `tipo` resultante,
 *  `cierra_pedido`/`restante_despues`/`advertencias`. */
export interface InvoicePreviewResult {
  order_id: number
  ok: boolean
  /** Guarda de RUC al facturar: cómo valida el receptor contra la DGI. Solo viene en resultados `ok`. */
  receptor_validacion?: ReceptorValidacion
  order_number?: string
  cotizacion_folio?: string | null
  cliente?: string
  monto?: number
  missing?: string[]
  modo?: InvoiceModo
  tipo?: InvoiceTipo
  /** Esta factura deja facturada toda la cantidad cotizada (absorbe el residual de redondeo). */
  cierra_pedido?: boolean
  /** Saldo del pedido tras emitir esta factura. */
  restante_despues?: number
  /** Vacío por defecto — solo el cierre puede traer avisos (descuadre contra la cotización recalculada hoy). */
  advertencias?: string[]
  subtotal?: number
  descuentos?: number
  itbms?: number
  total?: number
  items?: InvoiceLineItem[]
  /** SCRUM-876 — entregas parciales del pedido; si son 2+, se avisa "una sola factura por el total". */
  entregas_del_pedido?: EntregaDelPedido[]
}

/** Resultado de la guarda de RUC (`ReceptorFiscalGuard`). `bloquea` impide guardar la factura. */
export type ReceptorValidacionEstado =
  | 'ok' | 'no_aplica' | 'no_validado' | 'sin_ruc' | 'no_encontrado' | 'dv_distinto' | 'nombre_distinto' | 'no_disponible'

export interface ReceptorValidacion {
  estado: ReceptorValidacionEstado
  bloquea: boolean
  mensaje: string
  sub_client_id: number | null
  ruc: string | null
  dv: string | null
  nombre: string | null
  /** Razón social y DV que devolvió la DGI (cuando reconoció el RUC), para ofrecer "usar los de la DGI". */
  nombre_dgi: string | null
  dv_dgi: string | null
  /** El problema se arregla editando RUC/DV/razón social (no aplica a una falla de la DGI). */
  corregible: boolean
  /** El cliente ya tiene documentos certificados o pendientes: solo se muestra el error, sin corregir. */
  edicion_bloqueada: boolean
  /** SCRUM-1140 — razón social distinta a la de la DGI: no bloquea (viaja la de la DGI) y "Actualizar cliente" es opcional. */
  actualizable: boolean
}

export interface CorrectReceptorPayload {
  business_name: string
  tax_id: string
  /** SCRUM-1140 — opcional: una cédula puede no tener DV; el backend lo exige solo si la DGI lo trae. */
  tax_id_dv?: string
}

/** SCRUM-902 §4.3 — el saldo a favor dejó de aplicarse al generar la factura (siempre se genera
 *  por su monto completo); `aplicar_saldo_favor`/`aviso_saldo_solo_primera` se retiraron por
 *  completo de este flujo (antes REQ-442 RN3). */
export interface InvoicePreviewResponse {
  results: InvoicePreviewResult[]
}

/** `GET /invoices/pending?sales_project_id=` — paso 3 del wizard (ADR §4.4): una entrada por
 *  entrega facturable sin factura, o por pedido sin ninguna factura activa (resto). Misma forma
 *  que un `InvoicePreviewResult` ok, sin el campo `ok`. */
export type InvoicePendingResult = Omit<InvoicePreviewResult, 'ok' | 'missing'>

/** SCRUM-929 (ADR §4.1) — `modo` es a nivel de LLAMADA, no por id: todos los `order_ids` de un
 *  mismo submit comparten el mismo modo. Omitido = `completo` (compatibilidad con pre-929). */
export interface CreateInvoicePayload {
  order_ids: number[]
  modo?: InvoiceModo
  /** SCRUM-1140 — pedidos del lote que se facturan a Consumidor final por decisión de quien factura (exige permiso). */
  consumidor_final_order_ids?: number[]
}

export type InvoiceExportFormat = 'pdf' | 'excel'

/** Una factura creada — mismos campos nuevos que `InvoicePreviewResult` (`tipo`/`advertencias`),
 *  ver ADR §4.2 "La respuesta de POST /invoices incluye el mismo campo en cada elemento". */
export interface CreateInvoiceResult {
  invoices: { order_id: number; numero: string; monto?: number; tipo?: InvoiceTipo; advertencias?: string[] }[]
  errors: { order_id: number; missing: string[]; receptor?: ReceptorValidacion }[]
}

// Batch 4 del cuerpo principal (SCRUM-524→528, REQ-447→451) — modal de detalle/trazabilidad,
// cobrabilidad con aprobación de Gerencia, impresión fiscal, antigüedad de cartera, "Registrar cobro".

/**
 * `GET /admin-contab/invoices/{order_id}/detail` (opcional `?invoice_id=`, ver ADR §4.6) — payload
 * completo del modal de detalle. `{order_id}` es la ENTREGA consultada; sin `invoice_id` rige la
 * regla central (parcial vigente de esa tarjeta → completo vigente que la cubre → recién después
 * las anuladas) — pasar `invoice_id` cuando ya se sabe exactamente qué factura mostrar (ej. se abrió
 * el modal desde una fila con `invoice_id` propio), para no depender de la resolución por defecto
 * en una tarjeta que puede tener más de una factura (la raíz con su parcial y el completo).
 */
export interface InvoiceDetail {
  order_id: number
  order_number: string
  cliente: string
  /** SCRUM-1147 — vendedor(es) responsable(s) del pedido (owner + compartidos), para saber a quién contactar. */
  vendedores_responsables?: string[]
  /** SCRUM-929 — id del pedido (raíz) y de la factura mostrada; null en facturas legadas sin `tipo`. */
  pedido_id?: number
  entrega_id?: number
  invoice_id?: number | null
  tipo_factura?: InvoiceTipo | null
  /** "Entrega 2 de 3" / "Pedido completo" / null en facturas legadas. */
  concepto?: string | null
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
  /** SCRUM-876 — avance de las entregas parciales del pedido (1 elemento si es entrega única). */
  entregas_del_pedido?: EntregaDelPedido[]
  cobrabilidad: CobrabilidadEstado
  motivo_incobrable: string | null
  /** Calculado server-side (`current_user_id === primary_approver_user_id`) — el frontend nunca
   *  decide por su cuenta quién es Gerencia, mismo criterio de fail-closed que el resto de gates
   *  exclusivos de Gerencia en este módulo. Undefined/false = no mostrar Aprobar/Rechazar. */
  puede_decidir_incobrable?: boolean
  /** SCRUM-864 — false si la factura ya está pagada (saldo_aplicado >= monto) o anulada; el
   *  frontend nunca recalcula "pagada" comparando montos, usa este flag server-side. */
  puede_marcar_incobrable: boolean
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
  /** SCRUM-943 — `null` en facturas previas a esta feature. */
  fe_estado: FiscalElectronicStatus | null
  /** Motivo textual del rechazo del PAC — solo lo envía el backend a Gerencia/superadmin (`null` para el resto). */
  fe_detalle?: string | null
  /** SCRUM-987 — solo Gerencia/superadmin: habilita el visor de transmisiones al PAC (payload + respuesta). */
  puede_ver_fe_transmisiones?: boolean
  /** SCRUM-1007 — acción fiscal manual disponible ahora (solo Gerencia/superadmin): reintentar la certificación o actualizar el estado. */
  accion_fe?: FeAccionFiscal | null
  /** SCRUM-1019 — el backend ofrece "Reconciliar con MSL" para este documento. */
  puede_reconciliar_fe?: boolean
  cufe: string | null
  qr_content: string | null
  pac_provider_usado: PacProvider | null
}

/** SCRUM-929 (ADR §4.8) — `invoice_id` opcional: obligatorio cuando el pedido tiene varias
 *  facturas activas (422 sin él en ese caso), implícito si hay solo una. */
export interface MarkUncollectiblePayload {
  motivo: string
  invoice_id?: number
}

export interface UncollectibleDecisionPayload {
  approve: boolean
  invoice_id?: number
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

export type PaymentEstado = 'confirmado' | 'esperando_confirmacion' | 'anulado'

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

// ===== SCRUM-902 — Registrar Abono (4O) =====
// Reusa `PaymentMethod`/`PAYMENT_METHODS` (mismo vocabulario de 9 métodos que Cobros — mismo
// criterio de cuenta bancaria sugerida, mismo `defaultBankAccount()`) en vez de un enum paralelo.

export type AbonoNivelAsociacion = 'cliente' | 'proyecto' | 'factura'
export type AbonoEstado = 'por_confirmar' | 'confirmado'

/** "Proyecto" en este módulo es `SalesProject` (mismo modelo que `AccountStatementProjectOption`
 *  en Estado de Cuenta) — no `PipelineCard`. */
export interface Abono {
  id: number
  fecha_registro: string
  master_client_id: number
  cliente: string
  sub_client_id: number | null
  sub_cliente: string | null
  sales_project_id: number | null
  proyecto: string | null
  invoice_id: number | null
  factura: string | null
  /** Calculado en backend — nunca elegido/enviado por el frontend. */
  nivel_asociacion: AbonoNivelAsociacion
  monto_original: number
  monto_usado: number
  monto_disponible: number
  /** Disponible/Usado parcialmente/Agotado — no confundir con `estado` (por_confirmar/confirmado). */
  estado_saldo: SaldoFavorEstado
  metodo_pago: PaymentMethod
  /** `null` cuando el método es retención de impuestos/ajuste de cuenta (RN4, ver PAYMENT_METHODS_SIN_CUENTA_BANCARIA) — se muestra como "Otros" en vez de una cuenta real. */
  cuenta_bancaria_id: number | null
  referencia: string
  comprobante_url: string | null
  estado: AbonoEstado
  registrado_por: string | null
  confirmado_por: string | null
  fecha_confirmacion: string | null
  /** Trazabilidad del excedente (§4.5) — no nulo solo en el abono nuevo generado a nivel Cliente. */
  abono_origen_id: number | null
  /** SCRUM-955 — folio propio del recibo de abono (prefijo distinto al REC-XXX de cobros), `null` hasta que el backend lo genere en el registro. */
  numero_recibo: string | null
}

export interface AbonoFilters {
  search?: string
  master_client_id?: number
  estado?: AbonoEstado
  // SCRUM-948 — mismos criterios de búsqueda que Historial de cobros (metodo_pago, rango de fechas).
  metodo_pago?: PaymentMethod
  desde?: string
  hasta?: string
  // SCRUM-947 — paginación estándar (Pagination::params()/ofArray() en el backend).
  page?: number
  per_page?: number | 'all'
}

/** SCRUM-947 — mismo shape que expone `Pagination::meta()` en el backend. */
export interface AbonoListResponse {
  data: Abono[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

/** `POST /admin-contab/abonos` y `PUT /admin-contab/abonos/{id}`. */
export interface AbonoPayload {
  master_client_id: number
  sub_client_id?: number | null
  sales_project_id?: number | null
  invoice_id?: number | null
  monto_original: number
  metodo_pago: PaymentMethod
  /** `null` cuando el método es retención de impuestos/ajuste de cuenta (RN4). */
  cuenta_bancaria_id: number | null
  referencia: string
  comprobante?: File | null
}

export interface AbonoSubClienteOption { id: number; name: string }
export interface AbonoProyectoOption { id: number; name: string }
export interface AbonoFacturaOption { id: number; numero: string }

/** SCRUM-933 — fila de `GET /admin-contab/abonos/cascada/facturas-por-subcliente`: TODAS las
 *  facturas de un sub-cliente de una sola vez, para el buscador cruzado Proyecto↔# Cotización
 *  (reemplaza, para ese buscador, los pasos `proyectos()`+`facturas()` de arriba). Cotización
 *  resuelta vía `Order::linkedQuote()`, mismo criterio que Cobros/Notas de Crédito/Estado de Cuenta. */
export interface AbonoInvoiceForSubClient {
  id: number
  numero: string
  sales_project_id: number | null
  proyecto: string | null
  quote_id: number | null
  cotizacion_folio: string | null
  /** SCRUM-955 — monto total de la factura, para mostrarlo y validar el tope del abono contra él. */
  monto: number
}

// ===== SCRUM-903 — Saldo a Favor de Clientes (4N), solo lectura =====

export type SaldoFavorEstado = 'disponible' | 'usado_parcialmente' | 'agotado'
// Coincide con `SaldoFavorService::ORIGEN_*` en el backend — singular, no confundir con las keys
// de i18n `saldoFavor.origenes.*` (esas sí están en plural, son solo el label mostrado).
export type SaldoFavorOrigen = 'abono' | 'devolucion' | 'descuento' | 'anulacion'

export interface SaldoFavorRow {
  origen_tipo: SaldoFavorOrigen
  /** Label ya resuelto por el backend (ej. "Abono de más", "Descuento comercial"). */
  origen: string
  master_client_id: number
  cliente: string
  sales_project_id: number | null
  proyecto: string | null
  invoice_id: number | null
  factura: string | null
  asociado_a: string
  referencia: string
  fecha: string
  monto_original: number
  monto_usado: number
  monto_disponible: number
  estado: SaldoFavorEstado
  /** Fase 13 (2.2) — de dónde sale el saldo (lo que la compensación exige por línea) y a qué nivel sirve. */
  source_type?: 'abono' | 'cobro' | 'nota_credito'
  source_id?: number
  nivel?: 'cliente' | 'proyecto' | 'factura'
}

export interface SaldoFavorFilters {
  search?: string
  // SCRUM-947 — nuevos: texto "contiene", antes filtraban 100% client-side sobre la página
  // completa cargada (roto por diseño una vez que el backend pagina de verdad).
  cliente?: string
  proyecto?: string
  factura?: string
  master_client_id?: number
  sales_project_id?: number
  invoice_id?: number
  estado?: SaldoFavorEstado
  origen?: SaldoFavorOrigen
  // SCRUM-947 — paginación estándar.
  page?: number
  per_page?: number | 'all'
}

export interface SaldoFavorResult {
  indicadores: {
    // Siempre sobre el total real, nunca sobre la página actual (regla ya existente, §3.1).
    saldo_disponible_total: number
    clientes_con_saldo: number
    // Fase 13 (2.2) — el total desglosado por nivel, para no mezclar niveles sin decirlo.
    saldo_aplicable_cliente?: number
    saldo_a_cuenta?: number
    saldo_reservado?: number
  }
  rows: SaldoFavorRow[]
  // SCRUM-947 — mismo shape que expone `Pagination::meta()` en el backend.
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

/** `GET /admin-contab/payments/open-invoices?master_client_id=` — REQ-464 RN1. SCRUM-902 §4.2/4.3
 *  — `abono_obligatorio` no nulo (nivel Factura, o Proyecto ya re-asociado a esta factura) obliga
 *  a mostrar el monto de esta factura ya reducido y BLOQUEADO — nunca editable/opcional. */
export interface OpenInvoice {
  id: number
  numero: string
  monto: number
  saldo_pendiente: number
  abono_obligatorio: { abono_id: number; monto: number } | null
  /** `saldo_pendiente - abono_obligatorio.monto` cuando aplica — ya lo calcula el backend. */
  neto_a_cobrar: number
  /** SCRUM-931 — para el filtro cruzado Proyecto↔Cotización de "Registrar Cobro" (ver
   *  ADR-SCRUM931), resuelto local sobre esta misma lista, sin request nueva. */
  sales_project_id: number | null
  proyecto: string | null
  quote_id: number | null
  cotizacion_folio: string | null
}

export interface OpenInvoicesResult {
  invoices: OpenInvoice[]
  /** Lo que un cobro puede aplicar de inmediato (abonos nivel Cliente y notas de crédito). */
  credit_balance: number
  /** Fase 13 (2.2) — el resto del saldo a favor del cliente: cobros a cuenta, reservado a un proyecto o factura, y el total. */
  credit_balance_cuenta?: number
  credit_balance_reservado?: number
  credit_balance_total?: number
  /** REQ-462 RN2 — presente cuando el formulario llega preseleccionado desde Facturación. */
  master_client_name: string | null
}

/** `POST /admin-contab/payments` — REQ-464/465/466/467/468/469. Enviado como `FormData` cuando
 *  trae `comprobante` (multipart), `JSON` en caso contrario — ver `useRegisterPayment()`. */
export interface CreatePaymentPayload {
  master_client_id: number
  invoice_ids: number[]
  /** SCRUM-902 §4.4 — reemplaza al viejo `aplicar_saldo_favor` (todo-o-nada). Monto que el
   *  usuario decide aplicar del saldo a nivel Cliente master sobre esta factura puntual — nunca
   *  mayor al disponible (422 si se excede, ver `useRegisterPayment`). Nunca cubre el abono
   *  obligatorio de nivel Factura/Proyecto — ese se aplica solo, sin intervención del usuario. */
  monto_saldo_cliente_aplicado?: number
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
  // SCRUM-947 — paginación estándar.
  page?: number
  per_page?: number | 'all'
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
  // Conteo GLOBAL sin ningún filtro — denominador de referencia, no el total filtrado (ver `meta`).
  total: number
  // SCRUM-947 — mismo shape que expone `Pagination::meta()` en el backend; `meta.total` es el
  // total YA filtrado (a diferencia de `total` arriba).
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

/** Una factura cubierta por un cobro, con el monto que se le aplicó — REQ-471 RN1. */
export interface PaymentDetailFactura {
  invoice_id: number
  numero: string | null
  /** Monto original de la factura, antes de cualquier abono — SCRUM-902 Escenario 5. */
  monto_original: number
  /** Abono (Factura/Proyecto obligatorio, o Cliente opcional aplicado en este cobro) ya restado. */
  monto_abono_aplicado: number
  monto_aplicado: number
  /** SCRUM-931 — para enlazar esta factura a su Cotización/Guía de Entrega desde el detalle del
   *  cobro (mismos nombres/semántica que `AccountStatementMovement`, SCRUM-930). `order_id` es el
   *  que necesita `InvoiceDetailModal`. */
  quote_id: number | null
  cotizacion_folio: string | null
  order_id: number | null
  guia_entrega_numero: string | null
  guia_entrega_order_id: number | null
}

/** SCRUM-931 — una nota de crédito asociada (transitivamente, vía factura) a un cobro. */
export interface PaymentDetailNotaCredito {
  id: number
  numero: string
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
/**
 * SCRUM-1168 F0 — lo que NO se pudo aplicar tal cual al confirmar un cobro: el dinero ya entró, así que se aplica hasta donde cabe y el
 * resto queda como saldo a favor del cliente (a la espera de la compensación). `null` = se aplicó exactamente lo registrado.
 */
export interface ConfirmacionAjustes {
  excedente_a_saldo_favor: number
  /** Saldo a favor / abono que este cobro iba a usar y otro cobro ya consumió: esa parte queda pendiente en la factura. */
  saldo_insuficiente: number
  facturas: { numero: string; solicitado: number; aplicado: number }[]
}

/** SCRUM-1168 F2 — qué concepto de cobros está activo en este entorno y la ventana de «movimiento reciente» de Compensaciones. */
export interface PaymentsConfig {
  v2: boolean
  compensaciones_dias_movimiento: number
}

/** SCRUM-1168 F2 — registrar un cobro del concepto nuevo: dinero que entra, con o sin factura; `aplicaciones` es la aplicación directa opcional. */
export interface CreatePaymentV2Payload {
  master_client_id: number
  monto_recibido: number
  metodo_pago: PaymentMethod
  bank_account_id: number | null
  aplicaciones: { invoice_id: number; monto: number }[]
  numero_documento_retencion: string | null
  comentario_ajuste: string | null
  referencia: string | null
  comprobante: File | null
}

/** SCRUM-1168 F4 — solicitud de anular un cobro (o de devolver dinero, F5): la piden Contabilidad o Asistente Administrativa y la decide Gerencia. */
/** Fase 13 (2.4) — al aprobar una anulación: facturas reabiertas que el saldo a favor del cliente podría cubrir (solo informa). */
export interface CompensationSuggestion {
  master_client_id: number
  saldo_a_favor: number
  pendiente_total: number
  compensable: number
  facturas: { invoice_id: number; numero: string | null; pendiente: number }[]
}

export interface ReversalRequest {
  id: number
  tipo: 'anulacion' | 'devolucion' | 'reverso_compensacion'
  estado: 'solicitada' | 'ejecutada' | 'rechazada'
  master_client_id: number
  payment_id: number | null
  source_type: CompensacionSourceType | null
  source_id: number | null
  monto: number | null
  motivo: string
  motivo_rechazo: string | null
  created_at: string | null
  decided_at: string | null
  numero_recibo?: string | null
  cliente?: string
  /** Devolución (F5): cuenta de salida, referencia y comprobante. */
  bank_account_id?: number | null
  referencia?: string | null
  tiene_comprobante?: boolean
  comprobante_url?: string | null
  solicitada_por?: string | null
  decidida_por?: string | null
}

export interface ReversalRequestsResult {
  rows: ReversalRequest[]
  total: number
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

export interface PaymentDetail extends Payment {
  /** SCRUM-1168 F4 — anulación: cuándo y por qué; y la última solicitud de anulación de este cobro. */
  anulado_at?: string | null
  motivo_anulacion?: string | null
  solicitud_anulacion?: { id: number; estado: ReversalRequest['estado']; motivo: string; motivo_rechazo: string | null; created_at: string | null } | null
  /** SCRUM-1168 F2 — cobro del concepto nuevo. */
  cobros_v2?: boolean
  /** SCRUM-1168 F2 — dinero del cobro que NO se aplicó a facturas (saldo a favor del cliente); null en cobros del flujo anterior. */
  saldo_sin_aplicar?: number | null
  /** Solo en la respuesta de confirmar un cobro (SCRUM-1168 F0). */
  ajustes_confirmacion?: ConfirmacionAjustes | null
  cliente: string | null
  metodo_pago_label: string
  registrado_por: string | null
  bank_account: string | null
  tiene_comprobante: boolean
  /** Total de facturas cubiertas ANTES de aplicar el saldo a favor — REQ-473 RN1. */
  total_facturas: number
  facturas: PaymentDetailFactura[]
  confirmacion: PaymentConfirmation | null
  /** SCRUM-931 — ids únicos de Abono aplicados en alguna línea de este cobro (el pivote es por
   *  factura, no hay un solo abono "del cobro") — sin folio de negocio propio, se muestra
   *  "Abono #{id}". */
  abonos: number[]
  /** SCRUM-931 — Notas de Crédito asociadas transitivamente vía las facturas de este cobro. */
  notas_credito: PaymentDetailNotaCredito[]
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
  /** SCRUM-947 — paginación estándar sobre `movimientos` (no aplica a export/pdf, que siguen
   *  trayendo el resultado completo). */
  page?: number
  per_page?: number | 'all'
}

/** SCRUM-955 §5 — identifica el recibo asociado a una fila del Estado de Cuenta y distingue si es
 *  de Cobro o de Abono (numeración/folio independientes, ver ADR de la migración de `abonos`). */
export interface AccountStatementMovementRecibo {
  /** SCRUM-1168 F3 — `compensacion`: cruce de dinero de un abono histórico o de una nota de crédito, con su folio CMP-XXX. */
  tipo: 'cobro' | 'abono' | 'compensacion'
  id: number
  numero_recibo: string
}

/** Una fila de `movimientos` — REQ-460. `tipo` distingue débito (factura) de crédito (cobro; a
 *  futuro también nota de crédito, mismo shape). `saldo` es el saldo CORRIDO (acumulado, RN2),
 *  no el de esta fila aislada. `guia_entrega` es booleano (existencia), no un folio — el sistema
 *  no tiene un número propio para la guía, solo existencia + fecha. */
export interface AccountStatementMovement {
  fecha: string
  /** SCRUM-877 p1 — `descuento`/`devolucion`/`anulacion` se agregan al reflejar Notas de Crédito. */
  tipo: 'factura' | 'cobro' | 'descuento' | 'devolucion' | 'anulacion' | 'compensacion' | 'devolucion_saldo'
  /** `null` en un cobro que cubre varias facturas, en su saldo a favor (sin aplicar) y en una devolución de saldo. */
  numero_factura: string | null
  /** SCRUM-930 — id de la factura de esta fila, para abrir su modal de detalle (`InvoiceDetailModal`). */
  invoice_id: number | null
  /** SCRUM-930 — `order_id` de la entrega, para `InvoiceDetailModal` (path param de
   *  `GET /admin-contab/invoices/{order_id}/detail`, ver `useInvoiceDetail`). `null` cuando la
   *  fila no tiene pedido asociado. */
  order_id: number | null
  cotizacion_folio: string | null
  /** SCRUM-930 — id de la cotización de esta fila (`AdminContInvoice.quote_id`), para `QuoteViewerModal`. */
  quote_id: number | null
  /** SCRUM-930 — reemplaza al booleano `guia_entrega`: el sistema no tiene folio propio para la
   *  guía, así que este es `"{order_number}-G"` del pedido que efectivamente tiene el documento. */
  guia_entrega_numero: string | null
  /** SCRUM-930 — `order_id` real del pedido con la guía (puede diferir del de la factura en una
   *  familia con más de una entrega), para abrir `GuiaEntregaModal`. */
  guia_entrega_order_id: number | null
  /** SCRUM-930 — id de la nota de crédito de esta fila (`descuento`/`devolucion`/`anulacion`),
   *  para `DetalleNotaCreditoModal`. `null` en filas que no son de nota de crédito. */
  nota_id: number | null
  /** SCRUM-955 §5 — recibo de cobro o abono asociado a esta fila/movimiento, para la columna
   *  "Cobro" (al lado derecho de "N° Factura"). `null` cuando no hay ningún cobro/abono asociado. */
  recibo: AccountStatementMovementRecibo | null
  /** SCRUM-930 — rango de antigüedad desde `created_at`, solo en filas `tipo === 'factura'`
   *  (`null` en el resto). Mismos 4 rangos que `facturacion.aging`, criterio de fecha distinto. */
  antiguedad_cartera: '0-30' | '31-60' | '61-90' | '91+' | null
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
  // SCRUM-857 (REQ-458) — campos sueltos (además de `cuenta_pago`, que sigue igual para
  // compatibilidad) para el bloque "Pago a / Cuenta número / Tipo de cuenta / Banco / Responsable"
  // en filas separadas. `numero_cuenta` es el número solo (completo si la cuenta lo tiene cargado,
  // enmascarado si no) — ver InvoiceService::paymentBlock() en el backend.
  banco: string | null
  tipo_cuenta: TipoCuenta | null
  numero_cuenta: string | null
  responsable: string | null
  /** REQ-459 — null cuando no aplica ninguna condición, o cuando hay filtro de proyecto (RN4). */
  nota_contexto: string | null
  /** REQ-459 RN3 — null cuando hay filtro de proyecto (RN4); si no, cantidad real de proyectos
   *  del cliente (para el aviso "este cliente tiene N proyectos", que el frontend arma con esto). */
  proyectos_count: number | null
  /** SCRUM-947 — solo la página pedida; el `saldo`/`saldo_a_favor`/`nota_contexto`/
   *  `proyectos_count` de arriba y el `saldo` CORRIDO de cada fila siguen calculados sobre el
   *  total de movimientos, no solo esta página. */
  movimientos: AccountStatementMovement[]
  meta: { total: number, per_page: number, current_page: number, last_page: number }
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
   *  cual una nota queda pendiente de aprobación de Gerencia. Viaja acá para que el formulario nunca lo
   *  hardcodee. */
  credit_note_approval_threshold: number
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
  /** SCRUM-1116 — lo que AÚN se puede acreditar: total − notas aplicadas o pendientes (todos los tipos). No es el saldo
   *  por cobrar (los cobros no lo reducen). Tope del monto y monto de la Anulación completa. Opcional solo por
   *  compatibilidad con un backend anterior: si falta se usa `monto`. */
  monto_acreditable?: number
  /** SCRUM-1116 — suma de las notas aplicadas o pendientes de esta factura. */
  notas_previas_total?: number
  itbms_percentage: number
  /** Batch 12 (REQ-489) — id real de la tasa ya aplicada a esta factura, para que "Corrección de
   *  datos" pueda excluirla de las opciones de "tratamiento correcto" (mismo criterio que
   *  `facturaActualRateId` en `RegistrarNotaCreditoModal`). Contrato agregado en este batch — no
   *  estaba en el shape original de Batch 11 (que solo necesitaba el %, no el id). Verificar que
   *  el endpoint `GET .../clientes/{masterClient}/facturas` lo devuelva. */
  itbms_rate_id: number | null
  /** SCRUM-932 — para el filtro cruzado Proyecto↔Cotización del modal de creación (ver
   *  ADR-SCRUM932), resuelto local sobre esta misma lista, sin request nueva. */
  sales_project_id: number | null
  proyecto: string | null
  quote_id: number | null
  cotizacion_folio: string | null
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
 *  `/admin-contab/itbms-rates`: ese es exclusivo de Gerencia (403 en el GET para cualquier otro rol),
 *  y Contabilidad/Asistente/Gerencia sí necesitan ver las 3 tasas acá para elegir el "tratamiento correcto"
 *  — contrato a confirmar con Backend Dev, no reusar el endpoint de Gerencia tal cual. */
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
  /** SCRUM-865 punto 2 — antes un texto fijo ("No disponible"); ahora refleja si Bodega tiene un
   *  documento firmado real para esta devolución. El modal pide la URL presignada bajo demanda
   *  (`useNotaCreditoDevolucionSignedDocumentUrl`), no viaja acá. */
  conformidad_disponible: boolean
  /** Batch 11 (REQ-483/484) — la factura de origen viene preseleccionada en este modo (RN3
   *  REQ-483), así que su monto/saldo/tasa de ITBMS viajan acá en vez de pedirse con otro fetch. */
  factura_monto: number
  factura_saldo_pendiente: number
  /** SCRUM-1116 — ver `NotaCreditoFacturaOrigen.monto_acreditable`. */
  monto_acreditable?: number
  notas_previas_total?: number
  factura_itbms_percentage: number
  /** Número de la factura de origen (F-0001); `referencia` es el de la devolución (DEV-…), no el de la factura. */
  factura_origen_numero?: string
  /** Total CON ITBMS que calcula el backend; `undefined` si el backend aún no lo envía (el modal lo calcula), `null` si
   *  alguna línea no tiene precio (no se sugiere un total parcial). */
  monto_sugerido?: number | null
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
  /** `monto > creditNoteApprovalThreshold()` — RN1 REQ-490. Determina el mensaje de confirmación
   *  ("se generó la factura nueva" vs "queda pendiente de aprobación de Gerencia, la original sigue
   *  activa"). */
  requiere_aprobacion: boolean
}

export type NotaCreditoHistorialEstado = 'aplicada' | 'pendiente_aprobacion' | 'pendiente_generar_nota' | 'rechazada'

export interface NotaCreditoHistorialFilters {
  search?: string
  // SCRUM-947 — corregido: el backend siempre esperó `master_client_id` (int, ver
  // AdminContCreditNoteController::index()), nunca el nombre — filtrar por cliente estaba roto
  // en silencio (una comparación `(int) 'Nombre del cliente' !== (int) $filters['cliente']`
  // siempre falsa) desde que existe este filtro. Encontrado al tocar este mismo bloque.
  cliente?: number
  tipo?: NotaCreditoTipo | ''
  estado?: NotaCreditoHistorialEstado | ''
  // SCRUM-947 — paginación estándar.
  page?: number
  per_page?: number | 'all'
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

/** SCRUM-947 — pagina server-side (antes no paginaba, igual que el resto de listados de AdminCont;
 *  ver `Pagination::meta()` en el backend). */
export interface NotaCreditoHistorialResult {
  data: NotaCreditoHistorialRow[]
  // SCRUM-947 — mismo shape que expone `Pagination::meta()` en el backend.
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

/** `GET /admin-contab/notas-credito/devoluciones/{customerReturnId}` — REQ-491, precarga del
 *  formulario al hacer clic en una fila de la cola. Shape real del backend (`CreditNoteService::
 *  devolucionDetail()`) — sigue sin traer el precio unitario de cada producto para devoluciones
 *  pre-backfill (`CustomerReturnLine.unit_price` puede ser null, ver SCRUM-786). `NotasCreditoPage`
 *  mapea esto + un fetch a `facturas()` (para monto/saldo/% ITBMS de la factura) a
 *  `NotaCreditoDevolucionPrecargada`.
 *  SCRUM-865 punto 2 — `project`/`contact_name`/`contact_phone`/`has_signed_document` se agregaron
 *  acá (antes el backend no los traía pese a que Bodega sí los captura, ver CreditNoteService). */
export interface NotaCreditoDevolucionDetail {
  customer_return_id: number
  return_number: string
  master_client_id: number
  cliente: string
  factura_origen_id: number
  factura_origen_numero: string
  project: string | null
  contact_name: string
  contact_phone: string
  has_signed_document: boolean
  /** Total CON ITBMS sugerido por el backend (Σ cantidad × precio neto × (1 + tasa de la factura)); null si alguna línea
   *  no tiene precio. Los `unit_price` de abajo son precios SIN ITBMS (NC-0001, 2026-10-06). */
  monto_sugerido?: number | null
  itbms_percentage?: number
  factura_monto?: number
  factura_saldo_pendiente?: number
  monto_acreditable?: number
  notas_previas_total?: number
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
  /** SCRUM-932 — Cotización/Guía de Entrega de la factura de origen, para enlazarlas desde el
   *  detalle (antes de "Factura de origen", AC explícito del ticket). Mismos nombres/semántica que
   *  `PaymentDetailFactura` (SCRUM-931) — resueltos vía `Order::linkedQuote()`, no vía
   *  `AdminContInvoice.quote_id` directo. `null` cuando la factura no tiene pedido/proyecto/guía. */
  quote_id: number | null
  cotizacion_folio: string | null
  guia_entrega_numero: string | null
  guia_entrega_order_id: number | null
  /** Presente solo en notas de "Corrección de datos" (`subtipo_anulacion = 'correccion'`). */
  factura_nueva_numero: string | null
  /** Batch 13 (REQ-497) — mismo criterio que `factura_origen_order_id`, para la factura nueva
   *  generada por una Corrección de datos ya aprobada. */
  factura_nueva_order_id: number | null
  /** SCRUM-1060 — PK de `AdminContInvoice` de la factura de reemplazo. El reemplazo comparte
   *  `order_id` con la original, así que este id es lo que identifica SU detalle. */
  factura_nueva_id: number | null
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
  /** SCRUM-943 — `null` en notas previas a esta feature. */
  fe_estado: FiscalElectronicStatus | null
  /** Motivo textual del rechazo del PAC — solo lo envía el backend a Gerencia/superadmin (`null` para el resto). */
  fe_detalle?: string | null
  /** SCRUM-987 — solo Gerencia/superadmin: habilita el visor de transmisiones al PAC (payload + respuesta). */
  puede_ver_fe_transmisiones?: boolean
  /** SCRUM-1007 — acción fiscal manual disponible ahora (solo Gerencia/superadmin): reintentar la certificación o actualizar el estado. */
  accion_fe?: FeAccionFiscal | null
  /** SCRUM-1019 — el backend ofrece "Reconciliar con MSL" para este documento. */
  puede_reconciliar_fe?: boolean
  cufe: string | null
  qr_content: string | null
  pac_provider_usado: PacProvider | null
}

/** `PUT /admin-contab/notas-credito/{id}/decision` — REQ-494, exclusivo Gerencia (`primary_approver_only`).
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
   *  Gerencia. Gatea los botones editar/eliminar/agregar tramo del modal "Tabla de comisión
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
/** SCRUM-866 — separado de `ArchitectCommissionEstado` (estado de la comisión del arquitecto). */
export type ArchitectCommissionEstadoCobroCliente = 'pendiente' | 'parcial' | 'cobrado'

export interface ArchitectCommissionProject {
  pipeline_card_id: number
  numero_pedido: string | null
  /** SCRUM-866 — nombre del proyecto (`sp.name`, sales_project). */
  proyecto_nombre: string | null
  cliente: string | null
  fecha_pedido: string | null // 'YYYY-MM-DD'
  monto_proyecto: number
  total_facturado: number | null
  total_cobrado: number
  /** Batch 17 (REQ-516) — % vigente de este proyecto puntual: el aprobado por Gerencia si existe,
   *  si no el default global (`AdminContFiscalSettings.comision_externa_default_percent`). */
  porcentaje: number
  comision: number
  /** `null` cuando el arquitecto no tiene régimen fiscal configurado (RN6 REQ-511) — nunca se
   *  asume "Exento" por defecto, la UI debe mostrar "—", no $0. */
  impuesto: number | null
  total: number | null
  estado: ArchitectCommissionEstado
  /** SCRUM-866 — "el cliente pagó la factura", separado de `estado` ("la comisión del
   *  arquitecto está pagada") — antes se mostraban conflate en una sola columna. */
  estado_cobro_cliente: ArchitectCommissionEstadoCobroCliente
  cuenta_cobro: { nombre_archivo: string; uploaded_at: string } | null
  /** Batch 17 (REQ-514) — solo relevante para régimen "Retención del 50%"; el frontend decide si
   *  mostrar la zona de carga según `regimen_fiscal` de la fila padre. */
  comprobante_retencion: { nombre_archivo: string; uploaded_at: string } | null
  fecha_pago: string | null // 'YYYY-MM-DD'
  /** Batch 17 (REQ-516) — % propuesto por Contabilidad/Asistente/Aprobador/Gerencia, pendiente de la decisión de
   *  Gerencia. `null` si no hay ninguna propuesta activa. */
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
   *  el frontend nunca decide por su cuenta quién es Gerencia. Gatea Aprobar/Rechazar en el modal de
   *  detalle — el endpoint real (`percent/decide`) está gateado por `primary_approver_only` de todos modos. */
  puede_decidir_porcentaje: boolean
  // SCRUM-947 — paginación estándar A NIVEL DE ARQUITECTO (nunca parte los proyectos de un mismo
  // arquitecto entre 2 páginas); las tarjetas globales de arriba y `meses_disponibles` no se
  // filtran por página.
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

export interface CommissionExternalFilters {
  search?: string
  mes?: string
  architect_id?: number
  estado?: ArchitectCommissionEstado
  page?: number
  per_page?: number | 'all'
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
// comisión por proyecto (propuesta + aprobación de Gerencia), cuenta de pago editable, recordatorio
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

export type DailyCashCountMovementType = 'payment' | 'credit_note' | 'commission' | 'reversal'

export interface DailyCashCountCobro {
  movement_type: 'payment'
  movement_id: number
  concepto: string
  /** SCRUM-1175 — nombre del cliente de la línea. */
  cliente?: string | null
  metodo_pago: PaymentMethod
  monto: number
  observacion: string | null
}

export interface DailyCashCountNotaCredito {
  movement_type: 'credit_note'
  movement_id: number
  concepto: string
  cliente?: string | null
  monto: number
  observacion: string | null
}

/** SCRUM-879 — comisión (externa o interna) pagada el día del arqueo, reflejada como salida real
 *  de dinero (puede no tener `bank_account_id` propio, REQ-534 "Sin cuenta asignada" — eso no
 *  afecta que cuente acá, el back ya la resuelve sin esa columna). */
export interface DailyCashCountComision {
  movement_type: 'commission'
  movement_id: number
  concepto: string
  monto: number
  observacion: string | null
}

/** SCRUM-1168 F4/F5 — salida de caja del día por anular un cobro o devolver dinero al cliente. */
export interface DailyCashCountReverso {
  movement_type: 'reversal'
  movement_id: number
  concepto: string
  cliente?: string | null
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
  comisiones: DailyCashCountComision[]
  /** SCRUM-1168 — anulaciones de cobros y devoluciones al cliente del día. Opcional: un arqueo cerrado antes de este cambio no las trae. */
  reversos?: DailyCashCountReverso[]
  retenciones: DailyCashCountRetencion[]
  total_cobrado: number
  total_notas_credito: number
  total_comisiones: number
  total_reversos?: number
  total_neto: number
  /** SCRUM-934 — indicadores comerciales del día, INFORMATIVOS (no entran en `total_neto`). En
   *  vivo mientras el arqueo está abierto; congelados en el snapshot al cerrar. Opcionales por
   *  defensa ante respuestas de un backend anterior al ticket. */
  total_facturado_dia?: number
  total_pasado_a_pedido_dia?: number
  observacion_general: string | null
  cerrado_por: string | null
  cerrado_at: string | null
  aprobado_por: string | null
  aprobado_at: string | null
  /** Calculado server-side (`current_user_id === primary_approver_user_id`), mismo criterio que
   *  `puede_decidir_incobrable`/`puede_editar_tramos` en el resto del módulo — el frontend nunca
   *  decide por su cuenta quién es Gerencia. NO estaba en el contrato original del ADR (§ Contrato
   *  JSON exacto); se agrega acá por consistencia con el patrón ya establecido en todo el resto de
   *  AdminCont — verificar con Backend Dev que el endpoint lo agregue. Ausente/`false` = no
   *  mostrar "Aprobar". */
  puede_aprobar?: boolean
  /** Fase 13 (2.10) — server-side: arqueo cerrado y el usuario es el aprobador (o su suplente). */
  puede_reabrir?: boolean
  /** Última reapertura (quién, cuándo y por qué); `null` si nunca se reabrió. */
  reabierto_por?: string | null
  reabierto_at?: string | null
  reabierto_motivo?: string | null
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
  // SCRUM-947 — antes solo traía current_page/last_page (perPage fijo en 20 hardcodeado en el
  // backend, sin selector); ahora es el mismo shape estándar de `Pagination::meta()`.
  meta: { total: number; per_page: number; current_page: number; last_page: number }
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
// `puede_aprobar` de PettyCashReportDetail) — el frontend nunca decide por su cuenta quién es Gerencia
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
// así que necesita el nombre del solicitante embebido en la propia línea. SCRUM-868 punto 2 — el
// backend (`expensePayload()`) por fin lo incluye; antes el tipo lo declaraba pero la respuesta
// real venía sin el campo y la columna "Solicitante" salía vacía.
export interface PettyCashRejectedLine extends PettyCashExpenseLine {
  solicitante_id: number
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
  // Total real de TODO lo pendiente, no solo la página — mismo criterio que `indicadores` en
  // Saldo a Favor, no cambia con la paginación.
  total_general: number
  // SCRUM-947 — paginación a nivel de GRUPO (por solicitante), nunca parte las líneas de un
  // mismo solicitante entre 2 páginas.
  meta: { total: number; per_page: number; current_page: number; last_page: number }
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

type PageMeta = { total: number; per_page: number; current_page: number; last_page: number }

/** SCRUM-947 — mismo shape que expone `Pagination::meta()` en el backend. */
export interface PettyCashReportListResponse {
  data: PettyCashReportListItem[]
  meta: PageMeta
}

/** SCRUM-947 — mismo shape que expone `Pagination::meta()` en el backend. */
export interface PettyCashRejectedResult {
  lineas: PettyCashRejectedLine[]
  meta: PageMeta
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
   *  `DailyCashCount.puede_aprobar` — el frontend nunca decide por su cuenta quién es Gerencia.
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
// encabezado (RN1 REQ-566); solo Ventas y Arqueo de Caja lo consumen — Comisión Contabilidad y Cartera
// nunca reciben período (RN4 REQ-567/RN3 REQ-568).
export type ReportsPeriodo = 'hoy' | '3m' | '6m' | 'anio'

export interface ReportsCarteraCommissionTier {
  monto_minimo: number
  monto_maximo: number | null
  porcentaje: number
  orden: number
  es_actual: boolean
}

export interface ReportsCommissionTiers {
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
// Comisiones SÍ depende del selector de período (a diferencia de Contabilidad/Cartera del Batch 22);
// Notas de Crédito nunca depende de él (mismo criterio que Contabilidad/Cartera).
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
  /** SCRUM-1175 — responsables del pedido de la factura (la nota de crédito hereda el de su factura de origen); null si no tiene. */
  vendedor: string | null
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

// SCRUM-1168 F3 — Compensaciones: aplicar el dinero disponible de un cliente (cobros a cuenta, abonos históricos, saldo de notas de crédito) a
// sus facturas pendientes. Vista aparte, por cliente.

export type CompensacionSigno = 'positivo' | 'negativo' | 'cero'
export type CompensacionSourceType = 'cobro' | 'abono' | 'nota_credito'

export interface CompensacionClienteRow {
  master_client_id: number
  cliente: string
  /** Dinero disponible sin aplicar (cobros a cuenta + abonos históricos + saldo de notas). */
  saldo_a_favor: number
  /** Facturas pendientes de cobro (lo que debe). */
  pendiente: number
  /** a favor − pendiente: positivo = tiene más a favor que lo que debe; negativo = debe más. */
  neto: number
  signo: CompensacionSigno
  facturas_pendientes: number
  ultimo_movimiento: string | null
}

export interface CompensacionesResult {
  indicadores: { saldo_a_favor_total: number; clientes_con_saldo: number }
  rows: CompensacionClienteRow[]
  total: number
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}

export interface CompensacionesFilters {
  search?: string
  signo?: 'positivo' | 'negativo'
  page?: number
  per_page?: number | 'all'
}

export interface CompensacionFuente {
  source_type: CompensacionSourceType
  source_id: number
  etiqueta: string
  referencia: string | null
  fecha: string
  disponible: number
  /** Factura a la que venía atado un abono histórico: ya no se aplica sola, solo se sugiere primero. */
  factura_sugerida_id: number | null
}

export interface CompensacionFactura {
  id: number
  numero: string
  fecha: string
  monto: number
  saldo_aplicado: number
  pendiente: number
  sales_project_id: number | null
  proyecto: string | null
  quote_id: number | null
  cotizacion_folio: string | null
}

export interface CompensacionLinea {
  source_type: CompensacionSourceType
  source_id: number
  invoice_id: number
  monto: number
}

export interface CompensacionMovimiento {
  /** SCRUM-1168 F4 — se puede desaplicar desde la traza (la aplicación sigue vigente y el libro la conoce por componente). */
  reversible: boolean
  reversado: boolean
  id: number
  tipo: string
  fecha: string
  monto: number
  delta_disponible: number
  origen: string
  motivo: string | null
  cobro: string | null
  abono: string | null
  factura: string | null
  compensacion: string | null
  usuario: string | null
}

export interface CompensacionPrevia {
  id: number
  folio: string
  estado: 'confirmado' | 'reversado'
  monto_total: number
  confirmed_at: string
}

export interface CompensacionClienteDetalle {
  master_client_id: number
  cliente: string
  saldo_a_favor: number
  pendiente: number
  fuentes: CompensacionFuente[]
  facturas: CompensacionFactura[]
  sugerencia: CompensacionLinea[]
  movimientos: CompensacionMovimiento[]
  compensaciones: CompensacionPrevia[]
}

export interface CompensacionVistaPrevia {
  master_client_id: number
  total_aplicado: number
  saldo_a_favor_antes: number
  saldo_a_favor_despues: number
  facturas: { id: number; numero: string; pendiente_antes: number; aplicado: number; pendiente_despues: number }[]
  fuentes: { source_type: CompensacionSourceType; source_id: number; etiqueta: string; disponible_antes: number; usado: number; disponible_despues: number }[]
}

export interface Compensacion {
  id: number
  folio: string
  estado: 'confirmado' | 'reversado'
  master_client_id: number
  cliente: string
  monto_total: number
  confirmed_at: string
  registrado_por: string | null
  lineas: { source_type: CompensacionSourceType; source_id: number; fuente: string; invoice_id: number; factura: string; monto: number }[]
}
