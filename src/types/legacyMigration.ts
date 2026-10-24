// SCRUM-816 — dashboard de migración ICG (schema `legacy`, épica SCRUM-749).

// SCRUM-1114 — `held_for_review`: corrida retenida por el circuit breaker (no aplicó nada, espera revisión).
export type SyncRunStatus = 'success' | 'partial' | 'failed' | 'held_for_review'

export interface SyncRunRow {
  id: number
  entidad: string
  extraidos: number
  staged: number
  mapeados: number
  cargados: number
  excluidos: number
  errores: number
  duracion_ms: number
  status: SyncRunStatus
  started_at: string
  finished_at: string
  // SCRUM-1114 — informe de divergencia (solo la entidad `stock`; null para el resto).
  resumen?: StockSyncResumen | null
}

export interface SyncRunsResponse {
  data: SyncRunRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}

export interface CountsRow {
  entidad: string
  staging: number
  resuelto: number | null
}

export interface CountsResponse {
  data: CountsRow[]
}

export interface ExcludedRow {
  id: number
  entidad: string | null
  referencia: string
  status: string
  motivo: string | null
  created_at: string | null
}

export interface ExcludedResponse {
  data: ExcludedRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}

// SCRUM-827 — legacy.pagos (TESORERIA), catálogo standalone sin cliente. Códigos ICG crudos
// (icg_origen/icg_tipodocumento/estado) sin traducir — el backend nunca los traduce, ver
// docblock de LegacyPagosController.
export interface PagoRow {
  id: number
  icg_origen: string
  icg_tipodocumento: string
  icg_serie: string
  icg_numero: number
  icg_n: string
  icg_posicion: number
  fecha_documento: string | null
  fecha_vencimiento: string | null
  importe: string
  icg_codformapago: number | null
  estado: string | null
  fecha_saldado: string | null
}

export interface PagosResponse {
  data: PagoRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}

// "Vista ICG" (SCRUM-749, 2026-09-03) — pantalla propia bajo Migración, con una pestaña por
// entidad, sin partir de un Subcliente puntual (a diferencia de la pestaña "Historial ICG" del
// detalle de Cliente, que sigue existiendo tal cual). Cotizaciones/Pedidos/Albaranes/Facturas
// reusan `LegacyDocumentResult`/`LegacyDocumentHeader`/`LegacyDocumentItem` de
// `types/ventasDiseno.ts` para el detalle (mismo `LegacyDocumentPresenter` en el backend) — acá
// solo la fila resumen de la lista, que sí es distinta (incluye el nombre del cliente, ausente en
// la lista scoped por Subcliente).

// SCRUM-840 (2026-09-04) agrega 'albaranes_compra' — mismo shape de documento (cabecera+líneas),
// vinculado por Proveedor en vez de Cliente (ver `proveedor` en VistaIcgDocumentoRow y
// `LegacyDocumentProveedor` en types/ventasDiseno.ts).
export type VistaIcgDocumentoEntidad = 'cotizaciones' | 'pedidos' | 'albaranes' | 'facturas' | 'albaranes_compra'
export type VistaIcgEntidad = VistaIcgDocumentoEntidad | 'clientes' | 'proveedores' | 'productos'

export interface VistaIcgDocumentoRow {
  id: number
  numero: string
  // Exactamente uno de los dos viene poblado según la entidad: `cliente` para Cotizaciones/
  // Pedidos/Albaranes/Facturas, `proveedor` para Albaranes de Compra.
  cliente?: string | null
  proveedor?: string | null
  fecha: string | null
  total: string | null
  estado: string | null
}

export interface VistaIcgDocumentoListResult {
  data: VistaIcgDocumentoRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}

export interface VistaIcgClienteRow {
  id: number
  nombre_comercial: string | null
  razon_social: string
  cif: string | null
  match_status: string
  bloqueado: boolean
}

export interface VistaIcgClienteListResult {
  data: VistaIcgClienteRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}

export interface VistaIcgClienteContacto {
  cargo: string | null
  nombre: string
  telefono: string | null
  mobil: string | null
  email: string | null
}

export interface VistaIcgClienteDetail {
  entidad: 'clientes'
  header: {
    icg_codcliente: number
    nombre_comercial: string | null
    razon_social: string
    cif: string | null
    direccion: string | null
    poblacion: string | null
    provincia: string | null
    pais: string | null
    telefono1: string | null
    telefono2: string | null
    mobil: string | null
    email: string | null
    icg_codvendedor: number | null
    match_status: string
    sub_client_id: number | null
    bloqueado: boolean
    fecha_modificado_icg: string | null
  }
  contactos: VistaIcgClienteContacto[]
}

