// SCRUM-925 — Bitácoras de LUMO embebidas en AtlanticERP vía Identity Bridge.
export interface LumoBitacorasCodeResponse {
  code:       string
  expires_at: string
}

export interface LumoExchangeResponse {
  access: string
}

export interface LumoBitacoraRow {
  id:              number
  vendedor_id:     number
  vendedor_nombre: string
  fecha:           string
  cliente:         string
  proyecto:        string
  motivo:          string
  tipo_atencion:   string
  observaciones:   string
  created_at:      string
}

export interface LumoBitacorasResponse {
  count:    number
  next:     string | null
  previous: string | null
  results:  LumoBitacoraRow[]
}

// SCRUM-946 — opción del filtro "Vendedor" (GET /api/admin/bitacoras/vendedores/ de LUMO).
export interface LumoVendedorOption {
  id:     number
  nombre: string
}

export type LumoBitacorasSortField = 'fecha' | 'cliente' | 'proyecto' | 'tipo_atencion' | 'created_at' | 'vendedor__first_name'
