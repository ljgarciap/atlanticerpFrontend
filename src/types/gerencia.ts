// SCRUM-156 a SCRUM-172 — Módulo Gerencia

export interface GerenciaFilters {
  desde?:       string
  hasta?:       string
  vendedor_id?: number
  cliente_id?:  number
}

export interface VariacionMargen {
  facturado:      number
  cotizado:       number
  variacion_pct:  number | null
  margen_real_pct:  number | null  // null hasta que exista campo costo en AdminContInvoice
  margen_cotiz_pct: number | null  // null hasta que exista campo margin en PipelineCard
}

export interface CxCAlDia {
  total:         number
  vencidas:      number
  por_vencer_7d: number
}

export interface GerenciaKpis {
  variacion_margen:  VariacionMargen
  cxc_al_dia:        CxCAlDia
  proyectos_activos: number
}

export interface ChartMensualItem {
  mes:   string // 'YYYY-MM'
  monto: number
}

export interface FacturacionKpis {
  facturado_anio:   number
  facturado_mes:    number
  margen_anio_pct:  number | null  // null hasta que exista campo costo en invoices
  margen_mes_pct:   number | null  // null hasta que exista campo costo en invoices
  facturas_count:   number
}

export interface GerenciaFacturacion {
  kpis:          FacturacionKpis
  chart_mensual: ChartMensualItem[]
}

export interface ProyectosKpis {
  cerrados_anio:       number
  cerrados_anio_count: number
  cerrados_mes:        number
  cerrados_mes_count:  number
  margen_anio_pct:     number | null  // null hasta que exista campo margin en PipelineCard
  margen_mes_pct:      number | null  // null hasta que exista campo margin en PipelineCard
}

export interface GerenciaProyectos {
  kpis:          ProyectosKpis
  chart_mensual: ChartMensualItem[]
}

export interface SaludVentasDiseno {
  en_final_stage:       number
  estancados:           number
  monto_cotizado_mes:   number
  monto_aprobado_mes:   number
  pipeline_total:       number
}

export interface SaludAdminContab {
  // SCRUM-167 — CxP total eliminado; RN1: CxC Total → cobros?estado=esperando_confirmacion
  cxc_total:      number
  cuentas_al_dia: number
}

export interface SaludCompras {
  ordenes_criticas:   number
  en_transito:        number
  proximas_a_llegar:  number
  cantidad_pedidos:   number
  // SCRUM-168 RN2 — "Bajo stock sin ordenar" (Inventario↔Compras). Opcional: pendiente
  // de confirmar el nombre exacto del campo con Backend Dev, ver
  // docs/architecture/gerencia-epic-analisis-20260826.md.
  bajo_stock_sin_ordenar?: number
}

export interface SaludBodega {
  // SCRUM-169 — RN1: urgentes→chip=urgentes, RN2: atrasados→chip=atrasados, RN3: a_tiempo sin nav, RN4: hoy sin filtros
  despachos_urgentes:  number
  despachos_atrasados: number
  despachado_a_tiempo: number
  completados_hoy:     number
}

export interface SaludServicios {
  // SCRUM-170 — Resuelto en 1ra visita eliminado; RN1: sin_responder→estado=reportado, RN3: completados_mes→estado=resuelto
  sin_responder:   number
  completados_mes: number
}

export interface SaludModulos {
  ventas_diseno: SaludVentasDiseno
  admin_contab:  SaludAdminContab
  compras:       SaludCompras
  bodega:        SaludBodega
  servicios:     SaludServicios
}

export interface AprobacionItem {
  id:          number
  type:        'purchase_order' | 'relocation' | 'adjustment' | 'general_count' | 'zona_libre'
  module:      'compras' | 'bodega'
  reference:   string
  description: string
  amount:      number | null
  created_at:  string | null
  can_approve: boolean
  action_url:  string
}

// SCRUM-163 (REQ-101) — REGLA_APROBACION: tipo de solicitud → rol(es)/persona(s) autorizada(s).
// Infraestructura configurable; el catálogo de `tipo` y los `aprobadores` reales quedan pendientes
// de que el cliente defina la matriz completa (ver Excel 6__Requerimientos_Gerencia.xlsx, hoja
// "Modelo de Datos", entidad REGLA_APROBACION).
export interface ReglaAprobacionAprobador {
  id:         number
  first_name: string
  last_name:  string
}

export interface ReglaAprobacion {
  id:            number
  tipo:          string
  activo:        boolean
  observaciones: string | null
  aprobadores:   ReglaAprobacionAprobador[]
  created_at:    string
  updated_at:    string
}

export interface SaveReglaAprobacionPayload {
  tipo:            string
  activo:          boolean
  observaciones?:  string | null
  aprobador_ids:   number[]
}

export interface AgendaBodegaItem {
  id:           number
  order_number: string
  stage:        string
  customer:     string
  project:      string | null
  address:      string | null
}

export interface AgendaServiciosItem {
  id:        number
  numero:    string
  tipo:      string
  estado:    string
  hora:      string | null
  hora_fin:  string | null
  cliente:   string
  direccion: string | null
  tecnico:   string | null
}

export interface GerenciaAgendas {
  bodega:    AgendaBodegaItem[]
  servicios: AgendaServiciosItem[]
}

export interface GerenciaHomeResponse {
  kpis:           GerenciaKpis
  facturacion:    GerenciaFacturacion
  proyectos:      GerenciaProyectos
  aprobaciones:   AprobacionItem[]
  is_approver:    boolean
  pending_total:  number
  salud_modulos:  SaludModulos
  agendas:        GerenciaAgendas
}