export interface VistaIcgProveedorRow {
  id: number
  nombre: string
  nombre_comercial: string | null
  cif: string | null
  match_status: string
}

export interface VistaIcgProveedorListResult {
  data: VistaIcgProveedorRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}

export interface VistaIcgProveedorDetail {
  entidad: 'proveedores'
  header: {
    icg_codproveedor: number
    nombre: string
    nombre_comercial: string | null
    cif: string | null
    direccion: string | null
    telefono1: string | null
    email: string | null
    match_status: string
    provider_id: number | null
  }
}

export interface VistaIcgProductoRow {
  id: number
  icg_codarticulo: number
  descripcion: string
  marca_nombre: string | null
  familia_nombre: string | null
  catalog_product_id: number | null
}

export interface VistaIcgProductoListResult {
  data: VistaIcgProductoRow[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}

export interface VistaIcgProductoPrecio {
  idtarifav: number
  price_type: string | null
  precio_neto: number
  precio_bruto: number | null
  descuento: number | null
}

export interface VistaIcgProductoCosto {
  codproveedor: number
  costo_neto: number
}

export interface VistaIcgProductoDetail {
  entidad: 'productos'
  header: {
    icg_codarticulo: number
    descripcion: string
    marca_nombre: string | null
    familia_nombre: string | null
    ref_proveedor: string | null
    descatalogado: boolean
    catalog_product_id: number | null
  }
  precios: VistaIcgProductoPrecio[]
  costos: VistaIcgProductoCosto[]
}

// SCRUM-1114 — sincronización de stock de ICG (AL4) por delta. `resumen` es el informe de divergencia de
// una corrida; los campos opcionales solo existen según cómo terminó (aplicada, retenida o fallida).
export interface StockSyncResumen {
  elegibles?: number
  omitidos_inactivos?: number
  sin_cambio?: number
  con_delta?: number
  desde_cero?: number
  base_inicializada?: number
  retenidos?: number
  sin_fila_al4?: number
  unidades_positivas?: number
  unidades_negativas?: number
  unidades_abs_total?: number
  max_abs_producto?: number
  circuit_breaker?: string
  circuit_breaker_forzado?: string
  error?: string
  no_cuadran?: number
  aplicado?: { aplicados: number; negativos: number; errores: number; omitidos_cambiados: number; bases_inicializadas: number }
  divergencia_atlanticerp?: StockSyncDivergencia
}

// Cuánto se aleja AtlanticERP de ICG en Bodega Central (`Central - línea base`), contrastado con el kardex propio de AtlanticERP:
// la diferencia queda EXPLICADA si es igual a la suma de sus movimientos. AtlanticERP manda: solo se informa.
export interface StockSyncDivergencia {
  total: number
  atlanticerp_con_mas: number
  atlanticerp_con_menos: number
  unidades_mas: number
  unidades_menos: number
  sin_movimientos: number
  explicados_por_kardex: number
  con_residuo: number
  unidades_sin_explicar: number
  mayores: Array<{
    icg_codarticulo: number
    catalog_product_id: number
    icg: number
    atlanticerp: number
    diferencia: number
    kardex_atlanticerp: number
    sin_explicar: number
    con_movimientos_atlanticerp: boolean
  }>
}

export interface StockSyncSettings {
  activo: boolean
  baseline_inicializada_at: string | null
  max_productos_con_delta_pct: number
  max_unidades_abs_por_producto: number
  max_unidades_abs_total: number
  min_filas_icg_pct: number
  horas_aviso_apagado: number
  correos_alerta: string[]
}

export type StockSyncSettingsInput = Partial<Pick<StockSyncSettings,
  'activo' | 'max_productos_con_delta_pct' | 'max_unidades_abs_por_producto' | 'max_unidades_abs_total'
  | 'min_filas_icg_pct' | 'horas_aviso_apagado' | 'correos_alerta'>>

export interface StockSyncRun {
  id: number
  origen: 'manual' | 'scheduler'
  status: SyncRunStatus
  extraidos: number
  con_delta: number
  aplicados: number
  errores: number
  duracion_ms: number
  started_at: string
  resumen: StockSyncResumen | null
}

export interface StockSyncStatusResponse {
  settings: StockSyncSettings
  ultimas_corridas: StockSyncRun[]
}
